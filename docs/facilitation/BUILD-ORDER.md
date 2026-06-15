<!-- STATUS: PLAN/INFERRED — this document is the build-time and runtime contract specification across F-nodes.
     All dependency edges, interlock invariants, failure-mode predictions, and re-derive procedures are forward
     plan and design specification. No edge or interlock has been verified by a complete build+flash+runtime
     test of the full F1–F4 facilitation set. Individual measured facts (symbol scans, sha256, grep counts)
     are cited in the per-F-node VERIFIED sections; the contract itself is INFERRED. -->
<!-- Parent: ./INDEX.md -->
<!-- Siblings: ./F1-stubs.md ./F2-system-framework.md ./F3-toggles-config.md ./F4-sepolicy-namespace.md ./DODGE-ORACLE.md -->
<!-- The E-nodes carried per-artifact diffs but NO cross-node build/runtime contract. This doc is that contract. -->

---
title: "BUILD-ORDER — the build-time + runtime CONTRACT across F-nodes (the E-nodes lacked this)"
plane: facilitation
date: 2026-06-14
scope: "(a) build dependency order across F1–F4; (b) runtime interlock checks (does the dlopen target match the export surface; does the upcall receiver match the native callback signature); (c) the upgrade / re-derive path when dodge or OOS evolves."
note: "DESIGN/SPEC ONLY. No edits to any external LOS tree (~/vendor_oplus_camera, ~/android/lineage, op15-camera-porting); this lives entirely under /home/vivy/oplus-final/docs/facilitation/."
---

# BUILD-ORDER — the build-time + runtime contract the E-nodes lacked

The E-plane answered *"where does our blob diverge from dodge?"* per artifact, but never said **how the artifacts
land together** — what must build before what, what must match what at runtime, and how to re-derive cleanly when
the reference moves. This doc is that cross-node contract. It is the dependency spine `./INDEX.md`'s work-order
rests on.

---

## (a) Build dependency order

> **Reading.** `A ⟶ B` = A must be built/landed before B compiles or is meaningful. Edges are **compile-time
> symbol/visibility** dependencies (hard) or **install-ordering** dependencies (soft). The graph is rooted at F1
> (the Java surface everything links against) and F4 (the namespace/label that makes the blobs loadable).

```
                F4 sepolicy + public.libraries (namespace/labels)
                  │  (makes libcsextimpl / libapsfixup / ArcSoft+QNN loadable;
                  │   independent of compile — must be IN THE IMAGE before runtime)
                  ▼
F1 stubs ──────▶ F2 frameworks patches ──────▶ C3 (cameraserver runtime)
(system_ext      (av/0001 + base/0001 +          (OEM 100xx binder live channel)
 java_library,    native/0001 + author-new
 BOOTCLASSPATH    Depth-1/2 + R1 receiver
 visibility)      + R3 EDR ABI)
   │                  │
   │                  ├──▶ F2 av/0001 (Depth-1) GATES R4 (Depth-2 hooks) GATES C3 8K path
   │                  └──▶ F2 R1 receiver pairs with F1 OCS-SDK Java release path
   ▼
F3 config (props + odm session-typing) ──────▶ C4/C5 (HDR publish R5/R6)
(no compile dep; PRODUCT_COPY_FILES + props;
 must be in the image; arms the OEM HDR path
 F1's <uses-library> dep)
```

### The hard build edges (with the question each answers)

1. **F1 stub jar/lib ⟶ F2 frameworks patches.** *Does the F1 stub need to land before F2 compiles?*
   **Partly.** F2's **native** patches (av/base/native `.cpp`) do **not** link the Java stubs — they compile
   independently against `frameworks/{av,base,native}` source. **But** F2's **R1 release receiver** is a Java
   path in `frameworks/base` that resolves the OCS-SDK class
   `APSClient$MetaImageRefCounter.decMetaRefZeroToRemove(JII)V` — that class lives in the **F1 surface**
   (`oplus-camera-stubs` / the OCS SDK it links). So: **native F2 ⟂ F1** (parallel-buildable); **R1 receiver
   wiring ⟶ requires the F1/OCS-SDK Java symbol to exist** (build the stub surface first, then wire the receiver
   against it). Order: **F1 system_ext lib → then F2 R1 receiver**.

