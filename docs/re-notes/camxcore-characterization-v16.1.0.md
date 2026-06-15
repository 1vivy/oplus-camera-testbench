<!-- STATUS: VERIFIED — evidence-anchored (Ghidra/device capture); no inference-surgery needed (doc-50 method). -->
# CamX-core characterization — OnePlus OOS V16.1.0, daytime HDR scene (clean capture)

Source: `reference/captures/camxcore-clean/camxcore-clean-20260613-135910.log`
(40s `logcat -b all`, fresh provider pid 26925, targeted crash-free masks, F DEBUG = 0).
Camera: rear, `logicalCameraId 4 / cameraId 0` (multicam logical group, master cam 0).

## configure_streams (camxhal3.cpp, ALWAYS_ON)

```
camxhal3.cpp:1765 configure_streams() Begin CONFIG  logicalCameraId 4, cameraId 0
camxhal3.cpp:1849 configure_streams() operation_mode: 0x8001
camxhal3.cpp:1982 configure_streams() End CONFIG    logicalCameraId 4, cameraId 0   (~120ms)
```
- **operation_mode = 0x8001** — bit15 set = QTI vendor "custom"/ZSL stream-config mode; low byte 0x01.
  This is the OnePlus SAT/HDR usecase op_mode (consistent with the OplusSATFusion reprocess pipelines below).
- No `configure_streams` error/rc; CONFIG completes cleanly.

## HDR detection state (hdr_detected / numHDRExposure / cameraHDRMode)

Driver tag: `chifeature2graphselectoroem.cpp:1825 GetCustomVendorTagFromCaptureIntent()`:
```
cameraHDRMode 1, appEnabledQHDR 0, enableRawHDR 0, captureIntent 1, numHDRExposure {1 then 2}
```
- **cameraHDRMode = 1** throughout (HDR auto/on). `appEnabledQHDR = 0` (app did not force QHDR),
  `enableRawHDR = 0`.
- **numHDRExposure: 1 → 2** — preview runs single-exposure (`numHDRExposure 1`, 6 hits at startup),
  then steady-state HDR detection raises it to **2 exposures** (2679 hits) = SHDR/DCG 2-frame staggered
  HDR is active on this scene. This is the "hdr_detected" decision surfacing at the graph-selector.
- Static capability (`chxextensionmodule.cpp:12760 PopulateHDRStaticCapabilities`):
  `Camera 0: HDR mode:1 supported, HDR DCG mode:4, LongBpp:10 ShortBpp:10` — sensor supports 10-bit
  DCG staggered HDR. Cameras 2/3 expose HDR mode:1 without DCG.
- Session params (`chxextensionmodule.cpp:13017 PopulateHDRSessionParameters`):
  `numHDRexposure 1, DCGMode 0, DCGLongBpp 0, dcgShortBpp 0, HDRModePreference index 0 value 1`
  at session setup (before steady-state bumps to 2).

## SHDR / HDRMode plumbing (CamX-core depth)

- `chifeature2generic.cpp:3888 OnPreparePipelineCreate() Override HDR mode from session setting, hdrmode:1`
  — the per-pipeline HDRMode is forced to 1 from the session setting.
- `chifeature2base.cpp:4087 UpdateStreamHDRMode() No stream HDR mode was updated` — no per-stream HDR
  override; stream inherits session hdrmode.
- `chifeature2base.cpp:8063 GetPruneVariantForHDRProfile() previewHDRProfile:1, videoHDRProfile:0,`
  `HDRProfile prune group:52 / previewHDR10P prune group:70 / snapshotHDR prune group:53` — graph pruning
  selects the previewHDRProfile=1 variant (preview HDR on, video HDR off).
- Oplus tuning override (`opluscamxchinodehwcfgipedummy.cpp:739 OplusOverrideIPETuningMode`):
  `opmode:0x8001 captureHDR:0, previewHDR:1, featuretype 73, bracketmode 25` — **previewHDR=1, captureHDR=0**
  in steady preview (capture HDR engages only at shutter). IPE/OFE tuning value:2 on pipeline
  `OplusSATFusionOfflineReprocess0_IPE0 / _OFE1` (the SAT fusion offline reprocess path; 534/529 hits).
- `GetSHDRAutoExposureUsecase` exists in core (`camera.qcom.core.so`) but its detailed lines are
  STATS-VERBOSE and gated by the AEC group; the observable SHDR decision here is numHDRExposure 1→2 +
  hdrmode:1 above.

## Preview-delivery cadence (ProcessCaptureResult)

`chxmulticamerabase.cpp:3605 OnProcessCaptureResult() Obtained frame N ...`
- 2674 ProcessCaptureResult callbacks over 38.49s span = **69.5 results/s aggregate**, median
  inter-result interval **7.0 ms**.
- This is the multicam (logicalCameraId 4) aggregate across the preview + metadata/result streams;
  per-display-stream this is ~30 fps preview (two result callbacks per frame: `num_buffers 1` buffered
  frame + `num_buffers 0` metadata-only, alternating — visible as `capIntent 1` vs `capIntent -1`).
- Frame index range observed 21 → 1176. `Set tag com.oplus.gamma.info success` per result
  (`metadatamanager.cpp:227`) = Oplus gamma metadata published every frame.

## Notes / gaps

- `decMetaRefZeroToRemove` / `HandleProcessResultRequest` did not appear at INFO/STATS-VERBOSE level in
  this capture (they are CORE/SYNC VERBOSE or DUMP level); enable logVerboseMask CORE bit (already on)
  + SYNC if needed — but watch volume.
- `hdr_detected` / `couple_hdr_detected` / `qbc_hdr_detected` vendor-tag *writes* are STATS-VERBOSE
  (`statsprocessingnode` / AEC). They are in the STATS_AEC group (bit 25, enabled in VERB_MASK) but fire
  mainly in the brief capture window; for a snapshot-focused trace, dwell longer post-shutter.
- Capture/mask method: `tools/frida/enable_camx_logging.js` (info=0x1f0fb7b8, verb=0x0e010200).
