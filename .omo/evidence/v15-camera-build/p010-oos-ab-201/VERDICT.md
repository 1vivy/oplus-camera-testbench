# OOS P010 A/B verdict — stock OOS 16.0.7.201 (CPH2747), 2026-06-17

Live decisive A/B on stock OOS (`user/release-keys`, KernelSU, frida-server 17.9.11). Settles the one
missing fact from `docs/re-notes/p010-venus-output-format-RE.md`: what format/geometry stock OOS gives
the fusion OUTPUT buffer. **3/3 Master/Pro photos saved, ZERO tombstones** (stock OOS, as expected).

## Finding 1 — format request is IDENTICAL OOS↔LOS (kills fix #1)
The ~1280×960-class 10-bit buffers allocate in BOTH formats on stock OOS, same topology as LOS:
- INPUTS  : `REQUEST 0x36 (LINEAR_P010)  usage=0x20003` → RESOLVED `0x36`
- OUTPUT  : `REQUEST 0x7FA30C0A (P010_VENUS) usage=0x20003` → RESOLVED `0x7FA30C0A`

Stock OOS **requests the fusion OUTPUT as explicit `P010_VENUS`, same format + same usage `0x20003`** as
LOS. ⇒ Forcing the LOS output to linear (old fix #1) would DIVERGE from OOS. **Fix #1 REJECTED.**

## Finding 2 — OOS gralloc reports VALID contiguous Venus geometry (confirms fix #2 + the lever)
`AHardwareBuffer_lockPlanes` (stable NDK export) on the OOS Venus output:

| buffer | rowStride0 | chromaOff | scanline | note |
|---|---|---|---|---|
| 1280×960 LINEAR_P010 | 2560 | 2457600 | 960 (==H) | contiguous |
| 1280×960 **P010_VENUS** | 2560 | 2457600 | 960 (==H) | **identical layout to linear (same luma/chroma VA)** |
| 960×1280 P010_VENUS | 2048 | 2621440 | 1280 (==H) | contiguous |
| 4096×3072 P010_VENUS | 8192 | 25165824 | 3072 (==H) | contiguous |
| 4160×3136 P010_VENUS | 8448 | 26492928 | 3136 (==H) | contiguous |

OOS's gralloc lays out P010_VENUS exactly like linear: `chroma = luma + rowStride·H`, `scanline == H`
(heights are 32-aligned so Venus alignment == linear). The byte-identical APS blob copies this into
ApsBufferPlanes and consumes it fine.

## Conclusion — the divergence is the GRALLOC's P010_VENUS layout, not format or APS code
- Format request: identical (Venus output, usage 0x20003) — not the divergence.
- APS blob: byte-identical OOS↔LOS — not the divergence.
- ⇒ The ONLY remaining variable is the **gralloc/SnapAlloc P010_VENUS plane layout** the blob reads.
  OOS (`disable_ubwc=0`, snapalloc, allocator-service) reports valid contiguous geometry; LOS
  (`disable_ubwc=1` + `hw_supports_ubwcp=0`) is the suspect for reporting garbage scanline.

This also REFINES `gralloc-ruled-out-reframe`: gralloc is bypassed for CamX/ION *stream* buffers, but
the **APS-internal AHardwareBuffer fusion buffers DO go through SnapAlloc**, and that gralloc's
P010_VENUS layout/config IS the lever.

## Durable fix direction (updated)
1. ~~Force output linear~~ — REJECTED (OOS uses Venus too).
2. **Make LOS's gralloc report P010_VENUS like OOS's** — gralloc/UBWC config parity. Prime lever:
   `vendor.gralloc.disable_ubwc 1→0` (+ drop `hw_supports_ubwcp=0`). Possibly the snapalloc/mapper
   version. **DECISIVE confirmation experiment:** reverse-A/B on a unit —
   - On LOS: `run_ubwc_flip_test.py` (set disable_ubwc=0, reboot, recapture) → does Venus geometry
     become valid + crash clear?
   - On OOS (this unit): set `disable_ubwc=1`, restart allocator+camera → does OOS Venus geometry BREAK
     (scanline garbage) + crash reproduce? (reversible setprop; display-stability risk — needs greenlight)
3. Interim shim `fix_p010_venus_descriptor.js` stays valid (works because scanline==H at 32-aligned sizes).

## Artifacts (this dir)
- `oos201_describe_allocate.log` — REQUEST vs RESOLVED format (Finding 1)
- `oos201_lockplanes_geometry.log` — Venus plane geometry (Finding 2)
- `oos201_configure_streams.log` — provider op_mode 0x830b(preview)/0x8009(9-stream master capture)
- Probe: `tools/frida/trace_p010_output_format.js`, `trace_gralloc_alloc_request.js`,
  `trace_venus_plane_geometry.js`

---

## ⚠️ SUPERSEDED — UBWC-config lever REFUTED (2026-06-17, live reverse-A/B + 3-lane deep-dive)

The "Durable fix direction #2 (gralloc/UBWC config is the lever)" above is **WRONG**. Evidence:

1. **Live OOS reverse-A/B** (flip OOS to the LOS gralloc condition): `hw_supports_ubwcp=0` is **benign**
   (valid geometry, photos save); `disable_ubwc=1` breaks OOS only as a **provider CamX recovery-storm
   SIGABRT** (3×) — a DIFFERENT fault from LOS's app-side BasicTone/ArcSoft SIGSEGV (and different even from
   LOS's real provider abort, which is `ncsUnreleased 16` HealthMonitor). Boot-time prop set (user) "breaks
   ALL cam" = global UBWC-off sledgehammer, broader than the narrow P010 fault.
2. **3-lane deep-dive (byte-identity):** ALL 7 gralloc/mapper/snapalloc binaries + `libqdMetaData` +
   `libcamxexternalformatutils` (the geometry authority, fallback-fire-count 0 on live LOS) +
   `camera_alignments.json` are byte-identical OOS↔LOS. The SoC is **canoe**, whose init branch sets
   NEITHER `hw_supports_ubwcp` NOR `disable_ubwc` (unset==0==no-op by disasm). **Kernel is OOS prebuilt
   (identical).** No `android_hardware_qcom_display` CLO source in the LOS tree — the whole display/gralloc
   userspace is OOS proprietary blobs.
3. **Raw LOS tombstones:** the BasicTone crash is a READ at `0x74xx` (1 page past a CORRECTLY-1.5H-sized
   buffer with SANE w/h/stride) — NOT a malformed-geometry walk. The `0x79xx` addr cited earlier was a
   SEPARATE arcsoft wild-write bug. Three+ distinct faults were conflated.

**Net:** nothing in the binary chain or kernel differs. The surviving root is that the **QTI extended
gralloc metadata (PLANE_LAYOUTS) for the P010_VENUS buffer is never populated/exposed on LOS** (live:
`getPlaneLayout` never fires, `camApsBufferLockPlanes` → `descriptor=0x0`), so APS's `ApsBufferPlanes`
geometry is left unset → consumers walk off. Since no binary/kernel/prop differs, the divergence is the
only from-source layer: the **AOSP framework + Gralloc5/AIMapper stable-C interface glue + linker-namespace/
VNDK visibility + sepolicy** that import the buffer and are supposed to populate/expose that QTI metadata.
APS reads geometry from QTI-extended metadata (not the AOSP `AHardwareBuffer_Desc`) — that non-standard
coupling is what the LOS environment fails to satisfy.

**Decisive probe (LOS, non-destructive):** for the 1280×960 P010_VENUS buffer, trace the metadata SET
(does QTI gralloc write PLANE_LAYOUTS at alloc?) vs a raw `IMapper::get(PLANE_LAYOUTS)` (does it return
valid data, bypassing APS?), and watch for a failed dlopen / linker-namespace error / sepolicy denial in
the camera process during capture. SET-missing → producer/framework path; SET-ok+GET-fail → AIMapper/
namespace seam; raw-GET-ok+APS-fail → APS's non-standard access path.
