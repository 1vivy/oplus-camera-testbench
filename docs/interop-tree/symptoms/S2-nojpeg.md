<!-- Parent: ../INDEX.md -->
<!-- THIN symptom leaf: encodes the PATH (crash-site → root) + edge, references node files, names the decisive probe + verdict. Do NOT duplicate node body content. -->
---
id: S2
symptom: "no-JPEG / hdr_detected rc=-2"
path: [C5, E3, C4]
decisive_probe: "light-sweep dump_camxsettings.js + probe_aec_hdrdetect.js (de-confound)"
characterization: PARTIAL   # C5 site observed (selectSHDRAutoExposureUsecase=0 at idle); E3/C4 root edges not yet traced end-to-end
conviction: CONFOUNDED      # rc=-2 read at idle (non-HDR) vs the gate's intended HDR trigger — non-identical condition
updated: 2026-06-13
---

# S2 — no-JPEG / hdr_detected rc=-2

**Path:** `C5` (SHDR gate, PROXIMATE-SITE) → `E3` (`camxoverridesettings`) / `C4` (OEM tag publish) — ROOT candidates.

- **Crash/stall site — [C5](../nodes/C5.md):** SHDR usecase gate never arms; `selectSHDRAutoExposureUsecase=0` observed at idle, so AEC `hdr_detected` returns `rc=-2` and no JPEG is produced. C5 is byte-identical OOS↔LOS ⇒ per trunk axiom it is a SITE, not the root.
- **Edge C5→E3:** the gate is fed by the `camxoverridesettings` we ship (toggle/config facilitation). If our override file diverges from the dodge oracle, the SHDR usecase is never selectable — root sits in [E3](../nodes/E3.md).
- **Edge C5→C4:** alternatively the SHDR/HDR-detect path depends on an OEM vendor-tag that [C4](../nodes/C4.md) (`vendor.qti.camera.provider`) must publish; an unpublished tag also pins the gate at 0.
- **Decisive probe (de-confound):** light-sweep `dump_camxsettings.js` + `probe_aec_hdrdetect.js` — sweep idle→HDR-triggering scene to see whether stock flips `selectSHDRAutoExposureUsecase` 0→1 only under HDR. Idle-indoor capture fails **G-COND** for HDR-family facts.
- **Verdict / conviction:** `CONFOUNDED` — current `rc=-2` was read at idle (non-HDR), a non-identical condition vs the gate's intended HDR trigger. Resolve E3 (override diff vs oracle) and re-run the light sweep before attributing the root.
