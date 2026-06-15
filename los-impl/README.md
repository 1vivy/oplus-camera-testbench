<!-- Parent: ../docs/facilitation/INDEX.md -->

---
title: "los-impl — the partial LOS landing (staging dir)"
plane: implementation
date: 2026-06-14
location: /home/vivy/oplus-final/los-impl/
---

# los-impl — the partial LOS landing

This directory **stages** the LOS camera-port implementation: what is **cleanly landable now** + a
**blueprint** for the rest. It is the bridge from the requirement board (`../docs/facilitation/`) and the
spec (`../docs/interop-tree/REQUIREMENTS.md`) to actual LOS-tree edits.

> **CRITICAL — staged here, NOT in the tree.** Everything in this dir lives under
> `/home/vivy/oplus-final/los-impl/`. **Nothing has been applied** to the external port/device tree
> (`~/vendor_oplus_camera`, `~/op15-camera-porting`, `~/android/lineage`). The staged `.patch` files are
> read-only copies (sha256-verified against the dodge oracle); the manifests document where each edit *would*
> land. Applying them is a separate, deliberate act against the external trees — out of scope for this dir.

## File map

Cryptic filenames decoded — do **not** rename them; they are cross-referenced by `docs/facilitation/INDEX.md`
and other facilitation documents.

| File | Decodes to | One-line purpose |
|------|-----------|-----------------|
| `IMPLEMENTATION-PLAN.md` | Implementation blueprint | Per-requirement (R1–R7 + libapsfixup reduction) LOS-edit table: target path, source (adopt-dodge vs author-new), READY/RE-BLOCKED status, open RE question, BUILD-ORDER interlock (I1–I7). Ordered by BUILD-ORDER. |
| `R2-apply-manifest.md` | R2 apply manifest | Step-by-step landing instructions for R2 only: apply `frameworks/av/0001`, reverse commit `d654641`, re-add `libcsextimpl.so` → `/system_ext`, post-build verification. The one currently-landable item. |
| `PHASE-D-CORRECTIONS.md` | Phase D corrections | Corrections and addenda to the Phase D (R1/R3/R4/R6) RE work; records what was found to be wrong in earlier phases and the corrected findings. |
| `E0-EDR-HARVEST.md` | E0 EDR harvest | Early-phase (E0) harvest of EDR-related RE findings — raw data feeding the R3 libgui/SF EDR ABI work. |
| `patches/` | Forward LOS blob/patch set | Staged `.patch` files (read-only, sha256-verified, dodge-identical). Apply order follows BUILD-ORDER; see §Apply order below. |

## Contents

| File | What |
|------|------|
| `IMPLEMENTATION-PLAN.md` | **The blueprint.** Per-requirement (R1–R7 + libapsfixup reduction) LOS-edit: target file path, source (adopt-dodge vs author-new), READY/RE-BLOCKED status, the precise open RE question per blocked row, and the BUILD-ORDER interlock (I1–I7). Ordered by BUILD-ORDER. |
| `R2-apply-manifest.md` | **The one landable item, in detail.** Exactly how to land R2: apply `frameworks,av/0001` to LOS `frameworks/av`, reverse `d654641` (re-add + PRODUCT_PACKAGES + label `libcsextimpl.so` → /system_ext), and the post-build verification. |
| `patches/` | The staged patch files (read-only, sha256-verified, dodge-identical). |

## Apply order (when landing)

Follow BUILD-ORDER load-bearing-first. Ready items first; blocked items need a B/C RE close first.

1. **R2 (READY)** → `R2-apply-manifest.md`. Apply `patches/frameworks-av-0001-*.patch` + reverse `d654641`.
   **The TOP single action** — restores the OEM `CameraServiceExt` Depth-1 layer. **Gates R4.**
2. **native/0001 (READY)** → apply `patches/frameworks-native-0001-*.patch` (BINDER_VM_SIZE 1→4MB). Independent,
   low-risk; verify it built into `libbinder`.
3. **R7 (READY-to-author)** → author the `CameraMetadataNativeWrapper` stub class into
   `~/vendor_oplus_camera/oplus-camera-stubs/`. No RE block (dodge `oplus-fwk` proves the class shape). Cheap,
   isolated. Build the F1 system_ext lib first — **R1's receiver wires against it.**
