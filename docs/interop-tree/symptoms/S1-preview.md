<!-- Parent: ../INDEX.md -->
<!-- THIN symptom leaf: encodes the PATH only. Node content lives in the node files — do NOT duplicate it. -->

---
id: 1
symptom: "preview freeze (frame-1 stall)"
path_nodes: [D2, C6, D3]
decisive_probe: "probe_aec_hdrdetect.js force +0x48; perfetto working baseline (G4)"
characterization: PARTIAL   # some edges evidenced (D2→D3 bridge executes, #7 refuted) but full path not traced end-to-end; G4 baseline uncaptured
conviction: OPEN             # no root claim proven; A/B gated on the uncaptured G4 working baseline
updated: 2026-06-13
---

# S1 — preview freeze (frame-1 stall)

**Path:** `D2` (PROXIMATE SITE: APS engine holds preview frame 1) **→** `C6` / `D3` (ROOT candidates: the
buffer release gate / release contract). See `../data/D2-hal-fill-aps.md`, `../control/C6-aps-oemlayer.md`,
`../data/D3-imagereader-hwbuffer.md` — node content is NOT duplicated here.

- **Edge D2→C6:** the held frame-1 is a stall site (blob byte-identical OOS↔LOS, axiom ⇒ not the root); the
  root is the missing native `decMetaRefZeroToRemove` release-upcall cadence C6 must drive (C6 #1 denominator).
- **Edge D2→D3:** D3 confirmed the `getOplusHardwareBuffer` bridge executes with no AOSP fallback (#7 refuted),
  so the stall propagates *through* D3 from the unreleased buffer — D3 is a feed-site, not the root.
- **Decisive probe:** `probe_aec_hdrdetect.js` force `+0x48` (open the AEC HDR gate) + the perfetto working
  preview-delivery baseline (gap **G4**) — the freeze denominator that pins the working release cadence.
- **Independence:** doc-47 — #1 is independent of #2 (frame-1 stall is a release-gate fault, not the SHDR/no-JPEG path).
- **Verdict / status:** **characterization: PARTIAL · conviction: OPEN** — some path edges evidenced but not
  traced end-to-end; root not yet convicted; G4 working baseline uncaptured (gating the A/B).
