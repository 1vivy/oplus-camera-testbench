<!-- Parent: ../../AGENTS.md -->

# Symptom → Root-Subsystem Attribution Matrix

**Governing rule:** a blob that is **byte-identical OOS↔LOS** yet behaves differently is the *crash/stall
site*, never the *root*. The root is in its **environment**, which spans two LOS-replaced layers:
**/system** (frameworks/av, frameworks/base, oplus-fwk stubs, display HAL, sepolicy) and
**/vendor-config** (`camxoverridesettings.txt`, session state). The "Divergence layer" column is the answer
to *"which subsystem do we actually fix"* — and it is almost never the blob the crash points at.

| # | Symptom | Proximate site (where it crashes/stalls) | Currently-attributed root | **Divergence layer (true)** | Comparability | Missing artifact / next probe | Verdict |
|---|---------|------------------------------------------|---------------------------|------------------------------|---------------|-------------------------------|---------|
| 1 | **Preview freeze** (app never renders after frame 1) | `libAlgoProcess.so` holds frame 1, never releases (`decMetaRefZeroToRemove` JNI upcall never made) | "native APS preview engine stall" | **OPEN** — env input gating the release; candidates: /system `getOplusHardwareBuffer` buffer path, or /vendor-config prop. **NOT** AEC-stats (force-test ruled out) | LOS-only (working v16 never captured) | frida `releaseBuffer`/`decMetaRefZeroToRemove` trace on a STABLE HAL + capture a working-state cycle | **ROOT B — OPEN**; blob is innocent |
| 2 | **No-JPEG / `hdr_detected` rc=-2 / no fusion graph** | AEC node never publishes `com.qti.stats_control.hdr_detected`; GCVT=0 | "CamX StaticSettings `selectSHDRAutoExposureUsecase`(+0x6a28)=0" | **/vendor-config** — `camxoverridesettings.txt` absent on LOS (blobs `libaecCustom`/`chi.override` md5-identical) | SYMMETRIC (rc=0 vs rc=-2 frida A/B) | ship `/vendor/etc/camera/camxoverridesettings.txt` `selectSHDRAutoExposureUsecase=1`; confirm +0x6a18 name via stock `dump_camxsettings.js` | **ROOT A — FIX KNOWN** (lever proven on-device) |
| 3 | **Over-exposure** in native HDR preview (~5×) | SurfaceView layer not tonemapped | "`OplusEdrUtils` stub no-op; `getBlastSurfaceControl()→null`" | **/system_ext** (oplus-camera-stubs jar) **+ /system display HAL** (HWComposer may not advertise HLG/PQ) | LOS-only | `dumpsys SurfaceFlinger \| grep hdrCapabilities` (in `obs_system_framework.txt`); confirm `setExtendedRangeBrightness` actually invoked | **CONFIRMED /system** — candidate fix unproven |
| 4 | **copyMetadata UAF** (back-to-back capture crash) | `APSMetadata::copyMetadata+60` SIGSEGV | "result `camera_metadata` freed before deferred job" | **/system frameworks/av** — AOSP cameraserver/`CameraMetadataNative` frees sooner than OnePlus contract the blob was built against | SYMMETRIC (tombstone + stock log completes) | provider/OCS result-lifetime ref hold; reproduce with `ab_capture.sh` rapid-fire | **CONFIRMED /system** — blob innocent |
| 5 | **P010 / IMapper@4.0 getService NULL** (Family I gralloc) | gralloc non-contiguous lock fallback | (old) "hwservicemanager removed A16" → **REFUTED** → (new) `getStandardMetadata(PLANE_LAYOUTS)` fails for camera proc | **/system sepolicy/namespace** — camera process can't reach AIDL allocator (mapper/allocator blobs md5-identical; OOS also NULLs IMapper@4.0) | NEITHER (blocked by freeze #1) | `getStandardMetadata` return value on LOS camera process; sepolicy domain audit | **INFERRED /system — BLOCKED**; apsfixup = interim defense |
| 6 | **strlen-null TurboHDR** (Family III) | `setProcessOtherParams(strlen(null))`@TurboRaw+0x5880 | "OEM IPE TurboHDR vendor tag never published" | **/vendor provider/CamX** OEM-tag publish (sibling of #2; likely same `camxoverridesettings` session-state class) | OOS-ish | on-device tag-publish verify; test whether ROOT-A fix also publishes it | **CORRECTLY /vendor** (not /system) |
| 7 | **getOplusHardwareBuffer → Infiniti NN OUTPUT ERROR → pool exhaustion** | SDK takes AOSP `getHardwareBuffer` fallback; NN errors; `ApsResult$ImageBuffer` never closed | "AOSP fallback buffer lacks OnePlus gralloc metadata" | **/system frameworks/base** — `nativeGetOplusHardwareBuffer` JNI absent on LOS (bridge added `9d03af14`, unproven) | LOS-only | confirm NN-error ↔ buffer-metadata link via instrumented JNI (debug-image recipe) | **CONFIRMED /system** — feeds freeze #1 |
| 8 | **8K video `configure_streams(0x80a9)` −38** | CamX feature2 graph: EISv2 node 2-in/0-out "pure bypass" → NULL pipeline descriptor | "EISv2 output port unbound — stabilized 7680×4320 stream absent/mis-typed" (doc-35 §A) | **RESOLVED (2026-06-24, on-device)**: NOT the Depth-2 hook. R4 `beforeConfigureStreamsLocked`/`getExtensionOperatingMode` fire **0×** on v2.1 (frida-armed) yet 8K records cleanly → root = /vendor Gralloc5 stream-usage / **OEM-layer dataspace** resolution (doc-35 cand-a). v1.4 LOS 8K stream diverged dataspace `0x10c60000` vs OOS `0x104` → `camera.oemlayer.healthmonitor` SIGABRT `ncsUnreleased 16` (NOT a configure error); resolved by v2.1. | LOS-only | `r4-oem-transact/` server hook + `../frida/hook_configure_streams.js` 8K-vs-4K stream diff | **RESOLVED** — Depth-2 candidate disproven on-device (R4 hooks 0×, 8K records). The `−38` is **stock-trace-only**; no LOS build returned −38. See `reference/campaign/_los-v21-notes/8K-R4-finding.md`. |

## Reading the matrix
- **Three rows are /system** (#3 #4 #7, plus #5 inferred) — exactly the user's hypothesis: the unknowns live in
  the LOS-replaced /system layer, not the consistent /vendor blobs.
- **Two rows are /vendor-config** (#2 #6) — the refinement: "not the blob" does **not** mean "always /system."
  A missing `/vendor/etc/camera/*.txt` is also environment, and is the cheapest class of fix.
- **Zero rows are the blob itself.** Every proximate crash site is a byte-identical blob; none is the root.
- **Comparability column** tells you what you can act on now: SYMMETRIC rows (#2 #4) are decision-ready;
  NEITHER/LOS-only rows (#1 #5 #7) are **blocked on the captures this folder is built to produce**.

## Convergence / separation (from trace)
- #1 (freeze, root B) and #2 (no-JPEG, root A) were once conflated; the on-device force-test **separated** them —
  forcing the StaticSettings fixed #2 (hdr_detected rc=0 + fusion) but the preview **still froze**. Distinct roots.
- #2 and #6 likely **converge** on one configure-time HDR-session-state lever (the override file).
- #5 was **re-attributed** within /system (hwservicemanager-removal → sepolicy/AIDL-access); same layer, different mechanism.
