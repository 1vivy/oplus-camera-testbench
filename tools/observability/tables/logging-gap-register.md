<!-- Parent: ../../AGENTS.md -->

# Logging-Gap Register (Dark-Spot Map)

Where we are blind, why, what it costs us, and the bridge. Ordered by how much each gap blocks the
current blockers (freeze #1, no-JPEG #2). "Bridge" = the concrete action to make it visible.

| Gap | Subsystem / layer | Why dark | What we cannot see | Missing artifact | Bridge |
|-----|-------------------|----------|--------------------|------------------|--------|
| **G1 — /system camera framework zero-visibility** | frameworks/av (cameraserver/libcameraservice) — **/system** | Pure AOSP, no oplus code, no setprop/override/frida lever; cameraserver is a system bin (overlay push impossible) | connect/configure_streams args, session lifecycle, where the request actually diverges from stock | a LOS cameraserver trace at all | `enable/20` `log.tag.* VERBOSE` probe → if silent, eng frameworks/av build (`LOG_NDEBUG 0`) + flash |
| **G2 — CHI snapshot reprocess graph on LOS** | CHI/feature2 — /vendor | 3-stage CHI clobber (#1/#2/#3); only #2 patched in past runs (#1/#3 still firing) | `MultiCameraReprocessRealtime`/`MCXSuperFG`/`OplusSATFusionOfflineReprocess` — the fusion graph stock logs 122k lines of | a fully-declobbered LOS snapshot CHI trace | `enable/10` + `patch_chi_logclobber.py` #1/#2 (+#3 via `enableLogging` prop) + reproduce. (CamX-CORE detail is a separate gate — frida `../frida/enable_camx_logging.js`; the old "#4" is a decoy.) |
| **G3 — stock StaticSettings dump** | CamX — /vendor | `dump_camxsettings.js` only ever run on LOS | the exact OOS values of `+0x6a28`/`+0x6a18` to name the override keys precisely | `camxsettingsdump.txt` from a STOCK unit | run `../frida/dump_camxsettings.js` on the OOS reference device (highest-ROI single probe) |
| **G4 — working-state preview delivery** | frameworks/base + APS — /system + /odm | the working v16 came from device-side pushes never captured as a thread dump | what a *non-frozen* `onImageAvailable`→GLThread→SurfaceView chain looks like (the baseline to diff the freeze against) | a working-state `ab_capture.sh` artifact | capture on a build/state where preview works (or stock) with `ab_capture.sh` |
| **G5 — OEM binder txns 10000–10022 + ExtImpl** | frameworks/av + `libcsextimpl` — /system | AOSP libcameraservice has no handler → `UNKNOWN_TRANSACTION` silently dropped; `libcsextimpl` absent (dropped `d654641`); SDK still sees `getService(media.camera)!=null` → believes channel live | Depth-1: which codes answered; Depth-2: whether `beforeConfigureStreamsLocked`/`getExtensionOperatingMode`/`processPreview` shape 8K/preview (OOS) vs no-op (LOS) | the **`r4-oem-transact/` kit** | **handler RESOLVED (doc-48)** = `CameraServiceExtImpl::onTransact` + 6 internal hooks (was "OPEN"); run `r4-oem-transact/30_run_r4.sh` both sides → `parse_r4.py` |
| **G6 — display/SF HDR caps + EDR path** | SurfaceFlinger/HWComposer/display HAL — /system | **RECLASSIFIED — EDR-invocation is FRIDA-reachable on stock, NOT dark.** Write-side proven (`trace_edr_invocation`: `setExtendedRangeBrightness`/`OplusEdrUtils.setEdr*`/native libgui `setEdr*` all hook; std program in plain logcat). Read-side confirmed (`docs/re-notes/edr-sf-readside-RE.md`: `setEDRStatus` clamp [1,5] file `0x2cc9b4`, `setEdrMetadata` 0x5C memcpy file `0x30755c`, `EdrLayerInfoReporter`). | OBSERVED on stock: panel advertises `supportedHdrTypes=SYSTEM`; `setExtendedRangeBrightness desiredRatio=5.0` (62×/run); `setEDRStatus scale 4.926→5.0`. **Still unobserved at WIRE:** the OEM `OplusEdrViewTransform` curve (slot/`transform[16]`) — app-side probe armed, 0 fire. | the OEM `setEdr*` curve wire values + the **LOS conviction A/B** (the latter eng-build-deferred) | `dumpsys SurfaceFlinger` + plain logcat capture the std EDR program on stock (no eng build); only the OEM curve memcpy + the LOS A/B remain. **EDR invocation is no longer a dark spot** — only its LOS conviction is deferred. |
| **G7 — APS verbose self-defeats** | libAlgoProcess — /odm | alog disk I/O trips ERROR_CAMERA_DEVICE on the marginal HAL | full APS decision trace at native verbosity | a stable-HAL alog OR exhaustive frida native coverage | stabilize HAL first (ROOT-A fix), then arm alog; meanwhile use `probe_aec_*`/`observe_getmetadata` |
| **G8 — long-exposure finalize / camAECGetParam** | APS + provider | designed-but-not-run probes; NEITHER side captured | the finalize handshake; whether `camAECGetParam` exports hdr_detected (algo) vs CamX drops it (publish) | both-side `probe_aec_getparam.js` runs | run the split-probe on LOS then OOS |

## Priority read
- **G1 is the strategic gap** — it is the /system layer the user flagged, and it gates root-cause confidence on
  #3/#4/#7 in the attribution matrix. `enable/20_system_framework.sh` is purpose-built to determine whether G1
  is bridgeable at runtime or needs a debug image. **Resolve G1's instrumentability question first.**
- **G3 is the cheapest high-value probe** — one frida run on the stock unit names the ROOT-A override key exactly.
- **G2 + G4** unblock the two live blockers (no-JPEG, freeze) once the captures exist.
- **G5** — off the *JPEG* path (PROBE-R1c), but **doc-48 re-scoped it**: the Depth-2 `beforeConfigureStreamsLocked` hook is a candidate upstream cause of the **8K** `-38` (doc-35 §A) and `processPreview`/`beforeMetadataSendToApp` are co-factors for the **freeze**/exposure → the `r4-oem-transact/` kit settles whether Depth-2 is load-bearing. **G8** remains off the critical path.
- **G6 is RECLASSIFIED, not dark** (2026-06-14) — EDR-invocation is FRIDA-reachable on stock: the std program
  (`setExtendedRangeBrightness` write + `setEDRStatus`/`EdrLayerInfoReporter` read) is in plain logcat, the OEM
  `OplusEdrUtils`/native `setEdr*` hooks arm cleanly, and the read-side is RE-confirmed
  (`docs/re-notes/edr-sf-readside-RE.md`). Only the OEM `OplusEdrViewTransform` curve WIRE values + the LOS
  conviction A/B remain (the latter eng-build-deferred). Do not list G6 as a runtime dark spot.
- **The lone TRUE runtime blind spot is SENSOR/NCS** — the SSC/QMI sensor-hub `[VERB]` groups (CamX `g_logInfo`
  bit1/bit23) SIGSEGV in `vfprintf` and stay EXCLUDED; there is no safe runtime lever. This is the only remaining
  zone with no instrumentation path (see `lever-index.md` Key facts).
