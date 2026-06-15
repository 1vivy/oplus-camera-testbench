<!-- STATUS: VERIFIED — evidence-anchored (Ghidra/device capture); no inference-surgery needed (doc-50 method). -->
# AEC `hdr_detected` compute/publish path (Ghidra-recovered, OOS `.201`)

> Re-validates doc-45's `HDRDetectProcess` gate + `HDRTriggerFlagDetection` producer from the stock
> blob, fresh import. Confirms the static mechanism with **zero offset drift** vs doc-45.
> Per doc-47's correction: hdr_detected is a **#2 PUBLICATION** contract (rc=-2 absent), NOT the #1
> freeze root — this note proves the *compute/export*; the live #2 gap is the downstream CamX
> AEC-node publish, runtime-gated (out of this blob's scope; do not re-chase it as the freeze cause).
>
> Date: 2026-06-13 · Binary: `dump201_full/odm/lib64/libaecCustom.so`
> (full path `/home/vivy/op15-work/dump201_full/odm/lib64/libaecCustom.so`)
> `OPlus_AEC_Core_V4.0` (ProcExt/ExtHdrDetect.cpp path strings retained). AArch64 PIE, **fully
> stripped** (.symtab + .dynsym names gone — only the 7 `camAEC*` exports named; internal funcs are
> `FUN_*`). BuildID **`d0204b3e6a969b87e90361af5127dce86e07953a`**, md5(file)
> **`f8fb639d4ea28638489b968613d6e25d`** — both **identical to doc-45** (so the on-device offset
> validity it claims holds). 1,073,824 B. · Ghidra image_base **0x100000** (device addr =
> Ghidra addr − 0x100000). · Tool: ghidra-mcp (project `oos-baseline-v3`).
>
> Note on method: auto-analysis named only the exports; the two HDR functions had no carved boundary,
> so I created functions at the doc-45 addresses (`0x1b4d8c`, `0x1ed7e4`) and decompiled — both
> disassembled cleanly into the exact code doc-45 described.

## TL;DR — AGREE with doc-45 (mechanism + every offset)
`HDRDetectProcess @ 0x1b4d8c` reads `*(*aecCtx+0x48)` and early-returns doing nothing when 0; its
gated body computes the EV/sat-ratio family and **calls `HDRTriggerFlagDetection @ 0x1ed7e4`**, which
writes the HDR-detect flag at `aecOut+0xfc` keyed on `tuning+0xd0` (`enableHDRDetectionByBGSat`):
BGSat over-exposure-ratio path vs motion path. Confirmed verbatim. Exports `camAECInit/Process/GetParam`
land at the exact doc-45 addresses (zero drift). One polarity nuance reported below.

## 1. `HDRDetectProcess` @ Ghidra 0x1b4d8c / device 0x0b4d8c — the master gate (CONFIRMED)
First instructions decompile to doc-45's exact gate:
```c
lVar13 = *param_2;                              // param_2 = per-frame AEC ctx; *param_2 = active tuning struct
fVar8  = *(float *)((long)param_2 + 0x104);
if (*(int *)(lVar13 + 0x48) == 0) goto LAB_001b5978;   // <-- HDR-DETECT MASTER ENABLE; if 0, return doing NOTHING
```
`LAB_001b5978` is the bare epilogue (return). The skipped body (when `+0x48 != 0`) computes
hdrEVMinus / EV-with-HDR / sat-ratio, emits the `[HDRDBG]`/`HDRDetectProcess` logs, writes the
HDR-output family at `aecOut+{0xe0,0xe4,0xe8,0x10c,0x110,0x154,0x158,0x15c,0x16c,0x198,0x19c,…}`,
and **calls `FUN_001ed7e4(fVar18, param_1, param_2)` = HDRTriggerFlagDetection** (the decision writer).
Source string `…/core/ProcExt/ExtHdrDetect.cpp` present throughout → file identity confirmed.
⇒ AGREE: `+0x48 == 0` ⇒ none of the HDR outputs (incl. `aecOut+0xfc`) is produced by this path.

## 2. `HDRTriggerFlagDetection` @ Ghidra 0x1ed7e4 / device 0x0ed7e4 — the producer (CONFIRMED, polarity refined)
`FUN_001ed7e4(float, long aecOut, long *ctx)`. `lVar7 = *param_3` = tuning. Writes the decision flag
at **`aecOut+0xfc`** on every path (param_2 = aecOut), select on **`tuning+0xd0`**:
```c
if (*(int *)(lVar7 + 0xd0) == 0) {                 // tuning+0xd0 = enableHDRDetectionByBGSat
    // BGSat path: pure over-exposure-ratio test on THIS frame's stats (adrcGain/darkboost/overExpRatio)
    if (all overExpRatio thresholds met && aecOut+0x11bc != 1) aecOut[0xfc] = 0;  // (HDR-trigger case)
    ...
    aecOut[0xfc] = 1;                              // default/fall-through
} else {
    aecOut[0xfc] = FUN_001d2794(aecOut, ctx, &local);   // motion-augmented path ("Hdr triggered by motion")
}
// late override, both paths:
if (1.0/exp(param_1) <= hdrEVMinus) aecOut[0xfc] = 0;    // "Exposure of hdrEVMinus larger than short target"
```
The `[HDRDBG] enableHDRDetectionByBGSat: %d adrcGain/…/overExpRatio/triggerPct` log prints
`*(int*)(lVar7+0xd0)` = tuning+0xd0 — exactly doc-45. **No DOL/sensor-mode/HDR-session guard** — pure
scene statistics, so the detector is mode-agnostic (computable on normal preview), matching doc-45 and
the on-device v19 observation (`HDRDetectProcess` fired 954× in NORMAL preview).

> **REFINEMENT vs doc-45 §2 pseudocode (polarity):** doc-45 wrote "if thresholds met → aecOut[0xfc]=0/HDR;
> else =1". The actual BGSat branch sets `0xfc = 0` in the *trigger* case and `= 1` as the default — the
> numeric 0/1 mapping is the reverse of doc-45's gloss, but doc-45's load-bearing claim ("**written
> unconditionally each call** at `aecOut+0xfc`, selected on `tuning+0xd0`") is **correct**. No drift in
> the offsets, only in the 0/1 narration.

## 3. Export anchors — zero drift vs doc-45
| Symbol | Ghidra (this import) | doc-45 device | match |
|---|---|---|---|
| `camAECInit` | `0x168270` | `0x068270` | ✓ |
| `camAECProcess` | `0x1b35ac` | `0x0b35ac` | ✓ |
| `camAECGetParam` | `0x1bae78` | `0x0bae78` | ✓ |
| `HDRDetectProcess` (FUN) | `0x1b4d8c` | `0x0b4d8c` | ✓ |
| `HDRTriggerFlagDetection` (FUN) | `0x1ed7e4` | `0x0ed7e4` | ✓ |

(`camAECSetParam 0x1a9668`, `camAECRelease 0x1c923c` also present.) Image base 0x100000 → device =
Ghidra − 0x100000, confirmed. **All doc-45 offsets are accurate against this binary.**

## 4. Is hdr_detected gated unpublished on a non-HDR scene? (the #2 "rc=-2" story)
Within **this blob**: NO publication gate — the algo writes `aecOut+0xfc` whenever `HDRDetectProcess`
runs (i.e. whenever `+0x48 != 0`). doc-45's own addendum + doc-47's on-device correction establish:
- `+0x48` is a verbatim chromatix-tuning copy (`setTuningData`/`processExt`, ProcExt chunk), not a
  per-frame compute — and on v19 it read **1** every frame, so `HDRDetectProcess` *does* run and
  `aecOut+0xfc` *is* written (954×) even on a non-HDR scene.
- The export `processExt` writes `*(output+4) = *(aecOut+0xfc)` **unconditionally** (doc-45 v19), so
  libaecCustom always *exports* hdr_detected to `camAECGetParam @ 0x1bae78`.
⇒ The rc=-2 (absent in app-visible result metadata) is therefore **NOT** in this blob — it is the
downstream **CamX AEC-node `com.qti.stats_control` publish** (by numeric tag ID, in `camera.qcom.core`,
stripped), runtime-gated on HDR-mode state (`selectSHDRAutoExposureUsecase`/StaticSettings `+0x6a28`,
proven on-device to flip rc=-2→rc=0). This blob both **computes and exports**; the drop is in the node.

## Verdict
**AGREE with doc-45** on the static mechanism and **all offsets** (zero drift; BuildID/md5 identical).
The gate (`*(*aecCtx+0x48)==0 → no-op`) and the producer (`aecOut+0xfc`, BGSat-vs-motion on `tuning+0xd0`)
are exactly as documented. Per doc-47, this is a #2 **publication** contract, not the #1 freeze root:
the static RE confirms compute+export are intact; the unpublished-on-non-HDR-scene behavior lives in the
CamX node's HDR-mode-gated `stats_control` publish (out of this blob), the lever being
`selectSHDRAutoExposureUsecase` per C5/E3 — **not** re-chased here as a freeze cause.

— pairs with the 1b "hdr_detected publish=present" capture (the contract this static path feeds: the algo
produces+exports `aecOut+0xfc`; whether it reaches result metadata = the CamX-node publish gate the 1b run
showed present, the StaticSettings HDR-mode lever being on for that capture).
