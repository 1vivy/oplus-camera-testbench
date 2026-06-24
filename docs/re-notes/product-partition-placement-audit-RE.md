<!-- STATUS: SUPPORTED — static RE (device tree + extract-utils + SDK/APK baksmali) + OOS fstab proof + on-device verify (2026-06-24). SYSTEMIC ROOT: the LOS camera port applies a BLANKET `my_product/lib64/* -> system_ext/lib64/*` remap (vendor/oplus/camera/proprietary-files.txt, ~30 libs). On OOS those libs are visible at /product/lib64 via the my_product overlayfs mount; LOS has no my_product partition and no overlay, so /product/lib64 is empty of OEM camera libs. This BREAKS exactly the libs the OEM SDK selects by an absolute /product/lib64 PATH PROBE. Confirmed path-probed-and-broken: libApsFaceBeautyPreviewProductJni.so (=S9). All other my_product libs are loaded by BARE NAME via System.loadLibrary -> resolve from system_ext/lib64 fine -> NOT broken by the remap. -->
# /product (my_product) partition-placement audit: the systemic root behind S9

> Grounds **S9** (`../interop-tree/symptoms/S9-facebeauty.md`) and generalizes it. The face-retouch
> crash is the visible head of a **partition-placement divergence**: the LOS camera port remaps every
> OOS `my_product/lib64/*` camera blob to `/system_ext/lib64`, but the OEM SDK selects one of those
> libs (`libApsFaceBeautyPreviewProductJni.so`) by an **absolute `/product/lib64/` file-existence
> probe**. On OOS that path resolves via the **`my_product` overlayfs mount onto `/product`**; on LOS
> it does not exist → silent fall-through to the weaker in-APK lib → S9.
>
> Date: 2026-06-24 · Device: LOS (infiniti, CPH2745 .201), serial 3C15AT003ZB00000.
> Method: static RE — device tree (`vendor/oplus/camera`, `device/oneplus/{infiniti,sm8850-common}`),
> `tools/extract-utils`, baksmali of `com.oplus.camera.unit.sdk.jar` + `.adapter.jar` + `OplusCamera.apk`,
> OOS dump `dump300_full` (fstab + partition layout), LOS build out + adb on-device `ls`.
> OOS dump: `/srv/android/dumps/extracted/dump300_full` · LOS tree/out: `/srv/android/worktrees/lineage-infiniti`.

---

## 1. The RULE: how LOS places `my_product/lib64/*` blobs

**The placement is NOT driven by `device/oneplus/infiniti/proprietary-files.txt`** (that file references
`my_product` only 4× — all apps/permissions, no `.so`). The OEM camera blobs come from a **separate
port module**, wired in `device/oneplus/infiniti/device.mk`:

```
# Camera (Oplus camera port — dodge proof-of-form)
$(call inherit-product-if-exists, vendor/oplus/camera/opluscamera.mk)
```

The placement rule lives in **`vendor/oplus/camera/proprietary-files.txt`** as explicit `SRC:DST`
mappings. extract-utils derives the **destination partition from the FIRST path component of the DST**
(right of `:`) — `extract_utils/file.py`:

```python
self.src_parts = self.parts = self.dst.split('/')
if self.has_dst:
    self.src_parts = self.src.split('/')
self.partition = self.parts[0]          # <- partition = dst[0]
self.src_partition = self.src_parts[0]
```

So a line `my_product/lib64/X.so:system_ext/lib64/X.so` → `partition = "system_ext"`, and the generated
`vendor/oplus/camera/camera/Android.bp` emits a `cc_prebuilt_library_shared` with
`system_ext_specific: true`, `srcs: ["proprietary/system_ext/lib64/X.so"]`.

**The mapping (quoted, `vendor/oplus/camera/proprietary-files.txt`):** EVERY OEM camera lib is remapped
`my_product/lib64/* → system_ext/lib64/*`. Representative lines:

