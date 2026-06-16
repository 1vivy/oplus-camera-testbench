<!-- STATUS: VERIFIED — evidence-anchored (Ghidra/device capture); no inference-surgery needed (doc-50 method). -->
# The OOS gralloc/P010 plane-layout path — where contiguous chroma is *produced* (root-cause walk for libapsfixup Family-I)

> Closes OOS-OPEN-ITEMS Part C: the P010 contiguity that `libapsfixup` Family-I otherwise patches is currently
> **asserted, not walked**. This note **walks** it — decompiles the QTI mapper's native P010 plane-layout math —
> and states the producer/expected/forced delta and the rule-out verdict. Pairs with
> `D1-gralloc-camxformat.md`, `libapsfixup-interposition-RE.md` (Family-I), and the stock lock capture
> `reference/campaign/p010/app_probes/trace_p010_planes.log`.
>
> Date: 2026-06-13 · Tool: ghidra-mcp, project `oos-baseline-v3`. Convention: image_base `0x100000` →
> **file off = Ghidra addr − 0x100000**.

## Binaries (imported + analyzed this session)

| artifact | path | BuildID | notes |
|---|---|---|---|
| `libgrallocutils.so` | `/home/vivy/op15-work/dump201_full/vendor/lib64/libgrallocutils.so` | md5 `bbc6b8f758eb1e07720c81c1692bc6a8` | **the plane-layout authority.** 383,008 B, AArch64, stripped but `.dynsym`-named (`gralloc::*` exports). Byte-identical OOS↔LOS per doc-42. |
| `mapper.qti.so` | `…/vendor/lib64/hw/mapper.qti.so` | md5 `0b763fed9bff5178825dac6e14a89f81` | the Gralloc5/AIMapper front end. 102,448 B. `QtiMapper5::getMetadata`/`getStandardMetadata` resolve to `BufferManager::GetMetadata` (UND → `libgralloc.qti.so`), which reads the layout `libgrallocutils` computed. Byte-identical OOS↔LOS. |

## Where P010 plane layout is computed (name @ Ghidra / file off, libgrallocutils.so)

The authority is `gralloc::GetYUVPlaneInfo` → `gralloc::GetYuvSPPlaneInfo` (semi-planar; P010 is semi-planar
NV12-style). The `mapper.qti.so` `getMetadata(PLANE_LAYOUTS)` path bottoms out here via `BufferManager::GetMetadata`.

| symbol | Ghidra | file off | role |
|---|---|---|---|
| `gralloc::GetYUVPlaneInfo(BufferInfo&, fmt, w, h, …, PlaneLayoutInfo*, private_handle_t*, android_ycbcr*)` | `0x153f60` | **`0x53f60`** | master format dispatcher → per-format plane math; also fills `android_ycbcr` (the lock view) |
| `gralloc::GetYuvSPPlaneInfo(BufferInfo&, fmt, w, h, …, PlaneLayoutInfo*)` | `0x153f30` | **`0x53f30`** | semi-planar Y+CbCr math — **the P010 case lives here** |
| `gralloc::CopyPlaneLayoutInfotoAndroidYcbcr(base, planeCount, PlaneLayoutInfo*, android_ycbcr*)` | `0x153f70` | **`0x53f70`** | turns the PlaneLayoutInfo into the `android_ycbcr{y,cb,cr,ystride,cstride,chroma_step}` the lock returns |
| `gralloc::CameraInfo::GetCameraFormatPlaneInfo(...)` | `0x12fc18` | `0x2fc18` | camera-private-format plane path (used for camera-allocated buffers; queries the format-util authority) |
| `gralloc::GetPlaneLayout(private_handle_t*, vector<PlaneLayout>&)` | `0x154020` | `0x54020` | builds the AIDL `PlaneLayout` vector consumed by `getStandardMetadata(PLANE_LAYOUTS)` |

## The P010 chroma/stride/alignment math (decompiled, `GetYuvSPPlaneInfo` + `GetYUVPlaneInfo`)

