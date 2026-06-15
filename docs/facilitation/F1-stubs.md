<!-- STATUS: MIXED — inference-surgery applied 2026-06-14. conviction:SUPPORTED, oracle proof-of-form (doc-50 method).
     Verified body = directly measured/oracle-confirmed facts (class-set scan 189 classes, dex strings,
     placement-break FALSIFIED by host check, dodge proof-of-form class shapes confirmed, built-stub
     OplusEdrUtils real-Surface dex-confirmed, OCS SDK receiver dex-traced). All optimal-form verdicts,
     R3/R7 forward fix specifications, and root attributions for #3 moved to "Inferences & Open" below.
     Guard: a measured class-presence SITE is never a verified ROOT; placement-break FALSIFIED = host
     falsifier only, not a device runtime proof. -->
<!-- Parent: ../INDEX.md -->
<!-- F-plane (facilitation): requirements -> optimal-LOS-form. Re-scope of interop-tree/facilitation/E1-stubs.md. -->
<!-- Status model + two-axis header: ../interop-tree/SCHEMA.md. -->

---
node: F1
title: "stubs — the OEM Java framework surface the cam app + OCS SDK link against (optimal LOS form)"
plane: facilitation
partition: /system_ext
migrated_from: interop-tree/facilitation/E1-stubs.md
owns_requirements: [R7, R3-partial]
blob_identical_oos_los: n/a
characterization: CHARACTERIZED  # dodge-oracle-vs-dirty structural map complete (E1 §e: class-set + carrier-level line-by-line, 189 classes scanned)
conviction: SUPPORTED            # placement-break hypothesis FALSIFIED; no-op-stub + missing native-EDR-ABI root SUPPORTED; decisive EDR-invocation A/B (G6 DARK) deferred to eng build
verdict: "KEEP the system_ext <uses-library> stub model — placement does NOT break OplusCameraManager/OplusEdrUtils/CameraMetadataNativeWrapper resolution for the cam app (E1 falsified placement-break; both forms expose identical FQCNs to OplusCamera's classloader). Divergence is placement-SCOPE + the OplusEdrUtils no-op stub, NOT a missing-class break. R7 resolves under this form; R3's EDR precondition needs the stub to return REAL (not null), with the curve fix at F2."
confidence: medium
optimal_form_verdict:
  R7: "KEEP system_ext stub form (author-new, Treble-clean) — proven sufficient by dodge proof-of-form"
  R3-partial: "PATCH the stub to non-no-op (getBlastSurfaceControl -> REAL BLAST Surface); NECESSARY-BUT-INSUFFICIENT, curve depth at F2"
symptoms: [3]
probes: [r4-oem-transact, observe_getmetadata.js]
gaps: [G6]
dodge_ref: "dodge-camera-port/repos/android_hardware_oplus/oplus-fwk/ (Android.bp java_library installable:true + oplus-fwk.mk PRODUCT_BOOT_JARS; 142 *.java, BOOTCLASSPATH)"
dirty_ref: "vendor_oplus_camera/oplus-camera-stubs/ (Android.bp java_library system_ext_specific:true; 125 *.java -> 189 classes in classes.dex; /system_ext shared lib via <uses-library>)"
divergence: "differs in build MODEL (boot jar vs system_ext <uses-library> shared lib) + surface SCOPE; camera-critical subset RESOLVES on BOTH"
upstream: []
downstream: [C1, C3, F2]
refuted_refs: []
doc_refs: [doc-46, doc-48]
re_notes: [apsclient-onTransact-routing-RE.md, apsclient-bridge-RE.md, decmetarefzero-upcall-RE.md]
updated: 2026-06-13
---

# F1 — STUBS (facilitation root for the OEM Java surface)

**Two-axis status:** `characterization: CHARACTERIZED` · `conviction: SUPPORTED`.
Re-scope of E1 from **dodge-vs-dirty DIFF** to **requirements -> mechanism -> optimal-LOS-form**. The dodge
`oplus-fwk` boot jar is the **proof-of-form oracle**; our `oplus-camera-stubs` system_ext lib is the dirty
artifact. This node OWNS **R7** (motion-photo `CameraMetadataNativeWrapper` + front-cam config) and the
**R3 stub precondition** (OplusEdrUtils — the EDR curve depth itself is F2, native libgui/SF EDR ABI).

