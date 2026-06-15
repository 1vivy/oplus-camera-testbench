<!-- STATUS: VERIFIED — interop-tree foundation; evidence/axiom-anchored (doc-50 method). -->
<!-- Parent: ../../AGENTS.md -->
<!-- The node template + FACT contract for the interop tree. Copy the front-matter + 6 sections per node. -->

# interop-tree node SCHEMA

The tree has **three co-equal planes** — `C*` control (settings/params/vendor-tags flow down), `D*` data
(buffers/metadata flow down), `E*` facilitation (what OUR PORT provides; root-determined by the dodge oracle).
Each node is one file. A symptom is a **PATH** (crash/stall node → divergence/facilitation root), not a point.

## Trunk axiom (every node inherits it)
> A blob that is **byte-identical OOS↔LOS** yet misbehaves is a CRASH/STALL SITE, never a ROOT. The root is a
> broken **propagation contract in its environment** — `/system`, `/vendor-config`, or **our facilitation** (the
> stubs / framework edits / toggles / sepolicy-namespace we provide). If `blob_identical_oos_los: true`, the
> node's fact-to-resolve MUST point at an environment/facilitation knob, never a blob edit.

## Front-matter (verdict ledger — keep current; this is what INDEX.md reads)
```yaml
---
node: C3                       # plane-letter (C|D|E) + index
title: "cameraserver / libcameraservice + OEM CameraServiceExtImpl"
plane: control                # control | data | facilitation
partition: /system            # /system | /vendor | /vendor-config | /odm | /system_ext | mixed
blob_identical_oos_los: true  # axiom flag; true ⇒ root is environmental/facilitation
characterization: UNCHARACTERIZED  # UNCHARACTERIZED | PARTIAL | CHARACTERIZED — how well the (a) contract is OBSERVED (the plumbing)
conviction: OPEN               # OPEN | SUPPORTED | CONFOUNDED | CONVICTED | REFUTED | BLOCKED — status of any root CLAIM
verdict: ""                    # one-line fact once known: the OBSERVED contract (characterization) and/or the proven root (conviction)
confidence: low                # low | medium | high
symptoms: [8, 1, 3]            # symptom ids that attach here (crash-site and/or divergence-root)
probes: [G1, G5, r4-oem-transact]   # tools/observability levers/kits that observe this boundary
gaps: [G1, G5]                 # logging-gap-register ids
dodge_ref: ""                  # E-nodes: dodge reference artifact path(s) (the oracle)
dirty_ref: ""                  # E-nodes: our dirty artifact path(s)
divergence: ""                 # E-nodes: same | differs | missing | unknown (+ one-line how)
upstream: [C2]                 # parent node(s) feeding this contract
downstream: [C4, D2]           # child node(s) this feeds
refuted_refs: []               # REFUTED-LOG ids touching this node
doc_refs: [doc-48]             # rearch/ doc cross-refs
updated: 2026-06-13
---
```

## Two status axes (the core of the model — they are ORTHOGONAL, "good together")

A node answers two different questions, tracked on two independent fields. Conflating them was the old error:
it made *"we understand the wire but have not proven a root"* read as a weak/incomplete status, when it is in
fact the **honest, complete stock-only deliverable**.

- **`characterization:` — do we understand the EXPECTED behaviour / plumbing?** How completely the node's
  (a) propagation contract is **OBSERVED** — the exact carriers seen entering/leaving the boundary. Earned by
  **observation, not intervention**: observe-only frida traces, **un-clobbered CamX/CHI logs** (the stack
  narrating its own decisions — the richest, cheapest oracle), `dumpsys`, symbol scans; for **E-nodes**, the
  dodge-oracle structural map. Ladder: `UNCHARACTERIZED` (contract unseen) → `PARTIAL` (sketched from docs /
  static / one boundary, not observed end-to-end) → `CHARACTERIZED` (carriers observed at runtime / via the
  oracle). **This is the primary axis this phase.** A `CHARACTERIZED` node is a *success* — it is the
  expected-behaviour reference point that any later capture (incl. LOS) is scored against.

- **`conviction:` — have we PROVEN this node is a symptom root?** The status of a *causal claim*. Ladder:
  `OPEN` (no claim) → `SUPPORTED` (evidence-for, decisive A/B deferred) → `CONFOUNDED` (a claim measured under
  non-identical conditions — untrustworthy until re-tested) → `CONVICTED` (all five FACT gates pass) → `REFUTED`
  (a falsifier fired) → `BLOCKED` (a prerequisite wedges the test). Convicting is **intervention** work and is
  mostly **LOS-deferred** for runtime (C/D) nodes; **E-nodes can reach `CONVICTED` now** because their A/B is
  the dodge oracle, runnable on stock.