```
my_product/lib64/libApsFaceBeautyPreviewProductJni.so:system_ext/lib64/libApsFaceBeautyPreviewProductJni.so;FIX_SONAME
my_product/lib64/libApsSuperEISPreviewJni.so:system_ext/lib64/libApsSuperEISPreviewJni.so
my_product/lib64/libsingle_camera_bokeh_native.so:system_ext/lib64/libsingle_camera_bokeh_native.so
my_product/lib64/libarcsoft_wideselfie.so:system_ext/lib64/libarcsoft_wideselfie.so
my_product/lib64/libCombineLutJni.so:system_ext/lib64/libCombineLutJni.so
...   (~30 my_product/lib64 libs, ALL -> system_ext/lib64)
```

Contrast — **data/config** files from `my_product` ARE mapped to `/product` correctly:

```
my_product/etc/camera/cdr_aging_set.json:product/etc/camera/cdr_aging_set.json
my_product/etc/camera/engineer_camera_config.json:product/etc/camera/engineer_camera_config.json
```

**=> YES, there is a systematic `my_product → system_ext` remap, and it is applied uniformly to the
`my_product/lib64` LIBRARY set.** It is the correct default for LOS (which has no `my_product`
partition and no `/product` overlay) for any lib loaded **by name**, but it is **wrong** for any lib the
OEM selects **by an absolute `/product/lib64/` path**.

### Why OOS works and LOS doesn't (the mechanism — OOS fstab proof)

On OOS, `my_product` is a **logical (dynamic) partition mounted at `/my_product`**, then **overlayfs-
mounted onto `/product`** (`dump300_full` odm fstab, lines 82–83):

```
overlay-overlay /product/lib64 overlay ... lowerdir=/my_region/lib64:/my_preload/lib64:/my_product/lib64:/my_heytap/lib64:/my_stock/lib64:/my_engineering/lib64:/product/lib64
overlay-overlay /product/lib    overlay ... lowerdir=.../my_product/lib:.../product/lib
```

So on OOS a lib physically in `my_product/lib64/` is **visible at runtime as `/product/lib64/<lib>`**.
The real OOS `/product/lib64` ships **no** OEM camera libs natively (verified: `product/lib64` in the
dump has only stock AOSP libs) — they ALL arrive via this overlay. LOS has neither the `my_product`
partition nor the overlay, so `/product/lib64` is empty of OEM camera libs and any `/product/lib64/`
path-probe misses.

---

## 2. Inventory — OOS `my_product/lib64` camera/AI libs → LOS placement

OOS `dump300_full/my_product/lib64/` = **39 libs**; `my_product/lib/` (32-bit) = 2
(`libAPSClient-{cmd-,}jni.so`). LOS placement = **`/system_ext/lib64`** for every one carried by the
port (`out/.../system_ext/lib64/` + on-device `ls /system_ext/lib64` confirm). The 32-bit pair is also
carried (`my_product/lib64/libAPSClient-{cmd-,}jni.so:system_ext/lib64/...`). Libs in the OOS dump but
**not** in the port's proprietary-files (e.g. `libdolbyeffect_4.1.so`, `liboplusdolbyeffect_4.1.so`)
are **ABSENT** on LOS (non-camera audio path; out of scope).