## Carried-forward verdict + evidence (from E1 — do not lose)

- **CONVICTED/FALSIFIED — placement-break hypothesis (E1 §c/§d):** boot-jar(dodge) vs system_ext-`<uses-library>`(ours)
  placement does **NOT** break `OplusCameraManager`/`OplusEdrUtils`/`CameraMetadataNativeWrapper` resolution.
  Host falsifier: `unzip -l oplus-camera-stubs.jar` + dex `strings` show all camera-critical FQCNs present
  (189 classes, camera subset intact). **Prediction "move stubs to a boot jar" is FALSIFIED.**
- **SUPPORTED — no-op-stub + missing-native-EDR root (E1 §f):** symptom #3 (~5x over-exposure) attaches here as a
  **near-ROOT carrier** — `OplusEdrUtils` is a behavioral no-op (`getBlastSurfaceControl()->null`, `setEdr*->false`)
  so no tonemap is ever applied. The *true* depth is the missing native `libgui`/SF EDR ABI (F2/doc-46 Tier-1b);
  the Java stub is **necessary-but-insufficient**. Decisive EDR-invocation A/B (gap **G6**) DARK — deferred to eng build.
- **SUPPORTED — carrier byte-equivalence (E1 §e, confirmed in oracle):** `OplusCameraManager` binder codes
  `10001–10022` (FIRST_CALL_TRANSACTION `10000`), descriptor `"android.hardware.camera"`, `KEY_OPLUS_PACKAGE =
  "com.oplus.is.sdk.camera.package"` are **byte-equivalent** dodge↔ours. Dirty diverges only by (1) adding
  `enforceCallingOrSelfPermission(PERMISSION_SAFE_CAMERA)` in `sendOplusExtCamCmd`, (2) extra `"OplusCameraManagerExt"`
  TAG logging in `getMetadataTag`/`metaDataValueConvert`. Per the trunk axiom, near-identical blobs are not the root.
- **Dodge proof-of-form facts (re-confirmed this pass):** `oplus-fwk/Android.bp` = `java_library{installable:true}`;
  `oplus-fwk.mk` = `PRODUCT_PACKAGES += oplus-fwk; PRODUCT_BOOT_JARS += oplus-fwk` (BOOTCLASSPATH, visible to all
  priv-apps). `OplusEdrUtils.java:48 getSurfaceControl->return null`, `:52 getBlastSurfaceControl->return null`,
  `:24 SIZE_DISPLAY_MAX=16`, `:25 SIZE_POSITION_MAX=2`, `:97 isUHDRSupport`. All 4 camera-critical FQCNs present in
  `oplus-fwk/src/`. Our dirty DROPS the two SIZE_* consts + the `isUHDRSupport()` (`persist.sys.feature.uhdr.support`)
  prop path; both sides are otherwise the same no-op stub.

## Requirements -> mechanism -> optimal-LOS-form

> For each OWNED row: (i) contract to satisfy · (ii) optimal LOS mechanism · (iii) dodge as proof-of-form ·
> (iv) LOS-confines weighting (Treble-clean / re-buildable / system_ext-vs-boot-jar / author-new-vs-adopt).

### R7 — motion-photo / SuperEIS metadata bridge MUST resolve for the OCS SDK  *(F1 OWNS; co-owned E2/F2 /system inner-fwk)*

- **(i) Contract.** `com.oplus.inner.hardware.camera2.impl.CameraMetadataNativeWrapper` must resolve at class-load
  off OplusCamera's classloader (carries `getMetadataPtr(Object)->long`, the native `camera_metadata*` bridge for the
  OnePlus APS native side). Plus the front-cam `photo` config it gates: `op_mode 0x8001` / 3-stream / `logicalCameraId 1,
  cameraId 1` (RAW10 3280×2464 + RAW10 6560×4928 + P010 1920×1440). **Unresolved ⇒ stable CNFE** at
  `ConsumerImpl.onSessionConfigured -> ApsProcessor.initAPS -> APSClient.algoInit(:1479) -> APSClient.transact`
  (1×/run, **6/6** on stock LOS-port) — the SDK consume-init break.
