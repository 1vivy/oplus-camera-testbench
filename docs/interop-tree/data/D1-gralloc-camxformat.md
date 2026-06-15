<!-- Parent: ../INDEX.md -->
---
node: D1
title: "gralloc / mapper / CamxFormatUtil (P010) — the libapsfixup locus"
plane: data
partition: /vendor
blob_identical_oos_los: true   # mapper.qti.so + libgrallocutils + libcamxexternalformatutils all byte-identical OOS↔LOS
characterization: PARTIAL      # (a) libui lock side OBSERVED on stock (trace_p010_planes.log, V16.1.0: P010 planeCount=3, rowStride=1920, Cr−Y=stride×1472 contiguous) + blob camApsBufferLockPlanes consume-point OBSERVED (ret=0x0 ×20, stable); still DARK: blob APSGrallocUtils::getPlaneLayout Cb/Cr garbage-vs-aligned classifier never emitted (hook armed, no line) — not yet end-to-end
conviction: BLOCKED            # runtime OOS↔LOS A/B still LOS-deferred (G-SYM); stock P010 lock NOW fires (probe captured on V16.1.0) but the blob getPlaneLayout garbage-discriminator did not — r3 still staged for the unfrozen-LOS A/B
verdict: ""                    # axiom: a byte-identical blob is never the root — fix is a namespace knob (E4), not a blob edit
confidence: low
symptoms: [5, 1]              # #5 P010/IMapper@4.0-NULL roots here (proximate); feeds #1 freeze
probes: [r3-gralloc, trace_p010_planes.js, trace_gralloc_p010_chain.js, trace_arcsoft_io.js, trace_dmabuf_alloc.js]
gaps: []                      # gralloc lever = FRIDA-ONLY (lever-index): no setprop verbosity; r3 + frida bridge it
dodge_ref: ""                 # root may live in E4 (namespace reachability) — see E4 dodge-vs-dirty
dirty_ref: ""
divergence: ""                # E4 owns the divergence verdict; D1 is the crash/stall SITE, not the root
upstream: [C5, D2]            # C5 CamX/feature2 (stream geometry) + D2 HAL-fill feed the P010 buffer here
downstream: [D2]             # wrong layout → APS/libAlgoProcess OOB read → SEGV / frame-1 hold
refuted_refs: [R-D1-libui, R-D1-snapalloc, R-D1-usagebit, R-D1-getstub-21e5b4]
doc_refs: [doc-42, doc-14, doc-46, alloc-chain-locus-RE]
updated: 2026-06-15
---

# D1 — gralloc / mapper / CamxFormatUtil (P010)

> **ONE LEAF, not the focus.** `libapsfixup`/P010 is the most-walked branch and the most-refuted. This node
> exists to (1) name the exact P010 plane carriers, (2) carry the EXHAUSTIVELY-REFUTED candidates so we never
> re-walk them, and (3) point the one live fact at **E4** (linker namespace), per the axiom: the mapper blob is
> byte-identical OOS↔LOS, so it is the crash SITE — the root is environmental.

## (a) Propagation contract

> **OBSERVED on stock** — condition `p010` (V16.1.0 / OP611FL1, HDR Photo P010 + Master/Pro capture, ae_lock=1,
> SELinux Enforcing; `app_probes/trace_p010_planes.log`, N=2 verdict ALL STABLE). The probe FIRED: libui lock
> side (A) + blob `camApsBufferLockPlanes` (B) both captured. STILL DARK: the blob `APSGrallocUtils::getPlaneLayout`
> Cb/Cr garbage-vs-aligned classifier — hook **armed** (`(B) APSGrallocUtils::getPlaneLayout @ +0x12127c`) but
> emitted **no** `[BLOB getPlaneLayout]` line this capture, so the "garbage Cb" prediction is un-observed.

