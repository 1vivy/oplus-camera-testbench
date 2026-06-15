<!-- STATUS: MIXED — inference-surgery applied 2026-06-14 (doc-50 method). Verified body =
     on-artifact OBSERVATIONS only (trace lines, smali offsets, log entries, file reads).
     All root/locus ATTRIBUTIONS, "most-likely", candidate-fix, and forward-plan claims moved to
     "Inferences & Open" below. Guard: a measured failure SITE is never a verified ROOT. -->

# 35 — Plumbing RE: 8K configure_streams −38, HDR preview (real path), Long-Exposure 5s hang

**Date:** 2026-06-09
**Scope:** Three plumbing-level OplusCamera issues on infiniti (SM8850) → LOS 23.2 (A16).
**Method:** Re-derived from sources read this session — decompiled `com.oplus.camera.unit.sdk.jar`
(baksmali → `/tmp/ocssmali`), `OplusCamera.apk` (baksmali → `/tmp/apksmali`), the declobbered
8K CamX/CHI trace (`docs/rearch/8k-configure-38-declobbered-trace.log`), stock dump
`/home/vivy/op15-work/dump201_full/`, stock `live_capture.log`, and the LOS device tree
`device/oneplus/{infiniti,sm8850-common}`. Prior docs 27/29 treated as hypotheses and re-checked.
**FACT** = I read the artifact; **HYPOTHESIS** = inference not yet device-proven.

---

## ISSUE A — 8K video `configure_streams(0x80a9)` → −38

## VERIFIED — on-artifact observations (read this session)

- **FACT** — The −38 is logged in `8k-configure-38-declobbered-trace.log`. The exact chain (lines cited):
  - L1–2: `configure_streams() Begin CONFIG ... cameraId: 2 ... operation_mode: 0x80a9`.
  - L10–22 `streamclassifier.cpp`: the 8K stream-set is recognized — preview 1920×1080 (fmt 35),
    **video 7680×4320 (fmt 0x22/HAL_PIXEL_FORMAT_IMPLEMENTATION_DEFINED, usage 0x10010300)**,
    YUV snapshot 7680×4320 (fmt 0x23), two 480×270 VideoASD streams.
    `"current video is 8k stream"` is logged → 8K path entered, not rejected at classification.
  - L23–29: `InitModeDescriptor() check CaptureMode: 0x80a9` → `NeedVideoEis:1 Feature2EIS:1` →
    `EISV2 ON`. EIS is enabled for the 8K op_mode (driven by `[EISTypeMatching] Mode[4]=0x80A9`).
  - L479: `Pipeline[OplusOfflineReprocess0] ... numInputs=4, numOutputs=3` created.
  - **L498 (logged):** `camxchinodesstabrealt.cpp:779 EISV2NodeQueryBufferInfo() EISv2 is a
    pure bypass, num inputs should be equalt to num outputs`.
  - L502–507: `chxpipeline.cpp:602 ... NULL pipeline handle` → `chifeature2base.cpp:15188
    CreatePipeline() RealtimePostProcessor ... OplusOfflineReprocess descriptor failed!` →
    `chifeature2graphmanager Init Error 1` → `chxmulticamerabase CreateFeatureGraphManager
    Failed`. That propagates up as `INTERNAL_ERROR / −38` from `configure_streams`. (Traced.)
- **FACT** — `InitPackageName() no find vendor tags com.oplus.packageName` IS logged at the 8K
  configure (trace L4), i.e. the identity gate `com.oplus.packageName` is NOT set on this session.
  But the still-capture path produces the same log line and now captures fine, and per doc-27 §(e)
  `VideoMode.useOplusCameraCase()` returns true for the system camera so `IS_OPLUS_PACKAGE` is
  stamped regardless → see Ruled Out.
- **FACT** — `chxextensionmodule.cpp:12455 ConfigureHDRInformation() ... Set HDR mode =1
  numHDRExposure to:2` fires for the 8K session (trace L32) — the session is built as a 2-exposure
  SHDR multicam usecase, and the graph wires HDR + EIS + VSR + Zoom100x features (L34–69). (Logged.)
- **FACT** — doc-27 §g.2 frida port-dump (overlay-free): `numInputPorts=2 numOutputPorts=0` for the
  EISv2 node, backtrace `ProcessingNodeFinalizeInputRequirement`. (Measured.)

### Ruled OUT this session (each with artifact evidence)

