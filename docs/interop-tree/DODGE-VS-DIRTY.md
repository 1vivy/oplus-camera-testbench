<!-- STATUS: MIXED — inference-surgery applied 2026-06-14 (doc-50 method). Verified body = the
     consolidated divergence table (per-artifact static comparisons: file hash/diff checks, host grep,
     nm-DC symbol scans, on-device public.libraries inspection — all same/differs/missing/unknown verdicts
     are OBSERVATIONAL). The "Priority root candidates" section holds root attributions and conviction
     claims — those are INFERENCES anchored on the static observations and are NOT verified until an
     OOS↔LOS runtime A/B proves the propagation-contract break.
     Guard: artifact divergence (same/differs/missing) is an OBSERVATION; root/conviction is an INFERENCE. -->
<!-- Parent: ./INDEX.md -->

---
title: "DODGE-VS-DIRTY — the oracle divergence ledger"
scope: "consolidated section-(e) diffs from facilitation nodes E1–E4"
sources: [facilitation/E1-stubs.md, facilitation/E2-system-framework.md, facilitation/E3-toggles-config.md, facilitation/E4-sepolicy-namespace.md]
axiom: "Path as Truth — a byte-identical artifact is never the root; divergence lives in placement/apply/runtime, not in matching blobs."
verdict_legend: "same = byte/functionally identical | differs = present both sides, content/model diverges | missing = absent our side (or both) | unknown = file matches but apply/runtime effect unconfirmed"
e_to_f_migration: "Phase-2 (2026-06-14): E1–E4 migrated to F1–F4 (../facilitation/F*). This ledger is the DIFF-era source; the forward proof-of-form view is ../facilitation/DODGE-ORACLE.md (what dodge PROVES exists/works, not a file diff). E-node files remain as diff-era source; F-nodes are the forward spec."
updated: 2026-06-14
---

# DODGE-VS-DIRTY — oracle divergence ledger

> **E→F migration note (Phase-2, 2026-06-14).** This is the **diff-era** ledger: per artifact, *dodge path | our
> path | same/differs/missing*. It is consolidated from E1–E4, which have since been **migrated to F1–F4**
> (`../facilitation/F*`) and re-scoped from *diff* to *requirements → optimal-LOS-form*. The **forward** view of
> dodge — *what FORM dodge proves exists/works, and do we adopt or improve on it?* — lives in
> **`../facilitation/DODGE-ORACLE.md`** (proof-of-form, not a file diff). This file remains the **diff-era
> source**; the F-nodes are the forward spec. The "correct (dodge) form / root" column below maps to the
> proof-of-form outcomes in DODGE-ORACLE.md (POSITIVE→adopt · NEGATIVE/decisive→do-not-author ·
> NEGATIVE/instructive→improve-on-dodge — the libapsfixup case: **dodge ships the shim ⇒ it has not done the
> root fix**).

`dodge` is the working oracle (`oplus-final/dodge-camera-port/`); `ours` is the dirty port
(`op15-camera-porting/` + `vendor_oplus_camera/` + `op15-work/` dumps). This table consolidates the
**section-(e) dodge-vs-dirty diffs** from the four facilitation nodes (E1–E4) into one ledger. The "verdict"
column applies the trunk axiom: a `same`/`identical` artifact is never the root; the live divergence is in
**placement, apply-state, or a missing functional artifact**.

> The Verdict column is the artifact-divergence axis; each E-node's characterization/conviction live in its own
> front-matter (facilitation/E*.md).

## Consolidated divergence table

