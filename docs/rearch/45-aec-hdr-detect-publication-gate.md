<!-- STATUS: MIXED — inference-surgery applied (Pass-B, corrected Pass-C).
     VERIFIED body = Ghidra decompile evidence (HDRDetectProcess FUN_001b4d8c gate at +0x48,
     HDRTriggerFlagDetection FUN_001ed7e4 writes aecOut+0xfc, setTuningData memcpy chain,
     byte-identity of libaecCustom.so md5 f8fb639d stock↔LOS); all on-device probe results
     (HDRDetectProcess fired 954×, +0x48==1 every frame; hdr_detected rc=-2 observed;
     +0x6544 already 1 on clean-boot; force-test +0x6a28/+0x6a18→hdr_detected rc=0 + GCVT 120;
     dump result +0x6a28=0 natural, selectSHDRAutoExposureUsecase named;
     +0x6544/LUSS/HWMFHDRSupported refuted on-device; enable3exp/setHDRMode↔6a28/6a18 mapping
     refuted on-device; config metadata filter excluded); the FORCE-TEST RESULT, DUMP RESULT,
     and settings-dump tooling (on-device measurements and confirmed levers).
     MOVED to "Inferences & Open": the PROBE-S7 PRODUCER section (static mechanism refuted
     on-device — relabelled as REFUTED HYPOTHESIS); the "What this means for the fix" conclusion
     that "+0x48 is the lever" (refuted); the "Fix-locus conclusion" in the ADDENDUM; the
     "gap is result-PUBLISH" localization (candidate 1 vs 2 still open); and the ROOT-A FIX DRAFT
     (a candidate fix specification, not a measured fact — the +0x48 producer-gate model it
     partially rests on was refuted on-device; the camxoverridesettings lever is confirmed but
     the exact key set is pending the +0x6a18 confirmation probe).
     Guard (interop-tree SCHEMA trunk axiom): a measured stall SITE is never a verified ROOT. -->

# 45 — Provider/AEC RE: the `hdr_detected` rc=-2 gate is `HDRDetectProcess` tuning-enable `*(aecCtx+0x48)`

**worker-2, team `gralloc-p010-divergence`, 2026-06-10.** Static Ghidra RE of `libaecCustom.so`
(the OPlus AEC core, `OPlus_AEC_Core_V4.0`). Pivot from the (now-closed) app/SDK preview-freeze lane
(doc 44 UPDATE 8) to the unified **AEC-stats metadata root** (memory `root-aec-stats-hdr-detected-missing`):
the lead's question — *what gates `com.qti.stats_control.hdr_detected`/`aec_hdr_decision` publication
into per-frame result metadata (the rc=-2 → rc=0 question).* **Now answered at the algo source.**

**Blob identity:** `libaecCustom.so` md5 `f8fb639d…`, BuildID `d0204b3e…`. The stock-dump
(`dump201_full/odm/lib64`) and the **LOS-built device blob** (`out/.../odm/lib64`) are **byte-identical**
→ **all Ghidra offsets below are valid on-device** (device addr = Ghidra addr − 0x100000; image base
0x100000).

---

## Headline

**`com.qti.stats_control.hdr_detected` is rc=-2 (absent) because the AEC never COMPUTES it: the producer
`HDRDetectProcess` early-returns when its per-frame tuning-enable field `*(*aecCtx + 0x48) == 0`.** When
gated off, the entire HDR-detect block — including the `HDRTriggerFlagDetection` call that writes the
hdr_detected output flag at `aecOut + 0xfc` — is skipped, so the CamX AEC node has no value to publish
into the result vendor tag → the app's APS engine reads rc=-2.

Two corrections to the prior model:
1. **libaecCustom does NOT publish the tag.** It contains **no** `hdr_detected`/`aec_hdr_decision`/
   `stats_control`/`dol.states` strings (verified). It only *computes* the decision; the **CamX AEC
   stats node publishes by numeric tag ID**. So grepping blobs for the tag name is futile, and rc=-2 =
   "the algo produced nothing," not a publish-name/registration gap (consistent with the A/B result
   that `drc_gain` — same section — publishes fine).
2. **The hdr_detected computation is NOT DOL/sensor-mode-gated.** `HDRTriggerFlagDetection` computes the
   flag from **pure per-frame scene statistics** (background-saturation over-exposure ratio / adrcGain /
   darkboost) on whatever frame is running — it would compute on the NORMAL LOS preview *if reached*.
   The ONLY thing stopping it is the upstream `*(aecCtx+0x48)` tuning-enable. ⇒ the gate is the **AEC
   HDR-detect feature enable**, not the sensor running a multi-exposure DOL mode.

---

## Evidence (Ghidra, libaecCustom.so, base 0x100000)

### 1. `HDRDetectProcess` = `FUN_001b4d8c` (device `0x0b4d8c`) — the gate
First instruction:
```c
lVar13 = *param_2;                                   // param_2 = per-frame AEC ctx; *param_2 = active tuning struct
if (*(int *)(lVar13 + 0x48) == 0) goto LAB_001b5978; // <-- HDR-DETECT MASTER ENABLE: if 0, return doing NOTHING
```
The skipped body (when `+0x48 != 0`) computes hdrEVMinus / EV-with-HDR / sat-ratio, logs the
`HDRDetectProcess` / `[HDRDBG]` lines, and **calls `FUN_001ed7e4` (HDRTriggerFlagDetection)** which
writes the decision. With `+0x48 == 0`, none of `aecOut + {0xe0,0xe4,0xe8,0xfc,0x10c,0x110,…}` is
written → the hdr_detected/hdrEVMinus/frame-control family is never produced.

