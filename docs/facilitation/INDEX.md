<!-- STATUS: PLAN/INFERRED — this is the facilitation requirements-to-status board. All optimal-form verdicts,
     work-order entries, and status rows are forward plan and attribution. The verified-observation core lives
     in each F-node's VERIFIED section and the IMPLEMENTATION-PLAN.md verified-facts table. -->
<!-- Parent: ../interop-tree/INDEX.md (the trunk) -->
<!-- Children: ./F1-stubs.md ./F2-system-framework.md ./F3-toggles-config.md ./F4-sepolicy-namespace.md -->
<!-- Siblings (this plane): ./DODGE-ORACLE.md (proof-of-form), ./BUILD-ORDER.md (build+runtime contract) -->
<!-- Status model (two axes): ../interop-tree/SCHEMA.md -->

---
title: "Facilitation INDEX — requirements → facilitation STATUS BOARD"
plane: facilitation
date: 2026-06-14
owns: "the requirements→facilitation map (which F-node owns each REQUIREMENTS row + the optimal-LOS-form verdict + status)"
companions: [./DODGE-ORACLE.md, ./BUILD-ORDER.md]
upstream_spec: ../interop-tree/REQUIREMENTS.md
two_phase_model: "interop-tree = the SPEC (what must be true on stock); facilitation = HOW to enable it on LOS"
alias: "F1–F4 ARE the migrated E1–E4 (forward spec). E-nodes remain as the diff-era source."
---

# Facilitation INDEX — the requirements → facilitation STATUS BOARD

## Trunk — the two-phase model

This repo runs a **two-phase** model. Keep the planes separate:

1. **interop-tree = the SPEC.** `../interop-tree/` answers *"what propagation contract does stock satisfy,
   and what is its root?"* Its distilled output is `../interop-tree/REQUIREMENTS.md` — the **root items that
   MUST be set** (R1–R7 load-bearing, X1–X4 downgraded). Each requirement carries an OBSERVED stock value
   and an RE offset; it is the **expected-behaviour reference**, not an instruction to edit a blob.
2. **facilitation = HOW to enable it on LOS.** `./` (this dir) answers, **per requirement**, *what is the
   **optimal LOS form** of the fix, and does a shipping reference (dodge) **prove that form**?* The four
   F-nodes own the requirements and emit a single verdict per row: **author-new · port-ABI · adopt · keep ·
   retire**.

> **Axiom (inherited from the trunk).** Every named blob is byte-identical OOS↔LOS, so **no root is a blob
> edit** — each is an *environment / facilitation* contract (stub / framework patch / config / sepolicy-namespace).
> The facilitation plane's job is to choose the **cheapest correct form** of that contract and weight it by the
> LOS confines (Treble-clean · re-buildable · system_ext-vs-boot-jar · author-new-vs-adopt).

### E→F migration alias (record this)

The four F-nodes **ARE** the migrated E1–E4. The migration re-scoped each node from a **dodge-vs-dirty DIFF**
(E-plane) to **requirements → mechanism → optimal-LOS-form** (F-plane). The carried verdicts/evidence are
preserved verbatim in each F-node's "Carried verdict" section.

| F-node | = migrated | Owns (REQUIREMENTS) | Partition |
|--------|-----------|---------------------|-----------|
| **F1** stubs | E1 | R7, R3-precondition | /system_ext |
| **F2** /system framework (av/base/native) | E2 | R1, R2, R3, R4 | /system |
| **F3** toggles / config | E3 | R5, R6, X1(downgraded) | mixed (/vendor·/odm config) |
| **F4** sepolicy + linker namespace | E4 | X4, libapsfixup-REDUCTION-MAP | mixed (/vendor-config·/vendor·/odm) |

> The **E-node files** (`../interop-tree/facilitation/E1..E4.md`) remain as the **diff-era source**; the
> **F-nodes are the forward spec**. References to "`docs/facilitation/F*`" in the trunk's symptom→path map
> resolve here (the E-node alias is superseded by these real files).

---

## STATUS BOARD — REQUIREMENTS row → owning F-node → optimal-LOS-form verdict → status

> **Load-bearing first.** R-rows lead (they gate a live blocker or are the freeze denominator); X-rows
> (downgraded / refuted) follow under the divider so no session re-chases them. Read the **verdict** column as
> the *form of the fix*; read **status** as *how far convicted*. "Optimal form" values: **author-new** (no
> shipping reference proves the form — write it against the RE offsets) · **port-ABI** (port a native ABI both
> sides) · **adopt** (a shipping reference proves the form — take it verbatim) · **keep** (already at the
> correct form — do not touch) · **retire** (a mask to delete once the root fix lands).

### LOAD-BEARING (lead with these)

