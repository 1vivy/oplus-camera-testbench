<!-- STATUS: PLAN/INFERRED — this manifest specifies exactly how to land R2 (av/0001 + reverse d654641).
     The measured facts it cites (patch sha256, blob md5, 0 ext call sites in built cameraserver, libcsextimpl
     absent from out tree) are evidence-anchored observations from F2. All "what it lands," step-by-step
     procedures, interlock checks, and "what R2 does and does NOT unblock" are forward plan and design
     specification — not verified outcomes. Nothing in this manifest has been applied. -->
<!-- Parent: ./IMPLEMENTATION-PLAN.md (row 1, R2) -->
<!-- Source-of-truth: ../docs/facilitation/F2-system-framework.md §R2 · ../docs/re-notes/oem-binder-ontransact-RE.md -->
<!-- Build contract: ../docs/facilitation/BUILD-ORDER.md interlocks I1, I6 · BUILD-ORDER edge 2/3 -->

---
title: "R2 APPLY MANIFEST — land the OEM media.camera Depth-1 receiver (av/0001 + reverse d654641)"
plane: implementation
date: 2026-06-14
req: R2
owning_F_node: F2
status: READY (CONVICTED-NOT-APPLIED → this is the TOP single action)
note: >
  STAGE/DESIGN ONLY. This manifest documents EXACTLY what to do to land R2; it does NOT apply anything.
  The patch files are staged read-only under ./patches/. Applying them touches the external LOS source
  tree (lineage frameworks/av) + ~/vendor_oplus_camera — out of scope for this staging dir.
---

# R2 Apply Manifest — the TOP single action

R2 is **CONVICTED-NOT-APPLIED**: the `frameworks,av/0001` patch file is **byte-identical** dodge↔ours
(sha256 `15b3171b…f076f`) but was **never applied** to our `frameworks/av` source — our built `cameraserver`
is **pure stock AOSP** (4MB, 103 `CameraService` strings, **0** `OplusCameraService`/`CameraServiceExtImpl`/
`csextimpl`/`beforeConfigureStreamsLocked`/`CameraServiceExtFactory`), and `libcsextimpl.so` is **absent from
the whole out tree** (dropped `d654641`). Consequence: every OEM 100xx binder → `UNKNOWN_TRANSACTION −38`.
Landing R2 = apply av/0001 **AND** reverse `d654641`. Both halves are required (the patch dlopens a blob that
must be back in the image).

## Staged artifacts (this dir — read-only, sha256-verified)