### 2. `HDRTriggerFlagDetection` = `FUN_001ed7e4` (device `0x0ed7e4`) — the producer, mode-agnostic
Writes the HDR-detect output flag **unconditionally each call** at `aecOut + 0xfc`:
```c
if (*(int *)(tuning + 0xd0) == 0) {          // tuning+0xd0 = "enableHDRDetectionByBGSat" (logged as such)
    // BGSat path: pure over-exposure-ratio test on this frame's stats
    if (overExpRatio thresholds met && adrcGain<=… ) aecOut[0xfc] = 0/HDR;  else aecOut[0xfc] = 1;
} else {
    aecOut[0xfc] = FUN_001d2794(...);        // motion-augmented path ("Hdr triggered by motion")
}
```
No DOL/sensor-mode/HDR-session guard — it's scene statistics. The trailing `[HDRDBG]
enableHDRDetectionByBGSat: %d adrcGain/…/overExpRatio/triggerPct` log prints `tuning+0xd0` and the
saturation inputs. ⇒ hdr_detected is a **scene TRIGGER computable on normal preview**, gated only by
`+0x48` upstream.

### 3. `CheckTuningDataValidation` = `FUN_00188d50` (device `0x088d50`) — the tuning origin
Validates each AEC tuning sub-container and ANDs them: `IsPrepareData`, `IsProcLuma`, `IsProcTarget`,
`IsProcConv`, `IsAecMCSync`, `IsProcFlash`, `IsProcExt`, **`IsDolHdrTuningDataValid`** (container
`param_1+0x50`, checks `*(container+0x18) < 2`), `IsProcExtTone`, `IsProcAIAE`. Confirms a dedicated
**DOL-HDR tuning sub-container** feeds the HDR path; the per-frame `+0x48` enable is applied from the
parsed tuning. (This is the load-time validity check; `+0x48` is the runtime enable it gates.)

---

## What this means for the fix (rc=-2 → rc=0) — STATIC INFERENCE, see Inferences & Open

> This section's "+0x48 is the lever" conclusion was the static RE inference. It was REFUTED on-device
> (HDRDetectProcess fired 954×, +0x48==1 every frame — the gate was never blocking). The full static
> analysis and the on-device probe result are in "Inferences & Open" below as a REFUTED HYPOTHESIS.
> The on-device decisive probe result is in "Decisive on-device probe" below.

## Decisive on-device probe (frida) — `tools/frida/probe_aec_hdrdetect.js`

Offsets are valid (byte-identical blob). Attach to the provider AEC process **during preview-start**
(the decision burst is one-shot at preview-start; attach late = 0 calls). `setenforce 0` first.

```js
// libaecCustom.so byte-identical stock<->LOS (md5 f8fb639d); device addr = Ghidra-0x100000.
const HDRDetectProcess = 0x0b4d8c;          // FUN_001b4d8c: gate *(*ctx+0x48)==0 -> skip
const base = Module.findBaseAddress('libaecCustom.so');
if (!base) { console.log('libaecCustom not loaded yet'); }
else {
  Interceptor.attach(base.add(HDRDetectProcess), {
    onEnter(a) {
      const ctx = a[1];                     // param_2 = per-frame AEC ctx
      const tuning = ctx.readPointer();     // *param_2 = active tuning struct
      const en = tuning.add(0x48).readU32();          // HDR-detect master enable
      const bgsat = tuning.add(0xd0).readU32();       // enableHDRDetectionByBGSat
      console.log(`[HDRDetect] enable(+0x48)=${en} bgsat(+0xd0)=${bgsat}`);
      // OPTIONAL coherent test: force the detector ON for the normal preview
      // if (en === 0) tuning.add(0x48).writeU32(1);
    }
  });
}
```
- `enable(+0x48)=0` every frame → **CONFIRMS** the gate; hdr_detected can never be produced. Fix =
  whatever sets `+0x48` on stock (the configure-time HDR/AEC-mode request → enable the HDR-capable AEC
  tuning), pursued via the SHDR/AutoHDR-at-configure chain (PROBE-S7).
- Uncomment the force → if hdr_detected then computes (re-hook `HDRTriggerFlagDetection` `0x0ed7e4`,
  read `aecOut+0xfc`) and **the preview un-freezes** (APS decision completes), the AEC HDR-detect enable
  is the coherent foundation lever — a far narrower force than EnableAutoHDR. If it SIGABRTs like the
  EnableAutoHDR force, the stats are necessary-but-not-sufficient and the full HDR-tuning/usecase must
  be selected (back to the configure-time request).

## Anchors
- `HDRDetectProcess` Ghidra `0x1b4d8c` / device `0x0b4d8c` — gate `if(*(*param_2+0x48)==0) return`.
- `HDRTriggerFlagDetection` Ghidra `0x1ed7e4` / device `0x0ed7e4` — writes hdr_detected at `aecOut+0xfc`;
  BGSat-vs-motion select on `tuning+0xd0` (`enableHDRDetectionByBGSat`).
- `CheckTuningDataValidation` Ghidra `0x188d50` / device `0x088d50` — `IsDolHdrTuningDataValid` etc.,
  DOL-HDR tuning sub-container at `tuningRoot+0x50`.
- Exports: `camAECProcess` device `0x0b35ac`, `camAECGetParam` `0x0bae78` (the CamX-side retrieval of
  the computed outputs), `camAECInit` `0x068270`.
- `ExtHdrDetect.cpp` / `TuningDataContainer.cpp` (`OPlus_AEC_Core_V4.0/core/ProcExt` + `/Databank`).
- Source dump: `dump201_full/odm/lib64/libaecCustom.so` == LOS `out/.../odm/lib64/libaecCustom.so`.
- Cross-refs: memory `root-aec-stats-hdr-detected-missing`, `docs/PROBE-S7-desiredsensormode-keystone.md`
  (SHDR-submode selection), doc 44 UPDATE 8 (preview-freeze = APS output-starvation, unified here).

---

## ADDENDUM — the WRITER of `+0x48` and its source (the configure-time provenance)

Traced `+0x48`'s writer up to the AEC tuning-load. **It is a verbatim chromatix-tuning copy, NOT a
value libaecCustom computes from a session param** — so libaecCustom is a pure CONSUMER; the lever is
the chromatix tuning-mode selection, which is the configure-time HDR request (PROBE-S7 axis).

### The struct & the writer
- In `processExt` (`FUN_001b3f30`, device `0x0b3f30`, ExtHdrDetect.cpp): `lVar5 = *param_2` is the
  **ProcExt tuning chunk**; it reads TWO enables — `*(+0x48)` (HDR-detect / BGSat) and `*(+0xe8)`
  (night/motion HDR-detect) — and runs `HDRDetectProcess` iff **either `== 1`** (else it zeroes the HDR
  outputs `aecOut+{0xe0,0xfc,0x10c}`). So `+0x48 ∈ {0,1}` is a plain enable, sibling of `+0x4c` (HDR
  Confidence), `+0xd0` (`enableHDRDetectionByBGSat`), `+0xe8`.
- **`setTuningData` = `FUN_00187cfc` (device `0x087cfc`, TuningDataContainer.cpp)** populates the AEC
  instance by **`memcpy`-ing each chromatix tuning chunk verbatim** (`FUN_001a9cd8(dst,src,size,…)`):
  chunk `param_2[8]` (`pProcExtTuning`, size `0x348`) → AEC struct `+0x1bf0`. **`+0x48` is a field
  inside that copied `pProcExtTuning` chromatix chunk.** No arithmetic, no session-param read — the
  enable's value is whatever the chromatix ProcExt module says for the **active tuning mode**. (The
  sibling `ParserExtFeatureTuning`/`FUN_001886f4` parses a *different* chunk, `pExtFeatureTuning`
  `param_2[9]`→`+0x1f38`, into fields `+0x68..0xbc` incl. `enableEVCtrlforHdrOff` — confirms the
  per-module split; the HDR-detect *enable* is in ProcExt, copied raw.)

### The source param & the divergence (named)
- **Source = the AEC chromatix "ProcExt/ExtHdrDetect" module's enable parameter, selected by the CamX
  AEC TuningMode vector** (sensor-mode + HDR special-mode + scene). The AEC node
  (`camera.qcom.core`/`libcamxstatscore`, NOT libaecCustom) interpolates the chromatix for that vector
  and hands the resulting `pProcExtTuning` chunk to `setTuningData`.
- **Static chromatix is byte-identical stock↔LOS** (whole odm partition). So the divergence is purely
  **which ProcExt chunk the tuning-mode selects**: stock requests the HDR usecase at configure → the
  HDR dimension of the AEC TuningMode is set → chromatix yields ProcExt with **HDR-detect enable = 1** →
  `+0x48 = 1` → hdr_detected produced (rc=0). LOS makes no HDR request at configure → default
  tuning-mode → ProcExt enable = 0 → `+0x48 = 0` → `HDRDetectProcess` no-ops → rc=-2.
- **The HDR-request that sets that tuning-mode dimension is the SAME one that selects the SHDR sensor
  submode** — `numHDRexposure`/`EnableAutoHDR`/SHDR-enable consumed by `InitSHDREnable` (oemlayer/chi
  Ghidra `0x2e0d80`, per PROBE-R1c) and matched by `IsMatchingHDRExposureType`
  (PROBE-S7-desiredsensormode-keystone). ⇒ **AEC-HDR-detect-enable (`+0x48`) and the SHDR sensor-submode
  are two CONSUMERS of one configure-time HDR-request.** This reconciles the whole SHDR axis: one root
  request, two downstream effects (the missing AEC stats AND the wrong sensor submode), and one
  preview-freeze + no-JPEG.

### Fix-locus conclusion (STATIC INFERENCE — moved to Inferences & Open)
> This conclusion was drawn from the static RE before on-device probing. The +0x48 model it relies on
> was refuted on-device. See "Inferences & Open" below.

### Anchors (addendum)
- `processExt` `FUN_001b3f30` Ghidra `0x1b3f30` / device `0x0b3f30` — `*(*param_2+0x48)`/`+0xe8` enables.
- `setTuningData` `FUN_00187cfc` Ghidra `0x187cfc` / device `0x087cfc` — verbatim chromatix-chunk
  `memcpy` (via `FUN_001a9cd8`); `pProcExtTuning` = `param_2[8]`→`+0x1bf0` (holds `+0x48`).
- `ParserExtFeatureTuning` `FUN_001886f4` (`0x1886f4`) — parses the *other* chunk (`pExtFeatureTuning`
  `param_2[9]`→`+0x1f38`), not the HDR-detect enable.
- Source = AEC chromatix ProcExt/ExtHdrDetect enable via CamX TuningMode (HDR dimension) =
  configure-time `numHDRexposure`/`EnableAutoHDR` (InitSHDREnable `0x2e0d80`, PROBE-S7).

---

## PROBE-S7 PRODUCER — REFUTED ON-DEVICE (see Inferences & Open)

> This static-RE section concluded that `StaticSettings+0x6544` / `LegacyUpdateStaticSettings` was the
> single shippable root. It was REFUTED on-device: `+0x6544` was already 1 on LOS, and
> `LegacyUpdateStaticSettings` never fired during the run. The full section is preserved in
> `## Inferences & Open` below, labelled as REFUTED HYPOTHESIS. The on-device CORRECTION follows.

