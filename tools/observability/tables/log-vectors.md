<!-- Parent: ../../AGENTS.md -->

# Full-Stack Camera Log-Vector Map

Every camera log vector in the OnePlus OOS V16.1.0 (= 16.0.7.201, aarch64) stack, each with its
**tag/source**, the **gate/lever** that controls it, current **reachability**, and the **tool** to use.
This is the companion to `lever-index.md` (per-subsystem) and `logging-gap-register.md` (dark-spots):
this table is organized by **log vector** (a distinct logging system with its own independent gate),
because the big V16.1.0 correction is that the camera stack has **several independent log systems, each
with its own gate** — and the `camxoverridesettings.txt` log-mask keys are a **decoy** for the busiest
one (CamX-CORE).

RE source of truth:
- `docs/re-notes/camx-logmask-gate-FINDINGS.md` — the CamX-CORE gate root-cause (g_logInfo clobber chain).
- `docs/re-notes/camx-loginfo-layout-and-groups.md` — g_logInfo layout, CamxLogGroup enum, crash-free mask set.
- `docs/re-notes/camxcore-characterization-v16.1.0.md` — what CamX-CORE actually narrates (HDR/SHDR/cadence).

Reachability legend:
- **REACHABLE** — we can turn it on today and read it, proven live.
- **RISKY** — a lever exists but arming it can crash/self-kill the (marginal) HAL; conditional only.
- **BLIND** — the lines exist in the binary but we cannot read them safely (crash on enable).
- **UNDECODED** — output is captured but it is binary/opaque; no decoder yet.

---

## 1. The decoy you must not chase

`camxoverridesettings.txt` `logInfoMask` / `logVerboseMask` / `enableAsciiLogging` keys **do not** gate
the CamX-CORE tag at runtime. The parser reads them fine; they land in **StaticSettings**, which the
configure-time apply (`OverrideUpdateLogSettings`) copies into the **live** gate (`g_logInfo`) **only when
the `bVar4 & bVar6` populate branch runs** — and on a stock USER build it does not (see vector 1). So
overlaying the txt alone is necessary-but-not-sufficient: it must be paired with the two props that arm
the populate branch, **or** bypassed entirely by the frida `g_logInfo` lever. The patcher's old "#4"
(`OverrideLogSettingsAtConfigureFile` @ `libcamxsettingsmanager` file+0x151c4) writes the **decoy**
StaticSettings+0x28 (the empty OEM `OemOverrideLogSettings` provider) — retaa-ing it does nothing for the
CamX-CORE gate. It is **not** the CamX-CORE clobber; the real clobber is `OverrideUpdateLogSettings`.

---

## 2. Log-vector table

