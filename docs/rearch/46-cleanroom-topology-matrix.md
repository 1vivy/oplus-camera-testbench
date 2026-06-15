<!-- STATUS: VERIFIED — evidence-anchored RE/capture; no inference-surgery needed (doc-50 method).
     Pass-B note: the matrix rows contain STATUS fields (✅/◐/✗) and "leads to scan, not confirmed
     roots" flagging (VRR/FRTC row, Addendum A) which are self-labelled as unproven. The
     Addendum A "consequence" paragraph contains one unsupported-root claim presented as fact:
     "explaining why the matrix's setExtendedRangeBrightness plumb candidate (doc-40) was unproven"
     — this is mechanistic inference from static RE, not a runtime-confirmed root. Flagged for Pass-B
     but does not require restructuring the whole doc. -->

# Clean-Room Topology Matrix — OplusCamera Port (OP15 / infiniti / SM8850)

> **Purpose.** A scoped *matrix* (not an action plan) that slots every camera fix/workaround
> into the repo it belongs in under a target clean-room tree, classified by whether the
> capability lifts from the dodge OOS16 reference as-is or must be re-derived for SM8850.
> It is the stepping-stone artifact for (a) reliable incremental work against the current
> tree and (b) building a new clean-room repo topology.
>
> Date: 2026-06-12 · Branch context: `rearch/vendor-oplus-camera-blueprint`

## Framing: the unification seam

dodge (spkal01 / crDroid, OnePlus 13, **sm8750**) and infiniti (OnePlus 15, **sm8850**) are
**the same OOS generation (OOS16)**. The unification is real and cuts cleanly along the
**Java/framework ↔ native seam**:

| Layer | Unified across Oplus lineup? | Transfers dodge(sm8750) → infiniti(sm8850)? |
|---|---|---|
| oplus-fwk boot stubs, OCS SDK integration, sepolicy shape, props, `public.libraries`, extract-files structure, `frameworks/{base,av,native}` bridges | **Yes** — OOS16-wide, SoC-independent | ~1:1 (lift from dodge) |
| libapsfixup GOT/struct offsets, `libAlgoProcess` patch sites (`0x1c9eb0`, `0x603a88`), `oemlayer.v2` offsets, sensor modes, CHI graphs, blob versions | **No** — SoC + blob-version specific | dodge gives the *technique*; SM8850 bytes re-derived |

**Role of dodge: patch donor + completeness oracle, NOT a re-fork baseline.** It is a crDroid
tree (its `patch-common` drags build/soong, LMOFreeform, Launcher3, LatinIME, gapps) and
sm8750-native. We are past baseline-selection: working e2e capture, architect-deduced clean
module (doc-38), LOS-consistent behavior post-`adb remount`. dodge's value is to **diff against
our tree to find gaps**, slot-by-slot below.

## Legend

- **Portability** — 🟢 Portable (OOS16 Java/fwk/sepolicy; lift from dodge unchanged) · 🟡 Config (same shape, SM8850 values/blobs) · 🔴 Re-derive (native offsets/anchors; dodge gives technique, not bytes)
- **Provenance** — `D` dodge has it · `O` we have it · `D+O` both
- **Status (our tree)** — ✅ have · ◐ partial · ✗ missing

Repo tags: **cam** `vendor/oplus/camera-sm8850` · **SoT** `~/vendor_oplus_camera` · **v/inf** `vendor/oneplus/infiniti` · **d/inf** `device/oneplus/infiniti` · **d/com** `device/oneplus/sm8850-common` · **v/com** `vendor/oneplus/sm8850-common` · **fwk-base** `frameworks/base` · **oplus-fwk** `hardware/oplus`.

---

## Tier 1 — Platform (custom-ROM-agnostic, shared across all Oplus/SoC)