---

## CORRECTION (on-device, v19) — the `+0x48` producer-gate model is REFUTED; gap is the result-PUBLISH

**Lead ran both ends of the chain live on v19 (same session). The static `+0x48` model above is WRONG.**

- **PROVIDER (libaecCustom PID 1981, `probe_aec_hdrdetect.js`):** `HDRDetectProcess` fired **954×**,
  `*(aecCtx+0x48) == 1` on **every** frame, `HDRTriggerFlagDetection` ran 954× — in **NORMAL preview
  (`dol.states=0`)**. The AEC **computes hdr_detected every frame.** `FORCE` was a no-op (`+0x48` was
  never 0).
- **APP (libAlgoProcess PID 858, `observe_getmetadata.js`):** the APS engine reads
  `com.qti.stats_control.hdr_detected` → **rc=-2 (MISSING)**; the whole DOL family
  (`hdr_EV_Minus`,`aec_short_gain`,`dark_boost_gain`,`motion_detected`,`aec_face_num`,
  `is_flash_snapshot`) all rc=-2. PRESENT (rc=0): `drc_gain`, `AecLux`, `auto.hdr.enable`, `dol.states`,
  `faceLumaRatio`, `flickermode`, `rawhdr.isp.luxindex`.

⇒ **The algo PRODUCES hdr_detected (954×); it never reaches the app-visible result metadata.** The gap
is the **CamX result-PUBLISH/merge** step — NOT the AEC compute, NOT `+0x48`, NOT the configure-time HDR
request, NOT the SHDR submode. **The entire "PROBE-S7 PRODUCER" / `+0x48` tuning-enable model above is
moot for this symptom** (enable is already 1 and the detector already runs in normal mode — which the
static RE itself predicted: the BGSat detector is mode-agnostic). The `+0x48` finding was correct that
the detector is mode-agnostic; it was WRONG that `+0x48=0` was gating it.

