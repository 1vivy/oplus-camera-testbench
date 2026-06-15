<!-- Parent: ../INDEX.md -->
---
id: S3
symptom: "over-exposure (~5x) — HDR preview layer renders un-tonemapped"
path_nodes: [D4, E1, E2]
decisive_probe: "dumpsys SurfaceFlinger HDR caps + EDR-invocation trace (gap G6)"
characterization: PARTIAL    # path sketched D4→E1→E2 w/ named edges, but G-MECH (EDR-program absence at SF) unobserved — G6 DARK
conviction: OPEN              # E1 no-op stub + absent native EDR ABI is standing attribution, no decisive claim convicted
updated: 2026-06-13
---

# S3 — over-exposure (~5x)

THIN leaf — encodes the path; node content lives in the referenced files, not here.

- **D4** (`../data/D4-render-sf-edr.md`, PROXIMATE-SITE) — the on-screen `SurfaceView` shows the 10-bit
  BT2020_PQ/HLG layer at `desiredHdrSdrRatio=5` with no EDR tonemap applied; SF/libgui blobs are
  byte-identical OOS↔LOS, so this is a stall site, not the root (axiom).
- **edge D4→E1** (control-shapes-data: `C6.hdr_detected→D4 EDR`): the Java EDR program that D4 needs is
  driven through `com.oplus.view.OplusEdrUtils`, which our port supplies — pushing the root into facilitation.
- **E1** (`../facilitation/E1-stubs.md`, near-ROOT carrier) — `OplusEdrUtils` is a no-op stub
  (`getBlastSurfaceControl()→null`, `setEdr*→false`), so no tonemap is ever requested. Necessary-but-insufficient.
- **edge E1→E2** (true depth): the missing native EDR ABI — AOSP/LOS `libgui`/SurfaceFlinger does NOT export
  the OEM `Transaction::setEdr*` family the stub would bind to (E2 `../facilitation/E2-system-framework.md`,
  doc-46 Tier-1b); E2 confirms #3 is rooted at E1/display-HAL, NOT at E2's patches.
- **co-factor (D4):** display-HAL/HWComposer must advertise HLG/PQ for any tonemap to engage.

**Decisive probe:** `dumpsys SurfaceFlinger` HDR caps (panel HLG/PQ advertisement) + EDR-invocation trace —
does SF ever receive a `setExtendedRangeBrightness`/`setEdr*` program. Lever **G6 is DARK** (needs eng build).

**Verdict / status:** characterization PARTIAL, conviction OPEN — E1 no-op stub + absent native EDR ABI is the
standing attribution; G-MECH (observed EDR-program absence at the SF boundary) pending G6, so not yet SUPPORTED/CONVICTED.
