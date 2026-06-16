# 51 - LOS v1.4 preliminary OOS A/B matrix

Status: preliminary, capture-backed, 2026-06-16.

Inputs:
- OOS golden: `reference/_golden-oos-V16.1.0/campaign/*`.
- LOS v1.4: `reference/campaign/*` after `23.2-20260616-UNOFFICIAL-infiniti`.
- Fresh LOS app probes: `reference/campaign/*/app_probes/*.log`.

Caveats:
- Best OOS full-baseline is V16.1.0 / 16.0.8 / sub_api47. Some older OOS `photo-hdr` and `p010`
  captures are 16.0.7 / sub_api46 and must not override the .300 baseline when they disagree.
- LOS `p010`, `masterraw`, `video8k`, and `freeze-gateb` have invalid or partial UI scope. They still
  carry useful crash/configure evidence, but are not clean photo-quality A/B captures.
- LOS log counts are inflated by log-unclobbering. Use presence/absence and first failing subsystem,
  not raw count parity.

## Findings

| Rank | Subsystem | A/B result | Patchset direction |
|---|---|---|---|
| 1 | Preview EDR/HDR surface plumbing | Strong LOS divergence. OOS `OplusEdrUtils.getBlastSurfaceControl()` returns the preview BLAST `SurfaceControl` and `setEdrFlags()` succeeds. LOS returns `null` for the same GLRootView. SurfaceFlinger on OOS applies HLG plus desired HDR/SDR ratio 5.0; LOS sees an HDR layer but desired ratio remains 1.0/dimming 1.0. This matches the user-observed symptom: preview overexposed, saved JPEG normal. | Fill the OOS EDR chain instead of broad app API translation: app-side `OplusEdrUtils` behavior, `SurfaceControl.Transaction`/libgui Oplus EDR ABI, and SurfaceFlinger read-side. If the product decision is surgical, force only camera preview to SDR and do not chase still capture. |
| 2 | Still capture / APS / CHI | Normal still path is mostly alive. OOS and LOS full-baseline stream topology and HDR request tags match for the important photo path: `auto.hdr.enable=1`, `preview.hdr.support=1`, `capture.hdr.support=0`, ADRC TMC metadata present, 1440x1080 Y8 + 1920x1440 YUV preview + 4096x3072 RAW/YUV outputs. LOS has `hdr_detected` and fusion graph activity. No `copyMetadata` UAF or configure `-38` appears in normal photo captures. | Do not treat preview overexposure as proof that APS still processing is broken. Keep still-photo patches upstream and focused: preserve metadata/depth handling and log-unclobbering, but do not re-add broad OOS->LOS stubs for this symptom. |
| 3 | P010 / BasicTone / libAlgoProcess | P010 allocation and plane-lock shape now matches OOS: LOS allocates `format=0x36(YCBCR_P010)` and locks `planeCount=3`, and `camApsBufferLockPlanes` returns `0x0`. The remaining LOS P010 failure is later: app tombstones in `libBasicTonePhoto.so` at `BasicTone_OGL::saveOutImg()` during the P010/Pro sequence. | Candidate shim-retirement patchset is not another gralloc P010 shim. Fix the upstream BasicTone/GL output contract: output buffer/dataspace/stride/GL image assumptions for the P010/Pro path, then remove `libapsfixup` only after green-photo/P010 replay passes without the crash. |
| 4 | OCS SDK / media classpath | OOS resolves `com.oplus.media.OplusHeifWriter` and hooks live-photo methods. LOS resolves `CameraMetadataNativeWrapper.getMetadataPtr()` but cannot resolve `OplusHeifWriter` from the OplusCamera classpath. | Add/fill the missing Oplus media SDK surface and reconcile the inner camera2 wrapper/classpath against .300. This is a plausible MotionPhoto/live-processing gap, not the preview overexposure root. |
| 5 | OEMLayer / 8K / libcsextimpl path | LOS reaches OOS-shaped 8K configure opmode `0x80a9`, so the failure is not simply "missing 8K opmode". The 8K implementation-defined stream differs in dataspace (`OOS 0x104`, `LOS 0x10c60000`), then LOS provider aborts in `camera.oemlayer.healthmonitor` with `ncsUnreleased 16`. | Verify active `libcsextimpl`/Depth-1/Depth-2 mutation under a clean 8K run and patch the stream/dataspace mutation or OEM release accounting. Rank this below preview EDR for the overexposure symptom. |
| 6 | Props | Live LOS reports `ro.camera.enableCamera1MaxZsl=1`, `ro.vendor.oplus.camera.backCamSize=50MP+50MP+50MP`, and `ro.vendor.oplus.camera.frontCamSize=32MP`. Local v1.4 repos and prior .300 dump notes only justify `enableCamera1MaxZsl`; the size props are absent from the .300 dump notes and not found in the local synced repos. | Treat `backCamSize/frontCamSize` as overlay/resetprop contamination until the device-side source is found. They should not drive the OOS baseline model. |

## Evidence anchors

- OOS EDR: `reference/_golden-oos-V16.1.0/campaign/edr-hdr/app_probes/trace_edr_invocation.log`
  lines 31-38 return a BLAST surface and set flags.
