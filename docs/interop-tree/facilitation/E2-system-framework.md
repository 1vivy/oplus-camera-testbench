<!-- Parent: ../INDEX.md -->
---
node: E2
title: "/system framework edits (frameworks/av + base + native) — ext factory / JNI bridge / BINDER_VM_SIZE"
plane: facilitation
partition: /system
blob_identical_oos_los: false   # these are SOURCE patches, not blobs; the question is apply+effect, not blob delta
characterization: CHARACTERIZED  # host symbol scan + dodge-vs-dirty diff OBSERVED every (a) carrier (ext strings absent, JNI present, libcsextimpl absent) — E-node oracle map complete
conviction: CONVICTED            # E-node A/B = dodge-oracle vs our-dirty, run on stock; mechanism directly observed (av/0001 NOT applied, base/0001 effective)
verdict: "SPLIT (host symbol scan 2026-06-13): av/0001 OEM ext factory NOT applied to our source — frameworks/av source has 0 CameraServiceExt/csextimpl, and the built cameraserver (4MB, CameraService statically linked, 103 CameraService strings) has 0 ext/identity strings + libcsextimpl.so absent from the whole out tree => the OEM CameraServiceExt layer (G5) is genuinely missing from our build (root for #8 beforeConfigureStreamsLocked, contributes #4 result-lifetime). base/0001 JNI bridge IS effective — nativeGetOplusHardwareBuffer present in frameworks/base source AND in built libandroid_runtime.so => #7 'bridge absent' REFUTED. The defect is INCONSISTENT patch application (base patch landed, av patch did not)."
confidence: high
symptoms: [7, 4, 1, 3]
probes: [G1, G5, r4-oem-transact, probe_getoplushwbuffer.js]
gaps: [G1, G5]
dodge_ref: "dodge-camera-port/repos/patches-crdroid/patch-dodge/{frameworks,av;frameworks,base;frameworks,native}/*.patch"
dirty_ref: "op15-camera-porting/patches-crdroid/patch-dodge/{frameworks,av;frameworks,base;frameworks,native}/*.patch"
divergence: "differs (apply-state; conviction CONVICTED) — av/0001: files sha256-identical but NOT applied to source (0 CameraServiceExt in frameworks/av; 0 ext/identity strings in built cameraserver; libcsextimpl absent) = apply-state divergence; base/0001: applied + effective (nativeGetOplusHardwareBuffer in source + libandroid_runtime.so)"
upstream: [E1]
downstream: [C2, C3, D3, D4]
refuted_refs: []
doc_refs: [doc-48, doc-47, doc-46]
updated: 2026-06-13
---

# E2 — /system framework edits (av / base / native)

The three /system source patches our port and dodge BOTH carry. Per the axiom, a patch *file* that is
byte-identical is not the root; the facilitation root is whether the patched **symbol/behavior is present
and reached at runtime in the infiniti build**. The diff below resolves the file question (identical); the
fact-to-resolve resolves the apply+effect question (unknown, and counter-evidenced for av/0001).

## ★ CONVICTED (host symbol scan + source grep, 2026-06-13) — the fact, resolved
Method (no device): scanned the built out tree `~/android/lineage/out/target/product/infiniti` (build dated
Jun 11, the state after v19) + the `~/android/lineage/{frameworks/av,frameworks/base}` source.

| Patch | Source has it? | Built artifact has it? | Verdict |
|---|---|---|---|
| **av/0001** OEM ext factory | **NO** — `grep CameraServiceExt frameworks/av/services/camera/libcameraservice` = 0; git log = clean lineage-23.2+android-16.0.0_r4, no patch-dodge commit | **NO** — `cameraserver` (4MB, CameraService static-linked: 103 `CameraService` strings, `Camera3Device`, `CameraHal::configureStreams`) has **0** `OplusCameraService`/`CameraServiceExtImpl`/`csextimpl`/`beforeConfigureStreamsLocked`/`CameraServiceExtFactory` strings AND **0 oplus identity strings**; `libcsextimpl.so` absent from entire out tree | **NOT APPLIED → NOT EFFECTIVE.** Our cameraserver is pure stock AOSP. |
| **base/0001** JNI bridge | **YES** — `getOplusHardwareBuffer` in `frameworks/base/core/jni/android_media_ImageReader.cpp` (2 hits) | **YES** — `nativeGetOplusHardwareBuffer` string present in built `system/lib64/libandroid_runtime.so` (dynsym empty as expected; JNI registered at runtime) | **APPLIED + EFFECTIVE.** |
| native/0001 BINDER_VM_SIZE | (not separately re-scanned) | — | file-identical; low-risk |

