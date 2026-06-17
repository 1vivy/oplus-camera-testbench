<!-- STATUS: VERIFIED — live OOS 16.0.7.201 (CPH2747) Frida + golden A/B + 3-lane deep-dive (2026-06-17).
     This note SUPERSEDES the "Venus output format / UBWC config is the root" thesis of
     p010-venus-output-format-RE.md. It is the current authoritative P010 root-cause note. -->
# P010 photo-save crash — dmabuf-`len` A/B, heap placement, and the from-source metadata-environment root

## TL;DR
The LOS Pro/SAT-fusion P010 photo-save crash is **NOT** caused by anything we can toggle or by any binary
that differs. Across **kernel (OOS prebuilt), every vendor blob in the allocate→metadata→read chain, and
the gralloc props**, OOS and LOS are **byte-identical / behaviorally identical**. The crashing 1280×960
P010_VENUS buffer is allocated to the **identical size** (`0x384000`) on both. **The geometry APS uses does
NOT come from gralloc `PLANE_LAYOUTS`** (that GET path is dormant on the working golden too — see CORRECTION).
It comes from the **Oplus camera vendor tag `com.oplus.aps.platform.output.alignment`**, read by
`libAlgoProcess +0x5c76f4`. On LOS the ported camera HAL **never emits that tag** → APS falls to a `0/0`
alignment default → `align_up(luma, 0)` = 4 GB-garbage chroma → BasicTone/ArcSoft walk off. **`libapsfixup`
re-derives, at the consumers, exactly the scanline + chroma fields that vendor tag would have supplied**
(see the Oracle section). [Leading root is INFERRED — see CORRECTION + the conviction probe.]

## ⚠️ CORRECTION (3-lane deep-dive + build-log, 2026-06-17) — supersedes the gralloc-metadata root below
The "QTI `PLANE_LAYOUTS` metadata not populated/exposed to APS on LOS / from-source AIMapper-namespace-sepolicy
seam" thesis (stated in the original TL;DR and the "surviving root" section) is **REFUTED**:
- **`getPlaneLayout` (libAlgoProcess +0x12127c) fires 0× on the WORKING OOS golden too** (gated off by the
  `useMetadata` singleton on both builds). `camApsBufferLockPlanes → descriptor=0x0` (854 hits LOS) and
  `getMetadata res:-2` are **byte-for-byte SYMMETRIC** golden↔LOS — red herrings, not the divergence.
- **No env gap:** zero LOS-only sepolicy denial / missing-dlopen / namespace block on the gralloc-metadata
  path (every hook fires identically both sides). The gralloc SET and GET stacks are byte-identical blobs.
- **Build-log:** `vendor/qcom/opensource/display` (CLO gralloc/libqdmetadata) is **present but NOT built/shipped**
  — installed `libqdMetaData`/`libgralloc.qti`/`libgralloccore` are BuildId-identical to the OOS .300 blob
  (`ff69aecd…`/`98b2b3b6…`/`55b0696…`). The CLO-display divergence thread is closed.
- **Guard page = incidental Scudo-secondary arena placement**, NOT a deliberate redzone and NOT OOS trickery;
  the major crash variant (garbage scanline, ~12038-row overshoot) faults regardless of the neighbor/guard.
- **OOS plays no trick:** golden chroma = plain contiguous `luma+stride·H = 0x258000`, `Cr=Cb+2` (no flip),
  `sliceHeight=960=align_up(960)` (no wrong height). OOS's only edge is having the alignment field POPULATED.
