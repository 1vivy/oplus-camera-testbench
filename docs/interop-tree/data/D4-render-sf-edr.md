<!-- Parent: ../../AGENTS.md -->
---
node: D4
title: "app-render / SurfaceFlinger / EDR / display-HAL (HDR preview tonemap)"
plane: data
partition: /system
blob_identical_oos_los: true
characterization: PARTIAL      # std setExtendedRangeBrightness EDR program OBSERVED end-to-end on stock (edr-hdr 3/3 STABLE): BT2020_ITU_HLG layer, desiredRatio=5.0, setEDRStatus scale 4.926→5.0, ColorMode SRGB→DISPLAY_P3, supportedHdrTypes=SYSTEM. Stays PARTIAL: OEM setEdr*/OplusEdrViewTransform family (slot/transform[16] curve) NOT observed at wire — app-side OplusEdrUtils/setEdr* frida probe armed but ZERO fire.
conviction: OPEN               # no causal claim asserted; runtime A/B LOS-deferred, falsifier runs against E2 oracle not D4
verdict: "stock EDR program reaches SF: BT2020_ITU_HLG SurfaceView, setExtendedRangeBrightness desiredRatio=5.0, setEDRStatus scale→5.0, DISPLAY_P3, supportedHdrTypes=SYSTEM (3/3 STABLE); OEM setEdr* curve unobserved at wire"
confidence: medium
symptoms: [3]
probes: [G6, ab_capture-sf, dumpsys-SurfaceFlinger]
gaps: [G6]
dodge_ref: ""
dirty_ref: ""
divergence: ""
upstream: [C6, D3]
downstream: []
refuted_refs: []
doc_refs: [doc-40, doc-41, doc-47, doc-49, doc-46]
updated: 2026-06-14
---

# D4 — app-render / SurfaceFlinger / EDR / display-HAL

The terminal data-plane node: the 10-bit HDR preview layer the app hands to SurfaceFlinger, and whether
SF applies an EDR tonemap before the panel composites it. Crash/stall **site** = the on-screen
SurfaceView (over-exposed ~5×, doc-40); per the axiom the SF/libgui blobs are byte-identical OOS↔LOS, so
the root is our facilitation: the `OplusEdrUtils` stub (E1) + the missing libgui/SF OEM-EDR ABI (E2), with
display-HAL HDR-cap advertisement as a co-factor.

## (a) Propagation contract

> **OBSERVED on stock — edr-hdr campaign, photo mode, ae_lock=1, OplusROM V16.1.0, ALL 3 runs STABLE**
> (`reference/campaign/edr-hdr/{run1,run2,run3}/ab/{sf_post,logcat_all}.txt`, `verdict.json`). The std
> `setExtendedRangeBrightness` EDR program reaches SF end-to-end at the SurfaceView BLAST layer with
> `desiredRatio=5.0`; the OEM `setEdr*`/`OplusEdrViewTransform` family was NOT observed at the wire
> (app-side `OplusEdrUtils`/`setEdr*` frida probe armed but recorded **zero fire** — see (d)).

**What enters (from C6 hdr_detected→D4 EDR cross-edge + D3 buffer):**
- Preview `SurfaceView` tagged `DataSpace` **BT2020_ITU_HLG (302383104)** + 10-bit — **OBSERVED** at the SF
  layer (`sf_post.txt`: `dataspace=BT2020_ITU_HLG (302383104) hdr metadata types=0 dimming enabled=true`).
  The HLG path fired; BT2020_PQ not seen this session (HLG scene). Set by app `PreviewHDRControl` via
  NativeWindowJNI (doc-40).
- `desiredHdrSdrRatio` headroom request — app calls `setDesiredHdrHeadroom`. **OBSERVED**: SF layer shows
  `current hdr/sdr ratio=4.925998 desired hdr/sdr ratio=5.000000` (all 3 runs identical); `SurfaceControl`
  log shows the ramp `currentBufferRatio=1.007…1.030 → desiredRatio=5.0` on the camera SurfaceView.
- EDR-program invocation. **APP-SIDE PROBE DARK**: the frida hooks on `com.oplus.view.OplusEdrUtils`
  (`getBlastSurfaceControl`/`getSurfaceControl`/`setEdrSdrRatio`/`setEdrFlags`/`setEdrAnimDuration`/
  `setEdrViewTransform`) and on native libgui `setEdr*` all armed successfully (libgui base
  `0x7dae408000`, java class resolved — `app_probes/trace_edr_invocation.log`) but produced **zero fire
  lines** in the run logcats. On this stock session the OEM `OplusEdrUtils.setEdr*` path did not run; the
  std `SurfaceControl.setExtendedRangeBrightness` path did (below). EDR is FRIDA-reachable on stock — only
  the OEM-family wire values are unobserved.

