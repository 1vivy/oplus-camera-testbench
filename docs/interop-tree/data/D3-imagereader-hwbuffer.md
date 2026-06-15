<!-- Parent: ../INDEX.md -->

---
node: D3
title: "ImageReader / HardwareBuffer + getOplusHardwareBuffer JNI bridge"
plane: data
partition: /system
blob_identical_oos_los: true   # the AOSP android_media_ImageReader.cpp / libandroid_runtime.so JNI is byte-identical; the OEM symbol is an additive patch
characterization: PARTIAL         # bridge-effective OBSERVED (fallback log ABSENT N=3) + native held-input victim OBSERVED (previewManagerRoutine+1560 parked @ pthread_cond_wait, BuildId 82fe443b…, N=3 STABLE); but Java enter/leave carriers (getOplusHardwareBuffer/addPreviewFrameBuff/decMetaRefZeroToRemove/onImageAvailable) are app-side DARK (0 logcat hits, app-probe probe_getoplushwbuffer did NOT fire this pass) ⇒ contract not OBSERVED end-to-end
conviction: SUPPORTED             # G-MECH strengthened: runtime parked-victim backtrace == static RE prediction (BuildID-matched); root (decref upcall) owned by C6/D2; OOS↔LOS A/B still deferred to LOS phase
verdict: "getOplusHardwareBuffer bridge IS present+executing on our build (9d03af1); it does NOT fall back to AOSP getHardwareBuffer — #7's 'AOSP-fallback' framing is REFUTED for preview. D3 is a stall SITE feeding #1; root is the native decMetaRefZeroToRemove upcall (C6/D2), not the buffer fetch."
confidence: medium
symptoms: [7, 1]               # #7 proximate-site here (refuted as root); #1 stall propagates from here downstream to C6/D2
probes: [probe_getoplushwbuffer.js, trace_preview_delivery.js, G4]
gaps: [G4]                     # working-state preview-delivery baseline (the freeze denominator) never captured
dodge_ref: ""
dirty_ref: ""
divergence: ""
upstream: [D2, E2]             # D2 HAL-fill/APS feeds the picture_metadata stream buffer; E2 supplies the JNI bridge symbol
downstream: [C6, D4]           # C6 APS engine consumes the wrapped buffer; D4 receives the (frozen) rendered frame
refuted_refs: [R-getoplushwbuffer-fallback, R-hwbuffer-pool-exhaust]
doc_refs: [doc-43, doc-44, doc-46, doc-47]
updated: 2026-06-14
---

# D3 — ImageReader / HardwareBuffer + getOplusHardwareBuffer JNI bridge

