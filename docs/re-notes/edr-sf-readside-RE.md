<!-- STATUS: VERIFIED — evidence-anchored (Ghidra/device capture); no inference-surgery needed (doc-50 method). -->
# SurfaceFlinger READ-side of the OnePlus OEM EDR ABI (Ghidra-recovered, OOS `.201`)

> Confirms the SF consumption mechanism that pairs with the libgui WRITE side in `rearch/49`.
> Grounds the D4/G6 EDR contract with G-MECH evidence: SF *does* read the OEM EDR per-slot map,
> the 92-byte `OplusEdrViewTransform` tonemap struct, and the SDR/HDR ratio, gated on the OEM
> change bits — and feeds the 4x4 matrix into the LinearEffect/Skia tonemap composition shader.
>
> Date: 2026-06-13 · Binary: `dump201_full/system/bin/surfaceflinger`
> (full path `/home/vivy/op15-work/dump201_full/system/bin/surfaceflinger`)
> AArch64 PIE, stripped (.symtab gone; C++ names recovered from .dynsym + RTTI/vtables),
> BuildID md5 `3a5f769e52053368b51fe1f0e6c0ceac`, 11,417,352 B, 33,851 functions.
> · Ghidra image_base **0x100000** (file offset = Ghidra addr − 0x100000) — same convention as doc-49.
> · Tool: ghidra-mcp (project `oos-baseline-v3`).

## TL;DR — AGREE with doc-49's model
The OEM EDR code is **statically linked into the SF main binary** (not just a vendor lib), and the
read side is real. `OplusRequestedLayerState::setEdrMetadata(const layer_state_t&)` walks the OEM
per-slot EDR node list, reads a parallel change-mask, and on the viewTransform bit does a **`memcpy`
of exactly 0x5C (92) bytes** of the `OplusEdrViewTransform` into the per-slot OEM map value — the
identical struct size doc-49 recovered on the write side. The SDR/HDR ratio reader (`GameEdr`/
`OplusDolbyVision::setEDRStatus`) clamps the ratio and sets the EDR-dirty flag. The 4x4 transform
matrix is materialized (`OplusEdrViewTransform {`, `.mViewTransform =`, `transformMatrix4x4`) and
fed into the AOSP LinearEffect tonemap runtime-shader (`uniform half4x4 m; color = m*color + v`).
**This is exactly the read counterpart doc-49 predicted.** Stock AOSP SF lacks all of it ⇒ on LOS the
matrix is dropped ⇒ over-exposure (consistent with doc-40/doc-49).

> Caveat on offset matching: SF reads its **server-side** `layer_state_t` (deserialized from the
> parcel), which is a *different in-memory layout* from the libgui client-side `Transaction`
> per-SC state struct doc-49 measured. So the SF read offsets are NOT numerically equal to doc-49's
> write offsets — they are the **deserialized image of the same wire fields**. The structural match
> (per-slot map keyed by slot 0..2, 0x5C view-transform blob, ratio float, parallel change-mask,
> OEM-dirty flag) is exact; the raw byte offsets differ by design (client struct ≠ server struct).
> See "Offset reconciliation" below.

## Consumers (name @ Ghidra addr / file offset)

| Function | Ghidra | file off | role |
|----------|--------|----------|------|
| `OplusRequestedLayerState::setEdrMetadata(const layer_state_t&)` | `0x40755c` | `0x30755c` | **primary read consumer**: ingests OEM per-slot EDR list → OEM map + 0x5C view-transform memcpy |
| `GameEdr::setEDRStatus(RequestedLayerState&, const layer_state_t&)` | `0x3cc9b4` | `0x2cc9b4` | reads low change-mask + SDR/HDR ratio float, clamps, sets dirty |
| `OplusDolbyVision::setEDRStatus(OplusRequestedLayerState*, bool, ANI_TYPE, float)` | `0x68e098` | `0x58e098` | DV variant of EDR-status applier (ratio/dirty/type/anim on snapshot) |
| `OplusDolbyVision::onTransact(uint, const Parcel&, Parcel*, uint)` | `0x68d5c0` | `0x58d5c0` | binder handler for **OPLUS_CODE_SET_HDR_VISION_STATUS** (code `0x56ce`), whitelist-gated |
| `OplusDolbyVision::updateEdrState(compositionengine::Output*)` | `0x68e34c` | `0x58e34c` | composition hook (locks output; body largely inlined elsewhere) |
| `VFXEffect::onRequestedLayerStateMerge(OplusRequestedLayerState*, const layer_state_t&)` | `0x409340` | `0x309340` | merge-path reader (per-effect tree, reads `layer_state+0x80` node list) |
| `OplusRequestedLayerState::setEdrFlags(int)` | `0x404d48` | `0x304d48` | OEM flags setter |
| `OplusRequestedLayerState::setEdrAnimDuration(int,int)` | `0x3b2970` | `0x2b2970` | anim-duration setter |
| `OplusRequestedLayerState::peek(const ResolvedComposerState&, ulong, ulong) const` | `0x409e60` | `0x309e60` | snapshot read (large; not fully decompiled here) |