- **REFUTED — identity gate (`IS_OPLUS_PACKAGE`) is NOT the 8K cause.** Doc-27 §(b) Candidate-1
  was self-refuted in §(e): `VideoMode.useOplusCameraCase` → true for `com.oplus.camera`, so the
  patched BaseMode stamp runs for 8K. The trace confirms the failure is downstream at EISv2
  port-count, not at pipeline *selection* (`OplusOfflineReprocess0` IS selected and starts to build).
- **REFUTED — missing static config / blob / sensor-mode-32 table.** Doc-27 §(e)/§(f)/§(g)
  established (and the trace agrees) that `CameraHWConfiguration.config`, the `infinitimain`
  sensor-module bins, `eis_camera.vcfg`, `OplusOfflineReprocess.json`, and the feature2/EIS topology
  libs are byte-identical LOS↔stock. The trace shows sensor modes enumerate for cameraId 2 and the
  8K usecase is recognized — so no missing-mode/missing-entry.
- **REFUTED — `aecbhist:stats` GetVendorTagId failures** are benign (consumed soft-optionally by
  `com.oplus.node.videomlft.so`; present + identical on LOS).

### Evidence Index (Issue A)

| Primary source | What it shows |
|---|---|
| `8k-configure-38-declobbered-trace.log` L498 | `EISv2NodeQueryBufferInfo() EISv2 is a pure bypass, num inputs should be equalt to num outputs` |
| same trace L502–507 | NULL pipeline handle → `OplusOfflineReprocess descriptor failed` → `−38` |
| doc-27 §g.2 frida port-dump | `numInputPorts=2 numOutputPorts=0` on the EISv2 node |

---

## ISSUE B — HDR preview (the real OOS display path, not the prop-SDR mask)

## VERIFIED — on-artifact observations (read this session)

- **FACT (current state, doc-29):** preview HDR is masked off via
  `persist.camera.override_enable=true` + `persist.camera.override_preview_hdr_support=false`,
  which forces the OCS PreviewHDRControl capability `com.oplus.camera.preview.hdr.support` to
  false → the preview SurfaceView stays sRGB (`numHdrLayers 1→0`) → matches the JPEG. (Read from
  doc-29 and code.)
- **FACT** — The capability gate `com.oplus.camera.preview.hdr.support` is read in the apk at
  `com/oplus/camera/common/gl/o.smali` (L1700, L9472) and `l8/p.smali`
  (`com.oplus.preview.hdr.support`), via `CameraConfig.b(String,Z)`. When true, the OCS sets the
  preview surface to **BT2020_HLG** and requests a **5.0 HDR/SDR headroom**
  (`SurfaceView.setDesiredHdrHeadroom`), per doc-29. (Code-traced in smali.)
- **FACT** — `SurfaceView.setDesiredHdrHeadroom` / `nativeSetDesiredHdrHeadroom` ARE present in
  AOSP `system/framework/framework.jar` (Android 14+ API). (Verified in framework.)
- **FACT (DECISIVE) — the OOS `system/bin/surfaceflinger` binary is OnePlus-modified.**
  `strings system/bin/surfaceflinger` shows it references/registers
  `aidl::vendor::oplus::hardware::displaycolorfeature::IDisplayColorFeature` and links
  `android::OplusLooper`. A scan of all OOS `*/bin/*` for the `IDisplayColorFeature/default`
  provider returned exactly `system/bin/surfaceflinger` (and the `displaycolorfeature_test`
  harness). (String-scanned from `dump201_full/system/bin/surfaceflinger`.)
- **FACT** — The display-feature HAL stack ships on BOTH: LOS `proprietary-files.txt` pulls
  `vendor.oplus.hardware.displaypanelfeature-service`, `libPanelChaplin.so`, the pixelworks
  display/feature HALs (`vendor.pixelworks.hardware.display-V3-ndk` etc.), `libgpu_tonemapper.so`,
  and the `manifest_displaycolorfeature_aidl.xml` VINTF entry. Props are also set on LOS:
  `ro.surface_flinger.has_HDR_display=true`, `use_color_management=true`,
  `wcg_composition_dataspace=143261696`. (Read from proprietary-files.txt and props.)
- **FACT** — LOS does **NOT** pull OOS `system/bin/surfaceflinger` (grep of both
  proprietary-files.txt = no surfaceflinger entry; device tree has only SF *overlay* config XMLs).
  LOS builds AOSP SurfaceFlinger. (Verified by grep.)

### Ruled Out (artifact evidence)