2. **F2 av/0001 (Depth-1) ⟶ R4 Depth-2 hooks ⟶ C3 8K path.** *Does F2 av/0001 gate C3?*
   **Yes, transitively.** av/0001 installs the **Depth-1** `CameraService::onTransact` → `CameraServiceExtFactory`
   dlopen-bridge. The **Depth-2** hooks (`beforeConfigureStreamsLocked`, `getExtensionOperatingMode`, R4) are
   **internal call sites inside `CameraServiceExtImpl`** — they have no reach until the Depth-1 receiver exists.
   And **C3's live 100xx channel** (the OEM binder codes) does not service anything until av/0001 + the re-added
   `libcsextimpl.so` are in the image. So: **av/0001 + reverse `d654641` → R4 author-new hooks → C3 8K
   configure_streams binds.** R4 is **gated behind R2**; do not author the Depth-2 hooks before the Depth-1
   receiver compiles.

3. **F2 av/0001 ⟶ F4 must re-add + label `libcsextimpl.so`.** *Does the dlopen target exist + is it labeled?*
   av/0001's `dlopen("system_ext/lib64/libcsextimpl.so")` is dead unless **(i)** `d654641` is reversed (the blob
   is back in the build) and **(ii)** F4 labels its path for the loading domain. Two repos, one runtime fact —
   see the interlock in (b).

4. **F4 public.libraries / labels ⟶ runtime loadability (no compile edge, hard install edge).** The
   `public.libraries.txt` 12-lib patch and the `same_process_hal_file` labels do not gate compilation, but the
   **image must contain them before any runtime check passes** (`libapsfixup` dlopen-by-leaf, ArcSoft/QNN
   app-direct dlopen, the `vndksupport … sphal … not found` failure). Treat F4 as a **build-the-image-first**
   prerequisite for every runtime interlock in (b).

5. **F3 config ⟶ C4/C5 HDR publish (no compile edge, soft install edge).** F3 is PRODUCT_COPY_FILES + props +
   the odm CamX session-typing carrier. No compile dependency; it must be **in the image** to arm the OEM HDR
   feature path R5/R6 ride. F3 also carries F1's `<uses-library oplus.camera.stubs>` privapp dependency
   (`privapp-permissions-oplus.xml`) — so **F1 surface name ⟶ F3 privapp grant** (the grant references the lib by
   name; keep them in sync).

### Parallelizable lanes (no edge between them)

- **F1 system_ext lib** ∥ **F2 native av/base/native patches** ∥ **F4 sepolicy/public.libraries** — three
  independent compile lanes; build concurrently.
- **F3 config artifacts** have no compile dependency on anything; stage them anytime, require them in the image.

---

## (b) Runtime interlock checks

> Each interlock is a **match invariant** between two artifacts that compile separately but must agree at runtime.
> A green build with a broken interlock = `UNKNOWN_TRANSACTION −38`, a CNFE, a silent dropped upcall, or a
> `dlopen not found`. **Verify each by symbol scan / frida before claiming a fix works.**

### I1 — F2 CameraService dlopen target ⟷ libcsextimpl export surface (R2)
- **Invariant.** av/0001's `dlsym` targets must match `libcsextimpl.so`'s exported symbols **exactly**:
  `getExtFactoryImpl` (triple-deref to the factory) and the mangled
  `_ZN7android20CameraServiceExtImpl10onTransactEjRKNS_6ParcelEPS1_j`.
