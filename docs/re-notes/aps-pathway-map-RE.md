<!-- STATUS: static RE (3-lane deep-dive, 2026-06-17, .300 dump on build server). The exhaustive map of every
     pathway APS touches a gralloc handle + the APS↔system handover, built as a RULE-OUT checklist for the
     P010-fusion geometry bug hunt. Pairs with p010-dmabuf-environment-RE.md (libAlgoProcess = pure consumer). -->
# APS gralloc-handle pathway map + the APS↔system handover (P010 fusion bug-hunt rule-out checklist)

## The handover — where the buffer + geometry cross OEM→APS (the load-bearing boundary)
`oplus_aps_addFrameBuff` (`my_product/lib64/libAPSClient-jni.so`, exported) is THE handover. Geometry crosses
it via TWO channels that must agree:
1. **STRING channel** — `buffer_input_width/height/stride/scanline` (decimal strings → `std::stoi`), supplied by
   the **Java OCS SDK** `com.oplus.ocs.camera.consumer.apsAdapter.APSClient`. Injected via `oplus_aps_setParameters`.
2. **LOCK channel** — the `HardwareBuffer` Java object (`hardwarebufferobj`) → `AHardwareBuffer_fromHardwareBuffer`
   → `gAPSOps.pfnAPSBufLckPlanes` (`camApsBufferLockPlanes`) locks the handle's actual planes into `ApsBufferPlanes`.
A `MIN(relayed, locked)` reconcile is plausible (Lane A decompile) but the specific `0x7fa30c0a` format-gate line
is UNVERIFIED (`0x7fa30c0a` absent from `libAPSClient-jni.so` byte-search — treat as decompiler noise). What's
SOLID: the string channel keys, the `_fromHardwareBuffer`-only NDK surface (no `_describe`/`_lockPlanes` in the
JNI layer), and the `pfnAPSBufLckPlanes` delegation into libAlgoProcess.
The return path: `gAPSOps.pfnAPSGetHoldImage/Buffers` + `oplus_aps_exchangeBuffer` → `jni_reply_hardwarebuffer_ptr`
→ Java `ApsResult$ImageBuffer`.

## Byte-identity verdict (so the divergence is INPUTS, not code)
`.text` sha256 IDENTICAL OOS↔LOS: `camera.qcom.core.so`, `com.qti.chi.override.so`, `camera.oemlayer.v2.so`,
`libAlgoProcess.so`, `libAlgoInterface.so`, `libAPSClient-jni/-cmd-jni`, `libAPSClient-cmd-jni-extension.oplus`
(same BuildId, 0 `.text` deltas), `libcamerabuffer.so`, gralloc/mapper. Whole-file size diffs = strip/packaging
only. ONLY from-source: `libcameraservice` (cameraserver) — and it does NO geometry/usage/dataspace mutation
(stock static casts; `overrideDataSpace` is HAL-driven inside the identical blob; sole OEM lever = the
`CAMERA_PACKAGE_NAME` identity stamp). ⇒ The wrong P010 scanline is a runtime VALUE selected by identity/op_mode
inside identical code, or supplied wrong by the Java OCS SDK — not a binary diff.

## Producer chain (geometry is BORN-CORRECT at allocation, not stamped)
CHI feature2 owns the fusion output port: `ChiFeature2Base::InitBokehSatStream(ChiStream*)` (com.qti.chi.override),
`ChiMcxStaticPolicy`/`SATMasterRequirement`/`ChiSATInstantZoomInfo`, P010 stream descs (`DualYUV420P010MCXStreamDesc`,
`P010StillCaptureStreamDesc`). → `Spectra::BufferAllocatorBuilder::BuildCameraBuffer` (`libcamerabuffer.so` @0xec00,
`SetUsageFlags`@0xe580) allocates from {format=0x7FA30C0A, 1280×960, usage=0x20003} — NO scanline arg. → gralloc
lays out PLANE_LAYOUTS; geometry READ-BACK via `mapper::GetStandardMetadata<1/3/10>`. Camera writes only COLOR
metadata (`SetBufferColorMetaData`), NEVER plane layout (grep for PLANE_LAYOUTS write = empty). P010 stride/scanline
math authority = `libcamxexternalformatutils.so` `CamxFormatUtil_{GetScanline,GetStrideInBytes,GetPlaneOffset}`.

## PATHWAY MAP — rule-out checklist (hook by mangled name; file_off = Ghidra−0x100000)
### (A) buffer IMPORT
- A1 `camApsBufferDesc` (libAlgoProcess 0x1ca8ec): describe→format-switch (0x36/0x7FA30C0A→contiguous; 0x20→chroma
  ZEROED→QCOM branch). **PROVEN DORMANT (0×/capture on golden).** Hook → count==0 confirms dead.
