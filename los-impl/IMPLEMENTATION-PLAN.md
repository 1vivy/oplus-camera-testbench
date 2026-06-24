<!-- STATUS: PLAN/INFERRED — this document is a forward bringup specification. All per-requirement edit
     blueprints, RE-BLOCKED/DARK/CONFIG-DEFERRED status rows, interlock chains, and "what this unblocks"
     claims are forward plan and attribution, not verified observations. The verified-facts core (what is
     measured and confirmed) is extracted in the section immediately below; everything else in this document
     is PLAN/INFERRED until an OOS↔LOS A/B confirms each fix form and proves the propagation-contract break.
     Guard (SCHEMA): a measured SITE is never a verified ROOT; patch apply-state and symbol-absence are
     SITES, not proven roots. -->
<!-- Parent: ../docs/facilitation/INDEX.md (the requirements→F-node→optimal-form board) -->
<!-- Spec: ../docs/interop-tree/REQUIREMENTS.md (R1–R7 · X1–X4) + POST-PROCESSING-CONTRACT.md -->
<!-- Build contract: ../docs/facilitation/BUILD-ORDER.md (edges + interlocks I1–I7) -->
<!-- RE anchors: ../docs/re-notes/{oem-binder-ontransact,decmetarefzero-upcall,edr-sf-readside,aec-hdrdetect-publish}-RE.md -->

---
title: "LOS IMPLEMENTATION PLAN — per-requirement LOS-edit blueprint (R1–R7 + libapsfixup reduction)"
plane: implementation
date: 2026-06-14
scope: >
  The "partial LOS landing." For each REQUIREMENTS row (R1–R7) plus the libapsfixup REDUCTION,
  the EXACT LOS-tree edit (file path in the port/device tree it lands in), the source (adopt a dodge
  patch vs author-new against the RE offsets), READY-vs-RE-BLOCKED status, and for RE-BLOCKED rows the
  precise open question B/C must close. Ordered by BUILD-ORDER (R2 first). Each row maps to its
  BUILD-ORDER interlock (I1–I7).
status_model: >
  READY    = a shipping reference (dodge) proves the form AND the artifact is locatable → land now (R2, native/0001).
  RE-BLOCKED = author-new with at least one open RE question (a curve ABI, a hook body, a JNI bridge site) → blueprint only.
  CONFIG-DEFERRED = config-only, Treble-clean, but the in-scene arm needs a runtime A/B not yet run (R5).
  DARK     = the carrier is RE-inferred only; not runtime-confirmed app-side (R6).
note: >
  DESIGN/STAGE ONLY. This plan is authored under /home/vivy/oplus-final/los-impl/. It does NOT edit the
  external port/device tree (~/vendor_oplus_camera, ~/op15-camera-porting, ~/android/lineage). The "LOS-tree
  edit" column names where each edit WOULD land; nothing here is applied.
---

# LOS Implementation Plan — per-requirement edit blueprint

## VERIFIED facts cited by this plan (measured / oracle-confirmed)

The following are the directly observed or oracle-confirmed facts this plan draws on. Everything else
in this document (edit blueprints, status verdicts, interlock chains, symptom assignments) is PLAN/INFERRED.

| Fact | Measurement / oracle | Source |
|------|---------------------|--------|
| `frameworks/av` source has 0 `CameraServiceExt`/`csextimpl` strings; built `cameraserver` (4MB, 103 `CameraService` strings) has 0 ext call sites; `libcsextimpl.so` absent from whole out tree | host symbol scan + grep, post-v19 build | F2 carried verdict |
| av/0001 patch sha256 `15b3171b…f076f` — byte-identical dodge↔ours | sha256 verified both repos | F2 §"Dodge file-content evidence" |
| base/0001 JNI bridge `nativeGetOplusHardwareBuffer` present in `libandroid_runtime.so` (built) | host symbol scan | F2 carried verdict |
| native/0001 BINDER_VM_SIZE patch sha256 `fd45f9c6…f9f2d` — byte-identical | sha256 verified | F2 §"Dodge file-content evidence" |
| `libcsextimpl.so` from stock dump: 1,491,032 B, md5 `d773133f369d8abf6515dfcaeb6fb208` | stock dump extraction | R2-apply-manifest.md §2 |
| R5 `hdr_detected 0x80be000b` OBSERVED published on stock (`HDRDetected:1`, gate `+0x48=1`, 2294× N=3) | on-stock `observe_getmetadata` trace, N=3 | F3 R5 §(i) |
| X1 `selectSHDRAutoExposureUsecase` reads 0 in a real HDR scene, N=3; dodge ships no `camxoverridesettings.txt` | `dump_camxsettings` probe N=3; grep=0 on dodge tree | F3 §CRITICAL CORRECTION |
| `libcamxexternalformatutils.so` absent from dodge `public.libraries.txt` (22 lines, grep=0 VERIFIED) and ours | grep-verified both repos | F4 §(1) |
| 12-lib public.libraries patch byte-identical dodge↔ours | diff clean | F4 §(1) |
| APS/CamX tag-producer libs labeled `same_process_hal_file` — port at dodge parity | grep-verified `file_contexts` | F3 Artifact 2 |
| `[OverrideOemSHDRTypeMatching]` block + 611 Mode rows PRESENT in installed odm config | host artifact verification | F3 Artifact 1 |
| HDR/EDR props superset PRESENT in `opluscamera.mk` | grep-verified | F3 Artifact 3 |
| Built stub `OplusEdrUtils.getBlastSurfaceControl` returns REAL Surface (not null) in the image | jadx/dex inspection of built jar | PHASE-D-CORRECTIONS §R3 |
| OCS SDK `com.oplus.camera.unit.sdk.jar` carries complete R1 receiver (action-2 routing, `MetaImageRefCounter`) in prebuilt already installed | jadx trace of prebuilt jar | PHASE-D-CORRECTIONS §R1; F1 D1 provider split |
| R7 must-resolve classes all PRESENT in built `oplus-camera-stubs.jar` | `unzip -l` + dex strings | PHASE-D-CORRECTIONS §R7; F1 D1 |