- **(ii) Optimal LOS mechanism.** **Author-new stub class** inside `oplus-camera-stubs` (system_ext `<uses-library>`).
  No framework patch, no boot jar, no config artifact, no sepolicy grant needed — pure Java-symbol resolution off the
  app classloader. The front-cam config is a session-params/control concern that lands downstream at **C1/C3**, not a
  stub-form concern; F1 only owes the *resolvable class*.
- **(iii) Dodge as proof-of-form.** **PROVED.** `oplus-fwk/src/com/oplus/inner/hardware/camera2/impl/CameraMetadataNativeWrapper.java`
  exists in a shipping reference and exports `getMetadataPtr(Object)`. The dodge form proves the class shape works;
  E1 confirmed it RESOLVES on BOTH the boot-jar and the `<uses-library>` models, so the cheaper system_ext form is sufficient.
- **(iv) LOS-confines weighting.** Treble-clean (system_ext, no boot-jar BOOTCLASSPATH pollution); re-buildable
  (`java_library` from source); **system_ext > boot-jar** (cam-app scope only — no system-wide priv-app visibility needed,
  unlike dodge's AIUnit-driven boot jar); **author-new** (adopt the dodge `getMetadataPtr` shape verbatim).
  **VERDICT: KEEP system_ext stub form. Author the class; it is proven sufficient.**

### R3-partial — OplusEdrUtils stub precondition (EDR/tonemap surface)  *(F1 OWNS the stub precondition; curve depth at F2)*

- **(i) Contract.** `com.oplus.view.OplusEdrUtils` must (a) resolve, and (b) its `getBlastSurfaceControl(SurfaceView)`
  must return a **REAL BLAST Surface** so the OEM EDR program can run. R3's full contract: the OEM libgui-WRITE +
  SF-READ EDR ABI (`Transaction::setEdrViewTransform` family, 4×4 `OplusEdrViewTransform` tonemap curve, struct 0x5C;
  consumed SF-side by `OplusRequestedLayerState::setEdrMetadata`). **Stock observes the OEM EDR program firing**
  (`trace_edr_invocation.log` after preview-reconfigure: `getBlastSurfaceControl->REAL BLAST Surface` ×3 — *the precondition
  the LOS stub breaks*; `setEdrViewTransform` ×1, `setEdrSdrRatio` ×2, `setEdrFlags=0x80101`, `setExtendedRangeBrightness` ×6).
  A landed std-ratio call alone is **insufficient by construction** (the falsifier). RE write `setEdrViewTransform` file
  `0x27fd48`; read `setEdrMetadata` file `0x30755c` (0x5C memcpy at node `+0x34`); ratio clamp `[1.0..5.0]`
  `GameEdr::setEDRStatus` file `0x2cc9b4`.
- **(ii) Optimal LOS mechanism.** **F1 share = framework/stub patch:** change `getBlastSurfaceControl` from the dodge/our
  no-op (`return null`) to return the **REAL** `SurfaceControl`/BLAST Surface of the `SurfaceView` (i.e. wire it to the
  AOSP `SurfaceView.getSurfaceControl()` path). Restore the dropped `SIZE_DISPLAY_MAX=16` / `SIZE_POSITION_MAX=2` consts
  for ABI parity. **F2 share = native libgui/SF EDR ABI:** the `setEdrViewTransform`/`setEdrMetadata` curve methods AOSP/LOS
  do NOT export — that is the over-exposure DEPTH, NOT a stub concern. The proximate display-HAL co-factor (HWComposer
  advertising HLG/PQ) sits at **D4**.
- **(iii) Dodge as proof-of-form.** **PARTIAL — proves the SHAPE, not a working impl.** The dodge `oplus-fwk` ships
  `OplusEdrUtils` with the right method signatures + the SIZE_* consts, but its `getBlastSurfaceControl` is **also a no-op
  `return null`** (file lines 52–53). So the dodge oracle proves the *class/ABI form exists*, but does **NOT** prove the
  stub-returns-real form — the dodge boot jar relies on its own native EDR ABI that we still lack. Proof-of-form result:
  **form exists, working-impl NOT proven by dodge** (must be authored + paired with F2).
- **(iv) LOS-confines weighting.** Treble-clean (system_ext stub, no boot jar); re-buildable; **system_ext** placement
  retained; **patch-existing** (not author-new — the class already ships, only the no-op body changes). Note: F1's stub
  fix is **necessary-but-insufficient** — shipping a real-returning `getBlastSurfaceControl` without F2's native curve ABI
  still drops the tonemap. **VERDICT: PATCH the stub to return REAL; pair with F2. R3 stays SUPPORTED, conviction
  deferred to the EDR-invocation A/B (G6, eng build).**

## Determinations baked in (authoritative — OOS baseline + RE)

1. **KEEP the system_ext stub model.** Placement does NOT break resolution. E1 falsified the placement-break hypothesis;
   `<uses-library oplus.camera.stubs>` (manifest fixup in op15 `apk6106/dec/AndroidManifest.xml` via `extract-files.py`;
   privapp grant in `configs/permissions/privapp-permissions-oplus.xml`) is **functionally sufficient** for the cam app.
   Do **not** re-home the stubs to a boot jar — dodge's boot jar is "more correct" only for system-wide priv-app visibility
   (AIUnit etc.), which OplusCamera does not require.
2. **OplusEdrUtils no-op stub is NECESSARY-BUT-INSUFFICIENT for #3.** EDR is OBSERVED firing on stock
   (`getBlastSurfaceControl -> REAL BLAST Surface`), so the stub **must return real**, not null — but the curve fix lives
   in **F2** (native libgui/SF EDR ABI). F1 supplies the resolvable Java symbol + the real-Surface precondition; F2 supplies
   the missing native ABI depth.
3. **R7: CameraMetadataNativeWrapper must resolve for the OCS SDK.** Stock-port shows a **stable CNFE at
   `APSClient.algoInit`** (→`transact`) when the class is unresolved (6/6). Authoring the class under the system_ext stub
   (dodge `getMetadataPtr` shape) is the fix; proven sufficient by the dodge proof-of-form.

## D1 — OCS consume-path stub surface + must-resolve class list (jadx characterization, the diff checkpoints)

> **Phase-D add.** E1 characterized the stub jar **as a class set** (189 classes, dodge-vs-dirty). D1 re-frames
> it as the **OCS-SDK consume path**: what `APSClient`/`ApsUtils`/`OplusEdrUtils` actually **resolve at runtime**
> vs what the **built** `oplus-camera-stubs.jar` **provides** — the diff checkpoint being a **stable CNFE** if a
> must-resolve class is absent. Tool: jadx-mcp + jadx CLI. Artifacts: OCS SDK
> `com.oplus.camera.unit.sdk.jar` (the consumer, 843 classes) · built stub
> `out/target/product/infiniti/system_ext/framework/oplus-camera-stubs.jar` (the provider).

### Provider split (the load-bearing distinction E1 blurred)

The runtime Java surface the cam app + OCS SDK link against is split across **two** system_ext framework jars,
both app-classloader-visible via `<uses-library>` — they are **not** the same artifact:

| jar | role | provides (camera-critical) |
|---|---|---|
| **`oplus-camera-stubs.jar`** (the F1 "stub" lib) | thin OEM-framework wrappers | `OplusEdrUtils` (+`$OplusEdrParameters`,`$OplusSkGainmapInfo`), `OplusCameraManager`/`IOplusCameraManager`/`$OplusCameraManagerGlobal`, `com.oplus.inner.hardware.camera2.impl.CameraMetadataNativeWrapper`, `com.oplus.wrapper.hardware.camera2.CaptureResult`, `com.oplus.wrapper.hardware.camera2.impl.CameraMetadataNative`, `OplusBuild` (SDK_VERSION=37), the `com.oplus.wrapper.*` + `com.oplus.inner.*` family |
| **`com.oplus.camera.unit.sdk.jar`** (the OCS SDK proper, **prebuilt**, NOT the stub) | the APS consumer | `apsAdapter.APSClient` (+`$MetaImageRefCounter`, the R1 receiver), `APSClientCallback`, `APSClientKeyBase`, `adapter.ApsUtils` (R7 `getMetadataPtrForJni`) |

**The R1 receiver is NOT in the stub jar — it is in the OCS SDK jar.** `apsclient-onTransact-routing-RE.md`
confirms the entire R1 receiver (class + static `onTransact` + action-2 switch + the three keys + the
`MetaImageRefCounter` int[6] decref leaf + WeakReference registration) ships **complete in the prebuilt
`com.oplus.camera.unit.sdk.jar`** the port already installs. So F1's stub lib owes the R1 receiver **nothing**;
it owes only the OEM-framework classes the OCS SDK *resolves through* (R7's `CameraMetadataNative*`, R3's
`OplusEdrUtils`). This **revises the I3/R1 framing** in BUILD-ORDER: the "R1 receiver class location" interlock
is satisfied by the OCS SDK jar, not by an authored `frameworks/base` receiver.

### R7 consume path (CORRECTED — the real resolution chain)

`ApsUtils.getMetadataPtrForJni(Object)` (the R7 site reached at `APSClient.algoInit→transact`) is **gated**:
```
if (Build.VERSION.SDK_INT>=33 && OplusBuild.VERSION.SDK_VERSION>=34) {     // ← stub provides SDK_VERSION=37 ⇒ TRUE
   if (obj instanceof CaptureResult)         → new com.oplus.wrapper.hardware.camera2.CaptureResult(obj)
                                                 .getNativeMetadata().getMetadataPtr();        // ★ R7 primary path
   if (obj instanceof CameraCharacteristics) → Class.forName("com.oplus.wrapper.hardware.camera2.CameraCharacteristics")
                                                 .getMethod("getNativeMetadata")…getMetadataPtr();
}
// fallback (only if gate false OR wrapper path returns/throws):
getCameraMetadataNativeObj(obj)  → reflect AOSP private fields: "mProperties"/"mResults"/"mMetadataPtr"
```
**Correction to REQUIREMENTS R7 / E1:** the live R7 path is **`com.oplus.wrapper.hardware.camera2.*`**, NOT
`com.oplus.inner.hardware.camera2.impl.CameraMetadataNativeWrapper`. The `inner.*` `CameraMetadataNativeWrapper`
(dodge `getMetadataPtr(Object)` shape) **is also shipped** by the built stub and remains a valid carrier, but it
is the *legacy* shape — `getMetadataPtrForJni` on this SDK build takes the `com.oplus.wrapper.*` branch because
`OplusBuild.SDK_VERSION=37 ≥ 34`. **Both forms are present in the current built stub**, so R7 resolves either way.

### The F1 MUST-RESOLVE class list (diff checkpoint = stable CNFE if absent)

What the OCS consume path resolves at runtime that the **stub** lib must provide. Verified PRESENT in the
**built** `oplus-camera-stubs.jar` (the diff checkpoint passes today):

| must-resolve FQCN | resolved by (consume site) | required member | in built stub? | absent ⇒ |
|---|---|---|---|---|
| `com.oplus.wrapper.hardware.camera2.CaptureResult` | `ApsUtils.getMetadataPtrForJni` (R7 primary) | `CaptureResult(android…CaptureResult)`, `getNativeMetadata()` | **YES** | CNFE at `algoInit→transact` (R7 break, 6/6) |
| `com.oplus.wrapper.hardware.camera2.impl.CameraMetadataNative` | same (return of `getNativeMetadata`) | `getMetadataPtr()` | **YES** | NoSuchMethod / CNFE at R7 |
| `com.oplus.inner.hardware.camera2.impl.CameraMetadataNativeWrapper` | legacy R7 carrier (`getMetadataPtr(Object)`) | `static getMetadataPtr(Object)` | **YES** | CNFE on legacy SDK builds |
| `com.oplus.os.OplusBuild` (+`$VERSION`) | the R7 SDK gate | `VERSION.SDK_VERSION` (=37) | **YES** | gate throws ⇒ R7 falls to reflection fallback |
| `com.oplus.view.OplusEdrUtils` | R3 EDR precondition | `getBlastSurfaceControl(SurfaceView)` | **YES** | CNFE / no EDR program (#3) |
| `android.hardware.camera2.OplusCameraManager` (+`IOplusCameraManager`,`$OplusCameraManagerGlobal`) | OEM 100xx binder Java side (C3-adjacent) | binder codes `10001–10022`, descriptor `"android.hardware.camera"` | **YES** | OEM cam-manager Java break |

> **Diff-checkpoint framing.** The OOS value each row diffs against is **"class resolves off the app classloader
> + the named member exists"** — measured by `unzip -l oplus-camera-stubs.jar`/dex `strings` (host) and
> frida-assert **no CNFE at `APSClient.algoInit`** (device). On the **current built stub the checkpoint PASSES
> for every row** — the R7 surface is complete. The historical 6/6 CNFE (REQUIREMENTS R7) was against an **older
> stub** missing the `com.oplus.wrapper.hardware.camera2.*` classes; the current build closes it.

### R3 stub state — CORRECTED: the built stub already returns REAL

The F1 R3 verdict ("PATCH `getBlastSurfaceControl`→REAL") is **already applied in the built stub**:
```
built oplus-camera-stubs.jar  OplusEdrUtils.getBlastSurfaceControl(SurfaceView sv):
    if (sv==null) return null;  return sv.getSurfaceControl();      // ← REAL BLAST Surface (NOT no-op null)
  …getSurfaceControl(View v): if (v instanceof SurfaceView) return ((SurfaceView)v).getSurfaceControl(); return null;
```
The **source checkout** `~/vendor_oplus_camera/oplus-camera-stubs/src/.../OplusEdrUtils.java` still shows the
no-op (`return null`) — the built jar is **ahead** of that source tree (the R3 stub patch landed at build time).
So F1's R3 share (the real-Surface precondition, interlock I5) is **satisfied in the image**; R3 now depends
**solely on F2's native libgui/SF EDR curve ABI** (the std-ratio-alone falsifier). The dropped `SIZE_DISPLAY_MAX`
/`SIZE_POSITION_MAX` ABI-parity consts remain the only F1 R3 residual to re-confirm.

### D1 verdict deltas (fold into INDEX)
- **R7 → resolves under the current built form** (was "author-new, 6/6 CNFE"). The wrapper camera2 classes +
  `CameraMetadataNativeWrapper` are **all present in the built stub**; the CNFE was an older-stub artifact. Verdict
  moves **author-new → KEEP (already provided)**; the checkpoint is a regression guard, not an open author task.
- **R1 → the Java receiver is in the OCS SDK jar, not the stub and not `frameworks/base`** (D1 provider split +
  `apsclient-onTransact-routing-RE.md`). F1/F2 owe **no authored Java receiver**; the open R1 gap is the **native
  producer firing** the action-2 upcall on LOS (`decmetarefzero-upcall-RE.md`), not a missing class.
- **R3 → F1's real-Surface precondition is already in the built stub**; R3's residual is F2-only (the curve ABI).

## Cross-links

- **R1 dex routing (the OCS receiver body):** `../re-notes/apsclient-onTransact-routing-RE.md` (D1) · native bridge `../re-notes/apsclient-bridge-RE.md` · producer `../re-notes/decmetarefzero-upcall-RE.md`
- **F2** (native libgui/SF OEM-EDR ABI) — owns the R3 curve DEPTH; F1 owes only the resolvable stub + real-Surface precondition.
- **C1** (OCS SDK `getInstance()`/`algoInit`) — proximate manifestation site of an F1 stub-resolution failure (falsified here).
- **C3** (binder live-channel) — receives the 22 OEM `100xx` codes that leave `OplusCameraManagerGlobal.transact()`.
- **D4** (display-HAL HWComposer HLG/PQ) — proximate #3 co-factor, downstream of the EDR program.
- Source node: `../interop-tree/facilitation/E1-stubs.md`; oracle ledger: `../interop-tree/facilitation/DODGE-VS-DIRTY.md`.

---

## Inferences & Open (UNVERIFIED — heavy-check)

> Per the interop-tree trunk axiom, a measured class-presence or dex routing fact is a SITE, never a verified
> ROOT. The items below are mechanism attributions, optimal-form verdicts, and forward fix specifications —
> NOT verified until an OOS↔LOS A/B or device runtime test confirms each claim.

### R7 optimal form and CNFE closure (INFERRED)

- **VERIFIED:** All R7 must-resolve FQCNs present in built stub (class-set scan, dex strings). The historical
  6/6 CNFE is attributed to an older stub jar — this attribution is consistent with the evidence but has not
  been confirmed by re-running the CNFE test against the old vs. new jar in a controlled comparison.
- **INFERRED:** "KEEP system_ext form — author the `CameraMetadataNativeWrapper` class body (proven sufficient
  by dodge)." That the current built stub fully closes the CNFE at `APSClient.algoInit` at runtime (no
  residual CNFE) is inferred from class presence. Device runtime confirmation (frida assert no CNFE) is the
  outstanding conviction item. The "system_ext > boot-jar" placement weighting is a design judgment.

