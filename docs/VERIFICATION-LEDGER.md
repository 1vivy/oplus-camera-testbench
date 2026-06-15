<!-- Parent: ./INDEX.md -->
<!-- STATUS: VERIFIED — this ledger is generated from the STATUS headers of all docs under docs/ and
     los-impl/ that carry a STATUS comment. It is regenerated each inference-surgery pass.
     Guard (interop-tree SCHEMA trunk axiom): a measured crash/stall SITE is never a verified ROOT;
     evidence anchors OBSERVATIONS, never root/subsystem/divergence-layer attribution. -->

# VERIFICATION LEDGER

> **Purpose.** This is the index agents use to know which docs are authoritative-observation vs
> heavy-check-inference, per the interop-tree trunk axiom: a measured crash/stall SITE is never a
> verified ROOT. `VERIFIED` bodies are safe to quote as evidence. `MIXED` bodies have a VERIFIED
> sub-section and an `## Inferences & Open (UNVERIFIED — heavy-check)` section; only the former is
> quotable as fact. `PLAN` docs are forward specification — nothing in them is a measured outcome.

Last updated: 2026-06-14 (Pass-C inference-surgery).

---

## docs/rearch/ — investigation session logs

| Doc | Classification | Has Inferences section? | What moved to Inferences (1-line) | Evidence class of verified body |
|-----|---------------|------------------------|-----------------------------------|---------------------------------|
| **35-8k-hdrpreview-longexposure-plumbing.md** | MIXED | Yes | All root/locus attributions, "most-likely" and candidate-fix claims, forward plans | On-artifact observations: trace lines, smali offsets, log entries, file reads |
| **38-camera-module-architecture-v18.md** | VERIFIED | No | n/a — no inference-surgery needed | RE/capture: Ghidra offsets, binary layout, module structure |
| **40-preview-freeze-investigation-edr-plumb.md** | MIXED | Yes | All root/locus attributions + candidate OplusEdrUtils EDR fix | On-device observations only: thread-dump SITES, EDR code path traces, SF dumpsys reads |
| **41-state-map-v19-preview-freeze-hdr.md** | MIXED | Yes | Freeze locus attribution, §3 "root pinned" over-exposure label, CANDIDATE FIX body, §6 next-session plan; "single root of BOTH" hypothesis | On-device measurements: thread states, EDR code-path traces, SF dumpsys, RULED-OUT A/B table |
| **42-retiring-libapsfixup-the-oos-way.md** | MIXED | Yes | Root attributions, retirement-path recommendations, "leading mechanism" hypotheses, forward probes | On-artifact observations: blob reads, Ghidra offsets, on-device probes, byte-identity checks, log lines |
| **43-preview-freeze-elimination-matrix.md** | MIXED | Yes | ROOT LOCALIZED attribution; FIX CANDIDATES list; FREEZE MECHANISM candidate block (formerly "ROOT FULLY GROUNDED" — partially superseded by FIX #2 REFUTED; see REFUTED-LOG R-08) | On-device A/B evidence: elimination matrix verdicts, ADDENDUM eliminations, ALOG native clues, FIX #2 REFUTED on-device |
| **44-libalgoprocess-preview-engine-re.md** | VERIFIED | No (UPDATE 8 is inline correction) | UPDATE 5 "This IS the root" subheading retitled superseded inline; corrected by UPDATE 6 + UPDATE 8 in body | RE/capture: Ghidra decompile, frida hook specs, Java SDK dex traces, on-device chain RE |
| **45-aec-hdr-detect-publication-gate.md** | MIXED | Yes | "+0x48 is the lever" (refuted); PROBE-S7 PRODUCER (refuted); Fix-locus conclusion (ADDENDUM); "gap is result-PUBLISH" localization (open); ROOT-A FIX DRAFT (candidate — lever confirmed, exact key set pending) | On-device probes: HDRDetectProcess 954×, +0x48==1 every frame, rc=-2 observed, force-test rc=0+GCVT 120, DUMP RESULT; Ghidra decompile facts |
| **46-cleanroom-topology-matrix.md** | VERIFIED | No (self-labelled unproven rows inline) | n/a — matrix rows carry STATUS flags; one Addendum A mechanistic inference flagged in STATUS comment | RE/capture: topology matrix with per-row STATUS (✅/◐/✗), Ghidra-derived |
| **47-root-cause-correction-two-gates.md** | VERIFIED | No | n/a — body correctly distinguishes observation from attribution via Confidence column and explicit "unconfirmed/plausible" qualifiers | Material log evidence: v19 session logs quoted verbatim (ocslog, freeze_verbose); per-symptom verdict table with confidence ratings |
| **48-media-camera-oem-transaction-receiver.md** | VERIFIED | No | n/a — no inference-surgery needed | RE/capture: Ghidra/device capture |
| **49-libgui-edr-abi-re.md** | VERIFIED | No | n/a — no inference-surgery needed | RE/capture: Ghidra/device capture |
| **50-probe-persistence-and-anchoring.md** | VERIFIED | No | n/a — no inference-surgery needed | RE/capture: Ghidra/device capture |

---

## docs/facilitation/ — F-plane facilitation nodes

| Doc | Classification | Has Inferences section? | What moved to Inferences (1-line) | Evidence class of verified body |
|-----|---------------|------------------------|-----------------------------------|---------------------------------|
| **F1-stubs.md** | MIXED | Yes | Optimal-form verdicts, R3/R7 forward fix specifications, root attributions for #3 | Host symbol scan (189 classes, dex strings), placement-break falsifier, dodge proof-of-form class shapes, built-stub dex-confirmed |
| **F2-system-framework.md** | MIXED | Yes | All mechanism attributions (apply-state convicted, root unproven), optimal-form verdicts (design judgment), all symptom→root assignments (ROOT-CANDIDATE prefix added to body lines) | Host symbol scans: built cameraserver + libandroid_runtime; sha256-diff of patch files; apply-state observations (0 ext call sites, libcsextimpl.so absent) |
| **F3-toggles-config.md** | MIXED | Yes | Optimal-form mechanism verdicts, R5/R6 session-typing root attributions, forward fix specifications | Config A/B on host (md5 diffs, grep-verified carrier counts); R5 publish OBSERVED on stock N=3; X1 SHDR knob reads 0 in-scene N=3 |
| **F4-sepolicy-namespace.md** | MIXED | Yes | Re-homing #5 at D1 (inferred); Family-II/III retirement chains (inferred, deferred); Family-I irreducibility claim (supported, one open item) | Static dodge A/B on stock: grep-verified counts, md5-verified .te files, REFUTED falsifier for X4, lock geometry observed contiguous |
| **BUILD-ORDER.md** | PLAN | No | Entire doc is forward specification | n/a — dependency edges and interlock invariants are design spec, not measured outcomes |
| **DODGE-ORACLE.md** | PLAN | No | Entire doc is forward plan and design judgment | Oracle facts (sha256, grep counts) are evidence-anchored; all "our action" / "adopt/improve" conclusions are forward plan |
| **INDEX.md** (facilitation) | PLAN | No | Entire doc is requirements-to-status board (forward attribution) | Verified-observation core lives in each F-node's VERIFIED section |

---

## docs/interop-tree/ — trunk, schema, and companion ledgers

| Doc | Classification | Has Inferences section? | What moved to Inferences (1-line) | Evidence class of verified body |
|-----|---------------|------------------------|-----------------------------------|---------------------------------|
| **INDEX.md** | VERIFIED | No | n/a — axiom-anchored foundation; Port-strategy stale SHDR knob ref fixed (Pass-C: "DO NOT author") | Evidence/axiom-anchored: symptom→path map, status dashboard, traversal order |
| **SCHEMA.md** | VERIFIED | No | n/a — foundation/axiom doc | Axiom-anchored: two-axis status model definition |
| **REQUIREMENTS.md** | VERIFIED | No | n/a — foundation doc | Evidence/axiom-anchored: distilled root items with conviction tags |
| **REFUTED-LOG.md** | VERIFIED | No | n/a — dead-end ledger | Evidence-anchored: each entry keyed to node ids with on-device/oracle evidence |
| **DIRTY-NOTES-EXAM.md** | MIXED | Yes (sub-section structure) | Root/subsystem attributions, causal claims, forward plans, "questionable/live-open" items | On-device measurements, build-id checks, static analyses, on-tree cross-refs (in "### Established" blocks per symptom) |
| **DODGE-VS-DIRTY.md** | MIXED | Yes ("Priority root candidates" section) | Root attributions and conviction claims (inferred from static observations) | Consolidated divergence table: per-artifact static comparisons (file hash/diff checks, host grep, nm-DC symbol scans, on-device public.libraries inspection) |
| **POST-PROCESSING-CONTRACT.md** | MIXED | Yes | Root-retirement verdicts, LOS-deferred A/B items, "shrink" action plans | OOS V16.1.0 stock captures N=3 ALL-STABLE; shim decomposition = static source analysis |
| **OOS-OPEN-ITEMS-AND-DIFF-PLAN.md** | PLAN | No (verified facts sub-section) | Entire doc is forward execution plan; measured facts extracted into "VERIFIED — measured facts cited in this plan" sub-section | Probe designs, expected OOS values, rule-out matrices, harness specifications are PLAN |

---

## docs/ — top-level reference docs

| Doc | Classification | Has Inferences section? | What moved to Inferences (1-line) | Evidence class of verified body |
|-----|---------------|------------------------|-----------------------------------|---------------------------------|
| **OOS-BASELINE-V16.1.0.md** | VERIFIED | No | n/a — no inference-surgery needed | Ghidra/device capture: baseline characterization |
| **REFERENCE_DECISIONS.md** | VERIFIED | No | n/a — no inference-surgery needed | Ghidra/device capture: decision record |

---

## docs/re-notes/ — per-component RE notes

All re-notes docs carry `STATUS: VERIFIED — evidence-anchored (Ghidra/device capture); no inference-surgery needed (doc-50 method)`. None require an Inferences section. Evidence class = Ghidra decompile + device capture for all.

| Doc | Classification | Notes |
|-----|---------------|-------|
| aec-hdrdetect-publish-RE.md | VERIFIED | Ghidra/device: AEC gate offsets, probe results |
| apsclient-bridge-RE.md | VERIFIED | Ghidra/device: APSClient bridge chain |
| apsclient-onTransact-routing-RE.md | VERIFIED | Ghidra/device: onTransact routing offsets |
| camx-loginfo-layout-and-groups.md | VERIFIED | Ghidra/device: CamX log layout |
| camx-logmask-gate-FINDINGS.md | VERIFIED | Ghidra/device: logmask gate RE |
| camxcore-characterization-v16.1.0.md | VERIFIED | Ghidra/device: CamX core characterization |
| decmetarefzero-upcall-RE.md | VERIFIED | Ghidra/device: decMetaRefZeroToRemove upcall chain |
| edr-sf-readside-RE.md | VERIFIED | Ghidra/device: SF EDR read-side ABI |
| gralloc-p010-chain-RE.md | VERIFIED | Ghidra/device: P010 gralloc chain |
| libapsfixup-interposition-RE.md | VERIFIED | Ghidra/device: libapsfixup interposer analysis |
| oem-binder-ontransact-RE.md | VERIFIED | Ghidra/device: OEM binder onTransact RE |

---

## los-impl/ — LOS implementation docs

| Doc | Classification | Has Inferences section? | What moved to Inferences (1-line) | Evidence class of verified body |
|-----|---------------|------------------------|-----------------------------------|---------------------------------|
| **E0-EDR-HARVEST.md** | MIXED | Yes | Root/mechanism attributions for EDR chain | Directly observed on-stock facts: logcat captures, dumpsys reads, frida probe output |
| **PHASE-D-CORRECTIONS.md** | MIXED | Yes | Root attributions, fix-form verdicts, forward build specifications | Directly observed facts from build/flash/runtime sessions |
| **IMPLEMENTATION-PLAN.md** | PLAN | No | Entire doc is forward bringup specification | Per-requirement edit specs are PLAN; verified-facts table cites F-node VERIFIED sections |
| **R2-apply-manifest.md** | PLAN | No | Entire doc is a fix-landing manifest (forward specification) | n/a |

---

## How to use this ledger

1. **Quoting evidence:** only quote from `VERIFIED` bodies or the VERIFIED sub-sections of `MIXED` docs. Never quote from `## Inferences & Open` sections or `PLAN` docs as established fact.
2. **Root attribution:** per the trunk axiom, no body in this tree carries a verified root — only measured SITES. Root claims are always in Inferences sections (MIXED) or absent (VERIFIED). Treat any `ROOT-CANDIDATE` label as requiring an OOS↔LOS A/B before acting on it.
3. **Fix decisions:** consult the F-plane nodes (F1–F4) for optimal-form verdicts — but those verdicts are in their Inferences sections. The VERIFIED bodies of F-nodes supply the apply-state and characterization facts that *support* those verdicts.
4. **Ledger maintenance:** regenerate this file after each inference-surgery pass by scanning for `<!-- STATUS:` headers across `docs/` and `los-impl/`.
