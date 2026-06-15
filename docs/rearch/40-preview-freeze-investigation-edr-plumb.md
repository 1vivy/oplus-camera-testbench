<!-- STATUS: MIXED — inference-surgery applied 2026-06-15 (doc-50 method). Verified body = on-device
     OBSERVATIONS only; all root/locus ATTRIBUTIONS + the candidate fix moved to "Inferences & Open" below.
     Guard (interop-tree SCHEMA trunk axiom): a measured stall SITE is never a verified ROOT. -->

# rearch/40 — Preview-freeze investigation + OplusEdrUtils EDR plumb (candidate)

Date: 2026-06-10. Device on v19 (flashed), permissive. Goal: investigate the frozen preview reported on v19.
Long isolation session (team N:2 + on-device). The over-exposure mechanism was characterized and a
framework-side EDR plumb was implemented as a CANDIDATE (see Inferences); the freeze itself was NOT fixed.

## VERIFIED — on-device observations (measured this session)

### The freeze: measured states
- Symptom: preview display is FROZEN (static frame) under BOTH forced-SDR and native-HDR. (Observed.)
- The CamX `repeatingRequestEnd frameNumber` keeps CLIMBING (586 over ~19s) **while the on-screen preview is
  frozen** — cameraserver keeps producing frames into the app. (Measured.)
- Thread dumps (2×, identical 12s apart):
  - `PreviewGLThread` (GLThread.java:837) — idle `Object.wait`, no work queued.
  - `APSPreviewManager::previewManagerRoutine+1560` (libAlgoProcess) — idle `pthread_cond_wait` on its own
    command-queue semaphore (input-starved).
  - No display-side block (no `eglSwapBuffers`/`dequeueBuffer` wait). `dumpsys media.camera`: all streams
    `currently dequeued: 0` (HAL not buffer-starved).

### Ruled OUT this session (each with on-device evidence)
1. **getOplusHardwareBuffer bridge leak** — v19's HardwareBuffer `(J,Z)` cleaner fix (doc-39) did NOT change
   the freeze. The `947–1149× "failed to call HardwareBuffer.close"` CloseGuard flood appears in BOTH SDR and
   HDR and is fatal in neither (native HDR ran to frame ~295 with the same flood). (Observed both modes.)
2. **apsfixup** — a v16-narrow `libapsfixup` (window [0x70,0x7f], no copyMetadata/strlen wraps), swapped
   on-device → STILL froze at ~19. (Observed.)
3. **APK version** — every build v16→v19 ships OplusCamera 6.070.71 (blob unchanged, only re-bakes); v16 ran
   the SAME HDR-capable apk. (Verified blob identity.)
4. **SDR vs HDR mode** — both freeze. SDR freezes fast (~19 frames/0.4s); native HDR lasts longer (~295–586
   frames) then the display is still frozen. The v17 SDR-override props
   (`persist.camera.override_enable=true` + `override_preview_hdr_support=false`) make it faster but are not
   the sole cause. (Observed frame counts.)

### Over-exposure: the EDR code path (code-traced + measured)
- `com.oplus.view.OplusEdrUtils` is a NO-OP STUB in `oplus-camera-stubs` (`getBlastSurfaceControl()→null`,
  `setEdrSdrRatio/setEdrFlags→false`). (Verified in stub source.)
- The app's `PreviewHDRControl` tags the preview SurfaceView BT2020_PQ/HLG + RGBA_1010102 (NativeWindowJNI)
  and calls `setDesiredHdrHeadroom` — SF shows `desiredHdrSdrRatio=5`. (Measured via dumpsys SF.)
- The per-layer EDR programming path `A()/B()` fetches `getBlastSurfaceControl()` FIRST → null → early-return,
  so the EDR SDR-ratio is never applied. (Code-traced.) JPEG is fine (capture tonemaps offline). (Observed.)

### EDR-plumb test result (the candidate, see Inferences, did NOT work)
- On-device test (overlay-pushed jar + dropped odex, native-HDR props): preview **still over-exposed and still
  frozen**. The app logged `ClassLoaderContext shared library size mismatch` and the overlay jar was
  `unlabeled` (avc getattr/read/open/map denied, permissive=1). (Observed — invocation unconfirmed.)

