<!-- STATUS: MIXED — inference-surgery applied (Pass-B).
     VERIFIED body = §1 (device/build state), §2 thread-dump SITES + RULED-OUT A/B table, §3 on-device
     measurements (EDR code path traces, SF dumpsys reads), §4 UNPROVEN overlay test result, §5
     working-tree inventory, §7 corrections to prior docs.
     MOVED to "Inferences & Open": the §2 locus attribution ("freeze is in the APP preview
     delivery/render chain, starved from upstream"), the §3 "root pinned" over-exposure label, the §4
     CANDIDATE FIX body (unproven), and §6 next-session plan.
     Guard (interop-tree SCHEMA trunk axiom): a measured stall SITE is never a verified ROOT. -->

# rearch/41 — State map: v19, preview freeze, HDR preview, and all in-flight fixes

Date: 2026-06-10. Consolidated map of where the OnePlus 15 (infiniti / SM8850) OplusCamera port
stands after the v19 build + the long preview-freeze isolation session. Read this first; it ties
together docs/rearch/39 (the leak mis-diagnosis), 40 (the freeze re-scope + EDR plumb), and the
working-tree state.

---

## 1. Current device / build state

- Device flashed with **v19** (`~/android/builds/lineage-23.2-infiniti-v19-camera-20260610/`,
  zip sha256 2b8ebc75…). 6.070.71 OplusCamera apk. SM8850, A16, LOS 23.2.
- v19 = v18 + (a) HardwareBuffer (J,Z) cleaner fix [later found insufficient], (b) enforcing-mode
  DSP/fastrpc sepolicy.
- Device reset clean at session end: adb-remount overlay torn down (`adb enable-verity && reboot`),
  /odm + /system_ext reverted to flashed, `persist.camera.override_enable=true` (v19 default = SDR
  preview workaround), flashed-widened libapsfixup (67480 B) restored.

**Two known camera problems on v19:**
1. **Preview FROZEN** (the primary blocker) — display shows a static frame; capture path otherwise
   functions.
2. **Native HDR preview OVER-EXPOSED** (~5×) — only visible if the SDR workaround is disabled.

These are RELATED but distinct (see §3, §4).

---

## 2. The preview FREEZE — re-scoped (primary blocker)

### Symptom (corrected understanding)
The camera HAL/cameraserver keeps PRODUCING frames (CamX `repeatingRequestEnd frameNumber` climbs to
586+) while the on-screen preview is FROZEN on one frame. ⇒ **cameraserver streams fine; the app
never RENDERS frames to the SurfaceView.** This is NOT a HAL stall, NOT buffer-pool exhaustion.

### Thread state (2× thread dumps, identical 12s apart, both SDR + HDR)
- `PreviewGLThread` — idle `Object.wait` at `GLThread.java:837`, no work queued.
- `APSPreviewManager::previewManagerRoutine+1560` (libAlgoProcess) — idle `pthread_cond_wait` on its
  OWN command-queue semaphore (input-starved; NOT a DSP/metadata/ARC hang — confirmed by RE).
- No display-side block (no `eglSwapBuffers`/`dequeueBuffer` wait).
- `dumpsys media.camera`: all streams `currently dequeued: 0` (HAL not holding buffers).

### RULED OUT this session (each on-device)
| Hypothesis | Verdict | Evidence |
|---|---|---|
| getOplusHardwareBuffer holder leak (doc 39) | **REFUTED** | v19 ships the (J,Z) cleaner fix; still froze. CloseGuard flood (~1000×) in BOTH SDR+HDR, fatal in neither. |
| libapsfixup (widened window / new hooks) | **EXONERATED** | Built v16-narrow libapsfixup, swapped on-device → still froze at ~19. |
| OplusCamera apk version (6.106→6.070) | **REFUTED** | Constant 6.070.71 across v16→v19 (blob unchanged, only re-bakes). v16 ran the same apk and worked. |
| SDR vs HDR preview mode | **NOT the sole cause** | Both freeze. SDR fast (~19 frames/0.4s), native HDR longer (~295–586) then display still frozen. v17 SDR-override props worsen it, not cause it. |
| AIUnit | **EXONERATED** | Crash-loops on missing AppSwitchPublisher class whether enabled or disabled; preview froze regardless. |

### The one variable that changed v16→v17 (still suspect for "made it worse")
v17 added `persist.camera.override_enable=true` + `persist.camera.override_preview_hdr_support=false`
(SDR-force workaround) in opluscamera.mk (c45f452/af344d3). This forces the per-frame GL HLG→SDR
tonemap path (`PreviewShow::p010MSB2NV21` + IPU `aps_algo_filter`), which freezes FAST. But native
HDR (override off) ALSO freezes (just slower), so the override is an accelerant, not the root.

---

## 3. The native-HDR-preview OVER-EXPOSURE — on-device measurements

`com.oplus.view.OplusEdrUtils` (OPlus "Extended Dynamic Range" SurfaceControl API) is a **no-op stub**
in our `oplus-camera-stubs` (`getBlastSurfaceControl()→null`, `setEdr*→false`). (Verified in stub
source.)

The app's `PreviewHDRControl`:
- correctly tags the preview SurfaceView **BT2020 HLG/PQ + RGBA_1010102** (via NativeWindowJNI) and
  calls `setDesiredHdrHeadroom` — SF shows `desiredHdrSdrRatio=5`. (Measured via dumpsys SF.)
- THEN `A()/B()` fetch `getBlastSurfaceControl()` FIRST → **null** → early-return → the per-layer EDR
  SDR-ratio is **never applied**. (Code-traced.)

SF `numHdrLayers(1)` + `desiredRatio(5.00)` confirm the HDR layer is recognized. JPEG is fine —
capture tonemaps offline. (Observed.)

---

## 4. CANDIDATE FIX: OplusEdrUtils EDR plumb (UNPROVEN — see Inferences)

The implemented fix and its on-device test result are summarized here; attributions and
open questions are in `## Inferences & Open` below.

On-device overlay-push test result: preview **still over-exposed and still frozen**. App logged
`ClassLoaderContext shared library size mismatch`; the overlay jar was `unlabeled` (avc
getattr/read/open/map denied, permissive=1). Invocation unconfirmed. (Observed.)

---

## 5. All working-tree changes from this session (kept, uncommitted)

| Repo | File | Change | Status |
|---|---|---|---|
| vendor/oplus/camera-sm8850 | `oplus-camera-stubs/.../OplusEdrUtils.java` | EDR plumb (§4) | candidate, unproven |
| vendor/oplus/camera-sm8850 | `sepolicy/vendor/opluscamera_app.te` | DSP/fastrpc grants (qdsp r_file_perms + hal_client_domain dspmanager) | correct, enforcing-mode (in v19) |
| device/qcom/sepolicy_vndr/sm8850 (1vivy fork) | `generic/vendor/common/domain.te` | exempt opluscamera_app from qdsp appdomain neverallow | correct, enforcing-mode (in v19) |
| frameworks/base (op15/getoplushardwarebuffer) | `core/java/android/hardware/HardwareBuffer.java` | (J,Z) holder ctor registers native cleaner | did NOT fix freeze; harmless hygiene; keep-or-revert (it's more correct than the original no-cleaner holder, but the freeze it targeted was a mis-diagnosis) |

None committed. The sepolicy/DSP changes are already baked into the flashed v19. The OplusEdrUtils +
HardwareBuffer changes are post-v19 working-tree only.

---

## 6. Next-session plan (see Inferences & Open)

Plan items moved to `## Inferences & Open` below.

---

## 7. Key corrections to prior docs/memory
- doc 39 / the memory entry "GraphicBufferWrapper cleaner = the v19 fix" is **WRONG** — refuted
  on-device (v19 has the cleaner, still freezes). The leak was a side-effect, not the freeze.
- The freeze is an APP-side render-delivery stall, not a HAL/buffer/shim/bridge problem.
- The over-exposure and the freeze are likely the same HDR-display-plumb family but that's unproven.

---

## Inferences & Open (UNVERIFIED — heavy-check)
> Per the interop-tree trunk axiom, a measured stall SITE is never a verified ROOT. The items below
> are attributions, candidate fixes, and forward plans — NOT verified until an OOS↔LOS A/B proves
> the propagation-contract break. The thread-dump SITES in §2 are real; the conclusions drawn from
> them here are not.

### Freeze locus attribution (from §2 — UNPROVEN)
**ATTRIBUTION (unproven): "the freeze is in the APP preview delivery/render chain
(`ImageReader → onImageAvailable → GLThread → SurfaceView`), starved from upstream within the app."**
Inferred from the thread-dump SITES (GLThread idle, previewManagerRoutine input-starved, HAL not
buffer-starved). The doc's own words: "WHERE in that chain it dies is the open question." Locus =
inference; the thread states = verified (§2 above).

### Next (freeze): instrument the app delivery chain (from §2 NEXT — UNPROVEN)
Does `onImageAvailable` keep firing? Does the app acquire AND close preview Images? Where between
ImageReader and the GLThread queue does delivery stop? (frida on the app's ImageReader callback +
the GLThread enqueue, or OCS preview-show logging.) The HAL produces; find where the app stops
consuming/rendering.

### Over-exposure root attribution (from §3 — UNPROVEN)
**ATTRIBUTION (unproven): "the over-exposure root is the OplusEdrUtils stub."** The
null→early-return→no-clamp path is a real SITE (measured, §3), but the on-device plumb test did NOT
fix the over-exposure — so the root attribution is unconfirmed. The alternative display-HDR-cap gap
was never ruled out. Treat as a candidate divergence, not the proven root.

### CANDIDATE FIX (implemented, KEPT, NOT proven): OplusEdrUtils EDR plumb (from §4)
`vendor/oplus/camera-sm8850/oplus-camera-stubs/src/com/oplus/view/OplusEdrUtils.java` — implemented
against AOSP A14+ HDR APIs (module is `platform_apis: true`):
- `getBlastSurfaceControl(SurfaceView)` → `view.getSurfaceControl()` (the non-null PRECONDITION)
- `getSurfaceControl(View)` → SurfaceView's SC when applicable
- `setEdrSdrRatio(sc, txn, ratio)` → `txn.setExtendedRangeBrightness(sc, 1.0f, max(1.0f, ratio))`
- `setEdrFlags`/`setEdrAnimDuration` → acknowledge so PreviewHDRControl proceeds

**Status: UNPROVEN.** Two unverified reasons the overlay test was inconclusive:
1. **Invocation not confirmed** — app logged `ClassLoaderContext shared library size mismatch` + the
   overlay jar was `unlabeled` (avc getattr/read/open/map, permissive=1). The new code may not have
   actually run. Verify via a proper **build + flash** (not overlay push) + a log line in
   `setEdrSdrRatio`.
2. **Display HDR-cap gap** — AOSP SF only tonemaps an HDR layer if the panel advertises HDR caps via
   HWComposer `getHdrCapabilities` (HLG/PQ + max luminance). If LOS's OnePlus-15 display HAL doesn't,
   `setExtendedRangeBrightness` is a no-op and HDR display needs a deeper display-HAL/compositor port
   (OPlus honors `ro.vendor.oplus.hdr.uniform`=1, which LOS ignores). Verify:
   `dumpsys SurfaceFlinger | grep -i hdrCapabilities`.

The implementation is the correct framework-side shape — KEEP it, but do not assume it works until
the invocation and display-cap questions are verified.

**Hypothesis worth testing:** the OplusEdrUtils stub may be the SINGLE root of BOTH the
over-exposure AND the freeze — if broken HDR composition prevents proper layer handling, the app
could fall back to the GL import path that parks. Fixing EDR (proven) might resolve both.
Unconfirmed.

### Prioritized next-session plan (from §6)
1. **Verify OplusEdrUtils actually runs** — proper build + flash a v20 with the EDR impl; add a log
   line in `setEdrSdrRatio`; confirm `getBlastSurfaceControl` returns non-null and
   `setExtendedRangeBrightness` is called.
2. **Check display HDR caps** — `dumpsys SurfaceFlinger | grep -i hdrCapabilities`. If the panel
   doesn't advertise HLG/PQ, the over-exposure needs a display-HAL HDR port, not just the EDR plumb.
3. **Attack the real freeze** — instrument the app preview delivery chain (ImageReader callback →
   Image acquire/close → GLThread enqueue → SurfaceView). The HAL produces; find exactly where the
   app stops rendering. This is independent of HDR/SDR and is the primary blocker.
4. If OplusEdrUtils (proven, flashed) fixes the freeze too → that's the unified framework-side fix;
   then drop the SDR-override props and ship native HDR preview.