- **Failure mode.** Mangling/ABI drift between the patched `frameworks/av` and the prebuilt blob ⇒ `dlsym`
  returns NULL ⇒ the factory short-circuit never engages ⇒ every 100xx → `UNKNOWN_TRANSACTION −38`
  (`onTransact` file `0x16f6f0`, `default:−38`).
- **Check.** After build: `strings`/`nm -DC` the built `cameraserver` must carry `CameraServiceExt*` (currently
  **0** — the CONVICTED-NOT-APPLIED state); `nm -DC libcsextimpl.so` must export both symbols; the blob must show
  4 `/proc/maps` mappings under `cameraserver` (OOS had 4, LOS had 0).

### I2 — F2 R1 release-upcall receiver ⟷ native `callbackToCamUnit` signature (R1)
- **Invariant.** The native upcall `ApsCallbackMetaRefInc::callbackToCamUnit` →
  `gCallbackRequestAction(JNIAction=2, isInc=false)` must land at the Java receiver
  `APSClient$MetaImageRefCounter.decMetaRefZeroToRemove(JII)V` — **descriptor `(JII)V` must match** (the native
  side passes a `jlong` handle + two `jint`s; a receiver with the wrong arity/signature is never invoked).
- **Failure mode.** Signature mismatch (or a missing receiver) ⇒ the per-frame decref never fires ⇒
  `metaBufferMap` climbs to the 20-deep cap ⇒ `previewManagerRoutine` parks (**#1 freeze**) ⇒ Family-II guard
  silently masks the resulting UAF (**#4**).
- **Check.** frida-trace the bridge `gCallbackRequestAction` (file `0x9b7548`) and assert the Java
  `decMetaRefZeroToRemove` enter fires **~7–9/s** in-preview (stock cadence). The LOS A/B (upcall absent on the
  freeze) is the conviction; deferred to eng build per POST-PROCESSING-CONTRACT §"Open/next".

### I3 — F1 OCS-SDK release Java path ⟷ F2 receiver class location
- **Invariant.** R1's receiver wires the **OCS-SDK** class `APSClient$MetaImageRefCounter` — that class ships in
  the **F1 surface** (`oplus-camera-stubs` / OCS SDK), not in `frameworks/base`. F2 authors the *bridge* into it;
  F1 supplies the *class*. The classloader that resolves `APSClient$MetaImageRefCounter` at runtime must be the
  app's (system_ext `<uses-library>`), and F2's JNI registration must target the same loaded class.
- **Failure mode.** If F2's receiver assumes a `frameworks/base` (BOOTCLASSPATH) location while F1 ships it
  system_ext, the JNI `FindClass` resolves against the wrong loader ⇒ `NoClassDefFoundError` at upcall time.
- **Check.** Confirm the receiver resolves the class off the **app** classloader (the same one that already
  resolves `CameraMetadataNativeWrapper` for R7), not the boot classloader.

### I4 — F1 CameraMetadataNativeWrapper export ⟷ OCS SDK `algoInit` consumer (R7)
- **Invariant.** `com.oplus.inner.hardware.camera2.impl.CameraMetadataNativeWrapper.getMetadataPtr(Object)->long`
  must resolve off OplusCamera's classloader, carrying the native `camera_metadata*` bridge shape.
- **Failure mode.** Unresolved ⇒ stable CNFE at
  `ConsumerImpl.onSessionConfigured → ApsProcessor.initAPS → APSClient.algoInit(:1479) → APSClient.transact`
  (6/6 on LOS-port).
- **Check.** `unzip -l oplus-camera-stubs.jar` + dex `strings` must show the FQCN; frida-assert no CNFE at
  `algoInit`.

### I5 — F1 `getBlastSurfaceControl` real-Surface ⟷ F2 EDR ABI precondition (R3)
- **Invariant.** F1's `OplusEdrUtils.getBlastSurfaceControl(SurfaceView)` must return a **REAL** BLAST Surface
  (not the no-op `return null`) so F2's OEM EDR program (`setEdrViewTransform` 4×4 curve write + SF-side
  `setEdrMetadata` read) has the precondition it needs. **F1 alone is necessary-but-insufficient** — a real
  Surface with no curve ABI still drops the tonemap.
- **Failure mode.** Stub returns null ⇒ the OEM EDR program never runs (`getBlastSurfaceControl→REAL BLAST
  Surface` ×3 is the stock precondition the LOS stub breaks) ⇒ ~5× over-exposure (#3). Or: F2 lands std-ratio
  only ⇒ insufficient by construction (the falsifier).
- **Check.** `trace_edr_invocation.log`: assert `getBlastSurfaceControl → REAL BLAST Surface` ×3, then
  `setEdrViewTransform` ×1 with non-garbage `transform[16]` (the probe aarch64-FP decode fix pending). Restore the
  dropped `SIZE_DISPLAY_MAX=16`/`SIZE_POSITION_MAX=2` consts for ABI parity.

### I6 — F4 dlopen-by-leaf ⟷ F4 label (libcsextimpl + libapsfixup)
- **Invariant.** Both blobs need **both** a `same_process_hal_file` label (fixes `cameraserver avc denied {read}`
  on `vendor_file`) **and** a public.libraries / namespace entry (fixes `vndksupport … sphal … not found`
  dlopen-by-leaf). One without the other still fails at runtime.
- **Check.** On-device: confirm the lib maps under the loading domain (no `avc denied`, no `not found`); for
  `libcsextimpl` confirm it is re-added (`d654641` reversed) before checking the label.

### I7 — F3 session-typing ⟷ R5/R6 vendor-tag publish + F4 namespace
- **Invariant.** R5's `hdr_detected 0x80be000b` and R6's TurboHDR `~0x4d78` must (i) be **published in-scene**
  (the AEC/IPE in-scene branch, armed by F3's HDRMode session-typing) and (ii) **resolve through the vendor-tag
  namespace** (`camxvendortags.cpp:419`), whose producer libs F4 labels `same_process_hal_file`.
- **Failure mode.** No session-typing ⇒ AEC stays out of the in-scene branch ⇒ `hdr_detected rc=−2` / TurboHDR
  tag unpublished ⇒ `parseTurboHdrInfo` cbz-skips → `field_0x4d88` null → `strlen(null)` SIGSEGV (#6, currently
  masked by Family-III).
- **Check.** `observe_getmetadata` with `libAlgoProcess` loaded in-scene (R6 currently **DARK** — this is the
  gating observation before retiring Family-III).

---

## (c) Upgrade / re-derive path (when dodge or OOS evolves)

> The F-nodes are **derived** from two moving references: the **dodge** facilitation set (the proof-of-form
> oracle) and the **OOS** stock baseline (the RE offsets + OBSERVED values). When either moves, re-derive the
> F-nodes **without fork drift** — i.e. without our authored deltas silently rotting against a new base.

### The clean re-derive procedure

1. **Re-anchor the oracle (dodge).** Re-run the proof-of-form scan (`./DODGE-ORACLE.md`): re-verify the sha256 of
   the four frameworks patches, the `public.libraries.txt` line count + `grep camxexternalformat = 0`, the
   `oplus-fwk` class-shape presence, the `file_contexts` label family, and **that dodge still ships libapsfixup**.
   If any proof-of-form flips (e.g. dodge starts shipping a Depth-2 hook, or drops libapsfixup), the affected
   row's verdict moves between **adopt ⟷ author-new ⟷ improve** — update `./INDEX.md`.
2. **Re-anchor the spec (OOS).** Re-pin the RE offsets against the new OOS image (device addr = Ghidra −
   0x100000). The offsets in F2/F3/F4 (`onTransact 0x16f6f0`, `beforeConfigureStreamsLocked 0x17b71c`,
   `setEdrViewTransform 0x27fd48`, `callbackToCamUnit 0x31fa1c`, …) are **build-pinned**; a new OOS build shifts
   them. Re-derive offsets, do not assume.
3. **Separate adopt-rows from author-rows.** The re-derive is mechanical for **adopt** rows (re-take dodge's
   artifact) and **manual** for **author-new** rows (re-validate against the new offsets). Keep the two lanes
   distinct so a dodge bump never silently overwrites an authored hook, and an OOS bump never silently invalidates
   an adopted patch.
4. **Re-run the runtime interlocks (b).** After re-derive, every I1–I7 invariant must be re-checked by symbol
   scan / frida — a reference bump can break a match (e.g. a new mangling for `CameraServiceExtImpl::onTransact`
   breaks I1) without any source edit on our side.
5. **Re-evaluate the reduction map.** If OOS changes the metadata-lifetime or TurboHDR path, the
   POST-PROCESSING-CONTRACT reduction may shift; re-confirm Family-I stays irreducible and II/III stay
   retire-via-root.

### Anti-fork-drift discipline (the rebase model)

- **Dodge is the BASE, not just the oracle** (trunk decision 2026-06-13). Re-derive by **overlaying** the current
  dodge facilitation onto the infiniti base, then re-applying **only** the infiniti deltas — the rows flagged
  *intentional / do-NOT-revert* (F1 system_ext stub-plumbing + privapp dep, F4 `hal_camera_client` Treble-clean
  `.te`, the HDR/EDR props, the author-new R1/R3/R4 hooks). Do **not** re-chase *why* a past dirty edit diverged;
  the rebase makes dodge's applied state the source of truth.
- **Record the alias.** The F-nodes carry `migrated_from: E*` front-matter; keep it. The E-node files stay as the
  diff-era source so a re-derive can diff old-vs-new without losing the carried evidence.
- **Pin every offset + sha256 in front-matter** so a re-derive is a diff, not a re-investigation.

---

## Quick reference — the dependency + interlock matrix

| Edge / interlock | Type | Gates | Verify by |
|------------------|------|-------|-----------|
| F1 stub → F2 R1 receiver | build (Java symbol) | R1 receiver compiles | class resolves off app loader (I3) |
| F2 av/0001 → R4 Depth-2 → C3 8K | build + runtime | #8 path | `strings cameraserver` carries `CameraServiceExt*` (I1) |
| F2 av/0001 → F4 re-add+label libcsextimpl | runtime (2 repos) | R2 live channel | dlopen maps, no avc denied (I1+I6) |
| F4 public.libraries/labels → all dlopen | install | every runtime load | `dlopen` succeeds, no `not found` (I6) |
| F3 config → C4/C5 publish | install | R5/R6 in-scene | `observe_getmetadata` in-scene (I7) |
| F1 `getBlastSurfaceControl` real ↔ F2 EDR ABI | runtime | R3 #3 | `trace_edr_invocation.log` (I5) |
| native `callbackToCamUnit` ↔ Java `decMetaRefZeroToRemove(JII)V` | runtime (signature) | R1 #1/#4 | frida cadence ~7–9/s (I2) |
| F1 `CameraMetadataNativeWrapper` ↔ OCS `algoInit` | runtime | R7 | no CNFE at `algoInit` (I4) |

## Cross-links
- **The work order this spine supports:** `./INDEX.md` (load-bearing-first ordering)
- **Why each form is the optimal form:** `./DODGE-ORACLE.md`
- **The reduction map (Family-I keep / II,III retire):** `../interop-tree/POST-PROCESSING-CONTRACT.md`
- **Per-node mechanism detail + RE offsets:** `./F1-stubs.md` · `./F2-system-framework.md` · `./F3-toggles-config.md` · `./F4-sepolicy-namespace.md`
- **The spec (OBSERVED values + offsets):** `../interop-tree/REQUIREMENTS.md`
