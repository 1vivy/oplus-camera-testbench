<!-- STATUS: VERIFIED — live device (CPH2747 LOS V16.1.0 / BP4A.251205.006) Frida + Ghidra(.300 blobs) +
     golden A/B (2026-06-17). Fix VALIDATED on-device. Supersedes the gAPSOps/BasicTone-Cb-Cr framings. -->
# P010 photo-save crash root — the fusion OUTPUT buffer is `P010_VENUS`, inputs are linear P010

## TL;DR
The OnePlus 15 LOS camera P010/Pro photo-save crash is a **single geometry root**: the SAT/fusion **OUTPUT**
buffer is allocated as **`HAL_PIXEL_FORMAT_YCbCr_420_P010_VENUS` (0x7FA30C0A)** while every **INPUT** buffer is
**linear P010 (0x36)**. The APS describe path computes contiguous plane geometry for linear `0x36` but leaves
the Venus output descriptor's `scanline`/`chroma` **unset**, so the consumers (`BasicTone`, ArcSoft fusion, the
APS rotate) walk the image off the end of its buffer → SIGSEGV at `0x79…`. `libAlgoProcess`/`libAlgoInterface`
are **byte-identical OOS↔LOS**, so OOS cannot be feeding them a Venus output that lacks geometry — i.e. OOS's
output is either **linear P010** or a **Venus buffer carrying PLANE_LAYOUTS metadata**. **One** descriptor
completion fixes ALL consumers and **retires libapsfixup entirely** (validated live).

## What this corrects (ruled-out red herrings)
- **gAPSOps.pfnAPSMemHW{Acquire,Release} NULL is BENIGN** — the WORKING OOS golden p010 capture has the EXACT
  same 22 NULL log lines with 0 crashes. Not the root. (golden A/B, `reference/_golden-oos-V16.1.0/campaign/p010`)
- **The dodge BasicTone Cb/Cr blob patch (`7675520`) is cosmetic** — patched-blob captures still tombstoned at
  the same `saveOutImg`. Keep it as a latent fix; it is NOT the crash fix.
- **`AHardwareBuffer_describe` is NOT the fix locus** — it is a thin accessor that REPORTS the allocated format
  (byte-identical OOS↔LOS). The fix is the output buffer's FORMAT SELECTION upstream of it.

## The chain (addresses; .300, image_base 0x100000; Frida uses bare VMA = Ghidra−0x100000)
1. Fusion output buffer allocated as Venus P010 `0x7FA30C0A` (vs inputs linear `0x36`); same usage `0x20003`, stride 1280.
2. `APSAlgoBase_V2::prepareImage` (`libAlgoInterface` VMA `0x1acc494`, P010 path `0x1bcc77c`) copies the descriptor:
   `Image+0x2c(sliceHeight) ← ApsBufferPlanes+0x28(scanline)`, `Image+0x28(stride) ← Aps+0x24`, sets Image fmt(0x1c)=9.
   (siblings: `initImage` `0xdd6c80`, `prepareImage(Aps*,Image*)` `0x195c2ac`, ArcSoft `PrepareImage` `0xf3ab30`.)
3. For the Venus buffer the source `ApsBufferPlanes` is INCOMPLETE: luma(+0x18)+stride(+0x24)+height(+0x08) set,
   but **format(+0x0), scanline(+0x28), chroma-VA(+0x48), chroma-stride(+0x54) unset** (uninitialized garbage).
   `camApsBufferDesc` (`libAlgoProcess` `0x2ca8ec`) copies `desc.format` from `AHardwareBuffer_describe` and only
   emits the contiguous chroma/scanline for recognized linear formats; `APSGrallocUtils::getPlaneLayout`
   (`libAlgoProcess` `0x12127c`, vtable via DATA `0x786bb8`) — which would read gralloc `PLANE_LAYOUTS` (StandardMetadataType
   0xf) and fill chroma — **never fires** for the output buffer (gated by the `useMetadata` singleton flag at `+0x10`).
4. Consumer `BasicTone_OGL::saveOutImg` (`libBasicTonePhoto` `0x543a0`) / `processCore` (`0x53a34`), P010 branch:
   loops `while(i < Image[0x2c]·3/2)` advancing by stride, and RECOMPUTES `chroma = luma + stride·sliceHeight`
   (never reads chroma-VA). Garbage `sliceHeight` (~4.09e9) → ~4B-row walk → SIGSEGV. ArcSoft `turbo_fusion_raw_super_night`
   and `APSFormatConverter::rotateMirror` (`libAlgoProcess`) crash the same way on the same descriptor.