- **REFUTED — "LOS lacks the display HDR HALs/libs."** It ships them (pixelworks,
  displaypanelfeature service, tonemapper). The libs/HALs are present.
- **REFUTED — "missing framework SurfaceView HDR API."** `setDesiredHdrHeadroom` is in AOSP A16.

### Evidence Index (Issue B)

| Primary source | What it shows |
|---|---|
| `dump201_full/system/bin/surfaceflinger` strings | `IDisplayColorFeature`, `OplusLooper` present |
| LOS `proprietary-files.txt` | no surfaceflinger; ships displaypanelfeature-service + pixelworks |
| `framework.jar` | `setDesiredHdrHeadroom` present |
| apk `gl/o.smali`, `l8/p.smali` | `hdr.support` gate L1700, L9472 |
| `manifest_displaycolorfeature_aidl.xml` | VINTF entry present on LOS |

---

## ISSUE C — Long Exposure 5-second hang (no prior doc; first RE this session)

## VERIFIED — on-artifact observations (read this session)

- **FACT** — The mode class is `com/oplus/ocs/camera/producer/mode/LongExposureMode.smali` in the
  OCS SDK jar (`getModeName()="long_exposure_mode"`, `getSurfaceUseCase()="long_exposure_case"`,
  `getCaptureFormat()=0x20` = RAW_SENSOR/RAW10). It extends `BaseMode`. (Baksmali-read.)
- **FACT — the capture is a REPEATING accumulation, not a single shot.** In
  `LongExposureMode.createRequestTag` at the `before_take_picture` stage (L137–158) it sets on the
  `CameraRequestTag`: `mbLongExposureCaptureEnable=true`, **`mbRepeatingRequestCapture=true`**,
  `mRequestNum=1`, `mbRaw2yuvEnable=true`, `mbRectifyEnable=true`. `updateStageParameter`
  (L684–765) additionally locks AE/AWB/AF (`CONTROL_AE_LOCK/AWB_LOCK=true`, `AF_MODE=1`,
  `CONTROL_MODE=1`) for the exposure window. (Code-traced in smali.)
- **FACT — the native APS engine accumulates frames and only finalizes on a "last frame" flag.**
  In `ApsProcessor.smali` (L11468–11518), when `mbLongExposureCaptureEnable && requestMode==CAPTURE_RAW`:
  - while `mbRepeatingRequestCapture==true` it keeps setting
    `KEY_IS_LONG_EXPOSURE_CAPTURE_ENABLE=true` on each per-frame `MetaItemInfo` (L11512–11518).
  - when `mbRepeatingRequestCapture` flips false (L11487 `if-nez ... :cond_748`), it flips
    `mbLongExposureCaptureEnable=false` AND sets **`KEY_IS_CAPTURE_LAST_FRAME=true`** (L11490–11499).
    `KEY_IS_CAPTURE_LAST_FRAME` is the finalize signal to the native accumulator. (Code-traced.)
- **FACT — the finalize/last-frame transition is driven by the NEXT `startPreview`.** In
  `ProducerImpl.startPreview` (L5723–5742): after the new `startPreview` call it sets
  `mCurrentCaptureRequestTag.mbRepeatingRequestCapture=false` (L5729) and
  `mCurrentPreviewRequestTag.mbLongExposureCaptureEnable=false` (L5738). (Code-traced in smali.)
- **FACT — the result image is HELD until timestamp-matched, gated on the last-frame flag.** In
  `ApsPreviewAdapterImpl.checkNeedMatchTimeStamp` (L1362–1479): when the current meta-item has
  `KEY_IS_LONG_EXPOSURE_CAPTURE_ENABLE==true` AND `KEY_IS_CAPTURE_LAST_FRAME==false`, it logs
  `"checkNeedMatchTimeStamp, longExposure is capturing, need match timeStamp"` and **returns
  false** (L1444–1473) — the accumulated result is NOT yet delivered. It only returns true (deliver)
  once the last-frame flag is set or the meta-item has an image buffer. (Code-traced.)
- **FACT (stock context, from `live_capture.log`):** stock runs the repeating-request capture path
  (`camera_device_session.cpp repeatingRequestEnd: frameNumber:N ... hdrProfile:1`, L22901+) and
  `APS_CORE` shows `gAPSOps.pfnAPSMemHWAcquire is NULL` + `getMetadata res: -2` even on **stock**
  (L24122+) — so those specific APS_CORE NULL/`-2` lines are **benign** (stock works). (Read from
  stock log.)