### Investigated and EXCLUDED as the publish gap: the config metadata filter
`CameraHWConfiguration.config` has `[AndroidMetadataFilter0]` (opModes `0x8021;0x830b`) and
`[AndroidMetadataFilter1]` (opMode `0x1`), both listing the HDR-detect family (`hdr_detected`,
`couple_hdr_detected`, `qbc_hdr_detected`, `hdr_EV_*`, `aec_frame_control`, …); `drc_gain` is in **no**
filter and not in `[FilterTag]` (the base list) either. That shape *looks* like the discriminator, **but
it is NOT the LOS gap:**
- The LOS-built `CameraHWConfiguration.config` has the **identical** filters (same opModes) — confirmed.
- Stock's actual session opMode is **0x8001** (live_capture.log: 152× `0x8001`; only 4× `0x8021`, 3×
  `0x830b`) — the **same** opMode LOS runs. At `0x8001` *neither* filter covers the HDR-detect family,
  yet **stock still publishes `hdr_detected` (rc=0)**. So the HDR-detect family is published via a path
  **other than** this opMode filter, and the filter is identical on both → not the discriminator.

### Where the gap MUST be (localization)
`drc_gain` and `hdr_detected` are both `com.qti.stats_control` and both published by the **CamX AEC node**
from the AEC algo output (libaecCustom fills output-struct fields; `camAECGetParam` `0x0bae78` hands them
to the node; the node writes the vendor tags by ID — no tag-name strings in any blob). `drc_gain`
(AECFrameControl, core) publishes unconditionally; the **HDR-detect family is published conditionally.**
**All publish-path artifacts are md5-IDENTICAL stock↔LOS** (libaecCustom `f8fb639d`, chi.override
`3f25d020`, camera.qcom.core, the config) ⇒ **the divergence is a RUNTIME input to the AEC node's
HDR-detect publish, not a blob/config difference.** Candidate gates (in priority order):
1. **CamX AEC-node publish gated on HDR-mode/`numHDRexposure` state** — the node may write the HDR-detect
   `stats_control` sub-family only when the session AEC is in an HDR mode (`numHDRexposure>1` / HDRMode
   set), which on LOS is off. (This would mean the PUBLISH — distinct from the mode-agnostic COMPUTE —
   *is* still downstream of the HDR-request state, partially re-vindicating that thread for the publish
   only. Note carefully vs the compute.)
2. **A CamX stats-publish setting/override** (a StaticSettings field, sibling of the `+0x6544`/`+0x6a28`
   HDR family that reads 0 on LOS) gating "publish AEC HDR/debug stats."
3. ~~The algo's output-struct field not being exported~~ — **ELIMINATED.** In `processExt`
   (`FUN_001b3f30`) the write `*(output+4) = *(aecOut+0xfc)` is **unconditional** (main flow, runs
   whether `+0x48` is 0 or 1) → libaecCustom **always exports hdr_detected in its output struct.** So the
   algo both computes (954×) AND exports it; the drop is purely downstream in the CamX node. ⇒ gate is
   candidate 1 or 2 (CamX AEC-node publish, runtime-gated), NOT the algo.

### Decisive split-probe (device, the next datum)
Hook `libaecCustom!camAECGetParam` (`0x0bae78`) during the freeze and inspect the AEC output struct the
CamX node retrieves: **is the hdr_detected field present/non-default in the algo's output to CamX?**
- **Present in algo output → CamX node drops it** ⇒ gate is CamX-side (candidate 1/2): trace the AEC
  node's `com.qti.stats_control` publish in `camera.qcom.core` and what runtime flag gates the HDR-detect
  sub-family vs `drc_gain` (look for an `numHDRexposure`/HDRMode read or a StaticSettings publish flag).
- **Absent/default in algo output → libaecCustom doesn't export it** ⇒ gate is in `camAECGetParam`'s
  output assembly (candidate 3): find where `aecOut+0xfc` (via `processExt` output `+4`) is or isn't
  copied into the GetParam output, and the condition.
This cleanly splits "algo exports but CamX drops" vs "algo never exports," which the static RE cannot
resolve (CamX node is stripped/by-ID; all blobs identical → the gate is runtime state). 

### Status
`+0x48` producer-gate model: **REFUTED on-device.** Config metadata-filter: **excluded** (identical +
same opMode, stock publishes at 0x8001 anyway). Gap **localized to the CamX AEC-node HDR-detect publish,
runtime-gated** (not blob/config). Exact flag pending the `camAECGetParam` split-probe.

### Stock-log premise CONFIRMED (candidate 1)
`live_capture.log` (stock, logical cam 4): **`HDRMode 1` ×218**, `isAutoHDREnabled = 1`, and
`ConfigureHDRInformation() ... Set HDR mode =1 numHDRExposure to:2` — i.e. **stock runs HDRMode=1 /
numHDRexposure=2 at the SAME stream opMode 0x8001 LOS runs.** So the publish discriminator is the
AEC **HDR-mode state** (HDRMode=1/numHDRexposure=2 on stock vs 0/absent on LOS), set by the
`+0x6544`-gated `LegacyUpdateStaticSettings` seeder — re-unifying the freeze with the no-JPEG root via
the `+0x6544`/HWMFHDR producer. Candidate 1's premise holds; the `+0x6544` force adjudicates it.

## FORCE-TEST PLAN — `+0x6544` adjudicates candidate 1 vs 2 (and the whole tree) in one on-device shot

**Tooling (ready in `tools/frida/`):**
- **`force_staticsettings_6544.js`** — forces `StaticSettings+0x6544=1` (+ `+0x6a28`/`+0x6a18` siblings)
  **synchronously at `LegacyUpdateStaticSettings` onEnter (device `0x372534`), BEFORE its gated block**,
  via the proven `SettingsManager::GetInstance()→getSettings(vtbl+0x10)` path (Frida-17:
  `Process.findModuleByName` + instance `findExportByName`; attach-by-PID to the provider, not spawn).
  Re-asserts each call + a 1 s backstop. Observers: `LegacyUpdateStaticSettings` count, `SetAutoHDRCapability`
  `EnableAutoHDR(p4)` read, gs.sm8850 GCVT-OEM `0xefb0c`→120. (Improves on the older `prove_6544.js`,
  which forced only on a 1 s interval and could race the configure.)
