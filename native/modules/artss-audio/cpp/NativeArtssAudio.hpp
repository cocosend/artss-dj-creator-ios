#pragma once

#include <ArtssAudioSpecJSI.h>
#include <react/bridging/Promise.h>

#include "IOSAudioBackend.hpp"

namespace facebook::react {

class NativeArtssAudio final : public NativeArtssAudioCxxSpec<NativeArtssAudio> {
 public:
  explicit NativeArtssAudio(std::shared_ptr<CallInvoker> jsInvoker);
  ~NativeArtssAudio() override;
  jsi::Object getControls(jsi::Runtime& runtime);
  AsyncPromise<std::string> start(jsi::Runtime& runtime);
  AsyncPromise<> stop(jsi::Runtime& runtime);
  AsyncPromise<std::string> pickTrack(jsi::Runtime& runtime, double deck);
  AsyncPromise<std::string> loadPreset(jsi::Runtime& runtime, double deck, double preset);

 private:
  std::shared_ptr<CallInvoker> invoker_;
  std::shared_ptr<artss::audio::IOSAudioBackend> backend_;
};

}  // namespace facebook::react