### Device state at wrap (overlay — reset before flashing)
adb-remount overlay active with: v16-narrow `libapsfixup.so` (test swap; flashed-widened is at
`/data/local/tmp/libapsfixup_widened.bak`), the new `oplus-camera-stubs.jar` (EDR),
`persist.camera.override_enable=false` (native HDR). Reset for a clean flash: `adb enable-verity && adb
reboot` (tears the overlay → reverts /odm + /system_ext to flashed v19).

## Inferences & Open (UNVERIFIED — heavy-check)
> Per the interop-tree trunk axiom, a measured stall SITE is never a verified ROOT. The items below are
> attributions / candidate fixes / forward plans — NOT verified until an OOS↔LOS A/B proves the
> propagation-contract break. The observations above are real; these conclusions from them are not.

- **ATTRIBUTION (unproven): "the over-exposure root is the OplusEdrUtils stub."** The null→early-return→no-clamp
  path is a real SITE, but the implemented plumb did NOT fix the over-exposure on-device — so the root
  attribution is unconfirmed (the alternative display-HDR-cap gap below was never ruled out). Treat as a
  candidate divergence, not the proven root.
- **ATTRIBUTION (open): "the freeze locus is the app preview-delivery/render chain
  (ImageReader→onImageAvailable→GLThread→SurfaceView), upstream-starved within the app."** Inferred from the
  thread-dump SITES (GLThread idle, previewManagerRoutine input-starved, HAL not buffer-starved). The doc's own
  words: "Where exactly the delivery dies is the open question." Locus = inference; the thread states = verified.
- **CANDIDATE FIX (implemented, KEPT in-tree, NOT proven):** OplusEdrUtils EDR plumb in
  `vendor/oplus/camera-sm8850/oplus-camera-stubs/src/com/oplus/view/OplusEdrUtils.java` (module
  `platform_apis: true`): `getBlastSurfaceControl(SurfaceView)→view.getSurfaceControl()`;
  `getSurfaceControl(View)→((SurfaceView)view).getSurfaceControl()`;
  `setEdrSdrRatio(sc,txn,ratio)→txn.setExtendedRangeBrightness(sc,1.0f,max(1.0f,ratio))`;
  `setEdrFlags`/`setEdrAnimDuration`→acknowledge so PreviewHDRControl proceeds. "CORRECT in principle / right
  framework-side shape" is a design opinion. **Do NOT assume it works until invocation + display-cap are verified.**
- **HYPOTHESES for the inconclusive test (unproven):** (a) invocation not confirmed — the overlay jar may not
  have executed (ClassLoaderContext mismatch + unlabeled avc denials); needs a proper build+flash + a log line
  in the EDR methods. (b) display HDR-cap gap — AOSP SF only tonemaps an HDR layer if the panel advertises HDR
  caps via HWComposer `getHdrCapabilities`; if LOS's OP15 display HAL doesn't, `setExtendedRangeBrightness` is a
  no-op and the over-exposure needs a display-HAL/compositor port (OPlus programs HDR via its own EDR
  compositor honoring `ro.vendor.oplus.hdr.uniform`). Verify: `dumpsys SurfaceFlinger | grep -i hdrCapabilities`.
- **NEXT-SESSION PLAN (forward, ordered):** (1) confirm OplusEdrUtils actually runs (build+flash + log line in
  setEdrSdrRatio). (2) `dumpsys SurfaceFlinger | grep hdrCapabilities` — does the panel advertise HLG/PQ? if not
  → display-HAL HDR port, not just the EDR plumb. (3) instrument the app preview-delivery chain — does
  `onImageAvailable` keep firing? does the app acquire+close preview Images? where does
  ImageReader→GLThread→SurfaceView stop? (The Tier-1 freeze probes `probe_aps_preview_routine` /
  `probe_sendinputdata_gate` from doc-50 now instrument exactly this — wire them into the LOS A/B.)
