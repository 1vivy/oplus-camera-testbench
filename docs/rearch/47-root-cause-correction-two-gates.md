<!-- STATUS: VERIFIED — evidence-anchored RE/capture; no inference-surgery needed (doc-50 method). -->

# 47 — ROOT-CAUSE CORRECTION (READ FIRST): two independent gates, capture is NOT blocked

> **Status: AUTHORITATIVE as of 2026-06-12. Supersedes the root-cause framing in docs 39, 40, 44, 45.**
> If you are a future session diagnosing "camera unreliable / preview freeze / over-exposure / green
> photos / AIUnit pop-up", read THIS doc before 39–45. Those docs contain valid RE but reached an
> over-unified conclusion ("one gate explains everything") that the **runtime log material refutes**.
>
> Derived by re-mining the last session's raw logs for material evidence (NOT the docs' conclusions):
> `~/op15-work/freeze_verbose_1781142562.log`, `ocslog_1781146046.log`, `ocslog2/3`, all 2026-06-10 (v19).

## TL;DR — what is actually true

1. **Capture / fusion is ALIVE and NOT gated.** The offline fusion graph runs cleanly at shutter.
   Whatever blocks reliable JPEG, it is **not** the `hdr_detected` AEC gate. doc-45's "one gate →
   no fusion/JPEG" is an **overreach** — corrected here.
2. **There are TWO independent gates, not one:**
   - **Gate A (HDR/exposure):** AEC `hdr_detected` is never computed → always-non-HDR + over-exposure.
     Real, and downstream-confirmed in logs. Does **not** block capture.
   - **Gate B (freeze):** app-side **preview-frame delivery starvation** — HAL produces preview,
     the app renders zero frames. This is the freeze. Its link to Gate A is **plausible but UNPROVEN**.
3. **The freeze and the capture path are independent** → this is why it's "frozen except on capture":
   shutter punches a JPEG through a frozen preview via the separate offline path.
4. **AIUnit pop-up + some "missing service" behavior = absent components** (v18 dropped AIUnit; the
   pantanal UMS provider is also absent). Separate from A/B.
5. **The oplus-permission pop-up did NOT reproduce in the logs.** Definer is wired in source → suspect
   stale flash or a non-OEM runtime permission. Lowest confidence; needs on-device repro.

## Material evidence (quoted from the v19 logs)

**Capture/fusion alive, HDR off, GCVT now present** — `ocslog_1781146046.log` @ 20:47:25, reqID 238–241:
```
node OplusSATFusionOfflineReprocess0_IPE0, apsFeatureType 50 ... IsCaptureRequest 1
GetPruneDecisionFactors() ... customVendorTag 120 ... captureType 0
OplusOverrideIPETuningMode() featuretype 50 ... captureHDR:0, previewHDR:0
OplusOverrideOFECustomizeTrigger() ... expRatioIn2DOL 5.719994, totaldrcgain 5.719994
```
- `customVendorTag 120` is **PRESENT** → the old "GCVT=0 still-capture root" is **RESOLVED**. Do not re-chase it.
- `captureHDR:0 previewHDR:0`, `featuretype 50` (non-HDR) on every frame = Gate A footprint, yet the
  fusion graph still runs and processes the capture.

**Preview never reaches the app (the freeze)** — same session:
- `onCaptureCompleted / onPreviewFrame / updatePreview` delivery callbacks = **0**.
- In-app filter SDK runs with `preview_width, 0 / preview_height, 0 / texture_data_space, 0 / format, 0`.
- Display: `colorMode 0` (SRGB), `hdrSdrRatio NaN`; **zero** extended-range/EDR/HLG calls anywhere.
- HAL producer healthy at freeze tail (`freeze_verbose` end): `MvgSatEngine.cpp:927 Process()` + `QnnDsp` (pid 17899).
- ⇒ **producer alive, consumer delivering nothing.**

**AIUnit** — `freeze_verbose` + `ocslog`, repeating every ~4 s:
```
ActivityManager: Unable to start service Intent { act=oplus.intent.action.AIUNIT_SERVICE
  cmp=com.oplus.aiunit/.core.AIUnitService } U=0: not found
AIUnit-SDK(camera)-ServiceManager: handleConnectTimeout
AIUnit-SDK(camera)-ScanClient: onServiceConnectFailed: 62 / runAction no connected!
```

**Other absent component** — `Failed to find provider com.oplus.pantanal.ums.decision for user 0`.

**apsfixup active** — `ocslog2`: `hooked p010LSB2MSBNeon GOT @0x728b748ba8` / `libapsfixup loaded (sm8850 P010 plane-layout fix)`.

