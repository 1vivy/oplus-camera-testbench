<!-- STATUS: VERIFIED — evidence-anchored RE/capture; no inference-surgery needed (doc-50 method).
     Pass-B note: §"Relevance to live symptoms" contains one unsupported-root claim presented inline
     as stronger than warranted: the Gate-B (freeze) Depth-2 candidate is labelled "plausible
     contributor" and "subordinate to probe_aec_hdrdetect.js" — that subordination framing is
     correct. The 8K hypothesis is explicitly labelled "hypothesis with strong mechanistic support,
     NOT proven." No restructuring needed; the doc's own language correctly marks its inferences. -->

# 48 — The `media.camera` OEM-Transaction Receiver (`libcsextimpl` / `CameraServiceExtImpl`)

**Date:** 2026-06-12 · **Status:** reference (mechanism map + testable hypotheses)
**Scope:** What the OnePlus OEM cameraserver layer *is*, why neither our port nor dodge covers
most of it, and which live symptoms it plausibly drives (zoom, Gate-B preview freeze, 8K video).
**Method (FACT = artifact read this session):** demangled exports + strings of stock
`dump201/system_ext/lib64/libcsextimpl.so`; OCS stub `oplus-camera-stubs/.../OplusCameraManager.java`
+ `IOplusCameraManager.java`; dodge `frameworks,av/0001` patch; our `frameworks/av` HEAD; doc-35 (8K), doc-47 (two-gates).

---

## TL;DR

The OCS SDK speaks a private OEM protocol to the cameraserver binder (`media.camera`). On OOS,
cameraserver is OnePlus-modified and answers it via **`libcsextimpl.so` (`android::CameraServiceExtImpl`)**.
That layer has **two integration depths**:

1. **Depth-1 — binder `onTransact` ABI (22 codes 10001–10022).** The SDK's `OplusCameraManager`
   proxy `transact()`s these on `media.camera`. dodge ports the receiver for this depth (validated
   for zoom). **We don't.**
2. **Depth-2 — internal CameraService call-site hooks.** `CameraServiceExtImpl` is also called from
   *inside* cameraserver at connect / configure / preview / result / buffer-return points
   (`beforeConfigureStreamsLocked`, `getExtensionOperatingMode`, `processPreview`,
   `beforeMetadataSendToApp`, `addRemovePackageName`, …). **Neither we nor dodge implement these.**

**On LOS our `frameworks/av` is stock (0 ext call sites) and `libcsextimpl` is dropped (`d654641`).**
Worse than a clean failure: the SDK resolves `getService("media.camera")` → the *real* (stock)
cameraserver, so `mRemote != null` and the SDK believes the OEM channel is live; every OEM
transaction silently returns `UNKNOWN_TRANSACTION`.

**Why the references don't cover it:** we solved only the **identity sliver** (the `IS_OPLUS_PACKAGE`
SAT-Fusion gate) by self-stamping in the SDK jar (`62009bf`), and PROBE-R1c retired the cameraserver
*relay* as off the JPEG path. dodge covers only Depth-1 zoom. The **entire Depth-2 behavioral layer
is uncovered** — and that is where the stream-shaping (8K) and preview/metadata hooks live.

---

## Mechanism

### Client side (the SDK proxy) — FACT

`android.hardware.camera2.OplusCameraManager$...` resolves
`mRemote = ServiceManager.getService("media.camera")` (the AOSP cameraserver binder) and `transact()`s
OEM codes with `OPLUS_CAMERA_FIRST_CALL_TRANSACTION = 10000`:

| Code | Name | Method | Likely subsystem |
|---|---|---|---|
| 10001 | ADD_AUTH_RESULT | `addAuthResultInfo` | auth/identity |
| 10002 | SET_DEATH_RECIPIENT | `setDeathRecipient` | lifecycle |
| 10003 | SET_PACKAGE_NAME | `setPackageName` | **identity** |
| 10004 | CLIENT_IS_AUTHED | `isAuthedClient` | **auth gate** |
| 10005 | SET_CLIENT_INFO | `setClientInfo(pkg,uid,pid)` | **identity/session** |
| 10006 | SET_CALL_INFO | `setCallInfo` | session |
| 10007 | SET_RIO_CLIENT_INFO | — | identity |
| 10008 | SET_TORCH_INTENSITY | — | torch |
| 10009 | DISCONNECT_CLIENTS | — | lifecycle |
| 10010 | SET_OMOJI_JSON | — | omoji |
| 10011 | CONNECT_STATUS | — | lifecycle |
| 10012 / 10013 | OPEN_AON / CLOSE_AON | — | always-on cam |
| 10014 | PRE_OPEN_CAMERA | `preOpenCamera` | open latency |
| **10015** | **SEND_OPLUS_EXT_CAM_CMD** | `sendOplusExtCamCmd(Cmd, int[])` (oneway) | **generic OEM cmd — zoom, pre-capture** |
| 10016 | SET_IS_CAMERA_UNIT_SESSION | — | **session typing** |
| 10017 / 10018 | READ_OPLUS_HAL/SERVER_MEMORY | — | debug |
| 10019 / 10020 | (UN)REGISTER_CAMERA_DEVICE_CALLBACK | — | callback |
| 10021 | SET_SATELLITE_CALL_STATE | — | satellite |
| 10022 | SET_DEATH_RECIPIENT_FOR_NAME | — | lifecycle |

`Cmd` enum for 10015 (stub-visible subset): `CMD_NONE, CMD_PRE_CAPTURE, CMD_PRE_OPEN, CMD_PRE_EVLIST,
CMD_READ_MEM` (the full SDK adds more incl. the UI/zoom event dodge handles). The SDK interface also
declares `parseSessionParameters(CaptureRequest)` and `isCameraUnitSession()`.

### Server side (OOS) — FACT (libcsextimpl exports)

`libcsextimpl.so` exports `android::ExtFactory::getCameraServiceExt()` and
`android::CameraServiceExtImpl::onTransact(...)`. Beyond `onTransact`, the class exposes a large
**internal hook surface** (Depth-2) that stock cameraserver calls at its own call sites:

| `CameraServiceExtImpl` hook (demangled) | Call site / role | Live relevance |
|---|---|---|
| `afterConnect` / `afterDisconnect` / `onClientChange` / `onOpen` | client lifecycle | session auth |
| `addRemovePackageName(CameraMetadata&, m, bool)` | **stamps pkg identity INTO metadata** | the OOS-native first-party tag (we replaced this sliver via SDK self-stamp) |
| `isSystemCameraPkgName(char*)` / `isSystemCameraUid(int)` | system-camera check | identity |
| `getExtensionOperatingMode(CameraMetadata&, m, int)` | **operating-mode override** | **8K (op_mode 0x80a9)** |
| `beforeConfigureStreamsLocked(CameraMetadata&, m, String8, camera3::StreamSet&, int)` | **mutate the StreamSet pre-configure** | **8K (EIS output stream)** |
| `afterEndConfigure(CameraMetadata&, …)` | post-config | session |
| `processPreview(camera_stream_buffer*, m, InFlightRequest&)` | **preview-frame processing** | **Gate B (freeze)** |
| `beforeMetadataSendToApp(CaptureResult*, j, CaptureOutputStates&)` | **mutate result metadata to app** | **Gate B / exposure** |
| `returnOutputBuffers` / `sendCaptureResult` / `processCaptureResult` / `checkToRemoveInFlightReqest` | buffer + result delivery | capture/preview delivery |
| `getCameraCharacteristics(String16, CameraMetadata*)` | characteristics override | caps/8K advertise |
| `oplusBypassTargetFpsRange` / `updateHFRBatchSizeForCts` | FPS/HFR | high-fps/video |
| `readOplusExtCamCmd` / `sendOplusExtCamCmdWithReply(ExtCamCmd)` | → `aidl::vendor::oplus::hardware::sendextcamcmd` HAL | OEM cmd backend |
| `statisticEnvironmentLight` / `getAONcamdev` / `overrideOmojiFPS` / `updateTrdParty*Support2Hal` | misc features | scene/AON/omoji |