**The honest stock-only target:** most C/D nodes land **`CHARACTERIZED` / `OPEN`** — wire mapped, root conviction
deferred to LOS. E-nodes can land **`CHARACTERIZED` / `CONVICTED`**. Do NOT force a node toward `CONVICTED` by
intervention when the goal is to *record how it is plumbed* — characterize it and leave conviction `OPEN`.

## Body — six fixed sections
- **(a) Propagation contract.** Two lists, *what enters* / *what leaves* — name the EXACT carriers that cross
  this boundary (vendor-tags by name+hash, CamX StaticSettings keys by name, binder codes, ExtImpl hooks,
  P010 PLANE_LAYOUTS fields, JNI symbols, stub classes/methods). Named carriers only, not prose.
- **(b) Environment dependencies.** The non-blob things the contract needs: `/system` binary, `/vendor-config`
  file, sepolicy domain/type, `/system_ext` stub, linker namespace / `public.libraries.txt` entry.
- **(c) Fact-to-resolve.** ONE precise question whose answer is a knob or a confirmed root, + the prediction each
  answer implies + the action it unlocks. (This is the "directly solve for the facts" payload.)
- **(d) Runtime probe(s).** The exact `tools/observability/` script(s) + lever status (WORKS/CLOBBERED/DARK/
  FRIDA-ONLY) from `tables/lever-index.md`. The tree references the harness; it never re-implements probes.
- **(e) Dodge-vs-dirty diff.** (Primary for E-nodes.) Oracle artifact (path) vs our artifact (path) + the
  divergence verdict + what the *correct* (dodge) form is. Cross-links `DODGE-VS-DIRTY.md`.
- **(f) Symptom leaves.** Which of #1–#8 attach here, and as PROXIMATE-SITE vs ROOT (with the edge to the other).

## CHARACTERIZED rubric (when a node may be marked `characterization: CHARACTERIZED`)
Characterization is **observational** — no falsifier, no A/B, no intervention required. A node is `CHARACTERIZED`
when its (a) propagation contract is **seen**, not inferred:
- **Runtime (C/D) nodes:** every named carrier in (a) is OBSERVED entering/leaving the boundary at runtime —
  via observe-only frida, **un-clobbered CamX/CHI logs**, `dumpsys`, or a symbol scan of the live/built artifact.
  A contract that is only *predicted from docs* is `PARTIAL`, not `CHARACTERIZED`.
- **E (facilitation) nodes:** the dodge-oracle-vs-dirty structural map is complete for the artifact — what the
  correct (dodge) form is and where ours sits — recorded in section (e) / `DODGE-VS-DIRTY.md`.
- Carrying the un-observed gaps explicitly (which carriers are still DARK/CLOBBERED) keeps a node honest at
  `PARTIAL`; un-clobbering the relevant log lever is usually the cheapest path to `CHARACTERIZED`.

## CONVICTED contract (when a node may be marked `conviction: CONVICTED`)
A root claim reaches **CONVICTED** only when ALL five gates pass; short of that it takes a weaker conviction
status. (Renames the former `RESOLVED`/`CONFIRMED`.) Characterization is a *prerequisite mindset* but not a gate —
you can convict a poorly-characterized node and vice-versa; they are tracked separately.

| Gate | Requirement |
|------|-------------|
| **G-COND** | Measured under an IDENTICAL, recorded controlled condition (light · mode · preview-path), same replayed stimulus. HDR-family facts (#2/#3/#6) MUST use an HDR-triggering scene — idle indoor is insufficient. |
| **G-SYM**  | A symmetric A/B exists. *Runtime nodes:* OOS↔LOS — **deferred to the LOS phase** (this phase ⇒ `conviction: SUPPORTED` at best). *E nodes:* the "A/B" is **dodge-oracle vs our-dirty** — runnable NOW. |
| **G-REP**  | Reproduced N≥3, variance `stable` (same sign/value each run; self-kill runs discarded, not counted). |
| **G-FAL**  | Survived ≥1 explicit falsification experiment that tried to refute the attributed root. |
| **G-MECH** | The causal step is directly OBSERVED (syscall denied, JNI upcall absent, port count 0, dlopen fails, null-deref site) — not merely correlated. |

**Conviction statuses:** `CONVICTED` (all gates) · `SUPPORTED` (G-SYM+G-COND pass, G-MECH/G-FAL pending) ·
`CONFOUNDED` (compared non-identical conditions — e.g. #2 today) · `REFUTED` (a falsifier fired) · `BLOCKED`
(a prerequisite symptom wedges the capture — e.g. #5 behind #1; record the edge) · `OPEN` (no claim made yet —
the default when we are *characterizing*, not convicting). Every `CONVICTED` node carries a ledger line:
`condition | N_runs | OOS/stock_signal | LOS_or_oracle_signal | falsifier+result | mechanism_observed`.
