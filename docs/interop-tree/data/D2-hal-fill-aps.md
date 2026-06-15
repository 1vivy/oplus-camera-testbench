<!-- Parent: ../INDEX.md -->
<!-- Node template + FACT contract: ../SCHEMA.md -->

---
node: D2
title: "HAL-fill / APS-process (libAlgoProcess P010 read + copyMetadata)"
plane: data
partition: /odm
blob_identical_oos_los: true
characterization: PARTIAL      # #4 copyMetadata lifetime OBSERVED clean under back-to-back (UAF=False ×9 stable, no fresh tombstone, no copyMetadata frame); but named carriers still DARK at runtime (getMetadata frida missed launch — libAlgoProcess never loaded, intCalls=0; no app_probes dir) — not observed carrier-by-carrier end-to-end
conviction: BLOCKED            # #1 root test wedged on the G4 working-state denominator (working v16 never captured)
verdict: ""
confidence: low
symptoms: [1, 4]
probes: [debug/10_runtime_debug.sh, trace_p010_planes.js, debug/parse_tombstone.py]
gaps: [G4, G7, G8]
dodge_ref: ""
dirty_ref: ""
divergence: ""
upstream: [C6, D1]
downstream: [D3, D4]
refuted_refs: []
doc_refs: [doc-42, doc-47, doc-46]
updated: 2026-06-14
---

# D2 — HAL-fill / APS-process

The data-plane node where the byte-identical `/odm` APS blob (`libAlgoProcess.so` BuildID
`82fe443b408f8ed027558b0d4ffb1500`) consumes the HAL-filled P010 buffer, holds/releases the preview
frame, and copies result metadata. Two symptoms attach here as PROXIMATE SITES — both blobs are
md5-identical OOS↔LOS, so by the trunk axiom neither is the root; the roots live upstream (release gate
C6/D3, metadata lifetime C3/C4) and at the buffer-geometry boundary (D1).

## (a) Propagation contract

**Enters this node:**
- P010 capture buffer from the HAL fill — read by `APSFormatConverterNeon::p010LSB2MSBNeon`
  (vaddr `0x4fc094`; `libapsfixup` P010 GOT `0x689ba8`). Plane geometry resolved by
  `APSGrallocUtils::getPlaneLayout` (`0x12127c`) → `camApsBufferLockPlanes` (`0x1c96f8`) → `ApsBufferDesc*`.
- `PLANE_LAYOUTS` carrier fields read off the v5 AIMapper layout: `offsetInBytes` `+0x18`,
  `sampleIncrementInBits` `+0x20`, `strideInBytes` `+0x28` (per `trace_p010_planes.js` constants).
- ArcSoft output struct fields the chroma path reads: luma `+0x40`, chroma `+0x48`, pitch[0] `+0x60`,
  pitch[1] `+0x64`.
- Result `camera_metadata*` for the deferred quick-jpeg job, consumed by `DeferJob::startCapture`.

**Leaves this node:**
- Released preview frame downstream → D3 (`ImageReader`/`getOplusHardwareBuffer`), gated by the JNI
  upcall `decMetaRefZeroToRemove` (the per-frame ref-zero release signal).
- Copied result metadata via `android::APSMetadata::copyMetadata` (body `0x292960`; `libapsfixup`
  COPYMETA GOT `0x686ee8`) — derefs source header `+0x0c` (entry_count) / `+0x18` (data_capacity).
- Repaired P010 chroma pointer forward to the algo pipeline (super-night / turbo-RAW / BasicTone).