> **Note on R2 apply-state:** the symbol-absence facts above (0 ext call sites, `libcsextimpl.so` absent) are
> measured SITES. The causal chain from apply-state → specific symptom roots (#8, #4) is PLAN/INFERRED
> (see F2 Inferences section).

---

> **How to read each row.** `(i)` the LOS-tree edit (target file path in the port/device tree) · `(ii)`
> source = **adopt** (take a dodge patch verbatim) or **author-new** (write against RE offsets) ·
> `(iii)` status = READY / RE-BLOCKED / CONFIG-DEFERRED / DARK · `(iv)` for RE-BLOCKED the precise open
> question · `(v)` BUILD-ORDER interlock (I1–I7). Rows are in **BUILD-ORDER work sequence** (INDEX.md
> load-bearing-first): **R2 → R1 → R7 → R5 → R4 → R3 → R6**, with the libapsfixup REDUCTION folded in as
> the cross-cutting consequence.

## Trunk axiom (inherited)
Every named blob is **byte-identical OOS↔LOS** → **no root is a blob edit**. Each LOS edit below is an
*environment / facilitation* contract: a framework source patch, a `system_ext` lib re-add, a Java stub
class, or a config/sepolicy artifact. RE offsets are **build-pinned** (device addr = Ghidra − 0x100000);
re-pin against a new OOS image per BUILD-ORDER §(c).

---

## 1 — R2 · OEM `media.camera` binder Depth-1 receiver — **READY (the TOP single action)**

| Field | Value |
|-------|-------|
| **Contract** | `CameraServiceExtImpl::onTransact` services codes 10001..10024 (incl. **10015 SEND_OPLUS_EXT_CAM_CMD** = zoom). On LOS the lib is dropped + 0 ext call sites ⇒ every 100xx → `UNKNOWN_TRANSACTION −38` (`onTransact` file `0x16f6f0`, `default:−38`). This is the live-G5 drop; roots #8, contributes #4. |
| **LOS-tree edit (i)** | **(a) framework source patch** → `frameworks/av` in the LOS source tree (lineage), via `~/op15-camera-porting/patches-crdroid/patch-dodge/frameworks,av/0001-*.patch`. Touches 12 files: creates `services/camera/libcameraservice/ext/{CameraServiceExtFactory.cpp,ICameraServiceExt.cpp,include/*.h}`, adds the two `ext/*.cpp` to `services/camera/libcameraservice/Android.bp`, hooks `CameraService::onTransact` (delegate to `CameraServiceExtFactory::onTransact(...)==0` short-circuit), adds `CameraSessionStats` constants (EXCEPTION/SESSION_CONFIGURED/FIRST_FRAME_ARRIVED), the `collectReturnableOutputBuffers` overload, and the 4-arg `CameraProviderManager::getCameraCharacteristics`. **(b) blob re-add (reverse `d654641`)** → re-add `libcsextimpl.so` to `~/vendor_oplus_camera/proprietary-files.txt` (`my_product/lib64/libcsextimpl.so:system_ext/lib64/libcsextimpl.so;DISABLE_CHECKELF` form) + `PRODUCT_PACKAGES`/label. |
| **Source (ii)** | **ADOPT** av/0001 (dodge proof-of-form **strong** — shipping dodge ROM, zoom works; author Hecheng Yu `d6654b3`; sha256 `15b3171b…f076f`) + **manual blob reversal** of `d654641`. |
| **Status (iii)** | **READY.** Patch file located + staged (`los-impl/patches/frameworks-av-0001-*.patch`, sha256-verified). Blob `libcsextimpl.so` was a built intermediate / present in stock dump (`dump201_full/system_ext/lib64/libcsextimpl.so`, 1,491,032 B, md5 `d773133f369d8abf6515dfcaeb6fb208`). The only manual step is the `d654641` reversal (re-add to proprietary-files + PRODUCT_PACKAGES + label). See `los-impl/R2-apply-manifest.md`. |
| **Interlock (v)** | **I1** (dlopen target ⟷ libcsextimpl export surface) + **I6** (dlopen-by-leaf ⟷ label). av/0001 dlopens `system_ext/lib64/libcsextimpl.so` and `dlsym`s `getExtFactoryImpl` (triple-deref) + the mangled `_ZN7android20CameraServiceExtImpl10onTransactEjRKNS_6ParcelEPS1_j`; these must match the blob's exports exactly. BUILD-ORDER edge 2/3: av/0001 GATES R4; both need the re-added+labeled blob. |
| **Verify** | After build: `strings`/`nm -DC cameraserver` carries `CameraServiceExt*` (currently **0**); `nm -DC libcsextimpl.so` exports both symbols; `libcsextimpl.so` shows 4 `/proc/maps` mappings under `cameraserver` (OOS=4, LOS=0); a 100xx binder returns `!= −38`. |

---

## 2 — R1 · per-preview-frame native→Java release upcall (`decMetaRefZeroToRemove`) — **RE-BLOCKED (highest value)**

| Field | Value |
|-------|-------|
| **Contract** | `ApsCallbackMetaRefInc::callbackToCamUnit` → `gCallbackRequestAction(JNIAction=2, isInc=false)` → Java `APSClient$MetaImageRefCounter.decMetaRefZeroToRemove(JII)V` (decref + `Image.close()` at 0). #1 freeze denominator (G4): on stock fires ~7–9/s steady so `metaBufferMap` stays bounded; absent on LOS ⇒ 20-deep pool exhausts ⇒ `previewManagerRoutine` parks. **One fix retires #1 freeze + #4 UAF + makes shim Family-II dead code.** |
| **LOS-tree edit (i)** | **author the release-upcall receiver bridge** in the LOS `frameworks/base` Java + JNI release path (the `nativeGetOplusHardwareBuffer`-adjacent surface that base/0001 already touched: `core/jni/android_media_ImageReader.cpp` / the `core/java/android/media/ImageReader.java` family). The receiver wires the OCS-SDK Java class `APSClient$MetaImageRefCounter.decMetaRefZeroToRemove(JII)V` (which ships in the **F1 surface** `~/vendor_oplus_camera/oplus-camera-stubs/`, NOT frameworks/base) so the native `callbackToCamUnit` upcall lands and decrefs on LOS. **NOT a re-apply of base/0001** — base/0001's JNI bridge (`nativeGetOplusHardwareBuffer`) is already applied+effective; this is a new receiver in the same release-path family. |
| **Source (ii)** | **AUTHOR-NEW.** Dodge proof-of-form = **NO** — no dodge patch carries the `decMetaRefZeroToRemove` receiver (the dodge set is av/base/native only; the OCS-SDK release path lives in `oplus-camera-stubs`/`oplus-fwk`, F1). Author against the RE offsets. |
| **Status (iii)** | **RE-BLOCKED.** The native upcall is RE-mapped and OBSERVED firing on stock (`decmetarefzero-upcall-RE.md`), but the **receiver-side bridge site is not located**. |
| **Open RE question (iv)** | **Locate the `gCallbackRequestAction` bridge JNI lib** — the camera-unit JNI lib that *exports* `gCallbackRequestAction` (libAlgoProcess holds only an EXTERNAL fn-ptr @ Ghidra `0x00ab7548` / file `0x9b7548`; the literal `decMetaRefZeroToRemove`/`GetMethodID`/`CallVoidMethod` are **absent from libAlgoProcess by design**). That bridge lib is where the `GetMethodID("decMetaRefZeroToRemove","(JII)V")` + `CallVoidMethod(env,obj,cachedMid,image,type,limit)` pair lives and where the cached `jmethodID` is held. **B/C must: (1)** identify the lib exporting `gCallbackRequestAction` (next RE target named in the RE note), **(2)** decode the exact `CallVoidMethod` call site + arg marshalling, **(3)** run the LOS A/B that convicts the root (release upcall *absent* on the freeze: `metaBufferMap` climbs to the 20-deep cap, `previewManagerRoutine` parks) — deferred to eng build per POST-PROCESSING-CONTRACT §"Open/next". |
| **Interlock (v)** | **I2** (receiver descriptor `(JII)V` must match the native `jlong`-handle + two-`jint` upcall; wrong arity ⇒ never invoked → #1/#4) + **I3** (the `APSClient$MetaImageRefCounter` class resolves off the **app** classloader, system_ext `<uses-library>`, NOT BOOTCLASSPATH — same loader that resolves R7's `CameraMetadataNativeWrapper`; wrong loader ⇒ `NoClassDefFoundError` at upcall). BUILD-ORDER edge 1: **F1 stub lib must build before the R1 receiver wires against it.** |
| **Verify** | frida-trace the bridge `gCallbackRequestAction` (file `0x9b7548`) and assert the Java `decMetaRefZeroToRemove` enter fires **~7–9/s** in-preview (stock cadence); `metaBufferMap.size()` stays bounded (~2–4, not climbing to 20). |

---

## 3 — R7 · motion-photo / SuperEIS metadata bridge class (`CameraMetadataNativeWrapper`) — **READY (author-new stub, proven by dodge)**

| Field | Value |
|-------|-------|
| **Contract** | `com.oplus.inner.hardware.camera2.impl.CameraMetadataNativeWrapper.getMetadataPtr(Object)->long` must resolve off OplusCamera's classloader, carrying the native `camera_metadata*` bridge shape. Unresolved ⇒ stable `ClassNotFoundException` at `ConsumerImpl.onSessionConfigured → ApsProcessor.initAPS → APSClient.algoInit(:1479) → APSClient.transact` (6/6 on LOS-port). |
| **LOS-tree edit (i)** | **author the stub class** into the F1 system_ext surface → `~/vendor_oplus_camera/oplus-camera-stubs/src/com/oplus/inner/hardware/camera2/impl/CameraMetadataNativeWrapper.java`, exposed via the existing `oplus-camera-stubs` `java_library {system_ext_specific:true}` + `<uses-library>` privapp plumbing. Use dodge's `getMetadataPtr` class shape (the `oplus-fwk` boot jar proves the shape). KEEP the **system_ext** form (placement-break hypothesis FALSIFIED in F1; both forms expose identical FQCNs to OplusCamera's classloader). |
| **Source (ii)** | **AUTHOR-NEW** the class body, but **proven sufficient by dodge** (`oplus-fwk` ships the class shape — F1 proof-of-form = **YES**). Cheap, isolated (pure Java-symbol resolution off the app classloader). |
| **Status (iii)** | **READY.** No open RE question — the class shape is proven by the dodge `oplus-fwk` source and the FQCN + method signature are pinned (R7 / I4). The only work is authoring the class body in `oplus-camera-stubs` and confirming it resolves. |
| **Interlock (v)** | **I4** (`CameraMetadataNativeWrapper.getMetadataPtr(Object)->long` resolves off OplusCamera's classloader → no CNFE at `algoInit`). Also gates **I3** loader-parity for R1 (same app classloader). BUILD-ORDER: F1 system_ext lib is a parallelizable lane; F3 carries its `<uses-library oplus.camera.stubs>` privapp grant (keep the names in sync). |
| **Verify** | `unzip -l oplus-camera-stubs.jar` + dex `strings` show the FQCN; frida-assert no CNFE at `APSClient.algoInit`. |

---

## 4 — R5 · `hdr_detected` (0x80be000b) published into per-frame result in an HDR scene — **CONFIG-DEFERRED**

| Field | Value |
|-------|-------|
| **Contract** | The AEC computes+exports `hdr_detected` unconditionally (`HDRTriggerFlagDetection` writes `aecOut+0xfc`); the **publish** into per-frame result metadata is the #2 publication contract. Not the freeze root (X2/R-08). |
| **LOS-tree edit (i)** | **config artifact (/vendor·/odm)** → adopt the OEM **odm CamX session-typing carrier** (HDRMode session-state typing in the odm CamX config that arms the AEC in-scene branch) + **keep** the HDR/EDR props that arm it, via `~/vendor_oplus_camera/configs/` PRODUCT_COPY_FILES + props. **Do NOT author the SHDR knob** — `selectSHDRAutoExposureUsecase=1` is X1, a CONFIRMED red herring (reads 0 in-scene; the only `camxoverridesettings.txt` our port ships is logging-mask-only). |
| **Source (ii)** | **ADOPT** (by negation + carrier) — dodge ships NO SHDR knob; HDRMode carriers live in odm CamX config. Config-only, Treble-clean. |
| **Status (iii)** | **CONFIG-DEFERRED.** The publish is OBSERVED present on stock (`aec-hdrdetect-publish-RE.md`: `OplusPublishCameraMetadata() HDRDetected:1`, gate `+0x48=1`, producer ran 2294×). The native compute+export is intact in the blob; the drop is the **downstream CamX AEC-node `com.qti.stats_control` publish** (in `camera.qcom.core`, stripped, runtime-gated on HDR-mode session state). The LOS `rc=−2` arm is deferred (the in-scene session-typing must be present + a runtime A/B run). |
| **Open question (iv)** | Confirm which odm CamX session-typing artifact arms the in-scene HDRMode branch on LOS (so `rc=−2`→`rc=0`), and run the in-scene A/B. The native lever is X1-refuted; the carrier is session-state typing, not a knob. |
| **Interlock (v)** | **I7** (session-typing ⟷ R5/R6 vendor-tag publish + F4 namespace): the publish must (a) fire in the in-scene AEC branch armed by the HDRMode session-typing AND (b) resolve through the vendor-tag namespace (`camxvendortags.cpp:419`). |
| **Verify** | `observe_getmetadata` in-scene with the session-typing present: `hdr_detected 0x80be000b` resolves + publishes (`rc != −2`). |

---

## 5 — R4 · Depth-2 `beforeConfigureStreamsLocked` (8K StreamSet retype) — **RE-BLOCKED (gated behind R2)**

| Field | Value |
|-------|-------|
| **Contract** | Bind the 8K configure_streams: base `op_mode 0x8001`/9-stream/`logicalCameraId 4` (RAW10 4096×3072 ×5 + RAW10 8192×6144) AND EIS `op_mode 0x80a9`/5-stream carrying the EISv2 `7680×4320` pair. Missing ⇒ EISv2 node 2-in/0-out → NULL pipeline → **#8 `−38`**. |
| **LOS-tree edit (i)** | **author the 6 Depth-2 internal ext hooks** in the LOS `frameworks/av` `libcameraservice` ext (the same `ext/` dir av/0001 creates), as **internal call sites** of `CameraServiceExtImpl` wired into `CameraService`/`Camera3Device`. The 6 (per `oem-binder-ontransact-RE.md`): `beforeConfigureStreamsLocked` (file `0x17b71c` — emplace `MetaStreamInfo` @`+0x598` on `vtbl+0x20==300 && vtbl+0x28==0x400`, set `+0x14=0x18`), `getExtensionOperatingMode` (file `0x184818` — returns `0x80a9` from vendor-tag `UNK_00142f77`), `processPreview` (file `0x07c9a0`), `beforeMetadataSendToApp` (file `0x07aa14`), `afterConnect` (file `0x16d444`), `afterConfigureStreamsLocked` (file `0x17ce44`). |
| **Source (ii)** | **AUTHOR-NEW.** Dodge proof-of-form = **NO** — av/0001 is **Depth-1 only** (the `onTransact` delegate); neither dodge nor our port has the Depth-2 internal call sites. Author against the Ghidra offsets as the spec, not lift. |
| **Status (iii)** | **RE-BLOCKED.** The hook *signatures + roles* are RE-recovered, but the **6 hook bodies are not authored** and the call-site wiring (which cameraserver path invokes each) is not pinned. **Gated behind R2** (no Depth-1 receiver ⇒ no Depth-2 reach). |
| **Open RE question (iv)** | **Author the 6 Depth-2 hook bodies** against `0x17b71c`/`0x184818` (+ the 4 others). B/C must: **(1)** decompile each hook body fully (the RE note has signatures + the `beforeConfigureStreamsLocked` emplace mechanism, but not byte-complete bodies), **(2)** identify the cameraserver call site for each (which `CameraService`/`Camera3Device` method forwards into the ext hook — the "Depth-2 the real work beyond dodge" wiring), **(3)** confirm via the 8K probe (`hook_configure_streams`) that `beforeConfigureStreamsLocked` is what binds the EISv2 `7680×4320` output on stock (the hypothesis is mechanistically strong but NOT proven; doc-35 Gralloc5 cand-a / **D1** is a parallel co-root). |
| **Interlock (v)** | **I1** (Depth-2 has no reach until the Depth-1 receiver + re-added blob exist) → BUILD-ORDER edge 2: **av/0001 + reverse `d654641` → R4 author-new hooks → C3 8K configure_streams binds.** Co-root **D1** Gralloc5 stream-usage. |
| **Verify** | `strings cameraserver` carries `CameraServiceExt*` (I1 precondition met by R2); `hook_configure_streams` shows the EISv2 `7680×4320` output stream bound (not 2-in/0-out NULL pipeline); #8 8K run no longer `−38`. |

---

## 6 — R3 · libgui-WRITE + SF-READ OEM-EDR ABI (`setEdrViewTransform` 4×4 curve) — **RE-BLOCKED (author-new both sides)**

| Field | Value |
|-------|-------|
| **Contract** | Port `Transaction::setEdrViewTransform` writing the `OplusEdrViewTransform` 4×4 tonemap curve (`transform[16]`, struct `0x5C`), consumed SF-side by `OplusRequestedLayerState::setEdrMetadata` → LinearEffect `m*color+v`. AOSP/LOS export **std-ratio only** ⇒ curve dropped ⇒ ~5× over-exposure (**#3**). A landed std-ratio call alone is **insufficient by construction** (the falsifier). |
| **LOS-tree edit (i)** | **TWO native ABI edits, both sides** in the LOS `frameworks/native` tree: **(WRITE)** add `Transaction::setEdrViewTransform` to libgui (`frameworks/native/libs/gui` — the per-SC `Transaction` state: write the `0x5C` `OplusEdrViewTransform` into the per-slot map `+0x0A0`, set `what +0x198` bit63 OEM-dirty; restore the dropped `SIZE_DISPLAY_MAX=16`/`SIZE_POSITION_MAX=2` consts for ABI parity). **(READ)** add `OplusRequestedLayerState::setEdrMetadata` to SurfaceFlinger (`frameworks/native/services/surfaceflinger` — walk the server `layer_state_t` per-slot node list `+0xB0`, on change-mask bit1 `memcpy` `0x5C` from node `+0x34`, feed `transform[16]` → EDREngine → LinearEffect). **PLUS the F1 precondition** (R3-partial): patch `OplusEdrUtils.getBlastSurfaceControl(SurfaceView)` in `oplus-camera-stubs` to return a **REAL** BLAST Surface (not `return null`). |
| **Source (ii)** | **AUTHOR-NEW** on BOTH the WRITE and READ side. Dodge proof-of-form = **NO** — no dodge framework patch carries the EDR ABI (base/0001 only touches `SurfaceView.setExcludeSnapshot`, a no-op stub for #3). The OEM EDR program **is** OBSERVED firing on stock (`setEdrViewTransform ×1`, `setEdrSdrRatio ×2`, `setEdrFlags=0x80101`) after the REAL BLAST Surface precondition. std-ratio-only is the explicit **falsifier** → a write-only port does NOT satisfy R3. |
| **Status (iii)** | **RE-BLOCKED.** Both the WRITE struct geometry (libgui client `Transaction`) and the READ consumption (SF server `layer_state_t`) are RE-recovered (`edr-sf-readside-RE.md` + the write-side note), but **the exact 4×4 `transform[16]` curve wire values + ratio are pending a probe FP-decode fix** (the probe reads `ratio=-1.0e10` garbage), and no LOS reference proves the form. |
| **Open RE question (iv)** | **(1) The libgui `setEdrViewTransform` curve ABI wire values** — fix the aarch64-FP decode in the probe so the exact `transform[16]` + `edrSdrRatio` are captured (currently garbage). The WRITE offsets are: `setEdrViewTransform` file `0x27fd48`, `what +0x198` bit63, client map `+0x0A0`; the READ side is `setEdrMetadata` file `0x30755c` (`0x5C` memcpy node `+0x34`, change-mask bit1), ratio clamp [1.0..5.0] `GameEdr::setEDRStatus` file `0x2cc9b4`. **(2)** Confirm the client `Transaction` struct ↔ server `layer_state_t` deserialization mapping (the SF read offsets are NOT numerically equal to the libgui write offsets — they are the deserialized image of the same wire fields). |
| **Interlock (v)** | **I5** (F1 `getBlastSurfaceControl` real-Surface ⟷ F2 EDR ABI precondition): F1 alone is **necessary-but-insufficient** — a real Surface with no curve ABI still drops the tonemap; and a std-ratio-only F2 port is insufficient by construction. Co-root **E1/F1** `OplusEdrUtils` no-op stub. |
| **Verify** | `trace_edr_invocation.log`: assert `getBlastSurfaceControl → REAL BLAST Surface` ×3, then `setEdrViewTransform` ×1 with non-garbage `transform[16]`; over-exposure resolved (not ~5×). |

---

## 7 — R6 · OEM IPE TurboHDR vendor tag (~0x4d78) published in an HDR scene — **DARK (deferred)**

| Field | Value |
|-------|-------|
| **Contract** | The OEM IPE TurboHDR vendor tag (~0x4d78) must be published in an HDR scene (sibling of R5). Un-published ⇒ `parseTurboHdrInfo` cbz-skips its store ⇒ `field_0x4d88` null ⇒ `setProcessOtherParams+140` `strlen(null)` SIGSEGV (**#6**, currently masked by libapsfixup Family-III). |
| **LOS-tree edit (i)** | **config + sepolicy-namespace** → (a) adopt the **same odm session-typing** as R5 (`~/vendor_oplus_camera/configs/`) to arm the in-scene IPE TurboHDR publish; (b) adopt the sepolicy `same_process_hal_file` namespace for the tag-producer lib in `~/vendor_oplus_camera/sepolicy/` (the F4 Treble-clean `.te` family). |
| **Source (ii)** | **ADOPT** (same session-typing as R5) + **adopt** the sepolicy label family. Dodge proof-of-form = **PARTIAL** — proves the namespace-form (sepolicy label family), not the publish. |
| **Status (iii)** | **DARK.** The carrier is **RE-inferred only** — app-side `observe_getmetadata` never loaded `libAlgoProcess.so` that run (intCalls=0). The store mechanism is RE-mapped (`TurboRaw::parseTurboHdrInfo`→`field_0x4d88`, deref at `setProcessOtherParams+140` device `0x1441ad4`) but not runtime-confirmed. |
| **Open RE question (iv)** | **Confirm the TurboHDR tag publish app-side** — get `libAlgoProcess` loaded in-scene and observe whether the ~0x4d78 tag is published (the gating observation before retiring Family-III). The fix FORM is settled (publish-at-root via session-typing, not the guard); only the runtime confirmation is missing. |
| **Interlock (v)** | **I7** (session-typing ⟷ vendor-tag publish + F4 namespace): same in-scene arm + vendor-tag namespace resolution as R5. |
| **Verify** | `observe_getmetadata` with `libAlgoProcess` loaded in-scene: the ~0x4d78 TurboHDR tag publishes; then `parseTurboHdrInfo` stores `field_0x4d88` (no `strlen(null)`); then Family-III guard becomes dead code. |

---

## 8 — libapsfixup REDUCTION (cross-cutting consequence of R1 + R6) — **3 families, shrink-not-edit**

The shim is **6 interposers / 3 families** (POST-PROCESSING-CONTRACT.md). It is not a keep-or-remove edit;
it **shrinks** as the requirements land at the root. **Dodge ALSO ships libapsfixup → dodge has NOT done
the root fix → our reduction is the improvement.** There is **no direct LOS edit** to libapsfixup itself —
the reduction is a *downstream verification* that a family's guard became dead code once its root req landed.

| Family | What it masks | LOS action | Root req (this plan's row) | Status |
|--------|---------------|-----------|----------------------------|--------|
| **I — P010/chroma geometry** | lock-math divergence (no lever) | **KEEP** the `libapsfixup` Family-I interposers (`p010LSB2MSBNeon` slot `0x689ba8`; `ARC_Turbo_RAW_Process`/`ARC_TFRSN_Process` dlsym) — minimal, irreducible (rearch/14, no facilitation lever) | none | **KEEP** — accepted defense; the only residue once II/III retire |
| **II — `copyMetadata` null-guard** | #4 UAF (mask, not cause; slot `0x686ee8`, body `+0x292960`) | **RETIRE via root** — when **R1** lands (release upcall fires per-frame), `metaBufferMap` stays bounded → no freed source → the guard is **dead code** | **R1** (row 2) | **BLOCKED on R1** (RE-BLOCKED). Retires #1 + #4 in one fix. |
| **III — TurboHDR `strlen` guard** | #6 SIGSEGV (mask; slot `0x1bb6888`) | **RETIRE via root** — when **R6** publishes the TurboHDR tag in-scene, `parseTurboHdrInfo` stores `field_0x4d88` → no `strlen(null)` → guard dead | **R6** (row 7) | **BLOCKED on R6** (DARK). Deferred while R6 is unconfirmed; form settled. |

> **Reduction discipline:** the shim ships **unstripped from in-tree source** (`vendor/oplus/camera-sm8850/apsfixup/apsfixup.cpp`); `grep metaObjRef|MetaImageRef|decMetaRef|isInc|callbackToCamUnit` over the binary = **0** — it never touches the metadata *lifetime*, so it **cannot** be the break, only hide it. The LOS edit is to **R1/R6's roots**, never to the shim; the reduction is the observable that proves the root landed.

---

## 9 — R8 · face-beauty preview JNI load-path probe (S9) — **READY (smali probe-rewrite, ROOT PINNED)**

| Field | Value |
|-------|-------|
| **Contract** | `com.oplus.camera.facebeauty.OplusFaceBeautyPreview.<clinit>` existence-gates `/product/lib64/libApsFaceBeautyPreviewProductJni.so` then `loadLibrary("ApsFaceBeautyPreviewProductJni")` (bare-name → SONAME). On LOS the guarded lib ships to `/system_ext/lib64` (`my_product→system_ext` remap), so the `/product/lib64` probe FAILS → unguarded in-APK `libApsFaceBeautyPreviewJni.so` fallback (no `FBInitFlag` async-init) → apply (`Slender2D_process`) before init → all-zero `FaceBeautyParams` → `lib2DSlender adjustParam+836` SIGSEGV-null (**#9**). |
| **LOS-tree edit (i)** | **smali probe-string rewrite** → add a hunk under `vendor/oplus/camera/patches-sdk/` rewriting `smali/com/oplus/camera/facebeauty/OplusFaceBeautyPreview.smali` **L19** `"/product/lib64/libApsFaceBeautyPreviewProductJni.so"` → `"/system_ext/lib64/libApsFaceBeautyPreviewProductJni.so"`. The jar `com.oplus.camera.unit.sdk.jar` is already `apktool_patch('patches-sdk')`'d at `extract-files.py:142` (existing `patches-sdk/0001-fixes.patch`) — **no extract-files.py change**. One rewrite covers both qcom + non-qcom branches (both probe L19 first). |
| **Source (ii)** | **AUTHOR-NEW** (a one-string smali rewrite). Dodge proof-of-form = **NO** (no dodge face-beauty-preview crash). |
| **Status (iii)** | **READY — ROOT PINNED.** On-device v2.1 VERIFIED (frida + 6+ tombstones): the BUILD succeeds (`ParamAdjustFactory::adjustParameters` out populated) but the consumer gets all-zero; guarded lib `17efbc5b` byte-identical + present at `/system_ext/lib64`; probed `/product/lib64/…ProductJni.so` ABSENT. No open RE question. |
| **Interlock (v)** | None load-bearing (the lib loads by bare name → no sepolicy/namespace dependency; independent of R1–R7). |
| **Verify** | After build: `grep …ProductJni.so /proc/$(pidof com.oplus.camera)/maps` present; `FBinit success`/`wait for init finish` in logcat (strings exist only in the Product lib); front-cam + face-retouch + face → no crash; frida `adjustParam` → `FaceBeautyParams allZero=false`. |

---

## 10 — v2.2 device-tree fixes (pano blobs + text-mode sepolicy) — **READY**

LOS device/vendor-tree edits (not R-items): a missing-blob re-add + sepolicy `allow` rules, both with on-device-verified roots this session.

### 10a — Pano: add `libjni_burstpmk.so` + `libarcsoft_panorama_burstcapture.so` — **READY (adopt-from-dump, wideselfie form)**
- **Contract:** PANO FATAL-crashes (`UnsatisfiedLinkError` at `com.arcsoft.camera.burstpmkv2.BurstPMKEngine.<clinit>`) — the 2 native libs are absent (the Java class already ships).
- **(i)** `vendor/oplus/camera`: `proprietary-files.txt` (+2 `my_product/lib64/{libjni_burstpmk,libarcsoft_panorama_burstcapture}.so:system_ext/lib64/…`), `camera-vendor.mk` PRODUCT_PACKAGES (+2), `camera/Android.bp` (+2 `cc_prebuilt_library_shared`, `system_ext_specific`). Model = the in-tree **wideselfie** pair; source blobs = `dump300_full/my_product/lib64/`.
- **(ii)** ADOPT-from-dump (wideselfie-identical form). **(iii)** READY. **Verify:** MORE→PANO enters w/o `UnsatisfiedLinkError`; pano capture completes.

### 10b — Text-mode sepolicy: 4 `allow` rules — **READY (author-new from OOS policy)**
- **Contract:** TEXT/OCR triggers 4 avc denials (permissive-only today; would block under enforcing). OOS (enforcing) grants all 4.
- **(i)** `vendor/oplus/camera/sepolicy/vendor/opluscamera_app.te` (+`vendor_camera_data_file:dir/file`, +`vendor_qdsp_device:chr_file {ioctl read open}`), `sepolicy/private/opluscamera_app.te` (`binder_call(opluscamera_app, system_suspend)`), `sepolicy/private/cameraserver.te` (`allow cameraserver opluscamera_app:process setsched;` — plat-private; both cameraserver and opluscamera_app are coredomains, so the rule belongs in private/, not vendor/), and `device/qcom/sepolicy_vndr/sm8850/generic/vendor/common/domain.te` line 119 (carve `-opluscamera_app` into the `vendor_qdsp_device:chr_file ~{ioctl read}` neverallow — the ONE non-`vendor/oplus/camera` edit; board `canoe`=`UM_6_12_FAMILY`→`sm8850` per `SEPolicy.mk`, NOT sm8750).
- **(ii)** AUTHOR-NEW (mirrors OOS plat_pub_versioned / system_ext policy). **(iii)** READY. **Verify:** `setenforce 1` + drive TEXT → zero `avc denied` for the 4 contexts.

---

## Work-order summary (BUILD-ORDER load-bearing-first)

| # | Req | LOS edit form | Source | Status | Interlock | Gate |
|---|-----|---------------|--------|--------|-----------|------|
| 1 | **R2** | framework patch (av/0001) + reverse `d654641` (`libcsextimpl.so` → /system_ext) | **ADOPT** | **READY** | I1+I6 | TOP action; GATES R4 |
| 2 | **R1** | author-new Java release receiver (frameworks/base + JNI) | author-new | **RE-BLOCKED** | I2+I3 | needs F1 stub built first |
| 3 | **R7** | author-new stub class (`oplus-camera-stubs` system_ext) | author-new (dodge-proven) | **READY** | I4 | parallelizable lane |
| 4 | **R5** | adopt odm session-typing config + keep HDR props | **ADOPT** (by negation) | **CONFIG-DEFERRED** | I7 | do NOT author X1 SHDR knob |
| 5 | **R4** | author-new 6 Depth-2 hooks (libcameraservice ext) | author-new | **RE-BLOCKED** | I1 | **gated behind R2** |
| 6 | **R3** | author-new libgui WRITE + SF READ EDR ABI (both sides) + F1 stub patch | author-new | **RE-BLOCKED** | I5 | std-ratio-only is the falsifier |
| 7 | **R6** | adopt session-typing + sepolicy namespace; then retire Family-III | **ADOPT** | **DARK** | I7 | deferred until publish confirmed |
| — | native/0001 | adopt BINDER_VM_SIZE 1→4MB (`libs/binder/ProcessState.cpp`) | **ADOPT** (file-identical) | **READY** | — | low-risk; verify it built into `libbinder` |
| — | base/0001 | already applied+effective (`nativeGetOplusHardwareBuffer`) | — | **DONE** | — | #7 REFUTED (X3); close benign |
| 8 | **R8** | smali probe-rewrite (`patches-sdk`: `/product`→`/system_ext`) | author-new | **READY** | — | **v2.2**; #9 face-beauty (independent of R1–R7) |
| — | pano | +2 blobs (proprietary-files + camera-vendor.mk + Android.bp, wideselfie form) | ADOPT-from-dump | **READY** | — | **v2.2**; fixes pano `UnsatisfiedLinkError` |
| — | text-sepolicy | 4 `allow` rules (`vendor/oplus/camera/sepolicy` ×3 + sm8850 `domain.te` neverallow carve-out) | author-new (from OOS policy) | **READY** | — | **v2.2**; TEXT/OCR under enforcing |
| — | R4 (fold-in) | bake `frameworks/av ff7a3713a` Depth-2 hooks (already cam-final tip) into bacon — no more overlay | adopt (already wired) | **READY** | I1 | **v2.2**; completes Depth-2 lifecycle (does NOT gate 8K) |

**Keep / no-action:** X1 (do-not-author the SHDR knob), X4 (do-not-author the public.libraries entry; re-home #5 at D1), Family-I (keep minimal), the non-P010 sepolicy/public.libraries enablers (keep the 12-lib patch + Treble-clean `.te`).

## What this plan stages now vs blueprints
- **STAGED (ready to land):** **R2** (av/0001 + the `d654641` reversal recipe — see `R2-apply-manifest.md`) and **native/0001** (file-identical adopt). **R7** is READY-to-author (no RE block) but not staged as a patch (it's a new Java class to write into `oplus-camera-stubs`, not a portable .patch).
- **v2.2 cycle — STAGED & READY (all on-device-verified roots, §9/§10 above):** **R8** (smali probe-rewrite in `patches-sdk/`), **pano** (+2 blobs, wideselfie form), **text-sepolicy** (4 `allow` rules incl. the sm8850 neverallow carve-out), and **R4 fold-in** (`frameworks/av ff7a3713a` baked by bacon, no more `libcameraservice.so` overlay). These land on the cam-final forks → build `lineage-23.2-v2.2-infiniti.zip`.
- **BLUEPRINTED (RE-BLOCKED / deferred):** **R1** (locate the `gCallbackRequestAction` bridge JNI lib + LOS A/B), **R4** (author the 6 Depth-2 hook bodies, gated behind R2), **R3** (the libgui `setEdrViewTransform` curve ABI wire values + SF read mapping), **R5** (config-deferred: the in-scene session-typing arm + `rc=−2` A/B), **R6** (DARK: confirm the TurboHDR publish app-side).

## Cross-links
- Board: `../docs/facilitation/INDEX.md` · F-nodes: `F1-stubs.md` (R7, R3-precondition) · `F2-system-framework.md` (R1/R2/R3/R4) · `F3-toggles-config.md` (R5/R6) · `F4-sepolicy-namespace.md` (libapsfixup reduction)
- Build contract + interlocks I1–I7: `../docs/facilitation/BUILD-ORDER.md`
- Spec: `../docs/interop-tree/REQUIREMENTS.md` · `../docs/interop-tree/POST-PROCESSING-CONTRACT.md`
- RE anchors: `../docs/re-notes/{oem-binder-ontransact,decmetarefzero-upcall,edr-sf-readside,aec-hdrdetect-publish}-RE.md`
- R2 landing detail: `./R2-apply-manifest.md` · staged patches: `./patches/`
