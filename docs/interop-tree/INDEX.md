<!-- STATUS: VERIFIED — interop-tree foundation; evidence/axiom-anchored (doc-50 method). -->
<!-- Parent: ../../AGENTS.md -->

# Oplus Camera Interop Tree — INDEX (the trunk)

**Read first.** This maps how the Oplus camera stack interoperates on a custom ROM, so we can determine the
**root** of each symptom and the **knobs the stack needs to propagate correct settings/metadata/buffers
downstream** — replacing "dump and infer" with an evidence-backed tree. Node template + FACT contract: `SCHEMA.md`.

## Axiom
> A byte-identical-OOS↔LOS blob that misbehaves is a crash/stall **site**, never the **root**. The root is a
> broken **propagation contract** in the blob's environment: `/system`, `/vendor-config`, or **our facilitation**
> (stubs / framework edits / toggles / sepolicy-namespace). `libapsfixup`/P010 is ONE leaf, not the focus.

## Port strategy (decided 2026-06-13)
The infiniti port will be **rebased on the dodge reference** — overlay dodge's facilitation (stubs / framework
patches / toggles / sepolicy) onto infiniti as the BASE, then add only infiniti-specific deltas (extra
features/prereqs) on top. So dodge is the **foundation**, not just the oracle. This retires the "audit our
ad-hoc divergences" framing: the facilitation plane's job is now **(1)** what dodge provides (the base contract,
already mapped in `DODGE-VS-DIRTY.md`) and **(2)** the infiniti deltas to carry on top — which are exactly the
rows flagged "intentional / correct / do-NOT-revert" in `DODGE-VS-DIRTY.md` (E3 privapp stub-plumbing, E4
`hal_camera_client`/Treble-clean sepolicy, the HDR/EDR props, the SHDR `camxoverridesettings` knob (retired — X1 DOWNGRADED per F3; DO NOT author the knob, it is a red herring)).
We do NOT chase *why* a given dirty edit diverged (e.g. the unapplied av/0001 patch) — the rebase makes dodge's
applied state the source of truth. The runtime stock-characterization campaign (C/D denominator, #2 de-confound,
freeze baseline) is unaffected and still needed.

## The three planes
```
CONTROL (settings/params/vendor-tags ↓)        DATA (buffers/metadata ↓)
  C1 app / OCS SDK                               D1 gralloc / mapper / CamxFormatUtil (P010)
  C2 framework camera2 / JNI                     D2 HAL-fill / APS-process
  C3 cameraserver + OEM CameraServiceExtImpl     D3 ImageReader / getOplusHardwareBuffer JNI
  C4 HAL provider (vendor.qti.camera.provider)   D4 app-render / SurfaceFlinger / EDR / display-HAL
  C5 CamX / CHI / feature2
  C6 APS / libAlgoProcess / camera.oemlayer

FACILITATION (what OUR PORT provides — root-determined by the dodge oracle)
  E1 stubs (oplus-camera-stubs / oplus-fwk)         E3 toggles / config (camxoverridesettings, props, overlays, vintf)
  E2 /system framework edits (av / base / native)   E4 sepolicy + linker namespace (public.libraries, ld.config, .te)

cross-edges (control shapes data): C5→D2 (fusion) · C3.beforeConfigureStreamsLocked→D1/D2 (8K) · C6.hdr_detected→D4 (EDR)
facilitation roots feed the planes: E1→C1/C2/C3 · E2→C2/C3/D3/D4 · E3→C4/C5 · E4→D1/C4
```