**OBSERVED (stock V16.1.0, SELinux Enforcing, AE-lock on; campaign `burst` + `holdshutter` back-to-back, `preview-baseline` video; N=3 each, verdict.json ALL STABLE):**
- **#4 copyMetadata lifetime is CLEAN under back-to-back** — `#4 copyMetadata UAF = False` on every run
  (burst 3/3, holdshutter 3/3, preview-baseline 3/3; variance `stable`). No UAF: zero fresh tombstone
  across all 9 captures (`meta.txt`: `no fresh tombstone (newest …tombstone_00 mtime 1781379871 < run start … — NOT copied)`),
  zero `copyMetadata`/`APSMetadata` frames and zero `Fatal signal`/SIGSEGV in `app_backtrace.txt`,
  `camera_daemon_bt.txt`, or `logcat_all.txt`. The source `camera_metadata` survives to
  `DeferJob::startCapture`→`copyMetadata` on stock — the OnePlus result ref-hold contract holds end-to-end.
  (The `tombstoned: …kDebuggerdNativeBacktrace` / `skipping tombstone file creation due to intercept` lines
  in logcat are the manual `debuggerd -b` #1-freeze unwind probe, NOT crashes.)
- **DARK at the carrier level:** the observe-only `copyMetadata`/getMetadata frida hook never fired —
  `frida/observe_getmetadata.log`: `[GM] FATAL libAlgoProcess.so never loaded` (attach-by-name missed the
  launch burst), `TALLY intCalls=0 strCalls=0 distinctFails=0`. No `app_probes/` directory exists
  (APP-side EDR/P010/motionphoto probes never fired). So the named carriers (`copyMetadata` GOT,
  `getPlaneLayout`/`camApsBufferLockPlanes`/`p010LSB2MSBNeon`, the P010 `PLANE_LAYOUTS` fields) are
  proven-clean at the symptom level (no UAF) but were NOT individually observed entering/leaving at runtime.
- **G-MECH renote (runtime↔RE pairing):** the manual `debuggerd -b` unwind shows the APS worker parked in
  `/odm/lib64/libAlgoProcess.so APSThreadPool::doWork()+740` → `libc pthread_cond_wait+76`
  (BuildID `82fe443b…`) with NO `copyMetadata`-frame — i.e. the back-to-back hold is the #1 blocked-wait
  on the never-fired release upcall (`ApsCallbackMetaRefInc::callbackToCamUnit` file off `0x31fa1c`, RE
  decmetarefzero-upcall-RE.md), NOT a #4 `copyMetadata+60` UAF (body `0x292960`). On stock the decref
  upcall fires and the source metadata survives to `copyMetadata` cleanly — pairing confirms #4's root is
  upstream (C3/C4 lifetime), not a D2 blob fault.

## (b) Environment dependencies

- `/odm/lib64/libAlgoProcess.so` + `/odm/lib64/libAlgoInterface.so` (BuildID `ce6e40ca…`) — byte-identical
  to OOS; never the root.
- `libapsfixup.so` (`patchelf --add-needed` onto `libAlgoProcess.so`, DT_NEEDED via `86a302b`/`f2d9235`) —
  the in-process interposer holding the P010/chroma/copyMetadata GOT redirects (our facilitation defense).
- `/odm` `mapper.qti.so` → DT_NEEDED `libgrallocutils.so` (+`libgralloccore.so`), which dlopen-resolves the
  plane authority `vendor/lib64/libcamxexternalformatutils.so` driven by `/vendor/etc/display/camera_alignments.json`
  (`scanline_align:64` → 1440→1472, by design). This boundary is D1's; D2 consumes its output.
- linker namespace: `com.oplus.camera` must reach the `/odm` cam libs (`public.libraries.txt` exposes
  `libapsfixup.so` per `ffb638b`) — D1/E4 owns whether `libcamxexternalformatutils` is reachable.
- `decMetaRefZeroToRemove` JNI upcall path into `/system` frameworks/base (the OnePlus result-buffer
  cleaner; sibling of `getOplusHardwareBuffer`) — the release-gate input, D3/C6 owns it.

## (c) Fact-to-resolve

**ONE question:** On a *working* (unfrozen) cycle, what triggers `libAlgoProcess`'s `decMetaRefZeroToRemove`
JNI upcall after frame 1, and is that trigger present on LOS?
- If the upcall fires on stock but never on LOS → frame-1 stall (#1) root is the absent env input feeding
  it (C6 release cadence / D3 `getOplusHardwareBuffer` buffer-metadata) → action: capture the working
  release cadence (G4 denominator) and instrument the D3 JNI bridge.
- If the upcall fires on LOS too yet the frame still parks → the hold is downstream of D2 (D3 pool /
  D4 consumer) → action: re-attribute #1 off this node onto D3.
- Corollary for #4: does the source `camera_metadata` survive until `DeferJob::startCapture` calls
  `copyMetadata`? If freed earlier on LOS than the OnePlus contract assumed → root is C3/C4 result
  lifetime (AOSP `CameraMetadataNative` frees sooner) → action: provider/OCS result ref-hold; drop the
  `copyMetadata` GOT guard.

## (d) Runtime probe(s)

- `tools/observability/debug/10_runtime_debug.sh` — `debuggerd -b <daemon pid>` live all-thread unwind of
  the parked preview thread (the freeze leaves no tombstone; thread is blocked, not dead). Lever:
  frameworks/av is **DARK** for frida but debuggerd live-unwind **WORKS** (read-only, KernelSU single-block).
- `tools/frida/trace_p010_planes.js` — hooks `getPlaneLayout` (`0x12127c`), `camApsBufferLockPlanes`
  (`0x1c96f8`), and `p010LSB2MSBNeon` (`0x4fc094`) cross-check; classifies whether the blob's Cb-luma
  equals the lock's aligned offset (`stride*1472`) or is garbage (`align_up(luma,4GB)`). Lever:
  gralloc/mapper = **FRIDA-ONLY** (no setprop verbosity). RUNTIME-GATED — #1 freeze wedges the P010 lock.
- `tools/observability/debug/parse_tombstone.py` — one-line attribution; matches the `copyMetadata|APSMetadata`
  signature → #4 verdict. APS native verbosity is **PARTIAL+caveat** (alog SELF-KILLS the marginal HAL, G7)
  → use the frida/debuggerd path, not alog.

## (e) Dodge-vs-dirty diff

Not an E-node — D2 is a runtime data-plane node, so its A/B is OOS↔LOS, **deferred to the LOS phase**
(per SCHEMA G-SYM). The facilitation lever this node leans on (`libapsfixup` exposure via
`public.libraries.txt`, `ffb638b`; copyMetadata GOT guard `b8a5b8e`) is owned and diffed at E4/D1, not
here. doc-42 verdict: Family I (P010/chroma) is the accepted **consumer-side defense**, NOT a retireable
plumbing gap (OOS hits the same NULL `IMapper@4.0::getService` + same Gralloc5 lock and still gets
contiguous P010 — a consumer-side ABI lock-math divergence with no facilitation lever yet found). Families
II (copyMetadata lifetime) and III (TurboHDR tag) ARE retireable upstream — #4's true home is C3/C4.

## (f) Symptom leaves

- **#1 preview freeze (frame-1 stall)** — PROXIMATE SITE here: `libAlgoProcess.so` holds frame 1, never
  releases; `decMetaRefZeroToRemove` JNI upcall never made. ROOT is upstream — **edge D2→C6** (release-gate
  cadence) and **edge D2→D3** (`getOplusHardwareBuffer` buffer-metadata / pool). Force-test ruled out
  AEC-stats (C5), so the gate is a data-plane/env input, not the HDR control gate. BLOCKED on the G4
  working-state denominator (working v16 never captured).
- **#4 copyMetadata UAF (back-to-back capture)** — PROXIMATE SITE here: SIGSEGV at
  `APSMetadata::copyMetadata+60` (deref of freed source header `+0x0c`/`+0x18`). ROOT is upstream —
  **edge D2→C3/C4**: AOSP cameraserver/`CameraMetadataNative` frees the result `camera_metadata` before
  the deferred `DeferJob::startCapture` runs, sooner than the OnePlus contract the blob was built against.
  Symmetric A/B (tombstone vs stock log completes); fix = provider/OCS result ref-hold, then drop the
  `copyMetadata` GOT guard.
