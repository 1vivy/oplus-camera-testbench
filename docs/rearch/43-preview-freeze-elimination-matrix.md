<!-- STATUS: MIXED — inference-surgery applied (Pass-B, corrected Pass-C).
     VERIFIED body = the elimination matrix (all on-device A/B evidence), the ADDENDUM eliminations,
     the ALOG DEBUGGING / native clues section, the ON-DEVICE NATIVE-HOOK section (blocked frida),
     and the FIX #2 REFUTED block.
     MOVED to "Inferences & Open": the "ROOT LOCALIZED — native libAlgoProcess preview engine"
     conclusion block, the "FIX CANDIDATES" list, AND the "ROOT FULLY GROUNDED" block (retitled
     "FREEZE MECHANISM candidate" — partially superseded by FIX #2 REFUTED; see REFUTED-LOG R-08).
     Guard (interop-tree SCHEMA trunk axiom): a measured stall SITE is never a verified ROOT. -->

# rearch/43 — Preview-freeze elimination matrix (v19, real-artifact A/B session)

Date: 2026-06-10. Continuation of the v19 preview-freeze hunt (docs 39–42). This session ran a
chain of **on-device A/B tests using the REAL working v16 artifacts** (not static analysis) and
eliminated every major swappable component. The freeze is now bounded to a small set. Read this
before any further freeze work — it prevents re-testing the cleared layers.

## The symptom (unchanged, re-confirmed)
Preview renders **exactly ~1 frame then freezes** (two screencaps 2.5 s apart are **byte-identical**
— a live camera differs every frame from sensor noise). The HAL keeps producing (`media.camera`
shows the preview stream Stream[1] with **6 buffers dequeued by the HAL** = producing fine). The
native `APSPreviewManager::previewManagerRoutine` sits **input-starved** on its own empty command
queue, and `PreviewGLThread` is idle with no work → the app stops feeding the APS preview pipeline
after the first frame. Delivery chain (captured from a live crash backtrace):

```
ConsumerImpl$1.onImageAvailable  (ImageReader callback, thread "PreviewImageThr")
 → ConsumerImpl.onPreviewImageArrived
  → ApsProcessor.addPreview
   → ApsProcessor.generateImageInfo
    → Util.getHardwareBuffer
     → ImageReader$SurfaceImage.getOplusHardwareBuffer   (the framework bridge JNI)
```

## ELIMINATION MATRIX (all on-device this session unless noted)

| Suspect | Verdict | Decisive evidence |
|---|---|---|
| **OplusCamera apk repack / dex 039→035** | **ELIMINATED** | Extracted the REAL v16 apk (dex 039, 31 dex, AOSP-testkey-signed `c8a2e9bc…`) from the v16 OTA, swapped it onto v19 (same signer → PM-safe), purged odex, rebooted → **still froze**. The working-v16 apk freezes in the v19 environment. |
| **frameworks/base bridge + HardwareBuffer (J,Z) cleaner** | **ELIMINATED** | v16 built `frameworks/base @ 237dc3e`; v18 @ `9d03af14` = a *reapply* of 237dc3e (byte-identical bridge), **both cleaner-less**. The cleaner is a **v19-only uncommitted add**, and **v18 froze without it** (user-confirmed). So neither the bridge nor the cleaner is the regression. |
| **HardwareBuffer GraphicBuffer leak / ImageReader pool exhaustion** | **REFUTED** | Forcing GC (`am send-trim-memory RUNNING_CRITICAL` ×5, runs the deferred cleaner → frees pinned buffers) did **not** unfreeze. And the HAL holds 6 dequeued preview buffers = not buffer-starved. The 698 `HardwareBuffer.close` CloseGuard leaks + the ~40-wrapper GC free-burst are real but **non-causal**. |
| **libapsfixup (P010 GOT-interposer)** | **ELIMINATED** | Confirmed **loaded** in the camera process (`/proc/PID/maps` shows `/odm/lib64/libapsfixup.so`; `libAlgoProcess.so` has the `libapsfixup.so` `DT_NEEDED`). Prior v16-narrow-window swap also still froze. It interposes correctly. |
| **725bd52 metadata-ptr stub** (`getMetadataPtr→0L`, `getNativeMetadata→null`) | **INCONCLUSIVE** | smali-patched the deployed jar to v16 behavior (oat purged, label fixed, verified the patched bytecode on-disk + loaded) → **still froze**. BUT only matters if photo-mode preview actually calls `getNativeMetadata` — that path is `OplusSuperEISPreview`-gated; if SuperEIS-preview is off in photo mode, the revert changed nothing. worker-2 confirming the gating. |
| **AIUnit** | **separate issue** | The "AI Service Engine keeps stopping" crash-dialog (`com.oplus.aiunit` AppSwitchPublisher NCDFE) repeatedly steals foreground and *pauses* the camera Activity — that masqueraded as a freeze earlier. `pm disable-user com.oplus.aiunit` removes the dialog; preview still freezes. So AIUnit ≠ freeze. (Caveat: working-v16 had AIUnit *authorized/working*; we have only tested it broken/disabled, never working — a residual unknown.) |
| **Over-exposure (magenta cast)** | **separate issue, root known** | Native-HDR preview composites a BT2020-HLG layer with no EDR tonemap (`OplusEdrUtils` stub) → ~5× too bright. `persist.camera.override_preview_hdr_support=false` forces SDR → **colors correct** (verified on screen). Independent of the freeze (both HDR and SDR freeze). |

## What this leaves (the freeze is ENVIRONMENTAL to the v19 build, not in apk/framework/apsfixup)
The two biggest components (apk, framework) are now cleared with the **actual working v16 binaries**,
and apsfixup is confirmed live. The remaining v16(d654641+overlays)→v19 deltas that can still hold
the freeze:

1. **Props/configs** — `opluscamera.mk` changed +64 lines v16→v18 (identity props oplusrom V16.1.0 /
   sub_api 46, the override props, QNN trims), plus any camera `*.xml` config deltas. A prop/config
   that gates the preview-result→GL handoff or the APS preview-queue feed.
2. **The native APS feed** — `previewManagerRoutine` is input-starved; `addPreview` (Java) stops
   calling after frame 1. WHY `onImageAvailable` stops after the first frame is still the open
   question. `libAlgoProcess.so` is a blob (proprietary @ ca4deb7, presumed identical v16↔v19) — so
   the divergence is in what FEEDS it (metadata/config/vendor-tags), not the engine.
3. **oplus-camera-stubs** (non-metadata changes) — mostly cleared by worker-2 as render-neutral, but
   not exhaustively A/B-tested on-device.
4. **The uncaptured v16 device-side overlay** — user: "v16 was just overlayed to 80% working state."
   The working preview came from device-side pushes never fully captured in the tree. What those were
   (beyond the now-in-tree libAlgoProcess add_needed + apsfixup) remains the deepest unknown.

## ADDENDUM (same session) — more eliminations
- **725bd52 metadata stub = DEAD (not inconclusive).** worker-2 traced the SDK jar:
  `ConsumerImpl.onPreviewImageArrived` (the per-frame photo-preview callback) calls
  `Util.getHardwareBuffer` + `isPreviewImageNeedApsProcessor` + `ApsProcessor.addPreview` +
  `ApsResult$ImageBuffer.<init>` — and **never** `getNativeMetadata`/`getMetadataPtr`. Those are hit
  only by SuperEIS (video/EIS-gated, off in photo) and capture-request metadata. So the full-revert
  test changed code photo-preview never runs → consistent negative → refuted. Matches my crash
  backtrace (no metadata call in the preview stack).
- **`getOplusHardwareBuffer` does NOT throw/fall back.** The crash backtrace showed it executing into
  the JNI (not the `Image.getHardwareBuffer()` fallback). The OCS "getOplusHardwareBuffer has
  exception, use getHardwareBuffer" log is absent (though OCS Java logging is off, so partly masked).
- **persist.sys.feature.* HDR/EDR props = NOT the freeze.** v18→v19 `opluscamera.mk` ADDED a whole
  HDR/EDR feature-prop family v16 lacked (`localhdr_version=2`, `hdr_vision_app=1`,
  `support.edrlistener=true`, `uhdr.support=true`, `dolby_vision(_app)=1`, `ro.vendor.oplus.hdr.uniform=1`,
  `ro.oplus.fusionlight`, `ro.build.version.oplus.sub_api=46`, `ro.vendor.oplus.vendorxml.enable=1`).
  Hypothesis: v16 lacked them → app never engaged the broken-on-LOS HDR/EDR preview path → worked.
  TESTED: set the `persist.sys.feature.*` subset to v16-disabled values **+ reboot** (so system_server
  re-reads at boot) → **still froze**. So the persist HDR/EDR feature props are cleared. `ro.oplus.fusionlight`
  reads EMPTY at runtime (already off). STILL UNTESTED (need build.prop edit + reboot): the `ro.*`
  identity/HDR props — `ro.build.version.oplus.sub_api` 46 (v16/koaaN had stale 28),
  `ro.build.version.oplusrom` V16.1.0 (v16 V16.0.0), `ro.vendor.oplus.hdr.uniform=1`,
  `ro.vendor.oplus.vendorxml.enable=1`. Identity (sub_api/oplusrom) is the most code-path-flipping.

## ROOT LOCALIZED — native libAlgoProcess preview engine (APS-bypass test, decisive)
worker-2 traced the photo-preview path: `ConsumerImpl.onPreviewImageArrived → ApsProcessor.addPreview`,
where `addPreview` checks `PowerDebugUtil.isPreviewNotSendAps()`; if true it **closes the image and
returns without sending to native APS**. The `algo_switch` config (which sets `sApsMode`) is
**byte-identical v16↔v19** (md5 0526a6fd) so the static routing is not the regression.

**TEST: smali-patched `PowerDebugUtil.isPreviewNotSendAps()` → always `true`** (force every photo-preview
frame to bypass the native APS engine), deployed to the SDK jar, oat purged. **Result: preview went
BLACK** (screencap collapsed 2.6 MB → 115 KB = UI chrome on black). ⇒ **the native APS engine IS the
preview renderer** — there is NO separate direct HAL→SurfaceView preview path. With APS engaged it
renders exactly **frame 1** then freezes; with APS bypassed it renders **nothing**.

## NEXT (ordered, for the next session)
### ALOG DEBUGGING UNLOCKED + native-engine clues (same session)
**Tool:** `setprop oplus.autotest.camera.debug.forcelog true` (+ `persist.sys.camera.lao.enable true`) makes
`CameraUnitLog.isLogOn=true` AND the native APS engine write an **UNENCRYPTED** plaintext trace to
`/data/vendor/cam_alog/cam_alog_<ts>_<pid>_01.txt` (encryption auto-off in debug build). This is the
single best preview-engine visibility tool — it has `APS_CORE`/`APS_INTERFACE` logs with `file:line`
(e.g. `APSPreviewManager.cpp`, `ApsPreviewDecisionByJsonTree.cpp`). ⚠ DO NOT set
`persist.sys.assert.panic=true` — it turns the marginal HAL into a fatal `ERROR_CAMERA_DEVICE` self-kill
(see below).

**ARTIFACT WARNING — `ERROR_CAMERA_DEVICE` (code 4) self-kill is LOGGING-INDUCED, not the freeze.** With
verbose logging on, the camera throws camera2 `onError` code 4 (+ code 3) ~0.3s after open →
`OCAM_DeviceProcessor.onError "camera app will kill self"` → `killCameraProcess`. But the CLEAN baseline
(all logging off, rebooted) keeps the app **ALIVE + frozen** (pid stable 12s, 4/4 steady screencaps
identical). ⇒ the LAO deferred-job disk I/O (`APSDeferJobGoverner executeDeferJob Force write disk`) adds
enough latency to tip a marginal HAL into a device-error timeout. The real freeze is the app-alive APS
stall; the self-kill is an observability artifact. (It does reveal the HAL is fragile/marginal on LOS.)

**Native clues from the ALOG (real, on the preview path):**
- `APS_CORE [WARN] APSJsonParser.cpp:135 getJsonObjFromRUSPath() access path '/data/user/0/com.oplus.camera/files/odm/etc/camera/config/oplus_camera_aps_config' failed!!!` — the APS engine's RUS-override config path is absent.
- `APS_INTERFACE [WARN] ApsPreviewDecisionByJsonTree.cpp:274 updateIntValRangeByJsonObj() get param <turboShutterWaitTime|mNightTotalExpTime|captureInterval|captureEVList|requestSensorModeList|mfsrFrametable|swmfFrametable|requestFormatList|flashTypeList> failed! please check valueRange exist` — MANY preview-decision params missing from the valueRange config.
- `ApsPreviewDecisionByJsonTree.cpp:147 isEnumParamByKey() can't find param: <rawValue|sensorName|turboRawBurstCaptureNums|fwkLuxIdx|currentdrcGain|currentdarkBoostGain>` — repeated per preview frame.
- `APS_CORE [ERROR] APSFileStorage.cpp:1110 createDirectory() mkdir /data/system/camera_rus failed, errno = Permission denied` — APS can't create its RUS dir (sepolicy/perm gap).
⚠ UPDATE (worker-2, doc 44 U2): the `valueRange`-missing failures (`:274`) are **NON-BLOCKING** —
`PreviewDecisionLevel::updateIntValRangeByJsonObj` LOGS the warning and RETURNS success (empty range),
no abort/error-propagate. So on their own they do NOT stall `previewManagerRoutine` → **likely a
parallel RED HERRING.** The deeper thread is the per-frame `:147` "can't find param" set (`rawValue`,
`sensorName`, `fwkLuxIdx`, `currentdrcGain`, `currentdarkBoostGain`) = the SAME **AEC-stats
`getMetadata rc=-2`** family as the long-documented `hdr_detected`/`stats_control` root (provider doesn't
publish those vendor tags on LOS). A decision running with missing per-frame metadata could produce a
malformed RESULT — but the FREEZE only follows IF the libAlgoProcess result-handler SKIPS the
input-release on a decision-error/incomplete result. THAT link (not the parse warning) is the thing to
verify, and it's the same `releaseBuffer +0x1af144` hook. Config note: `/odm/etc/camera/config/
oplus_camera_aps_config` is present but ENCRYPTED (52KB); the RUS-path failure is normal (no RUS push).
⇒ (superseded) The APS preview-DECISION engine is running with an incompletely-loaded config (missing valueRange
params + absent RUS config). A starved/incomplete preview decision is a plausible reason the native
preview cycle stalls after frame 1. The decision config is the encrypted `oplus_camera_algo_switch_config`
/ `oplus_camera_aps_config` family — byte-identical to stock per memory, but the RUS-path + the missing
valueRange params suggest the engine expects override data LOS doesn't provide.

### ON-DEVICE NATIVE-HOOK CONFIRMATION — BLOCKED by camera instability (next-session obstacle)
worker-2 RE'd the full mechanism (docs/rearch/44): `previewManagerRoutine` (file +0x1aa694) parks on
`cond@this+0x17c` while `count@this+0x150==0`; it's a pure CONSUMER. cmd-3 dispatches a preview frame to
the pipeline (`this+0x38`) → async `pipelineDataCallback` (+0x1a9dd4). The **missing step = per-frame
input-Image RETURN** in the result path (`releaseBuffer` +0x1af144 / `dropProcessData` +0x1aecd4 / the
output callback `this[0xab]`@+0x558). Two fix-site candidates: (a) the input-return call is skipped
(a gate reads a per-frame param LOS doesn't populate), or (b) a callback ptr (`this[0xaa]`@+0x550 /
`this[0xab]`@+0x558) is NULL/mis-bound so the release never reaches `Image.close()`.

The decisive test = frida-NATIVE Interceptor on those offsets, watching which fires after frame 1.
**Attempted, BLOCKED:** frida **spawn** caught `previewManagerRoutine #1` (thread start) then the process
**died before frame 1** — the spawn latency tips the marginal HAL into the device-error self-kill (same
artifact class as verbose logging). Attach-post-freeze misses frame 1. And **clean launches now
self-kill intermittently on their own** (the documented native instability) — so there's no reliable
frame-1 repro to hook. NEXT-SESSION approach: (i) attach to a rare alive-frozen instance + trigger a
preview RECONFIGURE (mode switch / camera flip) so frame 1 reprocesses through already-installed native
hooks; or (ii) frida-gadget/persistent injection to install hooks without spawn latency; or (iii)
patch `libAlgoProcess` (via apsfixup GOT-interpose) to log the release-path branch + force the
unconditional input-buffer return, then observe if preview un-freezes (also a candidate FIX).

### ⛔ FIX #2 (metaBufferMap drain) REFUTED ON-DEVICE (2026-06-10) — freeze is UPSTREAM, single-shot
Applied worker-2's UPDATE-7 patch on-device (drainMetaBufferOverflow + initMetaMap prologue, smali a
--api 35 → dex 039, patched class verified loaded via CLC checksum), cleared the poison
capture_defer_data.db + rebooted clean → **STILL FROZEN** (4/4 steady screencaps identical). Dropped
threshold 0x10→0x3 (aggressive drain) → **STILL FROZEN**. ⇒ Draining metaBufferMap does NOT unfreeze.
**This REFUTES the metaBufferMap-exhaustion / maxImages=20 / "~19-frame" model** — if the freeze were
gradual pool-exhaustion, a threshold-3 drain would prevent it. So the freeze is effectively SINGLE-SHOT
(app submits ~1 preview frame to APS then STOPS; the drain branch never fires because the map never
grows). The "~19 frames" was a HAL repeating-request counter, NOT app-consumed frames (red herring).
The decMetaRefZeroToRemove input-release-skip + the onPreviewReceived mMetadata-null CloseHandle leak
are REAL (parallel metadata/handle leaks from the AEC-stats root) but are NOT the freeze.
⇒ RE-SCOPE: the freeze is UPSTREAM of the release — the app stops SUBMITTING preview frames after ~1.
Prime suspect: a per-frame request/result HANDSHAKE where the native never delivers a valid result
(null metadata from missing AEC-stats) → the app never advances to submit frame 2 → single-shot stop.
Still the AEC-stats root, but the fix locus is the request/submit loop (onImageAvailable / onPreviewImage
Arrived / isPreviewImageNeedApsProcessor / a getPreviewRequestLock or prior-result gate), not the release.
Next (worker-2): trace ConsumerImpl/ApsProcessor for a per-frame submit gated on the prior onPreviewReceived.

