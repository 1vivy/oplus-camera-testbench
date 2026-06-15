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
all four lanes (framework+graph + provider/app frida probes + r3-gralloc + r4-OEM) → strace → parse → a
top-level verdict. Result: **`VERDICT=GOLDEN`** (preflight ready, modes PASS, lanes ran, parse ALL-STABLE).
- Manifest + roll-up: `reference/baseline/full-baseline/{BASELINE.md,verdict.json,PREFLIGHT.md}`.
- Raw lanes (indexed, not duplicated): `reference/{campaign,r3,r4,strace}/full-baseline/`.
- Stable signal across both runs: fusion-graph 21912→27974, hdr_detected present, copyMetadata-UAF False,
  8K −38 False, OEM-binder dropped=2. strace tells: ENOENT on `opluseisoverridesettings.txt`, `utele_*.bin`.
- New Tier-1/Tier-2 freeze+8K traces: `reference/baseline/freeze-gateb/` (the `freeze-gateb` condition).
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

## Procedure (as run)
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

## Not captured this run (need frida / separate kits — same as OOS-BL-001)
- `com.qti.stats_control.hdr_detected` rc — needs `frida/observe_getmetadata.js` (not a logcat tag; 0 here as expected).
- `onImageAvailable` flow — frida probe, not a logcat tag (0 here as expected).
- StaticSettings dump (`selectSHDRAutoExposureUsecase` +0x6a28/+0x6a18) — `frida/dump_camxsettings.js`.
- OEM binder txns 10000–10022 + ExtImpl — `r4-oem-transact/` kit.  Gralloc P010 — `r3-gralloc/` kit.

Run those frida-side kits on this same unit when an A/B needs the metadata/stats layer; this dir is the
framework+graph denominator.

## Reversal
All levers are setprop/overlay only (reversible). To restore stock-quiet state: clear
`persist.vendor.camera.oplus.enableLogging`, `persist.sys.camera.private.log.enable`, and the `log.tag.*`
props, or simply reboot.