**What leaves (to SurfaceFlinger / display-HAL):**
- Std AOSP `SurfaceComposerClient::Transaction::setExtendedRangeBrightness(sc, currentRatio, desiredRatio)`
  — libgui `@0x1db130`; writes `layer_state_t +0x41C currentBufferRatio`, `+0x420 desiredRatio`, sets
  `what +0x198` **bit48 (`0x1<<48`)** (doc-49). **OBSERVED firing, 62×/run, all 3 runs**:
  `SurfaceControl: setExtendedRangeBrightness sc=Surface(name=a158c66
  SurfaceView[com.oplus.camera/com.oplus.camera.Camera](BLAST))/@0xbfb1588, currentBufferRatio=1.007…,
  desiredRatio=5.0`. This std carrier IS present + functional on LOS — the discriminator (see (c)) is that
  it carries the ratio only, not the OEM tonemap curve.
- SF EDR-status / readback path. **OBSERVED**: `HdrGeneric: setEDRStatus: [s:8073, type:PreviewHDR,
  toggle:1, anit_t:1 scale:5.000000]` (and an earlier `scale:4.926000` step) → `EdrLayerInfoReporter:
  onEdrLayerInfoChanged type:128 toggle:1, scale:5.000000` → `SurfaceControlEdrLayerInfoListener:
  onEdrLayerInfoChanged size 1`. The system-side `OplusFeatureEdrEnhanceBrightness.onEdrInfoChanged`
  mirrors it (`toggle:1 scale:4.926→5.0`). These pair with the RE read-side (`OplusDolbyVision/GameEdr::
  setEDRStatus` ratio clamp [1,5], `gui::EdrLayerInfo`/`IEdrLayerInfoListener::onEdrLayerInfoChanged`).
- OEM EDR carriers that DO drive the panel tonemap, all `Transaction::setEdr*` (libgui, OEM) —
  **NOT OBSERVED at the wire this session** (app-side probe dark): `setEdrViewTransform(sc,
  OplusEdrViewTransform&&, slot) @0x27fd48`, `setEdrSdrRatio @0x280278`, `setEdrGainmapInfo @0x2800e0`,
  `setEdrMetadata @0x27ffb8`, `setEdrFlags @0x27fbbc`, `setEDREffectFlag @0x280a30`,
  `setEDRMaxPotentialEDRValue @0x280aac` — write `layer_state_t +0x0A0`
  (`unordered_map<uint32_t,OplusEdrState>`, slot 0..2), `+0x0D0 edrSdrRatio`, low-mask `+0x000` bit2/bit6,
  and `what +0x198` **bit63 (`0x8<<60`) OEM-EDR-dirty** (doc-49). The tonemap curve is the
  `OplusEdrViewTransform.transform[16]` 4×4 matrix (struct 0x5C, `writeToParcel @0x27024c`). Slot, ratio
  and the `transform[16]` matrix values remain unobserved at the wire — the gap that keeps the OEM-family
  contract PARTIAL.
- SF read-side consumers that apply it: `OplusRequestedLayerState::{setExtendedRangeBrightness,
  setDesiredHdrHeadroom,setEdrMetadata}`, `OplusDolbyVision::setEDRStatus`, gated by props
  `ro.oplus.display.capture_skip_hdr_support` / `ro.oplus.force.brightness.composite` /
  `ro.oplus.uhdr.discard_wcg_info`; whitelist code `OPLUS_CODE_SET_HDR_VISION_STATUS` (doc-46 §177-178).
  (`OPLUS_CODE_SET_HDR_VISION_STATUS`/whitelist not surfaced in app-side logcat — consumer-side, not
  app-visible.)
- Display-HAL HDR-cap advertisement. **OBSERVED** (`sf_post.txt`): every mode reports
  `supportedHdrTypes=SYSTEM`; `colorModes = {NATIVE, SRGB, DISPLAY_P3}`; `Current color mode:
  ColorMode::SRGB (7)` PRE → `ColorMode::DISPLAY_P3 (9)` POST (camera switches the display into wide-gamut
  DISPLAY_P3 on preview start; all 3 runs identical). Note: panel advertises `supportedHdrTypes=SYSTEM`
  (OEM SYSTEM HDR), not literal HLG/ST2084 entries — SF tonemaps via the SYSTEM/OEM EDR path, not the
  AOSP `getHdrCapabilities` HLG/ST2084 list (doc-40 next-session item 2).

