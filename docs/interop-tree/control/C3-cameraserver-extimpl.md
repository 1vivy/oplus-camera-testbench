<!-- Parent: ../INDEX.md -->

---
node: C3
title: "cameraserver / libcameraservice + OEM CameraServiceExtImpl (libcsextimpl)"
plane: control
partition: /system
blob_identical_oos_los: true
characterization: CHARACTERIZED  # (a) carriers observed end-to-end on OOS: configure_streams contract seen at runtime — photo op_mode 0x8001/3-stream (RAW10 3280x2464) + 8K op_mode 0x8001/9-stream (logicalCameraId 4) AND op_mode 0x80a9/5-stream EIS (7680x4320 YUV+IMPL_DEFINED) via frida hook, 3/3 STABLE; G1 stock CameraServiceExtImpl.cpp VERBOSE + G5 binder dropped 2(photo)/12(8K) stable; libcsextimpl exports RE-mapped
conviction: SUPPORTED             # SUPERSEDED 2026-06-16 — see body CORRECTION (libcsextimpl shipped + a1cb339/dc44f04 landed)
verdict: "SUPERSEDED 2026-06-16: the facilitation IS now landed — libcsextimpl.so ships via vendor/oplus/camera (system_ext/lib64) and frameworks/av carries the ext receiver (a1cb339) + the package-name identity stamp (dc44f04/C7). The earlier 'G5 is REAL: libcsextimpl absent on LOS / 0 ext call sites / dropped d654641' no longer holds. Depth-1 onTransact governs identity/zoom/auth; Depth-2 beforeConfigureStreamsLocked remains the 8K -38 candidate. Live A/B (does the package-name stamp flip the HAL to SAT-Fusion) is the open device test."
confidence: medium
symptoms: [8, 4, 1, 3]
probes: [r4-oem-transact, hook_configure_streams.js, G1, G5]
gaps: [G1, G5]
dodge_ref: ""
dirty_ref: ""
divergence: ""
upstream: [C2, E1, E2]
downstream: [C4, C5, D1, D2]
refuted_refs: ["PROBE-R1c (cameraserver relay off the JPEG path — perf axis only)"]
doc_refs: [doc-48, doc-46, doc-47]
updated: 2026-06-14
---

# C3 — cameraserver / libcameraservice + OEM CameraServiceExtImpl

> **CORRECTION (2026-06-16):** the "environmentally absent" framing below is SUPERSEDED. `libcsextimpl.so`
> IS shipped in cam-final at `vendor/oplus/camera/camera/proprietary/system_ext/lib64/libcsextimpl.so`, and
> `frameworks/av` now carries the OEM ext receiver (commit `a1cb339`, dodge av/0001) PLUS the OOS-faithful
> package-name identity stamp (`com.oplus.packageName`=`com.oplus.camera`, commit `dc44f04` / C7). The prior
> `d654641` drop + "0 ext call sites" no longer hold; the identity gate is the package NAME, not a byte tag.

The OEM cameraserver layer. On OOS the `media.camera` binder is OnePlus-modified and answers a private
OEM protocol via `libcsextimpl.so` (`android::CameraServiceExtImpl`) at **two depths**. On LOS our
`frameworks/av` now carries the ext receiver (`a1cb339`) + the package-name identity stamp (`dc44f04`), and
`libcsextimpl.so` is shipped via `vendor/oplus/camera` (system_ext) — so this node is **facilitated**, no
longer "environmentally absent".

> **Axiom binding.** `libcameraservice.so` is byte-identical-OOS↔LOS-class (pure AOSP both sides; md5≠stock
> only because LOS rebuilds it). The root is NOT a libcameraservice edit — it is the **missing facilitation**:
> the `libcsextimpl.so` blob + the `CameraService`/`Camera3Device` call sites that invoke it (E1/E2).

## (a) Propagation contract — exact carriers

**OBSERVED working configure_streams contract (stock V16.1.0, SELinux Enforcing, 3/3 runs ALL STABLE per `verdict.json`).**
The contract that crosses cameraserver → CamX/HAL is captured two ways: the HAL-side `configure_streams()`
dump (`camxhal3.cpp:1750+`, G1-class CamX log) and the frida `camera.oemlayer.v2.so` configure_streams hook
(`video8k/frida/hook_configure_streams.log`, base `0x730bb53000` @ `0x730bccb6cc`). Exact carriers:

- **Photo (`photo-hdr` cond, `mode=photo ae_lock=1`):** `operation_mode 0x8001` (=32769), **3 streams**,
  `logicalCameraId 1, cameraId 1`; F2GS `numStreams 3, Preview 1, Raw 2`. Per-stream
  `{format, WxH, usage, streamUsecase, hdr_profile}`:
  - `S0 = RAW10(37) 3280x2464 usage=0x3 streamUsecase=0 hdr=HDR_PROFILE_UNKNOWN` (dataspace V0_JFIF)
  - `S1 = RAW10(37) 6560x4928 usage=0x3 streamUsecase=0 hdr=HDR_PROFILE_UNKNOWN` (full-res RAW)
  - `S2 = P010(54, YCbCr_420_P010) 1920x1440 usage=0x40000103 streamUsecase=0 hdr=HDR_PROFILE_SDR`
  - (`CameraDeviceClient: createStream : stream size is 3280 x 2464` ×3 on the app→server boundary.)
- **8K (`video8k` cond, `mode=video8k ae_lock=0`):** TWO configs fire, both stable 3/3:
  - **base `operation_mode 0x8001`, 9 streams, `logicalCameraId 4, cameraId 0`** (F2GS `numStreams 9, Preview 1, Raw 7`):
    RAW10 4096x3072 ×5 (mixed `streamUsecase 0`/`65536`) + RAW10 8192x6144 (true 8K sensor RAW) +
    YUV_420_888 1920x1440 (`hdr=SDR`) + YUV_420_888 320x240 — all `usage=0x3` except the two YUV (`0x103`),
    all `hdr_profile=UNKNOWN` on the RAW.
  - **8K-EIS `operation_mode 0x80a9`, 5 streams** (frida hook): `S0 YUV 1920x1080 usage=0x103`,
    **`S1 YUV_420_888 7680x4320 usage=0x3`** + **`S2 IMPL_DEFINED 7680x4320 usage=0x10010300 dataspace=0x104`**
    (the EIS in/out 8K pair), `S3/S4 YUV 480x270`. This 0x80a9 5-stream set is the OEM EIS configuration the
    Depth-2 hooks shape — it reproduced 3/3 in the hook log.

The 8K runs also emit a **stable** secondary `configureStreams: ILLEGAL_ARGUMENT` / `configureStreamsLocked:
Set of requested inputs/outputs not supported by HAL` on **camera 0** (~12s after the working 0x8001 config,
3/3 runs) — a stock transient that recovers; verdict row `#8 8K configure_streams -38` = `False` (stable).

**What enters (C2/SDK → cameraserver binder `media.camera`):** OEM binder transactions, base
`OPLUS_CAMERA_FIRST_CALL_TRANSACTION = 10000`, from `OplusCameraManager.transact(100xx)`. **OBSERVED
G5 binder traffic:** OEM-protocol calls land on the OnePlus-modified receiver on stock (no `UNKNOWN_TRANSACTION`
spike); `verdict.json` `G5 OEM binder dropped` is the stable baseline-noise count — **`2` (photo-hdr) / `12`
(video8k)**, 3/3 stable, bucket `present(>0)`. The stock-side `CameraServiceExtImpl.cpp` VERBOSE lines fire
(`OplusCameraService: CameraServiceExtImpl.cpp: 4681 setProcessIOPriority()` + `CameraService::connect call
… "com.oplus.camera", camera ID 1` — photo-hdr/run1, G1 WORKS) confirming Depth-1 is live on OOS.
- `10003 SET_PACKAGE_NAME` (`setPackageName`) — identity stamp source
- `10004 CLIENT_IS_AUTHED` (`isAuthedClient`) — auth gate
- `10005 SET_CLIENT_INFO` (`setClientInfo(pkg,uid,pid)`); `10006 SET_CALL_INFO`
- `10014 PRE_OPEN_CAMERA` (`preOpenCamera`)
- `10015 SEND_OPLUS_EXT_CAM_CMD` (`sendOplusExtCamCmd(Cmd,int[])`, oneway) — Cmd ∈ {`CMD_NONE`,`CMD_PRE_CAPTURE`,`CMD_PRE_OPEN`,`CMD_PRE_EVLIST`,`CMD_READ_MEM`}; zoom/pre-capture channel
- `10016 SET_IS_CAMERA_UNIT_SESSION` — session typing (`isCameraUnitSession()`)
- full ABI 10001–10022 (lifecycle/torch/AON/satellite/callback) — see doc-48 table
- SDK also declares `parseSessionParameters(CaptureRequest)` on `IOplusCameraManager`.

