<!-- STATUS: VERIFIED — evidence-anchored RE/capture; no inference-surgery needed (doc-50 method). -->

# 38 — Camera-Module Architecture for v18 (clean inclusion/trim plan)

READ-ONLY architectural deduction. Scope: finalize the OnePlus 15 (infiniti / SM8850)
OplusCamera stack as a clean, LOS-dev-conformant "oplus camera stack" module for the LAST
build (v18). Gralloc is OUT OF SCOPE (v18 bets on the un-reverted frameworks/base
getOplusHardwareBuffer bridge; no gralloc rework here).

Trust hierarchy used:
- AUTHORITATIVE: stock .201 dump `/home/vivy/op15-work/dump201_full/` (what OOS ships).
- CLEAN TEMPLATE: dodge `/home/vivy/op15-work/dodge-ref/` (device_oneplus_dodge,
  device_oneplus_sm8750-common, vendor_oplus_camera). op13/sm8750 — account deltas.
- DIRTY (do not baseline): koaaN `/home/vivy/vendor_oplus_camera/` (gallery-restore tree).
- OURS: `vendor/oplus/camera-sm8850/` + `hardware/oplus/oplus-fwk/`.

All file:line refs below are to the trees above.

---

## 0. Decisive cross-cut facts (evidence)

- **QNN gallery libs are double-shipped.** The 6 V81 libs are BAKED into OppoGallery2.apk's
  `lib/arm64-v8a` by `blob_fixup_oppogallery_op15_native_libs`
  (camera-sm8850/extract-files.py:2214-2223, sourced from configs/lib64/). The same 6 libs
  are ALSO defined as 12 standalone modules (Android.bp 6× `_gallery_system_ext` +
  Android.mk 6× `_gallery_app_lib`) and wired into PRODUCT_PACKAGES
  (opluscamera.mk:56-68). proprietary-files.txt:92-100 explicitly states the 6 QNN libs are
  NOT listed as modules precisely because they are baked in. => the ff8fbb2 module set is
  REDUNDANT with the apk-bake path.
- **The 7 candidate camera-quality blobs have ZERO consumers** in the dump: no lib
  DT_NEEDED/strings-references libHdrTransform-platform-jni, libiccprofile, or
  libPDParamParser (grep across my_product/lib64, odm/lib64, vendor/lib64 = empty); the apk
  does not reference HdrTransform; nothing references mt/mw/mt105CalibrationCfg.xml. And
  dodge's vendor_oplus_camera ships NONE of them (proprietary-files.txt + camera-vendor.mk
  greps empty).
- **Props: the dump build.prop IS authoritative and DOES set** dolby_vision{,_app},
  hdr_vision_app, localhdr_version=2, uhdr.support, support.edrlistener, oplusrom*,
  oplus.api=38, oplus.sub_api=46 (NOTE: 46, not 28), fusionlight, hdr.uniform{,.debug},
  vendorxml.enable, private.log.enable. The dump does NOT set backCamSize / frontCamSize
  anywhere, and the apk/libs never read them.
- **OplusEdrUtils is real** (`Lcom/oplus/view/OplusEdrUtils;` +
  `com/oplus/camera/feature/integration/mirror/MirrorOplusEdrUtils` in the apk) => the
  HDR/DV/EDR feature props are genuinely consumed.
- **Gallery-launch from camera IS already wired** via
  `blob_fixup_oplus_camera_gallery_handoff` (extract-files.py:1859-1993): injects a
  self-contained `startActivity(ACTION_VIEW, setPackage("com.oneplus.gallery"))` at the
  thumbnail_click handler P9, gated by `persist.sys.oplus.cam.plain_gallery` (default true),
  paired with the getApply() getter fix (1811-1854). Not missing.
