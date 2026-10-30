# Verification — 18 October 2026

| Check | Result |
| --- | --- |
| TypeScript, strict + unchecked index checking | PASS |
| ESLint, native app and typed module API | PASS |
| React Native iOS Codegen, all dependencies | PASS |
| Generated mapping: NativeArtssAudio → ArtssAudioModuleProvider | PASS |
| CLI autolinking resolves local Audio Core podspec | PASS |
| Metro iOS release JavaScript bundle | PASS |
| C++20 core lifecycle, PCM bounds, 48-voice playback, gain ramps, sample limiter | PASS |
| Stale-command rejection; queue overflow; panic while queue is full | PASS |
| First new hit accepted immediately after a stopped session with 512 queued hits | PASS |
| Limiter attenuation reset before new-session playback | PASS |
| Zero/quarter master gain retained across stop before the next callback, including a full hit queue | PASS |
| Four producers, 20,000 messages, exact per-producer ordering | PASS |
| Four concurrent control producers with audio rendering, meter reads and at least eight stop/start handoffs | PASS |
| No intercepted C++ heap allocation during tested render callbacks | PASS |
| AddressSanitizer + UndefinedBehaviorSanitizer | PASS |
| Eight bundled PCM files: 48 kHz, mono 16-bit, 0.85 peak, zero-valued endpoints | PASS |
| Objective-C++/JSI/CoreAudio native compilation | NOT RUN — requires Apple SDK/Xcode |
| UI + JSI + RemoteIO integration on iPhone | NOT RUN |
| Physical touch-to-output latency and frame-time distribution | NOT MEASURED |
| Listening test, wired/Bluetooth route and interruption matrix | NOT RUN |

LeakSanitizer was disabled (`ASAN_OPTIONS=detect_leaks=0`) because this host does
not expose the process task information it requires. No leak-free claim is made.

The host dependency install used `--ignore-scripts` after Skia's external native
binary download was blocked by the environment's network proxy. This permits
TypeScript, lint, Codegen, JS bundling and portable C++ tests; it cannot validate
Skia linking or produce an iOS app binary. Use the normal dependency install and
CocoaPods workflow on macOS before native release verification.

The native migration retained the legacy web client as a reference. Its README
and TypeScript exclusion list identify and isolate the new native target.
The later web-preview deployment fixed duplicate JSX accessibility attributes
in the retained Creator component; see `../DEPLOYMENT.md` for deployment scope.

## Follow-up: selected plugin review

Three restart defects were reproduced before the fixes and checked afterwards:

- With 512 pending commands, the first post-restart trigger returned false.
  Stop now drains published entries, without resetting queue sequence numbers
  or invalidating a producer's reserved slot. Epoch checks still reject late
  stale publications. The reproduced first trigger now returns true.
- After a 48-voice overload, a new single voice had a peak of approximately
  0.030644 instead of the fresh-session 0.199583 in the deterministic PCM
  test. Resetting limiter state on completed stop restores 0.199583. These
  figures are unit-test signal amplitudes, not latency or listening measures.
- Accepting master gain zero and stopping before the next callback discarded
  that gain intent. The first restarted voice still peaked at 0.199583. Master
  gain now uses a lock-free latest-value atomic, independent of the trigger
  queue; the identical reproduction is silent (peak zero). Zero and quarter
  level are both covered across restart, including a full trigger queue.

Regression coverage includes a full queue, fresh-session level equivalence,
concurrent publication during stopped-consumer handoffs and zero intercepted
render allocations. The new native checks also passed ASan/UBSan with the same
host LeakSanitizer limitation described above.

`MIGRATION.md` records the bounded readiness review and missing native parity.
`ADS-READINESS.md` records the Ads applicability review; no tracking was added.
The selected skill's CAPI exposure scan completed with zero findings. No Ads
conversion event, production deployment, or hardware performance claim was made.
