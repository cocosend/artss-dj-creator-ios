#import "ArtssAudioModuleProvider.h"
#include "NativeArtssAudio.hpp"

@implementation ArtssAudioModuleProvider
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams&)params {
  return std::make_shared<facebook::react::NativeArtssAudio>(params.jsInvoker);
}
@end