- **dodge labels /proc/devinfo/ufs cleanly**: dedicated `proc_ufs_file` type
  (file.te: `type proc_ufs_file, file_type; typeattribute proc_ufs_file proc_type;`),
  genfscon `proc /devinfo/ufs`, and grants the camera only `proc_ufs_file:FILE` perms — it
  never grants a `dir` perm on a proc_type, so it does NOT trip
  `neverallow domain proc_type:dir write`.
- **dodge shares our oplus-fwk boot jar**: device_oneplus_sm8750-common/common.mk:462
  `$(call inherit-product, hardware/oplus/oplus-fwk/oplus-fwk.mk)`. Same repo path as ours.

---

## 1. TRIM LIST (revert from ff8fbb2 / restructure)

| Item | Verdict | Evidence |
|---|---|---|
| 12 QNN `_gallery_system_ext` + `_gallery_app_lib` modules (Android.bp, Android.mk, 12× PRODUCT_PACKAGES in opluscamera.mk:56-68) | **TRIM (redundant)** | Same 6 libs already baked into the apk by blob_fixup (extract-files.py:2214-2223). proprietary-files.txt:92-100 says so. Shipping both wastes ~150MB system_ext + risks a stale duplicate. The `_app_lib` copies install into `OppoGallery2/lib/arm64` which the apk ALSO populates from its embedded zip — direct conflict. Keep ONLY the apk-bake. Delete Android.bp, Android.mk, and the 12 lines. |
| `ro.vendor.oplus.camera.backCamSize=50MP+50MP+50MP` | **TRIM (cruft)** | Not in any dump prop file; not read by apk/libs. koaaN-only. |
| `ro.vendor.oplus.camera.frontCamSize=32MP` | **TRIM (cruft, also WRONG value)** | Same — absent from dump; and op15 front is not 32MP (op13/koaaN value). koaaN op13 cruft. |
| `ro.build.version.oplus.sub_api=28` | **TRIM as-set / FIX value** | Dump ships `oplus.sub_api=46`. 28 is the op13 value. Either drop it or correct to 46 (see KEEP note). Do NOT ship 28. |
| `ro.build.version.oplusrom=V16.0.0` (+ .display=16.0, .confidential=V16.0.0) | **FIX value** | Dump ships V16.1.0 / 16.1. Ship the .201-faithful values, not V16.0.0. |
| `default-permissions-oneplus-gallery.xml` | **KEEP but re-evaluate (see KEEP)** — NOT a blind koaaN drop | Not OOS-shipped, but the OOS `oplus_camera_default_grant_permissions_list.xml` (we already ship it) grants ONLY com.oplus.camera, NOT com.oneplus.gallery. So this fills a real gap for a preinstalled gallery on AOSP. Not cruft; keep. |
| seapp_contexts `com.android.cameraextensions` + `com.android.oemextensions` -> opluscamera_app | **TRIM (dead mapping)** | No installed app has package `com.android.cameraextensions` / `com.android.oemextensions`; only `CameraExtensionsProxy.apk` exists and runs in its own AOSP domain. Mapping non-existent packages to the camera data domain is a no-op at best, confusing at worst. dodge's seapp_contexts maps ONLY `com.oplus.camera`. Revert both lines. |

Net TRIM: remove Android.bp + Android.mk entirely, remove 12 QNN PRODUCT_PACKAGES lines,
remove backCamSize + frontCamSize, fix sub_api/oplusrom values, revert the 2 seapp lines.

---

## 2. KEEP LIST (deduced-correct camera-stack)