- **`probe_aec_getparam.js`** — split-probe: tallies the param-type IDs the CamX node requests from
  `libaecCustom!camAECGetParam` (resolve by export). Diff LOS-vs-stock: if the HDR/stats param-type is
  requested on LOS → node drops it downstream (CamX-side, candidate 1/2); if never requested → the
  request itself is HDR-mode-gated. (Secondary; runs alongside.)
- Run **alongside** `probe_aec_hdrdetect.js` (confirm `+0x48` stays 1) and `observe_getmetadata.js`
  (confirm `com.qti.stats_control.hdr_detected` rc 0 vs −2).

**Procedure (user fires):** `setenforce 0`; attach all probes to the provider PID; open camera.

**Outcomes:**
- **COHERENT (single root):** `+0x48`=1, SAHC `EnableAutoHDR`=PRESENT, hdr_detected→**rc=0**, GCVT→120/
  fusion, **preview un-freezes + JPEG** — all together ⇒ `+0x6544` (← `HWMFHDRSupported` cap) is THE
  single shippable root; fix = advertise `org.quic.camera.HWMFHDRSupported`/`isHWMFHDRSupported=1` in LOS
  static camera metadata so the loader sets `+0x6544=1` and the blob's atomic HDR seeder runs.
- **SIGABRT** (like the bare-EnableAutoHDR force) ⇒ the seeder needs a co-requisite the force skipped
  (sensor caps / submode) — escalate to the cap-advertise fix (coherent) rather than the runtime force.
- **PARTIAL** (e.g. EnableAutoHDR enables + GCVT 120 but hdr_detected still rc=−2, or publishes but still
  frozen) ⇒ **two roots**: the publish has an additional gate beyond HDR-mode (candidate 2, a separate
  CamX stats-publish setting) — then use `probe_aec_getparam.js` to localize the residual drop.

---

## FORCE-TEST RESULT (on-device, v19) — TWO ROOTS; mechanism corrected, lever confirmed

**Fired (user-greenlit). Result = TWO ROOTS.** The publish-gap localization (candidate 1) is CONFIRMED;
the freeze is a separate app-render root (not mine).

**WORKED** (forced the StaticSettings HDR gates on the provider, PID 1981):
- `com.qti.stats_control.hdr_detected` **rc=−2 → rc=0 (PUBLISHED)** — candidate 1 CONFIRMED: the publish
  IS HDR-mode/HW-MFHDR-gated, and a StaticSettings flag is its lever (it reads the forced settings).
- gs.sm8850 GCVT OEM override (`0xefb0c`) **→ 120 [FUSION] ~5500×** — first GCVT=120 ever on LOS; the
  no-JPEG fusion path responds to the SAME force. ⇒ **publish + fusion share one lever (root A).**

**DID NOT fix:** preview **STILL FROZEN** (byte-identical screencaps) WITH hdr_detected rc=0 + fusion
engaged. ⇒ **the freeze is a SEPARATE root, downstream in the app render path — NOT AEC-stats/publish.**
**Definitively kills the "freeze = AEC starvation" model.** (JPEG untestable — frozen UI won't drive
capture.) Root B = render path = a different workstream (app-side).

### Mechanism CORRECTIONS (empirical lever right; my static mechanism was wrong)
1. **`+0x6544`/`HWMFHDRSupported`/`LegacyUpdateStaticSettings` mechanism REFUTED on-device:**
   - `+0x6544` was **already 1** on LOS (read 1→1, no change) — so it's NOT the gate, and the
     `HWMFHDRSupported→+0x6544` derivation is moot.
   - `LegacyUpdateStaticSettings` **NEVER fired** (LUSS=0 the whole run — it runs once at provider-init,
     pre-attach). So the "LUSS seeder gated on +0x6544" model is REFUTED. **GCVT + the AEC publish read
     the forced StaticSettings DIRECTLY** (no seeder needed).
   - **The real lever = the siblings `+0x6a28` + `+0x6a18`** (0→1 on the force). In
     `ConfigureHDRInformation` these gate: `+0x6a28` → the SHDR-auto-exposure usecase branch
     (`if(*(settings+0x6a28)!=0 && HDRInfo+3==0) GetSHDRAutoExposureUsecase…`); `+0x6a18` → the
     HDR-mode-info path in the QHDRBokeh/AI branch. Both read 0 on LOS; =1 makes hdr_detected publish +
     GCVT 120.
2. **Prior "+0x6a28/+0x6a18 = enable3expSHDRSnapshot/setHDRMode" mapping REFUTED.** Decompiled the OPLUS
   `SettingsManagerImpl::UpdateOemSettings` (`opluscamxsettingsmanager.cpp`, libcamxsettingsmanager
   `0x1167e0`): in the shared StaticSettings struct, `enable3expSHDRSnapshot` = **+0x1e0**,
   `setHDRMode` = **+0x6a40**, `selectedDCGMode` = **+0x6a2c** (each via
   `GetBooleanConfiguration("OemCamxSettings", <name>, …)`). None is `+0x6a28`/`+0x6a18`. So the levers
   are **different, base-CamX StaticSettings** (NOT in the OPLUS OEM override layer).

### Root A fix — shippable, and how to finish naming the lever
- **Override vehicle CONFIRMED:** CamX reads **`/vendor/etc/camera/camxoverridesettings.txt`**
  (`OverrideSettingsFile`). Stock ships none (settings take compiled defaults) — but **the port can ship
  one to set the HDR StaticSettings natively (no frida)**, which is the clean root-A fix.
- **Name the exact `+0x6a28`/`+0x6a18` settings** (the one remaining precise item — they're base-CamX,
  not in the OPLUS OEM layer, so not yet name-mapped): use **`SettingsManager::WriteCamxSettingsToFile`**
  (libcamxsettingsmanager `0x113168`) — it dumps ALL settings name=value. Dump on **stock vs LOS** and
  diff the HDR/SHDR/MFHDR settings that are 1 on stock / 0 on LOS → those names = the `camxoverridesettings.txt`
  keys to ship. (Confirmed-overridable HDR keys to include regardless: `enable3expSHDRSnapshot=1`,
  `setHDRMode=<stock value>`, plus the base `EnableAutoHDR`/`EnableHDRDCGMode`/`EnableSportHDRMode`/
  `EnableOfflineSHDR` strings present in camera.qcom.core.)
- **Why 0 on LOS** (open): the base-CamX HDR settings default differs effectively (stock=1 path engaged,
  LOS=0). Since the blob/defaults are identical, the 1-on-stock must come from either a stock-shipped
  override/prop or a cap-derivation — the `WriteCamxSettingsToFile` stock↔LOS diff settles which.

