# DJ Creator — native iOS two-channel mixer

This source implements an original two-channel DJ interface inspired by the public WeDJ control model. It is not Pioneer DJ software and does not contain its assets or code. The previous pad studio is no longer the app entry point.

## What works in source

- The home screen shows seven original synthesized demo grooves under the preset names Maddix, ARTBAT, Brejcha, Guetta, Kazantip, Legends and Modern. These are style labels, not recordings by those artists. Choose deck A or B and tap a demo, or import an audio file from Files. Audio must be enabled first.
- Two side-by-side decks with local audio-file import through the iOS document picker, each with an analyzed waveform and touch seek.
- Independent play/pause, CUE position, speed from 50–150%, beat-length loops calculated against a user-visible fixed 120 BPM reference, and an equal-power crossfader.
- Core Audio RemoteIO mixes both decoded stereo tracks in C++ on the audio render thread; UI gestures write lock-free controls through JSI. Track decoding runs on the lifecycle queue and pauses the output during PCM replacement.
- Audio session interruption/route-change handling, finite PCM validation, limiter, no allocation in render, and C++ host tests.

Audio files are decoded into memory, with an eight-minute import limit. Loading a new file or demo briefly stops output and pauses both decks. The tempo control changes playback rate and pitch together. Loop timing uses the displayed fixed 120 BPM reference rather than analyzing each imported track. BPM analysis, key detection, pitch-preserving time stretch, jog scratching, effects, headphone cue routing, recording, automix, and streaming services are not implemented. Do not present this source as feature-complete WeDJ.

## Verification

On Linux: `npm ci && npm run verify` and `ASAN_OPTIONS=detect_leaks=0 SANITIZER=address,undefined npm run test:core`. These validate TypeScript, lint, C++ DSP, codegen and Metro's iOS JavaScript bundle. They do not compile Objective-C++ or validate device audio.

On macOS with Xcode, run `npm ci`, `bundle install`, `bundle exec pod install --project-directory=ios`, then `npm run ios -- --mode Release`. Physical iPhone audio and touch profiling remain required before an App Store release. The app is a native iOS target, not a PWA or Vercel deployment.
