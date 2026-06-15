<!-- Parent: ../INDEX.md -->
<!-- THIN symptom leaf: encodes the PATH (crash-site → root) + edge + decisive probe. References node files; does NOT duplicate node content. -->

---
id: S4
symptom: "copyMetadata UAF (back-to-back)"
path_nodes: [D2, C3, C4]
decisive_probe: "ab_capture burst + debug/parse_tombstone.py"
characterization: PARTIAL   # D2 crash-site observed (copyMetadata+60 PC, UAF reproduced), but D2→C3/C4 edge not traced end-to-end
conviction: OPEN            # lifetime owner (C3 vs C4) not yet attributed; no root claim asserted
updated: 2026-06-13
---

# S4 — copyMetadata UAF (back-to-back)

**Path:** `D2` (proximate crash-site) → `C3`/`C4` (root).

- **D2 — PROXIMATE-SITE** ([../data/D2-hal-fill-aps.md](../data/D2-hal-fill-aps.md)): SIGSEGV at `APSMetadata::copyMetadata+60` reads a result-metadata buffer already freed; back-to-back captures collapse the window. D2 is byte-identical OOS↔LOS, so per the trunk axiom it is a site, not the root.
- **edge D2→C3/C4:** the freed buffer's *lifetime* is owned upstream — copyMetadata only dereferences what the result path handed it.
- **C3/C4 — ROOT (result lifetime)** ([../control/C3-cameraserver-extimpl.md](../control/C3-cameraserver-extimpl.md), [../control/C4-hal-provider.md](../control/C4-hal-provider.md)): which side (cameraserver/ExtImpl result dispatch vs HAL provider result-metadata publish) releases/reuses the metadata before D2 consumes it.
- **Decisive probe:** `ab_capture burst` to force the back-to-back race + `debug/parse_tombstone.py` to confirm the `copyMetadata+60` fault PC and the freed-allocation owner.
- **Verdict/status:** characterization PARTIAL, conviction OPEN — UAF reproduced at the D2 site; the lifetime owner (C3 vs C4) is not yet attributed. G-MECH (observe the free/use ordering) pending.