Two P010 carriers, both **contiguous, chroma-after-luma**:

**(1) QTI internal P010 `fmt==0x114`** (`GetYuvSPPlaneInfo`, the dominant camera path):
```
luma:    y_stride   = align(W, ...)          → PlaneLayoutInfo[5]=W, [7]=H, [8]=luma_size (= y_stride·H)
chroma:  c_height   = (H+1)/2 rounded: ((H+1)>>1 + 0xf) & ~0xf     // align((H+1)/2, 16) — 16-row chroma align
         c_size     = y_stride · c_height                          // PlaneLayoutInfo[0x11]
         c_offset   = luma_size                                    // PlaneLayoutInfo[0xc] = luma_size  ← CONTIGUOUS
         c_stride   = y_stride << 1                                // PlaneLayoutInfo[0xd] = 2·stride (10-bit, 2 B/px)
         c_step     = (P010 packed, 2 bytes/sample)                // PlaneLayoutInfo[0xf]
```
The decisive line is **`PlaneLayoutInfo[0xc] = luma_size`** → the chroma plane begins **immediately after** the
luma plane in the **same allocation** (no separate dmabuf, no gap). Sibling formats 0x10b/0x109 (NV12/NV21 8-bit),
0x113, 0x116, 0x114 (P010) all share this `c_offset = luma_size` contiguity in `GetYuvSPPlaneInfo`.

**(2) Standard / VENUS P010 `fmt==0x36` / `0x7fa30c0a`** (`GetYUVPlaneInfo`, `code_r0x00127cf4`): uses
`MMM_COLOR_FMT_Y_STRIDE`/`Y_SCANLINES`-style page alignment —
```
y_stride  = MMM_COLOR_FMT_Y_STRIDE(P010, W)        // [6]
y_scan    = align(H, 16/256 by UBWC bit @handle+4 &0x8000000)   // [7]
luma_size = y_stride · y_scan                       // [8]
c_offset  = luma_size                               // [0xc] ← CONTIGUOUS, page-aligned by the Y_SCANLINES align
c_stride  = MMM_COLOR_FMT_Y_STRIDE(P010, W)         // [0xf]
c_size    = c_stride · c_scan                       // [0x11]
```
Same invariant: **Cb = Y_base + page_align(luma_size)**, one allocation.

**The contiguity mechanism, named:** chroma offset is set **= the page-/scanline-aligned luma size within the
single buffer** (`PlaneLayoutInfo[0xc] = luma_size`), and `GetYUVPlaneInfo`'s metadata-merge block
(`param_8 != 0`) recomputes it as `handle->base@+0x54 + planeInfo[0xc]` then advances by `align(c_size, 0x80)` —
so chroma is forced contiguous **and width-aligned to 0x80** off the luma base. There is no separate chroma
allocation; the "page-align(⅔·avail)" libapsfixup reproduces is exactly this `c_offset = align(luma_size)`
arithmetic done from the *outside*.

**The lock view** (`CopyPlaneLayoutInfotoAndroidYcbcr`, `planeCount==3` semi-planar branch):
```
ycbcr.y      = base + planeInfo[3]      (y_offset)
ycbcr.cb     = base + planeInfo[0xc]    (= base + luma_size)          ← contiguous chroma
ycbcr.cr     = ycbcr.cb + 1             (interleaved: Cr = Cb+1, NV12-order)
ycbcr.cstride= planeInfo[0xd]  ;  chroma_step = planeInfo[0xf]
```

## Pairing with the stock capture — producer vs expected vs forced