| # | Vector (tag / source) | Live gate / lever | Reachability | Tool |
|---|------------------------|-------------------|--------------|------|
| **V1** | **CamX-CORE** — `"CamX :"` (camxhal3 / camxsession / camxnode / configure_streams / `hdr_detected` reason / 8K `-38`) | GLOBAL `CamX::g_logInfo` (0x90-byte DebugLogInfo) in `libcamxcommonutils.so` .data @ +0x68010. Per-call gate: `((u64*)g_logInfo)[level_slot] & (1<<group)`; logcat only if `g_logInfo+0x80 (enableAsciiLogging)==1`. Clobbered to 0 on stock by `OverrideUpdateLogSettings` (else-branch). | **REACHABLE** (groups ex SENSOR/NCS — see V6) | **RUNTIME, no reboot, PROVEN:** `../../frida/enable_camx_logging.js` (writes g_logInfo: INFO=0x1f0fb7b8, CORECFG/CONFIG=0x1f0fb7b8, VERB=0x0e010200, +0x80=1, + Log::UpdateLogInfo onLeave re-assert). Read-only inspect: `../../frida/read_gloginfo.js`. Blunt all-open (crashes — see V6): `../../frida/write_gloginfo.js`. |
| **V1-durable** | CamX-CORE, no-frida path | Arm the populate branch: `bVar4`=`persist.vendor.camera.oplus.enableLogging=true` **AND** `bVar6`=`oplus.autotest.camera.debug.forcelog=1`, **plus** targeted masks (`logInfoMask=0x1f0fb7b8`, **NOT** 0x1FFFFF) in a readable `/vendor/etc/camera/camxoverridesettings.txt` (KSU magic-mount, `KERNELSU-MOUNT-NOTES.md`). Both props required. | **RISKY** — `forcelog` (bVar6) may also arm the APS alog disk path (V5 G7 self-kill). Prefer the frida g_logInfo lever, or find a different bVar6 input. | overlay via `../enable/10_vendor_camx_chi.sh` + props; mask set per `camx-loginfo-layout-and-groups.md` |
| **V2** | **CHI** — `"Chi :"` (chxextensionmodule / chxusecaseutils / pluginbase; `ConfigureHDRInformation`, `GetSHDRAutoExposureUsecase`) | Separate CHI log system. INFO flows with `setprop persist.vendor.camera.oplus.enableLogging=true` (defeats clobber #3 `OnPostModifySettings` "Disable all chi log"). Full mask survival also needs the #1/#2 retaa (`libextensionlayer OverrideChiLogSettingsAtConfigureFile`@0x4000c; `com.qti.chi.override ExtensionModule::ModifyLogSettings`@0x4ab6f8). | **REACHABLE** (INFO with enableLogging alone — proven; SHDR characterization came from here) | `../enable/10_vendor_camx_chi.sh` (overlay + prop) + host `../../patch_chi_logclobber.py` (#1/#2/#3) for full mask; frida alt `../../frida/unclobber_camx_logs.js` |
| **V3** | **OEM oemlayer OLog** — `camera.oemlayer.v2.so` Info/Verbose/Warning/Error (vendor-tag resolution, DefaultRequestSettings, ConfigureHDRInformation, InitPackageName) | Native int globals `OLog::g_enableLogInfo/Verbose/Warning/Error`. No setprop. | **REACHABLE** (FRIDA-ONLY) | `../../frida/enable_olog_oemlayer.js` (flips the globals, re-asserts every 1s) |
| **V4** | **/system framework** — AOSP `CameraService` / `Camera3-Device` / `Camera2-JNI` / `Surface` / `ImageReader_JNI` | AOSP `log.tag.<TAG> VERBOSE` (reverts on reboot). Pure AOSP /system, no oplus instrumentation. | **REACHABLE** (stock-side WORKS; LOS-side is the open dark-zone question — `logging-gap-register.md` G1) | `../enable/20_system_framework.sh` (sets log.tag.*, dumps SurfaceFlinger HDR caps, atrace/perfetto/lshal probe) |
| **V5** | **APS native alog** — `libAlgoProcess.so` (/odm) plaintext traces to `/data/vendor/cam_alog/` | `persist.sys.camera.lao.enable=true` + `oplus.autotest.camera.debug.forcelog` arm the alog disk path. | **RISKY / effectively BLIND** — **G7 SELF-KILL**: deferred-job disk I/O trips the camera2 device-error timeout → `ERROR_CAMERA_DEVICE` (onError 4/3) ~0.3s after open on the marginal HAL. **Do NOT arm on the marginal HAL.** | DO NOT use the disk path. Use frida native hooks (no disk I/O): `../../frida/probe_aec_getparam.js`, `probe_aec_hdrdetect.js`, `observe_getmetadata.js`, `probe_basictone.js`. `../enable/30_aps_native.sh` deliberately REPORTS-but-does-not-arm alog. |
| **V6** | **SENSOR (bit 1) + NCS (bit 23) groups** of CamX-CORE | Same g_logInfo gate as V1, but these two CamxLogGroup bits drive the SSC/QMI sensor-hub callbacks. | **BLIND — CRASH** | A buggy `%s` arg in `SSCQmiConnection::QmiConnect()::$_0` SIGSEGVs in `vfprintf ← OsUtils::FPrintF ← Log::LogSystem` once SENSOR/NCS `[VERB]` fires. **Never set bit 1 or bit 23 in `logVerboseMask`.** `enable_camx_logging.js` keeps bits 1/2/23 = 0 in every mask. No safe read today. |
| **V7** | **CamX-CORE binary / offline log** — `g_logInfo+0x84` (offline/binary flag) | `g_logInfo+0x84` (u32) selects binary/offline emission instead of ASCII logcat (`+0x80`). | **UNDECODED** — flag identified, output format not decoded; we leave +0x84 as-is and use ASCII (`+0x80=1`). | none; would need format RE (see "next probes") |
| **V8** | **/data/vendor/camera dumps** — `StripingLog_*`, `camera_config_dump.bin`, `graph_desc_*.txt` | On-device dump files emitted by CamX/CHI (graph_desc_*.txt is text; StripingLog_*/camera_config_dump.bin are binary). | graph_desc text = **REACHABLE**; StripingLog_*/camera_config_dump.bin = **UNDECODED** (binary) | `../enable/10_vendor_camx_chi.sh` regenerates graph_desc_*.txt; `../capture/ab_capture.sh` pulls `/data/vendor/camera/*.log`. Binary dumps have no decoder. |
| **V9** | **OCS SDK / app-side log** — `com.oplus.camera` (unit.sdk.jar): ALog / CameraUnitLog / ApsAdapterLog / IPULog / Logger (library load, vendor-tag init, session configure, `Util.isHdrOn`) | Java static gates (`sEnable`, `sbLogOn`, `sbTraceOn`, ...); some read `persist.sys.assert.panic` / `oplus.autotest.camera.debug.forcelog` at cold start (frida is the reliable force; `ALog.sEnable` is not prop-driven). | **REACHABLE** (app process; FRIDA-reliable) | `../../frida/enable_ocs_sdk_log.ts` (frida-compiled bundle; re-asserts every 1s). Cheap prop path: `persist.sys.assert.panic 1` + `oplus.autotest.camera.debug.forcelog 1` then cold restart. |
| **V10** | **post-shutter STATS detail** — `hdr_detected` / `couple_hdr_detected` / `qbc_hdr_detected` vendor-tag writes; `decMetaRefZeroToRemove` / `HandleProcessResultRequest` | CamX-CORE gate (V1) at finer groups/levels: `hdr_detected` writes are **STATS_AEC [VERB]** (bit 25, already in VERB_MASK); `decMetaRefZeroToRemove`/`HandleProcessResultRequest` are **CORE/SYNC VERBOSE or DUMP** level. | **REACHABLE** with caveat — fire mainly in the brief post-shutter window; add **SYNC (bit 13)** to VERB_MASK and **dwell longer post-shutter**. Watch volume. | `../../frida/enable_camx_logging.js` (add `G.SYNC` to VERB_MASK; never `G.SENSOR`/`G.NCS`) + a long post-shutter dwell capture |
| **V11** | **persist.sys.camera.log.scene gate** — scene-id mask override (ids 0xa004..0xa009) | A separate scene-id gate that **hard-overrides** the CamX masks from a table @ `libcamxsettingsmanager` file+0xb6890 (so it can fight V1's g_logInfo writes). | **UNUSED LEVER** — undecoded scene→mask table; not currently driven. Identified, not characterized. | none yet; decode the table @ file+0xb6890 to know which scene id yields which mask (see "next probes") |
| **V12** | **TurboHDR / arcsoft OEM-tag path** — `libTurboRaw` / `setProcessOtherParams` (Family III strlen-null) | OEM IPE TurboHDR vendor-tag publish; rides the same `camxoverridesettings` session-state class as V2/the no-JPEG root (attribution matrix #6). | **UNDECODED / inferred** — no dedicated log lever isolated; visibility is via the CHI/CamX-CORE narration (V1/V2) + native frida on the crash site. | trace via V1/V2 + native frida on `libTurboRaw`; on-device tag-publish verify (attribution-matrix.md #6) |
| **V13** | **QMI/SSC sensor-hub path** — `libQshSession` / SSC QMI (`camxncssscconnection.cpp`, `camxncsservice.cpp`, `camxncssessionconnection.cpp`) | Reachable only by enabling SENSOR/NCS (V6). | **BLIND — CRASH** (same `%s` SSC bug as V6) | none safe; the QMI/SSC narration is gated behind the crasher |

---

## 3. Cross-reference

- **g_logInfo layout + the crash-free mask set** (INFO 0x1f0fb7b8, VERB 0x0e010200, ex SENSOR/NCS/TRACKER):
  `docs/re-notes/camx-loginfo-layout-and-groups.md`.
- **Why CamX-CORE is silent on stock** (the `bVar4 & bVar6` clobber chain, the decoy):
  `docs/re-notes/camx-logmask-gate-FINDINGS.md`.
- **What CamX-CORE narrates when on** (operation_mode 0x8001, cameraHDRMode 1, numHDRExposure 1→2,
  previewHDR=1/captureHDR=0, 69.5 results/s): `docs/re-notes/camxcore-characterization-v16.1.0.md`.
- **Per-subsystem lever status** (WORKS/CLOBBERED/DARK/FRIDA-ONLY): `lever-index.md`.
- **Dark-spot register** (G1 /system, G7 APS self-defeat, ...): `logging-gap-register.md`.
- **Symptom→root attribution** (the -38, no-JPEG, freeze): `attribution-matrix.md`.
- **The clobber patcher** (#1/#2/#3 CHI = valid; #4 = decoy): `tools/patch_chi_logclobber.py`.
- **The finalized CamX-CORE lever — do NOT edit**: `tools/frida/enable_camx_logging.js`.
- **AEC `hdr_detected` rc=-2 RE** (`HDRDetectProcess` `*(aecCtx+0x48)`): `docs/rearch/45-aec-hdr-detect-publication-gate.md`.

---

## 4. Potential missing vectors / next probes

What we still cannot see, and how we might bridge it. Key framing fact: **g_logInfo proves CamX-CORE is
mask-gated, NOT compiled-out** — so an eng/userdebug image is **NOT required** to read the CamX core; the
production USER blob already contains every CAMX_LOG site. That removes "need an eng image" from the list
for V1/V10. The remaining blind spots are:

- **The SSC `%s`-bug blind spot (V6 / V13).** SENSOR (bit 1) + NCS (bit 23) — and therefore the entire
  QMI/SSC sensor-hub narration — are unreadable because enabling them SIGSEGVs in `vfprintf`. **Next
  probe:** frida-hook `SSCQmiConnection::QmiConnect()::$_0` (or `OsUtils::FPrintF`) to sanitize/skip the
  bad `%s` arg, *then* the SENSOR/NCS `[VERB]` lines become readable — i.e. fix the formatter, don't fix
  the gate. Until then these two vectors stay BLIND.

- **The binary/offline CamX log (V7, `g_logInfo+0x84`).** Identified flag, undecoded payload. **Next
  probe:** flip +0x84, capture the binary stream / `/data/vendor/camera/*.bin`, and RE the record format
  (likely a length-prefixed TLV of the same format args ASCII would print) — gives a lower-overhead,
  higher-rate trace than logcat ASCII if decoded.

- **Per-frame STATS detail (V10) volume vs. coverage.** STATS_AEC VERBOSE already on, but `hdr_detected`/
  `decMetaRefZeroToRemove` fire in a narrow post-shutter window. **Next probe:** add SYNC (bit 13) to
  VERB_MASK + a scripted long post-shutter dwell; if volume floods logd, prefer the binary log (V7) once
  decoded, or a native frida hook on the AEC publish site.

- **The scene-id mask gate (V11, `persist.sys.camera.log.scene`, ids 0xa004..0xa009).** An unused lever
  that can hard-override the masks from the table @ file+0xb6890. **Next probe:** decode that table to map
  each scene id → mask, to learn whether any scene id yields a useful targeted mask **without** the frida
  re-assert (a possible durable, no-frida path that sidesteps the `forcelog`/G7 tension).

- **The `/data/vendor/camera` binary dumps (V8 — `StripingLog_*`, `camera_config_dump.bin`).** Captured but
  opaque. **Next probe:** RE the dump headers (likely CamX `StripingInfo` / session-config structs); these
  may carry the exact 8K stream-config StreamSet that the `-38` path rejects, without needing live logs.

- **TurboHDR / arcsoft OEM-tag publish (V12).** No isolated log lever; visibility is indirect (V1/V2 +
  native frida). **Next probe:** native frida on `libTurboRaw setProcessOtherParams` + check whether the
  ROOT-A `camxoverridesettings` fix also publishes the TurboHDR tag (attribution-matrix.md #6).

- **The durable-path tension (flag for decision).** `oplus.autotest.camera.debug.forcelog` satisfies
  `bVar6` for the durable CamX-CORE path (V1-durable) **but** may also arm the APS alog disk path (V5 / G7
  self-kill). So the durable path should prefer a **different** `bVar6` input (one of the
  confidential/PRE-OTA gate components), **or** accept the frida `g_logInfo` lever (no props, no G7) as the
  standing answer. The frida lever (V1) currently dominates because it has no prop side-effects.
