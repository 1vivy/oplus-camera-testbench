<!-- Parent: ../INDEX.md -->
<!-- THIN symptom leaf: encodes the PATH only. Node content lives in the node files — do NOT duplicate it. -->

---
id: 1
symptom: "preview freeze (frame-1 stall)"
path_nodes: [D2, C6, D3]
decisive_probe: "probe_aec_hdrdetect.js force +0x48; perfetto working baseline (G4)"
characterization: PARTIAL   # documented entire-pipeline freeze NOT reproducing on v2.x (general preview live 2026-06-25); see UPDATE
conviction: OPEN             # this (documented) freeze effectively resolved on v2.x; the DISTINCT narrow post-capture/portrait/selfie freeze is now CHARACTERIZED as an app-side bokeh-render stall (root INFERRED, not convicted) — see UPDATE 2026-06-25b
updated: 2026-06-25
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

## UPDATE (2026-06-25) — distinguish THIS documented freeze from the currently-observed symptom (do NOT conflate)

- **THIS node (documented #1) = the ENTIRE preview-pipeline delivery freeze** (app renders 0 frames; HAL/captures
  alive, captures still update the preview). The **APS-preview-vs-fallback** framing for it is **REFUTED** — the
  AOSP fallback code path is **never taken at runtime** (`../DIRTY-NOTES-EXAM.md:429` / D3; `../REFUTED-LOG.md` R-07).
  On the current **v2.x build, general preview is LIVE** (multiple modes driven on-device 2026-06-25, frames
  flowing, no entire-pipeline stall) → this documented frame-1 freeze is **NOT reproducing** (effectively resolved
  by the v2.0/v2.1 preview-path work). The AEC-stats output-starvation / `decMetaRefZeroToRemove` release-upcall
  model below belongs to THIS freeze.
- **Currently-observed symptom (NEW, DISTINCT — not this node):** a **narrow freeze that occurs ONLY after a
  capture, in PORTRAIT, on the SELFIE (front) camera.** Preview is otherwise live. It shares the
  `APSPreviewManager::previewManagerRoutine+1560` parked signature (a preview-thread park) but the **trigger/scope
  differ** (post-capture · portrait · selfie-only — vs THIS node's entire-pipeline frame-1 stall). It is
  **UNCHARACTERIZED**; track separately (candidate new node), and do NOT attribute it to this documented freeze.
- **R1 provenance caveat (2026-06-25 re-check):** the R1 release-upcall chain is **present + ABI-correct on LOS**
  (`libAlgoProcess` producer + `libAPSClient-cmd-jni.so` receiver byte-identical to OOS at the RE offsets), so R1 is
  not a missing lib. BUT the repo's "upcall OBSERVED firing on the OOS golden ~7-9/s" is **provenance-defective** —
  that golden frida probe crashed at Java-hook-install before logging any upcall. Downgrade R1 status:
  RE-confirmed-present but per-frame firing **runtime-DARK** (not observed), not "OBSERVED."

## UPDATE (2026-06-25b) — the narrow post-capture portrait-selfie freeze, CHARACTERIZED (app-side bokeh-render stall)

Live freeze captured on-device (CPH2747, app pid 18654, `debuggerd -b` + `logcat -b all`, SELinux permissive).
**characterization: PARTIAL · conviction: OPEN** (root INFERRED, not convicted).

- **Locus = the app-side bokeh render, not the HAL.** During the ~13 s freeze, `OplusBlurPreviewJNI` (the OCCE
  single-portrait AISEG bokeh render, `OPLUS_SinglePortraitPreview AISEG V2.0.1.8`) goes from ~400–490 log-lines/s
  to **zero for ~13 s**, then resumes. `PreviewGLThread` is parked in **`onDrawFrame → … → java.lang.Thread.sleep`**
  (a sleep-retry loop; `com.oplus.camera.common.gl.b0.c` = GLThread.java:845) waiting for a bokeh result.
- **All bokeh producers are IDLE during the freeze (not busy, not hung):** `BlurPreviewHand` (Looper `pollOnce`),
  the QNN-HTP segmentation thread (`/odm/lib64/libQnnHtp.so` → `pthread_cond_wait`), and `previewManagerRoutine+1560`
  (`libAlgoProcess.so` → `pthread_cond_wait`, command queue empty). Main/UI thread idle in `nativePollOnce`. So this
  is **NOT a deadlock and NOT a UI-thread hang** — it is a producer-less stall.
- **The HAL stays HEALTHY through the freeze:** realtime preview `isRealTime 1` at 29 fps + offline reprocess
  `OplusOfflineReprocess0_OFE1` (`IsCaptureRequest 1`) at ~58/s, continuous; `MotionDetection` consumes preview
  frames at ~30/s the whole time. Frames are delivered — only the **bokeh-render pipeline stops being driven** after
  a capture. Self-recovers ~13 s (a watchdog/timeout cadence); stacks longer when captures pile up.
- **INFERRED ROOT (not convicted):** a **missing/late post-capture "resume bokeh" trigger** into the app bokeh
  pipeline — after a snapshot, the per-frame bokeh seg→render chain is not re-driven for ~13 s. No buildable fix is
  located; no overlay fix was validated.
- **REFUTED this session, with evidence (do NOT re-chase without new data):** R4 op_mode clobber (front op_mode
  reads `0x8001` on-device, correct); face-beauty (freezes with AND without the filter); APS
  `pfnAPSMemHWAcquire/Release` NULL (fires 02:02:26, ~43 s *before* the 02:03:09+ freeze — see
  `../../re-notes/aps-metadata-buffer-init-RE.md`); bokeh `SDK_FAILURE`/`mInit failed` (session-start transients);
  NCS gyro `hNCSDataHandle 0x0` (constant ~87/s, **present on the OOS golden too** → non-divergent, see
  `../facilitation/E5-ncs-sensor-bridge.md`); DSP/QNN hang (the QNN-HTP thread is idle).
- **OOS golden INCONCLUSIVE for the resume handoff:** the golden store lacks a front+portrait capture, masks
  app-side JNI tags, and self-terminates ~4 s post-shutter. Confirmed matching OOS↔LOS: op_mode `0x8001` + OFE
  `featuretype 48`.
- **DECISIVE NEXT (investigation gate):** a **NEW full-verbose front-portrait OOS golden** — no SENSOR/NCS log
  mask, ~20 s post-capture window — plus a **user-driven live selfie-portrait capture** (autonomous synthetic
  input does NOT actuate capture on this build: `input tap` + `KEYCODE_CAMERA` left DCIM count unchanged; and the
  bokeh render only engages with a live subject in frame). That single artifact pins where stock fires the
  post-capture resume that LOS drops/delays, and also unblocks the aps-metadata + E5-NCS divergence questions.
- **Related (uncharacterized):** PHOTO-mode selfie-flip UI freeze — user-reported, no trace yet; likely the same
  app-side bokeh/GL resume family.
