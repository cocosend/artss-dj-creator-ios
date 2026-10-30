# Migration readiness review — 18 October 2026

## Decision

**Defer production cutover; continue the already selected iOS prototype
checkpoint.** Confidence is high that the supplied web client cannot provide
the requested C++/RemoteIO architecture without a native target. Confidence in
release readiness remains low until the Apple build and device gates pass.

This is a read-only assessment of the supplied project. The accompanying
code changes fix three lifecycle defects in its existing native prototype.
No production app, hosting project or store release was changed.

## Platform inventory and coverage

| Client | Accessible evidence | Status |
| --- | --- | --- |
| Mobile browser/PWA, iOS and Android | Parent `package.json`, `public/manifest.json`, `src/App.tsx`, Web Audio implementation | Observed source; live production behavior not inspected |
| Native iOS prototype | `ios/ARTSSNative.xcodeproj`, Swift AppDelegate, local Audio Core podspec | Observed source; no native compilation/device evidence |
| Separate production native iOS client | No repository supplied | Unavailable in this review; existence/installed-user continuity unknown |
| Separate production native Android client | No repository supplied | Unavailable in this review; existence unknown |
| Native Android roadmap | Earlier product requirements mention Android; this architecture brief targets iPhone | Reported roadmap; Android native adapter and verification not assessed |

All conclusions below concern the supplied web source and iOS prototype.
Absence of an Android folder does not establish product-wide Android support
or its absence. No recommendation retires an inaccessible production client.

## Evidence and parity

| Flow / boundary | Current evidence | Native checkpoint |
| --- | --- | --- |
| Pad playback | Web `../src/audio/artssAudioEngine.ts:735`; native `src/components/PerformancePad.tsx:21` | Observed direct UI-worklet → shared JSI controls → C++ PCM path; device validation pending |
| Master fader | `src/components/MasterFader.tsx:13` and `:17` | Observed worklet gesture and lock-free native gain intent; hardware behavior pending |
| Waveform / cursor | `src/components/AudioWaveform.tsx:18` | Observed native-position-driven display; FPS unmeasured |
| Recording | Web `../src/audio/artssAudioEngine.ts:917` and `:937` | Not ported; MediaRecorder is a web-only reference |
| WAV export | Web `../src/audio/artssAudioEngine.ts:960` | Not ported |
| Sequencer / presets / sample import | Parent audio engine and Creator component | Native parity incomplete; automatic track slicing is outside the current brief |
| Session boundaries | `modules/artss-audio/ios/IOSAudioBackend.mm:240`, `:275`; `src/audio/useAudioSession.ts:10` | Observed lifecycle queue, interruption/route handling and inactivity stop; native behavior untested |
| Native persistence / installed-user migration | No native storage implementation or store history supplied | Unknown; no migration of saved projects can be claimed |
| Network / optional AI | Parent `../server.ts:21` exposes generation endpoint | Native app has no connected backend path |
| Auth, purchases, push, deep links, app extensions | None found in supplied native target | No parity evidence for inaccessible production clients |

### Readiness dimensions

- **Driver — reported:** target 5–10 ms touch-to-output latency and display-native
  60/120 FPS. The old client's perceived problems are user reports, not measured
  baselines. Current host tests do not measure either target.
- **Native surface — observed:** RemoteIO, AVAudioSession, file conversion and
  shared JSI control state. The highest-risk boundary is UI touch → worklet →
  JSI → audio callback across actual iPhone lifecycle events.
- **Continuity — unknown:** production install base, project/session storage,
  signing ownership, native reference clients and rollout/rollback history.
- **Verification — observed/unknown:** host checks are reproducible; physical
  device, listening, leak, latency and frame-time evidence is incomplete.
- **Release — observed/unknown:** Xcode source and CocoaPods configuration exist;
  Apple build, distribution, signing, recovery and store rollout are unverified.
- **Ownership — reported/unknown:** the user selected the native architecture;
  device-test, signing and production-release owners are not recorded.
- **Agent governance — observed:** scoped source changes and retained legacy
  source; no deployment, new secrets, ad dispatch or external data writes.
- **Delivery economics — unknown:** no staffing, lead-time, parity-cost,
  maintenance-cost or native defect baseline was supplied.

Brownfield packaging is not selected: no existing production native host was
provided to embed the prototype into. A complete replacement is premature
because feature parity and native verification remain incomplete.

## Representative checkpoint

Budget, calendar deadline and independent reviewer: not supplied; no duration
or ROI estimate is invented.

1. **Performance flow:** simultaneous pad playback, 48-voice pressure, waveform
   and fader interaction. Record audio onset and frame-time distributions on
   a physical iPhone with a named wired/USB route, rate and buffer size.
2. **Lifecycle flow:** interruption, route change, inactivity, restart and React
   instance teardown, including a full control queue. Verify no stuck voices,
   stale hits, unexpected attenuation or unsafe automatic restart.
3. **Stateful creative flow:** port the confirmed record/loop/export and saved
   project behavior after its product semantics are settled. The current
   prototype has no completed native equivalent or persistence parity proof.

For each flow, first preserve confirmed behavior and error states, then perform
an idiomatic React Native/performance pass and repeat the same parity checks.
Native runtime evidence plus independent review are required before scaling
or cutover. Android requires a separately scoped adapter and device checkpoint
if native Android remains in the release scope.

## Baseline, ROI and next decision

Measured host evidence covers DSP/queue correctness only. Native startup,
interaction, memory, crash rate, latency and both-platform delivery baselines
are missing. Potential return is the requested native audio/UI capability;
no code-sharing percentage, cost saving or payback period is asserted.

Count DSP/native-boundary work, sample import, recording/export, persistence,
dual maintenance, two-platform device QA when applicable, signing and release
operations in the investment. Web hosting is a separate distribution lane.

The product owner decides cutover after native build/device evidence and
critical creative-flow parity are reviewed. Until then, keep the web reference
and the native prototype distinct in status and do not advertise the requested
latency/FPS targets as achieved.