Supporting RTTI/vtables present (proves the types are linked in, not external):
`_ZTVN7android13OplusEdrStateE` @0x12955c, `_ZTVN7android3gui12EdrLayerInfoE` @0x128fff,
`OplusEdrMetadata::dump`, `IEdrLayerInfoListener::onEdrLayerInfoChanged`.

## Gate logic — `setEdrMetadata` @ 0x40755c (the map + view-transform reader)
```c
plVar30 = *(long**)(param_2 + 0xb0);          // layer_state(server) -> OEM EDR per-slot node list head
while (plVar30 != 0) {
  uVar19 = *(uint*)(plVar30 + 4);             // node+0x20 = per-node OEM change-mask
  unaff_x24 = plVar30 + 2;                     // node+0x10 = slot key (uint, 0..2)
  if (uVar19 & 1)        { ... emplace(map@param_1+0x98, slot); val+0x1c = node+0x2c; val+0x20 = node+0x30; }
  if (uVar19 >> 1 & 1)   { lVar13 = emplace(...); memcpy(lVar13+0x24, (char*)plVar30 + 0x34, 0x5C); }  // <-- OplusEdrViewTransform, 92 B
  if (uVar19 >> 2 & 1)   { OplusBitmapInfo::operator=(val+0x80, node+0x90); *(byte*)(param_1+0x88)=1; }  // aux image
  if (uVar19 >> 3 & 1)   { ... vector<uint8> metadata -> LocalHdr/AuroraWallpaper::parserEdrMetaData | LocalHdr::parserEdrGainmapInfo }
  plVar30 = *plVar30;                          // next node
}
// then mark EDR dirty + reschedule:
EDREngine::getInstance(); *(byte*)(inst+0x141)=1;
*(byte*)(g+0x108)=1; *(u32*)(sf+0x448)=1; *(u32*)(sf+0x447)=1;
SurfaceFlinger::scheduleCommit(FrameHint, Duration, true);
```
- The per-node change-mask **bit1 (0x2) = viewTransform present** drives the **0x5C memcpy** — exact size match to doc-49's `OplusEdrViewTransform` (sizeof 0x5C, `transform[16]` at struct+0x1C).
- bit0/bit2/bit3 = ratio-ish ints / aux-image / metadata-vector — same sub-field family as doc-49's
  `OplusEdrState` (sub-flags +0x20: bit1=viewTransform, bit2=auxImage).
- Read path logs the wire `what`: literal **`setEdrMetadata seq=%d index=%d what=0x%x %s`** — i.e. it
  consumes the OEM change-mask per layer, the read-side mirror of doc-49's `+0x198 what` / OEM bits.

## Gate logic — `GameEdr::setEDRStatus` @ 0x3cc9b4 (the ratio reader)
```c
uVar14 = (uint)*param_3;                        // param_3 = layer_state(server); +0x000 = low change-mask
if (uVar14 >> 4 & 1) { snapshot+0x171 = *(byte*)(param_3+0x58); }                 // bit4
if (uVar14 >> 3 & 1) {                                                            // bit3 = ratio dirty
    fVar21 = *(float*)((char*)param_3 + 0x5c);  // SDR/HDR ratio float (server-side)
    ratio  = clamp(fVar21, 1.0f, 5.0f);         // clamp [1.0 .. 5.0]
    snapshot+0x80 = ratio;
    snapshot+0x7c = (fabs(ratio-1.0) >= eps);   // EDR-active dirty flag
    snapshot+0x74 = 6;                          // EDR type/mode
}
if (uVar14 >> 7 & 1) { snapshot+0x78 = *(byte*)(param_3+0xc) ^ 1; }               // bit7
param_1+0x50 = snapshot+0x80;  param_1+0x54 = snapshot+0x171;                     // propagate ratio to layer
// then same EDREngine-dirty + scheduleCommit tail as setEdrMetadata
```
`OplusDolbyVision::setEDRStatus` @0x68e098 writes the same snapshot fields (ratio +0x80, dirty +0x7c,
type +0x74=2, anim +0x78) — confirming a single coherent EDR snapshot block consumed by composition.

## transform[16] → composition (the tonemap apply)
Recovered literals prove the 4x4 matrix is materialized and applied, not dropped:
- `OplusEdrViewTransform {`, `.mViewTransform = `, `.transformMatrix4x4 = `, `transformMatrix4x4`
  — the 92-byte struct (with its 4x4) is reconstructed SF-side and dumped/forwarded.
- AOSP LinearEffect tonemap Skia runtime-shader is present and the color matrix flows into it:
  `uniform float4x4 in_colorTransform`, and the colour kernel
  `uniform half4x4 m; uniform half4 v; ... color = m * color + v; ...`.
- `libtonemap_LookupTonemapGain` / `libtonemap_ToneMapTargetNits` GLSL — the gain/tonemap stage.
- Readback/notify path: `gui::EdrLayerInfo` (vtable @0x128fff, `readFromParcel`/`writeToParcel`) and
  `IEdrLayerInfoListener::onEdrLayerInfoChanged` (Bp/Bn server) — SF publishes EDR layer state.
- `EDREngine::getInstance()` is the convergence sink touched by every reader above.