### Status
Root A (no-JPEG / hdr_detected publish + fusion): **lever proven** = StaticSettings `+0x6a28`/`+0x6a18`;
fix vehicle = `camxoverridesettings.txt`; exact key names pending the `WriteCamxSettingsToFile` stock↔LOS
diff. Root B (preview freeze): **separate app-render root**, NOT AEC-stats — other workstream.
`+0x6544`/`LUSS`/`HWMFHDRSupported` and the `enable3exp/setHDRMode↔6a28/6a18` mapping: **refuted on-device.**

### Settings-dump tooling — name +0x6a28/+0x6a18 + settle natural-vs-cached (`tools/frida/dump_camxsettings.js`)
`SettingsManagerImpl::WriteCamxSettingsToFile` (libcamxsettingsmanager Ghidra `0x113168` → runtime `+0x13168`,
**not exported** → call by offset) writes **every setting as `name=value`** to
`<GetCoreDumpDirectoryPath()>/camxsettingsdump.txt` (→ **`/data/vendor/camera/camxsettingsdump.txt`**).
Built-in trigger = a core-dump-text setting (`enableCameraCoreDumpText` / `enableCoredumpOfflineTextLogging`);
cleanest = frida-call it via the exported `SettingsManager::GetInstance` singleton.

`dump_camxsettings.js` (node-check OK): resolves `GetInstance()→getSettings(vtbl+0x10)`, **(1)** reads the
HDR-lever offsets directly (`+0x6a28`,`+0x6a18`,`+0x6a40` setHDRMode,`+0x1e0` enable3exp,`+0x6a2c`
selectedDCGMode,`+0x6544`) so you get offset→value on THIS boot, then **(2)** calls
`WriteCamxSettingsToFile` for the full name=value dump. Procedure:
1. **Clean-boot LOS** (no force), open camera, run the script → note the `[HDR offsets]` line. **If
   `+0x6a28`/`+0x6a18` read `1` here, root A is already satisfied naturally on v19** (matches the
   clean-boot natural-fusion observation) and the camxoverridesettings fix is "make-explicit," not
   "unblock." If they read `0`, the natural fusion came from app-cached HDR-capability (re-test needed).
2. `adb pull /data/vendor/camera/camxsettingsdump.txt` on **LOS and a stock unit**; diff the HDR/SHDR/MFHDR
   `name=value` lines that are `1`(stock)/`0`(LOS) → those names = `+0x6a28`/`+0x6a18` = the
   `camxoverridesettings.txt` keys to ship at `/vendor/etc/camera/camxoverridesettings.txt`.
   (Correlate names↔offsets via the `[HDR offsets]` values the script also prints.)

### DUMP RESULT (clean-boot LOS, no force) — CACHED confirmed; keys named
Clean-boot `[HDR offsets]`: `+0x6a28`=**0**, `+0x6a18`=**0**, `+0x6a40 setHDRMode`=**0**,
`+0x1e0 enable3expSHDRSnapshot`=**0**, `+0x6544`=**1**. ⇒ **the levers are 0 naturally → the clean-boot
GCVT=120/fusion was APP-CACHED HDR request (drives graph selection), NOT the provider StaticSettings.**
**`camxoverridesettings.txt` is "UNBLOCK", not just "harden."** Dump = `name (hash) = value`, 1061
settings, at `/data/vendor/camera/camxsettingsdump.txt` (saved `/tmp/camxsettingsdump_LOS.txt`).

**`+0x6a28` NAMED:** `selectSHDRAutoExposureUsecase` (hash `0xDC4EAFC3`) = 0 — **the proven publish+fusion
lever.** The HDR/SHDR cluster that is **0 on LOS** (candidates) vs the few already **1**:

| 0 on LOS (enable candidates) | already 1 |
|---|---|
| `selectSHDRAutoExposureUsecase` ★(+0x6a28), `setAutoHDRMode`, `setHDRMode` (+0x6a40), `isSHDRFusionOffline`, `enableSportHDRMode`, `enableSWMFHDR`, `enable3expSHDRSnapshot` (+0x1e0), `overrideReqNumHDRExposure`, `selectedDCGMode` (+0x6a2c) | `MFHDRHWEnable`, `enableHWMFHDRSnapshot`, `enableAutoHDRCapability`, `enableGyroHDRAlignment`, `enableFrameworkHDR10P`, `enableDolbyVisionHDR` |

**`+0x6a18` (the HDR-mode-info gate, 2nd forced lever):** NOT yet name-pinned — it's a base-CamX setting
in `camera.qcom.core`'s descriptor (the dump isn't offset-ordered, so position can't map it; static RE
of the 98 MB stripped blob is expensive). **Strongest candidate = `setAutoHDRMode`** (hash `0xA49DE767`,
=0) — semantically the "HDR mode" setting matching the `GetPhysicalDeviceHDRModeInfo` gate. Confirm
cheaply on-device (below) rather than by blob RE.

---

## Inferences & Open (UNVERIFIED — heavy-check)
> Per the interop-tree trunk axiom, a measured stall SITE is never a verified ROOT. The items below
> are attributions and hypotheses — some REFUTED on-device, some still open. The Ghidra decompile
> facts (offsets, struct layouts, call paths), the on-device probe counts, and the force-test results
> above are real measurements; the conclusions drawn from them here carry the listed status.

### REFUTED HYPOTHESIS: "+0x48 is the lever" — static RE conclusion (REFUTED on-device)

**What the static RE concluded:** Since libaecCustom is byte-identical stock↔LOS yet stock publishes
hdr_detected and LOS doesn't, `*(aecCtx+0x48)` must be 0 on LOS — gating out `HDRDetectProcess`
entirely. The lever = whatever sets `+0x48` at configure time (the configure-time HDR/SHDR request
selecting the HDR-capable AEC tuning/usecase). This would unify AEC-stats with the SHDR-submode chain
as two consumers of one configure-time HDR request.

**Why REFUTED:** On-device probe (`probe_aec_hdrdetect.js`, libaecCustom PID 1981): `HDRDetectProcess`
fired **954×**, `*(aecCtx+0x48) == 1` on EVERY frame, `HDRTriggerFlagDetection` ran 954× — in NORMAL
preview (`dol.states=0`). The FORCE was a no-op (`+0x48` was never 0). The AEC COMPUTES hdr_detected
every frame. The gate was not blocking. (Measured on-device, same session.)