| Repo slot | Capability | Purpose | OOS baseline | Port. | Prov. | Status |
|---|---|---|---|---|---|---|
| `frameworks/base` | `getOplusHardwareBuffer` / AHardwareBuffer bridge | APS reads correct `camera_metadata` size from picture_metadata stream | `oplus-framework.jar` defines it natively | 🟢 | D+O | ✅ `9d03af1` |
| `frameworks/av` | **OEM cameraserver layer = `libcsextimpl` (`CameraServiceExtImpl`)**. Depth-1: `CameraServiceExtFactory` onTransact→22 binder codes (zoom/auth/client-info). Depth-2: internal call-site hooks (`beforeConfigureStreamsLocked`/`getExtensionOperatingMode`/`processPreview`/`beforeMetadataSendToApp`/`addRemovePackageName`) | zoom (bug-b), client-info/auth handshake, **stream-shaping (8K)**, preview/metadata massage (Gate B/exposure) | OOS cameraserver calls `CameraServiceExtImpl` throughout — **see doc-48** | 🟢 | D (Depth-1 only) | ✗ **missing** (libcsextimpl dropped `d654641`; our `CameraService` has 0 call sites; dodge ports Depth-1 only) |
| `frameworks/native` | **BINDER_VM_SIZE 1MB→4MB** | Master-Mode RAW / large metadata binder txns | OOS raises it | 🟢 | D | ✗ **missing** |
| `hardware/oplus` (oplus-fwk boot jar) | OOS16 framework stub surface (~40 classes) | Boot-classpath OEM classes for all priv-apps | OOS `oplus-framework.jar` | 🟢 | D+O | ◐ partial — see Tier 1b |

### Tier 1b — oplus-fwk stub completeness (boot jar) — dodge is the canonical checklist

| Class | Ties to | Port. | Prov. | Status |
|---|---|---|---|---|
| `OplusUIFirstManager` (`setUxThreadValue`, `setBinderThreadUxFlag`) | launch NoSuchMethodError | 🟢 | D+O | ✅ `8ff815f`/`00c055f` |
| `OplusActivityManager` (boot-jar placement) | AIUnit visibility | 🟢 | D+O | ✅ `00c055f` |
| `OplusEdrUtils` | **over-exposure / EDR tonemap** (doc-40, unproven) — **necessary-but-insufficient: the Java stub binds to the Addendum-A libgui/SF native EDR ABI that AOSP doesn't export** | 🟢 | D | ✗ **missing — high value** |
| `OplusBaseConfiguration` / `OplusExtraConfiguration` | TypeFaceUtil NPE root | 🟢 | D | ◐ (we smali-neuter instead) |
| `OplusCameraManager` + `IOplusCameraManager` Cmd enum, `sendOplusExtCamCmd` (no-perm), `getMetadataTag` | OEM cam cmd path | 🟢 | D | ✗ missing |
| `CameraMetadataNativeWrapper` | motion-photo / SuperEIS | 🟢 | D+O | ✅ (in stubs jar; dodge puts in boot jar) |
| `OplusAudioManager`, `LinearmotorVibrator`, `com.oplus.uah.*`, `JankManager`, graphics `OplusOutline/Path` | shutter sound, haptics, perf, UI | 🟢 | D | ✗ mostly missing |

---

## Tier 2 — Device (per-SoC / per-model: sm8850-common, infiniti)

| Repo slot | Capability | Purpose | OOS baseline | Port. | Prov. | Status |
|---|---|---|---|---|---|---|
| d/com | `public.libraries.txt` expose `libapsfixup.so` | app namespace dlopens `/odm` shim | OOS lists `/odm` cam libs | 🟢 | D+O | ✅ `ffb638b` |
| d/com | drop stale `snapcam` privapp.list | HAL privileged-client gate → `com.oplus.camera` | OOS empty in build.prop | 🟡 | O | ✅ `ec876d0` |
| d/com | OOS-parity props (`defercap`, `midasd`) | feature enablement | OOS build.prop | 🟡 | O | ✅ `15677ba` |
| d/inf | inherit `opluscamera.mk` (OCS product layer) | wire app/SDK/stubs/sepolicy | OOS integrated image | 🟡 | D+O | ✅ `27589e6` |
| d/inf | restore config `fdSupport=TRUE` + engine `.lic` | SW face-detect / CoupleHDR | OOS config ships TRUE | 🟡 | O | ✅ `74a7c82` |
| `device/qcom/sepolicy_vndr/sm8850` | oplus-camera xDSP + neverallow fixes | sepolicy build/runtime | OOS monolithic policy | 🟢 | D+O | ✅ (trimmed overreach `82cd0f4`) |
| `system/sepolicy` | init/vendor_init `proc_type` (`/proc/devinfo/ufs`) | EACCES fix | OOS `proc_type`-labelled | 🟢 | D+O | ✅ `8b3ee37` |
| `kernel/oneplus/sm8850` | kernelSU | (root, out of camera scope) | n/a | 🟡 | D | — |

---

## Tier 3 — Camera module (the deliverable OCS layer)

### 3a · cam — app, OCS SDK, stubs, permissions, configs

