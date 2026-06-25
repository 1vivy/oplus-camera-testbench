<!-- STATUS: VERIFIED (static RE + on-device) — OOS dump300 libcameraservice disasm (llvm-objdump),
     2026-06-24. Maps the Depth-2 OEM-ext hook lifecycle + dispatch from the root function. On-device
     2026-06-25: R4 WIRED (v2.2) then FIXED (a536f0a481) — getExtensionOperatingMode op_mode clobber
     root-caused + fixed in the cameraserver BINARY; 8K records 7680x4320. See the WIRED→FIXED block. -->
# R4 — OEM CameraServiceExt Depth-2 hook lifecycle (root-function RE)

## TL;DR
OOS cameraserver invokes the OEM ext at lifecycle points via **`CameraServiceExtFactory::getInstance()`
→ function-table → `blr table[slot]`**, gated by an **"ext-enabled" flag** on the device object. We
recovered the dispatch from the root function `Camera3Device::configureStreamsLocked` and mapped the full
flow from the `getInstance` call sites across `libcameraservice`. **No donor** (op15ix/dodge wire zero
Depth-2 sites) — R4 is author-new, and this RE is the guide.

> **WIRED then FIXED (frameworks/av `ff7a3713a` → `a536f0a481`):** the two CONFIGURE hooks
> (`getExtensionOperatingMode` + `beforeConfigureStreamsLocked`) are wired behind
> `CameraServiceExtFactory::isLoaded()` (OOS-faithful ext-loaded gate, **no auth 1:1**).
>
> **REGRESSION (v2.2, on-device 2026-06-25):** once R4 actually shipped, `getExtensionOperatingMode`
> **clobbered the op_mode**: it echoes its **trailing `int` arg as the fallback op_mode** (the OEM
> override vendor-tag is absent on LOS — the alias table was dropped in R2), but the wiring passed
> `atoi(mId)` (camId) there. So it returned the camera id → `mOperatingMode` clobbered (8K cam2→`0x2`,
> selfie cam1→`0x1`; rear cam0 spared by the `extMode>0` guard) → configure `Unsupported set of
> inputs/outputs` → 8K/selfie no-preview. **The trailing `int` is the fallback op_mode, NOT a camId**
> (corrects the earlier "flash-to-confirm" guess).
>
> **FIX (`a536f0a481`):** pass `mOperatingMode` (not camId) as the trailing default so the echo is a
> no-op, and only honor a real vendor-range override (`extMode >= 0x8000`). Verified on-device:
> `getExtensionOperatingMode` receives `0x80a9`, no override; CamX runs `m_operationMode IS 0x80a9`;
> **8K records a 7680×4320 `.mp4`** (selfie cam1 restored by the same change).
>
> **⚠️ The fix (and all of R4) lives in the `/system/bin/cameraserver` BINARY** — `libcameraservice` is
> **statically linked** into it on this build, so `mka libcameraservice` + overlaying the `.so` is
> **INERT** (the device runs the static copy in the binary). Build `mka cameraserver`, overlay
> `/system/bin/cameraserver`. The old "overlay-bringup loop over the v2.1 zip" / "Verified mka
> libcameraservice exit 0" path could never have confirmed R4. See
> `cameraserver-static-link-build-traps.md`. `afterConfigureStreamsLocked` remains deferred (ambiguous
> 2nd-`CameraMetadata` arg) — not needed for 8K.

## Dispatch model (decoded — OOS `Camera3Device::configureStreamsLocked` @ 0x30348c)
```
ldrb w8,[x19,#0x3b4]   ; ext-enabled flag on the Camera3Device object (x19)
cmp  w8,#1
b.ne <skip hook>       ; GATE: only invoke the ext if the flag == 1
bl   CameraServiceExtFactory::getInstance()   ; -> function table ptr in x0
ldr  x20,[x0]          ; x20 = *table
cmp  x20,<expected vtable>  ; sanity guard (else alt path)
ldr  x8,[x20] ; blr x8 ; INDIRECT hook call (ext object + args set up before)
```
This matches our R2 factory's `sFunctionTable` shape. The inline `mov/movk` 64-bit constants before each
site are the OEM's per-hook method keys; **we do NOT need to replicate the key-table** — `libcsextimpl`
exports each hook by (mangled) name, so the re-impl resolves them by `dlsym` exactly as R2 does for
`onTransact`.

