# ARTSS native audio architecture

The primary new implementation lives in `native/`. The original React/Vite
source is retained as a migration reference; it is not the iOS Audio Core.

- React Native New Architecture (Fabric + Hermes) and strict TypeScript.
- Reanimated worklets and Gesture Handler own continuous gestures/animations.
- Skia draws waveform geometry on the native renderer. React state must not be
  updated for every audio block, fader move, or display frame.
- CoreAudio RemoteIO renders C++ Float32 PCM on the system real-time thread.
- UI worklets call a shared JSI HostObject; pad commands use the bounded native
  MPSC queue and continuous parameters use lock-free latest-value atomics.
  Never route pad hits through `scheduleOnRN`/`runOnJS`.
- The render callback must not allocate, lock, log, perform file/network I/O,
  invoke JS, or release sample ownership. Sample decode runs on the serial
  lifecycle queue before the Audio Unit starts.
- Handle queue overflow, stale commands, interruptions, route changes, and
  React instance teardown. All-notes-off must work even when the queue is full.
- No HTML Audio, WebView audio, JS players, or browser audio fallback inside
  `native/`. Do not add an additional native engine or duplicate app.
- Target 5–10 ms measured touch-to-output latency on an appropriate wired route;
  zero physical latency is impossible. Report negotiated buffer and route
  latency separately from measured end-to-end latency.
- Target display-native 60/120 FPS. 120 FPS requires compatible display hardware
  and operating conditions; never claim it from a JS build alone.
- Before delivery, run `npm run verify` in `native/`. After changes to audio
  threading/memory, run `ASAN_OPTIONS=detect_leaks=0 SANITIZER=address,undefined
  npm run test:core` where supported. A native Release build on macOS and
  physical iPhone profiling are additional release requirements.
- Keep replies concise. Distinguish implemented source, host-tested code,
  uncompiled iOS code, and measurements made on hardware.
