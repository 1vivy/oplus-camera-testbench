<!-- STATUS: MIXED — inference-surgery applied 2026-06-14. Verified body = directly observed on-stock facts
     (frida trace on stock OOS CPH2747, pre-flash, `trace_edr_invocation.js`): getBlastSurfaceControl fires
     ×58 returning REAL BLAST Surface; setEdrFlags=0x80101 observed; setEdrSdrRatio adaptive 1.34→1.89 ×34;
     setEdrViewTransform 0 fires across full capture. All "reframes R3," mechanism attributions, and forward
     fix-scope conclusions moved to "Inferences & Open" below.
     Guard: a measured call-count SITE (0 fires for setEdrViewTransform) is evidence against a hypothesis,
     not a verified ROOT for the alternative mechanism. -->

# E0 — stock EDR/HDR-preview contract harvest (pre-flash, 2026-06-14)

Captured on the **stock OOS CPH2747** (frida, `trace_edr_invocation.js`, `edr-hdr` condition) BEFORE any flash —
this is the irrecoverable stock data R3 (Build 2) consumes. Log: `reference/campaign/edr-hdr/app_probes/trace_edr_invocation.log`.

## The observed stock EDR preview contract

| call | fires? | value(s) | source |
|------|--------|----------|--------|
| `OplusEdrUtils.getBlastSurfaceControl(SurfaceView)` | **YES** ×58 | → **REAL BLAST Surface** (`SurfaceView[com.oplus.camera](BLAST)`) | Java hook (truth) |
| `Transaction::setEdrFlags` | **YES** | **`0x80101`** (524545) — the EDR/HDR enable bits | java + native |
| `OplusEdrUtils.setEdrSdrRatio` | **YES** ×34 | **adaptive 1.34 → 1.89** per-frame (climbs with scene luma) | Java arg (truth) |
| `Transaction::setExtendedRangeBrightness` | YES | (current→desired headroom transition) | native floats NOT JS-decodable (arm64 dN) |
| `Transaction::setEdrViewTransform` (4×4 `transform[16]` curve) | **NO — 0 fires** | — | hooked but never called in preview |

## The finding (reframes R3 — corrects rearch/49)

**Stock EDR *preview* is driven by `setEdrFlags(0x80101)` + the adaptive `setEdrSdrRatio` (~1.3–1.9), NOT the 4×4
`OplusEdrViewTransform` curve.** The curve hook installed but never fired across the whole capture. So:

- The rearch/49 / `edr-sf-readside` premise that the **4×4 `setEdrViewTransform` curve is the #3 mechanism is NOT
  supported by the runtime** — at least not for the preview over-exposure path. The mechanism is flags + scalar ratio.
- **R3 (Build 2) simplifies:** the fix is a **functional `OplusEdrUtils`** (replace the dodge no-op stub):
  `getBlastSurfaceControl` → return the real BLAST Surface (already does on the *built* image per PHASE-D, but the
  dodge-base stub returns null — so this IS author-work); `setEdrSdrRatio` → call the AOSP libgui EDR API
  (`SurfaceControl.Transaction.setExtendedRangeBrightness` / `setDesiredHdrHeadroom`, which exist in lineage-23.2) with
  the OEM adaptive ratio; `setEdrFlags(0x80101)`. **Likely NO custom 4×4 libgui WRITE + SF READ ABI is needed** — the
  earlier "author both ABI sides" blueprint was over-scoped. Validate against the AOSP EDR API surface in Build 2.
- **Why #3 over-exposure on a dodge-base LOS:** the dodge `OplusEdrUtils` is a no-op stub (`setEdrSdrRatio`→false), so
  the OEM EDR ratio is never applied → preview renders HDR content at full range → ~over-bright. Wiring the ratio
  (R3) fixes it.

## Residuals (deferred, not blocking)

- **The 4×4 `setEdrViewTransform` curve** may fire in **HDR video / Dolby / a high-DR scene** (a separate EDR feature,
  not the preview-over-exposure #3). If R3 ever needs it, capture it under those conditions BEFORE a re-flash — same
  deferred-scene class as R6 TurboHDR. Not captured this round (didn't fire in photo preview).
- **Native `setExtendedRangeBrightness` float args** (current/desired headroom) are not decodable via Frida JS on
  arm64 (the `context.dN` SIMD regs aren't exposed); the Java `setEdrSdrRatio` value (1.34–1.89) is the usable truth.
  A CModule could read the FP regs if the exact headroom transition is needed for R3.

## E0 status: COMPLETE for the preview EDR contract (the load-bearing R3 input). Stock data preserved before flash.

---

## Inferences & Open (UNVERIFIED — heavy-check)

> The observations above (call counts, argument values, hook fire/no-fire) are measured on-stock facts.
> The conclusions drawn from them about R3 mechanism and fix scope are inferences — not verified by a
> LOS A/B with the proposed fix applied.

### R3 mechanism reframe (INFERRED from 0-fire observation)

- **MEASURED:** `setEdrViewTransform` hooked but fired 0× across the full stock preview capture session.
  `setEdrFlags(0x80101)` and adaptive `setEdrSdrRatio` (1.34–1.89) both fired. This is an on-device
  measured fact on stock OOS CPH2747 pre-flash.
- **INFERRED:** "Therefore the rearch/49 / `edr-sf-readside` premise that the 4×4 `setEdrViewTransform`
  curve is the #3 mechanism is NOT supported for the preview over-exposure path." The 0-fire count is
  strong evidence against the curve being the preview mechanism, but it does not rule out: (a) the curve
  firing only under specific preview conditions not present in this capture session, (b) the curve being
  needed for the full correct form even if the scalar path also works, or (c) the curve being the mechanism
  only in HDR video / Dolby / high-DR scenes (the residual noted below).
- **INFERRED:** "R3 (Build 2) simplifies: functional `OplusEdrUtils` (flags + scalar ratio) likely
  sufficient; no custom 4×4 libgui WRITE + SF READ ABI needed." This simplification is a design judgment
  from the 0-fire evidence. "Likely" is the key qualifier — it has not been confirmed by implementing the
  scalar-ratio form and observing #3 resolution on LOS.
- **INFERRED:** "Why #3 over-exposure on a dodge-base LOS: the dodge `OplusEdrUtils` is a no-op stub
  (`setEdrSdrRatio→false`) → ratio never applied → preview renders at full range → ~over-bright." This
  causal chain from stub no-op → over-exposure is a plausible mechanism attribution; it has not been
  confirmed by patching the stub and measuring the exposure level on LOS.

### Residuals (DARK / scope-open)

- **DARK:** Whether `setEdrViewTransform` fires in HDR video / Dolby / high-DR scenes is unobserved.
  If R3 ever needs the curve, this requires a separate capture session under those conditions before
  re-flash — the window is closed for the current stock image.
- **UNDECODABLE (not inferred, factual limit):** Native `setExtendedRangeBrightness` float args are not
  decodable via Frida JS on arm64 (SIMD dN regs not exposed). The Java `setEdrSdrRatio` value (1.34–1.89)
  is the usable truth for the scalar path. A CModule approach for the exact headroom values is noted as
  future work, not a confirmed technique.