**What the static RE got right:** The detector IS mode-agnostic (BGSat path runs on normal preview
statistics) — consistent with on-device result. The `+0x48` field and its chromatix-copy origin
(`setTuningData` memcpy from `pProcExtTuning` chunk) are real structural facts. The hypothesis
about which tuning-mode dimension sets it was wrong about the runtime value.

---

### REFUTED HYPOTHESIS: PROBE-S7 PRODUCER — `+0x6544`/`LegacyUpdateStaticSettings` as single root

**What the static RE concluded:** The configure-time HDR request is produced by a PROVIDER seeder
`ChiMcxDeviceCaps::LegacyUpdateStaticSettings(LogicalCameraInfo&)` (`com.qti.chi.override.so` Ghidra
`0x472534` / device `0x372534`, thunk `0x266e50`), gated on `StaticSettings+0x6544==1`. On LOS that
flag was assumed to be 0, so the seeder would be skipped and the entire HDR chain (AEC
`+0x48`/hdr_detected AND the SHDR submode/JPEG) would stay dark from one root.

The decompile-verified gate and write (fresh decompile):
```c
sett = SettingsManager::GetInstance()->getSettings();   // vtbl+0x10
if (*(int*)(sett + 0x6544) == 1) {                       // ★ master HW-MFHDR static enable
    resolve("org.codeaurora.qcamera3.sessionParameters","HDRMode",&id);
    pool->SetTag(id, &val, 1,0,1);                        // pool = session-param ChiMetadata (vtbl+0x50)
    ... resolve+SetTag: numHDRexposure, EnableAutoHDR, HDRModes(dims from supportedHDRmodes cap), ...
}
```
Confirmed token deltas inside the `+0x6544` block: `HDRMode` (+142), `numHDRexposure` (+1960),
`EnableAutoHDR` (+5656), `supportedHDRmodes` (+18791).

The proposed chain:
```
StaticSettings+0x6544 == 1
   └─ LegacyUpdateStaticSettings (0x472534) seeds {EnableAutoHDR, HDRMode, numHDRexposure=2, HDRModes}
        into the configure session-param ChiMetadata pool
        ├─ ConfigureHDRInformation (0x4d5ff8) → SetAutoHDRCapability (0x5085a0):
        │     reads EnableAutoHDR==1 && isAutoHDRSupported==1 → HDRInfo+0x18=1 ("AutoHDR is enabled")
        │     → PopulateHDRSessionParameters → HDRmode=1, numHDRexposure=2
        │       └─[JPEG path] numHDRexposure→DesiredSensorMode HDR-exposure→IsMatchingHDRExposureType
        │                     → SHDR(2EXP) sensor submode (PROBE-S7-keystone) → Fusion graph → JPEG
        └─[PREVIEW path] HDR usecase/numHDRexposure → CamX AEC TuningMode HDR dimension
              → chromatix ProcExt chunk with HDR-detect enable=1 → setTuningData copies it
              → *(aecCtx+0x48)=1 → HDRDetectProcess runs → hdr_detected published (rc=0)
              → APS preview-decision completes → APS emits preview output → SurfaceView renders (un-freezes)
```
`DefaultRequestSettings` (`0x4e164c`) seeds these same keys with default **0** — so without the
`+0x6544`-gated LUSS pass, the gate reads 0/NOT-FOUND. (`EnableMFHDR` `0x3ec414` also reads `+0x6544`.)

The LOS gap (named in the static model): the strong hypothesis was that `+0x6544` is DERIVED at
settings-load from `org.quic.camera.HWMFHDRSupported`/`isHWMFHDRSupported` — the one HDR cap not yet
verified on LOS. If LOS doesn't advertise it (or it's 0), the loader would set `+0x6544=0` → seeder
skipped. App tag `com.oplus.auto.hdr.enable` = category-4 (preview/capture, =1 on LOS) — not what
gates LUSS. `EnableAutoHDR` resolves rc=0 on LOS.

The shippable fix proposed: advertise `org.quic.camera.HWMFHDRSupported`/`isHWMFHDRSupported=1` in
LOS static camera metadata so the CamX settings loader sets `+0x6544=1` → LUSS seeds the whole HDR
session-param set coherently → SHDR submode + AEC `+0x48`=1 + hdr_detected all follow.

**Why REFUTED on-device (force-test results):**
- `+0x6544` was **already 1** on LOS (read 1→1, no change) — so it is NOT the gate, and the
  `HWMFHDRSupported→+0x6544` derivation is moot.
- `LegacyUpdateStaticSettings` **NEVER fired** (LUSS=0 the whole run — it runs once at provider-init,
  pre-attach, and was never observed seeding). The "LUSS seeder gated on +0x6544" model is REFUTED.
- The real lever proved by the force-test = siblings **`+0x6a28`** (`selectSHDRAutoExposureUsecase`,
  0→1) + **`+0x6a18`** (0→1). GCVT + the AEC publish read the forced StaticSettings directly — no
  seeder needed.
- Prior `enable3expSHDRSnapshot/setHDRMode↔+0x6a28/+0x6a18` name mapping also refuted: decompiled
  `SettingsManagerImpl::UpdateOemSettings` shows `enable3expSHDRSnapshot`=`+0x1e0`,
  `setHDRMode`=`+0x6a40`, `selectedDCGMode`=`+0x6a2c` — none is `+0x6a28`/`+0x6a18`.

**What the static RE got right:** The `LegacyUpdateStaticSettings` function exists at that address and
does gate on `+0x6544` (the decompile is accurate). `ConfigureHDRInformation`/`SetAutoHDRCapability`/
`PopulateHDRSessionParameters` anchors remain valid. The `DefaultRequestSettings` default-0 behavior is
real. The decompile evidence is preserved as structural reference even though the runtime mechanism
differed.

**Anchors (preserved for reference):**
- `LegacyUpdateStaticSettings` Ghidra `0x472534` / device `0x372534` (thunk `0x266e50`).
- `ConfigureHDRInformation` `0x4d5ff8`, `SetAutoHDRCapability` `0x5085a0`,
  `PopulateHDRSessionParameters` `0x5086xx`, `DefaultRequestSettings` `0x4e164c`,
  `EnableMFHDR` `0x3ec414`, `ModifySettings` `0x4e1138` (does NOT set `+0x6544`).