| Req | Contract (must-set root) | Owning F-node | Optimal-LOS-form verdict | Mechanism class | Dodge proof-of-form | Status |
|-----|--------------------------|---------------|--------------------------|-----------------|---------------------|--------|
| **R1** | per-preview-frame native→Java release upcall (`decMetaRefZeroToRemove`) — #1 freeze denominator + #4 UAF root | **F2** (receiver) · F4 (retires Family-II) | **author-new** (Java release receiver; JNI bridge already effective) | framework patch (/system base) | **NO** — no dodge patch carries the receiver | upcall OBSERVED firing on stock; **highest-value** row (one fix → #1 + #4 + shim Family-II dead). LOS A/B (absent-on-freeze) deferred to eng build |
| **R2** | OEM `media.camera` binder Depth-1 receiver (`CameraServiceExtImpl::onTransact`, 100xx) | **F2** | **adopt** av/0001 framework patch + **reverse `d654641`** (re-add `libcsextimpl.so` → /system_ext) | framework patch + /system_ext blob | **YES (strong)** — shipping dodge ROM, zoom works | **CONVICTED-NOT-APPLIED** — the TOP single action; av/0001 file byte-identical but never applied (0 ext call sites, 0 ext strings in built cameraserver) |
| **R3** | OEM libgui-WRITE + SF-READ EDR ABI (`setEdrViewTransform` 4×4 curve) — #3 over-exposure | **F2** (native ABI, both sides) · **F1** (stub precondition) | **author-new / port-ABI** (libgui WRITE + SF READ; F1 patches `getBlastSurfaceControl`→REAL) | framework patch (native /system) + stub patch | **NO** — RE-proven on stock only, no LOS reference; std-ratio alone insufficient (the falsifier) | OEM EDR program OBSERVED firing on stock; author-new both sides. F1's stub fix is **necessary-but-insufficient** without F2's curve ABI |
| **R4** | 8K configure_streams bind (Depth-2 `beforeConfigureStreamsLocked` 8K StreamSet retype) — #8 | **F2** | **author-new** (6 Depth-2 internal ext hooks @`0x17b71c`/`0x184818`) | framework patch (native /system) | **NO** — absent on BOTH dodge and ours; av/0001 is Depth-1 only | gated behind R2 (no Depth-1 receiver ⇒ no Depth-2 reach). #8 verdicts transient-recover on stock → correctness, not a live crash blocker |
| **R5** | `hdr_detected` (0x80be000b) published into per-frame result in an HDR scene — #2 publication | **F3** | **adopt** (OEM odm CamX session-typing carrier) + **keep** the HDR/EDR props that arm it | config artifact (/vendor·/odm) | **YES, by negation + carrier** — dodge ships NO SHDR knob; HDRMode carriers live in odm CamX config | publish OBSERVED on stock; LOS arm `rc=−2` deferred. NOT the SHDR knob (X1) — session-state typing |
| **R6** | OEM IPE TurboHDR vendor tag (~0x4d78) published in an HDR scene — #6 | **F3** · F4 (retires Family-III) | **adopt** (same odm session-typing as R5) + **adopt** sepolicy `same_process_hal_file` namespace for the tag-producer | config + sepolicy-namespace | **PARTIAL** — proves the namespace-form (sepolicy label family), not the publish | **DARK** — carrier RE-inferred only; currently MASKED by libapsfixup Family-III. Fix → retire the guard |
| **R7** | motion-photo / SuperEIS metadata bridge class (`CameraMetadataNativeWrapper`) must resolve for OCS SDK | **F1** | **author-new** stub class (system_ext `<uses-library>`, dodge `getMetadataPtr` shape) | stub (system_ext lib) | **YES** — `oplus-fwk` ships the class shape; proven sufficient | stable CNFE on LOS-port (6/6) when unresolved; **KEEP system_ext form** (placement-break FALSIFIED) — author the class |

### DOWNGRADED (refuted / red-herring — kept only so no session re-chases them)

