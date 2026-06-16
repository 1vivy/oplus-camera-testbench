<!-- Parent: ../../AGENTS.md -->

# Per-Subsystem Debug-Lever Index

Status legend: **WORKS** = lever fires today · **CLOBBERED** = lever exists but suppressed at default
(defeatable) · **DARK** = no lever exists on LOS yet · **FRIDA-ONLY** = only via runtime hook, no setprop.

| Subsystem | Partition | Status | Exact lever / mechanism | Default | How to enable |
|-----------|-----------|--------|-------------------------|---------|---------------|
| **CamX-CORE** (`"CamX :"` — camxhal3/camxsession/configure_streams/the -38 reason) | /vendor | CLOBBERED→fixable | LIVE gate = global `CamX::g_logInfo` (0x90-byte DebugLogInfo) in `libcamxcommonutils.so` .data @ +0x68010. (The `camxoverridesettings.txt` `logInfoMask`/`logVerboseMask`/`enableAsciiLogging` keys are a **DECOY** — StaticSettings only, NOT the live gate.) | zeroed at configure by `OverrideUpdateLogSettings` ELSE-branch on stock USER (NOT `OverrideLogSettingsAtConfigureFile`@0x151c4 — that is the decoy) | **frida `../frida/enable_camx_logging.js`** (preferred, crash-free, writes g_logInfo, no props) **or** durable bVar4+bVar6 props + targeted 0x1f0fb7b8 masks. NOT a `patch_chi_logclobber.py` target — its old "#4" is the decoy. |
| **CHI / feature2** (com.qti.chi.override) | /vendor | CLOBBERED→fixable | `chiLog*Mask` in override file; `ExtensionModule::ModifyLogSettings`@0x4ab6f8 clobbers | zeroed at configure | overlay masks + `setprop persist.vendor.camera.oplus.enableLogging true` (defeats #3) + host-patch #1/#2 for full graph detail |
| **OEM extensionlayer** (libextensionlayer) | /odm | CLOBBERED→fixable | clobbers #1 `OverrideChiLogSettingsAtConfigureFile`@0x4000c, #3 `OnPostModifySettings`@0x41a18 | zeroed | property (preferred) or `patch_chi_logclobber.py --extlayer-aggressive` |
| **OEM oemlayer** (camera.oemlayer.v2) | /odm | FRIDA-ONLY | `OLog::g_enableLogInfo/Verbose/Warning/Error` globals | off | `../frida/enable_olog_oemlayer.js` (re-asserts every 1s) |
| **APS / libAlgoProcess** | /odm | PARTIAL + caveat | `persist.sys.camera.private.log.enable=debug,pre,mp`; alog `oplus.autotest.camera.debug.forcelog`+`persist.sys.camera.lao.enable`→`/data/vendor/cam_alog/` | private.log set; alog off | `enable/30`; **alog SELF-KILLS marginal HAL** (I/O→ERROR_CAMERA_DEVICE, doc-43) → use frida native hooks (`probe_aec_*`,`observe_getmetadata`) |
| **gralloc / mapper** (libui, mapper.qti, libnativewindow) | /vendor | FRIDA-ONLY | `GraphicBufferMapper::getPlaneLayouts`, `AHardwareBuffer_lockPlanes`, `QtiMapper5::getMetadata` | — | `../frida/trace_p010_planes.js` (no setprop verbosity lever exists) |
| **HAL provider** (vendor.qti.camera.provider) | /vendor | WORKS | inherits CamX+CHI+OEM levers (same process) + `../frida/hook_configure_streams.js` | — | `enable/10` + frida |
| **app / OCS SDK** (com.oplus.camera + unit.sdk.jar) | /system_ext | WORKS | OCS SDK Java loggers; framework reflection trace | off | `../frida/enable_ocs_sdk_log.js`, `../frida/fwk_trace.js` |
| **frameworks/av** (cameraserver / libcameraservice) | **/system** | **DARK** | NO oplus instrumentation (grep -rci oplus = 0); pure AOSP; md5 ≠ stock | — | **probe** `log.tag.CameraService/Camera3-Device/Camera2-JNI VERBOSE` (`enable/20`); if silent → debug-image build+flash |
| **frameworks/base** (ImageReader/HardwareBuffer/Surface JNI, EDR) | **/system** | PARTIAL (EDR **FRIDA-reachable**) | Java layer hookable via frida; **EDR write-side now proven FRIDA-reachable on stock** — `setExtendedRangeBrightness`/`OplusEdrUtils.setEdr*`/native libgui `setEdr*` all hook + the std program is in plain logcat (`trace_edr_invocation`, libgui base resolved). Only the OEM-family WIRE VALUES (slot/`transform[16]`) are app-side-dark. | — | Java+EDR: `../frida/trace_edr_invocation.js` (FRIDA-reachable, no eng build), `trace_preview_delivery.js`, `probe_getoplushwbuffer.js`. Only the LOS **conviction** A/B is deferred to an eng build, not reachability. |
| **SurfaceFlinger / HWComposer / display HAL** | **/system** | PARTIAL (EDR read-side **FRIDA-reachable**) | `dumpsys SurfaceFlinger \| grep hdrCapabilities` (read-only) **PLUS** the EDR read-side is OBSERVED on stock: `HdrGeneric: setEDRStatus … scale:5.0`, `EdrLayerInfoReporter.onEdrLayerInfoChanged`, BLAST `desiredRatio=5.0` — all in plain logcat (read-side confirmed in `docs/re-notes/edr-sf-readside-RE.md`, `setEDRStatus` clamp [1,5] file `0x2cc9b4`). | — | `enable/20` + plain logcat capture the std EDR program; only the OEM `OplusEdrViewTransform` curve memcpy (file `0x30755c`) needs deeper visibility (eng SF build) — EDR-invocation is NOT DARK. |

## Key facts
- **3 CHI clobber appliers** (#1/#2/#3), three libs — fully documented in `../../tools/patch_chi_logclobber.py`
  header with offsets. Property `persist.vendor.camera.oplus.enableLogging=true` defeats #3 without a binary
  patch. The old "#4" (`OverrideLogSettingsAtConfigureFile`@0x151c4) is a **DECOY** (writes the non-gate
  StaticSettings+0x28) — retaa-ing it does nothing. The CamX `configure_streams -38` reason is a **CamX-CORE**
  ("CamX :") line gated by the global `g_logInfo`, read via frida `../frida/enable_camx_logging.js` (or the
  durable bVar4+bVar6 prop path) — NOT by any `patch_chi_logclobber.py` patch.
- The **/system trio** is now only PARTIALLY dark. **frameworks/av cameraserver** is the one /system layer that
  was genuinely lever-less, and even it is bridged on stock (G1 WORKS: `CameraServiceExtImpl.cpp` VERBOSE fires).
  **frameworks/base EDR + SurfaceFlinger EDR are NOT dark** — the EDR program (write-side `setExtendedRangeBrightness`
  + read-side `setEDRStatus`/`EdrLayerInfoReporter`) is FRIDA-reachable and visible in plain logcat on stock
  (`trace_edr_invocation`; `docs/re-notes/edr-sf-readside-RE.md`). Only the OEM `OplusEdrViewTransform` curve memcpy
  needs an eng SF build for full depth, and only the **LOS conviction A/B** is deferred — neither is a reachability gap.
- **The lone TRUE runtime blind spot is SENSOR/NCS** — the SSC/QMI sensor-hub `[VERB]` groups (CamX `g_logInfo`
  bit1 SENSOR / bit23 NCS) SIGSEGV in `vfprintf` and must stay EXCLUDED (`enable_camx_logging.js`); there is no
  safe runtime lever for them. Everything else (CamX-core, CHI, OEM layers, APS, gralloc, EDR write+read) is reachable.
