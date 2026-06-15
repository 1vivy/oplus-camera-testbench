---
id: OOS-BL-002
title: "OOS 16.0.8.300 stock camera baseline — CPH2745/OP611FL1 (golden photo capture)"
skill: L2-multimedia-audio-expert
date: 2026-06-14
source: oem-baseline-capture
device: OnePlus CPH2745 / OP611FL1 (ossi), OxygenOS user-version 16.0.8.300(EX01), oplusrom V16.1.0 (display 16.0.8), build BP2A.250605.015 user/release-keys
artifacts: reference/ab/oos-photo-v16.0.8.300/   (logcat_all, dumpsys_camera_{pre,post}, sf_{pre,post}, app_backtrace, {cameraserver,camera}_daemon_bt, OfflineLog_CrashLog_*, ui_action, meta)
supersedes-as-denominator: OOS-BL-001 (16.0.7) — same harness, newer point release
---

## UPDATE 2026-06-15 — golden baseline via the full harness
This doc's original capture (`reference/ab/oos-photo-v16.0.8.300/`) was the framework+graph denominator. The
full **golden baseline** now lives at **`reference/baseline/full-baseline/`** — produced in one command by
`tools/observability/capture/baseline.sh full-baseline`, which composes preflight → validate_modes gate →
all four lanes (framework+graph + provider/app frida probes + r3-gralloc + r4-OEM) → strace → parse →
**frida-coverage gate** → a top-level verdict. Result: **`VERDICT=GOLDEN`** (preflight ready, modes PASS,
lanes ran, parse ALL-STABLE, **frida 13/13 FULL**). GOLDEN now *requires* the frida probes to have armed +
captured (`frida_coverage.py`) — a silently no-op'd probe (0-byte/banner-only, the attach-race class)
downgrades to PARTIAL instead of passing as golden. So "golden" here means the frida hooks are included AND
proven live, not merely that the lanes executed.
- Manifest + roll-up: `reference/baseline/full-baseline/{BASELINE.md,verdict.json,PREFLIGHT.md}`.
- Raw lanes (indexed, not duplicated): `reference/{campaign,r3,r4,strace}/full-baseline/`.
- Stable signal across both runs: fusion-graph 21912→27974, hdr_detected present, copyMetadata-UAF False,
  8K −38 False, OEM-binder dropped=2. strace tells: ENOENT on `opluseisoverridesettings.txt`, `utele_*.bin`.
- **`freeze-gateb` (video8k) golden — captured 2026-06-15: VERDICT=GOLDEN, frida 9/9 FULL.** The 8K data we
  were after: **`getExtensionOperatingMode → op_mode=0x80a9` (the 8K operating mode)**; `sendInputData` reads
  the input-params holder at **`+0x370`** non-null in 8K video (`holderPresent=37 holderNull=0` — the RE fix
  validated in the actual freeze condition); configure_streams + OEM-transaction depths armed. Record:
  `reference/baseline/freeze-gateb/`.
- **Automation hardening (the "13/13 ≠ what we wanted" fix).** `drive_cycle.sh` `ensure_8k` is now
  feedback-driven (no blind taps — the old fixed coords mis-fired into Google Lens when the camera was
  slow/frozen); a new `assert_scope` guard asserts the camera is foreground AND in the intended mode before
  the shutter, so a capture can't read "coverage FULL" while actually in the wrong app/mode. video8k/photo/
  night all GRADUATE 2/2 in `validate_modes`. The frida-coverage classifier also recognises the freeze-gate /
  8K data markers (holderPresent / APSParamsHolder / op_mode=0x80…), so ARMED-with-data is counted accurately.
- The assisted runbook to reproduce/extend (and trace upward to root) is `reference/AGENTS.md`.

## Scope
Fresh stock-OOS baseline on the reference unit at the **16.0.8.300** point release (OOS-BL-001 was 16.0.7).
Same purpose: a *golden working* stock photo cycle captured with identical instrumentation to diff the
LOS build against — the **denominator** for `tools/observability/TEST-PLAN.md` rows. SELinux Enforcing;
rooted via KernelSU (`u:r:ksu:s0`), frida-server live (pid 9121 at capture time).

## Version identity (the version label vs the repo tag)
The requested "v16.0.8.300" and the repo's `V16.1.0` tag are the **same build**. Props on the unit:
- `ro.build.display.id` / `persist.sys.oplus.ota_ver_display` = `CPH2745_16.0.8.300(EX01)`
- `ro.build.version.ota` = `CPH2745_11.A.42_0420_202606022356`
- `ro.build.version.oplusrom` = `V16.1.0`  (internal ROM family — what `ab_capture.sh` auto-tags by)
- `ro.build.version.oplusrom.display` = `16.0.8`
- `ro.build.fingerprint` = `OnePlus/CPH2745IN/OP611FL1:16/BP2A.250605.015/B.R4T3.2e4dd7d-a2e41f-a65541:user/release-keys`

Because `ab_capture.sh` tags by `ro.build.version.oplusrom`, the on-device artifact dir is
`obs_ab_V16.1.0_1781477186`. Pulled into a version-explicit repo dir to avoid clobbering OOS-BL-001:
`reference/ab/oos-photo-v16.0.8.300/`.