| Req | Contract (was treated as a root) | Owning F-node | Optimal-LOS-form verdict | Refutation | Status |
|-----|----------------------------------|---------------|--------------------------|------------|--------|
| **X1** | `selectSHDRAutoExposureUsecase=1` as the #2 SHDR lever | **F3** | **retire / do-not-author** (the knob reads 0 in-scene; stock rides HDRMode/DCG+fusion) | CONFIRMED red herring (REQUIREMENTS X1; C5 SESSION FACT 2/3/4) | retires the old E3 "author camxoverridesettings.txt" recommendation. The only `camxoverridesettings.txt` our port ships is logging-mask-only |
| **X2** | `hdr_detected` AEC gate (`*(aecCtx+0x48)==0`) as the **#1 freeze** root | C5/C6 (not an F-node lever) | **n/a** (publication contract = R5, not a freeze gate) | REFUTED as freeze root (R-08, doc-47); two independent gates | recorded so #1 is never re-attributed to the AEC gate |
| **X3** | `getOplusHardwareBuffer` JNI bridge ABSENT (#7 AOSP-fallback root) | **F2** (base/0001) | **keep** (already effective — close benign, no action) | REFUTED (`R-getoplushwbuffer-fallback`); bridge present+effective, fallback log absent N=3 | base/0001 applied+effective. #7's true root, if any, is the R1 release upcall downstream |
| **X4** | expose `libcamxexternalformatutils` in `public.libraries.txt` as the #5 P010 lever | **F4** | **retire / do-not-author** (sphal `same_process_hal_file` label is the form; **no** public.libraries entry) | REFUTED by dodge oracle (lib absent both sides yet dodge works) | re-home #5 at **D1** consumer-side lock-math. Stop chasing a namespace grant |

---

## libapsfixup REDUCTION MAP (the cross-cutting F4 deliverable — folds into the board)

The shim is **6 interposers / 3 families** (POST-PROCESSING-CONTRACT.md). It is not keep-or-remove; it
**shrinks** as the requirements are satisfied at the root. **Dodge ALSO ships libapsfixup → dodge has NOT done
the root fix → our reduction is the improvement** (see `./DODGE-ORACLE.md`).

| Family | What it masks | Optimal form | Root fix (req · F-node) | Status |
|--------|---------------|--------------|-------------------------|--------|
| **I — P010/chroma geometry** | lock-math divergence (no lever) | **keep (irreducible, minimal)** | none (rearch/14) | accepted defense — the only residue once II/III retire |
| **II — `copyMetadata` null-guard** | #4 UAF (mask, not cause) | **retire via root** | R1 release upcall · **F2** | retires #1 + #4 in one fix → guard becomes dead code |
| **III — TurboHDR `strlen` guard** | #6 SIGSEGV (mask) | **retire via root** | R6 publish · **F3** | deferred while R6 is DARK; form settled (publish-at-root, not guard) |

---

## Load-bearing-first ordering (the work order)

Ordered by **value × readiness** — what unblocks the most, soonest:

1. **R2 @ F2 — adopt av/0001 + reverse `d654641`.** CONVICTED-NOT-APPLIED, dodge proof-of-form strong, cheapest
   correct form. **TOP single action** — it restores the entire OEM `CameraServiceExt` Depth-1 layer (gates R4).
2. **R1 @ F2 — author-new release receiver.** Highest **value** (one fix retires #1 freeze + #4 UAF + makes shim
   Family-II dead code). JNI bridge already effective, so the gap is narrow (the receiver only).
3. **R7 @ F1 — author-new stub class.** Cheap, isolated (pure Java-symbol resolution off the app classloader),
   proven sufficient by dodge. Unblocks the OCS SDK consume-init (stops the 6/6 CNFE).
4. **R5 @ F3 — adopt odm session-typing config + keep HDR props.** Config-only, Treble-clean; arms the AEC
   in-scene publish (#2). **Do NOT author the SHDR knob (X1).**
5. **R4 @ F2 — author-new 6 Depth-2 hooks.** Highest-effort; **gated behind R2** (no Depth-1 receiver ⇒ no
   Depth-2 reach). #8 is correctness, not a live crash blocker.
6. **R3 @ F2 + F1 — author-new EDR ABI (both sides) + patch the stub.** Author-new on the WRITE and READ side
   (std-ratio is the falsifier); F1 patches `getBlastSurfaceControl`→REAL as the precondition.
7. **R6 @ F3 + F4 — adopt session-typing + sepolicy namespace; then retire Family-III.** **DARK** (deferred
   until the publish is confirmed app-side).

> **Keep / no-action rows:** X3 (base/0001 already effective — close benign), X4 (re-home #5 at D1 — owe no
> artifact), the non-P010 sepolicy/public.libraries enablers (KEEP the 12-lib patch + Treble-clean `.te`),
> Family-I (KEEP minimal). **Do-not-author:** X1 (the SHDR knob), X4 (the public.libraries entry).

## Cross-links
- **Per-node detail:** `./F1-stubs.md` · `./F2-system-framework.md` · `./F3-toggles-config.md` · `./F4-sepolicy-namespace.md`
- **Why each form is the optimal form:** `./DODGE-ORACLE.md` (dodge as proof-of-form, not file diff)
- **How the pieces land together:** `./BUILD-ORDER.md` (build dependency order + runtime interlocks + re-derive path)
- **The spec:** `../interop-tree/REQUIREMENTS.md` (R1–R7 · X1–X4) · `../interop-tree/POST-PROCESSING-CONTRACT.md` (reduction map)
- **Diff-era source (alias):** `../interop-tree/facilitation/E1..E4.md`
