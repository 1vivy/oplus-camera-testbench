<!-- STATUS: MIXED — inference-surgery applied 2026-06-14. Verified body = directly observed facts from the
     OCS-SDK consume-path jadx walk (dex routing trace, class-presence checks, built-jar inspection).
     All forward fix reframings, "net gap" attribution claims, and symptom-root reassignments moved to
     "Inferences & Open" below. Guard: a measured class-presence or dex-routing fact is never a proven
     fix; "the gap is X" claims are INFERRED from the routing trace, not confirmed by a running LOS A/B. -->

# Phase-D corrections to the LOS implementation plan (2026-06-14)

The OCS-SDK consume-path jadx walk (Part D) corrected several IMPLEMENTATION-PLAN.md assumptions. The built
form already provides more than the stale source checkout implied. Net: the real remaining LOS gaps NARROW.

## R1 — REFRAME: the receiver already ships; the gap is the NATIVE PRODUCER firing (not authoring Java)
`docs/re-notes/apsclient-onTransact-routing-RE.md` traced action-2 byte-exact in the **prebuilt
`com.oplus.camera.unit.sdk.jar` the port already installs**:
- native `onTransact(weakRef, 2, in, out)` → `APSClient.onTransact` (delegate) → `APSClientCallback.onTransact`
  `switch(2){processMetadataRef}` → `setMetaImageRefCounter` → **`MetaImageRefCounter.setMetaImageRef(Object,String,boolean)`**
  (the `int[6]` decrement + `image.close()` at all-zero).
- **Correction:** action-2 routes to `setMetaImageRef`, NOT `decMetaRefZeroToRemove(JII)V` (that is a separate
  video/flush sweep). HashMap keys (exact): `_IMAGE_OBJECT_`, `pipelineName_STRING_BASIC_`, `isInc_BOOLEAN_BASIC_`;
  pipeline tokens `pipeline_preview/default`(0) `pipeline_video`(1) `pipeline_asd`(2) app(4);
  `metaBufferMap = LinkedHashMap<Image,int[6]>`.
- **∴ R1 LOS fix = make the NATIVE producer fire the upcall on LOS** — `libAPSClient-cmd-jni.so`'s
  `setRequestActionCallback` registration + the per-frame `gCallbackRequestAction(JNIAction=2, isInc=false)` call.
  **No authored frameworks/base Java receiver is needed** (it ships). The LOS A/B (upcall present on stock,
  absent on the freeze) convicts whether the native registration/call, or a downstream Java condition, is the break.
- This still fixes #1 freeze + #4 UAF + retires libapsfixup Family-II — but it is a NATIVE-side fix, likely simpler
  than the prior "author the receiver" framing.

## R7 — already resolves in the BUILT stub (was stale-source CNFE)
The live path is `com.oplus.wrapper.hardware.camera2.*` (gated `OplusBuild.SDK_VERSION≥34` = TRUE), not the
`inner.*` wrapper — **both ship** in the current `oplus-camera-stubs`. Must-resolve list (all verified PRESENT):
`CaptureResult(+getNativeMetadata)`, `CameraMetadataNative(+getMetadataPtr)`, `CameraMetadataNativeWrapper`,
`OplusBuild(SDK_VERSION=37)`, `OplusEdrUtils`, `OplusCameraManager/IOplusCameraManager`. **R7 verdict: already-provided**
(the historical 6/6 CNFE was an older stub jar). Diff checkpoint = these classes resolve (no CNFE).

## R3 — F1 precondition already satisfied in the image; residual is F2-only
The built stub's `OplusEdrUtils.getBlastSurfaceControl` **already returns a REAL Surface** (`sv.getSurfaceControl()`);
the no-op `return null` survives only in the stale source checkout. So interlock **I5** (stub returns real) is met in
the image. **R3's remaining gap is purely F2** — the libgui `setEdrViewTransform` 4×4 curve WRITE + SF READ ABI.

## R5/R6 — session-typing config is DEVICE-NATIVE (adopt-from-dump, present); residual = runtime publish A/B
Carrier = `odm/etc/camera/CameraHWConfiguration.config` — **device-native infiniti** (611 `Mode[]` rows,
`infinitimain/tele/ultrawide`), so **adopt-from-dump, NOT from dodge** (dodge=572 rows/`dodgemain` proves only the form).
Checkpoint = `[OverrideOemSHDRTypeMatching]` `0x8001 0x0200/0x0800` SHDR rows + the DCG captureMode map present →
`hdr_detected` published in-scene. **Present in image; residual = the runtime G3 publish A/B (R5) + the high-DR-scene
TurboHDR capture (R6).** R6 namespace `same_process_hal_file` label already at dodge parity.

