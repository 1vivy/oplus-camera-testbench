<!-- STATUS: VERIFIED — interop-tree foundation; evidence/axiom-anchored (doc-50 method). -->
<!-- Parent: ./INDEX.md -->
<!-- The anti-churn dead-end ledger. Every entry is a branch that was chased to a verdict and CLOSED.
     Keyed to interop-tree node ids (C1–C6, D1–D4, E1–E4). Before re-opening any node, read its rows here. -->

# REFUTED-LOG — dead-end ledger (keyed to node ids)

**Purpose.** Stop cross-session loops. Each row is a claim that was investigated to a terminal verdict
(REFUTED = a falsifier fired; CONVICTED = the open question was closed with a fact). A node MUST NOT
re-chase any claim listed against its id. To revive a row you need a *new* falsifier that defeats the
"why refuted" column — cite it and add a new row; do not silently re-open.

Source verdicts: `rearch/47-root-cause-correction-two-gates.md` (the Do-not-re-chase list + per-symptom
corrections) and `rearch/42-retiring-libapsfixup-the-oos-way.md` (the EXHAUSTIVE VERDICT + FACILITATION
synthesis). Cross-link each node's `refuted_refs:` front-matter to the ref-ids below.

## Ledger

| ref-id | node | refuted/resolved claim | why refuted / how resolved | doc |
|--------|------|------------------------|----------------------------|-----|
| R-01 | D1 | **libui as the OOS↔LOS P010 divergence locus** — `Gralloc5Mapper::lock`/`lockYCbCr` differs and computes a different `Cb` offset. | REFUTED (Probe A). `lock`/`lockYCbCr` are logically identical AOSP in BOTH binaries, read `offsetInBytes` literally, no oplus patch (the OOS +50 KB is EDID/display code). 3rd-fork scan: `libui.so` byte-identical clean AOSP, `*Usage*` syms all stock. So libui is not where the lock-math diverges. | doc-42 |
| R-02 | D1 | **snapalloc / allocator-engine divergence** — LOS uses a different allocator than OOS, producing non-contiguous P010. | REFUTED (Probe A2/C). `vendor.gralloc.enable_snapalloc=1` verified on the LIVE LOS build + `snapalloc-impl.so` loaded → LOS uses snapalloc, same as OOS. All 8 alignment JSONs, enable-script (md5 b8d7c88f), CamX format-util, and `mapper.qti.so` byte-identical. The 32-row align (1440→1472) is BY DESIGN (`camera_alignments.json scanline_align:64`), not a divergence. | doc-42 |
| R-03 | E2 / D1 | **OEM "usage bit in /system"** — OnePlus's patched `frameworks/{native,av}` sets an OEM gralloc usage/format bit (AOSP omits) that makes the P010 buffer born contiguous. | REFUTED at every /system camera-buffer surface (2026-06-12 Ghidra). `libgui.so` `*Usage*` all stock AOSP/QTI; OEM **EDR** layer writes `layer_state`, not usage. `libcameraservice.so` OEM edits are **identity-only** (`g_isOplusCamera`, `connectHelper::opluscamera_package_name`), zero usage/GRALLOC/P010/UBWC code. `libandroid_runtime` ImageReader JNI stock; `libui` byte-identical. ⇒ usage flags reaching the QTI allocator are very likely IDENTICAL OOS↔LOS. The EDR `frameworks/native` port (doc-49) is over-exposure-only — NOT the P010 lever. | doc-42 |
| R-04 | D1 | **getStub-flip @0x21e5b4** (`APSGrallocUtils::initialize` `IMapper@4.0::getService(getStub=false)` → flip to `true`) as the gralloc contiguity lever / "the OOS way." | REFUTED (Probe D). The read goes through the in-process **v5 AIMapper** (`AIMapper_loadIMapper`), NOT the V4 getService handle (which is NULL on BOTH OOS+LOS, hwservicemanager ships-but-off). Flipping `+0x48` getStub changes nothing the read sees → deliberately left UNPATCHED. NB: distinct from the SHIPPED `hwJpegRegisterImpl` flip @`0x603a88` (no V5 fallback → FATAL SIGSEGV, that one IS patched); do not conflate. "getStub-flip = OOS way" is refuted for the baseline — OOS is also Gralloc5/AIMapper. | doc-42 |
| R-05 | D1 | **Gralloc4 / HIDL-passthrough generation steer** — force libui to the @4 passthrough (`lockYCbCr` contiguous) as the unifying [FACILITATION] lever. | REFUTED as not-OOS-faithful (Candidate A). It "works," but the OOS dump runs `vendor.qti.hardware.display.allocator-service` + `mapper.qti.so` (AIDL Gralloc5) and `getService(getStub=false)`=NULL on both sides — **OOS is also Gralloc5/AIMapper**. Steering LOS to Gralloc4 would *diverge from* OOS, not match it. Also `graphics.common` V5/V7 relink was tried and refuted (non-causal). | doc-42 |
| R-06 | C4 / C5 | **customVendorTag 120 missing / GCVT=0** as the still-capture / no-JPEG root. | REFUTED (not a root). `customVendorTag 120` is PRESENT in v19 logs (`ocslog_1781146046` @20:47:25, reqID 238–241, node `OplusSATFusionOfflineReprocess0_IPE0`). The old "GCVT=0 still-capture root" is closed. Do not re-chase. | doc-47 |
| R-07 | D2 | **GraphicBufferWrapper / HardwareBuffer leak** as the preview-freeze cause. | REFUTED (self-refuted in doc-39/40, upheld by doc-47). The freeze is preview **delivery** starvation (HAL produces preview, app renders 0 frames — `onCaptureCompleted/onPreviewFrame/updatePreview` callbacks = 0), NOT a buffer leak. Gate B lives in the consumer/render path, not a leaked GraphicBufferWrapper. | doc-47 |
| R-08 | C5 / C6 | **hdr_detected AEC gate blocks JPEG** ("one gate → no fusion/JPEG", doc-45 unification). | REFUTED. The offline fusion graph runs cleanly at shutter and processes the capture even with `captureHDR:0 previewHDR:0 featuretype 50` every frame. Capture/fusion is ALIVE and NOT gated by `hdr_detected`. Gate A (HDR/exposure) is real and downstream-confirmed but does NOT block capture; "one gate / no JPEG" was an overreach. Two independent gates (A=HDR/exposure, B=freeze), not one. | doc-47 |
| R-09 | C3 | **identity-relay** (`com.oplus.packageName` → `CameraAPPType`) as a metadata / JPEG cause. | REFUTED (PROBE-R1c). The identity relay affects the **performance axis only**; it is not a metadata or JPEG-blocking cause. The OEM `libcameraservice` edits are identity-only and do not touch buffer/metadata contracts. | doc-47 |