## Lifecycle FLOW (from all `getInstance` callers in OOS libcameraservice)
| stage | OOS root function | hook(s) | for our symptoms |
|---|---|---|---|
| connect | `CameraService::connectDeviceImpl` | `beforeConnect` / `afterConnect` | identity/session setup |
| **configure** | **`Camera3Device::configureStreamsLocked`** | **`getExtensionOperatingMode` + `beforeConfigureStreamsLocked` + `afterConfigureStreamsLocked`** (3 sites, gated) | **#8 8K configure -38** (StreamSet retype + op_mode 0x80a9) |
| reconfigure | `Camera3Device::reconfigureCamera` | before/afterConfigureStreamsLocked | mode switch |
| request | `RequestThread::prepareHalRequests` / `sendRequestsBatch` | `onPrepareHalRequestsUpdateMetadata` / `afterSendRequestsBatch` | per-request metadata |
| result | result path | `beforeMetadataSendToApp` | result massage (freeze/exposure co-factor) |
| disconnect | `Camera3Device::disconnectImpl`, `Camera2ClientBase::disconnectImpl` | before/afterDisconnect | teardown |
| torch | `…turnOnTorchWithStrengthLevel` | `beforeSetTorchMode` | torch |
| API1 (legacy) | `Camera2Client::{startPreviewL,stopPreviewL,setParameters,…}` | adjust*ForAPI1 helpers | **peripheral — skip for camera2** |

## Load-bearing hook signatures (libcsextimpl, demangled; `this`=ext object is arg0 when dlsym'd)
- `beforeConfigureStreamsLocked(CameraMetadata const&, unsigned long op_mode, String8 clientName, camera3::StreamSet&, int)`
- `afterConfigureStreamsLocked(CameraMetadata const&, unsigned long, CameraMetadata const&, camera3::StreamSet&, String8)`
- `getExtensionOperatingMode(CameraMetadata const&, unsigned long, int)`  → returns op_mode (0x8001/0x80a9)
- `onPrepareHalRequestsUpdateMetadata(CameraMetadata&, unsigned int)`
- `beforeMetadataSendToApp(CaptureResult*, unsigned int, camera3::CaptureOutputStates&)`
- `before/afterConnect(String8 const&, String16 const&, bool[, sp<CameraService::BasicClient>, void*, ulong, int])`

## Ideal re-impl (the guide)
1. Add an **ext-enabled gate** (a bool on Camera3Device / a factory `isLoaded()`), set once R2's factory
   dlopen + auth succeeds — our analog of `device+0x3b4`. Skip all hook calls when false (zero overhead
   on stock-path / unauthed clients).
2. In OUR `Camera3Device::configureStreamsLocked`, behind the gate: call `getExtensionOperatingMode`
   (override op_mode) + `beforeConfigureStreamsLocked` **before** building/HAL-configuring streams, and
   `afterConfigureStreamsLocked` **after**. Resolve each via the factory by `dlsym` (the `onTransact`
   precedent), call as `fn(extObj, args…)`.
3. Add the other roots (connect/request/result/disconnect) in lifecycle order, one at a time, re-capturing
   with the r4 probe each step (overlay-bringup loop — `V2.1-FLASH-CAPTURE-PLAN.md`).
4. Wire in priority order for our symptoms: **configure (8K #8) first**, then result/request, then
   connect/disconnect; defer the API1-legacy adjust* helpers.

## Anchors
- OOS `dump300/system/lib64/libcameraservice.so`; root fn `_ZN7android13Camera3Device22configureStreamsLockedEiRKNS_14CameraMetadataEb` (3× getInstance @ inc. 0x303498/0x303558).
- Back-channel exports verified present in our v2.1 libcameraservice (`getInstance`, `getCameraCharacteristics(...int)`, `getCameraCount`) — `STATIC-SWEEP-2026-06-24.md`.
- Probe: `tools/observability/r4-oem-transact/` (Depth-2 hooks already traced; silent on v2.1 = R4 gap).
- Pairs with doc-48 (OEM transaction receiver), F2 R4 row, `oem-binder-ontransact-RE.md`.