**What leaves (cameraserver → down to C4/C5/D1/D2 via Depth-2 internal hooks):** `CameraServiceExtImpl`
hooks that stock cameraserver calls at its own call sites (demangled exports of `libcsextimpl.so`):
- `beforeConfigureStreamsLocked(CameraMetadata&, m, String8, camera3::StreamSet&, int)` — **mutates the StreamSet pre-configure** → C4/C5/D1 (8K EIS output stream / op_mode 0x80a9)
- `getExtensionOperatingMode(CameraMetadata&, m, int)` — operating-mode override → C5 (8K)
- `processPreview(camera_stream_buffer*, m, InFlightRequest&)` — preview-frame processing → D2 (Gate B)
- `beforeMetadataSendToApp(CaptureResult*, j, CaptureOutputStates&)` — mutates result metadata to app → D2/D4 (exposure/Gate B)
- `addRemovePackageName(CameraMetadata&, m, bool)` — stamps pkg identity INTO metadata (OOS-native; we replaced this sliver via SDK self-stamp `62009bf`)
- `returnOutputBuffers` / `sendCaptureResult` / `processCaptureResult` / `checkToRemoveInFlightReqest` — buffer + result delivery (the #4 result-lifetime contract)
- `getCameraCharacteristics(String16, CameraMetadata*)` — caps/8K advertise
- factory entry `android::ExtFactory::getCameraServiceExt()`; ABI entry `CameraServiceExtImpl::onTransact(...)`

> **G-MECH (runtime ↔ RE pairing).** The OBSERVED `op_mode 0x80a9` 5-stream 8K config carrying the
> `7680x4320` YUV + `IMPL_DEFINED usage=0x10010300` EIS pair (frida hook, 3/3 stable) is exactly what the
> stock receiver shapes via the two RE-recovered hooks (`oem-binder-ontransact-RE.md`):
> `beforeConfigureStreamsLocked @0x17f71c` mutates/retypes the StreamSet (matches `vtbl+0x20==300 &&
> vtbl+0x28==0x400` → emplace `MetaStreamInfo` at `+0x598`) and `getExtensionOperatingMode @0x184818`
> reads vendor-tag `UNK_00142f77` to return the `0x80a9` op_mode (else falls back to the 0x8001 default).
> On LOS both are unreachable: `libcsextimpl.so` dropped (`d654641`) + 0 `CameraServiceExt*` call sites, so
> cameraserver's stock AOSP `onTransact` hits the RE'd `default: -38` (UNKNOWN_TRANSACTION) for every 100xx —
> the **OEM Depth-2 hook the LOS port must reproduce is `beforeConfigureStreamsLocked` + `getExtensionOperatingMode`**
> (re-add the blob AND wire the forward-call sites; dodge ports Depth-1 only and never reaches these).

## (b) Environment dependencies (the non-blob things this contract needs)

- `/system_ext/lib64/libcsextimpl.so` — **present on OOS (4 `/proc/maps` mappings), absent on LOS (dropped `d654641`)**; backend `vendor.oplus.hardware.sendextcamcmd-V*` HAL present in `vendor/oneplus/infiniti/proprietary` (so 10015 is satisfiable once a receiver exists).
- `/system` `frameworks/av` `CameraService.cpp` / `Camera3Device` **call sites** that forward into `CameraServiceExtImpl` — OOS-native; **0 on LOS** (`grep -c CameraServiceExt CameraService.cpp = 0`). Re-adding the lib without these call sites still cannot reach Depth-2 (E2 facilitation).
- `CameraServiceExtFactory` dlopen + `getExtFactoryImpl` + `onTransact` delegation — the dodge Depth-1 port shape (donor lift, E1/E2).
- `ro.oplus.system.camera.name` / `SYSTEM_CAMERA` perm (dodge identity sliver) — distinct from our SDK self-stamp.

## (c) Fact-to-resolve

**Q:** On LOS, do the OEM 100xx binder codes return `UNKNOWN_TRANSACTION` (Depth-1 absent) while
`mRemote!=null` (SDK believes channel live), AND is `beforeConfigureStreamsLocked` the configure-time
hook that binds/retypes the 8K (0x80a9) EIS output stream that LOS's graph lacks (#8)?
- **If both yes →** root of #8's proximate-upstream is the missing Depth-2 receiver (E2 facilitation), not a CamX/Gralloc5 blob edit. **Action:** port Depth-1 (dodge `frameworks,av/0001`) + add the Depth-2 forward-call sites, re-add `libcsextimpl` (reverse `d654641`).
- **If 100xx answered but stream still mis-typed →** #8 root falls to D1 Gralloc5 stream-usage resolution (doc-35 cand-a); C3 demoted to co-factor.
- **If 100xx UNKNOWN_TRANSACTION but stock 4K==LOS 4K stream shape →** Depth-2 is identity/zoom-only; #8 is purely D1.

## (d) Runtime probe(s)

- **`tools/observability/r4-oem-transact/`** (`10_ext_presence.sh` → confirms 4 maps OOS / absent LOS;
  `20_trace_ext_transact.js` → SDK `transact(100xx)` return status; `30_run_r4.sh` both sides → `parse_r4.py`).
  Lever: **frameworks/av = DARK** (no oplus code, no setprop/frida handler), so r4 is FRIDA-ONLY on the SDK
  proxy + `/proc/maps` presence; the server side reads only via **G1**.
- **`tools/frida/hook_configure_streams.js`** (8K vs 4K `camera3_stream_configuration` diff) — pins whether
  the 7680×4320 OUTPUT stream is absent/mis-typed before the graph builder (the `beforeConfigureStreamsLocked` test). Lever: WORKS (HAL provider process).
- **G1** = `log.tag.CameraService/Camera3-Device/Camera2-JNI VERBOSE` (`enable/20_system_framework.sh`).
  **Stock-side now WORKS** (baseline §2): stock photo cycle emits `CameraService::connect` +
  `OplusCameraService: CameraServiceExtImpl.cpp` VERBOSE lines → no eng debug image needed for OOS visibility.
- **G5** = OEM binder txn 10000–10022 + ExtImpl visibility. Baseline: `libcsextimpl` 4 maps on OOS;
  `media.camera UNKNOWN_TRANSACTION` 16/baseline-noise on OOS (a LOS spike = OEM 100xx dropped).

## (e) Dodge-vs-dirty diff

Not an E-node (control plane); the facilitation diff lives in `E1` (stubs) / `E2` (frameworks/av edits)
and `DODGE-VS-DIRTY.md`. Summary of the seam this node depends on (doc-46 Tier-1 `frameworks/av` row):
- **Oracle (dodge):** Depth-1 only — `CameraServiceExtFactory` dlopen + `onTransact` delegate (validated zoom); `libcsextimpl` packaged; **no Depth-2 call sites** (adds only `collectReturnableOutputBuffers` + 4-arg `getCameraCharacteristics`).
- **Ours (HEAD):** ❌ Depth-1, ❌ Depth-2, `libcsextimpl` dropped `d654641`, 0 `CameraService` call sites.
- **Correct (full) form:** Depth-1 + the OOS Depth-2 forward-call sites — dodge is NOT a completeness oracle for Depth-2 (E2 authors it from the OOS `libcsextimpl` symbol set).

## (f) Symptom leaves

- **#8 (8K configure_streams 0x80a9 −38) — PROXIMATE-UPSTREAM here.** Crash site is C5/feature2 (EISv2 node 2-in/0-out → NULL pipeline). C3 is the upstream candidate: missing `beforeConfigureStreamsLocked` StreamSet-mutation + `getExtensionOperatingMode` never invoked on LOS. **Edge:** C3 → C5 (graph) ‖ parallel root D1 (Gralloc5 usage, doc-35 cand-a). Settled by r4 + `hook_configure_streams.js`.
- **#4 (copyMetadata UAF, back-to-back) — ROOT-bearing here (C3/C4 lifetime owner); D2 is the proximate crash-SITE.** Per the authoritative S4 leaf the path is D2 (site) → C3/C4 (root), conviction OPEN with the C3-vs-C4 owner unattributed (this corrects the prior "ROOT at D2" phrasing, which conflicts with S4). Result lifetime: `beforeMetadataSendToApp` / `returnOutputBuffers` / `sendCaptureResult` are the OEM result-delivery contract the blob was built against; their absence (AOSP frees `camera_metadata` sooner) is the `/system` ref-hold gap. **Edge:** C3 (lifetime contract, root) → D2 (`APSMetadata::copyMetadata+60` SIGSEGV site).
- **#1 (preview freeze, frame-1 stall) — co-factor here, ROOT at D2/C6.** `processPreview` is the consumer-side preview hook; if the SDK opens a session it believes OEM-authorized while Depth-2 is absent it is a plausible contributor. **Subordinate** to the doc-47 `probe_aec_hdrdetect.js` Gate-A/B split. **Edge:** C3 (`processPreview` absent) → D2 (APS holds frame 1).
- **#3 (over-exposure) — minor co-factor here, ROOT at D4/E1+E2.** `beforeMetadataSendToApp` could massage result metadata, but the traced root is the SurfaceFlinger/`OplusEdrUtils` EDR path. **G6 correction (D4 (d)):** the SF panel advertises **`supportedHdrTypes=SYSTEM`** only — `Current color mode: SRGB (7) PRE → DISPLAY_P3 (9) POST` (`sf_pre/sf_post.txt`, photo-hdr, 3/3 stable); there are **no literal HLG/ST2084 entries at SF** (the `verdict.json` `#3/G6 … HLG/PQ` string is the OEM-EDR-path shorthand, not an SF cap). **Edge:** C3 → D4. Low priority.
- **Off this path:** identity/SAT-Fusion `-38` (CONVICTED via SDK self-stamp `62009bf`, replaced `addRemovePackageName`); cameraserver relay as a JPEG-path cause (REFUTED, PROBE-R1c — perf axis only).
