<!-- STATUS: MIXED — inference-surgery applied 2026-06-14 (doc-50 method). Verified body = sections (a) and (b)
     (OOS V16.1.0 stock captures N=3 ALL-STABLE; shim decomposition = static source analysis).
     All root-retirement verdicts, LOS-deferred A/B items, and "shrink" action plans are INFERENCES/PLAN
     and live in the "Inferences & Open" section at the bottom.
     Guard: a measured stall/crash SITE is never a verified ROOT; retire verdicts require an OOS↔LOS A/B. -->
<!-- Parent: ./INDEX.md · Companions: ./REQUIREMENTS.md, ../re-notes/*-RE.md -->
---
title: APS Post-Processing Contract — the root-fix spec that shrinks (and eventually retires) libapsfixup
date: 2026-06-14
scope: >
  The contract libAlgoProcess (APS, the OCS post-processing engine) consumes from its environment. It is THE
  thing the libapsfixup shim currently fakes. Get this contract right and the shim's *reproducible* families
  become dead code; the only residue is the irreducible Family-I lock-math defense. Built from OOS V16.1.0
  stock captures (N=3 ALL-STABLE) + the unstripped libapsfixup binary (in-tree source) + the 5 re-notes.
thesis: >
  The shim is not a monolith to keep-or-remove. It is 6 interposers in 3 families. Two families are
  REPRODUCIBLE (retire via a root fix that satisfies the contract upstream); one is IRREDUCIBLE (keep, minimal).
  Crucially the copyMetadata interposer is a UAF null-guard that MASKS #4, it does not cause it — fix the
  lifetime contract (b) at the root and the guard dies AND the UAF dies. As understanding grows the shim
  shrinks to its irreducible core, never expands.
sources:
  - reference/campaign/p010/app_probes/trace_p010_planes.log            (a) plane geometry
  - reference/campaign/metalifecycle/app_probes/trace_aps_metadata_lifecycle.log   (b) lifecycle
  - reference/campaign/{burst,holdshutter}/verdict.json                 (b) #4 CLEAN on stock (False ×3, 0 tombstones)
  - re-notes/{libapsfixup-interposition,decmetarefzero-upcall,aec-hdrdetect-publish}-RE.md
  - libapsfixup binary: android/lineage/out/.../infiniti/odm/lib64/libapsfixup.so (unstripped) + apsfixup.cpp
---

# APS Post-Processing Contract (the root-fix spec)

> **Why this doc exists.** Every time the shim is expanded to cover a new case, it re-implements — locally and
> by guess — an invariant that stock satisfies globally. Without the whole contract, each expansion is a new
> way to desync (and #4 is the proof an expansion can hide a deeper break). This doc states the contract APS
> actually consumes on stock, so the port can satisfy it at the **root** instead of patching consumers. All
> named blobs are byte-identical OOS↔LOS (trunk axiom) → every item below is an **environment** contract.

## The shim, decomposed (the removal map)

`libapsfixup.so` ships **unstripped from in-tree source** (`vendor/oplus/camera-sm8850/apsfixup/apsfixup.cpp`);
it `add-needed`s onto libAlgoProcess and installs GOT/PLT redirects. Six interposers, three families
(`libapsfixup-interposition-RE.md`):

| Family | Interposer(s) | What it repairs | Verdict |
|--------|---------------|-----------------|---------|
| **I — P010 / chroma geometry** | `p010LSB2MSBNeon` (slot 0x689ba8), `ARC_Turbo_RAW_Process` / `ARC_TFRSN_Process` (dlsym) | P010 conv length; chroma ptr = luma + page_align(⅔·avail), pitch[1]=pitch[0] | **IRREDUCIBLE — keep** (rearch/14: OOS↔LOS lock-math divergence, no facilitation lever) |
| **II — metadata** | `APSMetadata::copyMetadata` null-guard (slot 0x686ee8, body +0x292960) | null-returns on a freed/insane source pointer | **REPRODUCIBLE — retire** (a UAF *mask*, see (b)) |
| **III — TurboHDR** | `strlen@LIBC` null-guard (TurboRaw, slot 0x1bb6888) | `strlen(null)→0` | **REPRODUCIBLE — retire** (R6: fix the TurboHDR tag publish upstream) |
| (inert) | `OGLBasicToneProcess` (#4) | name-match never fires | dead skeleton |

> **The contract-critical fact:** libapsfixup does **not** touch the metadata *lifetime* — `grep
> metaObjRef|MetaImageRef|decMetaRef|isInc|callbackToCamUnit` over the binary = **0 matches**. Its only metadata
> interposer is a *null-guard adjacent to* `copyMetadata`. So the shim **cannot** be what breaks (b); it only
> hides the symptom. Families I and (a) operate on the lock/descriptor **geometry** axis — a separate axis
> from the lifetime.

---

## (a) Buffer-plane geometry contract — what APS locks

**Observed on stock** (`trace_p010_planes.log`, app-side `com.oplus.camera`, HDR photo): APS locks the buffer
via `camApsBufferLockPlanes` and consumes:
- `planeCount = 1`, `plane[0] pixStride = 0`, `rowStride = 5120`, `descriptor(ret) = 0x0`
- annotated by the probe as *"the ApsBufferPlanes the algo consumes, BEFORE the p010/ARC apsfixup repair"*

**Root-fix bearing:** this is the geometry Family-I repairs. Per rearch/14 the OOS↔LOS divergence here is
**lock-math with no upstream lever** → Family-I stays as the **minimal irreducible defense**. The contract item
the port must NOT regress: the single-plane / `rowStride=5120` / null-descriptor lock shape APS expects.
*(#5 P010 root re-homed to D1 lock-math; the namespace theory is REFUTED — X4.)*

## (b) Metadata-lifecycle contract — the lifetime invariant (the #1/#4 root)

**Observed on stock** (`trace_aps_metadata_lifecycle.log`, HDR photo): a steady **per-preview-frame** cycle —
- `APSMetadata::copyMetadata` (libAlgoProcess +0x292960) fires per frame (22× in-window) — **clean, no UAF**
- `ApsCallbackMetaRefInc::preProcess` builds `{image, pipelienName, isInc}` → `callbackToCamUnit` **UPCALL
  JNIAction=2 (RELEASE signal)** fires **~per-frame, steady ~7–9/s** → Java `APSClient$MetaImageRefCounter`
  decref + `Image.close()` at refcount 0 (`decmetarefzero-upcall-RE.md`)
- back-to-back stress is **CLEAN on stock**: `burst` + `holdshutter` verdicts = `#4 copyMetadata UAF = False ×3`,
  **0 tombstones, 0 SIGSEGV**

**Root-fix bearing — THE key result for retiring the shim:**
1. Stock's metadata lifetime is **correct**: incref → copyMetadata → per-frame release upcall → bounded
   `metaBufferMap`. This is **R1**, the #1 freeze denominator — now **observed firing** (was DARK).
2. The #4 UAF is therefore **not inherent** and **not caused by the shim** — it appears only on the port, and
   the shim's `copyMetadata` null-guard merely **masks** it.
3. ∴ **Root fix = reproduce stock's release-upcall lifetime on the port** (the `decMetaRefZeroToRemove` env
   bridge, R1, owned by E2/`nativeGetOplusHardwareBuffer`-adjacent /system release path). When it fires
   per-frame as on stock, `metaBufferMap` stays bounded → no pool exhaustion (#1 freeze) **and** no freed
   source → the Family-II null-guard becomes dead code (#4 retired). One fix, both symptoms.

## (c) /system release-bridge contract — what closes the loop

- `getOplusHardwareBuffer` JNI bridge is **present + effective** on the port (X3/#7 REFUTED, base/0001 applied) —
  not the gap.
- The gap is the **release upcall receiver**: the Java `APSClient$MetaImageRefCounter.decMetaRefZeroToRemove`
  path must be wired so the native `callbackToCamUnit` upcall (observed per-frame on stock) actually lands and
  decrefs on LOS. This is the same E2 frameworks/base release bridge as R1.

---

## Inferences & Open (UNVERIFIED — heavy-check)
> Per the interop-tree trunk axiom, a measured stall SITE is never a verified ROOT. The retire/keep
> verdicts below are root attributions derived from the stock observations in (a)/(b) above — they are
> NOT verified until an OOS↔LOS A/B proves the contract break on the port. The "Open / next" items
> are forward plans. Neither the verdict table nor the next-steps constitute convicted roots.

## Verdict — shrink, don't expand

| Action | Family | Root fix (owning node) | Symptoms retired |
|--------|--------|------------------------|------------------|
| **KEEP (minimal)** | I — P010/chroma geometry | none (irreducible, rearch/14) | — (accepted lock-math defense) |
| **RETIRE via root fix** | II — metadata `copyMetadata` guard | satisfy (b): per-frame release upcall lands (R1, **E2**) | **#1 freeze + #4 UAF** (one fix) |
| **RETIRE via root fix** | III — TurboHDR `strlen` guard | publish the TurboHDR vendor-tag in-scene (R6, **E3**) | **#6 strlen-null SIGSEGV** |

**Net:** as the post-processing contract is satisfied at the root, libapsfixup shrinks to its irreducible
Family-I geometry core. The trajectory inverts — the shim stops accreting risk and starts shedding it.

## Open / next (to fully convict the retirement)
- **LOS A/B (deferred):** confirm the release upcall is *absent* on the LOS freeze (the predicted inverse:
  `metaBufferMap` climbs to the 20-deep pool cap, `previewManagerRoutine` parks). Then convict R1's root.
- **(b) wire precision:** the probe shows the upcall *cadence*; pairing the Java `setMetaImageRef(Z)` incref
  side (defensive-hooked) tightens the inc/dec balance. The native incref/decref share `ApsCallbackMetaRefInc`
  (isInc = the Java Z-arg), so direction is read Java-side.
- **F4 reframe:** this supersedes F4/E4's "keep libapsfixup as accepted defense" — the new verdict is the table
  above (keep Family-I; retire II/III). Carry into the facilitation migration (Phase 2).

> Cross-refs: REQUIREMENTS R1 (release upcall, now observed) · R6 (TurboHDR) · X4 (P010 namespace refuted) ·
> D1 §a (plane geometry) · D2 §f (#4) · C6 §a (release) · re-notes/{libapsfixup-interposition, decmetarefzero-upcall}.
