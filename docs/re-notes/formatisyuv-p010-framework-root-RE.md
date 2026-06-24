<!-- STATUS: VERIFIED (static) — the P010 photo-save crash root is a from-source FRAMEWORK divergence,
     pinned to the exact symbol and binary-confirmed against the OOS golden (2026-06-23).
     Evidence: (a) libAlgoProcess.so dynsym import trace, (b) OOS libnativewindow.so lockPlanes disasm
     A/B, (c) infiniti source diff. On-device validation of the EXACT source patch is PENDING the v2.0
     flash; a close analog (the Frida descriptor-completion overlay) already passed live: 4 JPEGs, 0
     tombstones (see p010-venus-output-format-RE.md "FIX VALIDATED ON-DEVICE"). This RESOLVES and
     SUPERSEDES the prior "runtime value, no static fingerprint, device-probe-only" verdict in
     p010-dmabuf-environment-RE.md — that verdict was correct that the divergence is in "the only
     from-source AOSP framework layer," but could not pin the symbol without the colleague's pointer
     + the OOS binary A/B done here. -->
# P010 photo-save crash ROOT — `AHardwareBuffer_formatIsYuv` does not recognize `P010_VENUS` on LOS

## TL;DR
The SAT/fusion **OUTPUT** buffer is `HAL_PIXEL_FORMAT_YCbCr_420_P010_VENUS (0x7FA30C0A)`. The APS consumer
`libAlgoProcess::camApsBufferLockPlanes` locks it via the **framework** `AHardwareBuffer_lockPlanes`, which
gates the 3-plane chroma fill on `AHardwareBuffer_formatIsYuv(format)`. **OOS's** `/system` libnativewindow
recognizes `0x7FA30C0A` as YUV and takes the `lockAsyncYCbCr` (3-plane) path; **stock LOS/AOSP** does not
(its switch stops at standard `P010`/`P210`), so it takes the single-plane `lockAsync` path, leaving
`planes[1]/[2]` (chroma) **unset** → APS gets `descriptor=0x0` → `BasicTone_OGL::saveOutImg` / ArcSoft
recompute chroma from a garbage `sliceHeight` and walk off-buffer → **SIGSEGV**. `libAlgoProcess` is
**byte-identical** OOS↔LOS, so the divergence is forced into the one non-identical layer: the framework.
**Fix = recognize `0x7FA30C0A` in `formatIsYuv` (one case).** This is OOS parity, makes the descriptor
born-correct, and retires `libapsfixup` (its `wrap_p010`/`wrap_arc` become dead code).

## The verified chain
1. **Output buffer format** = `0x7FA30C0A` (Venus P010), inputs linear P010 `0x36`; same usage `0x20003`.
   (`p010-venus-output-format-RE.md:28,108`.)
2. **Consumer calls the framework lock.** `libAlgoProcess.so` dynsym: `AHardwareBuffer_lockPlanes` /
   `AHardwareBuffer_describe` are **UND** imports (idx 192/194), and it **defines** `camApsBufferLockPlanes`
   (idx 3465) + `camApsBufferDesc` — i.e. the APS lock path resolves into the platform framework lib.
   `libAlgoInterface.so` imports `camApsBufferLockPlanes` (UND idx 70). So the descriptor that APS hands the
   converters is produced by the framework `lockPlanes`, not inside the (byte-identical) blob.
3. **The gate.** `AHardwareBuffer_lockPlanes` (`libs/nativewindow/AHardwareBuffer.cpp:331`):
   `if (AHardwareBuffer_formatIsYuv(format)) { lockAsyncYCbCr -> fill planes[0..2] } else { lockAsync ->
   planes[0] only, planes[1]/[2] stay memset-0 }`. Infiniti `formatIsYuv` (`:753-767`) ends at
   `P010`/`P210` → returns **false** for `0x7FA30C0A` → single-plane path → chroma unset.