- A2 `camApsBufferLockPlanes` (0x1c96f8): locks planes; **returns descriptor=0x0 both sides** — lock fires, VA NULL.
- A3 `camApsBufferGetYCbCrPlaneLayout` (0x1cd054)→`APSGrallocUtils::getPlaneLayout` (0x12127c): QTI PLANE_LAYOUTS.
  **PROVEN DORMANT** (useMetadata gate off, 0× both).
- A4 `camApsBufferFromWindow` (0x1cb00c)/`camApsWindowConnect` (0x1cc088): Surface-dequeue import = **PREVIEW path**.
  RULE-OUT: 0× during a still capture ⇒ window-import not the photo path.
- A5 `camApsMemHardwareAllocate` (0x1cd168)→`APSMemTrace::HardwareBuff::allocate`: APS-internal scratch AHBs. UNTESTED.
  **The result-METADATA sibling: `gAPSOps.pfnAPSMemHW{Acquire,Release}` are NULL in the app/OCS-SDK consumer process on
  LOS (`ApsTotalResult_build/destroyMetadataBufferPtr`, `getMetaValue` res −2) — see `aps-metadata-buffer-init-RE.md`.**
- A6 `camApsAllocION` (0x1c7b34)/`APSRefFrameSelector::enableDmaBufferPool` (0x3ac67c): ION RefFrame DMA pool.
  **UNTESTED, candidate** — ref-frame geometry set here for turbo/hybrid-raw fusion.
### (B) geometry QUERY
- **B1 `getImageBufferDesc` (0x2599b0): THE LIVE READER** — `memcpy`s a PRE-BAKED ApsBufferDesc (0x15 qwords incl
  chroma off/scanline) from `AlgoProcessData[0x1e6]+idx*0x18`. Geometry already baked upstream. **#1 PROBE: dump
  param_2 desc OOS vs LOS.**
- B2 `updateToRealBufSize` (0x25a130): overrides desc+0xc/+0x10 from `APSParamsHolder::get` string keys (0x1b0e0c,
  0x1c70dd). **LIVE** — if keys differ OOS↔LOS, geometry diverges here.
- B3 `getMetaData`/`setMetaData` (libqdMetaData): RAW/NV12 branch only. RULE-OUT: 0× for the fusion handle.
- B4 `APSRefFrameSelector::hybridrawGetHardwareBufferInfo` (0x3c4a30): hybrid-raw ref geometry. UNTESTED (mode-specific).
### (C) geometry TRANSFORM (consumer-side; read geometry from ApsBufferPlanes — symptom, not source)
- C1 `rotateMirror` (0x4473f0); C2 `p010LSB2MSB/Neon` (0x431ee8/0x4fc25c, **takes (w,h,stride,scanline) as args** —
  garbage scanline → over-read = the crash); C3 `a2b10g10r10ToP010`; C4 `scaleBuffer`/`doYuvCrop`; C5 `covertMSB2LSB`.
### (D) HAND-OFF / OUTPUT
- **D1 `APSRefFrameSelector::prepareImage` (0x3c13ec): LIVE** — ApsBufferPlanes→ArcSoft ImageRef (wrap_arc site).
- **D2 `APSAlgoBase::prepareImage` (libAlgoInterface 0xbfd54c): LIVE** — desc→BasicTone Image, scanline→sliceHeight
  (the `scanline=4.09e9` crash input).
- D3 `camApsBufferToWindow` (0x1cbad0): Surface output = **PREVIEW**. RULE-OUT: 0× in still capture.
- **D4 offlinecamera AIDL `OfflineCameraClient::importBuffer(native_handle*)` + `IOfflineCameraService`
  (vendor.qti.hardware.camera.offlinecamera-V2-ndk): UNTESTED, HIGH PRIORITY** — likely the upstream channel that
  fills `AlgoProcessData[0x1e6]`. Hook in the APS service/client process.
- D5 osense (`vendor.oplus.hardware.osense.client`, `APSOsense::applyOsense`): perf/QoS hints — **NO buffer geometry;
  RULE OUT by inspection.**

## SUBSYSTEMS TO TRACK (beyond libAlgoProcess — the new leads)
1. **Java OCS SDK** `com.oplus.ocs.camera.consumer.apsAdapter.APSClient` — computes `buffer_input_scanline`/`stride`
   (the STRING channel). In `OplusCamera.apk` / `com.oplus.camera.unit.sdk*.jar` (DEX). **jadx-able WITHOUT a device.**
   THE #1 no-device next step: find where buffer_input_scanline is computed; verify it on the LOS port.
