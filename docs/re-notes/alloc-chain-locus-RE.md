<!-- STATUS: VERIFIED OBSERVATIONS (device V16.1.0, frida + strace, 2026-06-15) separated from INFERENCE.
     Corrects the standing "gralloc" framing (D1-gralloc-camxformat.md, rearch/42) — gralloc-the-allocator and
     the mapper4->v5 transition are RULED OUT as the P010-malformation root; the locus is UPSTREAM geometry /
     the metadata contract. Root attribution stays INFERENCE until the OOS<->LOS A/B (interop-tree axiom). -->
# Alloc-chain locus — gralloc & mapper4->v5 ruled out; the break is upstream geometry / metadata

## TL;DR (the reframe)
The P010/format malformation that `libapsfixup` repairs was historically discussed under "gralloc" (D1,
rearch/42: "consumer-side ABI lock-math", "same NULL IMapper@4.0::getService going to Gralloc5"). New
instrumentation (2026-06-15) splits "gralloc" into three distinct layers and rules out the first two as the
ROOT, per the interop-tree trunk axiom (a byte-identical blob is a SITE, never a root):

1. **The allocator — RULED OUT (not even in the path).** The camera's P010/processing buffers are allocated
   PROVIDER-side via `DMA_HEAP_IOCTL_ALLOC` on `/dev/dma_heap/system` (CamX/ION), **bypassing the gralloc
   allocator service entirely** — `gralloc::BufferManager::AllocateBuffer` / `Allocator::AllocateMem` fire
   ZERO times on a camera capture (verified: `trace_gralloc_iallocator.js`). And the dma_heap is
   **FORMAT-BLIND**: it returns `len` bytes with no format/stride/plane/alignment opinion. It cannot be the
   locus of a geometry malformation.
2. **The mapper / mapper4->v5 — RULED OUT (symmetric, byte-identical).** `IMapper@4.0::getService()==NULL` is
   EXPECTED on a Gralloc5/AIMapper build (the HIDL v4 service is gone, replaced by the in-process stable-C
   AIMapper) and is **identical on OOS and LOS** — both are Gralloc5, both on byte-identical
   `mapper.qti.so`/`libgrallocutils.so`, and OOS STILL produces contiguous P010 through that exact path. The
   v4->v5 transition is not a divergence; it's the platform, the same on both builds.
3. **The processing — the SITE, not the source.** ArcSoft/`libAlgoProcess` is the CONSUMER that reads the
   buffer; the garbage chroma SURFACES there (and libapsfixup repairs it there), but the consumer neither
   allocated nor laid out the buffer.

So the locus of the wrong number is **UPSTREAM of gralloc**: the geometry INPUTS (described height/stride/
usage/format-enum fed to the CamX/OEM node) and/or the metadata/dataspace publish contract — the "in between"
layer between the byte-identical /vendor allocator+mapper and the byte-identical /odm consumer.

## The discriminating field: dma_heap `len`
Because the dma_heap is format-blind, the requested `len` is the EARLIEST place a wrong alignment can appear.
`trace_dmabuf_alloc.js` decodes `struct dma_heap_allocation_data.len` per alloc (50 distinct sizes/configure
on stock). At the OOS<->LOS A/B this splits the diagnosis cleanly:
- **`len` already differs** → the wrong alignment is baked in UPSTREAM of gralloc (the CamX/OEM geometry
  config writes a different described height/stride). The break is in the configure->size path.
- **`len` matches but realized `impliedAlignedH` diverges** (`trace_gralloc_p010_chain.js`) → the size is
  right but the metadata/read contract disagrees (PLANE_LAYOUTS / dataspace published vs read).
Either branch is NOT the allocator and NOT the mapper version.

## VERIFIED vs INFERENCE
- **VERIFIED (device-measured):** camera buffers go through dma_heap (267 `DMA_HEAP_IOCTL_ALLOC`/configure),
  not the gralloc allocator service (0 `AllocateBuffer`); the dma_heap carries only `len`; the ArcSoft I/O
  struct on stock is the golden contiguous contract (`ARC_HDR_PreProcess`: chroma contiguous, pitch0==pitch1);
  `camApsBufferLockPlanes` returns `descriptor=0x0` on stock; mapper/gralloc/libAlgoProcess are byte-identical
  OOS<->LOS (existing RE).
- **INFERENCE (needs OOS<->LOS A/B):** that the geometry-config / metadata contract is THE root. libapsfixup
  still exists, so SOMETHING is genuinely malformed on LOS — the malformation is real, only mis-located by the
  old "gralloc" framing. Conviction (which upstream field actually moves) resolves only at the A/B; the byte-
  identical blobs are sites, never roots.

## v1.4 A/B update (2026-06-16)

The requested OOS<->LOS split now exists for the current port. For v1.4, the P010 evidence no longer points at
the allocator or mapper, and it also no longer justifies a fresh gralloc shim: the app-side P010 chain reaches
public `YCBCR_P010`, reports three planes, and then fails later in BasicTone's GL save path. Keep this note as
the allocator/mapper rule-out, but pair it with `gralloc-p010-chain-RE.md` and
`docs/rearch/51-los-v14-oos-ab-preliminary.md` for the current fix target: BasicTone output contract first,
shim removal after green replay.

## Probes that carry this (the golden + the A/B oracle)
`trace_dmabuf_alloc.js` (provider, dma `len`), `trace_arcsoft_io.js` (consumer I/O struct), the existing
`trace_gralloc_p010_chain.js`/`trace_p010_planes.js` (realized layout / impliedAlignedH), `hook_configure_streams`
(geometry in). `trace_gralloc_iallocator.js` confirms the allocator-bypass (0 camera hits). Pairs with
`docs/re-notes/gralloc-p010-chain-RE.md`, `docs/re-notes/libapsfixup-interposition-RE.md`,
`docs/interop-tree/data/D1-gralloc-camxformat.md` (whose "gralloc" attribution this note demotes to a SITE).