The data-plane boundary where the **preview INPUT Image** crosses from the camera2 `ImageReader` into the OCS
SDK's APS engine. The SDK does NOT use AOSP `Image.getHardwareBuffer()`; it calls the OEM bridge
`ImageReader$SurfaceImage.getOplusHardwareBuffer()` to obtain an `AHardwareBuffer` carrying OnePlus gralloc
metadata (the `picture_metadata` stream's `camera_metadata` size — doc-46), wraps it in `ApsResult$ImageBuffer`,
and ref-counts the Image until the native engine releases it. **Axiom:** the AOSP JNI here is byte-identical; the
OEM symbol is an additive patch, so the root is the symbol's presence (E2) and the native release contract
(C6/D2), never a blob edit to `android_media_ImageReader.cpp`.

## (a) Propagation contract

> **OBSERVED (preview-baseline campaign, V16.1.0, mode=video, SELinux Enforcing, ae_lock=0, CPH2747/`OP611FL1`;
> N=3, ALL STABLE per verdict.json).** The bridge is present + effective end-to-end on the held-INPUT side; the
> Java enter/leave carriers below remain **app-side DARK** (no logcat tag, app-probe did not fire — see gap note).

**What enters (from D2 / camera2):**
- `ImageReader$SurfaceImage` instances delivered via `ConsumerImpl$1.onImageAvailable` (thread `PreviewImageThr`),
  backed by the preview ImageReader created in `SurfacePool.createImageReader` →
  `ImageReader.newInstance(w,h,fmt,maxImages,usage)` with `maxImages = CameraConfigHelper.getConfigValue(KEY_PREVIEW_MAX_IMAGES, 20)` = **0x14** (20-deep pool).
  *(Carriers NOT in logcat — `onImageAvailable`/`createImageReader`/`newInstance` = 0 hits all 3 runs; values from static/E2, not runtime-observed.)*
- Native gralloc handle reachable via the JNI symbol **`nativeGetOplusHardwareBuffer`** in
  `libandroid_runtime.so` (confirmed present in OOS — doc-46 Addendum A). *(Symbol-scan oracle; 0 runtime log hits.)*

**What leaves (down to C6 APS / D4 render):**
- Java carrier `ImageReader$SurfaceImage.getOplusHardwareBuffer() : HardwareBuffer` — the OEM bridge method.
  **OBSERVED-EFFECTIVE (negative-evidence):** the OCS fallback log `"getOplusHardwareBuffer has exception, use
  getHardwareBuffer"` is **ABSENT in all 3 runs** (0 hits run1/run2/run3) ⇒ bridge does NOT fall back to AOSP
  `Image.getHardwareBuffer()` (the #7 "AOSP-fallback" framing stays **REFUTED**). The native-path enter is itself
  app-side dark (0 `getOplusHardwareBuffer` hits) — effectiveness is inferred from absence-of-fallback, not a direct enter tag.
- Consumed by `Util.getHardwareBuffer` → wrapped into **`ApsResult$ImageBuffer.<init>`** (the per-frame input buffer object).
- Ref-counting carriers: `APSClient$MetaImageRefCounter.setMetaImageRef(Object,String,Z) : Z` (incref) and
  **`APSClient$MetaImageRefCounter.decMetaRefZeroToRemove(J,I,I) : V`** (decref + `Image.close()` at zero) — the
  latter is a **pure native JNI upcall** for preview (ZERO Java callers in preview path; doc-44 U6).
  *(Java side dark — 0 logcat hits; the held-input CONSEQUENCE is OBSERVED natively, see next bullet.)*
- **OBSERVED held-input choke (`app_backtrace.txt`, debuggerd -b on pid 4740, N=3 STABLE):** thread
  **`"previewManagerR"` (sysTid 9795) is PARKED** at `syscall → __futex_wait_ex → pthread_cond_wait →
  APSPreviewManager::previewManagerRoutine(void*)+1560` in `/odm/lib64/libAlgoProcess.so`
  **BuildId `82fe443b408f8ed027558b0d4ffb1500`** (1/1 per run, all 3 runs). This is the input-release victim end
  of this contract: the consumer thread that returns Images to the 20-deep pool is wedged on its condvar, i.e.
  the native release upcall that would `Image.close()` the held input is not arriving.
- Enqueue carrier: native `APSClient.addPreviewFrameBuff(ApsPreviewParam, ApsWatermarkParam) : I` — return `0`
  ⇒ input HELD (ref-counted); return `!=0` ⇒ `onAddImageToApsFail` closes the input immediately (Java).
  *(0 logcat hits — app-side dark.)*
- Result carrier (downstream): `ApsProcessor$ApsServiceListener.onPreviewReceived(ApsResult, ApsTotalResult)` →
  `ConsumerImpl.onPreviewReceived`, which handles `mRefHardwareBuffer`/`setImageReader`/`getImageBuffer` and gates
  on **`mPreviewErrorCode` / `mFrameworkErrorCode`** (NOT on `ApsResult.mMetadata`).

> **G-MECH (runtime↔RE pairing):** the OBSERVED parked `previewManagerRoutine+1560 @ pthread_cond_wait` (BuildId
> `82fe443b…`) is the exact freeze victim predicted by the static RE — `decmetarefzero-upcall-RE.md` (libAlgoProcess
> `82fe443b…`) §"Calling thread / context": `previewManagerRoutine` (Ghidra `0x2aa694` / file `0x1aa694`) is the
> *downstream victim* that parks at `pthread_cond_wait(this+0x17c)` when the `isInc=false` decref upcall
> (`ApsCallbackMetaRefInc::callbackToCamUnit` @ file `0x31fa1c` → `gCallbackRequestAction`, the C6/D2 root) never
> fires. Runtime backtrace = static prediction, BuildID-matched.

## (b) Environment dependencies

- `/system` binary `libandroid_runtime.so` exporting the OEM JNI **`nativeGetOplusHardwareBuffer`**, registered
  into `android_media_ImageReader.cpp`'s method table (the AOSP `.cpp` is the byte-identical crash site; the
  symbol is the additive delta). OOS ships it (doc-46); LOS AOSP does NOT.
- The `frameworks/base` Java side `ImageReader$SurfaceImage.getOplusHardwareBuffer()` — supplied on our build by
  the **E2 bridge `9d03af1`** (= reapply of v16 `237dc3e`; v18 carries it as `9d03af14`, cleaner-less — doc-43).
- The preview ImageReader pool depth `KEY_PREVIEW_MAX_IMAGES=20` (config, byte-identical OOS↔LOS).
- No linker-namespace / sepolicy dependency at this boundary (Java→AOSP-native JNI, same process); the gralloc
  namespace concern belongs to **D1/E4**, not D3.

## (c) Fact-to-resolve

**Q: On our infiniti build, does `getOplusHardwareBuffer` execute its native path (`nativeGetOplusHardwareBuffer`
present + effective), or does it throw and fall back to AOSP `Image.getHardwareBuffer()`?**
- **Answer = "executes, no fallback"** (current evidence, doc-43 addendum: the crash backtrace shows the JNI
  executing into the native method; the OCS "getOplusHardwareBuffer has exception, use getHardwareBuffer" log is
  ABSENT). ⇒ Predicts #7's "AOSP-fallback lacks OnePlus gralloc metadata" is the WRONG framing → **closes #7 as a
  root**, redirects the freeze (#1) hunt to the native `decMetaRefZeroToRemove` upcall (C6/D2). Action unlocked:
  stop chasing the buffer-fetch; instrument the native input-release.
- **Answer = "throws → AOSP fallback"** would predict an `ApsResult$ImageBuffer` built over a metadata-less buffer
  → NN OUTPUT ERROR → input never closed → 20-pool exhaustion. Action: confirm/repair the E2 bridge symbol.

The bridge-presence sub-question is **answered** (present, `9d03af1`); the OPEN remainder is the downstream
release, owned by C6/D2 — D3 itself is not the root.

## (d) Runtime probe(s)

- **`tools/observability/frida/probe_getoplushwbuffer.js`** — Java-layer hook on
  `ImageReader$SurfaceImage.getOplusHardwareBuffer` + `Util.getHardwareBuffer` + the `ApsResult$ImageBuffer.<init>`
  wrap; counts native-path vs catch/fallback and pool occupancy. **Lever: PARTIAL/DARK** (lever-index row
  `frameworks/base`): Java layer is frida-hookable; the native `nativeGetOplusHardwareBuffer` side is **DARK** (no
  setprop verbosity) → confirm-by-symbol-scan + the AB-RUNBOOK debug-image recipe (`LOG_NDEBUG 0` in
  `android_media_ImageReader.cpp` + `ALOGV` in the JNI path).
- **`tools/observability/frida/trace_preview_delivery.js`** — the `onImageAvailable → addPreview → ImageBuffer`
  delivery chain (Gate-B starvation, doc-47). **Lever: FRIDA-ONLY** — note the hot `getOplusHardwareBuffer` path
  crashes ART GC under frida (doc-43), so prefer native `Interceptor.attach` or a reconfigure-trigger.
- **G4 baseline** (`capture/ab_capture.sh` working-state) is the freeze denominator this node's symptom is diffed
  against — currently **uncaptured** (gap G4).

## (e) Dodge-vs-dirty diff

Not an E-node — no dodge oracle owned here. The facilitation that backs this boundary is **E2** (the
`frameworks/base` `getOplusHardwareBuffer` bridge); per doc-46 Tier-1 it is `D+O` and **already landed `9d03af1`**.
The E2 node owns the dodge-vs-dirty verdict for the bridge symbol. D3 only records: bridge is present on our
build and (per backtrace) effective — see E2 for the oracle diff.

## (f) Symptom leaves

- **#7 getOplusHardwareBuffer → NN OUTPUT ERROR → pool exhaustion** — **PROXIMATE-SITE here, but REFUTED as a
  root.** The crash backtrace shows the bridge executing (no fallback), and `ConsumerImpl.onPreviewReceived` gates
  on `mPreviewErrorCode`/`mFrameworkErrorCode`, not on `mMetadata` (doc-44 U6). The "20-pool exhaust at ~frame 19"
  gradual-leak model was **refuted on-device** (a threshold-3 `metaBufferMap` drain still froze — doc-43/44): the
  stop is **single-shot**, not progressive. Edge → the real root is the native **`decMetaRefZeroToRemove`** upcall
  being skipped (owned by **C6** / **D2** — incomplete decision from missing AEC-stats vendor tags), with the
  bridge symbol itself supplied by **E2**.
- **#1 preview freeze (frame-1 stall)** — **STALL propagates THROUGH D3** (the input Image enters here on the
  success path and is held pending a native release that never arrives), but D3 is **not the root**. Edge → root
  at **C6/D2** (`decMetaRefZeroToRemove` JNI upcall never made). D3 is the observable choke point (`ApsResult$ImageBuffer`
  instances accumulate in the 20-deep pool) where the upstream-of-release re-scope (doc-44: app stops *submitting*
  after ~1 frame; output-starvation, not input-pool exhaustion) is measured.
