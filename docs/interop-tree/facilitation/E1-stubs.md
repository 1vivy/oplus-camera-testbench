<!-- Parent: ../INDEX.md -->

---
node: E1
title: "stubs — oplus-camera-stubs (ours, system_ext lib) vs oplus-fwk (dodge, boot jar)"
plane: facilitation
partition: /system_ext
blob_identical_oos_los: n/a
characterization: CHARACTERIZED  # dodge-oracle-vs-dirty structural map complete in (e): class-set + carrier-level diff line-by-line, 189 classes scanned
conviction: SUPPORTED             # placement-break hypothesis falsified; no-op-stub + missing native-EDR-ABI root supported, decisive EDR-invocation A/B (G6 DARK) deferred to eng build
verdict: "Boot-jar(dodge) vs system_ext-lib(ours) placement does NOT break OplusCameraManager/OplusEdrUtils resolution for the camera app (both expose the same FQCNs to OplusCamera's classloader via <uses-library>); divergence is placement-scope + the OplusEdrUtils stub being a no-op, not a missing-class break."
confidence: medium
symptoms: [3]
probes: [r4-oem-transact, observe_getmetadata.js]
gaps: [G6]
dodge_ref: "dodge-camera-port/repos/android_hardware_oplus/oplus-fwk/ (Android.bp java_library + oplus-fwk.mk PRODUCT_BOOT_JARS; 142 *.java)"
dirty_ref: "vendor_oplus_camera/oplus-camera-stubs/ (Android.bp java_library system_ext_specific:true; 125 *.java) + op15-camera-porting/oplus-camera-stubs.jar (189 classes in classes.dex)"
divergence: "differs — build MODEL differs (BOOTCLASSPATH boot jar vs /system_ext/framework <uses-library> shared lib); camera-critical class subset RESOLVES on both; OplusEdrUtils loses SIZE_DISPLAY_MAX/SIZE_POSITION_MAX consts + is a behavioral no-op"
upstream: []
downstream: [C1, C3]
refuted_refs: []
doc_refs: [doc-46, doc-48]
updated: 2026-06-13
---

# E1 — STUBS (facilitation root for the OEM Java surface)

What OUR PORT provides as the Java framework-stub surface the camera app + SDK link against. The dodge
`oplus-fwk` boot jar is the oracle; our `oplus-camera-stubs` is the dirty artifact. **Section (e) is primary.**

