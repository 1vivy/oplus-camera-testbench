<!-- Parent: ../INDEX.md -->
<!-- THIN symptom leaf: encodes the PATH (crash-site → root) + edge + decisive probe. Node content lives in the node files; do NOT duplicate it. -->

---
id: S6
symptom: "strlen-null TurboHDR"
path_nodes: [C4, C5, E3]
decisive_probe: observe_getmetadata.js
characterization: PARTIAL   # path proposed + statically reasoned; decisive probe FRIDA-ONLY, not yet run — edges unobserved end-to-end
conviction: OPEN             # root claim (E3/C4) asserted but no decisive A/B; inherits C4 OPEN / C5 CONFOUNDED / E3 SUPPORTED
updated: 2026-06-13
---

# S6 — strlen-null TurboHDR

**Path:** `C4/C5` (../control/C4-hal-provider.md · ../control/C5-camx-chi-feature2.md) **—edge→** `E3` (../facilitation/E3-toggles-config.md).
Crash/stall SITE is the OEM IPE **TurboHDR vendor-tag (`~0x4d78`)** never published → `parseTurboHdrInfo` skip → null `field_0x4d88` → `strlen(NULL)` SIGSEGV at `setProcessOtherParams+140` (`0x1441ad4`) dereferencing `field_0x4d88` (`ldr x23,[x0,#0x4d88]`, encoding `f966c417`). C4 is the ROOT-bearing publish site, C5 the SHDR/HDR gate proximate; per the axiom the ROOT is the configure-time **HDR session-state class** at E3 (`camxoverridesettings.txt` / dynamic in-session set), not a provider/`libapsfixup` blob edit (the `strlen` null-guard is interim crash-safe defense only).

**Sibling of S2** (no-JPEG / `hdr_detected` rc=-2): same `camxoverridesettings` session-state class (doc-42 Family III ≡ #2). If the SHDR config that resolves S2 also publishes the TurboHDR tag, ROOT is E3; else ROOT migrates to C4 tag-publish — see each node's (f).

**Decisive probe:** `tools/frida/observe_getmetadata.js` (FRIDA-ONLY) — observe **HDR-scene** TurboHDR-tag presence at the publish site (idle indoor insufficient per G-COND; HDR-family fact). Predicts: tag present on stock-HDR ⇒ confirms unpublished-on-LOS root.

**Characterization / conviction:** PARTIAL / OPEN, confidence low. Inherits C4 (OPEN) / C5 (CONFOUNDED) / E3 (SUPPORTED). G-COND/G-SYM unmet — no HDR-scene stock capture of the TurboHDR tag yet; A/B vs LOS deferred to LOS phase. Path to SUPPORTED: run `observe_getmetadata.js` in an HDR scene, confirm tag publish on stock.