**No permission denial** — zero `OPPO_COMPONENT_SAFE` / `SecurityException` hits; only benign `AppOps: attributionTag not declared` spam.

## What is corrected vs docs 39–45

| Doc | What it claimed | Correction (this doc) |
|---|---|---|
| 39 | Freeze = GraphicBufferWrapper / HardwareBuffer leak | Already self-refuted; freeze is preview **delivery** starvation, not a leak. |
| 40 | Freeze = app delivery chain (ImageReader→GL→SurfaceView); EDR no-op = over-exposure; `setExtendedRangeBrightness` candidate fix | Delivery-starvation framing **correct** and upheld (Gate B). EDR candidate fix remains **UNPROVEN** (zero extended-range calls in logs). Over-exposure is Gate A, *separate* from freeze. |
| 44 | libAlgoProcess in-app APS preview-decision engine drives the freeze | Plausible mechanism for Gate B, **not yet proven** to be the delivery blocker. |
| 45 | `*(aecCtx+0x48)==0` AEC gate = **ONE gate** → preview freeze **+ no fusion/JPEG** | **Split required.** Gate A (hdr_detected) is real for HDR/exposure and downstream-confirmed, but **fusion/JPEG run without it** (material). "One gate / no JPEG" = overreach. A→B link is the open question. |

## Per-symptom verdict

| Symptom | Root cause | Confidence |
|---|---|---|
| App freeze / preview frozen | **Gate B**: app-side preview-frame delivery starvation (HAL produces, app renders 0) | High (effect); A→B mechanism unconfirmed |
| Frozen except on capture | Offline fusion path independent of starved realtime preview | High |
| AIUnit-missing pop-up | AIUnitService absent (v18 dropped AIUnit) → SDK connect-timeout loop | High |
| Photos green, same mode | P010 plane-lock heuristic miss (doc-42 accepted residual); shim loads, window non-deterministic | Medium (no green-specific frame in this session's logs) |
| Over-exposure | **Gate A** (no `hdr_detected`) + SDR prop-stopgap; EDR never engaged | High |
| Missing oplus-permission pop-up | NOT reproduced; definer wired in source → stale flash or non-OEM runtime perm | Low — needs on-device repro |

## THE single decisive open action (collapses A vs B)

Run **`tools/frida/probe_aec_hdrdetect.js`** on a stable device session:
1. Confirm `*(aecCtx+0x48)==0` every frame (gate is closed) — `HDRDetectProcess` Ghidra `0x1b4d8c` / device `0x0b4d8c`.
2. Force `+0x48` non-zero; re-hook `HDRTriggerFlagDetection` (`0x0ed7e4`) to see `hdr_detected` compute.
3. **Observe preview:**
   - If preview **un-freezes** → doc-45's A→B unification holds; fix = enable the AEC HDR-detect tuning.
   - If `hdr_detected` appears but preview **stays frozen** → Gate B is a separate app delivery/render
     defect; the freeze fix lives in the consumer path (ImageReader/GL/SurfaceView, doc-40 lane), NOT the AEC.

This probe was **specified but never run** in the last session (no probe output in any log). It is the
highest-value next step and the prerequisite for trusting any freeze fix.

## Do-not-re-chase list (resolved / refuted, to stop cross-session loops)

- `customVendorTag 120` missing / GCVT=0 → **RESOLVED** (120 present in v19 logs).
- GraphicBufferWrapper / HardwareBuffer leak as freeze cause → **REFUTED** (doc-39/40).
- "hdr_detected gate blocks JPEG" → **REFUTED** (fusion runs without HDR; capture works).
- Identity relay (com.oplus.packageName → CameraAPPType) as metadata/JPEG cause → **REFUTED** (PROBE-R1c; perf axis only).

## Caveat / out of scope

No build/flash fingerprint was recoverable from these logs, so the project's recurring **stale-partition**
failure mode (live image ≠ current source) can neither be confirmed nor excluded as a compounding factor
for the run-to-run unreliability. Verify the live partitions match the intended build before attributing
each symptom purely to source.

## Anchors
- AEC gate: `HDRDetectProcess` Ghidra `0x1b4d8c` / device `0x0b4d8c` — `if(*(*ctx+0x48)==0) return`. Producer `HDRTriggerFlagDetection` `0x0ed7e4`. (libaecCustom.so, base 0x100000) — doc 45.
- Probe: `tools/frida/probe_aec_hdrdetect.js`.
- Topology / fix slotting: doc 46. P010 heuristic residual: doc 42. EDR/over-exposure lane: doc 40.
- Source logs: `~/op15-work/{freeze_verbose_1781142562,ocslog_1781146046,ocslog2_1781146091,ocslog3_1781146321}.log` (2026-06-10).
