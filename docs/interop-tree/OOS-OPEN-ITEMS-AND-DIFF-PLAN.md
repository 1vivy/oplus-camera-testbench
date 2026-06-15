<!-- STATUS: PLAN/INFERRED — inference-surgery applied 2026-06-14 (doc-50 method). This document is
     primarily a forward execution plan (Phase B/C probes, diff harness spec, chain-walk design).
     Verified observations are extracted into the "VERIFIED — measured facts cited in this plan" section
     below. Everything else — probe designs, expected OOS values (diff targets), rule-out matrices,
     harness specifications, and residual items — is PLAN/INFERENCE, not observation-anchored fact.
     Guard: a "diff target / expected OOS value" is a prediction until the probe runs and the value
     is directly observed. "Results (2026-06-14)" items that cite captured log files are VERIFIED;
     items marked as "residual / still DARK / still mis-decoded" remain INFERENCES. -->
<!-- Parent: ./INDEX.md · Companions: ./REQUIREMENTS.md, ./POST-PROCESSING-CONTRACT.md, ../facilitation/INDEX.md -->
---
title: OOS open-items deepening + the gralloc/P010 root-cause walk + the OOS↔LOS diff harness
date: 2026-06-14
purpose: >
  Phase-B/C plan. The OOS baseline is the DIFF ORACLE for the LOS B-side test: replay each condition on LOS,
  parse identically, and the first contract whose value != the OOS value is where LOS went wrong. This doc
  (1) brainstorms the newly-reachable log/probe scope to close the remaining OOS DARK items, (2) lays out the
  FULL gralloc/P010 chain walk to root-cause libapsfixup (even where irreducible), and (3) specs the diff
  harness. EVERY new probe is SYMMETRIC (same script + same parser, OOS now / LOS later) so it feeds the diff.
---

## VERIFIED — measured facts cited in this plan (2026-06-14, from captured logs)

- **C — gralloc/P010 chain walked** (`gralloc-p010-chain-RE.md`): OOS mapper `libgrallocutils::GetYuvSPPlaneInfo
  @0x53f30` lays P010 contiguous (`chroma_offset=page_align(luma_size)`, `cb=y+luma_size`, `cr=cb+1`,
  `cstride=2·ystride`; runtime `Cb−Y=stride×1472`). Byte-identical OOS↔LOS. `camApsBufferLockPlanes`
  returns `descriptor=0x0` — observed in `trace_p010_planes.log` (planeCount=1, rowStride=5120).
  Usage-bits / blob-divergence / namespace ruled out (identical both sides). (Observed.)
- **B3 — R1 bridge location identified** (`apsclient-bridge-RE.md`): `libAPSClient-cmd-jni.so`
  `JNICameraContext::onTransact @0x6eba0` → `GetMethodID("onTransact",...)` → `CallStaticIntMethod` on
  `com.oplus.ocs.camera.consumer.apsAdapter.APSClient`. `decMetaRefZeroToRemove(JII)V` is dex-only in
  `unit.sdk.jar`. (Static RE observed.)
- **Diff harness built**: `tools/observability/campaign/diff_oos_los.py` self-test = all-MATCH. (Observed.)
- **B1 R6 TurboHDR**: deref site `n=0` on daytime window+wall photo — still DARK (needs higher-DR scene).
- **B2 EDR floats**: structurally captured (`getBlastSurfaceControl→REAL BLAST Surface` ×3 confirmed);
  `d0` float decode still mis-decoded (denormal — needs `s0`/low-32 read as Float32).
- **B4 metadata incref**: Java `setMetaImageRef` hook did not fire (class/sig mismatch) — per-frame
  RELEASE upcall (R1 contract) is solid; inc-balance is still dark.

> **All probe designs, expected OOS values (diff targets), rule-out matrices, harness specs, and
> "residual" items below are PLAN/INFERENCE — not observation-anchored until the probe runs.**

