#include "AudioEngine.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace artss::audio {
namespace {
constexpr std::uint32_t kFadeFrames = 64;
constexpr float kHeadroom = 0.354813389F;  // -9 dB before master gain.
static_assert(std::atomic<float>::is_always_lock_free);
}

AudioEngine::AudioEngine() noexcept {
  for (auto& progress : progress_) progress.store(-1, std::memory_order_relaxed);
}

void AudioEngine::prepare(double sampleRate, SampleBank bank) {
  if (running()) throw std::logic_error("Stop RemoteIO before preparing samples");
  if (!std::isfinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    throw std::invalid_argument("Unsupported sample rate");
  }
  for (const auto& sample : bank) {
    if (sample.stereo.empty() || sample.stereo.size() % 2 != 0 ||
        sample.stereo.size() > static_cast<std::size_t>(sampleRate * 30) * 2) {
      throw std::invalid_argument("Samples must be nonempty stereo PCM, at most 30 seconds");
    }
    for (const float value : sample.stereo) {
      if (!std::isfinite(value) || std::abs(value) > 1.0F) {
        throw std::invalid_argument("PCM samples must be finite and normalized");
      }
    }
  }
  bank_ = std::move(bank);
  sampleRate_ = sampleRate;
  for (auto& deck : decks_) {
    deck.track.stereo.clear();
    deck.waveform.fill(0);
    deck.cursor = 0;
    deck.position.store(0, std::memory_order_relaxed);
    deck.rate.store(1, std::memory_order_relaxed);
    deck.playing.store(false, std::memory_order_relaxed);
    deck.envelope = 0;
  }
  voices_ = {};
  gainSlew_ = static_cast<float>(1.0 / (sampleRate * 0.005));
  limiterRelease_ = static_cast<float>(1.0 / (sampleRate * 0.05));
  for (std::size_t pad = 0; pad < kPadCount; ++pad) {
    const auto frames = bank_[pad].frames();
    for (std::size_t bin = 0; bin < kWaveformBins; ++bin) {
      const auto start = bin * frames / kWaveformBins;
      const auto end = std::min<std::size_t>(frames, std::max(start + 1, (bin + 1) * frames / kWaveformBins));
      float peak = 0;
      for (auto i = start; i < end; ++i) {
        peak = std::max({peak, std::abs(bank_[pad].stereo[i * 2]),
                         std::abs(bank_[pad].stereo[i * 2 + 1])});
      }
      waveforms_[pad][bin] = peak;
    }
    progress_[pad].store(-1, std::memory_order_relaxed);
  }
  prepared_ = true;
}

void AudioEngine::activate() noexcept {
  if (!prepared_) return;
  // Restore the accepted control intent before the first audible block.
  master_ = requestedMaster_.load(std::memory_order_acquire);
  epoch_.fetch_add(1, std::memory_order_acq_rel);
  active_.store(true, std::memory_order_release);
}

void AudioEngine::rejectCommands() noexcept {
  active_.store(false, std::memory_order_release);
}

void AudioEngine::deactivateAfterStop() noexcept {
  rejectCommands();
  epoch_.fetch_add(1, std::memory_order_acq_rel);
  // RemoteIO is stopped: lifecycle temporarily owns the single consumer.
  // Do not reset queue indices; a preempted producer may still publish an old
  // reservation. Epoch checks continue to reject those late publications.
  Command stale;
  for (int i = 0; i < 512 && commands_.tryPop(stale); ++i) {}
  voices_ = {};
  limiter_ = 1;
  peak_.store(0, std::memory_order_relaxed);
  for (auto& progress : progress_) progress.store(-1, std::memory_order_relaxed);
  for (auto& deck : decks_) {
    deck.playing.store(false, std::memory_order_release);
    deck.envelope = 0;
  }
}