There is also a *second, distinct* OOS hook: `#ifdef CAMERA_NEEDS_CLIENT_INFO_LIB →
vendor/oneplus/.../IOnePlusCameraProvider` in stock `CameraService.cpp` (connect-time client-info
to the provider HAL). Not enabled on LOS; separate from `libcsextimpl`.

---

## Our gap vs dodge (precise)

| | Depth-1 onTransact (22 codes) | Depth-2 internal hooks | `libcsextimpl` packaged | `CameraService` call sites |
|---|---|---|---|---|
| **OOS** | ✅ | ✅ (called throughout) | ✅ | ✅ native |
| **dodge** | ✅ (`CameraServiceExtFactory` dlopen + `onTransact` delegate; validated zoom) | ❌ (adds only helper overloads `collectReturnableOutputBuffers`, 4-arg `getCameraCharacteristics`) | ✅ | partial (onTransact hook only) |
| **us (HEAD)** | ❌ | ❌ | ❌ dropped `d654641` | ❌ 0 (stock `frameworks/av`) |

dodge's `CameraServiceExtFactory::onTransact` routes **all** non-shell binder codes to the ext, so
its port is not literally "zoom-only" — but with **no Depth-2 call sites**, only the codes the SDK
sends as binder transactions (auth/client-info/zoom/torch/AON) can ever be serviced. The
stream-shaping and preview/metadata hooks are never reached because cameraserver never *calls* them.

Dependency check (FACT): the cmd-channel backend `vendor.oplus.hardware.sendextcamcmd-V*` service +
ndk libs **are present** in `vendor/oneplus/infiniti/proprietary` (odm+vendor lib64). So Depth-1
`sendOplusExtCamCmd` is satisfiable once a receiver exists.

---

## Relevance to live symptoms

Calibrated against the established roots (doc-47 two-gates, doc-35 8K). The OEM layer is a
**candidate contributor**, explicitly subordinate where another root is already traced.

1. **Identity / SAT-Fusion `-38` — RESOLVED, off this path.** OOS does it via Depth-2
   `addRemovePackageName`; we replaced that sliver with the SDK self-stamp (`62009bf`). No action.
2. **Zoom stuck 1.0× (bug-b) — Depth-1, direct.** `sendOplusExtCamCmd` (10015) is the zoom channel;
   dodge confirms it. Porting Depth-1 + re-adding `libcsextimpl` is the fix. **Highest-confidence win.**
3. **Gate-B preview freeze — Depth-2 candidate.** `processPreview` + `beforeMetadataSendToApp` are
   exactly the consumer-side hooks; doc-47 roots the freeze at "app renders 0 frames / surface 0×0",
   mechanism unproven. If the SDK opens a session it believes OEM-authorized while every Depth-2 hook
   is absent, that is a plausible contributor. **Subordinate to the `probe_aec_hdrdetect.js` test (doc-47).**
4. **Over-exposure — Depth-2 minor.** `beforeMetadataSendToApp` could massage result metadata, but
   doc-35-B roots over-exposure in the OnePlus **SurfaceFlinger** HDR path. Low priority here.
5. **8K video `configure_streams(0x80a9) -38` — Depth-2, STRONG testable hypothesis.**
   doc-35 traced the `-38` to the EISv2 node wired **2-in/0-out** ("pure bypass" → NULL pipeline),
   i.e. the 7680×4320 stabilized-video OUTPUT stream the EIS port should bind to is **"absent or
   mis-typed on LOS"**, with named candidate causes (a) Gralloc5 stream-usage resolution and
   (b) unpopulated session metadata / "system camera not first-partied."
   **`CameraServiceExtImpl::beforeConfigureStreamsLocked(…, StreamSet&, …)` is a configure-time hook
   that mutates the StreamSet, and `getExtensionOperatingMode` overrides the op_mode** — these are
   exactly the mechanisms that would inject/retype the EIS output stream and shape 0x80a9. On LOS they
   are **never invoked** (0 call sites). So the missing Depth-2 receiver is a credible **upstream cause**
   of doc-35's traced symptom.
   **Honest bound:** this is a hypothesis with strong mechanistic support, NOT proven. The EISv2
   port-binding is the symptom; whether `beforeConfigureStreamsLocked` is what binds the EIS output on
   stock must be confirmed (probe below). doc-35's Gralloc5 candidate (a) remains a parallel suspect.