| Capability | Purpose | OOS baseline | Port. | Prov. | Status |
|---|---|---|---|---|---|
| App-side plumbing (uses-library, SystemProperties wrapper, framework_shims) | OCS SDK reaches framework | OOS boot-classpath stubs | 🟢 | O | ✅ `5d6fca2` |
| OCS SDK jar `IS_OPLUS_PACKAGE` identity stamp | first-party feature gate (SAT-Fusion `-38`) | OOS cameraserver stamps pkg-name into metadata (`CameraServiceExtImpl::addRemovePackageName`); we self-stamp in the SDK instead | 🟢 | **O — ahead of dodge** (dodge has NO identity patch; only `ro.oplus.system.camera.name`+`SYSTEM_CAMERA` perm — see doc-48) | ✅ `62009bf` |
| stubs: `CaptureResult`/`CameraMetadataNative`/`View`/`ViewRootImpl` delegation | motion-photo, SuperEIS, thumbnail NPE | OOS thin wrappers | 🟢 | D+O | ✅ `725bd52`/`9d6882b` |
| remove `com.oplus.tblplayer` from stub jar | gallery video classloader shadow | OOS app-bundled | 🟢 | O | ✅ `abd7850` |
| `OplusCameraSafePermissions` definer APK | gallery predecode bind perm | OOS in SecurityPermission.apk | 🟡 | O | ✅ `b3d8ea1` |
| TypeFaceUtil → `Typeface.DEFAULT` (smali) | AI/UI crash family | OEM fwk populates font cfg | 🟡 | D+O | ✅ `92691e5` *(supersede w/ EdrUtils-style boot stub if Tier-1b done)* |
| `OplusBlurProcess` null-guard | portrait→selfie NPE | OEM hw-feature layer | 🟡 | O | ✅ `d85d2f2` |
| preview HDR→SDR (prop-only) | over-exposure stopgap | OOS HLG tonemap path | 🟡 | O | ◐ stopgap (real fix = `OplusEdrUtils`, Tier-1b) |
| APK repack `--no-res` + pyaxml AXML | resource/locale/FileProvider integrity | OOS stock arsc | 🟡 | O | ✅ `39961b8` |
| thumbnail `getApply` + gallery handoff | thumbnail hang | OOS WMShell `FlexibleTaskView` | 🟡 | O | ◐ plain-launch substitute |

### 3b · libapsfixup (native interposer) — 🔴 technique from dodge, offsets re-derived for SM8850

| Capability | Purpose | OOS baseline | Port. | Prov. | Status |
|---|---|---|---|---|---|
| `libapsfixup` framework (apsfixup.cpp/Android.bp) | P010 plane-layout interposer | OOS gralloc returns contiguous P010 | 🔴 struct / 🟢 scaffold | D+O | ✅ ported from dodge `0006` |
| `p010LSB2MSBNeon` length + ASVL chroma-ptr repair | super-night/turbo-HDR/RAW OOB SEGV | contiguous planes on OOS | 🔴 | D+O | ✅ `15846d9`/`c3a2b11` |
| `copyMetadata` UAF GOT guard | deferred quick-jpeg | OOS keeps metadata alive across DeferJob | 🔴 | O | ✅ `b8a5b8e` |
| in-blob `libAlgoProcess` P010 `min()` trampoline `@0x1c9eb0` | height OOB | n/a (consumer-side) | 🔴 | O | ✅ `f3f372e` |
| `getStub`-flip `@0x603a88` (IMapper@4 passthrough) | A16 no binderized hwservicemanager | OOS uses passthrough | 🔴 | O | ✅ `c11d5fa` |

### 3c · v/inf — blobs + extract-files blob_fixups (🔴/🟡 per-blob)

| Capability | Purpose | OOS baseline | Port. | Prov. | Status |
|---|---|---|---|---|---|
| DT_NEEDED `libapsfixup` into `libAlgoProcess` | load interposer | shim is port-only | 🟡 | D+O | ✅ `86a302b`/`f2d9235` |
| `camera.oemlayer.v2.so` (videodehaze excluded) | OCS characteristics; avoid CHI crash | OOS ships oemlayer.v2 + libVideoDehaze | 🟡 | O | ✅ `f4b50d9` |
| `OemLayer::UpdateMoonLayoutResultMeta` NOP `@0x2424ac` | QCFA null-deref | OOS resolves QCFA sensor-mode | 🔴 | O | ✅ `2d6d7d7` |
| `libBasicTonePhoto` R/B-swap GLSL fix | Master/Pro color | bug in extracted blob both SoCs | 🔴 | D+O | ✅ `2972f42` |
| `libalogencrypt.so` (config decrypt) | OCS reads `oplus_camera_config` | OOS odm ships it | 🟡 | O | ✅ `313649e` |
| offlinecamera HAL blob_fixup (dodge `0003`) | offline-reprocess path | OOS HAL | 🔴 | D | ✗ (eval vs our IMapper path) |
| `libEISLive.so` (dodge `0008`) | EIS | OOS odm | 🟡 | D | ✗ (verify on SM8850) |