### R3-partial — no-op stub root attribution and fix scope (INFERRED / partially superseded)

- **VERIFIED:** Built stub `getBlastSurfaceControl` returns REAL Surface (dex-confirmed). This fact supersedes
  the "PATCH the stub" recommendation — the patch is already applied in the image.
- **INFERRED:** "F1's R3 share (real-Surface precondition, interlock I5) is satisfied in the image; R3 now
  depends solely on F2's native libgui/SF EDR curve ABI." This consequential claim is inferred from the
  dex-inspection; whether the stub's real-Surface return is sufficient for the full EDR precondition on a
  running device is not device-confirmed.
- **OPEN (E0-EDR-HARVEST conflict):** E0-EDR-HARVEST found `setEdrViewTransform` fired 0× in stock preview —
  the preview EDR contract is driven by `setEdrFlags(0x80101)` + adaptive `setEdrSdrRatio`, not the 4×4 curve.
  The F2 "author both ABI sides" blueprint may therefore be over-scoped. The R3 residual mechanism (whether
  scalar-ratio alone suffices vs. the curve ABI is needed) is OPEN and not yet resolved by any measured fact.

### R1 receiver — provider split consequence (VERIFIED routing, INFERRED fix scope)

- **VERIFIED:** The R1 receiver (`APSClientCallback.onTransact`, action-2, `MetaImageRefCounter`) ships in
  the prebuilt `com.oplus.camera.unit.sdk.jar`, not in the stub and not in `frameworks/base`. This is a
  dex-traced routing fact.
- **INFERRED:** "F1 stub lib owes the R1 receiver nothing; only the OEM-framework classes the OCS SDK resolves
  through." This scope boundary is a design inference from the provider split. The I3 interlock revision
  ("R1 receiver class location satisfied by OCS SDK jar") follows logically but has not been confirmed by a
  running LOS build where the upcall actually fires.

### Placement-break falsification (SUPPORTED, one residual)

- **SUPPORTED (host falsifier):** `unzip -l oplus-camera-stubs.jar` + dex strings show all camera-critical
  FQCNs present. The placement-break prediction is falsified at the host level.
- **RESIDUAL (device-unconfirmed):** That the system_ext `<uses-library>` form resolves identically to the
  boot-jar form at device runtime (no `ClassNotFoundException` in any path the cam app takes) is inferred.
  The decisive EDR-invocation A/B (G6, gap) is DARK — deferred to eng build.