Fix candidates moved to `## Inferences & Open` below.

0. **NATIVE RE (the real root):** Ghidra `libAlgoProcess.so` — `APSPreviewManager::previewManagerRoutine`
   + the `addPreviewImage` entry + the preview-cycle's input-buffer-release path. Find what the engine
   WAITS for after processing frame 1 (the signal that would let it release the input + dequeue the next).
   That missing signal/input is the root. frida CANNOT hook this (crashes ART GC on the Java side, and the
   native side needs symbol-resolved Interceptor.attach) — so static Ghidra first, then native Interceptor.
1. **Resolve the SuperEIS gating** (worker-2): does photo-mode per-frame preview hit
   `getNativeMetadata`? If yes → 725bd52 is genuinely refuted; if no → it was never on the path.
2. **Find where `onImageAvailable` stops** with a NON-frida method (frida crashes ART's GC on the hot
   `getOplusHardwareBuffer` path — confirmed). Options: native `Interceptor.attach` on
   `libAlgoProcess` preview-queue push/pop symbols (needs Ghidra symbol RE), or OCS-private logcat at
   a higher verbosity than `persist.sys.camera.private.log.enable=debug,pre,mp` (which only surfaced
   native CamX/Chi, not the OCS Java consumer).
3. **Differential prop/config bisect** — diff the v16 (working) vs v19 `build.prop` + camera configs
   on-device; flip suspicious preview/HDR/APS props individually.