**G-MECH (runtime↔RE pairing):** the observed `HdrGeneric: setEDRStatus … scale:5.000000` + BLAST
`desiredRatio=5.0`/`current hdr/sdr ratio=4.925998` pins the read-side RE — `GameEdr/OplusDolbyVision::
setEDRStatus` ratio clamp **[1.0..5.0]** (`re-notes/edr-sf-readside-RE.md`, `@0x3cc9b4`/`@0x68e098`): the
runtime ratio 4.926→5.0 sits exactly at the recovered clamp ceiling. The OEM `setEdrMetadata` 0x5C
`transform[16]` memcpy (`@0x40755c`) is the still-dark half — its wire copy was not exercised app-side.

## (b) Environment dependencies (non-blob)

- **/system_ext stub jar** `oplus-camera-stubs` providing `com.oplus.view.OplusEdrUtils`
  (`platform_apis: true`) — currently the no-op stub (`getBlastSurfaceControl()→null`,
  `setEdr*→false`). [E1]
- **/system `frameworks/native`** `libgui.so` + `surfaceflinger` carrying the OEM `layer_state_t`
  extension (`+0x0A0` map, `+0x0D0` ratio, `what` bit63) on BOTH write and read sides — AOSP/LOS exports
  std `setExtendedRangeBrightness` only, not the `setEdr*` family (doc-49 §1). [E2]
- **/vendor display-HAL** (`android.hardware.graphics.composer3`) advertising HLG/PQ HDR caps for the
  panel; OOS also honors `ro.vendor.oplus.hdr.uniform` via its own EDR compositor path (doc-40).
- Feature props (OOS-authoritative, consumed by OplusEdrUtils/MirrorOplusEdrUtils): `persist.sys.feature.{dolby_vision,
  dolby_vision_app,hdr_vision_app,localhdr_version=2,uhdr.support,support.edrlistener}` (doc-38 §79).

## (c) Fact-to-resolve

**ONE question:** When the app composites a BT2020 10-bit preview layer with `desiredHdrSdrRatio=5`, does
LOS SurfaceFlinger ever receive an EDR program — i.e. is `setExtendedRangeBrightness` (or any `setEdr*`)
actually invoked, AND does the panel advertise HLG/PQ caps — or does SF composite the HLG layer with no
clamp (the ~5× over-exposure)?
- **Answer = zero EDR calls reach SF** (doc-47 finding: "zero extended-range/EDR/HLG calls anywhere",
  `colorMode 0` SRGB, `hdrSdrRatio NaN` in v19 logs) ⇒ root is upstream in **E1** — the `OplusEdrUtils`
  stub `getBlastSurfaceControl()→null` short-circuits `PreviewHDRControl.A()/B()` before any transaction.
  Action: implement the stub (doc-40/41 candidate) so the precondition passes.
- **Answer = `setExtendedRangeBrightness` lands but panel stays bright** ⇒ root is **E2** (the tonemap
  curve lives in OEM `setEdrViewTransform` `+0x0A0`/bit63 which AOSP SF never reads, doc-49 §2) AND/OR the
  display-HAL doesn't advertise HDR caps. Action: port the libgui+SF OEM-EDR ABI; verify `getHdrCapabilities`.
- Prediction discriminator: a single std `setExtendedRangeBrightness` call (E1 fix alone) is **insufficient**
  — doc-49 §79-82 proves it writes only the ratio, not the curve. So even a working stub will not fix
  over-exposure unless E2 is also ported. This is the falsifier for the "stub-only fix" hypothesis.

## (d) Runtime probe(s)

