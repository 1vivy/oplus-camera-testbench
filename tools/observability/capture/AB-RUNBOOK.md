<!-- Parent: ../../AGENTS.md -->

# OOS ↔ LOS Symmetric Capture Runbook

The persistent problem: most stock captures (`~/op15-work/oos-probe-r2-20260603/`, `live_capture.log`)
were **vendor/CamX-only** and frida-driven; the **/system framework layer was never captured on stock
at all**. So several divergences (copyMetadata lifetime, getOplusHardwareBuffer, EDR/SF caps) have
**never been A/B'd** — only inferred from static RE. This runbook makes every subsystem capturable on
both sides with *identical* instrumentation.

## Procedure (run on BOTH the stock OOS unit and the LOS build)
```sh
adb push tools/observability/enable   /data/local/tmp/obs-enable
adb push tools/observability/capture  /data/local/tmp/obs-capture
adb shell su -c 'sh /data/local/tmp/obs-enable/00_enable_all.sh'     # max verbosity (reversible)
adb shell su -c 'sh /data/local/tmp/obs-capture/ab_capture.sh'       # one identical cycle, build-tagged
adb pull /data/local/tmp/obs_ab_<tag>_<ts>  ../../../reference/ab/<tag>/ # into the repo for diffing
```
`ab_capture.sh` auto-tags the artifact dir by `ro.build.version.oplusrom` / `ro.lineage.build.version`
so an OOS dir and a LOS dir never collide. Diff the matching files between the two dirs.

## What to diff, per subsystem
| Subsystem | File in artifact dir | OOS-vs-LOS tell |
|-----------|---------------------|-----------------|
| CamX/CHI graph | `*_OfflineLog_*.log`, `logcat_all.txt` (camxhal3/chifeature2) | Stock has `MultiCameraReprocessRealtime`/`MCXSuperFG`/`OplusSATFusionOfflineReprocess`/`WriteIccProfile`; LOS shows none → graph-selection divergence |
| AEC stats publish | `logcat_all.txt` + frida `observe_getmetadata.js` | `com.qti.stats_control.hdr_detected` rc=0 (OOS) vs rc=-2 (LOS) |
| StaticSettings | frida `dump_camxsettings.js` → `camxsettingsdump.txt` | `selectSHDRAutoExposureUsecase` (+0x6a28) & +0x6a18 = 1 (OOS) vs 0 (LOS) — **stock dump still missing, capture it** |
| Preview delivery | `anr_traces.txt`, `dumpsys_camera_post.txt` | OOS: `onImageAvailable` thread active, stream producing+consuming; LOS: frame-1 stall (the freeze) |
| Metadata lifetime | `tombstones/*`, `logcat_all.txt` | OOS: back-to-back capture completes; LOS: `APSMetadata::copyMetadata+60` SIGSEGV (UAF) |
| Display/EDR caps | `sf_pre.txt` / `sf_post.txt` | OOS SF advertises HLG/PQ + clamps desiredHdrSdrRatio; LOS AOSP SF may not → over-exposure |
| OEM binder txns + ExtImpl | **`../r4-oem-transact/` kit** (own runbook) | txns 10000–10022 answered + `CameraServiceExtImpl` Depth-2 hooks fire (OOS) vs `UNKNOWN_TRANSACTION` silent-drop + `libcsextimpl` absent (LOS). Run `r4-oem-transact/30_run_r4.sh` both sides → `parse_r4.py`. doc-48; includes the 8K `beforeConfigureStreamsLocked` StreamSet test |
| **Gralloc P010 lifecycle** | **`../r3-gralloc/` kit** (own runbook) | OOS maps `libcamxexternalformatutils` in `com.oplus.camera` + no CamxFormatUtil fallback; LOS may not → wrong P010 layout. Run `r3-gralloc/30_run_r3.sh` both sides, then `parse_r3.py`. This is the dedicated A/B for the libapsfixup/getStub-flip root (doc-42 §2.5) |

## The /system instrumentability verdict (gate from 20_system_framework.sh)
After `00_enable_all.sh`, capture a cycle and check:
```sh
adb logcat -b all -s CameraService:V Camera3-Device:V Camera2-JNI:V Surface:V ImageReader_JNI:V
```
- **Lines present** → AOSP `log.tag.*` VERBOSE bridges the /system gap. Ship the runtime levers; no build needed.
- **Silent** → /system is zero-visibility-until-flash. Escalate to the recipe below.

## Debug-image recipe (fallback — only if runtime levers are silent)
Build an eng/instrumented /system for the two dark components, flash, then re-run this runbook:
1. **frameworks/av** (`services/camera/libcameraservice`): build `userdebug`/`eng`; raise the module log
   level (`ALOGV` compiled in — guard with `LOG_NDEBUG 0` at the top of `CameraService.cpp`,
   `Camera3Device.cpp`, `CameraDeviceClient.cpp`). cameraserver is a system-partition bin → full image flash,
   not an overlay push (per docs/PROBE-R1e-apptype-fix.md).
2. **frameworks/base** (ImageReader/HardwareBuffer/Surface JNI + `OplusEdrUtils` bridge `9d03af14`):
   `LOG_NDEBUG 0` in `android_media_ImageReader.cpp` + add ALOGV in the `getOplusHardwareBuffer` JNI path
   to confirm which native method the SDK actually calls.
3. Re-flash, re-run `00_enable_all.sh` + `ab_capture.sh`, diff against the stock dir.

> Keep instrumented images **lead-only** — do not commit them to the tree (same rule as the patched diagnostic blobs).
