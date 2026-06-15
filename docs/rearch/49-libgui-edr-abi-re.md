<!-- STATUS: VERIFIED — evidence-anchored RE/capture; no inference-surgery needed (doc-50 method).
     Pass-B note: §"TL;DR" contains one unsupported-root claim presented as conclusion: "on LOS the
     ratio lands and the view-transform is silently dropped → over-exposure." The drop of the
     view-transform is a static inference (AOSP SF lacks the OEM bit63 reader), not a runtime-traced
     observation. The ABI offsets and method signatures are Ghidra-verified facts; the causal claim
     that their absence causes the over-exposure is inference. Flagged for Pass-B precision. -->

# rearch/49 — libgui OEM EDR Transaction ABI (Ghidra-recovered, OOS `.201`)

> Recovers the exact write-side ABI of the OnePlus EDR extension in OOS `libgui.so`, so a
> `frameworks/native` patch can be authored to retire the over-exposure stopgap. Pairs with
> doc-46 Addendum A (which named the symbols) and doc-40 (over-exposure = `OplusEdrUtils` no-op).
>
> Date: 2026-06-12 · Binary: `dump201_full/system/lib64/libgui.so` (AArch64, image_base 0x100000)
> · Tool: ghidra-mcp (`gbl_root_canoe` project)

## TL;DR
OnePlus extends `layer_state_t` with OEM EDR fields and a parallel change-mask. The **standard
AOSP `setExtendedRangeBrightness` (SDR/HDR ratio) IS present and works on LOS** — but it only sets
the ratio. The **panel tonemap is actually driven by the OEM `setEdrViewTransform` path**, which
writes a *separate* OEM map + OEM change-bits that **stock AOSP SurfaceFlinger never reads**. So on
LOS the ratio lands and the view-transform is silently dropped → over-exposure. This is the concrete
ABI a port must reproduce on **both** the libgui write side and the SF read side.

## Method
- `setExtendedRangeBrightness` @ `0x1db130` (standard), `setEdrViewTransform` @ `0x27fd48` (OEM),
  `setEdrSdrRatio` @ `0x280278` (OEM), `OplusEdrViewTransform::writeToParcel` @ `0x27024c` decompiled.
- All offsets are into the per-SurfaceControl `layer_state_t` returned by the get-or-create helper
  `func_0x2c5598` (`Transaction::getLayerState`); status error `0xffffffb5` = `-75` (`NO_MEMORY`/bad-state).

## The OEM `layer_state_t` extension (offsets within the per-SC state struct)

| Offset | Field | Set by | AOSP or OEM |
|--------|-------|--------|-------------|
| `+0x000` | low change-mask (`what`-lite) — bit2 `0x4` (viewTransform), bit6 `0x40` (sdrRatio) | all OEM setEdr* | **OEM** |
| `+0x0A0` | `unordered_map<uint32_t, OplusEdrState>` — keyed by the `int` slot arg (valid 0..2) | `setEdrViewTransform`, `setEdrAuxImage`, `setEdrGainmapInfo` | **OEM** |
| `+0x0D0` | `float edrSdrRatio` | `setEdrSdrRatio` | **OEM** |
| `+0x0D4` | `bool edrSdrRatio_flag` | `setEdrSdrRatio` | **OEM** |
| `+0x198` | `uint64_t what` (the real AOSP change-mask) — **bit48 `0x1<<48`** = std ExtendedRangeBrightness; **bit63 `0x8<<60`** = OEM-EDR-dirty (set by every OEM setEdr*) | mixed | AOSP field, **bit63 OEM-repurposed** |
| `+0x41C` | `float currentBufferRatio` | `setExtendedRangeBrightness` (**std AOSP**) | AOSP |
| `+0x420` | `float desiredRatio` | `setExtendedRangeBrightness` (**std AOSP**) | AOSP |