| # | Category | Reference artifact (dodge, path) | Our artifact (path) | Verdict | The correct (dodge) form / root |
|---|---|---|---|---|---|
| E1 | **Java stub surface — build model** | `dodge-camera-port/repos/android_hardware_oplus/oplus-fwk/` (`Android.bp` `java_library` + `oplus-fwk.mk` `PRODUCT_BOOT_JARS += oplus-fwk`; 142 `.java`) → **BOOTCLASSPATH** | `vendor_oplus_camera/oplus-camera-stubs/Android.bp` (`java_library` `system_ext_specific:true libs:["oplus-fwk"]`; 125 `.java` → 189 classes in `op15-camera-porting/oplus-camera-stubs.jar`) → `/system_ext/framework` `<uses-library>` | **differs** (build model + scope) | Dodge ships a system-WIDE boot jar; ours a cam-app-scoped `<uses-library>` shared lib. **NOT the root** — camera-critical subset resolves under both. Boot-jar is "more correct" only for system-wide priv-app visibility the cam app does not need. |
| E1 | **`OplusCameraManager` (camera-critical class)** | `oplus-fwk` source: codes `10001–10022`, descriptor `"android.hardware.camera"`, `KEY_OPLUS_PACKAGE` | `oplus-camera-stubs` source — **byte-equivalent** carriers | **same** (near-identical) | Identical binder protocol both sides. Ours diverges only by an added `enforceCallingOrSelfPermission(PERMISSION_SAFE_CAMERA)` in `sendOplusExtCamCmd` + extra `"OplusCameraManagerExt"` debug logging. Per axiom these near-identical blobs are not the root. |
| E1 | **`OplusEdrUtils` (EDR/tonemap stub)** | `oplus-fwk` `com.oplus.view.OplusEdrUtils` — carries consts `SIZE_DISPLAY_MAX=16`, `SIZE_POSITION_MAX=2`, `isUHDRSupport()` prop path (`persist.sys.feature.uhdr.support`); otherwise a no-op stub | `oplus-camera-stubs` `OplusEdrUtils` — **DROPS** those consts + the prop path; also a no-op stub (`getBlastSurfaceControl()→null`, `setEdr*→false`) | **differs** (ours drops consts; both no-op) | **Root chain for #3:** Java stub is a no-op BOTH sides — neither drives tonemap. True over-exposure root is the missing native EDR ABI (E2/doc-46 Tier-1b `SurfaceComposerClient::Transaction::setEdrSdrRatio`), which AOSP/LOS does not export. E1 supplies the Java symbol; the native ABI gap is the depth. |
| E2 | **`frameworks/av/0001` (ext factory patch)** | `dodge-camera-port/repos/patches-crdroid/patch-dodge/frameworks,av/0001-…extension-support…patch` sha256 `15b3171b…f076f` | `op15-camera-porting/patches-crdroid/patch-dodge/frameworks,av/0001-…patch` sha256 `15b3171b…f076f` | **unknown** (file `same`, apply uncertain) | File byte-identical (`same`). **Counter-evidenced NOT effective:** doc-48 + baseline show shipped `/system frameworks/av` is **stock (0 ext call sites)**, `libcsextimpl.so` **dropped `d654641`** + absent from LOS cameraserver maps (OOS had 4). Correct form = verify patch landed in device manifest + **re-add `libcsextimpl`** (reverse `d654641`). |
| E2 | **`frameworks/av/0002` (logging)** | `…/frameworks,av/0002-Add-some-logging.patch` sha256 `5786234e…7a0` | `…/frameworks,av/0002-…patch` sha256 `5786234e…7a0` | **same** | Byte-identical. Not load-bearing. |
| E2 | **`frameworks/base/0001` (JNI bridge)** | `…/frameworks,base/0001-AHardwareBuffer-fixes-for-OnePlus-13-stock-Camera.patch` sha256 `022f82cd…f89d` | `…/frameworks,base/0001-…patch` sha256 `022f82cd…f89d` | **unknown** (file `same`, apply uncertain) | File byte-identical. Adds `ImageReader$SurfaceImage.getOplusHardwareBuffer()` + `nativeGetOplusHardwareBuffer` JNI. **Root for #7 if not effective:** nominally added `9d03af14` but **unproven** in `libandroid_runtime`. Correct form = confirm JNI registered at runtime (host `nm -DC` symbol scan / frida). |
| E2 | **`frameworks/native/0001` (BINDER_VM_SIZE)** | `…/frameworks,native/0001-Increase-BINDER_VM_SIZE-from-1MB-to-4MB.patch` sha256 `fd45f9c6…f9f2d` | `…/frameworks,native/0001-…patch` sha256 `fd45f9c6…f9f2d` | **same** | Byte-identical 1MB→4MB bump. Enables larger RAW/Master parcels (D3/D4). Not the root. |
| E3 | **permissions XML set** | `dodge-camera-port/repos/vendor_oplus_camera/configs/permissions/` — **3 files** (`oplus_camera_default_grant_permissions_list.xml`, `oplus_google_lens_config.xml`, `privapp-permissions-oplus.xml`) | `vendor_oplus_camera/configs/permissions/` — **7 files** (+ `com.oplus.android-features.xml`, `default-permissions-oneplus-gallery.xml`, `compatconfig/oplus-gallery-receiver-compat-config.xml`, `androidx.camera.extensions.impl.jar`) | **differs** (ours superset) | Extras are gallery/features, off the #2/#6 path. Intentional, not a regression. |
| E3 | **`privapp-permissions-oplus.xml`** | `…/configs/permissions/privapp-permissions-oplus.xml` md5 `3df7a941…` | `vendor_oplus_camera/configs/permissions/privapp-permissions-oplus.xml` md5 `4a4cec19…` | **differs** (intentional) | Ours adds `dependency="oplus.camera.stubs"`, the `oplus.camera.stubs`/`androidx.camera.extensions.impl` `<library>` entries, ~20 `com.oplus.permission.safe.*` grants. **Right divergence (E1-stub plumbing) — do NOT revert to dodge.** Not a #2/#6 lever. |
| E3 | **`sysconfig/hiddenapi-package-oplus-whitelist.xml`** | `…/configs/sysconfig/hiddenapi-package-oplus-whitelist.xml` md5 `5d386f44…` | `vendor_oplus_camera/configs/sysconfig/…` md5 `5d386f44…` | **same** | Byte-identical. Not the root. |
| E3 | **props (`opluscamera.mk`)** | `dodge-camera-port/repos/android_device_oneplus_dodge/{vendor,odm,system_ext}.prop` — lean set (logd-limits + identity + 10bit; `# Camera` = market-name only) | `vendor_oplus_camera/opluscamera.mk` PRODUCT_*_PROPERTIES — **superset** (adds `persist.sys.feature.{localhdr_version=2,hdr_vision_app,uhdr.support,support.edrlistener,dolby_vision}`, `persist.camera.override_preview_hdr_support=1`, `ro.vendor.oplus.hdr.uniform=1`, oplusrom V16 triplet) | **differs** (superset + location) | Our HDR/EDR props feed #3 (not the SHDR gate). Dodge keeps props in device-tree `*.prop`; ours in `opluscamera.mk`. Location non-load-bearing for #2/#6. |
| E3 | **`camxoverridesettings.txt` (SHDR functional knob)** | **absent** from dodge repo | **absent** from repo; `tools/enable_verbose.sh` runtime-overlays one that is **logging-mask-only** (no `selectSHDRAutoExposureUsecase=1`) | **missing** (both sides) | **Root for #2/#6 (config layer):** the functional key `selectSHDRAutoExposureUsecase=1` (StaticSettings +0x6a28/+0x6a18) is shipped by NEITHER side. Dodge does not prove a file fix. Correct form must be **authored, not lifted** — a new PRODUCT_COPY_FILES `/vendor/etc/camera/camxoverridesettings.txt` with the SHDR key, gated on the G3 stock dump (`dump_camxsettings.js`). |
| E3 | **overlay (RRO) structure** | `dodge-camera-port/repos/android_hardware_oplus/overlay/{qssi,generic}` (FrameworksRes/SystemUI/Wifi — no camera RRO) + device `overlay/OPlus*ResTarget` | `vendor_oplus_camera/overlay/CameraThemedIcon` only (launcher icon RRO) | **differs** (both cosmetic) | Neither ships a *camera-settings* RRO. Cosmetic for #2/#6. |
| E4 | **`public.libraries.txt` patch** | `…/patch-dodge/device,oneplus,sm8750-common/0001-…public-libraries…patch` (12 adds: 5 arcsoft + 6 QNN + `libapsfixup.so`) | `op15-camera-porting/…/device,oneplus,sm8750-common/0001-…public-libraries…patch` | **same** (`diff` clean) | Identical app-direct-dlopen exposure set. Load-bearing only for libs the **app process dlopens by name** (ArcSoft + QNN + `libapsfixup`), not for P010. We are already at the correct form. |
| E4 | **`libcamxexternalformatutils` in public.libraries** | **ABSENT** (proprietary + patch) | **ABSENT** (patch + `op15-work/dump201_full/vendor/etc/public.libraries.txt`) | **same** (absent both) | **REFUTES doc-42 §2.5 namespace theory for #5/P010:** dodge is reliable yet never app-exposes the lib ⇒ P010 resolves in the **sphal / same-process-HAL namespace** (transitively via `mapper.qti.so`→`libgrallocutils.so`→dlopen), NOT the app namespace. No public.libraries fix is owed for #5; re-home #5 at **D1** (consumer-side lock-math). |
| E4 | **`libcamxexternalformatutils` label** | `android_device_qcom_sepolicy_vndr/…/file_contexts:353` → `same_process_hal_file:s0` | inherited (we patch the same qcom vndr repo) | **same** | Resolved via sphal, not app-public. Confirms the namespace-not-app routing. |
| E4 | **shared `.te` set** | `dodge` `vendor_oplus_camera/sepolicy/` (`private/opluscamera_app.te`, `public/opluscamera_app.te`, `vendor/hal_camera_default.te`, `vendor/app.te`, `vendor/init.te`, `vendor/mediaserver.te`, `private/service.te`) | `vendor_oplus_camera/sepolicy/` | **same** (md5 match) | Byte-identical policy. Not the root. |
| E4 | **`vendor/opluscamera_app.te`** | dodge md5 `5d5d515b…` — keeps `xdsp_device:chr_file rw`, raw `find` on offline+suspend | ours md5 `81296e45…` — adds `typeattribute … halclientdomain/hal_camera_client`, `dontaudit` xdsp, **drops** xdsp `chr_file rw`, `binder_call` system_suspend | **differs** (functionally faithful) | Ours reaches the offline service via `hal_camera_client` (Treble-clean, recovery-buildable) where dodge uses raw finds; **both grant offline-service reachability**. Ours is a correctness improvement, not a P010 regression. |
| E4 | **labeling `.te` (`file.te`, `file_contexts`, `genfs_contexts`, `seapp_contexts`, `property_contexts`)** | dodge `vendor_oplus_camera/sepolicy/` | ours (+ extra `private/mac_permissions.xml`, `private/platform_app.te`) | **differs** (scope) | Labeling/property scope additions; not P010-relevant. |
| E4 | **qcom vndr `domain.te` xdsp neverallow exemption** | `android_device_qcom_sepolicy_vndr/…/domain.te:91,98` (`- opluscamera_app` in `vendor_xdsp_device` neverallows) | `…/device,qcom,sepolicy_vndr,sm8750/0001-…xdsp…patch` | **same** (byte-equivalent) | Identical neverallow exemption. Facilitates C6/QNN-DSP path. |
| E4 | **`/odm/lib64/libapsfixup.so` label** | dodge labels via its `file_contexts` | `…/device,oneplus,sm8750-common/0002-sepolicy-Label-libapsfixup.so.patch` → `same_process_hal_file:s0` | **same** (class) | Both label it for `cameraserver`/sphal read — fixes `avc denied {read}` on `vendor_file` + the `vndksupport … libapsfixup.so not found` dlopen failure. Facilitates APS/turbo, not P010. |