---

## Port recipe (when prioritized — likely after the doc-47 probe)

1. **Re-add `libcsextimpl.so`** to proprietary-files + `PRODUCT_PACKAGES` (reverse `d654641`). Blob is
   available (built intermediate exists; backend `sendextcamcmd` HAL present).
2. **Depth-1:** port dodge `frameworks,av/0001` — `CameraServiceExtFactory` dlopen + `getExtFactoryImpl`
   triple-deref + `CameraService::onTransact` delegation + the `CameraSessionStats` constants +
   `collectReturnableOutputBuffers` / 4-arg `getCameraCharacteristics` overloads. Unblocks zoom + the
   auth/client-info handshake.
3. **Depth-2 (the real work, beyond dodge):** add the `CameraServiceExtImpl` forward-call sites inside
   `CameraService` / `Camera3Device` — minimally `afterConnect`, `beforeConfigureStreamsLocked`,
   `getExtensionOperatingMode`, `afterEndConfigure`, `processPreview`, `beforeMetadataSendToApp`,
   `returnOutputBuffers`, `sendCaptureResult`. This is the OOS cameraserver delta; it is the part that
   could touch 8K and Gate B. Scope it against the `libcsextimpl` symbol list (821 `CameraServiceExtImpl`
   string refs ⇒ large surface — port incrementally, guarded).

## Decisive probes

- **8K (pins the hypothesis):** `tools/frida/hook_configure_streams.js` (doc-35) — dump the
  `camera3_stream_configuration` for 8K vs working 4K; if the 7680×4320 video OUTPUT stream is
  absent/mis-typed *before* it reaches the graph builder, the missing `beforeConfigureStreamsLocked`
  StreamSet mutation is implicated. Complement: a stock declobbered 8K trace — if stock binds an EIS
  output that LOS lacks, Depth-2 is the gap.
- **Channel-live confirmation:** hook the SDK `OplusCameraManager.transact(100xx)` return status on LOS
  — confirm every OEM code returns `UNKNOWN_TRANSACTION` while `mRemote != null` (SDK believes it's live).
- **Gate B:** run the doc-47 `probe_aec_hdrdetect.js` FIRST; only if the freeze is *not* AEC-side does
  the Depth-2 `processPreview` path become the next suspect.

## Evidence index

| Claim | Source |
|---|---|
| 22 OEM binder codes + `FIRST_CALL_TRANSACTION 10000` | `oplus-camera-stubs/.../OplusCameraManager.java` (L431–456, `transact(100xx)`) |
| SDK targets `media.camera`; `mRemote != null` | same, L432 `CAMERA_SERVICE_BINDER_NAME="media.camera"`, L475 |
| `Cmd` enum + `parseSessionParameters`/`isCameraUnitSession` | `IOplusCameraManager.java` |
| `CameraServiceExtImpl` Depth-2 hook surface | `dump201/system_ext/lib64/libcsextimpl.so` demangled exports |
| our `frameworks/av` stock, 0 ext call sites | `grep -c` CameraService.cpp = 0 |
| `libcsextimpl` dropped | `d654641`; no refs in camera-sm8850 / proprietary_vendor repos |
| `sendextcamcmd` HAL present | `vendor/oneplus/infiniti/proprietary/.../vendor.oplus.hardware.sendextcamcmd-V*` |
| 8K root = EISv2 2-in/0-out port-bind | doc-35 §A (trace `8k-configure-38-declobbered-trace.log` L498) |
| identity self-stamp = ours, not dodge | doc-46 §3a (`62009bf`); dodge has no identity patch |

## Cross-refs
doc-35 (8K/HDR-preview/long-exp), doc-46 (cleanroom matrix — `frameworks/av` row + identity row),
doc-47 (two-gates correction). This doc re-scopes doc-46's `frameworks/av` gap from "zoom" to the
full OEM cameraserver layer.