**What enters** (carriers the P010 buffer arrives with) — **OBSERVED**:
- libui lock (A `AHardwareBuffer_lockPlanes`/`GraphicBufferMapper::lockYCbCr`) reports the **full-res P010** buffer as
  **`planeCount=3`**, `rc=0`: `plane[0] pixStride=1 rowStride=1920` (luma), `plane[1] pixStride=2 rowStride=1920` (Cb at `+1` byte),
  `plane[2] pixStride=2 rowStride=1920` (Cr) — semi-planar interleaved (`plane[1].data == plane[2].data + 1`).
- **Contiguity invariant CONFIRMED at runtime:** observed `Cr − Y = 0x2b2000 = 2826240 = stride(1920) × 1472` → exactly
  **`Cb − Y == stride × height_aligned`** with 1440→**1472** 32-row align (matches `/vendor/etc/display/camera_alignments.json`,
  OOS prediction). Downscale P010 stream variant also observed contiguous: `rowStride=1024`, `Cr − Y = 0xb8000 = 1024 × 736`
  (720→736, same 32-row rule). RAW stream alongside: `planeCount=1 pixStride=0 rowStride=5120`.
- Format = `HAL_PIXEL_FORMAT_YCBCR_P010`; lock path `AHardwareBuffer_lockPlanes` (Gralloc5/AIMapper in-process — **no**
  `IMapper@4.0::getService`). CamX corroborates the P010 path live: `numYUVP010HLGStreams`, `processUpTransform: input P010`,
  `P010ConvertLSBToMSBTask`, `DownTransform_cvtmSdr2HdrP010_kernel` (run1 logcat).
- PLANE_LAYOUTS metadata-field offsets (static, `trace_p010_planes.js`, NOT re-confirmed at runtime this capture):
  `PL_OFFSET_IN_BYTES 0x18`, `PL_STRIDE_IN_BYTES 0x28`, `PL_HEIGHT_SAMPLES 0x38`, `PL_TOTAL_SIZE 0x40`, `PL_SIZEOF 0x58`.

**What leaves** (carriers consumed downstream by APS/`libAlgoProcess.so` BuildID `82fe443b…`):
- `camApsBufferLockPlanes(buf)` → `ApsBufferDesc*` (file `0x1c96f8`) — **OBSERVED firing ×20, every return `descriptor(ret)=0x0`
  (NULL), stable** across the whole capture. This is the blob's per-plane VA descriptor consume-point: on stock it returns
  NULL while the parallel libui lock (A) succeeds with the contiguous layout above — i.e. the algo does **not** take its
  per-plane VAs from this call on stock (consistent with the apsfixup/`p010LSB2MSBNeon` GOT-repair being the live path).
- `APSGrallocUtils::getPlaneLayout(this, buf, lumaBase, &Cb, &Cr)` — file `0x12127c` / Ghidra `0x22127c`. Formula (static):
  `*Cb = luma_base + PlaneLayout.offsetInBytes + component.offsetInBits/8` (reads metadata type `0xf` via mapper vtable `+0x48`).
  **Hook armed but NOT fired** this capture — the Cb/Cr garbage-vs-aligned discriminator is the one carrier still DARK.
- ArcSoft output struct anchor consumed downstream: `+0x40` luma / `+0x48` chroma / `+0x60` pitch[0] / `+0x64` pitch[1].
- `libapsfixup` GOT redirect `P010_GOT_OFF 0x689ba8` → `APSFormatConverterNeon::p010LSB2MSBNeon` (vaddr `0x4fc094`) — the in-process repair when Cb is garbage (xcheck hook armed @ `0x...112094`).

> **G-MECH (runtime↔RE pairing):** the RE consume-point `camApsBufferLockPlanes` @ file `0x1c96f8` is OBSERVED returning
> `descriptor(ret)=0x0` on every stock P010 lock (×20, stable) — the NULL-descriptor mechanism is directly seen, not inferred,
> while the libui lock at the same handle returns the contiguous `stride×1472` layout. (The garbage-Cb mechanism at
> `getPlaneLayout` @ `0x12127c` remains un-observed — that hook armed but did not fire.)

## (b) Environment dependencies (the non-blob things the contract needs)