- **FACT (stock)** — The ApsService FGS "broken notification (no icon)" warning is also present on
  stock (L21710) → benign. (Read from stock log.)

### Ruled Out (artifact evidence)

- **REFUTED (as fatal) — `getMetadata res: -2` / `pfnAPSMemHWAcquire is NULL` APS_CORE errors.**
  Present on stock too; not the long-exposure blocker by themselves.

### Evidence Index (Issue C)

| Primary source | What it shows |
|---|---|
| OCS `LongExposureMode.smali` L137–158, L684–765 | repeating-request setup, AE/AWB/AF lock |
| `ApsProcessor.smali` L11468–11518 | last-frame flag (`KEY_IS_CAPTURE_LAST_FRAME`) write path |
| `ProducerImpl.smali` L5723–5742 | `mbRepeatingRequestCapture→false` on stopping startPreview |
| `ApsPreviewAdapterImpl.smali` L1362–1479 | `checkNeedMatchTimeStamp` returns false while capturing |
| stock `live_capture.log` L24122+ | `pfnAPSMemHWAcquire is NULL` / `getMetadata res: -2` present and benign |

---

## Inferences & Open (UNVERIFIED — heavy-check)

> Per the interop-tree trunk axiom, a measured failure SITE is never a verified ROOT. The items
> below are root attributions, locus claims, candidate fixes, and forward plans — NOT verified until
> on-device A/B proves the propagation-contract break.

### Issue A — 8K −38

- **ATTRIBUTION (unproven): "the root is runtime stream→port resolution."** The EISv2 node reports
  `numInputPorts=2 numOutputPorts=0`, which triggers "pure bypass" and NULL pipeline handle. Every
  static topology input is byte-identical to stock, so the framing is that the divergence is
  **runtime**: the stabilized-video OUTPUT stream that the EISv2 output port should bind to is absent
  or mis-typed on LOS. But this is an inference from static evidence. Not proven.