void AudioEngine::loadDeck(std::uint32_t index, Sample track) {
  if (running()) throw std::logic_error("Stop RemoteIO before loading a track");
  if (index >= kDeckCount || track.stereo.size() < 2 || track.stereo.size() % 2 ||
      track.stereo.size() > static_cast<std::size_t>(sampleRate_ * 60 * 30) * 2) {
    throw std::invalid_argument("Invalid deck track (maximum 30 minutes)");
  }
  for (const float value : track.stereo) {
    if (!std::isfinite(value) || std::abs(value) > 1.0F) throw std::invalid_argument("Invalid track PCM");
  }
  auto& deck = decks_[index];
  deck.track = std::move(track);
  deck.cursor = 0;
  deck.position.store(0, std::memory_order_release);
  deck.rate.store(1, std::memory_order_release);
  deck.seek.store(-1, std::memory_order_release);
  deck.loopStart.store(0, std::memory_order_release);
  deck.loopEnd.store(1, std::memory_order_release);
  deck.playing.store(false, std::memory_order_release);
  deck.envelope = 0;
  for (std::size_t bin = 0; bin < kWaveformBins; ++bin) {
    const auto frames = deck.track.frames();
    const auto first = bin * frames / kWaveformBins;
    const auto last = std::min<std::size_t>(frames, std::max(first + 1, (bin + 1) * frames / kWaveformBins));
    float peak = 0;
    for (auto i = first; i < last; ++i)
      peak = std::max({peak, std::abs(deck.track.stereo[2 * i]), std::abs(deck.track.stereo[2 * i + 1])});
    deck.waveform[bin] = peak;
  }
}

bool AudioEngine::deckPlay(std::uint32_t index, bool play) noexcept {
  if (index >= kDeckCount || !running() || decks_[index].track.stereo.empty()) return false;
  if (play && decks_[index].position.load(std::memory_order_acquire) >= 0.999F)
    decks_[index].seek.store(0, std::memory_order_release);
  decks_[index].playing.store(play, std::memory_order_release);
  return true;
}
bool AudioEngine::deckSeek(std::uint32_t index, float position) noexcept {
  if (index >= kDeckCount || !running() || !std::isfinite(position) || position < 0 || position > 1 || decks_[index].track.stereo.empty()) return false;
  decks_[index].seek.store(position, std::memory_order_release);
  return true;
}
bool AudioEngine::deckRate(std::uint32_t index, float rate) noexcept {
  if (index >= kDeckCount || !running() || !std::isfinite(rate) || rate < 0.5F || rate > 2) return false;
  decks_[index].rate.store(rate, std::memory_order_release);
  return true;
}
bool AudioEngine::deckLoop(std::uint32_t index, float start, float end) noexcept {
  if (index >= kDeckCount || !running() || !std::isfinite(start) || !std::isfinite(end) || start < 0 || end > 1 || start >= end) return false;
  decks_[index].loopStart.store(start, std::memory_order_release);
  decks_[index].loopEnd.store(end, std::memory_order_release);
  return true;
}
bool AudioEngine::crossfade(float position) noexcept {
  if (!running() || !std::isfinite(position) || position < 0 || position > 1) return false;
  requestedCrossfade_.store(position, std::memory_order_release);
  return true;
}
float AudioEngine::deckPosition(std::uint32_t index) const noexcept {
  return index < kDeckCount ? decks_[index].position.load(std::memory_order_acquire) : 0;
}
double AudioEngine::deckDuration(std::uint32_t index, double sampleRate) const noexcept {
  return index < kDeckCount && sampleRate > 0 ? decks_[index].track.frames() / sampleRate : 0;
}
bool AudioEngine::deckPlaying(std::uint32_t index) const noexcept {
  return index < kDeckCount && decks_[index].playing.load(std::memory_order_acquire);
}
const std::array<float, kWaveformBins>& AudioEngine::deckWaveform(std::uint32_t index) const noexcept {
  static const std::array<float, kWaveformBins> empty{};
  return index < kDeckCount ? decks_[index].waveform : empty;
}