4. **The crash.** `camApsBufferLockPlanes` returns `descriptor=0x0` for the Venus output
   (`p010-venus-output-format-RE.md:13`); `BasicTone_OGL::saveOutImg` recomputes
   `chroma = luma + stride·sliceHeight` from the unset descriptor → ~4e9-row walk → SIGSEGV (`:55-58`).

## OOS binary A/B (the part that closes it — why OOS does NOT crash on the SAME buffer)
`libAlgoProcess` is byte-identical OOS↔LOS yet OOS never crashes on `0x7FA30C0A`. Disassembly of OOS
`/system/lib64/libnativewindow.so` `AHardwareBuffer_lockPlanes` (formatIsYuv inlined) — evidence
`.omo/evidence/v20-camera-build/oos-lockPlanes.disasm`:
```
8930: mov  w8, #3082            ; 0x0C0A
8934: movk w8, #32675, lsl #16  ; 0x7FA3 << 16   ->  w8 = 0x7FA30C0A
8938: cmp  w22, w8              ; format == P010_VENUS ?
893c: b.eq 0x8950              ; -> YUV path ...
896c: bl   GraphicBuffer::lockAsyncYCbCr   ; 3-plane chroma fill
```
**OOS recognizes `0x7FA30C0A` and routes it to `lockAsyncYCbCr`.** Full format-compare set extracted from
the OOS switch: `Y8 (0x20203859)`, `Y16 (0x20363159)`, `YV12 (0x32315659)`, the ≤0x3C standard YUV group
(P010/P210/422_SP/420_SP/422_I/Y8Cb8Cr8_420), **and `0x7FA30C0A`** — and *no other* qcom vendor format
(no `0x7FA30C00..09`, no `0x124`/`0x116`/`0x113`/`0x114`). For `0x7FA30C0A` (format > 0x3C) OOS sets luma
`planes[0].pixelStride = 1` (the `b.hi -> 0x89ec` branch), which is identical to the LOS source `else`
branch — so recognizing the format in `formatIsYuv` ALONE (no pixelStride special-case change) is byte-for-byte
OOS-faithful.

## The fix (P1, staged for v2.0)
`infiniti-camera-port/.../libs/nativewindow/AHardwareBuffer.cpp` `formatIsYuv`: add
`case 0x7FA30C0A: // HAL_PIXEL_FORMAT_YCbCr_420_P010_VENUS` before `return true`. **Scope = ONLY this one
qcom format**, matching the OOS binary. The colleague's giulia patch (`realahnet/frameworks_native 8f741f06`)
adds a wider 12-format set; we deliberately match OOS (1 format) to stay on baseline and minimize blast
radius. If another qcom YUV format ever surfaces in a capture mode, re-A/B that mode's OOS lockPlanes before
adding it.

## Relationship to libapsfixup
A born-correct OUTPUT descriptor makes `libapsfixup`'s shipping hooks dead code (`wrap_p010` repairs the
P010 row-count; `wrap_arc` repairs the ArcSoft chroma VA) — exactly `p010-venus-output-format-RE.md:66-70`
("one descriptor completion … retires libapsfixup entirely") and doc `rearch/42` "the OOS way." Decision
(v2.0): **drop libapsfixup now**, not as a gated follow-up — keeping it would mask whether P1 actually fixed
the descriptor. With no shim, P1 holding ⇒ clean save; P1 incomplete ⇒ an obvious crash the format-trace
probes catch at the exact stage. Removal ledgered as v2.0 row R1 (ITERATION-LOG).

## Anchors / cross-refs
- libAlgoProcess `.300` BuildId `2217d555`; libAlgoInterface `f76a8818`; libnativewindow OOS = dump300_full.
- Supersedes the open verdict in `p010-dmabuf-environment-RE.md`; completes `p010-venus-output-format-RE.md`
  (its "SURVIVING ROOT = the only from-source AOSP framework layer" is now this symbol).
- Colleague avenue ledgered from `realahnet/frameworks_native` (giulia, `sixteen`); see v2.0 plan.
- Evidence: `.omo/evidence/v20-camera-build/oos-lockPlanes.disasm` (+ `README.md`).