4. The over-exposure fix (OplusEdrUtils EDR plumb, doc 40/41) is a SEPARATE, lower-priority track.

## Device state at wrap
Rebooted to canonical v19 (v19 apk restored, md5 70fbcd17…). `com.oplus.aiunit` left **disabled**
(`pm disable-user`) to avoid the focus-steal dialog confound. SELinux permissive. Override props:
`override_enable=true`, `override_preview_hdr_support=false` (SDR, correct colors). adb-remount active.
```
```

---

## Inferences & Open (UNVERIFIED — heavy-check)
> Per the interop-tree trunk axiom, a measured stall SITE is never a verified ROOT. The items below
> are attributions and candidate fixes — NOT verified until an OOS↔LOS A/B proves the
> propagation-contract break. The APS-bypass test result (preview went BLACK) and the thread-dump
> SITES above are real; the conclusions drawn from them here are not.

### FREEZE MECHANISM (candidate — later partially superseded by FIX #2 REFUTED; see REFUTED-LOG R-08)

SDK trace (`com.oplus.camera.unit.sdk.jar`, decoded): the preview INPUT Image lifecycle is ref-counted by
`APSClient$MetaImageRefCounter`:
- `APSClient.addPreviewFrameBuff(ApsPreviewParam, ApsWatermarkParam)I` is the **native** enqueue (one of
  `APSClient`'s `private native` methods, alongside `previewDecision`, `attachPreviewSurface`). Its caller
  (APSClient.smali ~7640): `move-result p2; if-eqz p2,:cond_22` — **p2==0 (SUCCESS) → input HELD**
  (ref-counted, NOT closed); **p2!=0 (FAIL) → `onAddImageToApsFail` closes the input immediately** (Java).
- `MetaImageRefCounter.decMetaRefZeroToRemove(JII)V` is the SUCCESS-path release: decrements the ref and
  at zero calls `Image.close()` (smali line 455). **It has ZERO Java callers in the entire SDK** ⇒ it is a
  **pure JNI upcall the native APS engine makes** after processing each preview frame.

**Candidate freeze mechanism (INFERRED — partially superseded):** each preview frame enqueues SUCCESS → input
Image held pending the native's per-frame `decMetaRefZeroToRemove` JNI release-upcall → **on LOS the native
never makes that upcall** (the per-frame result/decision is error/incomplete from the missing AEC-stats `rc=-2`
vendor tags — same family as the standing `hdr_detected`/`stats_control` root) → input Images accumulate,
never closed → exhaust the **20-deep** preview ImageReader (`KEY_PREVIEW_MAX_IMAGES=0x14`) at **~frame 19**
(matches doc 40's "~19 frames") → `onImageAvailable` stops → `addPreviewFrameBuff` stops → native cmd queue
empties → `previewManagerRoutine` parks forever. The single frozen DISPLAY frame = the last APS OUTPUT (output
callback is unconditional, worker-2 doc 44); only the INPUT-RELEASE upcall is missing.

**Why partially superseded:** The FIX #2 REFUTED block (in the verified body above) shows that draining
`metaBufferMap` at threshold 3 does NOT unfreeze — so the gradual-pool-exhaustion-at-19 variant of this
model is REFUTED. The freeze is single-shot (app stops submitting after ~1 frame, not ~19). The upcall-skip
structure (decMetaRefZeroToRemove never fires) remains a valid attribution for the parallel CloseHandle /
metadata leak (doc 44 UPDATE 6), but the specific "~19 frames → onImageAvailable stops" freeze chain
described here is contradicted by the on-device drain test. Status: INFERRED, partially refuted; the
upstream-submit-stop (single-shot) is the live model; the upcall mechanism is preserved as structural context.

---

### ROOT LOCALIZED attribution (UNPROVEN)
**ATTRIBUTION (unproven): "the freeze is in the native `libAlgoProcess` preview engine."**
Inferred from: the APS-bypass smali-patch causing black preview (measured — engine IS the renderer),
combined with the thread-dump showing `APSPreviewManager::previewManagerRoutine` input-starved after
frame 1. The conclusion drawn: `previewManagerRoutine` processes frame 1, outputs it, then stalls —
does not release frame 1's input Image back to the ImageReader / does not request frame 2, so
`onImageAvailable` stops, the native command queue empties. The blob is identical v16↔v19, so the
divergence is attributed to an **environmental input the native engine consumes** after frame 1 (a
vendor-tag/metadata, a buffer-return/fence signal, or the getOplusHardwareBuffer holder's interaction
with the engine's buffer-release path) that LOS doesn't satisfy. This is consistent with the reframe
that **v16-flashed-clean almost certainly also froze** — the working v16 preview was the device-side
runtime overlay ("80% overlayed"), not the build.

The measured SITES supporting this inference: APS-bypass → black (on-device), thread dumps showing
`previewManagerRoutine` input-starved (on-device). The ROOT attribution (locus within native engine,
"environmental input missing") is inferred — not proven.

### FIX CANDIDATES (from verified body — UNPROVEN)
These were self-marked in the original doc as candidates pending the native RE gate confirmation.

1. **Provider-side (true root candidate):** publish the missing AEC-stats vendor tags so the native
   preview decision succeeds → native makes the normal `decMetaRefZeroToRemove` upcall. Same
   work-family as the standing `hdr_detected`/`stats_control` plumbing (the project's deepest open
   root). Unproven — the FIX #2 REFUTED block (above) demonstrates the metaBufferMap-drain path is
   not the freeze; the AEC-stats provider-side model still needs the `camAECGetParam` split-probe to
   be confirmed.
2. **apsfixup native-boundary:** make the native ALWAYS make the per-frame input-release upcall
   regardless of decision result (GOT-interpose the result/release path in
   `libAlgoProcess`/`libAlgoInterface` so the release fires even on an incomplete decision). Needs the
   native release-upcall call-site from worker-2 RE.
3. **NOT viable:** forcing `addPreviewFrameBuff` to "fail" → `onAddImageToApsFail` releases the input
   BUT skips APS processing → black preview (confirmed by the `isPreviewNotSendAps` bypass result).

NEXT (worker-2 native RE): in `libAlgoProcess`/`libAlgoInterface`, find the call site that
JNI-upcalls `decMetaRefZeroToRemove` (CallVoidMethod / the methodID lookup) and the conditional that
gates it — what makes the native SKIP it on LOS. That gate + fix-candidate #2 is the apsfixup
target.