4. **R5 (CONFIG-DEFERRED)** → adopt the odm CamX HDRMode session-typing config + keep the HDR props. Config-only,
   Treble-clean. Needs the in-scene `rc=−2` A/B. **Do NOT author the X1 SHDR knob.**
5. **R1 (RE-BLOCKED)** → author the release-upcall receiver. Blocked on locating the `gCallbackRequestAction`
   bridge JNI lib (the `GetMethodID`/`CallVoidMethod` site) + the LOS A/B. Highest value (retires #1 + #4 + shim
   Family-II). Needs R7's F1 stub built (I3 loader parity).
6. **R4 (RE-BLOCKED)** → author the 6 Depth-2 hook bodies. **Gated behind R2.** Blocked on the byte-complete
   hook bodies + call-site wiring + the 8K probe confirmation.
7. **R3 (RE-BLOCKED)** → author the libgui WRITE + SF READ EDR ABI (both sides) + patch the F1
   `getBlastSurfaceControl` stub to REAL. Blocked on the `setEdrViewTransform` 4×4 curve wire values (probe
   FP-decode fix). std-ratio-only is the falsifier.
8. **R6 (DARK)** → adopt the session-typing + sepolicy namespace; retire Family-III. Deferred until the
   TurboHDR publish is confirmed app-side.

## Ready vs blocked at a glance

| Status | Reqs | Meaning |
|--------|------|---------|
| **READY (land now)** | **R2**, native/0001 | dodge proves the form + artifact located + sha256-verified |
| **READY-to-author** | **R7** | no RE block; author the stub (dodge-proven shape) |
| **CONFIG-DEFERRED** | **R5** | config-only Treble-clean; needs the in-scene A/B |
| **RE-BLOCKED** | **R1**, **R4**, **R3** | author-new with an open RE question (bridge lib / hook bodies / curve ABI) |
| **DARK** | **R6** | carrier RE-inferred only; not runtime-confirmed app-side |
| **DONE** | base/0001 | applied+effective (#7 REFUTED, X3) — close benign |

## The top open RE questions B/C must close (to unblock R1/R3/R4)

- **R1:** locate the **`gCallbackRequestAction` bridge JNI lib** — the camera-unit JNI lib that does
  `GetMethodID("decMetaRefZeroToRemove","(JII)V")` + `CallVoidMethod` (libAlgoProcess holds only the EXTERNAL
  fn-ptr @ file `0x9b7548`; the literal is absent there by design). Then run the LOS A/B (upcall absent on the
  freeze → `metaBufferMap` climbs to 20 → `previewManagerRoutine` parks).
- **R4:** author the **6 Depth-2 hook bodies** against `0x17b71c` (`beforeConfigureStreamsLocked`) / `0x184818`
  (`getExtensionOperatingMode`) + 4 others; pin each cameraserver call site; confirm via `hook_configure_streams`
  that it binds the EISv2 `7680×4320` output on stock. **(gated behind R2.)**
- **R3:** the **libgui `setEdrViewTransform` 4×4 curve ABI wire values** — fix the aarch64-FP probe decode
  (`ratio=-1.0e10` garbage) to capture the exact `transform[16]` + `edrSdrRatio`; confirm the client
  `Transaction` ↔ server `layer_state_t` deserialization mapping.

## Conventions
- RE offsets are **build-pinned** (device addr = Ghidra − 0x100000), pinned to OOS `16.0.7.201`. Re-pin against
  a new OOS image per `../docs/facilitation/BUILD-ORDER.md` §(c) before relying on them.
- "adopt" rows re-take a dodge artifact verbatim; "author-new" rows are written against the RE offsets. Keep the
  lanes distinct (anti-fork-drift: a dodge bump must never silently overwrite an authored hook).

## Cross-links
- Board: `../docs/facilitation/INDEX.md` · build contract: `../docs/facilitation/BUILD-ORDER.md`
- Spec: `../docs/interop-tree/REQUIREMENTS.md` · `../docs/interop-tree/POST-PROCESSING-CONTRACT.md`
- RE: `../docs/re-notes/{oem-binder-ontransact,decmetarefzero-upcall,edr-sf-readside,aec-hdrdetect-publish}-RE.md`