## Inferences & Open (PLAN — forward probes and diff targets)
> Per the interop-tree trunk axiom, expected OOS values are PREDICTIONS until directly observed.
> The "diff target" column in Part B and the rule-out matrix in Part C are plans/hypotheses.
> The Results (2026-06-14) section above lists the only items that crossed from plan to observation
> this session. Everything else in Parts B/C/D and the diff harness spec is forward plan.

---

# OOS open-items, the gralloc/P010 root-cause walk, and the OOS↔LOS diff

> **Diff-readiness rule (applies to everything below).** A probe earns its place only if it is *symmetric*:
> one script, one parser, run on OOS to set the expected value and on LOS to get the actual. The output is a
> single comparable value/record per contract. "Where LOS went wrong" = the first checkpoint that diverges.
> So each item below names: the **checkpoint** (the contract value), the **probe**, the **condition**, and the
> **expected OOS value** (the diff target).

## Part B — close the remaining OOS DARK items (newly-reachable scope)

The scope opened because we now have: CamX-core unlocked (`g_logInfo`), CHI un-clobbered, app-side attach into
`com.oplus.camera` (where `libAlgoProcess`/OCS live), and the contract map that says *what* to look for.

| # | DARK item | New probe / log vector | Condition (loads the target) | Checkpoint / expected OOS value (diff target) |
|---|-----------|------------------------|------------------------------|-----------------------------------------------|
| B1 | **R6 TurboHDR tag (~0x4d78)** — `observe_getmetadata` never loaded libAlgoProcess app-side | NEW `trace_turbohdr_tag.js`: hook `TurboRaw::parseTurboHdrInfo` (writes `field_0x4d88`) + the `setProcessOtherParams+140` deref site (device `0x1441ad4`); read the vendor-tag at the publish point | app-side on `com.oplus.camera`, **master/Pro or HDR photo** capture (the conditions that DID load libAlgoProcess: p010/metalifecycle) — NOT plain video | tag PRESENT + `field_0x4d88` non-null on stock HDR (→ no `strlen(null)`); LOS expected = absent → SIGSEGV (#6). Masked today by libapsfixup Family-III |
| B2 | **R3 EDR `transform[16]` / ratio precise values** — probe fired but FP args garbage (`ratio=-1e10`) | FIX `trace_edr_invocation.js` aarch64 FP decode: read `d0..d7` (the float arg regs) via `this.context.d0…`/`Float64`, not `args[n].readFloat()`; dump the 16 floats of `OplusEdrViewTransform` at the 2nd-arg ptr (0x5C struct, `transform` @+0x1C) | edr-hdr, after the preview-reconfigure re-trigger (already wired) | the actual 4×4 tonemap matrix + `desiredRatio` (stock showed `setEDRStatus scale 4.926→5.0`); LOS expected = no OEM curve call at all (stub `→null`) |
| B3 | **R1 release receiver — the bridge JNI lib** (gCallbackRequestAction → GetMethodID/CallVoidMethod) not yet located | RE target: find the lib that implements `gCallbackRequestAction` (the fn-ptr @ libAlgoProcess `0x9b7548`) — likely the OCS-SDK JNI (`libcamera_*jni`/unit.sdk). Then NEW `trace_apsclient_bridge.js`: hook the GetMethodID(`decMetaRefZeroToRemove`) + CallVoidMethod to confirm class-resolution + the JNI arg marshalling | app-side, preview-baseline / metalifecycle | the bridge resolves `APSClient$MetaImageRefCounter` off the APP classloader + calls per-frame; LOS expected = class unresolved / call absent (the #1 freeze). **Unblocks the R1 LOS impl (F2).** |
| B4 | **Metadata incref side** — lifecycle probe caught release (`isInc=false`); inc side (`Z=true`) via Java only | extend `trace_aps_metadata_lifecycle.js`: hook Java `setMetaImageRef(Object,String,Z)` to log inc events + maintain a running inc−dec balance + sample `metaBufferMap.size()` | metalifecycle (burst + hold for stress) | balance ≈ 0, map bounded (~2–4) on stock; LOS expected = inc≫dec, map climbs → 20 (pool exhaust). The clean diff for #1/#4 |

## Part C — fully walk the gralloc/P010 chain on OOS (root-cause libapsfixup, even if irreducible)

**Goal (user's framing):** "OOS handles P010 contiguity *this* way; no equivalent exists on LOS *because Y*;
ruled out subsystem Z." Family-I (`p010LSB2MSBNeon` + ARC chroma/pitch) is rearch/14-irreducible, but we
must still **know the cause** — the lock-math divergence is currently asserted, not walked.

**The chain to instrument (allocation → mapping → lock → consume):**
1. **Allocate** — who requests the P010 buffer + with what usage/format? (`AHardwareBuffer_allocate` /
   gralloc4 `IAllocator::allocate`, the `BufferDescriptorInfo` usage bits + `PixelFormat::YCBCR_P010`).
2. **Map / layout** — `QtiMapper5`/`mapper.qti.so` `getMetadata(PLANE_LAYOUTS)` / `getPlaneLayouts`: the
   per-plane offset/stride/size + the **contiguity decision** (is luma+chroma one allocation? the `Cr−Y =
   stride×height` test D1 §a already saw `stride×1472`).
3. **Lock** — `camApsBufferLockPlanes` (captured: planeCount=1, rowStride=5120, descriptor=0x0).
4. **Consume / repair** — libAlgoProcess consumes; libapsfixup Family-I recomputes the chroma ptr =
   luma+page_align(⅔·avail), pitch[1]=pitch[0], and the P010 LSB→MSB conversion length.

**NEW probe `trace_gralloc_p010_chain.js`** (app-side + provider-side variants — symmetric):
- alloc side: hook `IAllocator::allocate` / `AHardwareBuffer_allocate` → log usage bits + format + the chosen
  allocator (the `same_process_hal`/sphal path X4 named).
- map side: hook `QtiMapper5::getMetadata`/`getPlaneLayouts` → log the plane layout + the contiguity math.
- correlate with the existing `trace_p010_planes` lock-side capture.
- RE pair: decompile the OOS `mapper.qti.so` + `libgrallocutils` P010 plane-layout path (ghidra, oos-baseline-v3)
  to find WHERE OOS forces the contiguous/page-aligned chroma that libapsfixup otherwise patches.

**The rule-out matrix (the "ruled out subsystem Z" deliverable)** — for each candidate cause of the P010
divergence, the instrument that confirms/rules it out:

| Candidate cause | Instrument | Rule-out criterion |
|-----------------|-----------|--------------------|
| usage-bit divergence (alloc input) | `trace_gralloc_p010_chain` alloc hook | OOS vs LOS usage bits identical ⇒ ruled out as alloc-input |
| mapper/gralloc blob divergence | doc-42 BuildID check (byte-identical) | identical ⇒ ruled out (trunk axiom) |
| namespace (which mapper resolves) | X4 (already REFUTED) + sphal resolution log | resolves in sphal both sides ⇒ ruled out |
| **lock-math / page-align (the survivor)** | `camApsBufferLockPlanes` + mapper layout diff | OOS contiguous via [mechanism], LOS non-contig ⇒ **the cause** (Family-I irreducible) |
| consumer (APS) expectation | the Family-I transform (RE'd) | apsfixup recomputes ⅔·avail page-align ⇒ confirms consumer expects page-aligned chroma |

Output → `docs/re-notes/gralloc-p010-chain-RE.md` + a D1 §a update: the *walked* cause, not the asserted one.

## Part D — the rest (after B/C)
OCS stubbing (F1 stub class surface vs the OCS-SDK consume path), config derivatives (F3 props/permissions/
session-typing artifacts), the remaining facilitation forms — each re-scoped to its diff checkpoint.

## The OOS↔LOS diff harness (the connective tissue)
**NEW `tools/observability/campaign/diff_oos_los.py`**: given `reference/campaign/<cond>` (OOS) and a LOS
capture dir for the SAME condition, emit a per-contract divergence table — for every parse_condition row + every
symmetric probe value: `OOS value | LOS value | MATCH/DIVERGE`. The FIRST diverging checkpoint along a symptom's
node path = the root. Wraps `parse_condition.py`'s detectors (no duplication) + a probe-value extractor.
This is what makes "diff where LOS went wrong" a one-command operation once the LOS B-side captures exist.

> **Feeds:** Part-B closes the OOS expected-value side of B1–B4; Part-C closes D1's P010 expected value; the
> diff harness + the symmetric probes make the LOS bringup's B-side test a direct, rooted diff against this baseline.

## Results (2026-06-14, Phase B/C)

**C — gralloc/P010 cause WALKED (the answer to "even if irreducible, know the cause")** — `gralloc-p010-chain-RE.md`:
- OOS mapper `libgrallocutils::GetYuvSPPlaneInfo @0x53f30` lays P010 **contiguous**: `chroma_offset=page_align(luma_size)`,
  `cb=y+luma_size`, `cr=cb+1`, `cstride=2·ystride` (runtime `Cb−Y=stride×1472`). **Byte-identical OOS↔LOS.**
- RULED OUT: usage-bits / blob-divergence / namespace (producer identical+correct both sides).
- **CAUSE (survivor):** APS's own `camApsBufferLockPlanes` returns `descriptor=0x0` → never ingests the mapper's
  contiguous VAs → garbage chroma → libapsfixup Family-I re-derives the *same* layout the mapper already made.
  **Family-I is irreducible BECAUSE the producer is already correct** — the divergence is purely APS's consumer-side
  lock ABI, with no upstream lever. (Runtime dual-view confirms: standard `AHardwareBuffer_lockPlanes`=3 semi-planar
  planes vs APS `camApsBufferLockPlanes`=1 packed @5120.)

**B3 — R1 bridge SPECIFIED** — `apsclient-bridge-RE.md`: `libAPSClient-cmd-jni.so` `JNICameraContext::onTransact @0x6eba0`
→ `GetMethodID("onTransact","(Ljava/lang/Object;ILjava/util/HashMap;Ljava/util/HashMap;)I")` → `CallStaticIntMethod`
on `com.oplus.ocs.camera.consumer.apsAdapter.APSClient` (app-classloader global ref). `decMetaRefZeroToRemove(JII)V`
is **dex-only**; the action-keyed routing lives in `unit.sdk.jar` → **residual: a jadx pass to author the byte-exact
LOS receiver body.** Native surface fully specifies the R1 registration handshake (`setRequestActionCallback @0x2d5584`).

**Diff harness BUILT + validated** — `tools/observability/campaign/diff_oos_los.py` (self-test = all-MATCH). Ready for LOS B-side.

**Residual refinements (quick follow-ups, not blockers):**
- **B1 R6 TurboHDR: still DARK** — deref site `n=0` on the daytime window+wall photo; TurboHDR needs a **higher-DR
  scene** (strong highlights/sun) to engage. *Needs a re-point to a high-DR scene for the capture.*
- **B2 EDR floats:** still mis-decoded (`d0` read as Float64 → denormal); fix = read `s0`/low-32 as Float32. Structural
  EDR contract already captured (getBlastSurfaceControl→REAL, the OEM methods fire).
- **B4 metadata incref:** the Java `setMetaImageRef` hook didn't fire (class/sig mismatch) — the per-frame RELEASE upcall
  (the load-bearing R1 contract) is solid; the inc-balance is the missing nicety.
- **R1 dex routing:** jadx `unit.sdk.jar` for the `onTransact`→`decMetaRefZeroToRemove` HashMap-key routing.