## Inferences & Open (UNVERIFIED — heavy-check)
> Per the interop-tree trunk axiom, a byte-identical OOS↔LOS artifact that misbehaves is a SITE, never
> a ROOT. The divergence table above records OBSERVATIONS (static file/apply-state facts). The priority
> root candidates below are ROOT ATTRIBUTIONS derived from those observations — they are NOT verified
> until an OOS↔LOS runtime A/B proves the propagation-contract break. "CONVICTED" below refers to
> conviction via the dodge oracle (static A/B); runtime conviction (C/D nodes) is LOS-deferred.

## Priority root candidates

Ordered by the verdicts above — where the divergence is *real and load-bearing*, not a `same`/false-friend match:

1. **E2 av/0001 — CONVICTED NOT APPLIED (conviction: CONVICTED via the dodge oracle + host symbol scan + source
   grep, 2026-06-13). THE top root.** The patch
   FILE is byte-identical to dodge but was **never applied to our `frameworks/av` source** (`grep CameraServiceExt`
   = 0; clean git log) and the **built `cameraserver` (4MB, CameraService statically linked) has 0 ext + 0 identity
   strings**; `libcsextimpl.so` absent from the whole out tree. ⇒ our cameraserver is **pure stock AOSP** — the OEM
   `CameraServiceExt` layer (G5) is genuinely missing → no OEM binder 10000-10022, no Depth-2 `beforeConfigureStreamsLocked`
   (#8 candidate), no identity tagging. **Defect = inconsistent patch application** (base patch landed, av patch did not).
   **Action:** apply `patch-dodge/frameworks,av/0001` to the infiniti `frameworks/av` source + reverse `d654641`
   (re-add `libcsextimpl`), rebuild, re-scan. (Root for #8 hooks, contributes #4 result-lifetime.)
   **NOTE — base/0001 is the OPPOSITE: APPLIED + EFFECTIVE.** `nativeGetOplusHardwareBuffer` is in both the
   `frameworks/base` source and the built `libandroid_runtime.so` ⇒ **#7 "JNI bridge absent" is REFUTED**; #7's root,
   if it persists, is downstream of the present bridge (buffer-metadata / SDK path), not a missing symbol.

2. **E3 `camxoverridesettings.txt` SHDR knob — `missing` (both sides), must be authored.** `selectSHDRAutoExposureUsecase=1`
   is shipped/overlaid by NEITHER side; our only runtime override is logging-mask-only. Dodge does not prove the fix,
   so the correct form is a **new** PRODUCT_COPY_FILES artifact gated on the G3 stock dump. (Config-layer root for #2/#6.)

3. **E1 `OplusEdrUtils` boot-jar-vs-system_ext + no-op stub — `differs`/depth-elsewhere.** Placement model differs
   (boot jar vs `<uses-library>`) but resolves both sides; the over-exposure (#3) depth is the **missing native EDR
   ABI** (E2/doc-46 Tier-1b), with the Java stub no-op on both sides. Watch placement only if a system-wide priv-app
   (e.g. AIUnit) needs the surface.

4. **E4 `libcamxexternalformatutils` exposure — `same` (absent both), theory REFUTED.** The lib is app-exposed by
   NEITHER side yet dodge works ⇒ the doc-42 §2.5 "expose it in public.libraries" theory is **dead** for #5. P010
   decodes in the sphal namespace; **stop chasing a namespace grant** and re-home #5 at D1 (consumer-side lock-math).
   Listed here to record the refutation, not to action a fix.

> **Axiom check:** of the 19 rows, the `same`/`unknown` matches (E2 patch files, E4 public.libraries +
> `libcamxexternalformatutils` + shared `.te`, E3 hiddenapi/grant XMLs, E1 `OplusCameraManager`) are false-friends —
> identical content is never the root. The actionable roots are the **apply-state** (E2) and the **missing
> functional artifact** (E3 SHDR), plus the **native-ABI depth** behind E1's no-op stub.