**ROOT — REFINED AGAIN (RE + live map dump):** `com.oplus.aps.platform.output.alignment` is NOT a camera
vendor tag — it's an **APS JSON params key** read via `APSJsonParser::getJsonMetadata` from
`sApsConfigParamsMap` (3 RE agents agree; no HAL producer/VendorTagDescriptor/config registration; config
blobs byte-identical). The live map walk shows it is **ABSENT from the WORKING OOS config too** (192 keys;
only `trbokeh.croprect.align` + `qcom.platform.align`) → `getJsonMetadata` returns `count=0` on OOS as well.
SYMMETRIC with the golden — NOT a static-config divergence. ⇒ By elimination (not static config, not gralloc
metadata, not a vendor tag — all symmetric on the golden), the alignment value that makes OOS work comes from
a **RUNTIME source**: per-session OEM param injection via `camApsSetParameters` / `APSParamsHolderImpl`, which
is **OEM-`com.oplus.camera`-identity-gated** (the port's known systemic gap). LEADING (INFERRED) ROOT:
**OEM-identity-gated runtime param/metadata STARVATION** — one root for the P010 alignment AND the SAT-fusion
identity / `oemChimetadatas.size 0` class. (The author's `+0x5c76f4` in op_force_align.js is pinned to BuildId
`627697fe`, NOT our `.300` `2217d555`; Lane A even found those fields dead on `.300` — re-pin before trusting it.)
**CONVICTION PROBE:** read `APSParamsHolderImpl::getParamsMap` / `camApsGetParameters` (the RUNTIME params, vs
the static `sApsConfigParamsMap` already dumped) OOS vs LOS for the alignment; and trace `camApsSetParameters`
at init (needs debug-app-wait spawn — post-attach misses it). If identity-gated, the fix is the same
`CAMERA_PACKAGE_NAME` identity work already in flight, fixing a whole param class, not just P010. (The dmabuf-len, byte-identity, guard-page, and libapsfixup-oracle
sections below remain CONFIRMED; only the "surviving root = gralloc metadata seam" attribution is superseded.)

## What was REFUTED today (record-keeping — these were live leads we killed)
- **"Force the output to linear P010 (0x36)" as the OOS-faithful fix** — REJECTED. Live A/B: stock OOS
  requests the **same** `P010_VENUS 0x7FA30C0A` output (usage `0x20003`). Forcing linear is a valid
  *workaround* (linear geometry needs no extended metadata), not OOS parity.
- **"The gralloc/UBWC config (`disable_ubwc` / `hw_supports_ubwcp`) is the lever"** — REFUTED. Live reverse-
  A/B on OOS: `hw_supports_ubwcp=0` is benign (photos save, valid geometry); `disable_ubwc=1` breaks OOS
  only as a **provider CamX recovery-storm SIGABRT** ("Consecutive recovery… raising sigabort") — a DIFFERENT
  fault from LOS's app-side SIGSEGV, and even different from LOS's real provider abort (`ncsUnreleased 16`).
  A boot-time prop set "breaks ALL cam" = global UBWC-off sledgehammer, broader than the narrow P010 fault.
  The SoC is **canoe**, whose init branch sets NEITHER ubwc prop (`unset == "0" == no-op`, proven by disasm
  of `IsUBWCDisabled`/`HwSupportsUBWCP` in `snapalloc-impl.so`).
- **"Under-allocation / missing tail padding"** — REFUTED. dmabuf `len` is identical `0x384000` on both
  (see below).
- **"Garbage scanline" as a single field-level root / a single fault** — RE-SCOPED. The raw LOS tombstones
  show THREE distinct faults that were being conflated (see Fault classes).

## The byte-identity wall (nothing in the binary chain or kernel differs)
- **Kernel:** LOS uses the **OOS prebuilt kernel** (user-confirmed) → no UBWCP-driver / SMMU / dma-heap /
  kernel-config divergence. No `ubwcp.ko` on either build (symmetric-absent).
- **Vendor blobs (BuildId-identical OOS .300 ↔ LOS tree):** `libgralloc.qti.so`, `libgralloccore.so`,
  `libgrallocutils.so`, `libmapperutils.so`, `vendor.qti.hardware.display.snapalloc-impl.so`, `mapper.qti.so`,
  `android.hardware.graphics.mapper@4.0-impl-qti`, **`libqdMetaData.so`** (an OOS proprietary blob — there is
  **no** `android_hardware_qcom_display` CLO source in the LOS tree), `libcamxexternalformatutils.so` (the
  P010 scanline/stride authority — mapped in `com.oplus.camera` on live LOS, **fallback-fire-count 0**),
  `camera_alignments.json` (md5-identical, `scanline_align 64`), and `libAlgoProcess`/`libAlgoInterface`/
  `libBasicTonePhoto`.
- **Active mapper:** mapper5/snapalloc (VINTF `@5.0/qti`, `enable_snapalloc=1`) on both → no mapper4↔snapalloc
  ABI split.
⇒ A byte-identical binary cannot read its own metadata "at the wrong offsets," and an identical kernel cannot
  back a different physical layout. The divergence is **not a binary and not the props.**

## dmabuf `len` A/B — IDENTICAL (the decisive size check)
**Provider-side** (`trace_dmabuf_alloc.js`, `provider_dmabuf_len_ab.txt`): heaps are an identical mix
(`/dev/dma_heap/system` + `/dev/dma_heap/qcom,system`) on both; every **shared** P010-class buffer (e.g.
`0x77e000`, `0x780000`) has identical `len`. OOS allocates 17 extra distinct sizes LOS never does — the
"reduced LOS pipeline" signal (fusion-stage truncation after the crash; possibly structural). The crashing
1280×960 fusion OUTPUT (`0x384000`) is **not** in the provider log at all → it is **app-side**
(`com.oplus.camera` via AHardwareBuffer).

**App-side, live OOS** (`trace_venus_dmabuf_extent.js`, `oos201_dmabuf_extent.log`): the 1280×960 P010_VENUS
fusion buffer = **exactly `0x384000`** (byteStride 2560 × 1.5·960), **identical** to the LOS `tombstone_36`
buffer (`…14df4000`–`…15177fff` = `0x384000`). Zero tail padding on either. **dmabuf `len` is NOT the
divergence.**

## Heap placement — OOS readable neighbor vs LOS guard page (the masking mechanism)
For the same-size buffer, the page **immediately after** the `0x384000` end differs:
- **OOS:** MAPPED `rw-` `/dmabuf:AHardwareBuffer` **neighbor** → BasicTone's tail fencepost over-read reads a
  garbage value but **does not fault**.
- **LOS** (tombstone_36): **PROT_NONE guard page** → the identical over-read **SIGSEGVs**.
⇒ Part of OOS's "correctness" for the *fencepost* variant is **heap-placement luck** — there is a **latent
tail over-read on OOS too**, merely masked. (This does NOT explain the *major* LOS variant — see below.)

## The three+ distinct fault classes (de-conflated from raw LOS tombstones)
| fault | process | signature |
|---|---|---|
| BasicTone P010 **tail over-read** | `com.oplus.camera` | SIGSEGV **read** `0x74xx`, 1 page past a correctly-sized `0x384000` buffer; Image w/h/stride SANE; `Image+0x2c sliceHeight` garbage |
| arcsoft **wild write** | `com.oplus.camera` | SIGSEGV **write** `0x7900000000` into `[anon:dalvik-linear-alloc shadow map]` — a SEPARATE bug (this is the `0x79…` addr earlier theories cited) |
| provider **NCS leak** | `provider-service_64` | SIGABRT **`ncsUnreleased 16`** (OemLayer HealthMonitor) — NOT a recovery storm |
| (OOS reverse-A/B artifact) | `provider-service_64` | SIGABRT "Consecutive recovery… raising sigabort" — only under `disable_ubwc=1`; not a LOS fault |

Two real LOS variants of the BasicTone/ArcSoft class: **(A) fencepost** (reads ~1 row past a correctly-sized
buffer; masked on OOS by the neighbor) and **(B) genuine metadata garbage** (`V2::prepareImage` live:
`scanline=4093391407`, `chroma=0x7900000600`; tombstone run2: 12038-row overshoot). (B) overshoots far past
any neighbor and would crash regardless of heap layout.

## The surviving root — QTI extended metadata not populated/exposed on LOS  [SUPERSEDED — see CORRECTION above]
> This section is RETAINED for the addresses/field-map but its ROOT ATTRIBUTION is refuted: `getPlaneLayout`
> is dormant on the golden too, so the QTI metadata GET path is not the divergence. The real geometry source
> is the Oplus vendor tag `com.oplus.aps.platform.output.alignment` (libAlgoProcess +0x5c76f4), absent on LOS.
Live LOS: `APSGrallocUtils::getPlaneLayout` (libAlgoProcess +0x12127c) **never fires** and
`camApsBufferLockPlanes` early-returns `descriptor=0x0` for the P010_VENUS buffer. APS reads geometry from
the **QTI-extended** gralloc metadata (`PLANE_LAYOUTS` / `libqdMetaData`), **not** the AOSP-standard
`AHardwareBuffer_Desc` — so when that metadata is absent, scanline/chroma stay unset → variants (A)/(B).
Because no binary/kernel/prop differs, the only thing that can fail to populate/expose that metadata is the
**from-source layer**: AOSP/Lineage framework (`libgui`/`libui`/`libnativewindow`, `cameraservice`) + the
**Gralloc5/AIMapper stable-C interface glue** + **linker-namespace/VNDK** visibility for `com.oplus.camera`
(sphal) + **sepolicy** on the gralloc-metadata / dma-buf path. (We already know one missing helper exists:
`libHeifWinBufExchg-jni.so` is absent on device.)

## libapsfixup ORACLE — what it is *fundamentally* addressing (mapped to the evidence)
`libapsfixup` is a DT_NEEDED interposer on `libAlgoProcess` with 4 GOT-redirect wrappers. Mapping each to the
low-level malformation it compensates, and to today's evidence:

| wrapper | what it overrides | the malformation it band-aids | what the evidence says it's REALLY compensating |
|---|---|---|---|
| **#1 `wrap_p010`** | P010 conversion **row-count** (GOT `+0x689ba8`) | a wrong/garbage **sliceHeight/scanline** | the missing `PLANE_LAYOUTS` **scanline** APS never read (`getPlaneLayout` no-fire) — variant (B) |
| **#2 `wrap_arc`** | ArcSoft **chroma VA** + pitch | a wrong/unset **chroma plane offset/pitch** | the missing `PLANE_LAYOUTS` **chroma offset** (an INDEPENDENT field from scanline) |
| **#3 `wrap_arc_tfrsn`** | TFRSN ArcSoft chroma VA + pitch | same chroma-offset class for the night-fusion engine | same missing chroma metadata, different consumer |
| **#4 `wrap_ogltone`** | (BasicTone OGL) | — | **INERT** — not installed in the on-device `libapsfixup.ondevice-orig.so`; why BasicTone still crashes |

**Fundamental purpose:** libapsfixup re-derives, at FOUR consumer sites, the two geometry fields (scanline,
chroma offset) that the **gralloc metadata should have carried into APS but didn't on LOS**. It is a
consumer-side metadata-completion shim. It works only where its wrapper is installed (BasicTone #4 is inert →
BasicTone crashes), which is exactly why a **single producer-side fix** (make the QTI extended metadata reach
APS, i.e. fix the from-source environment seam) retires all four. This is the "is OOS playing tricks on the
low-level dmabuf/gralloc surface?" question, answered: OOS isn't padding the buffer or changing its size — it
is **carrying QTI plane-layout metadata (scanline + chroma offset) that APS consumes**, which the LOS
environment fails to populate/expose. The chroma-flip / wrong-height symptoms libapsfixup patches are
downstream of that one missing-metadata cause.

## Open questions / next probes (the env-gap hunt + the guard-page question)
1. **SET vs GET split (LOS):** at allocation, does the QTI gralloc actually *write* `PLANE_LAYOUTS` for the
   Venus buffer? Then a **raw `IMapper::get(PLANE_LAYOUTS)`** (bypassing APS) — does it return valid data?
   - SET-missing → producer/framework (the from-source import/allocate path) or a missing helper.
   - SET-ok + raw-GET-fail → AIMapper stable-C ABI / namespace seam.
   - raw-GET-ok + APS-`getPlaneLayout`-fail → APS's non-standard QTI-metadata access path.
2. **Guard-page placement:** is the LOS guard page after the buffer a deliberate allocator behavior OOS
   suppresses, or just arena-layout variance? Compare the allocator's post-buffer mapping policy OOS↔LOS
   (does OOS pool these dmabufs so a neighbor always follows, vs LOS placing PROT_NONE redzones?). This
   decides whether variant (A) is fixable by allocation policy or only by the loop-bound/metadata fix.
3. **Env-gap hunt (static, no device):** missing-dlopen siblings of `libHeifWinBufExchg-jni.so` in the
   gralloc/APS metadata path; sphal/VNDK namespace visibility for `com.oplus.camera`; sepolicy denials on the
   gralloc-metadata / dma-buf access during P010 capture.

## Anchors / evidence
- Evidence dir: `.omo/evidence/v15-camera-build/p010-oos-ab-201/` — `VERDICT.md` (incl. SUPERSEDED section),
  `oos201_describe_allocate.log`, `oos201_lockplanes_geometry.log`, `oos201_dmabuf_extent.log`,
  `provider_dmabuf_len_ab.txt`, `oos201_configure_streams.log`.
- Probes: `tools/frida/trace_p010_output_format.js`, `trace_gralloc_alloc_request.js`,
  `trace_venus_plane_geometry.js`, `trace_venus_dmabuf_extent.js`.
- Raw LOS tombstones: `reference/campaign/p010/run{1,2}/ab/tombstone_{36,37}`,
  `reference/campaign/p010-basictone/run{1,2}/ab/tombstone_{26,30}`,
  `reference/campaign/masterraw/run{1,2}/ab/tombstone_{43,44}`.
- Supersedes the thesis of `p010-venus-output-format-RE.md`; pairs with `alloc-chain-locus-RE.md`
  (the "upstream geometry/metadata" framing, now pinned to the from-source environment),
  `libapsfixup-interposition-RE.md` (the shim this characterizes), `gralloc-ruled-out-reframe`.