- LOS EDR: `reference/campaign/edr-hdr/app_probes/trace_edr_invocation.log` line 30 returns `null`.
- OOS SurfaceFlinger: `reference/_golden-oos-V16.1.0/campaign/edr-hdr/run1/ab/sf_post.txt`
  lines 55 and 151 show HLG preview with desired ratio 5.0.
- LOS SurfaceFlinger: `reference/campaign/edr-hdr/run1/ab/sf_post.txt` lines 10-12 show HDR events
  with desired ratio 1.0.
- Full-baseline streams match: OOS `reference/_golden-oos-V16.1.0/campaign/full-baseline/run1/ab/dumpsys_camera_post.txt`
  lines 87-122 and LOS `reference/campaign/full-baseline/run1/ab/dumpsys_camera_post.txt` lines 86-121.
- P010 allocation parity: OOS `reference/_golden-oos-V16.1.0/campaign/gralloc-p010/app_probes/trace_gralloc_p010_chain.log`
  lines 37, 64, 66 and LOS `reference/campaign/gralloc-p010/app_probes/trace_gralloc_p010_chain.log`
  lines 81, 108, 110.
- P010 LOS crash: `reference/campaign/p010/run1/ab/tombstone_36` lines 30-33.
- OCS classpath gap: OOS `reference/_golden-oos-V16.1.0/campaign/motionphoto/app_probes/trace_motionphoto.log`
  lines 13-27 and LOS `reference/campaign/motionphoto/app_probes/trace_motionphoto.log` lines 13-17.
- 8K OEM divergence: OOS `reference/_golden-oos-V16.1.0/campaign/video8k/frida/hook_configure_streams.log`
  lines 53-66 and LOS `reference/campaign/video8k/frida/hook_configure_streams.log` lines 59-76, 99-116.

## Current working hypothesis

The overexposure correlation is strong and preview-specific. The still-photo path is close enough to OOS
for ordinary saved JPEGs that a broad OOS->LOS stub translation is the wrong first fix. The next patch
series should prioritize the EDR preview surface contract, then P010 BasicTone stability, then OCS/live-photo
SDK completion and 8K OEM stream mutation.

## Interoperability correlation

This table ties the preliminary A/B ranking back into the interop tree and reconciles the older RE-note
language. The main correction is separation of axes: preview EDR, still APS, P010/BasicTone, OCS/media SDK,
and 8K OEMLayer can fail independently.

| A/B finding | Interop node(s) | RE notes reconciled | Current interoperability meaning |
|---|---|---|---|
| Preview overexposure is preview-only; still JPEG is normal. | `S3-overexposure`, `D4-render-sf-edr`, `E2-system-framework`, `E3-toggles-config` | `edr-sf-readside-RE.md`, `ocs-auth-abi-RE.md` | Strongest current root candidate is the OOS EDR surface/composition contract. Fill `OplusEdrUtils`/libgui/SF/OCS-auth together, or intentionally force camera preview SDR. Do not route this through APS still-save fixes. |
| Normal still capture reaches the OOS-shaped photo path. | `S2-nojpeg`, `D2-hal-fill-aps`, `C5-camx-chi-feature2`, `C6-aps-oemlayer` | `aec-hdrdetect-publish-RE.md`, `customvendortag-producer-RE.md`, `oemchimetadatas-sr-producer-RE.md` | `hdr_detected` and normal photo save are present in v1.4. `customVendorTag` and `oemChimetadatas` remain condition/SR/fusion gates, but are not the present preview tonemap root. |
| P010 layout reaches OOS-shaped locks; crash moves later into BasicTone. | `S5-p010`, `D1-gralloc-camxformat`, `D3-imagereader-hwbuffer`, `C6-aps-oemlayer` | `alloc-chain-locus-RE.md`, `gralloc-p010-chain-RE.md`, `libapsfixup-interposition-RE.md`, `libapsfixup-poller-fix-RE.md` | Drop "another gralloc shim" as the patchset. Fix BasicTone/GL output writability, dataspace, stride, and image assumptions; remove `libapsfixup` only after P010/Pro replay is green. |
| OCS/media SDK has a classpath gap but not the preview root. | `C1-app-ocs-sdk`, `E1-stubs`, `E2-system-framework` | `ocs-auth-abi-RE.md`, motion-photo probe evidence | Missing `OplusHeifWriter` is a MotionPhoto/live-processing gap. It should be filled as an Oplus media SDK surface, separate from the EDR preview fix. |
| 8K reaches OOS-shaped opmode but diverges in stream/dataspace/release accounting. | `S8-8k`, `C3-cameraserver-extimpl`, `C4-hal-provider`, `E4-sepolicy-namespace` | `oem-client-identity-gate-RE.md`, `oem-binder-ontransact-RE.md` | `libcsextimpl`/opmode is not the sole issue. Verify depth/extimpl stream mutation and OEMLayer release accounting under a clean 8K run. |

Patchset order from this correlation:

1. Preview EDR: either fill the OOS EDR/SF/OCS-auth contract or apply the surgical SDR-preview workaround.
2. P010/BasicTone: repair the post-lock BasicTone output contract, then remove `libapsfixup`.
3. Oplus media SDK/classpath: fill `OplusHeifWriter` and related live-photo surfaces.
4. 8K/OEMLayer: patch stream dataspace/depth mutation and release accounting after a clean 8K capture.