- **HYPOTHESIS:** stock binds the EISv2 stabilized output to the 7680×4320 video output stream; on
  LOS the graph-builder fails to map an output port to it. Candidate causes: the A16 Gralloc5
  allocator-shim changing how the 8K video buffer's usage/format resolves for the EIS output sink;
  or a runtime EIS-control metadata not populated (consistent with the project's recurring "system
  camera not fully first-partied → metadata not populated" pattern). 4K video works because its EIS
  graph resolves a matching output port; only the 8K `Super_EIS_8K` / `UHD8K30FPSPOSTPROC` topology
  exposes the 0-output condition. (All inference.)
- **CANDIDATE FIX LOCUS (unproven):** the feature2 graph stream→port mapping for the 8K
  `OplusOfflineReprocess` usecase, NOT a static config flag. EIS-disable was proven invalid
  (doc-27 §g.1: changing `[EISTypeMatching] Mode[4]` to 0xFFFF SIGSEGVs `configure_streams` at
  NULL+0x44 — the graph forces the 8K EIS node regardless of the enable flag).
- **CANDIDATE FIX LOCUS (app-side, unproven):** `OCS VideoMode` 8K stream setup — what
  `camera3_stream` list the OCS app hands to `configure_streams(0x80a9)`. If the video output
  stream's format/usage/dataspace on LOS differs from stock, the EISv2 output port won't bind.
- **WORKAROUND-B (not baseline):** drop the 7680×4320 EncoderProfile / VideoEncoderCap from the
  active media_profiles so the picker never offers 8K. Files: `vendor/etc/media_profiles_canoe_v2.xml`
  + `odm/etc/camera/media_profiles.xml`. (`AllowOplusHealthMoniterAbort=FALSE` in
  `CameraHWConfiguration.config` separately silences the downstream `ncsUnreleased 16` watchdog
  SIGABRT, but does not fix 8K.) — Not proven to be the correct approach.
- **NEXT-SESSION PROBE (forward):** `tools/frida/hook_configure_streams.js` (doc-27 §g.2, queued):
  overlay-free dump of the `camera3_stream_configuration` at `OCamera3Dev::configure_streams` for
  **8K vs a working 4K** session — num_streams + each stream `type/WxH/format/usage/dataspace`. The
  diff names the missing/mis-typed 7680×4320 video OUTPUT stream. DECISIVE complement: a stock
  declobbered 8K trace — if stock ALSO logs "pure bypass" but succeeds, the gap is the LOS graph
  wiring; if stock does not bypass, the EISv2 active path is missing a runtime input on LOS.

### Issue B — HDR preview over-exposure

- **ATTRIBUTION (unproven): "the over-exposure root is the OnePlus SurfaceFlinger HDR path."**
  The OOS SF is the `IDisplayColorFeature` provider + uses `OplusLooper`; AOSP SF on LOS has no
  equivalent OnePlus HLG→panel tonemap / panel-HDR-mode trigger. The inference is that AOSP SF
  composites the BT2020_HLG layer with a 5.0 desired headroom but never triggers the panel's HDR
  brightness/EOTF mode → panel shows ~5× over-bright. This is an attribution, not a proven root.
- **OPEN HYPOTHESIS:** whether the `displaycolorfeature` AIDL HAL, declared in VINTF but whose
  registering process on OOS is the modified SurfaceFlinger, is left *declared-but-unregistered* on
  LOS (AOSP SF won't register it). The `manifest_displaycolorfeature_aidl.xml` exists on LOS but the
  AOSP SF provides no `IDisplayColorFeature` impl. (Unverified.)
- **CANDIDATE FIX APPROACHES (all unproven):**
  - *Low-effort / pragmatic (current):* keep the SDR mask (doc-29 props). HDR preview off, correct
    exposure. This is the shipping state.
  - *Medium:* confirm whether the `displaypanelfeature-service` (which LOS *does* ship) exposes a
    panel-HDR-mode entry that can be poked from an AOSP-SF HWComposer hook or a small native shim.
    Needs RE of `vendor.oplus.hardware.displaypanelfeature-service` + `libPanelChaplin.so`.
  - *High / true OOS-baseline:* port the OnePlus SurfaceFlinger HDR composition delta onto the
    LOS AOSP SF (the `IDisplayColorFeature` integration + headroom→panel mapping). Large,
    display-team-scale.
- **NEXT-SESSION PROBES (forward):**
  1. `dumpsys SurfaceFlinger | grep -i hdr` + `lshal | grep displaycolorfeature` on LOS with the
     mask disabled and HDR preview on: confirm `IDisplayColorFeature/default` is unregistered and
     `numHdrLayers(1) desiredRatio(5.00)` composited without panel HDR-mode transition.
  2. RE `vendor.oplus.hardware.displaypanelfeature-service` for an HDR-mode/headroom setter that
     could be driven without OnePlus SF — determines whether the Medium path is viable.

### Issue C — Long Exposure hang

- **ATTRIBUTION (unproven): "native APS accumulation never finalizes."** Plausible from the
  structural contract above — three concrete places the finalize can stall — but not directly
  observed in a LOS long-exposure log this session.
- **CANDIDATE ROOT ORDER (unproven, ordered by likelihood):**
  1. **(MOST LIKELY) The last-frame stop signal never reaches the accumulator.** Finalization
     requires `mbRepeatingRequestCapture→false` via the stopping `ProducerImpl.startPreview`
     (L5729) producing `KEY_IS_CAPTURE_LAST_FRAME=true`. If on LOS the long-exposure stop/timer
     path does not drive that `startPreview` transition, the engine sits in "longExposure is
     capturing, need match timeStamp" → ~5s hang. This is a Java/OCS state-machine stall inference.
  2. **Timestamp-match starvation.** `checkNeedMatchTimeStamp` also requires
     `KEY_PREVIEW_STREAM_NUMBER == mImageItemList.size()` (L1376–1395) before it will match. If the
     preview-stream-number metadata is not populated on LOS, the held result never matches.
  3. **Native accumulation-finalize.** Only if 1 and 2 are clean does the native `libAlgoProcess`
     APS accumulator itself fail to emit the finalized buffer after the last-frame flag.
- **UNVERIFIED — buffer-exhaustion.** No evidence either way from sources read.
- **NEXT-SESSION PROBE (forward):** Frida-hook three Java points: (a) `ApsProcessor` where
  `KEY_IS_CAPTURE_LAST_FRAME` is set — does it EVER fire on LOS? (b) `ApsPreviewAdapterImpl.
  checkNeedMatchTimeStamp` — log `KEY_PREVIEW_STREAM_NUMBER` vs `mImageItemList.size()` and the
  `IS_CAPTURE_LAST_FRAME`/`IS_LONG_EXPOSURE_CAPTURE_ENABLE` values each call. (c)
  `ProducerImpl.startPreview` — does the stopping call with `mbRepeatingRequestCapture=false` ever
  run? Capture `logcat -s LongExposureMode ApsProcessor APS_CORE ApsAdapterLog` across one attempt.