**The root:** the identical `patch-dodge/frameworks,av/0001` patch file exists in `op15-camera-porting/patches-crdroid`
but was **never applied to our `frameworks/av` source**, while `frameworks,base/0001` was applied. **Inconsistent
patch application** is the defect — exactly the "we did the framework differently" class. Consequence: the entire
OEM `CameraServiceExt` layer (G5) is absent from our build → no OEM binder 10000-10022 servicing, no Depth-1/2
`beforeConfigureStreamsLocked` (the #8 8K candidate), no OEM identity tagging; `libcsextimpl.so` (dropped `d654641`)
has no caller regardless.

**The facilitation fix (do it like the reliable reference):** apply `frameworks,av/0001` to the infiniti
`frameworks/av` source (and re-add `libcsextimpl.so`, reversing `d654641`), then rebuild — and verify by re-running
this scan (cameraserver should then carry `CameraServiceExt*`). base/0001 needs no action (already effective →
#7's "bridge absent" is **refuted**; #7's true root, if it still occurs, is downstream of the present bridge).

## (a) Propagation contract

**What enters (the carriers these patches create/cross):**
- `frameworks/av/0001` — ext factory: stub class `android::ICameraServiceExt` (empty no-op ctor/dtor,
  `ext/ICameraServiceExt.cpp`); factory `android::CameraServiceExtFactory::{getInstance,onTransact,ensureLoaded}`
  (`ext/CameraServiceExtFactory.cpp`) that `dlopen("system_ext/lib64/libcsextimpl.so")`, `dlsym("getExtFactoryImpl")`
  (triple-deref to the factory fn) + `dlsym("_ZN7android20CameraServiceExtImpl10onTransactEjRKNS_6ParcelEPS1_j")`.
- Hook `CameraService::onTransact` → `CameraServiceExtFactory::onTransact(code,data,reply,flags)==0` short-circuit
  (services OEM binder codes incl. **10015 SEND_OPLUS_EXT_CAM_CMD**, zoom; see doc-48 G5 map).
- New `CameraSessionStats` constants `CAMERA_STATE_EXCEPTION=4`, `CAMERA_STATE_SESSION_CONFIGURED=5`,
  `CAMERA_STATE_FIRST_FRAME_ARRIVED=6` (linker symbols the ext requires).
- OxygenOS-shaped overloads: `camera3::collectReturnableOutputBuffers(...,int extraParam)` (uint64→size_t surface
  remap) and 4-arg `CameraProviderManager::getCameraCharacteristics(id,bool,CameraMetadata*,int)`.
- `frameworks/base/0001` — JNI bridge: Java `ImageReader$SurfaceImage.getOplusHardwareBuffer()` +
  `private native HardwareBuffer nativeGetOplusHardwareBuffer()`; native `Image_getOplusHardwareBuffer`
  registered as `{"nativeGetOplusHardwareBuffer","()Landroid/hardware/HardwareBuffer;"}` in `gImageMethods`;
  private `HardwareBuffer(long nativeObject, boolean isGraphicBufferHolder)` ctor (`(JZ)V`, skips
  nEstimateSize/registerNativeAllocation; null-`mCleaner` finalize guard); `SurfaceView.setExcludeSnapshot(boolean)`.
- `frameworks/native/0001` — `#define BINDER_VM_SIZE` in `libs/binder/ProcessState.cpp` 1MB→4MB
  (`(4*1024*1024)-sysconf(_SC_PAGE_SIZE)*2`).

**What leaves (downstream consumers):**
- `CameraServiceExtFactory::onTransact` → C3 (cameraserver OEM channel) → the OCS SDK `OplusCameraManager`
  100xx binder protocol on `media.camera` (C2).
- `nativeGetOplusHardwareBuffer` → D3 `getOplusHardwareBuffer` returns an `sp<GraphicBuffer>` holder layout
  the OnePlus APS side reads (vs AOSP `getHardwareBuffer` → APS reads malformed `camera_metadata` size).
- BINDER_VM_SIZE 4MB → larger parcels for RAW/Master-mode result delivery (D3/D4).

## (b) Environment dependencies
- **`/system_ext/lib64/libcsextimpl.so`** — the dlopen target of `CameraServiceExtFactory::ensureLoaded`;
  exports `getExtFactoryImpl` + `CameraServiceExtImpl::onTransact`. Baseline: present on OOS (4 cameraserver
  `/proc/maps` mappings); **LOS absent — dropped in commit `d654641`** (doc-48; baseline L55).
- **cameraserver `/system/bin`** must be the patched libcameraservice build (system bin, no overlay push).
- **`libandroid_runtime.so`** must register `nativeGetOplusHardwareBuffer` (base/0001 JNI table edit).
- The `vendor.oplus.hardware.sendextcamcmd-V*` HAL backend (present in `vendor/oneplus/infiniti/proprietary`,
  doc-48) for the Depth-1 cmd channel to actually do work once a receiver exists.

## (c) Fact-to-resolve
**Are the (byte-identical) av/0001 + base/0001 patches actually APPLIED and EFFECTIVE in our infiniti build —
i.e. is `nativeGetOplusHardwareBuffer` JNI-registered and is `CameraServiceExtFactory::onTransact` reached at
runtime — or are they present only as patch FILES that did not land in the shipped /system images?**
- **If the symbols are present + reached** → divergence is truly `same`; E2 contributes nothing to #4/#7/#1
  and the root sits elsewhere (C3 Depth-2 hooks, /vendor-config). Action: close E2 as benign.
- **If absent at runtime** (the doc-48 + baseline prediction: stock `frameworks/av`, 0 ext call sites,
  `libcsextimpl` gone `d654641`, `frameworks/av` md5 ≠ stock but with NO oplus code) → the identical patch FILE
  is a false-friend; the real divergence is **apply/build**, not source. Action: verify the patch is in the
  device manifest/lineage tree and re-add `libcsextimpl` (reverse `d654641`) for av/0001; confirm base/0001
  `9d03af14` actually built into `libandroid_runtime`.

## (d) Runtime probe(s)
- **G5 / r4-oem-transact** — `r4-oem-transact/30_run_r4.sh` + `parse_r4.py`: confirm whether OEM 100xx codes
  return `UNKNOWN_TRANSACTION` (av/0001 onTransact hook NOT effective) vs serviced (effective). Lever **DARK**
  for /system frameworks/av (lever-index: no oplus instrumentation, md5 ≠ stock).
- **`frida/probe_getoplushwbuffer.js`** (TEST-PLAN row 8, symptom #7) — confirm `nativeGetOplusHardwareBuffer`
  present/absent on the LOS build (base/0001 effectiveness). Lever **PARTIAL** (Java hookable via frida;
  native registration scan).
- **G1 — `enable/20_system_framework.sh`** `log.tag.CameraService/Camera3-Device/Camera2-JNI VERBOSE`; if silent
  → eng /system debug image (`LOG_NDEBUG 0`) + flash is the only bridge (lever **DARK**, TEST-PLAN: eng image).
- Host-side now: `nm -DC`/symbol scan of the *built* `libcameraservice.so` + `libandroid_runtime.so` in our
  out/ or target images for `CameraServiceExtFactory` / `nativeGetOplusHardwareBuffer` (resolves apply without a device).

## (e) Dodge-vs-dirty diff  — PRIMARY

**Oracle:** `oplus-final/dodge-camera-port/repos/patches-crdroid/patch-dodge/frameworks,*/`
**Ours:** `op15-camera-porting/patches-crdroid/patch-dodge/frameworks,*/`

| Patch file | dodge sha256 | ours sha256 | verdict |
|---|---|---|---|
| `frameworks,av/0001-CameraService-Add-OnePlus-camera-extension-support-f.patch` | `15b3171b…f076f` | `15b3171b…f076f` | **IDENTICAL** |
| `frameworks,av/0002-Add-some-logging.patch` | `5786234e…7a0` | `5786234e…7a0` | **IDENTICAL** |
| `frameworks,base/0001-AHardwareBuffer-fixes-for-OnePlus-13-stock-Camera.patch` | `022f82cd…f89d` | `022f82cd…f89d` | **IDENTICAL** |
| `frameworks,native/0001-Increase-BINDER_VM_SIZE-from-1MB-to-4MB.patch` | `fd45f9c6…f9f2d` | `fd45f9c6…f9f2d` | **IDENTICAL** |

**Verdict: `same(content)` — 4/4 patch files byte-identical (full sha256 match each).** Same authors
(Hecheng Yu av/0001 d6654b3; spkal01 base/0001 936aaf4; Kill3rEz native/0001 182e2e9), same git format-patch,
same diff bodies. The file-level divergence is **zero**.

**The correct (dodge) form** is exactly what both sides hold at file level. But "correct file" ≠ "correct build":
- av/0001 only *dlopen-bridges* to `libcsextimpl.so` and *delegates* onTransact (Depth-1). It does **not** add the
  Depth-2 `CameraServiceExtImpl` internal call sites (`beforeConfigureStreamsLocked`, `getExtensionOperatingMode`,
  `processPreview`, `beforeMetadataSendToApp`) — **neither dodge nor we have those** (doc-48). So even fully applied,
  av/0001 services only the binder codes the SDK sends, never the stream/preview hooks.
- **Counter-evidence that ours is NOT applied/effective:** doc-48 + lever-index + baseline say our shipped
  `frameworks/av` is **stock (0 ext call sites, `grep -c` CameraService.cpp = 0)**, `libcsextimpl.so` is **dropped
  (`d654641`)** and **absent** from LOS cameraserver maps (baseline: OOS had 4 mappings). The base/0001 JNI bridge
  was nominally added in `9d03af14` but is **unproven** (attribution-matrix #7). So the patch file existing in the
  port tree is **not** evidence it landed in the device's /system images.

⇒ This is the textbook facilitation false-friend: **divergence at the FILE layer = none (`same`); divergence at
the APPLY/RUNTIME layer = `unknown`**, with active counter-evidence pointing at NOT-effective. Cross-link:
`DODGE-VS-DIRTY.md` (this is the first facilitation entry — av/0001 ext, base/0001 JNI, native/0001 binder).

## (f) Symptom leaves
- **#7 getOplusHardwareBuffer fallback — ROOT here (if base/0001 not effective).** PROXIMATE site is D3
  (SDK takes AOSP `getHardwareBuffer` fallback → Infiniti NN OUTPUT ERROR → `ApsResult$ImageBuffer` pool
  exhaustion); ROOT = `nativeGetOplusHardwareBuffer` JNI absent at runtime (attribution-matrix #7, CONVICTED
  /system). Edge: #7 → feeds **#1** (preview freeze) — pool-exhaust starves the APS release path.
- **#4 copyMetadata UAF — PROXIMATE D2 (`APSMetadata::copyMetadata+60`), ROOT C3/frameworks-av result
  lifetime.** av/0001's `collectReturnableOutputBuffers` OxygenOS overload + ext result hooks are the buffer/
  result-lifetime surface; if the ext layer is absent, AOSP frees `camera_metadata` sooner than the OnePlus
  contract (attribution-matrix #4, CONVICTED /system). Edge: → C3/C4 result lifetime.
- **#1 preview freeze — PROXIMATE D2 (APS holds frame 1), ROOT OPEN (env buffer path).** E2 contributes via the
  #7 buffer-layout edge (base/0001) — if effective, supplies the sp<GraphicBuffer> holder APS expects. Edge: #7→#1.
- **#3 over-exposure — PROXIMATE D4 (no tonemap), ROOT E1 (`OplusEdrUtils` stub) + display HAL.** E2's
  `SurfaceView.setExcludeSnapshot` is a no-op stub here; the real over-exposure root is E1/display-HAL, NOT E2.
  Listed only because base/0001 touches `SurfaceView`; E2 is NOT the root for #3.