- **`tools/observability/capture/ab_capture.sh`** → `sf_pre.txt` / `sf_post.txt` (`dumpsys SurfaceFlinger
  | grep -iEA4 'supportedhdrtypes|hdrcapab|desiredhdr|wide.?color|...|dataspace|colormode'`), parsed by
  `parse_ab.py` `t_edr` (#3/G6 row): extracts `supportedHdrTypes=` + `Current color mode:` + the layer
  `dataspace`/`hdr/sdr ratio`. Lever status: **WORKS** (edr-hdr campaign, 3/3 STABLE): `dumpsys` captured
  `supportedHdrTypes=SYSTEM`, `ColorMode::SRGB→DISPLAY_P3`, and the live layer line
  `dataspace=BT2020_ITU_HLG (302383104) … current hdr/sdr ratio=4.925998 desired hdr/sdr ratio=5.000000`.
- EDR-invocation confirmation. **CORRECTION (was "DARK/build-only/not frida-hookable"):** EDR is
  **FRIDA-REACHABLE on stock**. The std program is OBSERVED in plain logcat —
  `SurfaceControl: setExtendedRangeBrightness sc=…SurfaceView…(BLAST), desiredRatio=5.0` (62×/run) +
  `HdrGeneric: setEDRStatus … scale:5.000000` + `EdrLayerInfoReporter.onEdrLayerInfoChanged` — no eng build
  needed. The OEM `OplusEdrUtils`/native libgui `setEdr*` hooks ALSO arm cleanly on stock (libgui base
  `0x7dae408000`, java `OplusEdrUtils` resolved — `app_probes/trace_edr_invocation.log`). What is deferred
  is the LOS **conviction** A/B, not reachability. **APP-SIDE PROBE DID NOT FIRE:** those armed
  `OplusEdrUtils`/`setEdr*` hooks recorded **zero** fire lines this session — the OEM-family wire values
  (slot, `transform[16]`) stay unobserved, so the G6 OEM-EDR contract is **PARTIAL** (reachability proven,
  OEM-family invocation app-side dark), no longer DARK.
- Note: `00_enable_all.sh`+`enable/20_system_framework.sh` bridges the /system **camera framework** on
  stock (OOS-BL §2); the SF/EDR std path is observable on stock without it (logcat + `dumpsys` above).

## (e) Dodge-vs-dirty diff

Not the primary plane for D4 (this is a /system **data**-render node; the facilitation roots E1/E2 carry
the oracle diff). For reference, the divergence carriers:
- **Oracle (OOS):** `libgui.so` exports the full `setEdr*` family + extended `layer_state_t`
  (`dump201_full/system/lib64/libgui.so`, doc-49); stock SF reports `supportedHdrTypes=SYSTEM`,
  `Current color mode: ColorMode::DISPLAY_P3` (OOS-BL §3, `reference/ab/oos-photo/sf_*.txt`).
- **Ours (LOS):** AOSP libgui/SF — std `setExtendedRangeBrightness` only; v19 logs show `colorMode 0`
  (SRGB), `hdrSdrRatio NaN`, zero EDR calls (doc-47 §44). `OplusEdrUtils` = no-op stub.
- **Correct form:** match the libgui write ABI (OEM `layer_state_t` + `setEdrViewTransform` curve) AND the
  SF read side (`OplusRequestedLayerState`), per doc-49 — an ABI port, not a single-method add. See E1/E2
  nodes and `DODGE-VS-DIRTY.md`.

## (f) Symptom leaves

- **#3 over-exposure (~5×) — PROXIMATE-SITE here.** The un-tonemapped BT2020-HLG SurfaceView is composited
  at full brightness at D4. **ROOT edges:** → **E1** (`OplusEdrUtils` stub `getBlastSurfaceControl()→null`
  short-circuits the EDR program, attribution-matrix /system_ext) and → **E2** (libgui/SF OEM-EDR ABI
  absent so even a landed `setExtendedRangeBrightness` ratio is insufficient, doc-49) + display-HAL HDR-cap
  co-factor.
- Separation note: #3 (over-exposure) is **independent of the freeze #1** — doc-43 confirms both HDR and
  forced-SDR previews freeze, and the prop stopgap `persist.camera.override_preview_hdr_support=false`
  fixes colors without touching the freeze. Do not conflate this D4 tonemap path with the D2/C6/D3
  delivery-starvation path.
- Status rationale: **characterization: PARTIAL / conviction: OPEN** — (a) carriers are named from doc-49 symbol offsets plus partial v19 logs, not observed end-to-end at runtime (the EDR-invocation probe is DARK/build-only), so characterization stays PARTIAL; no root claim is asserted (runtime A/B LOS-deferred), so conviction is OPEN. G-COND not yet met (over-exposure is an HDR-family fact, requires an
  HDR-triggering scene; doc-47's `colorMode 0`/`NaN` reading was an idle/SDR v19 session). Runtime A/B is
  **LOS-deferred**; the actionable falsification (std-ratio-alone insufficient) runs against the E2 oracle
  now, not at D4.