| OOS lib (`my_product/lib64/`) | LOS path | how LOS loads it | satisfied? |
|---|---|---|---|
| **libApsFaceBeautyPreviewProductJni.so** | system_ext/lib64 | **PATH PROBE `/product/lib64/...`** | **NO — S9** |
| libApsSuperEISPreviewJni.so | system_ext/lib64 | `loadLibrary("ApsSuperEISPreviewJni")` | yes |
| libsingle_camera_bokeh_native.so | system_ext/lib64 | `loadLibrary("single_camera_bokeh_native")` | yes |
| libsingle_camera_bokeh2_native.so | system_ext/lib64 | `loadLibrary("single_camera_bokeh2_native")` | yes |
| libarcsoft_wideselfie.so | system_ext/lib64 | `loadLibrary("arcsoft_wideselfie")` | yes |
| libjni_wideselfie.so | system_ext/lib64 | `loadLibrary("jni_wideselfie")` | yes |
| libarcsoft_panorama_burstcapture.so | system_ext/lib64 | `loadLibrary("arcsoft_panorama_burstcapture")` | yes |
| libCombineLut.so / libCombineLutJni.so | system_ext/lib64 | `loadLibrary("CombineLutJni")` | yes |
| libOplusBlurPreviewJNI.so | system_ext/lib64 | `loadLibrary("OplusBlurPreviewJNI")` | yes |
| libMsEffectSdk.so | system_ext/lib64 | `loadLibrary("MsEffectSdk")` | yes |
| liblivephoto.frc.jni.so | system_ext/lib64 | `loadLibrary("livephoto.frc.jni")` | yes |
| libAvatarEngineRender(Native).so | system_ext/lib64 | `loadLibrary("AvatarEngineRender*")` | yes |
| libst_mobile.so / libst_sticker_jni.so | system_ext/lib64 | `loadLibrary("st_mobile"/"st_sticker_jni")` | yes |
| libAnc* (Filter/HumBokeh/HumanVideo/…) | system_ext/lib64 | `loadLibrary("Anc*")` | yes |
| libAPSClient-{jni,cmd-jni,alog-jni}.so | system_ext/lib64 | `loadLibrary("APSClient-*")` | yes |
| libFileExtender-jni / libHdrTransform-platform-jni | system_ext/lib64 | `loadLibrary(...)` | yes |
| libXDocProcessSDK(-jni)/libYTCommon/libmpbase/libextendfile/libSuperTextWrapper | system_ext/lib64 (`_system_ext` suffix variants) | `loadLibrary(...)` | yes |

**Why only the FaceBeauty lib breaks:** `System.loadLibrary("X")` resolves a **bare** soname through the
app's classloader namespace + the default linker namespace, both of which search `/system_ext/lib64`
for a `system_ext` priv-app — so the remap is transparent for every bare-name load. **Only an absolute
`/product/lib64/` path probe** is sensitive to the physical partition, and only **one** lib is selected
that way.

`HdrTransformPlatform` references `/odm/lib64/libOPAlgoCamHDRTransformCamera.so` by absolute path, but
that lib ships to `/odm/lib64` on LOS (odm proprietary-files line 994) → probe **satisfied** (and it is
a capability gate, not lib-selection).

---

## 3. Probe-by-path / fallback selection (SDK jar + adapter jar + APK)

Baksmali of `com.oplus.camera.unit.sdk.jar` (and `.adapter.jar`) — **all** hardcoded absolute lib paths:

```
/product/lib64/libApsFaceBeautyPreviewProductJni.so          <- selection probe (BREAKS on LOS)
/system_ext/lib64/libApsFaceBeautyPreviewJni.qti.so          <- selection probe step-2 (QCOM)
/system_ext/lib64/libApsFaceBeautyPreviewJni.trustonic.so    <- selection probe step-2 (Unisoc/trustonic)
/odm/lib64/libOPAlgoCamHDRTransformCamera.so                 <- capability gate (satisfied on LOS)
```

`OplusCamera.apk` (31 dex) hardcodes only `/odm/lib64/libOPAlgoCamHDRTransformCamera.so` (satisfied).

**The one S9-class chain — `OplusFaceBeautyPreview.<clinit>` (QCOM branch, infiniti is QCOM):**

```
isQcomPlatform()? -> :cond_2f
  if isFileExist("/product/lib64/libApsFaceBeautyPreviewProductJni.so")
        -> loadLibrary("ApsFaceBeautyPreviewProductJni")     [OOS hits this via overlay; GUARDED lib]
  elif isFileExist("/system_ext/lib64/libApsFaceBeautyPreviewJni.qti.so")
        -> loadLibrary("ApsFaceBeautyPreviewJni.qti")        [not shipped]
  else  loadLibrary("ApsFaceBeautyPreviewJni")               [in-APK lib/arm64-v8a/libApsFaceBeautyPreviewJni.so — UNGUARDED -> S9]
```

LOS state (on-device verified): `/product/lib64/libApsFaceBeautyPreviewProductJni.so` **ABSENT**;
`/system_ext/lib64/libApsFaceBeautyPreviewProductJni.so` **present** (781505 B). Probe step-1 misses
(wrong partition), step-2 misses (the SDK looks for `...PreviewJni.qti.so`, not the `...ProductJni.so`
filename LOS installed) → fall-through to the in-APK `libApsFaceBeautyPreviewJni.so`, which lacks the
`FBInitFlag`/`Slender2D_init` guard → all-zero `FaceBeautyParams` → `lib2DSlender adjustParam+836`
SIGSEGV. This is the **only** lib chosen by an existence-probe whose LOS placement does **not** satisfy
the probe. Every other OEM camera lib is name-loaded and unaffected.