bool AudioEngine::push(Command command) noexcept {
  // Capture epoch before the active check: commands racing a restart stay stale.
  command.epoch = epoch_.load(std::memory_order_acquire);
  command.noteEpoch = noteEpoch_.load(std::memory_order_acquire);
  if (!running()) return false;
  if (commands_.tryPush(command)) return true;
  dropped_.fetch_add(1, std::memory_order_relaxed);
  return false;
}

bool AudioEngine::trigger(std::uint32_t pad, float velocity) noexcept {
  if (pad >= kPadCount || !std::isfinite(velocity) || velocity <= 0 || velocity > 1) return false;
  return push({pad, velocity, 0, 0});
}

bool AudioEngine::setMaster(float gain) noexcept {
  if (!std::isfinite(gain) || gain < 0 || gain > 1 || !running()) return false;
  // Latest-value mailbox: continuous controls cannot fill the trigger queue or
  // disappear when a stopped session discards its stale hit commands.
  requestedMaster_.store(gain, std::memory_order_release);
  return true;
}

bool AudioEngine::allNotesOff() noexcept {
  if (!running()) return false;
  // Panic bypasses the queue and invalidates every trigger queued before it.
  noteEpoch_.fetch_add(1, std::memory_order_release);
  return true;
}

float AudioEngine::progress(std::uint32_t pad) const noexcept {
  return pad < kPadCount ? progress_[pad].load(std::memory_order_relaxed) : -1;
}

void AudioEngine::startVoice(std::uint32_t pad, float velocity) noexcept {
  auto* selected = &voices_[0];
  for (auto& voice : voices_) {
    if (!voice.sample && voice.tailRemaining == 0) { selected = &voice; break; }
    if (voice.serial < selected->serial) selected = &voice;
  }
  const auto lastL = selected->previousL;
  const auto lastR = selected->previousR;
  *selected = {&bank_[pad], pad, 0, ++voiceSerial_, velocity,
               0, 0, lastL, lastR, kFadeFrames, 0};
  triggered_.fetch_add(1, std::memory_order_relaxed);
}

void AudioEngine::apply(const Command& command) noexcept {
  if (command.epoch != epoch_.load(std::memory_order_relaxed)) return;
  if (command.noteEpoch == noteEpoch_.load(std::memory_order_acquire)) startVoice(command.pad, command.velocity);
}