- Cross-refs: PROBE-6a28-autohdr-staticenable, PROBE-config-diff-autohdr, PROBE-autohdr-writer-search,
  PROBE-chi-enableautohdr-resolve, PROBE-ocs-autohdr-request-origin, PROBE-S7-desiredsensormode-keystone,
  E2E-snap-progress SESSION 4, memory `root-aec-stats-hdr-detected-missing`.

---

### ROOT-A FIX DRAFT (CANDIDATE — lever confirmed, exact key set pending; moved from body Pass-C)

> The `+0x48` producer-gate model this draft originally rested on was REFUTED on-device (see REFUTED
> HYPOTHESIS above). The camxoverridesettings.txt vehicle and the `+0x6a28`/`+0x6a18` levers ARE
> confirmed by the force-test (measured). The specific key names and the full set below are CANDIDATE
> — not shippable until the +0x6a18 name is confirmed and the PARTIAL/COHERENT outcome is settled.

Ship `/vendor/etc/camera/camxoverridesettings.txt` (stock ships none → CamX falls back to compiled
defaults; the override sets them explicitly). CamX format = one `key=value` per line, parsed by
`OverrideSettingsFile`. **Minimal proven + candidate:**
```
# LOS root-A: unblock SHDR-fusion + com.qti.stats_control.hdr_detected publish (doc 45).
# Provider StaticSettings read these directly (LegacyUpdateStaticSettings does NOT run pre-config).
selectSHDRAutoExposureUsecase=1     ; +0x6a28 — PROVEN publish+fusion lever (force-test)
setAutoHDRMode=1                    ; +0x6a18 CANDIDATE (HDR-mode-info gate) — confirm (see below)
```
**Fuller coherent HDR-session set** (add if the pair is insufficient — these are the stock-implied HDR
enables that are 0 on LOS; matches stock `HDRMode=1`/`numHDRexposure=2`/`OplusSATFusionOfflineReprocess`):
```
setHDRMode=1                        ; +0x6a40 (stock log: "Set HDR mode =1")
isSHDRFusionOffline=1               ; offline SHDR fusion (OplusSATFusionOfflineReprocess)
enableSportHDRMode=1
```
> Keep the set MINIMAL — over-enabling SHDR/DCG settings can destabilize. Start with the proven
> `selectSHDRAutoExposureUsecase=1` (+ the confirmed `+0x6a18` key); add the fuller set only if needed.

**Confirm `+0x6a18` cheaply (instead of camera.qcom.core RE):**
Re-run `force_staticsettings_6544.js` variant that forces **only** `selectSHDRAutoExposureUsecase`
(struct `+0x6a28`) and leaves `+0x6a18` at 0:
- publish+fusion still work ⇒ `+0x6a28` alone is the lever → override = just `selectSHDRAutoExposureUsecase=1`.
- they regress ⇒ `+0x6a18` is also required → force each `=0` HDR candidate (start `setAutoHDRMode`) at
  the SAME struct offset `+0x6a18` (write `settings.add(0x6a18)`) and read which dump setting flips to 1
  → that names `+0x6a18` exactly.

Note: F3 (docs/facilitation/F3-toggles-config.md) authoritatively DOWNGRADED `selectSHDRAutoExposureUsecase`
as a red herring (X1) based on C5 session facts (0× in-scene across N=3 daytime HDR scenes). Reconcile
with the force-test result (+0x6a28 forced → publish works) before shipping. The lever is real in a forced
context; whether it is the correct natural-session fix is the open question F3/X1 raises.

---

### INFERENCE (open): "gap is result-PUBLISH, gated on HDR-mode state" — candidate 1 vs 2 unresolved

**The measured facts:** AEC COMPUTES hdr_detected (954×, `+0x48`==1). APS reads hdr_detected → rc=-2
(missing). Both blobs md5-identical stock↔LOS. Config metadata filter identical + stock publishes at
opMode 0x8001 (same opMode LOS runs) → filter is not the discriminator. Force-test: setting
`+0x6a28`/`+0x6a18` → hdr_detected rc=0 (confirmed).

**The inference:** The gap is in the CamX AEC-node HDR-detect publish, runtime-gated. Two candidate
gates (open):
1. **CamX AEC-node publish gated on HDR-mode/`numHDRexposure` state** — the node may write the
   HDR-detect `stats_control` sub-family only when the session AEC is in an HDR mode
   (`numHDRexposure>1` / HDRMode set), which on LOS is off. The stock-log evidence supports this:
   `HDRMode 1` ×218, `isAutoHDREnabled=1`, `Set HDR mode=1 numHDRExposure to:2` — stock runs
   HDRMode=1/numHDRexposure=2 at opMode 0x8001. Candidate 1's premise holds; the `+0x6544`/`+0x6a28`
   force adjudicates it.
2. **A CamX stats-publish setting/override** (a StaticSettings field sibling of the HDR family that
   reads 0 on LOS) gating "publish AEC HDR/debug stats."

**Decisive split-probe (pending):** Hook `libaecCustom!camAECGetParam` (`0x0bae78`) during the freeze
and inspect the AEC output struct the CamX node retrieves — is the hdr_detected field present/non-
default in the algo's output to CamX? Present → CamX drops it (gate is CamX-side, candidate 1/2);
absent → libaecCustom doesn't export it (candidate 3, eliminated by static RE but verify).

---

### Fix-locus conclusion from ADDENDUM (STATIC INFERENCE, SUPERSEDED by on-device result)

**What it concluded:** The fix is NOT in libaecCustom (verbatim tuning consumer) and NOT a per-frame
GOT-force of `+0x48`. The real fix is to make LOS issue the configure-time HDR/SHDR usecase request
that sets the AEC TuningMode HDR dimension — the PROBE-S7 production lead.

**Status:** The PROBE-S7 PRODUCER model this rests on was REFUTED (see above). The directional
conclusion that "the fix is at configure-time" remains consistent with the force-test result
(`+0x6a28`/`+0x6a18` at configure → publish works), but the specific mechanism (LUSS/`+0x6544`) was
wrong. The current fix vehicle is `camxoverridesettings.txt` with `selectSHDRAutoExposureUsecase=1`
(and the pending `+0x6a18` confirmation), not the HWMFHDRSupported cap advertise.