## Companion ledgers
- `INDEX.md` — the trunk + status dashboard + symptom→path map.
- `DODGE-VS-DIRTY.md` — the oracle divergence ledger (facilitation artifacts, diff-era source).
- `../facilitation/INDEX.md` — the requirements→facilitation STATUS BOARD (Phase-2 forward spec); plus
  `../facilitation/DODGE-ORACLE.md` (dodge as proof-of-form) and `../facilitation/BUILD-ORDER.md`.
- Source docs: `../rearch/47-root-cause-correction-two-gates.md`, `../rearch/42-retiring-libapsfixup-the-oos-way.md`.

> **E→F migration note (Phase-2, 2026-06-14).** This log is keyed to node ids **C1–C6, D1–D4, E1–E4**. The
> facilitation E-nodes have been **migrated to F1–F4** (`../facilitation/F*`, the forward spec); the E-node files
> remain as the diff-era source. The refuted rows below keyed to **E2** (R-03) and **E4** (X4-adjacent gralloc
> refutations) carry forward unchanged to **F2** / **F4** respectively — a refuted branch stays refuted across the
> migration. To revive a row you still need a *new* falsifier, now cited against the owning **F-node**.

## Notes for traversers
- **D1 (gralloc/P010)** is the most-churned node: R-01..R-05 close the entire "OOS↔LOS gralloc
  allocation/path divergence" branch. The buffer is allocated identically (snapalloc, 32-row aligned)
  and every reader (libui, the blob's v5 AIMapper) reads the same aligned `offsetInBytes`. The only
  surviving D1 thread is a **RUNTIME** `getStandardMetadata(PLANE_LAYOUTS)` failure for
  `com.oplus.camera` (linker-namespace `libcamxexternalformatutils` reachability — symptom #5) — that
  is NOT refuted; it is RUNTIME-GATED behind the #1 freeze and is a *new* branch, not a re-open of R-01..R-05.
- **C5/C6 (#2 no-JPEG / hdr_detected):** R-08 closes "gate blocks JPEG." The live #2 question is the
  CONFOUNDED SHDR-gate-in-an-HDR-scene test (INDEX C5), which is distinct.
- Do not re-attribute the **freeze** (#1) to a leak (R-07) or to the AEC gate (R-08); the A→B link is
  UNPROVEN-open, not refuted — pursue it via `probe_aec_hdrdetect.js`, not by reviving these rows.
