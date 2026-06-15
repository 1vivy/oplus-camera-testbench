<!-- Parent: ../INDEX.md -->
---
node: C2
title: "framework camera2 / JNI (ImageReader / HardwareBuffer / Surface JNI + nativeGetOplusHardwareBuffer bridge)"
plane: control
partition: /system
blob_identical_oos_los: true   # the camera2 Java framework + libandroid_runtime.so are AOSP-derived; the OEM delta is the JNI bridge symbol, not a behavioral blob edit
characterization: PARTIAL      # session-config relay half OBSERVED end-to-end (CameraDeviceClient/Camera3-Device createStream→endConfigure→configureStreams, N=3 STABLE, OOS V16.1.0); getOplusHardwareBuffer bridge half still DARK (in-process Java↔JNI, 0 logcat hits, probe_getoplushwbuffer.js did NOT run, app_probes empty) → PARTIAL until the native upcall is traced
conviction: OPEN               # no root claim asserted — fact-to-resolve (c) bridge reach still open; E2 base/0001 effective (#7 refuted), but native app-side upcall untraced; runtime A/B (bridge FOUND vs fallback) is OOS↔LOS, LOS-deferred
verdict: ""                    # OPEN: is nativeGetOplusHardwareBuffer present AND reached on our build, or does the SDK take the getHardwareBuffer fallback (#7)?
confidence: low
symptoms: [7]                  # #7 getOplusHardwareBuffer fallback (PROXIMATE here; ROOT is E2 bridge-absence). edge → freeze #1.
probes: [probe_getoplushwbuffer.js, trace_preview_delivery.js]
gaps: [G1, G4]
dodge_ref: ""
dirty_ref: ""
divergence: "unknown — bridge symbol landed on our port (9d03af1) but never proven present+reached on the flashed /system image (E2 owns this)"
upstream: [C1, E2]             # C1 app/OCS SDK drives the reflective lookup; E2 supplies the /system libandroid_runtime.so that holds (or lacks) the symbol
downstream: [D3]              # ImageReader / getOplusHardwareBuffer JNI delivery (D3) consumes the buffer this bridge returns
refuted_refs: []
doc_refs: [doc-46, doc-47, doc-48]
updated: 2026-06-14
---

# C2 — framework camera2 / JNI

The control-plane entry where the OCS SDK (C1) reflectively reaches into the AOSP camera2 Java
framework and its `libandroid_runtime.so` JNI layer to obtain an OEM-tagged buffer handle. The Java
classes and the JNI `.so` are AOSP-derived (byte-identical class surface OOS↔LOS); the **only** OEM
delta is one added native method — `nativeGetOplusHardwareBuffer` — exposed as a Java bridge. Per the
trunk axiom, this node is a **relay/crash-site**, not a root: the root is whether E2's `/system`
framework edit (the bridge symbol) is actually present and reached on the flashed image.

## (a) Propagation contract

**OBSERVED — session-config relay (camera2/JNI half of the contract; OOS stock, V16.1.0 OP611FL1,
SELinux Enforcing, N=3 ALL STABLE per verdict.json):**
- **Client open relay:** `Camera2ClientBase: Camera <id>: Opened. Client: com.oplus.camera (PID …,
  UID 10246)` → `CameraDeviceClient: CameraDeviceClient <id>: Opened` — the camera2 binder client is
  created and bound to the OCS app on every run (photo-hdr run1 `Camera 1`, run3 `Camera 0`;
  preview-baseline `Camera 0`→`Camera 2`).
- **Stream-config relay:** `CameraDeviceClient: createStream : stream size is W x H` enumerates the
  full per-session stream set, then `endConfigure` relays it to the HAL via `Camera3-Device`/
  `AidlCamera3-Device: configureStreams`. Observed stream sets (stable across the 3 runs of each
  condition):
  - **photo-hdr (mode=photo, ae_lock=1):** preview 1440×1080 + 1920×1440 + picture streams
    3280×2464 / 4096×3072 / 6560×4928 / 8192×6144 (+ 320×240 thumb on the 4096 config). endConfigure
    SUCCEEDS first try — probe-session `endConfigure`-fail count = **0** on all 3 runs.
  - **preview-baseline (mode=video, ae_lock=0):** a deterministic two-attempt relay — Camera 0
    probe-config (1440×1080 … up to 8192×6144) is REJECTED by the HAL with
    `AidlCamera3-Device: configureStreams: Transaction error: ILLEGAL_ARGUMENT` →
    `Camera3-Device: Camera 0: configureStreamsLocked: Set of requested inputs/outputs not supported
    by HAL` → `CameraDeviceClient: endConfigure: Camera 0: Unsupported set of inputs/outputs provided`
    → app sees `CameraDevice-JV-0: Stream configuration failed due to: endConfigure:921 …`; the client
    then reopens as `Camera 2` with the reduced video set (1920×1080 + 7680×4320 ×2 + 480×270 ×2)
    which configures cleanly. This reject-then-retry is the NORMAL AOSP probe path — `endConfigure`-fail
    count = **2** on all 3 runs (stable, not a defect).