### 3d · Gallery / AIUnit / QNN / media (🟡 packaging)

| Capability | Provenance | Status |
|---|---|---|
| OppoGallery2 + QNN V81 aiboost migration | O | ✅ `e065856` |
| AIUnit wiring + smali authorize | O | ✅ `3e21531` |
| Dolby Vision codec inline registration | O | ✅ `206f84d` |

---

## Build order & supersession notes

**Walk the topology top-down; the Portability column dictates method per slot:**

- 🟢 **Tier 1 + sepolicy** — lift from dodge OOS16 essentially verbatim. This is where the
  unified-stack value is real and currently **under-mined**.
- 🟡 **Config** — same shape as dodge, SM8850/.201 values (props, blob lists, configs).
- 🔴 **Re-derive** — native offsets; dodge gives the recipe (symbol + fix shape), we supply
  SM8850 bytes. All ✅ already — do **not** re-port these from dodge.

**Net gaps exposed (everything else ✅):**
1. `frameworks/av` CameraServiceExt + libcsextimpl (🟢, **zoom / bug-b**) — highest leverage, SoC-portable.
2. `frameworks/native` BINDER_VM_SIZE 1MB→4MB (🟢, **Master-Mode RAW**) — one line, low risk.
3. `OplusEdrUtils` + remainder of dodge oplus-fwk boot stubs (🟢, **over-exposure** + robustness).
4. Blob evals: offlinecamera HAL fixup, `libEISLive.so` (🔴/🟡, verify on SM8850).