| Item | Why KEEP |
|---|---|
| HDR/DV/EDR feature props: persist.sys.feature.{dolby_vision,dolby_vision_app,hdr_vision_app,localhdr_version=2,uhdr.support,support.edrlistener} | OOS-authoritative (all in dump build.prop) AND consumed by OplusEdrUtils/MirrorOplusEdrUtils in the apk. Genuine camera-stack deps. |
| OplusROM identity: ro.build.version.oplusrom* (corrected to V16.1.0/16.1), ro.build.version.oplus.api=38, oplus.sub_api (corrected to 46), ro.vendor.oplus.vendorxml.enable=1 | OOS-authoritative (dump). Identity/version gates the Oplus feature surface. Keep with .201-faithful VALUES. |
| Caps: ro.oplus.fusionlight=true, ro.vendor.oplus.hdr.uniform=1, vendor.oplus.hdr.uniform.debug=1, persist.sys.camera.private.log.enable=... | All present verbatim in dump build.prop. OOS-faithful. |
| `oplus-gallery-receiver-compat-config.xml` | Genuine LOS-only port fix: OppoGallery2 (targetSdk36) embeds an AI-Unit SDK whose dynamic-receiver registration omits RECEIVER_EXPORTED -> uncaught SecurityException -> gallery self-kill at launch on A14+. The compat override disables change 161145287 ROM-wide. Not in dump (OnePlus framework doesn't enforce it), but required to run the gallery as a standalone app on AOSP. Documented trade-off is acceptable. KEEP. |
| `default-permissions-oneplus-gallery.xml` | Fills the gallery runtime-grant gap the OOS list leaves (OOS list = camera only). Without it the gallery boots with media perms denied -> SIGKILL. KEEP. |
| sepolicy: `allow opluscamera_app system_suspend_hwservice:hwservice_manager find;` | Real dep (system_suspend HAL find), additive, dodge-style. KEEP. |
| OplusCameraSafePermissions (b3d8ea1) | VALIDATED on-device launch fix (defines oppo/oplus *_COMPONENT_SAFE perms SecurityPermission.apk would otherwise define; without it the gallery OplusPreTileDecodeService bind throws -> launch crash loop). KEEP. |
| Gallery-launch handoff (965f099: getApply getter + plain_gallery startActivity) | Already wired + the only startActivity path that exists on LOS. KEEP (see §5). |

---

## 3. BLOB PLAN

Deduced camera-stack blob subset to RESTORE: **NONE of the 7.**

| Blob | dest (if shipped) | dodge ships? | consumer in dump? | Verdict |
|---|---|---|---|---|
| my_product/etc/camera/{mt,mw,mt105}CalibrationCfg.xml | product/etc/camera | No | None (grep empty) | **DROP** — no consumer; not a camera-stack-module file (factory/calibration cruft). |
| my_product/lib64/libHdrTransform-platform-jni.so | system_ext/lib64 | No | None (no DT_NEEDED, apk doesn't ref) | **DROP** — unreferenced. (HDR transform is handled in the gralloc/framework-shim phase that v18 explicitly defers; not this module.) |
| vendor/lib64/libiccprofile.so | vendor/lib64 | No | None | **DROP** — unreferenced by provider/camx in the dump. ICC writing the JPEG path already works (WriteIccProfile observed without this blob in prior sessions). |
| odm/lib64/libPDParamParser.so | odm/lib64 | No | None | **DROP** — unreferenced; PD param parsing is internal to the HAL blobs we already ship. |
| my_stock/app/OpenCapabilityService/OpenCapabilityService.apk | system_ext/app | No | n/a | **DROP** — Open Capability is the OPlus cross-app capability broker, not a camera-pipeline dependency; dodge doesn't ship it; no camera-launch/capture path needs it. Out of module scope. |

Blobs dodge ships that WE LACK: cross-checking dodge proprietary-files vs ours, the only
dodge-extra camera files are op13/sm8750-specific sensor configs (bonito/eliza/pakala JSONs,
bm5a79 .bin — those are dodge's sensor calibration set; ours uses the .201 dump's own
sensor set already pinned in our proprietary-files.txt) and dodge-only audio/spatializer
libs (libhoaeffects, libbinauralrenderer — NOT camera, those are dodge's audio bring-in
riding in the same repo). **No camera-stack blob gap.** Our proprietary-files.txt + the
split proprietary_vendor_oplus_camera-sm8850 already carry the .201 camera blob set.

=> BLOB PLAN: ship nothing new. Confirm the existing split-repo camera-vendor.mk set is the
authoritative .201 subset; the 7 are correctly excluded.

---

## 4. FRAMEWORK-STUB LAYER

dodge architecture: a single shared `hardware/oplus/oplus-fwk` boot jar (java_library
`oplus-fwk`, PRODUCT_BOOT_JARS), inherited by device common.mk
(device_oneplus_sm8750-common/common.mk:462). The camera-stack opluscamera.mk keeps the
boot-jar line COMMENTED (dodge opluscamera.mk:6-7) because the boot jar belongs to the
DEVICE layer, not the camera vendor module. The app-scoped wrapper classes (com.oplus.wrapper.*,
OplusHeifWriter, View/ViewRootImpl shims, CameraManager$a) live in `oplus-camera-stubs`
(a system_ext shared lib pulled via `<uses-library oplus.camera.stubs>`, NOT a boot jar) —
this scoping is correct and matches our opluscamera.mk:29-37.

Our oplus-fwk additions vs dodge:
- **OplusActivityManager moved app-loader -> boot jar (cf05cef/8ff815f): ALIGNED.** dodge's
  oplus-fwk is the same shared repo; android.app.OplusActivityManager belongs in the boot
  jar because it shadows a framework-package class (`android.app.*`) that the app classloader
  cannot legally define. Boot jar is the correct home. KEEP. (Note: this does NOT fix the
  AIUnit AppSwitchPublisher crash — that class is simply absent from AIUnit.apk's dex; a
  packaging gap, not a link gap. Do not frame the boot-move as an AIUnit fix.)
- **OplusUIFirstManager.setUxThreadValue + setBinderThreadUxFlag no-ops (8ff815f): ALIGNED,
  low-risk.** No-op perf hints; harmless stubs the app calls reflectively. KEEP.
- **OplusActivityTaskManager methods + OplusTaskInfoChangeListener class (cf05cef): KEEP** —
  completes the task-manager surface the app links. These are app-scoped wrapper additions
  in oplus-camera-stubs, consistent with dodge's stub layering.

Conflict/duplication flags: NONE found. Our oplus-fwk source set is a superset (telephony,
ims, osense, uifirst, activitymanager) of what the camera needs; that's fine for a shared
device boot jar. Just ensure the boot-jar inherit lives in the DEVICE mk
(device/oneplus/sm8850-common), exactly as dodge does — NOT in opluscamera.mk (which
correctly keeps it commented). Verify the sm8850-common common.mk has the
`inherit-product hardware/oplus/oplus-fwk/oplus-fwk.mk` line; if missing, that is the one
structural gap to add.

---

## 5. GALLERY-LAUNCH-FROM-CAMERA

**VERDICT: already wired and correct for v18.** The tap-thumbnail -> open gallery path is
implemented in `blob_fixup_oplus_camera_gallery_handoff` (extract-files.py:1859-1993):
it locates the unique "thumbnail_click" handler (P9 / CameraUIManager) and injects a
self-contained `startActivity(Intent ACTION_VIEW, data=capturedUri, type=mime,
setPackage("com.oneplus.gallery"))`, switchable via `persist.sys.oplus.cam.plain_gallery`
(default true -> opens gallery; false -> in-app review overlay). It is paired with the
getApply()I getter injection (1811-1854) that stops the SurfaceTransaction animation stall.

Why this is the right fix and nothing more is needed: frida confirmed (per the in-code
comment) the stock "slide into gallery" is an EMBEDDED inline render via the gallery-side
com.oplus.light.gallery.* / OliveView SDK, which is ABSENT on LOS — so there is NO native
startActivity path for the tap on the port. True embedded parity requires a gallery-side
SDK port (the documented deep follow-up, OUT OF v18 scope). The plain-launch handoff is the
correct minimal, self-contained substitute. KEEP as-is.

Action for v18: none, beyond confirming the handoff fixup is still registered in main()
(`.call(blob_fixup_oplus_camera_gallery_handoff)`) and that `persist.sys.oplus.cam.plain_gallery`
defaults true.

---

## 6. UFS SEPOLICY (/proc/devinfo/ufs)

Root cause of our regression: ours introduced `proc_ufs_file` as a new proc_type and (per
our own removal comment in file.te / opluscamera_app.te) it tripped
`neverallow domain proc_type:dir write` because init/vendor_init hold broad `dir write`
over the proc_type attribute set — i.e. the failure was a DIR-level neverallow, and the
type got swept into a dir-write grant somewhere.

dodge's WORKING approach (the build-safe pattern to adopt verbatim):
- `file.te`: `type proc_ufs_file, file_type; typeattribute proc_ufs_file proc_type;`
- `genfs_contexts`: `genfscon proc /devinfo/ufs u:object_r:proc_ufs_file:s0`
- `file_contexts`: `/proc/devinfo/ufs u:object_r:proc_ufs_file:s0` (+ `/proc/ufs ...`)
- `opluscamera_app.te`: `allow opluscamera_app proc_ufs_file:FILE { read open write create getattr };`

The key: dodge grants ONLY `proc_ufs_file:file` perms to the camera and NEVER any `dir`
perm on the type, so the `proc_type:dir write` neverallow is never hit. The neverallow
forbids DIR writes on proc_type, not file reads. /proc/devinfo/ufs is a FILE leaf, so a
file-only grant is sufficient and legal.

**Proposed build-safe fix for v18:** re-add the dodge triplet EXACTLY
(file.te type + genfscon + file_contexts + the file-only allow). The previous breakage was
because the camera domain (or an inherited macro) was given a dir perm over the proc_type
attribute — dodge proves the file-only grant passes secilc. Do NOT reuse a generic platform
proc type (e.g. proc:file) — that would over-grant and the app_domain can't read generic
proc anyway; the dedicated labeled-file type is the correct, narrowly-scoped, dodge-proven
answer. This is a genuine camera dep (the app reads UFS device info at init) and is
build-safe when scoped to `:file`.

---

## 7. v18 FINAL SCOPE (ordered, minimal coherent set)

1. **TRIM the QNN double-ship**: delete camera-sm8850/Android.bp and Android.mk; remove the
   12 QNN PRODUCT_PACKAGES lines (opluscamera.mk:56-68). Keep the apk-bake (extract-files.py).
2. **TRIM prop cruft + FIX values**: remove backCamSize, frontCamSize. Set oplusrom*
   = V16.1.0 / 16.1, oplus.sub_api = 46 (or drop), to match the .201 dump.
3. **TRIM dead seapp**: revert the 2 cameraextensions/oemextensions seapp_contexts lines.
4. **Re-add the UFS sepolicy triplet (dodge pattern, file-only)**: file.te type +
   genfs_contexts + file_contexts + `proc_ufs_file:file` allow.
5. **KEEP, verify wired**: HDR/DV/EDR + identity props (corrected values),
   OplusCameraSafePermissions, gallery default-permissions XML, gallery receiver-compat XML,
   system_suspend_hwservice find, the gallery-launch handoff + getApply fix.
6. **Framework layer**: confirm `hardware/oplus/oplus-fwk/oplus-fwk.mk` is inherited from
   device/oneplus/sm8850-common (dodge pattern), opluscamera.mk keeps the boot-jar line
   commented. Keep OplusActivityManager-in-boot, UIFirst no-ops, ActivityTaskManager stubs.
7. **BLOBS**: ship nothing new; the 7 candidates stay excluded (no consumer, dodge omits).
8. **Build + flash v18** with the un-reverted frameworks/base getOplusHardwareBuffer bridge
   as the gralloc bet (separate phase owns gralloc).

This yields a clean, OOS-faithful, dodge-conformant camera-stack module: authoritative props
at correct values, no double-shipped libs, no unreferenced blobs, dead seapp removed,
build-safe UFS labeling, and the validated launch/gallery fixes retained.