## Net — the REAL remaining LOS gaps (post-D)
1. **R2** — apply av/0001 + `d654641` reversal (the top single action; still the gap). READY (los-impl/R2-apply-manifest.md).
2. **R1** — make the native producer fire the upcall on LOS (NOT Java authoring). Convict via the LOS A/B.
3. **R3** — F2: port the libgui+SF OEM-EDR curve ABI.
4. **R4** — F2: author the 6 Depth-2 hook bodies (gated behind R2).
5. **R6** — runtime publish confirm (needs a high-DR scene capture, then retire Family-III).
Everything else (R5 config, R7 stub, R3 stub-precondition, base/0001, the props/permissions/namespace) is
**already present in the built image** — the LOS B-side test just diffs to confirm.

---

## Inferences & Open (UNVERIFIED — heavy-check)

> Per the interop-tree trunk axiom, a dex routing trace or class-presence measurement is a SITE, never a
> verified ROOT or fix. The corrections below are re-framings and gap attributions derived from the jadx walk;
> they are forward-spec plan items until an OOS↔LOS A/B confirms each break and each fix.

### R1 reframe — native producer gap (INFERRED from dex routing)

- **VERIFIED (dex routing):** action-2 routes to `setMetaImageRef` (not `decMetaRefZeroToRemove(JII)V`) via
  `APSClientCallback.onTransact switch(2){processMetadataRef}` → `MetaImageRefCounter.setMetaImageRef`. The
  full receiver chain is present in the prebuilt `com.oplus.camera.unit.sdk.jar`. These routing facts are
  dex-traced and measured.
- **INFERRED:** "Therefore the R1 LOS gap = making the NATIVE producer (`libAPSClient-cmd-jni.so`
  `setRequestActionCallback`) fire the upcall on LOS." That the native producer is absent/unregistered on LOS
  (vs. another break in the routing chain, or a downstream Java condition) is inferred from the model; the LOS
  A/B (upcall absent on the freeze → `metaBufferMap` climbs to 20-deep cap) has not been run.
- **INFERRED:** "This is a NATIVE-side fix, likely simpler than the prior 'author the receiver' framing." The
  simplicity claim is a design judgment from the routing trace, not a confirmed fix scope.

### R7 reframe — already resolves in built stub (VERIFIED for class presence, INFERRED for CNFE closure)

- **VERIFIED (artifact inspection):** All must-resolve classes (`com.oplus.wrapper.hardware.camera2.CaptureResult`,
  `CameraMetadataNative`, `CameraMetadataNativeWrapper`, `OplusBuild SDK_VERSION=37`, `OplusEdrUtils`,
  `OplusCameraManager`) are PRESENT in the built `oplus-camera-stubs.jar`. Class-presence is a measured fact.
- **INFERRED:** "Therefore R7 is already-provided; the historical 6/6 CNFE was an older stub jar." That the
  current built stub fully resolves all R7 consumer paths at runtime (no residual CNFE at `algoInit`) is
  inferred from class presence; device runtime confirmation (frida assert no CNFE) has not been run.

### R3 reframe — F1 precondition in image, residual F2-only (VERIFIED + INFERRED)

- **VERIFIED (built-jar inspection):** The built `OplusEdrUtils.getBlastSurfaceControl` returns
  `sv.getSurfaceControl()` (not null). This is a dex-level measured fact.
- **INFERRED:** "Therefore interlock I5 is met; R3's remaining gap is purely F2 (the libgui+SF EDR curve ABI)."
  That the real-Surface precondition alone is sufficient for the EDR program precondition to be satisfied, and
  that no other F1 issue contributes to #3, is inferred. Additionally, the F2 residual scope (whether the
  4×4 curve or the scalar ratio + flags form is needed) remains an open question per E0-EDR-HARVEST.

### R5/R6 reframe — session-typing present, residual = runtime publish A/B (VERIFIED + INFERRED)

- **VERIFIED (host artifact):** `[OverrideOemSHDRTypeMatching]` block + 611 Mode rows installed in the port
  image. `same_process_hal_file` label at dodge parity. These are measured artifact-presence facts.
- **INFERRED:** "Present in image → residual = only the runtime G3 publish A/B." That the carrier being
  present in the image is sufficient to arm the AEC in-scene branch and produce the R5 publish is the
  hypothesis; it is not confirmed. The "everything else already present" claim in the net-gaps summary applies
  this same inference to all config/namespace artifacts — each still requires a device runtime diff to confirm.