**NOT OBSERVED — getOplusHardwareBuffer bridge half (app-side native; DARK this phase):**
- Reflective lookup `Class.getMethod("getOplusHardwareBuffer", …)` against
  `android.media.ImageReader$SurfaceImage`, the `getOplusHardwareBuffer()`→`nativeGetOplusHardwareBuffer`
  OEM path, and the `getHardwareBuffer()`→`nativeGetHardwareBuffer` fallback are **all absent from every
  logcat** (0 hits across both campaigns, all 3 runs) — these are in-process Java↔JNI calls inside the
  app ART, invisible to logcat. The decisive `probe_getoplushwbuffer.js` did **not run** (no frida log
  for it; `app_probes/` empty in both campaigns — EDR/P010/motionphoto APP probes did not fire). Bridge
  presence/reach remains the open fact-to-resolve (c); E2 has since landed base/0001 (bridge effective,
  refutation #7 retired) but the runtime native upcall is still untraced.

Named carriers — OBSERVED: `Camera2ClientBase` (client open), `CameraDeviceClient`
(`createStream`/`endConfigure`), `Camera3-Device`/`AidlCamera3-Device` (`configureStreams`),
`CameraDevice-JV-<id>` (Java framework relay). DARK: `nativeGetOplusHardwareBuffer`,
`ImageReader$SurfaceImage.getOplusHardwareBuffer()`, `getHardwareBuffer`/`nativeGetHardwareBuffer`
fallback, `acquireNextImage`/`acquireLatestImage`, `HardwareBuffer(long, boolean)`.

> **G-MECH note:** runtime shows the camera2 session-config relay reaching the HAL end-to-end
> (`createStream`→`endConfigure`→`configureStreams`, N=3 STABLE) but the `getOplusHardwareBuffer`
> native upcall is NOT observed — pairs with the RE renote that E2 base/0001 (#7 refuted) makes
> `nativeGetOplusHardwareBuffer` present+effective in the flashed `libandroid_runtime.so`, yet the
> in-process JNI upcall stays unobserved (logcat-invisible; `probe_getoplushwbuffer.js` not run) → the
> mechanism step is statically resolved but runtime-unconfirmed.

## (b) Environment dependencies

- **`/system` binary:** `libandroid_runtime.so` must export/register the `nativeGetOplusHardwareBuffer`
  native method (doc-46 Addendum A: OOS `libandroid_runtime.so` carries 52 oplus dynsym / 86 oplus
  strings and **does** define it natively). On our port the matching framework edit landed as commit
  `9d03af1` — but presence on the *flashed* image is **E2's question**, not C2's.
- **`/system` framework jar:** the `android.media.ImageReader$SurfaceImage.getOplusHardwareBuffer()`
  Java declaration must exist in the boot framework (so the SDK's `getMethod` resolves rather than
  throwing `NoSuchMethodException`). A mismatch between the JNI symbol and the Java declaration
  (one present, the other not) silently degrades to the fallback.
- **No `/vendor-config`, sepolicy, or linker-namespace dependency** at this boundary — it is a pure
  in-process Java↔JNI call inside the app's ART. (Contrast E4: the gralloc/namespace concerns live at
  D1, not here.)

## (c) Fact-to-resolve

**ONE question:** On our flashed build, when the OCS SDK runs its reflective lookup, does it find and
invoke `getOplusHardwareBuffer()` (→ `nativeGetOplusHardwareBuffer`), or does it fall through to
`getHardwareBuffer()`?

- **Answer A — bridge FOUND + invoked** (`[getMethod] … -> FOUND`, `[BRIDGE] … getOplusHardwareBuffer() -> HardwareBuffer@…`):
  *Prediction:* C2 is an innocent relay; #7 is not active; the OEM buffer reaches D3 with correct
  metadata. *Unlocks:* close C2 for #7, push the freeze-#1 search downstream to D3/C6 (delivery /
  release-gate) and confirm the buffer carries OnePlus gralloc metadata.