## Traversal order (top-down + ROI)
1. **C3 / configure_streams** (control-plane root; origin of #2/#6/#8) ∥ **E1 stub-model diff** ∥ **E2 framework-apply check** (host-only, start immediately).
2. **C5 / C4 + E3 toggle diff** — **characterize** the SHDR plumbing: un-clobber CamX/CHI logs + observe-only
   `dump_camxsettings` in an HDR scene to RECORD how `selectSHDRAutoExposureUsecase`/`hdr_detected` are plumbed
   (→ `CHARACTERIZED`). We do NOT try to convict the knob — conviction stays `CONFOUNDED` (confidence in it as the
   root is low; the lighting-confounded A/B is retired, not re-run).
3. **D1 + E4 namespace diff** — the P010/`libapsfixup` root, now testable against the oracle (`libcamxexternalformatutils` exposure).
4. **C6 → D2/D3/D4** — working-preview baseline (the G4 freeze denominator).
5. **C1 / C2** — control entry.

## Status model — two orthogonal axes (see `SCHEMA.md`)
Each node carries TWO independent front-matter fields, because "do we understand the wire?" and "have we proven a
root?" are different questions:
- **`characterization`** `UNCHARACTERIZED → PARTIAL → CHARACTERIZED` — how completely the node's propagation
  contract is **OBSERVED** (the plumbing). Earned by *observation* — observe-only frida, **un-clobbered CamX/CHI
  logs**, `dumpsys`, symbol scans; for E-nodes, the dodge-oracle map. **This is the primary axis this phase.**
- **`conviction`** `OPEN → SUPPORTED → CONFOUNDED → CONVICTED → REFUTED → BLOCKED` — status of a *causal root claim*.
  Convicting is *intervention*; for runtime C/D nodes it is **LOS-deferred** (ends `OPEN`/`SUPPORTED`). E-nodes can
  reach `CONVICTED` now (their A/B is the dodge oracle). `CONVICTED` renames the old `RESOLVED`/`CONFIRMED`.

The honest stock-only target is **`CHARACTERIZED` / `OPEN`** for most C/D nodes (wire mapped, root deferred) and
**`CHARACTERIZED` / `CONVICTED`** for E-nodes. We do NOT force a node toward `CONVICTED` by intervention when the
goal is to *record how it is plumbed* — characterize it (observe), leave conviction `OPEN`.

## Status dashboard (read from each node's front-matter; regenerate as nodes update)
| Node | Plane | char | conviction | conf | New characterization value (refreshed 2026-06-14) → REQUIREMENTS row |
|------|-------|------|-----------|------|------------------|
| C1 app/OCS SDK | control | PARTIAL | SUPPORTED | med | INTENT-down OBSERVED (`preview.hdr.enable=true`→CamX `81140168`, 6/6); consume-up `getOplusHardwareBuffer` bridge DARK, only signal = stable `CameraMetadataNativeWrapper` CNFE at `APSClient.transact` → **R7** |
| C2 fwk camera2/JNI | control | PARTIAL | OPEN | low | session-config relay OBSERVED end-to-end (`createStream→endConfigure→configureStreams`, N=3); `getOplusHardwareBuffer` upcall DARK (in-process JNI) → **X3** (#7 bridge present, base/0001 effective) |
| C3 cameraserver/ExtImpl | control | CHARACTERIZED | SUPPORTED | med | configure_streams contract OBSERVED: photo 0x8001/3-stream + 8K 0x8001/9-stream + 0x80a9/5-stream EIS, 3/3; G5 dropped 2/12; ExtImpl exports RE-mapped → **R2/R4** |
| C4 HAL provider | control | CHARACTERIZED | OPEN | high | `hdr_detected 0x80be000b` publish OBSERVED end-to-end on daytime HDR (`OplusPublishCameraMetadata HDRDetected:1`, gate `+0x48=1`×2294, N=3); TurboHDR `~0x4d78` still DARK → **R5 / R6** |
| C5 CamX/CHI/feature2 | control | CHARACTERIZED | **CONFOUNDED** | med | contract OBSERVED end-to-end on HDR scene; `selectSHDRAutoExposureUsecase(+0x6a28)=0` even in-scene (red herring); stock HDR = HDRMode/DCG+fusion; `hdr_detected` publish present+stable → **X1 / R5** |
| C6 APS/oemlayer | control | PARTIAL | OPEN | low | G4 result-delivery denominator OBSERVED (~30 fps/stream, 69.5/s logical-4); the `decMetaRefZeroToRemove` decref upcall event itself STILL DARK app-side → **R1** |
| D1 gralloc/CamxFormatUtil | data | PARTIAL | BLOCKED | low | libui lock OBSERVED contiguous (`Cr−Y = stride×1472`, 32-row align); blob `camApsBufferLockPlanes` ret=0x0 ×20; `getPlaneLayout` garbage-classifier DARK; #5 root→D1 lock-math → **X4** |
| D2 HAL-fill/APS | data | PARTIAL | BLOCKED | low | #4 copyMetadata CLEAN under back-to-back (UAF=False ×9, no tombstone); named carriers DARK (getMetadata frida missed launch); G4 denominator wedges #1 → **R1 (feeds), X3-adjacent** |
| D3 ImageReader/HwBuffer | data | PARTIAL | SUPPORTED | med | bridge present+effective (fallback log ABSENT N=3) + parked `previewManagerRoutine+1560` victim OBSERVED (BuildID `82fe443b`); Java enter/leave carriers DARK → **R1 / X3** |
| D4 render/SF/EDR | data | PARTIAL | OPEN | med | std `setExtendedRangeBrightness` EDR program OBSERVED on stock (BT2020_HLG, desiredRatio=5.0, `supportedHdrTypes=SYSTEM`); OEM `setEdr*`/`OplusEdrViewTransform` curve DARK at wire → **R3** |
| E1 stubs | facilitation | CHARACTERIZED | SUPPORTED | med | EDR-invocation trace (G6) DARK — needs eng build to convict the no-op stub + missing native-EDR-ABI depth |
| E2 /system fwk edits | facilitation | CHARACTERIZED | **CONVICTED** | high | av/0001 ext factory NOT applied (G5 layer absent → #8/#4); base/0001 JNI bridge applied+effective (#7 refuted) |
| E3 toggles/config | facilitation | CHARACTERIZED | SUPPORTED | med | G3 stock `dump_camxsettings.js` to read SHDR `+0x6a28`/`+0x6a18`; confirm shipping the key flips #2 rc=−2→0 |
| E4 sepolicy/namespace | facilitation | CHARACTERIZED | **REFUTED** | high | namespace theory refuted by oracle; residual G5 runtime confirm; #5 re-homed at D1 (consumer-side lock-math) |

## Symptom → path map (each symptom is a branch: crash-site → … → **OUT to its facilitation root**)
> Paths now terminate at the **facilitation root** — the **F-plane node** under `../facilitation/F*` (the
> Phase-2 migration target). The F-nodes ARE the migrated E1–E4 (forward spec); the E-node files remain as the
> diff-era source. The arrow points OUT from the crash/stall SITE to the facilitation contract the port must set.
> The **must-set root item** column cites the REQUIREMENTS.md row; the F-node that owns it is named inline
> (E-alias kept in parens for provenance). DOWNGRADED branches are tagged so no session re-chases them.

| # | Symptom | Path (crash/stall SITE → **OUT to facilitation root**) | Must-set root (REQUIREMENTS) | Decisive probe / oracle |
|---|---------|--------------------------------------------------------|------------------------------|-------------------------|
| 1 | preview freeze (frame-1 stall) | D2/D3 (APS holds frame 1; `previewManagerRoutine` parked) → C6/D2 release gate → **OUT to [F2](../facilitation/F2-system-framework.md)** (E2-alias; `decMetaRefZeroToRemove` release bridge, /system frameworks/base) | **R1** (per-frame decref upcall must fire; G4 = ~30 fps/stream) | G4 working baseline (`reference/captures/camxcore-clean/`); `probe_aec_hdrdetect.js` ⇒ Gate-B is separate (X2) |
| 2 | no-JPEG / hdr_detected publication | C5 SHDR gate (PROXIMATE) → C4 publish SITE → **OUT to [F3](../facilitation/F3-toggles-config.md)** (E3-alias; session-state HDR typing — odm CamX session-typing, NOT a knob file) | **R5** (publish `0x80be000b` in-scene). **DOWNGRADED:** `selectSHDRAutoExposureUsecase` is a red herring (**X1**) | un-clobber CHI/CamX-core logs + observe-only `dump_camxsettings.js` in an HDR scene; `OplusPublishCameraMetadata` |
| 3 | over-exposure (~5×) | D4 (un-tonemapped BT2020-HLG SurfaceView) → **OUT to [F2](../facilitation/F2-system-framework.md)** (E2-alias; libgui/SF OEM-EDR ABI) + **[F1](../facilitation/F1-stubs.md)** (E1-alias; `OplusEdrUtils` no-op stub precondition) + display-HAL co-factor | **R3** (port the `setEdrViewTransform` 4×4 curve write+read; std-ratio alone insufficient) | std EDR OBSERVED on stock (logcat + `dumpsys`); OEM `setEdr*` wire values DARK (`trace_edr_invocation`) |
| 4 | copyMetadata UAF (back-to-back) | D2 (`APSMetadata::copyMetadata+60` SITE) → C3/C4 result lifetime → **OUT to [F2](../facilitation/F2-system-framework.md)** (E2-alias; ROOT = R1 release upcall; av/0001 ext result-lifetime surface) | **R1** (root: release upcall retires #4) ‖ **R2** (ext result-lifetime surface) — clean on stock (UAF=False ×9); LOS A/B deferred | `ab_capture burst` + `parse_tombstone.py`; masked by libapsfixup Family-II (retire via R1) |
| 5 | P010 / IMapper@4.0 NULL | D1 (non-contig P010 lock SITE) → **D1 consumer-side lock-math** ([F4](../facilitation/F4-sepolicy-namespace.md) namespace **REFUTED**, E4-alias) | **X4** (DOWNGRADED — F4 namespace theory refuted by dodge oracle; re-homed at D1) | r3-gralloc + `grep "Failed to link CamxFormatUtil"`; BLOCKED behind #1 freeze |
| 6 | strlen-null TurboHDR | C4/C5 (OEM TurboHDR tag `~0x4d78` unpublished SITE) → **OUT to [F3](../facilitation/F3-toggles-config.md)** (E3-alias; same HDR-session-state class as #2) + [F4](../facilitation/F4-sepolicy-namespace.md) (retires Family-III) | **R6** (publish TurboHDR tag in-scene) — carrier DARK (RE-inferred) | `observe_getmetadata.js` HDR-scene tag presence (app-side probe must load `libAlgoProcess`) |
| 7 | getOplusHardwareBuffer fallback | D3 (PROXIMATE) → **[F2](../facilitation/F2-system-framework.md) base/0001 bridge** (E2-alias) — bridge PRESENT+effective on stock | **X3** (DOWNGRADED — #7 "AOSP-fallback" REFUTED; fallback log ABSENT N=3, bridge `9d03af1` effective) | `probe_getoplushwbuffer.js` + symbol scan; root, if any, is the R1 release upcall downstream |
| 8 | 8K configure_streams −38 | C5/feature2 (EISv2 2-in/0-out NULL pipeline SITE) → C3 Depth-2 → **OUT to [F2](../facilitation/F2-system-framework.md)** (E2-alias; `beforeConfigureStreamsLocked` + `getExtensionOperatingMode`) ‖ co-root **D1** Gralloc5 usage | **R4** (bind the 0x80a9/5-stream 7680×4320 EIS pair) — gated behind R2 | r4-oem-transact + `hook_configure_streams.js` (8K vs 4K) |

## Companion ledgers
- `../facilitation/INDEX.md` — **the requirements→facilitation STATUS BOARD** (Phase-2 forward spec): each
  REQUIREMENTS row → owning F-node → optimal-LOS-form verdict (author-new / port-ABI / adopt / keep / retire) →
  status. Forward companions: `../facilitation/DODGE-ORACLE.md`, `../facilitation/BUILD-ORDER.md`.
- `REQUIREMENTS.md` — the distilled **root items that must be set** for correct downstream behaviour (LOAD-BEARING
  R1–R7 + DOWNGRADED X1–X4), each row tagged with CURRENT relevancy + owning facilitation node (F1/F2/F3/F4,
  E-alias for provenance).
- `DODGE-VS-DIRTY.md` — the oracle divergence ledger (per facilitation artifact: ref path | our path | verdict).
- `REFUTED-LOG.md` — dead ends keyed to node ids, so no node re-opens a refuted branch.
- `DIRTY-NOTES-EXAM.md` — the dirty-corpus↔clean-tree consensus reconciliation (S1–S8 + cross).

> **Facilitation naming (Phase-2 E→F migration, 2026-06-14):** the forward facilitation roots are now the
> **F-plane nodes F1/F2/F3/F4** under `../facilitation/` (with `../facilitation/INDEX.md` as the
> requirements→facilitation status board). The F-nodes ARE the migrated E1–E4, re-scoped from a *dodge-vs-dirty
> DIFF* to *requirements → mechanism → optimal-LOS-form*. The **E-node files** (`./facilitation/E1..E4.md`)
> remain as the **diff-era source**; the **F-nodes are the forward spec**. The symptom→path map above points OUT
> to F1/F2/F3/F4 (E-alias kept in parens for provenance). New companions in the F-plane: `../facilitation/DODGE-ORACLE.md`
> (dodge as proof-of-form) and `../facilitation/BUILD-ORDER.md` (build + runtime contract).

> **Scope (this phase):** stock-only. The deliverable is **characterization** — observe each node's plumbing
> (observe-only frida + un-clobbered CamX/CHI logs + the dodge oracle) so the tree becomes the **expected-behaviour
> reference** every later capture is scored against. Most runtime C/D nodes land `CHARACTERIZED / conviction:OPEN`
> (root conviction is LOS-deferred); the E-plane reaches `conviction: CONVICTED` now via the dodge oracle (no LOS
> needed). We characterize (observe), we do not force conviction by intervention. See
> `~/.claude/plans/the-errors-that-caused-kind-key.md`.