## (a) Propagation contract
**What enters** (the app/SDK resolves these FQCNs at class-load, off OplusCamera's classloader):
- `android.hardware.camera2.OplusCameraManager` + nested `OplusCameraManagerGlobal` + `android.hardware.camera2.IOplusCameraManager` (`Cmd` enum) — the OEM cam-cmd entry.
- `com.oplus.view.OplusEdrUtils` (+ `OplusEdrParameters`, `OplusSkGainmapInfo`) — the EDR/tonemap surface (symptom #3).
- `com.oplus.inner.hardware.camera2.impl.CameraMetadataNativeWrapper` — motion-photo / SuperEIS metadata bridge.
- JNI carriers declared in `OplusCameraManager`: `nativeSendToAttachHWBufToBufQEvent`, `nativeSendToBufQAllocEnableEvent`, `nativeSendToExchgHWBufBtwBufQEvent`, `nativtSendToProcessHeif` (lib `HeifWinBufExchg-jni`).

**What leaves** (carriers the stub emits downstream):
- 22 OEM binder codes `10001–10022` (FIRST_CALL_TRANSACTION `10000`) via `OplusCameraManagerGlobal.transact()` on descriptor `"android.hardware.camera"`, service `"media.camera"` → feeds **C3**.
- `CaptureRequest.Key<byte[]> KEY_OPLUS_PACKAGE = "com.oplus.is.sdk.camera.package"` consumed by `parseSessionParameters()` → feeds **C1**.
- `OplusEdrUtils.set*` family (`setEdrFlags/setEdrViewTransform/setEdrGainmapInfo/setEdrSdrRatio/...`) → would feed D4 (currently all `return false`).

## (b) Environment dependencies
- `/system_ext/framework/oplus-camera-stubs.jar` (ours) — installed by `system_ext_specific: true`.
- `<uses-library android:name="oplus.camera.stubs" required=false>` injected into `OplusCamera`'s manifest (op15 `apk6106/dec/AndroidManifest.xml`) via `extract-files.py` uses-library fixup; permission grant in `configs/permissions/privapp-permissions-oplus.xml`.
- `libs: ["oplus-fwk"]` compile-time dependency (our stubs compile against, but do NOT re-ship, the oplus-fwk surface).
- `HeifWinBufExchg-jni` native lib (for the 4 JNI symbols) — must be loadable from the app process.
- Dodge counterpart needs none of the above: `PRODUCT_BOOT_JARS += oplus-fwk` puts the surface on BOOTCLASSPATH for every priv-app.

## (c) Fact-to-resolve
**Q:** Does the boot-jar(dodge) vs system_ext-shared-lib(ours) placement model break `OplusCameraManager`/`OplusEdrUtils` resolution for OplusCamera?
- **If it breaks** → app hits `ClassNotFoundException`/`NoClassDefFoundError` on first `OplusCameraManager.getInstance()` or `OplusEdrUtils.*` → fix = move stubs to a boot jar. **PREDICTION FALSIFIED below.**
- **If it resolves** (observed) → the `<uses-library>` model is sufficient; symptom #3 root is NOT placement but the `OplusEdrUtils` no-op stub + missing libgui/SF EDR native ABI (E2/doc-46 Tier-1b). Action: stop treating placement as the bug; pursue the native EDR ABI.

## (d) Runtime probe(s)
- `r4-oem-transact` — confirms the 100xx codes leave the stub and land in C3 (binder live-channel). Lever: **WORKS** (host-side class presence) / OEM-transact path **FRIDA-ONLY** at runtime.
- `observe_getmetadata.js` — observes `getMetadataTag`/`metaDataValueConvert` upcalls (the dirty stub adds TAG `"OplusCameraManagerExt"` debug logging absent from the oracle).
- Resolution falsifier (host): `unzip -l oplus-camera-stubs.jar` + dex `strings` — both `OplusCameraManager` and `OplusEdrUtils` FQCNs present (confirmed: 189 classes, camera subset intact). Gap **G6** (EDR-invocation trace) still DARK — needs eng build.

## (e) Dodge-vs-dirty diff  *(PRIMARY)*
**Oracle:** `oplus-fwk/Android.bp` → `java_library{ name:"oplus-fwk", installable:true }` + `oplus-fwk.mk` → `PRODUCT_PACKAGES += oplus-fwk; PRODUCT_BOOT_JARS += oplus-fwk`. **142 `.java`** — a system-WIDE framework surface (telephony, IMS, ActivityManager, `IOplusPackageManager`, ORMS, NEC, vibrator…). Placement = **BOOTCLASSPATH** (visible to all priv-apps).

**Ours:** `oplus-camera-stubs/Android.bp` → `java_library{ name:"oplus-camera-stubs", libs:["oplus-fwk"], platform_apis:true, system_ext_specific:true }`. **125 `.java`** in `src/` → **189 classes** in shipped `classes.dex`. Placement = `/system_ext/framework` shared lib, pulled ONLY into `OplusCamera`'s classloader via `<uses-library oplus.camera.stubs>`.

**Class-set diff (top-level FQCNs):**
- **Shared / camera-critical (resolve on BOTH):** `android.hardware.camera2.{OplusCameraManager, IOplusCameraManager}`, `com.oplus.view.OplusEdrUtils`, `com.oplus.inner.hardware.camera2.impl.CameraMetadataNativeWrapper`.
- **Dodge-only (boot-jar system surface, not needed by cam app):** `android.app.{IOplus,OplusBase}ActivityManager`, `android.common.OplusFrameworkFactory`, `android.telephony.OplusTelephonyManager`, `com.oplus.{nec,orms,evolution,ims.stub}.*`, `OplusFeatureConfigManager` (40+).
- **Dirty-only (cam-app scope adds):** `com.oplus.media.OplusHeifWriter`, `android.hardware.OplusCameraUtils`, `com.oplus.wrapper.hardware.camera2.*`, `com.oplus.tblplayer.*`, `OplusMultiAppManager`, `com.color.inner.*` wrappers (40+).

**Carrier-level diff on the two camera-critical classes (source compared line-by-line):**
- `OplusCameraManager`: binder codes `10001–10022`, descriptor `"android.hardware.camera"`, `KEY_OPLUS_PACKAGE` string — **byte-equivalent**. Dirty DIVERGES only by (1) adding `enforceCallingOrSelfPermission(PERMISSION_SAFE_CAMERA)` inside `sendOplusExtCamCmd` (dodge omits it), (2) extra debug logging under TAG `"OplusCameraManagerExt"` in `getMetadataTag`/`metaDataValueConvert`. Per the trunk axiom these near-identical blobs are not the root.
- `OplusEdrUtils`: dirty **DROPS** the oracle constants `SIZE_DISPLAY_MAX=16`, `SIZE_POSITION_MAX=2` and the `isUHDRSupport()` prop path (`persist.sys.feature.uhdr.support`); both versions are otherwise a **no-op stub** (`getSurfaceControl/getBlastSurfaceControl → null`; all `setEdr* → false`). The op15 shipped dex confirms `Lcom/oplus/view/OplusEdrUtils;` present but neither side actually drives the native EDR path.

**Correct (dodge) form / verdict:** **differs** in build MODEL (boot jar vs `<uses-library>` shared lib) and in surface scope, but the camera-critical subset RESOLVES under both — the `<uses-library>` model is functionally sufficient for OplusCamera. The dodge boot-jar form is "more correct" only for system-wide priv-app visibility (e.g. AIUnit), which the cam app does not require. → cross-link `DODGE-VS-DIRTY.md`.

## (f) Symptom leaves
- **#3 over-exposure (~5×):** attaches here as a **near-ROOT carrier** — `OplusEdrUtils` stub is a no-op (`getBlastSurfaceControl()→null`, `setEdr*→false`) so no tonemap is ever applied. **Edge:** the *true* root is E2/doc-46 Tier-1b — the Java stub is "necessary-but-insufficient": it binds to the Addendum-A `libgui`/SurfaceFlinger native EDR ABI (`SurfaceComposerClient::Transaction::setEdrSdrRatio/...`) that AOSP/LOS does NOT export. E1 supplies the Java symbol; the missing native ABI is the over-exposure depth. The proximate display-HAL co-factor (HWComposer advertising HLG/PQ) sits at **D4**.
- Stub-resolution failure would proximally manifest at **C1** (SDK `getInstance()` NoClassDefFoundError) — falsified here: classes resolve.
