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

## Anchors
- libAPSClient-jni: `oplus_aps_addFrameBuff`, `oplus_aps_setParameters`, keys `buffer_input_{width,height,stride,scanline}`,
  `gAPSOps.pfnAPSBufLckPlanes`. CHI: `ChiFeature2Base::InitBokehSatStream`, `CHIBufferManager`. Producer alloc:
  `Spectra::BufferAllocatorBuilder::BuildCameraBuffer` (libcamerabuffer 0xec00). Pairs with
  `p010-dmabuf-environment-RE.md` (pure-consumer model), `apsclient-bridge-RE.md`.