## Procedure (as run) — the framework+graph sub-denominator (NOT the full golden)
> The steps below produced the **framework+graph denominator only** (`reference/ab/oos-photo-v16.0.8.300/`):
> logcat + dumpsys + SF + backtraces, **no frida**. The full **golden** baseline (frida-inclusive) is the
> `full-baseline` run at the top — `baseline.sh` composes these same levers PLUS all provider/app/r3/r4 frida
> probes, and now gates GOLDEN on frida coverage (`frida_coverage.py`, 13/13 FULL for this build). Read this
> section as "how the denominator layer is captured," not "how the golden was captured."
1. `adb push tools/observability/{enable,capture} /data/local/tmp/{obs-enable,obs-capture}`
2. `su -c 'sh /data/local/tmp/obs-enable/00_enable_all.sh'` — max-verbosity, reversible levers only.
3. `su -c 'sh /data/local/tmp/obs-capture/ab_capture.sh photo'` — deterministic photo cycle via `ui/drive_cycle.sh`.
4. Pulled the build-tagged artifact dir into `reference/ab/oos-photo-v16.0.8.300/`.

### Levers applied by 00_enable_all (confirmed in summary)
- `persist.vendor.camera.oplus.enableLogging=true` → CHI INFO passes (defeats OLog clobber #3).
- `persist.sys.camera.private.log.enable=debug,pre,mp` → APS native safe selector (disk alog path left **disarmed** — G7 self-kill).
- `/system` AOSP `log.tag.*` raised for CameraService/Camera3-Device/Camera2-JNI/Surface.
- CamX-core `g_logInfo`, OEM OLog globals: **not** auto-armed (frida-only; not needed for a golden-photo denominator).

## Stimulus (ui_action.log)
Cold launch `com.oplus.camera` → privacy-confirm not present → `goto_main_mode PHOTO OK` →
tap `shutter_button` (635,2261) → SIGQUIT for preview-thread state → close skipped (DRIVE_NO_CLOSE). Clean run.

## Health verdict — this is a GOLDEN (working) cycle
- **No fresh tombstone** this cycle (newest `tombstone_03` predates the run by ~7 min; no MediaCodec
  crash-loop — cf. OOS-BL-001 §1, which required a reboot to clear). Preview came up.
- The `OfflineLog_CrashLog_2026-06-14--16-46-51` pulled alongside is **benign**: it is the
  `vendor.qti.camera.provider-service_64` main thread parked idle in
  `IPCThreadState::joinThreadPool` (binder `ioctl`), snapshotted by the SIGQUIT/debuggerd path —
  CamX just names its offline dumps "Crash_Dump". Not a fault.
- `app_backtrace.txt` via `debuggerd -b 16040` (app alive at post-state).

## Golden graph signatures (the denominator LOS must reproduce)
From `logcat_all.txt` (100,883 lines, 21 MB — verbosity levers live):

| Signal | Count | Meaning |
|---|---:|---|
| `MCXSuperFG` | 16186 | stock multi-cam super-fusion graph node active |
| `MultiCameraReprocessRealtime` | 7403 | stock realtime multi-cam reprocess node |
| `OplusSATFusionOfflineReprocess` | 3615 | stock SAT fusion offline reprocess node |
| `WriteIccProfile` | 6 | stock ICC-profile write node |
| `SHDRAutoExposure` | 4 | SHDR auto-exposure usecase selection present |
| `configure_streams` | 3 | HAL stream config events |
| `CameraService…connect` | 1 | service connect |

These four graph nodes are the **stock-only tells** from AB-RUNBOOK.md row 1: LOS shows none → graph-selection
divergence. Their heavy presence here confirms a healthy stock pipeline.

## Not captured in THIS denominator run (frida / separate kits) — but COVERED by the golden full-baseline
This frida-less `ab` dir does not carry the layers below. **The golden `full-baseline` run DOES** — verified
by `reference/baseline/full-baseline/frida_coverage.txt` (**13/13 FULL**, 0 DEAD/0 MISSING):
- `com.qti.stats_control.hdr_detected` — golden captured it via `probe_aec_hdrdetect.js`
  (`[HDRTrigger] ran (hdr_detected computed this frame)`, ARMED). (`observe_getmetadata.js` is NODATA in the
  app pid — libAlgoProcess loads in the *provider*, not the app — so hdr_detected is read from the aec probe.)
- preview-delivery / `onImageAvailable` flow — golden `trace_preview_delivery.js` ARMED (live getOplus/acq counters).
- StaticSettings dump (`selectSHDRAutoExposureUsecase` +0x6a28/+0x6a18) — golden `dump_camxsettings.js` ARMED
  (correctly ABORTed its write on an offset mismatch — RE refinement pending, see VERIFICATION-LEDGER).
- OEM binder txns 10000–10022 + ExtImpl — golden `r4-oem-transact` (`ext_server` ARMED, hooks all true).
  Gralloc P010 — golden `r3-gralloc` (`lockPlanes rc=0 planeCount=3` + plane data, ARMED).

So: this `ab` dir is the **framework+graph denominator** (a sub-layer); the **frida-inclusive golden** is
`reference/baseline/full-baseline/`. The two are not the same artifact — do not read "no frida here" as "the
golden has no frida."

## Reversal
All levers are setprop/overlay only (reversible). To restore stock-quiet state: clear
`persist.vendor.camera.oplus.enableLogging`, `persist.sys.camera.private.log.enable`, and the `log.tag.*`
props, or simply reboot.