- `/vendor/lib64/hw/mapper.qti.so` — `DT_NEEDED libgrallocutils.so` (+`libgralloccore.so`); runs in **every** locking process incl. `com.oplus.camera`.
- `/vendor/lib64/libgrallocutils.so` — carries **31–33** `CamxFormatUtil`/`camxexternal` strings incl. fallbacks **"Failed to link CamxFormatUtil…"** and **"Unable to get IS_UBWC from snap"** (`strings -a` authoritative). dlopen-resolves the plane authority below.
- `/vendor/lib64/libcamxexternalformatutils.so` — the camera plane-layout authority (exports `CamxFormatUtil_GetPlaneAlignment`). **Present in the LOS build** but **absent from every app-visible `public.libraries.txt`** (ours + OOS).
- `/vendor/etc/display/camera_alignments.json` — drives the alignment (md5 `b8d7c88f` enable-script; 8 alignment JSONs byte-identical OOS↔LOS).
- **Linker namespace** (E4): whether `com.oplus.camera`'s vendor/sphal namespace search-paths reach `libcamxexternalformatutils.so`. `vendor.gralloc.enable_snapalloc=1` + passthrough `mapper@4.0-impl-qti-display.so` are **already on the live LOS build** — neither is the gap.
- sepolicy: access-denial is **REFUTED** (repros run `setenforce 0`; OOB still occurs permissive — linker ≠ SELinux).

## (c) Fact-to-resolve

**Q (LEADING MECHANISM):** Does `com.oplus.camera`'s linker namespace **fail the dlopen** of `/vendor/lib64/libcamxexternalformatutils.so` (firing `libgrallocutils`'s "Failed to link CamxFormatUtil" generic-fallback branch), yielding the wrong UV offset / chroma stride / plane count that `libapsfixup` repairs?

- **Fires (PROVEN):** the fallback log line appears in `com.oplus.camera` → root is **namespace reachability = E4**. Prediction: blob `getPlaneLayout` Cb is garbage (`align_up(luma,4GB)`, lo32<`0x100000`) while libui's lock reports the aligned `stride×1472`. **Action unlocked:** expose `libcamxexternalformatutils.so` (+ `camera_alignments.json` reachable) to the app namespace — a `public.libraries.txt` entry / namespace-link / `ld.config` parity, the **same lever-class as the `libapsfixup` exposure** (doc-46 Tier-2 `ffb638b`). Retires `libapsfixup` P010 repair **and** the `hwJpegRegisterImpl` getStub-flip together.
- **Silent (REFUTED):** the vendor/sphal namespace already carries the search-path → dlopen succeeds → send to alt-(ii): a non-usage allocation input (format enum / dims / *which* allocator instance the non-stock priv-app resolves). Cross-SoC commonality (OP13+OP15 need the same shim) still says it is NOT blob/SoC/sepolicy.

## (d) Runtime probe(s)

