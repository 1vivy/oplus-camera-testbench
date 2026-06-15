<!-- Parent: ../INDEX.md -->

---
node: C1
title: "app / OCS SDK (com.oplus.camera + unit.sdk.jar)"
plane: control
partition: /system_ext
blob_identical_oos_los: false
characterization: PARTIAL  # (a) INTENT-down OBSERVED (preview.hdr.enable=true → CamX preview.hdr.support 81140168, stable 6/6 runs); consume-up getOplusHardwareBuffer bridge is DARK (SDK Java loggers OFF, G4) — only consume signal seen is a stable CameraMetadataNativeWrapper CNFE at APSClient.transact, so the buffer pass-through is NOT observed end-to-end
conviction: SUPPORTED             # evidence-for proximate-site; decisive close-pairing A/B (G-MECH/G-FAL) deferred. UNCHANGED — no E-node oracle ran this capture set
verdict: "OBSERVED stock V16.1.0 (6/6 runs stable): SDK drives HDR INTENT down — com.oplus.camera.preview.hdr.enable=true crosses to CamX vendor-tag preview.hdr.support@81140168 — and the OCS-SDK consume-init (ConsumerImpl.onSessionConfigured → ApsProcessor.initAPS → APSClient.algoInit → transact) throws a STABLE ClassNotFoundException: com.oplus.inner.hardware.camera2.impl.CameraMetadataNativeWrapper. The getOplusHardwareBuffer JNI bridge line is DARK (loggers off), so bridge-fire/fallback for #7 is NOT yet observed; C1 stays a PROXIMATE site, contract characterization PARTIAL pending enable_ocs_sdk_log.ts."
confidence: medium
symptoms: [7]
probes: [enable_ocs_sdk_log.ts, fwk_trace.js, probe_getoplushwbuffer.js]
gaps: [G4]
dodge_ref: ""
dirty_ref: ""
divergence: ""
upstream: [E1, E2]
downstream: [C2, C6, D3]
refuted_refs: []
doc_refs: [doc-35, doc-43, doc-47, doc-48]
updated: 2026-06-14
---

# C1 — app / OCS SDK (com.oplus.camera + unit.sdk.jar)

The control-plane entry. `OplusCamera.apk` (mode UI/controllers) drives `com.oplus.camera.unit.sdk.jar`
(the OCS SDK: `ProducerImpl` / `ConsumerImpl` / `ApsProcessor` / mode classes), which stamps the
HDR/mode **INTENT** onto a `CameraRequestTag`, hands it down to camera2 (C2), and consumes the processed
buffer back up as `ApsResult$ImageBuffer` via the `getOplusHardwareBuffer` JNI bridge. The SDK is
NOT byte-identical OOS↔LOS (it is repacked/re-dexed on our port — doc-43 dex 039→035), so this node CAN
carry a blob/state-machine root, unlike the byte-identical-blob crash sites elsewhere.

## (a) Propagation contract

> **OBSERVED (stock V16.1.0, 2026-06-13 captures; verdict.json = ALL STABLE across run1/2/3 of both
> `photo-hdr` mode=photo ae_lock=1 and `preview-baseline` mode=video ae_lock=0).** The OCS-SDK package
> resolves at runtime as `com.oplus.ocs.camera.*` (process `com.oplus.camera` pid 31767; the SDK lib loads
> as `com.oplus.camera.unit.sdk.jar`). The HDR/mode **INTENT-down** carriers and the SDK **consume-path**
> stack are both seen; the *getOplusHardwareBuffer JNI bridge line itself is DARK* (SDK Java loggers were
> not enabled — `enable_ocs_sdk_log.ts` did not run, see (d)/G4), so the bridge fire/fallback is not
> observed in this capture set.

**Leaves C1 — driven DOWN (OBSERVED):**
- **HDR-preview INTENT** stamped by the SDK and seen crossing the boundary:
  `ConfigureParameter: BaseBuilder set, keyName: com.oplus.camera.preview.hdr.enable, value: true`
  (photo-hdr run1 @18:26:45.805; **stable 1×/run across all 6 runs**, both conditions). It lands in CamX as
  the `com.oplus` vendor-tag `preview.hdr.support` (`QueryVendorTagLocation() … location is 81140168`,
  CamX pid 1536) — the INTENT crosses app → OCS-SDK → CamX intact.