---

## 4. Ranked candidate table

| # | lib | OOS path (overlay→runtime) | LOS path | probe path | satisfied? | impact / feature | symptom | fix |
|---|---|---|---|---|---|---|---|---|
| **1** | **libApsFaceBeautyPreviewProductJni.so** | my_product/lib64 → **/product/lib64** | /system_ext/lib64 | **`/product/lib64/...ProductJni.so`** (SDK `<clinit>`) | **NO** | face-retouch preview loads weak in-APK lib → all-zero params | **S9** (PINNED) | place/symlink Product lib at `/product/lib64/` (see §5) |
| 2 | libApsSuperEISPreviewJni.so | →/product/lib64 | /system_ext/lib64 | none (bare name) | yes | super-EIS preview | none | none (verify EIS engages) |
| 3 | libsingle_camera_bokeh{,2}_native.so | →/product/lib64 | /system_ext/lib64 | none | yes | portrait/bokeh | none | none |
| 4 | libarcsoft_wideselfie.so / libjni_wideselfie.so | →/product/lib64 | /system_ext/lib64 | none | yes | wide selfie / panorama | none | none |
| 5 | libOplusBlurPreviewJNI.so | →/product/lib64 | /system_ext/lib64 | none | yes | blur/portrait preview | none | none |
| 6 | liblivephoto.frc.jni.so | →/product/lib64 | /system_ext/lib64 | none | yes | live photo FRC | none | none |
| 7 | libMsEffectSdk.so / libst_mobile.so / libst_sticker_jni.so | →/product/lib64 | /system_ext/lib64 | none | yes | stickers / Meishe effects | none | none |
| 8 | libCombineLut{,Jni}.so | →/product/lib64 | /system_ext/lib64 | none | yes | LUT/filters | none | none |
| 9 | libOPAlgoCamHDRTransformCamera.so | odm/lib64 | /odm/lib64 | `/odm/lib64/...` (capability gate, SDK) | yes | HDR transform gate | (#3/S3, #6/S6 adjacent) | none — probe satisfied; S3/S6 are NOT a placement miss |

**No second S9-class hit exists in the OEM camera dex.** The path-probe surface is small (4 absolute
paths total); only #1 is both path-probed and misplaced. S1 (preview freeze), S3 (overexposure/EDR),
S5/S6 (P010/strlen), S7 (HW buffer), S8 (8K) were checked against the probe set — **none** is gated by
a `/product/lib64` placement miss (they are release-cadence / format / framework-bridge roots per their
own notes). The placement audit therefore **closes on S9 as its sole consumer**; it does not silently
resolve the other open symptoms.

---

## 5. Recommended fix pattern (one sweep)

The remap is correct for ~30 name-loaded libs; do **not** revert it wholesale. Two equivalent fixes for
the **one** path-probed lib (#1) — pick (A):

**(A) Place the Product lib at the probed `/product/lib64/` path (matches OOS runtime exactly).**
Add a `product`-partition install of the already-built lib. In `vendor/oplus/camera/camera-vendor.mk`
the module `libApsFaceBeautyPreviewProductJni` already builds (to system_ext). Add a `/product/lib64`
copy via a symlink package or a `product`-partition prebuilt:

- Simplest: a `PRODUCT_COPY_FILES` / symlink in `opluscamera.mk` putting the built `.so` (or a symlink
  to `/system_ext/lib64/libApsFaceBeautyPreviewProductJni.so`) at
  `$(TARGET_COPY_OUT_PRODUCT)/lib64/libApsFaceBeautyPreviewProductJni.so`. Cleanest via a
  `installable symlink` module (Soong `install_symlink` / `PRODUCT_PACKAGES` symlink) so SELinux labels
  follow `/product/lib64`.
- Cleaner still in extract-files terms: **add a second proprietary-files line** so the lib lands on
  `/product/lib64` as well (extract-utils keys modules by name, so use a distinct dst name or a symlink
  module rather than two identical-name prebuilts):
  ```
  # keep the system_ext copy AND satisfy the SDK <clinit> /product/lib64 probe
  my_product/lib64/libApsFaceBeautyPreviewProductJni.so:product/lib64/libApsFaceBeautyPreviewProductJni.so;FIX_SONAME
  ```
  (verify the `system_ext` copy stays for any name-load path; the probe wants the **/product** copy.)

**(B) Satisfy probe step-2 instead** — install/symlink the Product lib at the step-2 path **filename**
`/system_ext/lib64/libApsFaceBeautyPreviewJni.qti.so` (note: different soname than `...ProductJni.so`),
so the QCOM branch's step-2 `isFileExist` hits and `loadLibrary("ApsFaceBeautyPreviewJni.qti")`
resolves to the guarded code. Less faithful to OOS (OOS uses step-1) and requires a soname/loadLibrary
name match → prefer (A).

**Verification (same as S9 note):** after the fix, `OplusCamera` maps `…ProductJni.so` (not the in-APK
`…PreviewJni.so`) and the Product-lib-only strings appear in logcat: `FBinit success` /
`wait for init finish` / `Slender2D_init FACEBEAUTY VERSION`; the `lib2DSlender adjustParam+836` SIGSEGV
does not reproduce on a detected face. Do **not** add a null-guard in `lib2DSlender` (masks, not fixes).

**Generalization / guardrail:** the systemic root is the **`my_product → /product` overlayfs identity**
that LOS cannot reproduce. The audited consequence is bounded — only **path-probed** libs are at risk,
and the OEM camera dex path-probes exactly one. The durable guardrail: any future OEM lib added to the
port that is selected by an absolute `/product/lib64/` (or `/my_product/...`) path must be installed to
`/product/lib64` (not silently remapped to `/system_ext`). A quick audit command for new SDK/app drops:
`baksmali d <jar/apk> && grep -roE '"/(product|my_product)/lib(64)?/[^"]*\.so"'` — any hit must have a
matching `/product/lib64` install line.

---

## Appendix — evidence index (this session)

- OOS overlay proof: `dump300_full` odm fstab lines 82–83 (`/product/lib64` overlay `lowerdir` includes `/my_product/lib64`).
- Remap rule: `vendor/oplus/camera/proprietary-files.txt` (~30 `my_product/lib64:*system_ext/lib64` lines); partition derivation `tools/extract-utils/extract_utils/file.py:126` (`self.partition = self.parts[0]`).
- Generated module: `vendor/oplus/camera/camera/Android.bp` `libApsFaceBeautyPreviewProductJni` → `system_ext_specific: true`, `srcs: proprietary/system_ext/lib64/...`.
- SDK probe chain: baksmali `com/oplus/camera/facebeauty/OplusFaceBeautyPreview.smali <clinit>` (probe `/product/lib64/...ProductJni.so` → step2 `/system_ext/lib64/...PreviewJni.qti.so` → fall-through in-APK `ApsFaceBeautyPreviewJni`). Mirrored in `.adapter.jar`.
- In-APK fallback lib: `OplusCamera.apk!lib/arm64-v8a/libApsFaceBeautyPreviewJni.so` (unguarded).
- LOS placement: `out/target/product/infiniti/system_ext/lib64/` (all my_product camera libs) + on-device `adb ls /system_ext/lib64` (present) vs `ls /product/lib64/libApsFaceBeautyPreviewProductJni.so` = **No such file**.
- OOS native `/product/lib64`: no OEM camera libs (overlay-only).
- Header/header-style: mirrors `facebeauty-preview-algolibflag-RE.md`. Cross-ref: `../interop-tree/symptoms/S9-facebeauty.md`.
- NOTE: `vendor/oplus/camera/proprietary-files.txt` header says blobs are from **OnePlus 13 (OOS16 CPH2653_16.0.3.501)** while the infiniti tree targets **OnePlus 15 CPH2745 .201** — a separate provenance flag, not part of the placement bug, but worth reconciling.