- **`tools/observability/r3-gralloc/30_run_r3.sh <oos|los|los-enforcing>`** → `parse_r3.py` — the handle-correlated `allocate→import→lock` A/B (doc-42 §2 CORRECTION / §2.5). Emits the decision columns: `camxformat_mapped`, `dlopen_result` (`R3|DLOPEN` OK|NULL), `fallback_fires` ("Failed to link CamxFormatUtil" count), `alloc_usage` (`R3|ALLOC`), `lock_layout`, `blob_cb` (`[BLOB getPlaneLayout]` aligned-vs-garbage). The diverging column = the root.
- **`tools/frida/trace_p010_planes.js`** — captures (A) what the lock reports (libui `getPlaneLayouts`/`lockPlanes`/`lockYCbCr`, aligned Cb) vs (B) what the blob computes (`APSGrallocUtils::getPlaneLayout` Cb/Cr) per P010 handle; classifiers `isBuf`/`isGarbage`/`isAlignUp4G` mirror apsfixup's `[0x60,0x7f]` window. NATIVE-ONLY (no Java.perform — Java hooks crash this ART).
- **Decisive one-liner during capture:** `adb logcat | grep -iE "Failed to link CamxFormatUtil|Unable to get IS_UBWC from snap"` in `com.oplus.camera`.
- **Lever status = FRIDA-ONLY** (lever-index "gralloc / mapper"): no setprop verbosity lever exists; r3 + trace_p010_planes.js are the only bridge. `/proc/<pid>/maps | grep -E 'camxexternalformat|grallocutils|gralloccore|mapper.qti'` namespace snapshot is folded into r3.
- **BLOCKED gate:** the v19 freeze (#1) wedges preview+capture so the P010 lock never fires → r3 is **staged on an unfrozen build** (G-SYM is dodge-oracle vs our-dirty at E4, runnable on the E-plane now; the D1 runtime A/B is LOS-deferred).

## (e) Dodge-vs-dirty diff

D1 is a crash/stall SITE; the divergence verdict is owned by **E4** (namespace) — see E4's dodge-vs-dirty. The dodge oracle is `public.libraries.txt` / `ld.config.oplus.txt` reachability of `libcamxexternalformatutils.so`. Caveat (doc-42 §2.5): OOS `system_ext/oplusex/ld.config.oplus.txt` is only 16 lines and does **not** explicitly grant camx/camera — so the exact OOS reachability path (vendor/sphal namespace default search-paths vs an explicit grant) must be pinned in E4 before authoring the fix. The `ffb638b` Tier-2 lever (exposes `/odm` `libapsfixup.so` to the app namespace) is the proven same-class precedent.

## (f) Symptom leaves

- **#5 (P010 / IMapper@4.0 getService NULL)** — PROXIMATE-SITE here (non-contiguous P010 lock → APS OOB). ROOT is the broken namespace propagation contract at **E4** (mapper/allocator blobs md5-identical; OOS also NULLs `IMapper@4.0::getService` and still gets contiguous). Edge: `D1 →(namespace dlopen)→ E4`.
- **#1 (preview freeze)** — D1 FEEDS it: a wrong/garbage P010 layout makes `libAlgoProcess` mis-read and hold frame 1 (`decMetaRefZeroToRemove` upcall never made). D1 is a contributing SITE, not #1's root (#1's release-gate root is OPEN at C6/D3).

## (g) UPDATE 2026-06-15 — alloc-chain golden captured; the gralloc-allocator-bypass reframe

New stock golden (24/24 matrix via `RUNNER=full_baseline.sh campaign.sh`; probes `trace_dmabuf_alloc` /
`trace_arcsoft_io` / `trace_gralloc_iallocator`). This LIGHTS the downstream ArcSoft-struct carrier ((a)
line 62) and splits "gralloc" into three layers — the axiom holds (gralloc blob = SITE), and the fact-to-resolve
(c) gets a discriminating field. Full reframe: `docs/re-notes/alloc-chain-locus-RE.md`.

- **ALLOCATOR BYPASS (new, VERIFIED):** the camera's P010/processing buffers are allocated PROVIDER-side via
  `DMA_HEAP_IOCTL_ALLOC` on `/dev/dma_heap/system` (CamX/ION) — `gralloc::BufferManager::AllocateBuffer` /
  `Allocator::AllocateMem` fire **ZERO** times on a camera capture (`trace_gralloc_iallocator.js`). The gralloc
  ALLOCATOR service is not in the camera path; gralloc's role here is mapper/layout only. The dma_heap is
  **FORMAT-BLIND** (returns `len` bytes, no stride/plane/format opinion).
- **dma `len` golden — the DISCRIMINATOR for (c):** `trace_dmabuf_alloc.js` captured the per-configure requested
  sizes (gralloc-p010 55 distinct, p010 69, scandoc 57, switch[120x] 50 incl a 4.5 MB super-zoom buffer; notable
  system-heap lens 6291456 / 2097152 / 1843200). Because the heap is format-blind, `len` is the EARLIEST place a
  wrong alignment can appear, and it splits (c)'s two surviving branches at the A/B: **`len` DIFFERS** OOS↔LOS ⇒
  wrong geometry baked in UPSTREAM of gralloc (the C5 described-height/stride config — the "non-usage allocation
  input" alt-(ii)); **`len` MATCHES but realized `impliedAlignedH` diverges** ⇒ the E4 namespace / metadata-layout
  branch (fallback `CamxFormatUtil` wrong offsets). Stock-only this is the golden; the branch resolves at A/B.
- **ArcSoft I/O struct GOLDEN — (a) line-62 carrier now LIT:** `trace_arcsoft_io.js` captured the DOWNSTREAM
  consume struct (`+0x40` luma / `+0x48` chroma / `+0x60` pitch0 / `+0x64` pitch1) on stock. The live engine is
  **`ARC_HDR_PreProcess`** (libarcsoft_high_dynamic_range_couple), NOT the libapsfixup-named `ARC_Turbo_RAW`.
  GOLDEN (gralloc-p010 + p010, deterministic): chroma **CONTIGUOUS** `(chroma−luma)=0x258000 (= stride 2560 × 960)`,
  **`pitch0==pitch1==2560`**. On LOS this struct is the Family-I break (chroma garbage / pitch1=0). `camApsBufferLockPlanes`
  still returns `descriptor=0x0` on stock (consistent with (a)/G-MECH).
- **mapper4→v5 RULED OUT as root (explicit):** `IMapper@4.0 NULL`→Gralloc5 is SYMMETRIC OOS↔LOS on the byte-identical
  mapper and OOS still gets contiguous P010 — not a divergence (was implicit in R-D1-getstub; now stated).

NET: gralloc-allocator + mapper-version are confirmed SITES (axiom); the locus is upstream geometry (C5) and/or
the namespace/metadata-layout contract (E4), and the new dma-`len` field is what DISCRIMINATES the two at the A/B.

## REFUTED candidates (carried so we never re-walk — doc-42 EXHAUSTIVE VERDICT, R-D1-*)

- **`libui` lock-math** — `Gralloc5Mapper::lock`/`lockYCbCr` logically identical AOSP in both binaries, reads `offsetInBytes` literally, no oplus patch (the OOS +50KB is EDID/display). 3rd-fork scan: byte-identical clean AOSP. **REFUTED** (Probe A). `R-D1-libui`.
- **snapalloc / allocator engine** — `vendor.gralloc.enable_snapalloc=1` live on LOS; `snapalloc-impl.so` loaded; all 8 alignment JSONs + enable-script (md5 `b8d7c88f`) + CamX format-util + `mapper.qti.so` byte-identical. 32-row align (1440→1472) is BY DESIGN. **REFUTED** (Probe A2/C). `R-D1-snapalloc`.
- **OEM gralloc-usage bit in /system** — `libgui`/`libcameraservice`(identity-only `g_isOplusCamera`)/`libandroid_runtime`/`libui` all stock-AOSP/QTI for `*Usage*`; usage flags reaching the QTI allocator are very likely IDENTICAL OOS↔LOS. EDR `frameworks/native` port (doc-49) is over-exposure ONLY, not P010. **REFUTED** (Ghidra 2026-06-12). `R-D1-usagebit`.
- **getStub-flip @`0x21e5b4`** (`APSGrallocUtils::initialize`) — the read goes via the v5 AIMapper, not the V4 `getService` handle (NULL on BOTH OOS+LOS); flipping `getStub` changes nothing the read sees → deliberately left UNPATCHED. **REFUTED.** `R-D1-getstub-21e5b4`. *(Distinct from the SHIPPED `hwJpegRegisterImpl` @`0x603a88` flip, which has no V5 fallback → FATAL — that is a separate HW-JPEG site, also a symptom-patch not OOS parity.)*
- **"port the OOS gralloc handling"** — the whole OOS `/system` gralloc chain is **zero-OEM** (`libui` 0/0, `libnativewindow` 0/0, `mapper.qti.so`/`gralloc.default.so`/`libgrallocutils.so` 0/0 oplus syms). No OnePlus gralloc fork exists to lift; divergence is environmental, not binary. **REFUTED.**
- **sepolicy access-denial** for `getStandardMetadata(PLANE_LAYOUTS)` — defeated by permissive-mode repro (OOB occurs under `setenforce 0`). **REFUTED**; only the linker-namespace and non-usage-allocation-input angles survive.
