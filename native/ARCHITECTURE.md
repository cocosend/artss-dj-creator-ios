# ARTSS Audio Core — architecture decision

Status: first native vertical slice, not a finished edjing Mix equivalent.
The user's native architecture brief supersedes the previous PWA architecture.

## Stack

| Layer | Pinned implementation |
| --- | --- |
| App | React Native 0.84.1, React 19.2.3, Hermes, Fabric |
| Language | strict TypeScript 5.8.3; C++20; Objective-C++ iOS adapter |
| Interaction | Gesture Handler 2.30.0; Reanimated 4.2.2; Worklets 0.7.4 |
| Graphics | `@shopify/react-native-skia` 2.4.15 |
| Audio | RemoteIO Audio Unit, stereo Float32 PCM, AVAudioSession |
| Native interface | Codegen C++ TurboModule + runtime-shared JSI HostObject |

Versions are pinned and a package lock is included. The installed Reanimated
and Worklets compatibility manifests both include React Native 0.84.

## Thread ownership

| Thread | Owns | Prohibited work |
| --- | --- | --- |
| RN JS | React, session UI, low-rate lifecycle monitoring | Audio DSP; per-frame React updates |
| UI worklet runtime | Pad touch-down, fader position, playback cursor, meters | JS round trips for real-time controls |
| Private lifecycle queue | Session setup, file conversion, immutable sample bank, start/stop | Concurrent bank mutation while RemoteIO runs |
| System Audio Unit render thread | 48 fixed voices, sample mixing, gain ramps, peak limiting | Heap operations, locks, JS, file I/O, logging |

Gesture touch-down calls `controls.trigger()` directly from the UI runtime.
Worklets 0.7.4 serializes a HostObject by retaining its native shared ownership
and recreating a runtime-local wrapper. The object never retains runtime-local
JSI values; native functions are created for the calling runtime. Numeric meter
and playhead properties read lock-free atomics.

The bounded MPSC queue permits both JS runtimes to issue discrete pad commands
safely. A producer tries at most eight times and reports failure rather than blocking.
RemoteIO consumes at most 128 commands per block and never spins on a pending
producer. Lifecycle epochs discard commands from previous sessions. A separate
note epoch gives panic/stop priority over a full command queue and invalidates
older unplayed hits.

Continuous master-gain intent uses a separate lock-free latest-value atomic,
sampled once per audio block and applied through the existing gain ramp. This
prevents fader motion from filling the hit queue and retains an accepted level
across a stop that occurs before the next callback. Activation restores that
level before output starts. A completed stop drains published stale hits and
resets limiter attenuation; it never resets a queue producer's sequence state.

The lifecycle queue alone changes session state and sample memory. It rejects
commands, stops/uninitializes/disposes RemoteIO, then clears voices or replaces
PCM. Shared control handles can outlive a React runtime without accessing freed
sample memory. TurboModule destruction schedules a stop even if a worklet
retains its old control handle.

## First implemented slice

- Eight bundled PCM one-shots, decoded/resampled to the negotiated hardware
  rate before playback. Forty-eight concurrent voices, bounded oldest-voice
  stealing with short crossfades, onset/end/release ramps.
- Smoothed master gain, -9 dB summing headroom and a stereo-linked sample-peak
  limiter. This is not a true-peak mastering limiter or a completed DJ FX rack.
- Skia sample envelope with a playback cursor driven by native voice position;
  it does not simulate a waveform or advance from a JavaScript timer.
- UI-thread pad feedback and master fader. VoiceOver actions use the same UI
  control path. Safe-area-aware native screen.
- Interruption, route-change and media-service-reset handlers stop playback.
  Restart requires an explicit user action. App inactivity stops the session;
  background playback/recording are not enabled in this first slice.
- Counters: rendered frames, dropped controls, render deadline overruns,
  maximum callback duration and invalid output buffers. The last three are
  diagnostic counters, not a complete hardware underrun measurement.

The deterministic starter kit is original generated PCM, not a licensed premium
sample library. `scripts/generate-kit.py` regenerates it offline. No synthesis
or sample generation runs in the JS or real-time thread.

Decks, scratching, time stretch, tempo analysis, track import, sequencer,
recording/export and MIDI have not yet been ported. The original web project
remains in the parent directory as reference; those web capabilities are not
represented as completed native features.

## Latency and display targets

Request 48 kHz and a 128-frame I/O buffer; read the actual negotiated rate,
buffer duration and output latency after activating AVAudioSession. A
128-frame buffer at 48 kHz lasts about 2.67 ms. This is a buffer period, not a
touch-to-speaker measurement. Commands take effect on a subsequent render
block, and voice attack ramps also affect perceived onset.

The 5–10 ms target requires physical-device measurements and an appropriate
speaker/wired/USB route. Bluetooth/AirPlay latency is not covered by that target.
No zero-latency guarantee is made. The UI labels buffer duration as buffer
duration; it never presents it as total latency.

`CADisableMinimumFrameDurationOnPhone` is enabled. Target 60 FPS on 60 Hz devices
and 120 FPS on ProMotion devices when the OS permits it. Low Power Mode,
thermal state and OS scheduling can reduce the refresh rate. Do not infer
display performance from Metro output or simulator playback.

## Release gates

1. Host: typecheck, lint, Codegen/autolinking, release JS bundle, C++ DSP tests.
2. Native: install normal npm dependencies including Skia's native binaries,
   install CocoaPods, compile a signed or simulator Release build with Xcode.
3. Device: measure touch-to-output latency through external capture/loopback;
   capture Instruments Audio/Time Profiler and Animation Hitches; repeat with
   48 voices and continuous UI interaction. Record median, p95/p99, route,
   sample rate, buffer, thermal state and power mode.
4. Interruptions/routes: calls, unplugging headphones/USB, Bluetooth changes,
   background/foreground, media services reset and Metro instance teardown.
5. A 30-minute physical-device stress session with no unacceptable audible
   glitches, stuck voices or unsafe restart. Define acceptance from measured
   data before advertising a latency/FPS figure.

## Primary references

- [React Native C++ TurboModules](https://reactnative.dev/docs/0.84/the-new-architecture/pure-cxx-modules)
- [Reanimated compatibility](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/)
- [React Native Skia](https://shopify.github.io/react-native-skia/docs/getting-started/installation/)
- [Apple: AVAudioSession preferred hardware values](https://developer.apple.com/library/archive/qa/qa1631/_index.html)