- **Answer B — `NoSuchMethod` / fallback fires** (`[getMethod] … -> NoSuchMethod (BRIDGE ABSENT)`,
  `[fallback] … getHardwareBuffer() -> …`):
  *Prediction:* #7 is live; the AOSP buffer lacks OnePlus metadata → NN OUTPUT ERROR → pool exhaust →
  feeds freeze #1. *Unlocks:* hand the root to **E2** — confirm `9d03af1` is applied AND effective in
  the infiniti `/system` image (symbol scan of the flashed `libandroid_runtime.so` + Java decl in the
  boot jar); the fix is an E2 framework-apply, never a blob edit here.

> Axiom binding: `blob_identical_oos_los: true` ⇒ if Answer B, the fact-to-resolve points at the **E2
> /system framework edit** (bridge symbol presence/effectiveness), not at any edit to the camera2
> Java framework or `libandroid_runtime.so` blob itself.

## (d) Runtime probe(s)

- **`tools/frida/probe_getoplushwbuffer.js`** — the decisive presence/link probe (TEST-PLAN §2 rank 8).
  Hooks `Class.getMethod`/`getDeclaredMethod` (filtered to `getOplusHardwareBuffer`),
  `ImageReader$SurfaceImage.getOplusHardwareBuffer` (only present after the fix), and the
  `getHardwareBuffer` fallback. Low-frequency (per-capture/per-stream-config), ART-safe. Run on
  `com.oplus.camera`, take one capture; FOUND vs NoSuchMethod is the verdict.
- **`tools/frida/trace_preview_delivery.js`** — the freeze-localization companion: per-second rates of
  `getOplus`, `HardwareBuffer.close`, `Image.close`, `acquireNextImage` ok/null. Distinguishes
  pool-exhaustion (`acqNull` climbs after ~maxImages) from downstream render starvation. Ties C2's
  fallback to the freeze-#1 mechanism.
- **Lever status (lever-index.md):** frameworks/base JNI = **PARTIAL/DARK** — the Java layer is
  hookable via frida (both probes above), but the native SF/EDR side is not; no setprop verbosity lever
  exists. frameworks/av (cameraserver) = **DARK** (G1) — the upstream connect/configure that creates
  these streams is lever-less, so C2's frida view is the best available control-entry observation.

## (e) Dodge-vs-dirty diff

Not an E-node; the facilitation A/B for the bridge symbol lives at **E2** (`/system` framework edits).
Pointer only: doc-46 Tier 1 row `frameworks/base | getOplusHardwareBuffer / AHardwareBuffer bridge`
is **D+O ✅ `9d03af1`** — both dodge and our port have the patch landed in source. The open divergence
is therefore not "do we have the source edit" (we do) but **"is it present + reached on the flashed
infiniti image"** — exactly the `9d03af14` "added but unproven" caveat in the attribution matrix #7.
E2 owns the cross-link to `DODGE-VS-DIRTY.md`; C2 only observes the runtime effect.

## (f) Symptom leaves

- **#7 getOplusHardwareBuffer fallback** — attaches here as **PROXIMATE SITE**. The crash/stall is the
  SDK taking the AOSP `getHardwareBuffer` fallback (NN OUTPUT ERROR → `ApsResult$ImageBuffer` never
  closed → pool exhaustion). The **ROOT is E2** (`nativeGetOplusHardwareBuffer` JNI absent or
  unreached on the flashed `/system`). Edge: #7 **feeds freeze #1** (attribution matrix: "CONFIRMED
  /system — feeds freeze #1") — once the pool exhausts, the consumer (D3 → APS) starves and preview
  freezes. C2 is the observation point for whether that fallback is taken; the fix is environmental.
- Edge to **doc-47 Gate B / freeze:** doc-47 roots the freeze at "app renders 0 frames / surface 0×0"
  with the A→B mechanism unproven; C2's `trace_preview_delivery.js` (pool-exhaust signature) is one
  candidate mechanism for that delivery starvation, subordinate to the `probe_aec_hdrdetect.js` test.