## ApsBufferPlanes field map (confirmed via full live dump)
`+0x00` format(low32) · `+0x08` height · `+0x10` planeCount · `+0x18` luma VA · `+0x24` stride · `+0x28` scanline
`+0x48` chroma VA · `+0x54` chroma stride · `+0x58` chroma scanline · `+0x78` Cr VA(=chroma+2). Good buffer is
CONTIGUOUS: chroma = luma + stride·height (e.g. +0x258000 = 2560·960). BasicTone Image: `+0x00` w · `+0x04` h ·
`+0x1c` fmt(9=P010) · `+0x28` stride · `+0x2c` sliceHeight · `+0x38` dataPtr · `+0xA0` AHardwareBuffer handle.

## libapsfixup retirement verdict (one descriptor fix retires it)
- #1 `wrap_p010` (conv row-count, GOT `0x689ba8`): retired by a correct sliceHeight/scanline.
- #2/#3 `wrap_arc`/`wrap_arc_tfrsn` (ArcSoft chroma VA+pitch): retired by a correct chroma VA (same descriptor).
- #4 `wrap_ogltone`: already dead (not installed in `libapsfixup.ondevice-orig.so`).
⇒ A born-correct OUTPUT descriptor (format/scanline/chroma) makes all four dead code.

## FIX VALIDATED ON-DEVICE (2026-06-17)
Overlay completing the Venus descriptor at the converters (`fmt=0x36, scanline=height, chroma=luma+stride·height,
chroma_stride=stride`) — fired 12× over 4 captures: **camera process stayed ALIVE (no crash/relaunch), 4 JPEGs
saved, ZERO com.oplus.camera/BasicTone/ArcSoft tombstones.** (The only new tombstone was `com.oplus.aiunit` ART
GC heap-corruption — a separate AI daemon, unrelated.) 960 is 32-aligned so Venus scanline==height here, which is
why linear geometry is exactly correct for this buffer.

## Durable fix — options, easiest upstream first
1. **(EASIEST, if OOS is linear) Force the fusion OUTPUT stream to linear P010 (0x36)** at allocation (the output
   stream's pixel-format / a gralloc usage flag in the CamX usecase / OEM HAL / device config). The byte-identical
   APS blob then fills geometry automatically. Decide via the OOS test below.
2. **(if OOS is Venus) Ensure the Venus output buffer carries PLANE_LAYOUTS metadata** (or flip the `useMetadata`
   singleton flag) so `getPlaneLayout` (`0x12127c`) fills the geometry.
3. **(proven fallback) Single-point descriptor-completion shim** — a clean libapsfixup replacement: ONE geometry
   completion at the descriptor vs FOUR consumer-side GOT patches. See `tools/frida/fix_p010_venus_descriptor.js`.

## OOS TESTS (run on a stock OOS unit to pick fix #1 vs #2)
The ONE missing fact is what format the OOS fusion-OUTPUT buffer is allocated with. Probes (in `tools/frida/`):
- **`trace_p010_output_format.js`** — hooks `AHardwareBuffer_describe`; logs `WxH / format / usage / stride` for
  capture-size buffers. **DECISIVE**: if OOS output = `0x36` (linear) → fix #1 (force linear on LOS); if OOS output
  = `0x7FA30C0A` (Venus) → fix #2 (OOS carries PLANE_LAYOUTS metadata; LOS doesn't). Run one Master/Pro capture.
- **Also useful on OOS** (confirm scenario #2 if Venus): hook `APSGrallocUtils::getPlaneLayout` (`libAlgoProcess`
  +0x12127c) — does it FIRE (success, writes chroma) for the OOS Venus output? And dump the `useMetadata` singleton
  flag (`*(get_singleton()+0x10)`). If it fires on OOS but not LOS → the gralloc PLANE_LAYOUTS metadata / flag is the lever.
- **`probe_basictone_geom.js`** — confirms the consumer side (BasicTone Image w/h/stride/sliceHeight vs mapped extent);
  on OOS the OUTPUT Image's `sliceHeight` will be valid (==height-aligned), the LOS contrast.
- Cross-check: dump the OOS fusion OUTPUT stream's gralloc usage flags (compare to LOS `0x20003`) — a usage-driven
  gralloc resolution would explain Venus-vs-linear without an explicit format change.

## Anchors
- libAlgoInterface .300 BuildId `f76a8818`; libAlgoProcess `2217d555`; libBasicTonePhoto `012716fee06d`.
- Pairs with `alloc-chain-locus-RE.md` (this is its "upstream geometry/metadata" root, now pinned), `apsclient-bridge-RE.md`,
  `libapsfixup-interposition-RE.md` (the shim this retires). Golden: `reference/_golden-oos-V16.1.0/campaign/p010`.