Stock `trace_p010_planes.log` (V16.1.0, HDR-Photo P010) **OBSERVES the above math at runtime**, confirming the
mapper produces contiguous chroma:
- libui `lockPlanes`: `planeCount=3`, `plane[0]` (Y) `rowStride=1920`, `plane[1]` (Cb) `data=…e98001`,
  `plane[2]` (Cr) `data=…e98000` → **Cb = Cr + 1** (exactly `CopyPlaneLayoutInfotoAndroidYcbcr`'s `cr = cb+1`),
  and `Cb − Y = …e98001 − …be6000 ≈ 0x2b2000 = 1920 × 1472` (1440→1472 32-row align) — **contiguous, chroma
  starts at luma_size**. Downscale variant: `rowStride=1024`, `Cr − Y = 0xb8000 = 1024 × 736`. Same rule.
- blob `camApsBufferLockPlanes(buf)` → `descriptor(ret)=0x0` (NULL) ×20 — the APS consumer's *own* per-plane VA
  fetch returns NULL while libui's lock at the **same handle** succeeds with the contiguous layout above.

**The delta (produces / expects / forces):**
- **OOS mapper PRODUCES:** a single-allocation P010 with `cb = y + page_align(luma_size)`, `cr = cb+1`,
  `cstride = 2·ystride` — contiguous, page-/32-row-aligned chroma (the `GetYuvSPPlaneInfo` 0x114 math above).
  This is correct and identical OOS↔LOS (byte-identical blob).
- **APS EXPECTS:** the same contiguous `chroma = luma + page_align(⅔·avail)`, `pitch[1] = pitch[0]` — i.e. it
  assumes the mapper's contiguous layout when it walks the buffer in the ArcSoft/NEON path.
- **What APS actually GETS (the break):** its **own** descriptor fetch `camApsBufferLockPlanes` returns
  `descriptor=0x0`, so it does **not** read the mapper's contiguous VAs — it falls back to a garbage chroma
  pointer (valid-luma immediately followed by tiny-low garbage), the signature libapsfixup scans for.
- **libapsfixup FORCES:** `chroma ptr = luma + page_align(⅔·avail)`, `pitch[1] = pitch[0]`, and the P010
  LSB→MSB conversion length — i.e. it re-derives **exactly the mapper's own `c_offset = page_align(luma_size)`**
  result from outside, because APS lost it at the NULL-descriptor `camApsBufferLockPlanes` boundary.

So **libapsfixup Family-I is re-computing the value the OOS mapper already computed correctly** — it is not
fixing a wrong mapper layout; it is restoring the contiguous-chroma geometry that the APS consumer's
NULL-returning `camApsBufferLockPlanes` descriptor path discards. The mapper math is the *source of truth*
apsfixup mirrors.

## Rule-out matrix (the "ruled out subsystem Z" deliverable, per Part-C)

| Candidate cause | Instrument | Verdict |
|---|---|---|
| usage-bit divergence (alloc input) | this RE shows the layout is keyed by **format enum** (0x114/0x36) + UBWC handle-flag `@+0x4 &0x8000000`, not by a usage bit that would differ OOS↔LOS | **RULED OUT** — alloc-input not the axis; format/handle-flag identical for the P010 stream both sides |
| mapper/gralloc blob divergence | BuildID: `libgrallocutils` `bbc6b8f7…`, `mapper.qti` `0b763fed…` — byte-identical OOS↔LOS (doc-42 trunk axiom) | **RULED OUT** — same binary computes the same contiguous `c_offset = page_align(luma_size)` both sides |
| namespace (which mapper resolves) | `mapper.qti`→`BufferManager::GetMetadata`→`libgrallocutils` is the in-process Gralloc5/AIMapper path (no `IMapper@4.0::getService`), same on both (D1 §a, X4 REFUTED) | **RULED OUT** — sphal resolution identical |
| **lock-math / consumer ABI (the survivor)** | the producer (mapper) is proven contiguous; the loss is at the **consumer** `camApsBufferLockPlanes`→`descriptor=0x0` boundary, where APS does not consume the mapper's VAs | **THE SURVIVOR** — the divergence is a **consumer-side ABI/lock-math mismatch** (APS's per-plane descriptor fetch yields NULL → garbage chroma), independent of the byte-identical producer. Family-I is the irreducible consumer-side defense. |
| consumer (APS) expectation | libapsfixup Family-I re-derives `chroma = luma + page_align(⅔·avail)`, `pitch[1]=pitch[0]` | **CONFIRMS** the consumer expects the exact page-aligned contiguous chroma the mapper produces |

