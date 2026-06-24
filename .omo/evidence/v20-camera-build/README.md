# v2.0 camera build — evidence

## oos-lockPlanes.disasm
`llvm-objdump -d --disassemble-symbols=AHardwareBuffer_lockPlanes` on the OOS golden
`/srv/android/dumps/extracted/dump300_full/system/lib64/libnativewindow.so` (CPH2745 16.0.8.300).

**What it proves:** OOS's framework `AHardwareBuffer_lockPlanes` (with `formatIsYuv` inlined) recognizes
`0x7FA30C0A` (HAL_PIXEL_FORMAT_YCbCr_420_P010_VENUS) and routes it to `GraphicBuffer::lockAsyncYCbCr`
(3-plane chroma fill) at `0x8930→0x896c`. Stock LOS/AOSP `formatIsYuv` stops at standard P010/P210 and
returns false for `0x7FA30C0A`, taking the single-plane `lockAsync` path → chroma planes unset → the
P010 photo-save SIGSEGV.

**Format-compare set decoded from the switch** (the complete list OOS treats as YUV):
`Y8 0x20203859`, `Y16 0x20363159`, `YV12 0x32315659`, the ≤0x3C standard YUV group, and **`0x7FA30C0A`**.
No other qcom vendor format (no `0x7FA30C00..09`, `0x124`, `0x116`, `0x113`, `0x114`). → P1 adds ONLY
`0x7FA30C0A`, OOS-exact.

For `0x7FA30C0A` (format > 0x3C) OOS sets luma `pixelStride = 1` (`0x8984 cmp #60; b.hi 0x89ec; mov w8,#1`)
== the LOS source `else` branch → recognizing the format in `formatIsYuv` alone is byte-faithful to OOS.

Cross-ref: `docs/re-notes/formatisyuv-p010-framework-root-RE.md`.

## blob import trace (run-recorded, not saved as a file)
`readelf --dyn-syms` on the in-tree `libAlgoProcess.so` shows `AHardwareBuffer_lockPlanes`/`_describe` as
UND imports and `camApsBufferLockPlanes` as a defined export → the APS lock path resolves into the platform
framework lib (the layer P1 patches), confirming the framework is on the crashing path.