**Supersession chains (don't double-count):** preview SDR `c45f452`(smali)→`af344d3`(prop);
P010 height `1e51674`(ldr)→`f3f372e`(min-trampoline); quick-jpeg `f3f372e`(=0)→`9528575`(re-enabled,
shim-guarded); TypeFaceUtil `e72da61`→`65e764c`→`92691e5`(+SoT `2b2f66f`). The `libcsextimpl.so`/zoom
fix (SoT `d097f1c`) was **dropped** at cam `d654641` pending the `frameworks/av` side (gap #1).

## Cross-cutting OOS-baseline buckets

The bulk of the matrix falls into three OOS-baseline causes:
- **(a) OEM framework absent** — `oplus-framework.jar` boot classes → Tier 1/1b stubs + bridges.
- **(b) gralloc plane non-contiguity on Gralloc5/A16** → Tier 3b libapsfixup family (OOS gets
  contiguous P010 from byte-identical mappers; consumer-side ABI lock-math divergence, see doc-14/42).
- **(c) integrated-image assumptions** — props/sepolicy/codecs OOS ships monolithically → Tier 2 + 3a/3d restorations.

---

## Addendum A — OOS `/system` binary RE: un-scanned framework divergences (2026-06-12)

> Static RE pass over the OOS `dump201_full` `/system` binaries the matrix never examined
> (Tier 1 had only listed `libcameraservice` + `BINDER_VM_SIZE`). Method anchored by confirming
> `nativeGetOplusHardwareBuffer` **is** present in OOS `libandroid_runtime.so` — matching the
> already-landed `9d03af1` bridge — then scanning siblings for OEM symbols absent from AOSP/LOS.

**OEM footprint (oplus dynsym / oplus strings), camera-relevant `/system` libs:**

| Binary | dynsym | strings | Verdict |
|---|---|---|---|
| `surfaceflinger` | 100 | 518 | **heavily OEM-patched — un-scanned** |
| `libandroid_runtime.so` | 52 | 86 | **OEM-patched — un-scanned** |
| `libgui.so` | 52 | 68 | **OEM-patched — un-scanned** |
| `libbinder.so` | 0 | 0 | clean AOSP (BINDER_VM_SIZE is a compile constant, not a symbol) |
| `libcamera2ndk.so`, `libpowermanager.so`, `libsensorservice.so` | 0 | 0 | clean AOSP — no port |

### New Tier-1 gaps (🟢 OOS16 frameworks, SoC-independent — OOS-derived; dodge has NO donor patch, verified 2026-06-12)

| Repo slot | Capability | Purpose | OOS baseline | Port. | Prov. | Status |
|---|---|---|---|---|---|---|
| `frameworks/native` (libgui) | **EDR graphics ABI** — `SurfaceComposerClient::Transaction::{setEdrSdrRatio, setEdrViewTransform, setEdrGainmapInfo, setEdrAuxImage, setEdrMetadata, setEdrFlags, setEdrImageSize, setEDREffectFlag, setEDRMaxPotentialEDRValue}` + parcelables `OplusEdr{State,ViewTransform,Metadata}`/`OplusSkGainmapInfo`/`OplusBitmapInfo` + `oplus_layer_state_t` | **the native backing OplusEdrUtils calls** — drives panel HDR tonemap | OOS libgui exports them; AOSP/LOS does not | 🟢 | O | ✗ **missing — HIGH (real over-exposure depth)** |
| `frameworks/native` (SurfaceFlinger) | EDR consumer: `OplusRequestedLayerState::{setExtendedRangeBrightness, setDesiredHdrHeadroom, setEdrMetadata}`, `OplusDolbyVision::setEDRStatus`, gated by `ro.oplus.display.capture_skip_hdr_support` / `ro.oplus.force.brightness.composite` / `ro.oplus.uhdr.discard_wcg_info`, `OPLUS_CODE_SET_HDR_VISION_STATUS` (whitelist) | composes the EDR transform onto the panel | OOS SF | 🟢 | O | ✗ **missing** |
| `frameworks/native` (libgui) | **VRR / frame-stabilization** — `android::oplus::{getFrtcInfo, updateFrtcInfo, executeFrtcControl, isGppFrcEnable, updateGppFrcState, getOgfrInfo, getUpsInfo, isFrameStabilizationEnable, getStFrameRate}` + `Transaction::{setDisplayFrtc, setFrtcRequest}` + `FrtcRequest` | OnePlus frame-rate-timing-control / GPP-FRC frame pacing | OOS libgui | 🟢 | O | ✗ missing — **lead for freeze #1 (frame-1 stall), unproven** |
| `frameworks/base` (libandroid_runtime) | `IOplusSurfaceflingerEventListener` (Bn/Bp/onTransact) + JNI `register_android_os_{OplusManager,OplusAssertTip}` + `setOplusResampleTouch` | SF→app event callback channel | OOS | 🟢 | O | ✗ missing — possible EDR-state notify carrier |

### Consequence for the matrix

- **Over-exposure (doc-40 / Tier-1b `OplusEdrUtils`) is deeper than "stub no-op + display-HAL caps."**
  The Java boot-stub is **necessary but insufficient**: its `Transaction::setEdrViewTransform/
  setEdrGainmapInfo/setEdrMetadata` bind to **libgui native symbols that LOS's AOSP libgui lacks**.
  The AOSP-native `setExtendedRangeBrightness` ratio call lands, but the `OplusEdr*` view-transform
  that actually drives the SF tonemap doesn't exist to call — explaining why the matrix's
  "setExtendedRangeBrightness plumb" candidate (doc-40) was *unproven*. **Real fix = boot-stub
  (Tier-1b) + a `frameworks/native` libgui + SurfaceFlinger EDR patch.** **dodge does NOT donate this**
  (verified 2026-06-12): dodge's entire `frameworks/native` patch set is `0001-Increase-BINDER_VM_SIZE`
  — no libgui, no SF patch — so this EDR ABI is **OOS-derived (`O`)**, authored from the OOS symbol set,
  not lifted. dodge never solved over-exposure at the native layer either (it has only the same
  `frameworks/base` AHardwareBuffer bridge we already ship).
- VRR/FRTC + the SF event-listener are **leads to scan, not confirmed roots** — flagged so the
  freeze (#1) and EDR investigations stop treating libgui/SF as pure-AOSP black boxes.

Provenance `O` (corrected from `D?`): dodge's `frameworks/native` = `BINDER_VM_SIZE` only (verified
this session — `patches-crdroid/patch-dodge/frameworks,native/` holds a single patch). These four gaps
must be authored from the OOS `libgui`/`surfaceflinger`/`libandroid_runtime` ABI, not lifted from a donor —
a higher-effort class than the matrix's other 🟢 Tier-1 rows. This is the one OEM-framework area where
dodge is NOT a completeness oracle.

---

## References

- doc-38 — camera-module architecture v18 (clean-module deduction)
- doc-42 — retiring libapsfixup the OOS way (gralloc lock-math)
- doc-40 — preview freeze / over-exposure (OplusEdrUtils no-op)
- doc-19, doc-22 — spkal01/dodge shim + extras review
- dodge patch set: `patches-crdroid/patch-dodge/` (frameworks/av 0001, frameworks/native 0001, hardware/oplus 0001–0009)