2. **CHI feature2 SAT/fusion node** `ChiFeature2Base::InitBokehSatStream` — requests the output buffer geometry.
3. **op_mode / identity gate** (cameraserver op_mode passthrough + `libcsextimpl` package whitelist) — selects the
   pipeline that determines output geometry; identity already stamped yet P010 still crashes (so not the whole story).
4. **offlinecamera AIDL** (D4) — the buffer handoff channel into the APS service.

## DECISIVE PROBES (rule-out order)
1. **Handover (device):** hook `libAPSClient-jni!oplus_aps_addFrameBuff` — dump BOTH channels: parsed
   `buffer_input_stride/scanline` (string) AND the `pfnAPSBufLckPlanes` ApsBufferPlanes (stride@0x24/scanline@0x28/
   chroma@0x48), OOS vs LOS. String wrong → Java OCS SDK is the producer; lock wrong → gralloc handle layout.
2. **Read-side (device):** `getImageBufferDesc` (B1) + `updateToRealBufSize` (B2) — dump the baked desc + the param
   keys. Already-garbage-on-arrival ⇒ pursue D4/OCS-SDK; corrupted by param override ⇒ pursue B2's config.
3. **Rule-out batch (one run):** assert A4/D3 (window), B3 (getMetaData), D5 (osense) fire **0×** on a still capture
   → eliminates preview-window, qdMetaData, perf-hint subsystems.
4. **No-device NOW:** jadx the OCS SDK (subsystem #1) for the `buffer_input_scanline` computation.
Probe scaffold: `tools/frida/track_gralloc_handle.js` (handle tracker) + `tools/frida/aps_pathway_ruleout.js` (this map).

## OCS SDK (Java) is INNOCENT of geometry — and the op_mode/pipeline finding (2026-06-17, jadx + log A/B)
**jadx of `com.oplus.camera.unit.sdk.jar` `ApsProcessor.addPictureImage(ImageBuffer,i,i2,i3,tag)`:** the Java
side hands APS `KEY_IMAGE_FORMAT/WIDTH/HEIGHT` (= `HardwareBuffer.getFormat()/getWidth()/getHeight()`),
`KEY_IMAGE_ROLE`(i)/`KEY_PHYSICAL_ID`(i2)/`KEY_HDR_TYPE`(i3), and SCENE/DECISION params
(`KEY_CAPTURE_FEATURE_TYPE`=`cameraRequestTag.mApsDecisionFeatureType`, `KEY_TURBO_RAW_SENCE`,
`KEY_SUPER_NIGHT_SCENE`, `KEY_CAPTURE_MODE`, burst keys) — **NO stride, NO scanline, NO compute.** So the
native key `buffer_input_stride/scanline` is NOT Java-supplied; only `buffer_input_width/height` map from
Java (getWidth/getHeight), and stride/scanline are derived NATIVELY by the lock. ⇒ the Java SDK is innocent
of geometry; the divergence is native (byte-identical) operating on the buffer's **resolved FORMAT** (Java
`getFormat()` → native `camApsBufferDesc` format-switch) + the **capture-decision feature/HDR type** that
selects the APS engine. The fusion OUTPUT (1280×960 P010_VENUS) is allocated APS-INTERNAL; the SDK only hands
the capture INPUT Image's HardwareBuffer.
**NEW no-device leads:** (1) `mApsDecisionFeatureType` / `KEY_HDR_TYPE` / `KEY_TURBO_RAW_SENCE` — the capture
decision in **OplusCamera.apk** (jadx) — if LOS picks a different feature/HDR/turbo path, APS runs a different
engine → different output geometry. (2) `KEY_IMAGE_FORMAT` — what the capture Image resolves to (IMPL_DEFINED
resolution) OOS vs LOS.
**op_mode A/B (masterraw configure_streams, ordered, truncation-robust):** OOS = `8001→80a9→8009×3` per capture
(the 8009 SAT-fusion burst repeats 3×); LOS = `8001→[op_mode=0x0/1-stream/320×240 DEGENERATE]→80a9→PROVIDER
SIGABRT` (crashes on the 8K/provider path before reaching 8009). Two real divergences: LOS inserts a degenerate
0x0 reconfigure OOS never does, and the provider crashes (ncsUnreleased class, separate from the app-side P010
BasicTone crash). The 8009 streams are RAW/linear-P010 capture INPUTS (1920×1440/4096×3072 Y8/RAW_OPAQUE/0x36),
NOT the fusion output — so op_mode is pipeline-INSTABILITY evidence, not the direct P010-geometry lever.