| Staged file | sha256 | role |
|-------------|--------|------|
| `patches/frameworks-av-0001-CameraService-Add-OnePlus-camera-extension-support.patch` | `15b3171b…f076f` | **R2 Depth-1 receiver** (the load-bearing patch) |
| `patches/frameworks-av-0002-Add-some-logging.patch` | `5786234e…7a0` | optional logging companion (apply after 0001) |
| `patches/frameworks-base-0001-AHardwareBuffer-fixes.patch` | `022f82cd…f89d` | already applied+effective on our tree (X3/#7 REFUTED) — staged for completeness, NOT re-applied for R2 |
| `patches/frameworks-native-0001-Increase-BINDER_VM_SIZE.patch` | `fd45f9c6…f9f2d` | file-identical adopt (BINDER_VM_SIZE 1→4MB) — independent of R2, stage+verify it built |

> sha256 values match the F2 board (`F2-system-framework.md` §"Dodge file-content evidence") exactly. The
> divergence is **APPLY-STATE, not file content** — so these are a *proof-of-form oracle*, applied to the LOS
> source, never byte-copied into a blob.

---

## Step 1 — apply av/0001 to the LOS `frameworks/av` source

**Target tree:** the LineageOS `frameworks/av` project (external — `~/android/lineage/frameworks/av`, NOT under
oplus-final). **Apply:** `git am < frameworks-av-0001-*.patch` (or `git apply`/`patch -p1`).

**What it lands (12 files, +236/−1):**

| File | Change |
|------|--------|
| `services/camera/libcameraservice/ext/CameraServiceExtFactory.cpp` (**new**, 103 L) | `dlopen("system_ext/lib64/libcsextimpl.so", RTLD_NOW)`; `dlsym(getExtFactoryImpl)` **triple-deref** to the factory; `dlsym` the mangled `onTransact`; provides the function table OOS expects |
| `services/camera/libcameraservice/ext/ICameraServiceExt.cpp` (**new**, 16 L) | empty `ICameraServiceExt` ctor/dtor to satisfy linker symbols the extension needs |
| `services/camera/libcameraservice/ext/include/{CameraServiceExtFactory.h,ICameraServiceExt.h}` (**new**) | headers |
| `services/camera/libcameraservice/Android.bp` | adds `ext/ICameraServiceExt.cpp` + `ext/CameraServiceExtFactory.cpp` to `srcs` |
| `services/camera/libcameraservice/CameraService.cpp` | `#include "ext/include/CameraServiceExtFactory.h"`; in `CameraService::onTransact` — **delegate first**: `if (CameraServiceExtFactory::onTransact(code, data, reply, flags) == 0) return NO_ERROR;` before falling through to `BnCameraService::onTransact` |
| `camera/CameraSessionStats.cpp` + `camera/include/camera/CameraSessionStats.h` | add `CAMERA_STATE_EXCEPTION=4`, `CAMERA_STATE_SESSION_CONFIGURED=5`, `CAMERA_STATE_FIRST_FRAME_ARRIVED=6` (the extension references these) |
| `services/camera/libcameraservice/common/CameraProviderManager.{cpp,h}` | 4-arg `getCameraCharacteristics` overload matching the extension's expected signature |
| `services/camera/libcameraservice/device3/Camera3OutputUtils.{cpp,h}` | OxygenOS-compatible `collectReturnableOutputBuffers` overload for the extension's buffer handling |

**Then (optional):** `git am < frameworks-av-0002-Add-some-logging.patch` for the per-code `onTransact` logging.

## Step 2 — reverse `d654641` (re-add `libcsextimpl.so` to the image)

`d654641` **dropped** `libcsextimpl.so` from the build (and there are no refs in camera-sm8850 /
proprietary_vendor). av/0001's `dlopen("system_ext/lib64/libcsextimpl.so")` is **dead** unless the blob is
back in the image and labeled. Three sub-edits (target tree: `~/vendor_oplus_camera`, external):

1. **Re-add the blob to `proprietary-files.txt`** — append, matching the existing system_ext lib form:
   ```
   my_product/lib64/libcsextimpl.so:system_ext/lib64/libcsextimpl.so;DISABLE_CHECKELF
   ```
   (mirrors lines 11–18: `my_product/lib64/lib*.so:system_ext/lib64/lib*.so;DISABLE_CHECKELF`). The blob is
   available — present in the stock dump (`dump201_full/system_ext/lib64/libcsextimpl.so`, 1,491,032 B, md5
   `d773133f369d8abf6515dfcaeb6fb208`, BuildID md5 `4b6bc39077262e8aa8bbdbc013bda310`) and was a built
   intermediate. Re-extract via `extract-files.py` from a `16.0.7.201` (or matching) OOS image.
2. **`PRODUCT_PACKAGES`** — ensure the lib is pulled into `system_ext` (the `opluscamera.mk` `PRODUCT_PACKAGES +=`
   blocks, or the proprietary-files auto-package path; confirm it installs to `system_ext/lib64/`).
3. **Label it (F4 / I6)** — give `system_ext/lib64/libcsextimpl.so` the loading-domain label so cameraserver's
   dlopen-by-leaf succeeds (the `same_process_hal_file` / sphal namespace family — cross-ref F4 `.te` +
   public.libraries discipline). Without the label: `vndksupport … sphal … not found` and/or `cameraserver avc
   denied {read}` even with the blob present.

> **Interlock I1 (must hold).** av/0001's `dlsym` targets must match the blob's exports **exactly**:
> `getExtFactoryImpl` (triple-deref to the factory) and the mangled
> `_ZN7android20CameraServiceExtImpl10onTransactEjRKNS_6ParcelEPS1_j`. Mangling/ABI drift between the patched
> `frameworks/av` and the prebuilt blob ⇒ `dlsym` returns NULL ⇒ the factory short-circuit never engages ⇒
> every 100xx still returns `−38`. The blob is pinned to `16.0.7.201` — re-verify with `nm -DC libcsextimpl.so`
> if the OOS level changes.
>
> **Interlock I6 (must hold).** The blob needs **both** the label (fixes `avc denied {read}` on `vendor_file`)
> **and** the namespace/public.libraries entry (fixes dlopen-by-leaf `not found`). One without the other still
> fails at runtime.

## Step 3 — BINDER_VM_SIZE (native/0001, independent of R2 but co-staged)

Apply `frameworks-native-0001-Increase-BINDER_VM_SIZE.patch` to the LOS `frameworks/native` tree
(`libs/binder/ProcessState.cpp`: `(4*1024*1024) − sysconf(_SC_PAGE_SIZE)*2`). File-identical adopt, low-risk;
larger parcels for RAW/Master-mode result delivery. **Verify it built into the shipped `libbinder`.**

---

## Verification (after build — the R2 conviction)

Run the `r4-oem-transact/` kit both sides (`~/op15-camera-porting/tools/observability/r4-oem-transact/30_run_r4.sh`
→ `parse_r4.py`). The three decisive checks (BUILD-ORDER I1/I6 + REQUIREMENTS R2):

1. **`grep CameraServiceExt` in the built `cameraserver` != 0.** Currently **0** (the CONVICTED-NOT-APPLIED
   state). After R2: `strings`/`nm -DC cameraserver` must carry `CameraServiceExt*` call sites.
2. **`libcsextimpl.so` mapped in `cameraserver` `/proc/maps`.** OOS = **4** mappings, LOS = **0** (the cheap
   A/B tell — `10_ext_presence.sh`). After R2 + `d654641` reversal: the blob maps under cameraserver, no
   `avc denied`, no `not found` (I6).
3. **100xx binder returns != −38.** Hook the SDK `OplusCameraManager.transact(100xx)` return status (e.g.
   10015 zoom): currently every OEM code → `UNKNOWN_TRANSACTION −38` while `mRemote != null`. After R2: the
   delegated codes return `NO_ERROR`/valid status (`onTransact` file `0x16f6f0` no longer hits `default:−38`).

Also confirm (I1 export-match): `nm -DC libcsextimpl.so` exports `getExtFactoryImpl` +
`_ZN7android20CameraServiceExtImpl10onTransactEjRKNS_6ParcelEPS1_j`.

## What R2 does and does NOT unblock

- **Unblocks (Depth-1):** the OEM `media.camera` binder channel — zoom (10015), auth/client-info handshake,
  the SDK's belief that the channel is live becomes TRUE. **Gates R4** (the Depth-2 hooks have no reach until
  this Depth-1 receiver + re-added blob exist — BUILD-ORDER edge 2).
- **Does NOT do (Depth-2):** av/0001 is **Depth-1 only** — it delegates `onTransact` but adds **0**
  `CameraServiceExtImpl` internal call sites. `beforeConfigureStreamsLocked` (8K retype), `getExtensionOperatingMode`,
  `processPreview`, `beforeMetadataSendToApp` are **R4** (author-new, RE-BLOCKED, gated behind this row). Landing
  R2 alone restores the OEM layer's existence but not the 8K stream-shaping — that is R4.

## Cross-links
- Plan row: `./IMPLEMENTATION-PLAN.md` §1 (R2) · staged patches: `./patches/`
- F-node: `../docs/facilitation/F2-system-framework.md` §R2 · interlocks: `../docs/facilitation/BUILD-ORDER.md` I1, I6
- RE: `../docs/re-notes/oem-binder-ontransact-RE.md` (Depth-1 dispatch + the 6 Depth-2 hooks)
- Spec: `../docs/interop-tree/REQUIREMENTS.md` R2
- d654641 recipe source: `~/op15-camera-porting/docs/rearch/48-media-camera-oem-transaction-receiver.md` §"Port recipe"
