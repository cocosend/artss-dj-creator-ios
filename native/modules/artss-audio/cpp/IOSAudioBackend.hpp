#pragma once

#include "AudioEngine.hpp"

#include <functional>
#include <memory>
#include <string>

namespace artss::audio {

// Lifecycle and decoding run on a private serial queue, never the render thread.
class IOSAudioBackend final : public std::enable_shared_from_this<IOSAudioBackend> {
 public:
  using Completion = std::function<void(std::string, std::string)>;
  IOSAudioBackend();
  ~IOSAudioBackend();
  void start(Completion completion);
  void stop(Completion completion);
  void pickTrack(std::uint32_t deck, Completion completion);
  void loadPreset(std::uint32_t deck, std::uint32_t preset, Completion completion);
  std::shared_ptr<AudioEngine> engine() const noexcept;
  double maximumRenderMs() const noexcept;
  std::uint64_t overruns() const noexcept;
  std::uint64_t invalidBuffers() const noexcept;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace artss::audio