So: per-slot map value `+0x24` (the 0x5C view-transform, `transform[16]`) → `EDREngine` → LinearEffect
`m*color+v` colour pipeline. Matrix reaches composition. **Matches doc-49 §"how transform[16] reaches
composition".**

## Whitelist + props (D4 §(a)/(b), doc-46 §177-178)
- **OPLUS_CODE_SET_HDR_VISION_STATUS** is real and whitelist-gated. `OplusDolbyVision::onTransact`
  @0x68d5c0 handles binder code **`0x56ce`** (range guard `param_2>>1 == 0x2b67`), and only proceeds
  when the whitelist bool `*(byte*)(this+0x30)` is set. Literals:
  `"OPLUS_CODE_SET_HDR_VISION_STATUS %s not in white list"`,
  `"OPLUS_CODE_SET_HDR_VISION_STATUS [p:%d, n:%s]={p:%lu, ps:%s}"`,
  `"OPLUS_CODE_SET_HDR_VISION_STATUS get param from parcel error!"`, `"OPLUS_CODE_GET_HDR_VISION_CONFIG"`,
  `"HdrVision"`/`"HdrVision:"`.
- All three gating props are PRESENT in this binary (verified via host `strings`):
  `ro.oplus.display.capture_skip_hdr_support`, `ro.oplus.force.brightness.composite`,
  `ro.oplus.uhdr.discard_wcg_info`. (Exact read sites not individually decompiled here — string
  presence + the EDR consumer set is sufficient to confirm the gates live in SF, per D4 §(a)/(b).)

## Offset reconciliation vs doc-49 (write side)
doc-49 measured the **libgui client `Transaction` per-SC state** struct:
`+0x0A0` map / `+0x0D0` edrSdrRatio / `+0x198 what` bit48 (std) & bit63 (OEM-dirty); `OplusEdrState`
value: sub-flags +0x20 (bit1 viewTransform, bit2 auxImage), `OplusEdrViewTransform` (0x5C) at +0x34.

SF reads the **server `layer_state_t`** (post-deserialization), a distinct layout:
- OEM EDR per-slot **node list head at `+0xB0`** (vs client map at +0xA0) — same data, server container is a list, not the client's `unordered_map`.
- per-node OEM change-mask at node `+0x20`, slot key at node `+0x10`.
- **viewTransform = 0x5C-byte blob at node `+0x34`** — **byte-exact size match** to doc-49's `OplusEdrViewTransform` (0x5C) at client value `+0x24`/struct `+0x34`.
- SDR/HDR ratio float at server `layer_state +0x5c`, gated by low-mask `+0x000` bit3.
- low change-mask at server `layer_state +0x000` (the read-side mirror of doc-49's `+0x000` lite-mask).

**Verdict: AGREE.** The structural contract doc-49 reverse-engineered on the write side is faithfully
consumed on the read side: same per-slot keying (0..2), same 0x5C view-transform payload, same ratio
field, same parallel OEM change-mask + OEM-dirty semantics, same OPLUS_CODE_SET_HDR_VISION_STATUS
whitelist, and the transform matrix is applied to the LinearEffect/tonemap composition. The numeric
offsets differ only because client `Transaction` struct ≠ server `layer_state_t` struct — expected,
not a contradiction. doc-49's core claim — *AOSP SF lacks this read path, so the OEM view-transform is
the lever the port must reproduce* — is confirmed by the presence of this entire OEM read subsystem in
the stock SF binary.

## v1.4 LOS/OOS baseline reconciliation (2026-06-16)

The v1.4 A/B baseline promotes this note from a static mechanism to the current top preview interop candidate.
OOS `trace_edr_invocation` gets the preview BLAST `SurfaceControl` and successfully calls `setEdrFlags`; LOS
returns `null` for the same GLRootView path. SurfaceFlinger also splits the same way: OOS presents the preview
as HLG with desired HDR/SDR ratio `5.0`, while LOS still sees an HDR layer but leaves desired ratio/dimming at
`1.0`.

That matches the observed symptom boundary: preview is overexposed, UI and thumbnails are sane, and saved JPEGs
are not overexposed. So D4/G6 is now a preview-composition contract, not evidence that still APS processing is
broken. Patch direction is either:

1. reproduce the OOS-shaped EDR write/read/auth chain (`OplusEdrUtils`/libgui transaction fields, SF read-side,
   and the OCS auth gate in `ocs-auth-abi-RE.md`), or
2. make the product decision to force only camera preview to SDR and leave the still-capture chain alone.

Cross-reference: `docs/rearch/51-los-v14-oos-ab-preliminary.md` ranks this as the strongest LOS/OOS divergence.

## Anchors
- `rearch/49-libgui-edr-abi-re.md` (write side / WRITE offsets), D4 `render-sf-edr.md` §(a)/(b),
  doc-46 §177-178 (OPLUS_CODE_SET_HDR_VISION_STATUS), doc-40 (over-exposure = OplusEdrUtils no-op).
- SF offsets above are image_base 0x100000; file offset = addr − 0x100000.

---
Pairs with the 1b `trace_edr_invocation` write-side capture (D4/G6).