- Co-stamped mode INTENT seen on the same `BaseBuilder` set (photo-hdr run1, all 1×/run): mode/menu
  context `com.oplus.camera.is.turn.on=1`, `com.oplus.camera.is.from.main.menu=true`,
  `com.oplus.camera.video.livephoto.open=false`, `com.oplus.quick.jpeg.switch=true`,
  `com.oplus.control.capture.zsl.mode`, `com.oplus.configure.global.ev.value=0`,
  `com.oplus.original.zoomRatio=1.17`, `com.oplus.feature.antibanding.enable=on`,
  `com.oplus.camera.configure.thermal.level=6`.
- Long-exposure mode INTENT reaching the stats backend as the QTI vendor-tag
  `com.qti.stats_control.long_Exposure_Snapshot` (`location is 80be0023`, CamX pid 1536; photo-hdr run1,
  6×) — the `LongExposureMode` intent path is live downstream.

**Enters C1 — consumed UP (OBSERVED, but FAULTING):**
- The SDK consume/init path is seen via a **stable `System.err` backtrace (1×/run, all 6 runs)** during
  `ConsumerImpl.onSessionConfigured` → `ApsProcessor.onSessionConfigured(ApsProcessor.java:589)` →
  `ApsProcessor.initAPS(:718)` → `ApsAdapterImpl.init(:254)` → `ApsPreviewAdapterImpl.init(:851)` →
  `FullApsImpl.initAlgo(:81)` → `APSClient.algoInit(:1479)` → `APSClientWrapper$Stub$Proxy.algoInit(:357)`
  → `APSClient.transact (Native Method)`, throwing
  **`java.lang.ClassNotFoundException: com.oplus.inner.hardware.camera2.impl.CameraMetadataNativeWrapper`**.
  i.e. the SDK's native APS transact bridge cannot resolve the OnePlus inner-framework metadata-wrapper
  class on our build. This is the *consume-side* facilitation break for C1 (an `/system` inner-class /
  E1-stub absence), and it is the only OCS-SDK runtime signal in these captures.
- `getOplusHardwareBuffer` / `ApsResult$ImageBuffer.<init>` / `Util.getHardwareBuffer` / the
  `"use getHardwareBuffer"` fallback line: **0 occurrences in any logcat** — NOT evidence of bridge
  success; the SDK Java loggers that would print them are OFF (G4). The 835 `HardwareBuffer` / 7202
  `ImageBuffer` lines present are CamX-native (`System :` heap-dump logger w/ width/height/bpp), not the
  SDK Java bridge.

**Still DARK / inferred-only (kept from static + docs, not observed here):** the `CameraRequestTag` field
stamps (`mbLongExposureCaptureEnable`, `mbRepeatingRequestCapture`, `mRequestNum`, `mbRaw2yuvEnable`,
`mbRectifyEnable`) and the AE/AWB/AF window lock (`CONTROL_AE_LOCK`/`CONTROL_AWB_LOCK`/`AF_MODE=1`/
`CONTROL_MODE=1`); the per-frame `KEY_IS_LONG_EXPOSURE_CAPTURE_ENABLE` / `KEY_IS_CAPTURE_LAST_FRAME`
finalize tags; `SurfaceView.setDesiredHdrHeadroom(5.0)` / BT2020_HLG surface set; and the
`getModeName()`/`getSurfaceUseCase()`/`getCaptureFormat()` mode identity — none print without the SDK
loggers (G4) or a fwk reflection trace; treat as PARTIAL until `enable_ocs_sdk_log.ts` + `fwk_trace.js` run.

> **G-MECH note:** the runtime `ClassNotFoundException: …CameraMetadataNativeWrapper` at
> `APSClient.transact (Native Method)` pairs the OCS-SDK consume-init failure with the RE finding that our
> port's `/system` inner-framework hidden classes are not stubbed for the SDK's `algoInit` JNI transact
> (E1 stub / E2 framework-edit surface) — a renote-able mechanism, though decisive A/B stays LOS-deferred.

## (b) Environment dependencies

- `/system_ext` SDK lib: `com.oplus.camera.unit.sdk.jar` (the OCS SDK) + `OplusCamera.apk` mode UI.
- **E1 stubs** — `oplus-camera-stubs` providing `OplusCameraManager` (the `transact(100xx)` ABI the SDK
  calls down through C2/C3); if stub resolution breaks, the SDK's OEM channel silently no-ops.
