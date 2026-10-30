#include "NativeArtssAudio.hpp"

#include <cmath>

namespace facebook::react {
namespace {
class RealtimeControls final : public jsi::HostObject {
 public:
  explicit RealtimeControls(std::shared_ptr<artss::audio::IOSAudioBackend> backend)
      : backend_(std::move(backend)), engine_(backend_->engine()) {}

  jsi::Value get(jsi::Runtime& runtime, const jsi::PropNameID& property) override {
    const auto name = property.utf8(runtime);
    if (name == "running") return engine_->running();
    if (name == "peak") return engine_->peak();
    if (name == "frames") return static_cast<double>(engine_->renderedFrames());
    if (name == "droppedCommands") return static_cast<double>(engine_->droppedCommands());
    if (name == "renderOverruns") return static_cast<double>(backend_->overruns());
    if (name == "maximumRenderMs") return backend_->maximumRenderMs();
    if (name == "invalidBuffers") return static_cast<double>(backend_->invalidBuffers());
    if (name == "deckPosition0") return engine_->deckPosition(0);
    if (name == "deckPosition1") return engine_->deckPosition(1);
    if (name == "deckPlaying0") return engine_->deckPlaying(0);
    if (name == "deckPlaying1") return engine_->deckPlaying(1);
    if (name == "deckPlay" || name == "deckSeek" || name == "deckRate") {
      return jsi::Function::createFromHostFunction(runtime, property, 2,
          [engine = engine_, name](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 2 || !args[0].isNumber() || (name == "deckPlay" ? !args[1].isBool() : !args[1].isNumber())) return false;
            const double deck = args[0].asNumber();
            const double value = name == "deckPlay" ? (args[1].getBool() ? 1 : 0) : args[1].asNumber();
            if (!std::isfinite(deck) || deck < 0 || deck >= 2 || deck != std::floor(deck) || !std::isfinite(value)) return false;
            const auto index = static_cast<std::uint32_t>(deck);
            if (name == "deckPlay") return (value == 0 || value == 1) && engine->deckPlay(index, value == 1);
            if (name == "deckSeek") return engine->deckSeek(index, static_cast<float>(value));
            return engine->deckRate(index, static_cast<float>(value));
          });
    }
    if (name == "deckLoop") {
      return jsi::Function::createFromHostFunction(runtime, property, 3,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 3 || !args[0].isNumber() || !args[1].isNumber() || !args[2].isNumber()) return false;
            const double deck = args[0].asNumber();
            return std::isfinite(deck) && deck >= 0 && deck < 2 && deck == std::floor(deck) &&
                engine->deckLoop(static_cast<std::uint32_t>(deck), static_cast<float>(args[1].asNumber()), static_cast<float>(args[2].asNumber()));
          });
    }
    if (name == "crossfade") {
      return jsi::Function::createFromHostFunction(runtime, property, 1,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            return count >= 1 && args[0].isNumber() && engine->crossfade(static_cast<float>(args[0].asNumber()));
          });
    }
    if (name.size() == 9 && name.compare(0, 8, "position") == 0 && name[8] >= '0' && name[8] <= '7') {
      return engine_->progress(static_cast<std::uint32_t>(name[8] - '0'));
    }
    if (name == "trigger") {
      return jsi::Function::createFromHostFunction(runtime, property, 2,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 2 || !args[0].isNumber() || !args[1].isNumber()) return false;
            const double pad = args[0].asNumber(), velocity = args[1].asNumber();
            if (!std::isfinite(pad) || pad < 0 || pad >= artss::audio::kPadCount || pad != std::floor(pad) ||
                !std::isfinite(velocity) || velocity <= 0 || velocity > 1) return false;
            return engine->trigger(static_cast<std::uint32_t>(pad), static_cast<float>(velocity));
          });
    }
    if (name == "setMaster") {
      return jsi::Function::createFromHostFunction(runtime, property, 1,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 1 || !args[0].isNumber()) return false;
            const auto gain = args[0].asNumber();
            if (!std::isfinite(gain) || gain < 0 || gain > 1) return false;
            return engine->setMaster(static_cast<float>(gain));
          });
    }
    if (name == "allNotesOff") {
      return jsi::Function::createFromHostFunction(runtime, property, 0,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value*, std::size_t) -> jsi::Value {
            return engine->allNotesOff();
          });
    }
    return jsi::Value::undefined();
  }

 private:
  std::shared_ptr<artss::audio::IOSAudioBackend> backend_;
  std::shared_ptr<artss::audio::AudioEngine> engine_;
};
}

NativeArtssAudio::NativeArtssAudio(std::shared_ptr<CallInvoker> jsInvoker)
    : NativeArtssAudioCxxSpec(jsInvoker), invoker_(std::move(jsInvoker)),
      backend_(std::make_shared<artss::audio::IOSAudioBackend>()) {}

NativeArtssAudio::~NativeArtssAudio() {
  // Stop on React instance teardown even if an old worklet still retains controls.
  backend_->stop([](std::string, std::string) {});
}

jsi::Object NativeArtssAudio::getControls(jsi::Runtime& runtime) {
  // Worklets shares this HostObject as native state, across both JS runtimes.
  return jsi::Object::createFromHostObject(runtime, std::make_shared<RealtimeControls>(backend_));
}

AsyncPromise<std::string> NativeArtssAudio::start(jsi::Runtime& runtime) {
  AsyncPromise<std::string> promise(runtime, invoker_);
  backend_->start([promise](std::string result, std::string error) mutable {
    if (error.empty()) promise.resolve(std::move(result));
    else promise.reject(Error{std::move(error)});
  });
  return promise;
}

AsyncPromise<> NativeArtssAudio::stop(jsi::Runtime& runtime) {
  AsyncPromise<> promise(runtime, invoker_);
  backend_->stop([promise](std::string, std::string error) mutable {
    if (error.empty()) promise.resolve();
    else promise.reject(Error{std::move(error)});
  });
  return promise;
}

AsyncPromise<std::string> NativeArtssAudio::pickTrack(jsi::Runtime& runtime, double deck) {
  AsyncPromise<std::string> promise(runtime, invoker_);
  if (!std::isfinite(deck) || deck < 0 || deck >= 2 || deck != std::floor(deck)) {
    promise.reject(Error{"Invalid deck"});
    return promise;
  }
  backend_->pickTrack(static_cast<std::uint32_t>(deck), [promise](std::string result, std::string error) mutable {
    if (error.empty()) promise.resolve(std::move(result));
    else promise.reject(Error{std::move(error)});
  });
  return promise;
}

AsyncPromise<std::string> NativeArtssAudio::loadPreset(jsi::Runtime& runtime, double deck, double preset) {
  AsyncPromise<std::string> promise(runtime, invoker_);
  if (!std::isfinite(deck) || deck < 0 || deck >= 2 || deck != std::floor(deck) ||
      !std::isfinite(preset) || preset < 0 || preset >= 7 || preset != std::floor(preset)) {
    promise.reject(Error{"Invalid preset or deck"});
    return promise;
  }
  backend_->loadPreset(static_cast<std::uint32_t>(deck), static_cast<std::uint32_t>(preset),
      [promise](std::string result, std::string error) mutable {
        if (error.empty()) promise.resolve(std::move(result));
        else promise.reject(Error{std::move(error)});
      });
  return promise;
}

}  // namespace facebook::react