void AudioEngine::render(float* left, float* right, std::uint32_t frames) noexcept {
  if (!left || !right) return;
  std::fill_n(left, frames, 0);
  std::fill_n(right, frames, 0);
  if (!running()) return;

  const auto noteEpoch = noteEpoch_.load(std::memory_order_acquire);
  if (noteEpoch != appliedNoteEpoch_) {
    for (auto& voice : voices_) if (voice.sample) voice.releaseRemaining = kFadeFrames;
    appliedNoteEpoch_ = noteEpoch;
  }

  Command command;
  // Bounded work even under input flood; a producer can never stall RemoteIO.
  for (int i = 0; i < 128 && commands_.tryPop(command); ++i) apply(command);
  const float targetMaster = requestedMaster_.load(std::memory_order_acquire);
  float blockPeak = 0;
  for (std::uint32_t frame = 0; frame < frames; ++frame) {
    float l = 0, r = 0;
    for (auto& voice : voices_) {
      float vl = 0, vr = 0;
      if (voice.tailRemaining > 0) {
        const float tail = static_cast<float>(voice.tailRemaining--) / kFadeFrames;
        vl += voice.tailL * tail;
        vr += voice.tailR * tail;
      }
      if (voice.sample) {
        const auto total = voice.sample->frames();
        const float attack = std::min(1.0F, static_cast<float>(voice.cursor) / kFadeFrames);
        const float endFade = std::min(1.0F, static_cast<float>(total - voice.cursor) / kFadeFrames);
        float envelope = attack * endFade * voice.velocity;
        if (voice.releaseRemaining > 0) envelope *= static_cast<float>(voice.releaseRemaining) / kFadeFrames;
        vl += voice.sample->stereo[voice.cursor * 2] * envelope;
        vr += voice.sample->stereo[voice.cursor * 2 + 1] * envelope;
        ++voice.cursor;
        const bool released = voice.releaseRemaining > 0 && --voice.releaseRemaining == 0;
        if (voice.cursor == total || released) voice.sample = nullptr;
      }
      voice.previousL = vl;
      voice.previousR = vr;
      l += vl;
      r += vr;
    }
    crossfade_ += std::clamp(requestedCrossfade_.load(std::memory_order_relaxed) - crossfade_, -gainSlew_, gainSlew_);
    const float gainA = std::sqrt(std::max(0.0F, 1 - crossfade_));
    const float gainB = std::sqrt(std::max(0.0F, crossfade_));
    for (std::size_t index = 0; index < kDeckCount; ++index) {
      auto& deck = decks_[index];
      const auto total = deck.track.frames();
      if (!total) continue;
      const float seek = deck.seek.exchange(-1, std::memory_order_acq_rel);
      if (seek >= 0) deck.cursor = std::min<double>(total - 1, seek * total);
      const bool playing = deck.playing.load(std::memory_order_acquire);
      deck.envelope += std::clamp((playing ? 1.0F : 0.0F) - deck.envelope, -gainSlew_, gainSlew_);
      if (deck.envelope > 0 && deck.cursor < total) {
        const auto first = static_cast<std::size_t>(deck.cursor);
        const auto next = std::min<std::size_t>(first + 1, total - 1);
        const float fraction = static_cast<float>(deck.cursor - first);
        const float side = index == 0 ? gainA : gainB;
        l += (deck.track.stereo[2 * first] * (1 - fraction) + deck.track.stereo[2 * next] * fraction) * side * deck.envelope;
        r += (deck.track.stereo[2 * first + 1] * (1 - fraction) + deck.track.stereo[2 * next + 1] * fraction) * side * deck.envelope;
      }
      if (playing) {
        deck.cursor += deck.rate.load(std::memory_order_relaxed);
        const auto loopEnd = std::max(1.0, static_cast<double>(deck.loopEnd.load(std::memory_order_relaxed)) * total);
        if (deck.cursor >= loopEnd) {
          if (deck.loopStart.load(std::memory_order_relaxed) > 0 || deck.loopEnd.load(std::memory_order_relaxed) < 1)
            deck.cursor = deck.loopStart.load(std::memory_order_relaxed) * total;
          else { deck.cursor = total - 1; deck.playing.store(false, std::memory_order_release); }
        }
      }
    }
    master_ += std::clamp(targetMaster - master_, -gainSlew_, gainSlew_);
    l *= master_ * kHeadroom;
    r *= master_ * kHeadroom;
    const float magnitude = std::max(std::abs(l), std::abs(r));
    const float required = magnitude > 0.96F ? 0.96F / magnitude : 1.0F;
    limiter_ = required < limiter_ ? required : std::min(required, limiter_ + limiterRelease_);
    left[frame] = l * limiter_;
    right[frame] = r * limiter_;
    blockPeak = std::max({blockPeak, std::abs(left[frame]), std::abs(right[frame])});
  }
  std::array<std::uint64_t, kPadCount> newest{};
  std::array<float, kPadCount> progress;
  progress.fill(-1);
  for (const auto& voice : voices_) {
    if (voice.sample && voice.serial > newest[voice.pad]) {
      newest[voice.pad] = voice.serial;
      progress[voice.pad] = static_cast<float>(voice.cursor) / static_cast<float>(voice.sample->frames());
    }
  }
  for (std::size_t pad = 0; pad < kPadCount; ++pad) progress_[pad].store(progress[pad], std::memory_order_relaxed);
  for (auto& deck : decks_) if (deck.track.frames())
    deck.position.store(static_cast<float>(deck.cursor / deck.track.frames()), std::memory_order_release);
  peak_.store(blockPeak, std::memory_order_relaxed);
  renderedFrames_.fetch_add(frames, std::memory_order_relaxed);
}

}  // namespace artss::audio