- **E2 /system framework edits** — `nativeGetOplusHardwareBuffer` JNI in `libandroid_runtime.so` +
  `getOplusHardwareBuffer` on `ImageReader$SurfaceImage` (added `9d03af1`/`237dc3e`). If absent, the SDK
  takes the AOSP `Image.getHardwareBuffer()` fallback (→ #7).
- AOSP framework API `SurfaceView.setDesiredHdrHeadroom` / `nativeSetDesiredHdrHeadroom` — confirmed
  present in LOS A16 `framework.jar` (doc-35 §B: the HDR-preview API is NOT the gap).
- HDR/EDR feature props gating the engaged path (`opluscamera.mk`): `localhdr_version`, `uhdr.support`,
  `support.edrlistener`, `dolby_vision_app`, `ro.vendor.oplus.hdr.uniform` (doc-43 addendum).

## (c) Fact-to-resolve

**Q:** Does the SDK's `getOplusHardwareBuffer` call resolve to the OnePlus JNI bridge and return a
valid `ApsResult$ImageBuffer` (no AOSP fallback), and is that buffer subsequently `close()`d — or does it
take the fallback / leak the wrapper (#7)?
- **If bridge fires + buffer closed:** C1 is a clean PROXIMATE pass-through; #7's root is downstream (the
  preview-delivery freeze / pool state, Gate B), action ⇒ pivot to C6/D3.
- **If fallback fires (exception log present):** root is the JNI absence in **E2**; action ⇒ verify
  `nativeGetOplusHardwareBuffer` symbol on our build, re-apply the bridge.
- **If bridge fires but `ApsResult$ImageBuffer` never closed:** lifecycle leak in the SDK consume path →
  pool exhaustion; action ⇒ instrument the `ImageBuffer.<init>`/close pairing in `ConsumerImpl`.

> Current evidence (doc-43 addendum): the crash backtrace shows `getOplusHardwareBuffer` **executing into
> the JNI**, the fallback log is **absent**, and forcing GC did not unfreeze → C1 is the proximate site,
> the bridge is NOT taking the fallback. Hence conviction SUPPORTED, not CONVICTED (G-MECH/G-FAL pending an
> A/B that watches the close-pairing on a working vs frozen state — see D3/#7).

## (d) Runtime probe(s)

- `tools/observability/frida/enable_ocs_sdk_log.ts` — turns on OCS SDK Java loggers (default OFF) so the
  `ConsumerImpl.onPreviewImageArrived → Util.getHardwareBuffer → ApsProcessor.addPreview →
  ApsResult$ImageBuffer.<init>` chain and the "use getHardwareBuffer" fallback line become visible.
- `tools/observability/frida/fwk_trace.js` — framework reflection trace for the INTENT carriers driven
  down (`CameraRequestTag` field stamps, `setDesiredHdrHeadroom`).
- `tools/observability/frida/probe_getoplushwbuffer.js` — confirms JNI presence/effectiveness on our build
  (matrix #7 decisive probe; symbol scan for `nativeGetOplusHardwareBuffer`).
- **Lever status:** app / OCS SDK on `/system_ext` = **WORKS** (lever-index: OCS SDK Java loggers +
  framework reflection trace, enabled via the two scripts above). No CLOBBER/DARK constraint here — the
  blind spot is the *working-state* baseline (G4), not the lever.

## (e) Dodge-vs-dirty diff

N/A for this control node (no facilitation oracle of its own). The facilitation roots that gate C1 are
audited at **E1** (stub model: boot-jar dodge vs our `/system_ext` lib — does it break `OplusCameraManager`
stub resolution?) and **E2** (the `getOplusHardwareBuffer` JNI bridge — present + effective on our build?).
C1 only *consumes* those; see `DODGE-VS-DIRTY.md` rows for E1/E2.

## (f) Symptom leaves

- **#7 getOplusHardwareBuffer → fallback → NN OUTPUT ERROR → pool exhaustion — PROXIMATE-SITE here.**
  C1 is where the SDK calls `getOplusHardwareBuffer` and builds/holds `ApsResult$ImageBuffer`. Per the
  matrix, the **ROOT is /system frameworks/base (E2)** — `nativeGetOplusHardwareBuffer` absent on LOS
  would force the AOSP fallback whose buffer lacks OnePlus gralloc metadata. **Edge:** C1 (proximate) →
  E2 (root). Caveat: doc-43 shows the bridge currently *does* execute (no fallback observed), so the #7
  leaf is conditionally open — if the bridge is present, #7's downstream edge runs **C1 → D3 → C6**
  (the freeze starves preview-frame delivery, Gate B), not C1 → E2.
- (context, not attached as leaves) The HDR/mode INTENT this node drives feeds **Gate A** (over-exposure,
  via the HLG-headroom request → D4) and the long-exposure finalize handshake (`KEY_IS_CAPTURE_LAST_FRAME`
  / timestamp-match → C6/D2); those roots resolve downstream, C1 is only their origin of intent.