## RULE-OUT verdict (the *walked* cause)

The OOS P010 contiguity is **produced natively** by `gralloc::GetYuvSPPlaneInfo`/`GetYUVPlaneInfo` setting
`PlaneLayoutInfo.chroma_offset = page_align(luma_size)` within a single allocation (`cb = y + luma_size`,
`cr = cb+1`, `cstride = 2·ystride`) — runtime-confirmed by the stock `Cb−Y = stride×1472` contiguous lock.
Because that producer is **byte-identical OOS↔LOS** and the alloc-input/namespace axes are ruled out, the
P010 divergence cannot live in the *producer*. It lives **consumer-side**: APS's `camApsBufferLockPlanes`
returns a NULL descriptor and so does not ingest the mapper's contiguous VAs, leaving the garbage-chroma
signature that libapsfixup Family-I (`wrap_p010`/`wrap_arc`/`wrap_arc_tfrsn`) re-patches by recomputing the
**same** `chroma = luma + page_align(⅔·avail)` the mapper already laid down. This is the **irreducible
consumer-side ABI lock-math mismatch** doc-42/rearch-14 named — now *walked* to its producer math, not merely
asserted: the mapper is correct and identical, the consumer descriptor path is where the contiguity is lost,
and Family-I was the pre-v1.4 accepted consumer-side defense (no clean upstream lever, because the upstream —
the mapper — is already correct). The v1.4 supersession below narrows that conclusion for the current port.

## v1.4 baseline supersession (2026-06-16)

The producer RE above remains valid, but the old "Family-I is irreducible, therefore keep the shim" conclusion
is not the current v1.4 patchset direction. The latest LOS/OOS A/B in
`docs/rearch/51-los-v14-oos-ab-preliminary.md` shows the P010 allocation/lock shape has converged enough for the
observed failure to move later:

- LOS v1.4 allocates public `format=0x36 (YCBCR_P010)` and reports `planeCount=3` on the app-side plane lock.
- `camApsBufferLockPlanes` returns `0x0` in the current P010 probe, matching the OOS-shaped successful lock
  boundary instead of proving a mapper/gralloc divergence.
- The remaining LOS P010 crash is in `libBasicTonePhoto.so` at `BasicTone_OGL::saveOutImg()` during the
  P010/Pro sequence.

So the shim-retirement candidate is **not** another gralloc/P010 interposer. It is an upstream BasicTone/GL
output-contract patch: buffer writability, dataspace, stride, and GL image assumptions for the P010/Pro path.
Only after that replay is green should `libapsfixup` be dropped from the build. This note should be read as the
producer-layout proof, not as a standing mandate to preserve the shim.

## Caveats / no-fabrication
- The `0x114` ↔ "P010" mapping is the QTI **internal** gralloc format code (not the AOSP public `0x36`); both
  P010 carriers (`0x114` SP path and `0x36`/`0x7fa30c0a` VENUS path) were decompiled and both yield contiguous
  `c_offset = page_align(luma_size)`. The numeric enum is compile-time (not string-stored); the math, not the
  name, is the evidence.
- `GetYuvSPPlaneInfo`/`GetYUVPlaneInfo`/`CopyPlaneLayoutInfotoAndroidYcbcr` are `.dynsym`-named exports; the
  small nominal symbol sizes are stubs but Ghidra resolved the real function bodies (decompiled in full). The
  PlaneLayoutInfo field offsets ([3] y_off, [0xc] c_off, [0xd] c_stride, [0xf] c_step, [8]/[0x11] sizes) are
  read from the decompile, cross-checked against `CopyPlaneLayoutInfotoAndroidYcbcr`'s consumption of the same
  indices.
- The consumer-side `camApsBufferLockPlanes`→`descriptor=0x0` fact is from the stock runtime capture +
  `D1-gralloc-camxformat.md` G-MECH, not re-RE'd here (it lives in libAlgoProcess file `0x1c96f8`, already
  documented). This note adds the **producer** half D1 left DARK.