## STRUCTURAL CORRECTION: the AOSP graphics framework DIFFERS OOS↔LOS (2026-06-17)
"Everything byte-identical" held only for the VENDOR/proprietary blobs. The from-source AOSP graphics framework
is DIFFERENT (BuildId): `libgui` (2d90a5b3→66288fe1), `libnativewindow` (49d18a27→628c08b8; AHardwareBuffer_
lockPlanes/describe live here), `libui` (144d8869→ff41ae5f; GraphicBufferAllocator + Gralloc4/5Mapper client),
`libgralloctypes` (dfed9a5c→887086c0; PLANE_LAYOUTS encode/decode). OplusCamera.apk also differs (OOS 8f13e3ce
vs LOS-built 5031618c vs LOS-tree 3081bf9d — rebuilt/re-signed).
CAVEATS (why this may be BENIGN): (a) OOS symbols are stock AOSP (no oplus/venus markers); the 717-vs-2610
func-count gap is STRIPPING (OOS dynsym vs LOS full symbols), not OEM additions. (b) The P010 plane-layout MATH
is in the byte-identical `mapper.qti`; `libui` GraphicBufferMapper/Gralloc4-5Mapper RELAY the IMapper result.
DECISIVE no-device TEST: binary-diff `libui` `GraphicBufferMapper::getPlaneLayouts` / `Gralloc4-5Mapper::get`
(and `libgralloctypes decodePlaneLayouts`) OOS-blob vs LOS-build — are they code-identical, or did the LOS build
drop the QTI gralloc patch (a common stock-AOSP-on-QTI LineageOS gap)? Identical ⇒ framework lead dead, it's a
pure runtime VALUE (mOutputAlignmentStride/Scanline=0 on LOS, fed from an unpinned native source — needs the
device probes). Different in the P010 path ⇒ that's the root. NOTE: getPlaneLayout is DORMANT in APS, so the
PLANE_LAYOUTS path may be moot; the live geometry is the lock (lockPlanes→mapper.qti, byte-identical) — which
argues the framework diff is benign and the root is the runtime alignment value.
**CONFIRMED (2026-06-17): framework lead DEAD.** LOS `frameworks_native` = stock LineageOS fork (no QTI-display
patches); `GraphicBufferMapper::getPlaneLayouts` is a pure relay to `mMapper` (= byte-identical `mapper.qti`);
P010 handling is stock AOSP. So the geometry libui returns IS the byte-identical mapper's. getPlaneLayout is
dormant in APS regardless.

## ⟦ STATIC RE EXHAUSTED — DEFINITIVE BOUND (2026-06-17) ⟧
The entire STATIC space is now ruled out for the P010 geometry divergence: kernel (OOS prebuilt) · all VENDOR
blobs byte-identical (CamX/CHI/oemlayer/gralloc.qti/mapper.qti/libcamerabuffer/libAlgoProcess/Interface/
libAPSClient) · AOSP graphics framework differs by BuildId but RELAYS byte-identical mapper.qti (benign) ·
props/config identical-or-no-op · static APS config (sApsConfigParamsMap) symmetric · Java OCS SDK innocent of
geometry · identity gate satisfied (still crashes). Per the user's thought-exercise (regular photo ALSO crashes
like masterraw without libapsfixup), the fault is the COMMON P010 alignment going to 0 on LOS. Since NOTHING
static differs in the geometry chain, the divergence is a RUNTIME VALUE: `mOutputAlignmentStride/Scanline`
(or the lock-derived stride/scanline feeding it) = 0 on LOS vs non-zero on OOS, from a source that leaves no
static fingerprint. The one DYNAMIC divergence observed is the LOS pipeline instability (op_mode degenerate
reconfigures + provider SIGABRT) — the P010 crash may be downstream of that. ⇒ NEXT EVIDENCE REQUIRES THE
DEVICE: run `tools/frida/{track_gralloc_handle,aps_pathway_ruleout}.js` on LOS to catch the stage geometry hits
0; or dump the `oplus_aps_addFrameBuff` lock-channel ApsBufferPlanes (stride/scanline) OOS-golden vs LOS. The
probes are authored + ready; the static well is dry.

## Anchors
- libAPSClient-jni: `oplus_aps_addFrameBuff`, `oplus_aps_setParameters`, keys `buffer_input_{width,height,stride,scanline}`,
  `gAPSOps.pfnAPSBufLckPlanes`. CHI: `ChiFeature2Base::InitBokehSatStream`, `CHIBufferManager`. Producer alloc:
  `Spectra::BufferAllocatorBuilder::BuildCameraBuffer` (libcamerabuffer 0xec00). Pairs with
  `p010-dmabuf-environment-RE.md` (pure-consumer model), `apsclient-bridge-RE.md`.