`OplusEdrState` (the map value) sub-layout, from `setEdrViewTransform`/`setEdrAuxImage`:
| Offset | Field |
|--------|-------|
| `+0x20` | sub-flags: bit1 `0x2` = viewTransform present · bit2 `0x4` = auxImage present |
| `+0x34` | `OplusEdrViewTransform` (92 bytes, memcpy'd) |
| `+0x90` | `OplusBitmapInfo` (aux image; move-assigned) |

## Recovered method signatures (from mangled names + decompile)
All are `SurfaceComposerClient::Transaction::` members, 3rd-arg `int` is the EDR slot (0..2):
```
setExtendedRangeBrightness(const sp<SurfaceControl>&, float currentRatio, float desiredRatio)   // STD AOSP @0x1db130
setEdrSdrRatio          (const sp<SurfaceControl>&, float ratio, bool)                          // OEM @0x280278
setEdrViewTransform     (const sp<SurfaceControl>&, OplusEdrViewTransform&&, int slot)           // OEM @0x27fd48
setEdrGainmapInfo       (const sp<SurfaceControl>&, OplusSkGainmapInfo&&, int slot)              // OEM @0x2800e0
setEdrAuxImage          (const sp<SurfaceControl>&, OplusBitmapInfo&&, int slot)                 // OEM @0x27fe58
setEdrMetadata          (const sp<SurfaceControl>&, std::vector<uint8_t>&&, int slot)            // OEM @0x27ffb8
setEdrFlags             (const sp<SurfaceControl>&, int)                                          // OEM @0x27fbbc
setEdrImageSize         (const sp<SurfaceControl>&, int, int, int)                                // OEM @0x27fc1c
setEdrAnimDuration      (const sp<SurfaceControl>&, int, int)                                     // OEM @0x28020c
setEDREffectFlag        (const sp<SurfaceControl>&, bool)                                         // OEM @0x280a30
setEDRMaxPotentialEDRValue(const sp<SurfaceControl>&, float)                                      // OEM @0x280aac
```

## `OplusEdrViewTransform` struct (92 bytes / 0x5c) — from `writeToParcel` @ 0x27024c
Serialized as: 3× `writeInt32` → `write<Rect>` (LightFlattenable, 16B) → `writeBlob(64B)`:
```cpp
struct OplusEdrViewTransform {            // sizeof = 0x5C = 92, trivially-copyable (memcpy in setEdrViewTransform)
    int32_t  field0;        // +0x00  (type/mode — TBD)
    int32_t  field1;        // +0x04  (e.g. colorspace/flags — TBD)
    int32_t  field2;        // +0x08
    Rect     region;        // +0x0C  left,top,right,bottom (4×int32)
    float    transform[16]; // +0x1C  64-byte blob — 4x4 EDR tone/gainmap matrix (the actual tonemap curve)
};                          // end = 0x1C + 0x40 = 0x5C
```
(`OplusEdrState`/`OplusEdrMetadata`/`OplusSkGainmapInfo`/`OplusBitmapInfo` parcelables also present —
`readFromParcel`/`writeToParcel` at 0x2703e4/0x270794 etc. — recover analogously if needed.)

## Porting implications
1. **The layer_state wire format is OEM-extended.** `setEdr*` append fields (`+0xA0` map, `+0xD0`
   ratio) and use `what` bit63 beyond AOSP's range. Any `frameworks/native` port must extend
   `layer_state_t` **and** its `Parcel` read/write (`composer_state`/`layer_state_t::write/read`) on
   BOTH client (libgui) and server (SF) — a mismatched struct size desyncs every transaction, not
   just EDR. This is why it's an ABI port, not a single-method add.
2. **`setExtendedRangeBrightness` alone is insufficient (confirms doc-40).** It writes only
   `+0x41c/+0x420` + bit48 — present on LOS. The tonemap curve lives in the OEM `setEdrViewTransform`
   map (`+0xA0`) gated by bit63, which AOSP SF ignores. `OplusEdrUtils` calling only the std ratio
   API (doc-40 candidate) therefore can't drive the panel — matches the "unproven/ineffective" result.
3. **Scope disambiguation vs the gralloc/P010 question (doc-42).** This EDR layer operates on
   `layer_state_t` (display composition), **NOT** on buffer-allocation usage flags. It does not touch
   gralloc allocation — so it is **not** the lever for Family I P010 contiguity (see doc-42; the
   permissive-mode retraction there is a separate allocation-input question, not this display path).

## Next decompile (scoped)
SF read side: import `dump201_full/system/bin/surfaceflinger`, decompile
`OplusRequestedLayerState::{setExtendedRangeBrightness,setDesiredHdrHeadroom,setEdrMetadata}` +
`OplusDolbyVision::setEDRStatus` to confirm it reads `layer_state+0xA0` map / `+0xD0` ratio / the
bit63 dirty-flag and applies the `transform[16]` matrix to the panel composition. That closes the
read/write pair an authored patch needs.

## Anchors
- doc-46 Addendum A (symbol footprint, OOS-derived/`O`), doc-40 (over-exposure / OplusEdrUtils no-op).
- libgui.so offsets above are image_base 0x100000; subtract for file offset (p_vaddr==p_offset).
