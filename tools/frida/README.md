<!-- Parent: ../AGENTS.md -->
<!-- Build-pinned: V16.1.0 / 16.0.8.300 / OP611FL1 / CPH2745 -->

# tools/frida — probe→subsystem index

## Purpose

Frida instrumentation scripts for the OnePlus camera stack (CPH2745, OOS V16.1.0 / 16.0.8.300).
Each script attaches to a running process (camera provider, cameraserver, or `com.oplus.camera`) and
emits structured checkpoint records that the campaign harness (`../observability/campaign/`) collects and
`parse_condition.py` / `diff_oos_los.py` compare across OOS↔LOS.

**frida-17 API note.** frida-17 removed the static `Module.getExportByName(lib, sym)` and
`Module.findExportByName(lib, sym)` functions. All probes in this directory use the module-instance
API exclusively:

```js
var m = Process.findModuleByName('libFoo.so');
var p = m.findExportByName('_ZN...');
```

For symbols that are not exported (local symbols, pattern-based), probes delegate to `_anchor.js`.

---

## _anchor.js — shared OTA-resilient resolver (not a probe)

`_anchor.js` is the symbol resolver consumed by new probes. It is **not** a probe itself and should
never be listed in `EXTRA_PROBES`. It walks a four-rung ladder per target:

| Rung | Method | Durability |
|------|--------|------------|
| 1 | `m.findExportByName(sym)` — dynsym export | Durable across point releases |
| 2 | On-device ELF `.symtab` parse | Catches LOCAL symbols release builds retain |
| 3 | `Memory.scanSync(prologue/sig)` | Survives minor rebuilds |
| 4 | BuildID-keyed cache at `/data/local/tmp/probe-symbols/<lib>-<buildid>.json` | Last resort; gated on matching GNU BuildID |

The **BuildID** (GNU `.note.gnu.build-id`) is the per-module OTA signal and the cache key. A cache
entry keyed on a mismatched BuildID is silently ignored — that is precisely the guard that would have
caught the r4 `.201`→`.300` silent offset break. When all four rungs miss, the script logs loudly
and escalates to host-side Ghidra re-anchor (rung 5, manual).

---

## Key Files — probe→subsystem index

All files are `.js` unless noted. `Process` = the frida attach target.
Resilience ratings: **RESILIENT** = resolves by exported symbol or _anchor export-rung (survives OTA);
**MIXED** = some hooks by export, others by offset; **FRAGILE** = purely offset-pinned to a specific build.

### AEC / HDR-detect subsystem (provider — `vendor.qti.camera.provider-service_64`)

| Probe | Subsystem | What it observes / flips | Resilience |
|-------|-----------|--------------------------|------------|
| `probe_aec_hdrdetect.js` | AEC / HDR-detect | `HDRDetectProcess` enable gate (`*(*ctx+0x48)==0`) + `HDRTriggerFlagDetection`; confirms why `hdr_detected` rc=-2 at the app. `FORCE=true` lever forces the detector ON for diagnostic coherence test. Pinned to `libaecCustom.so` (BuildID d0204b3e, byte-identical OOS↔LOS). | MIXED (offset-pinned; blob byte-identical so offsets are stable) |
| `probe_aec_getparam.js` | AEC / HDR-detect | `camAECGetParam(handle, paramType, in, out)` — tallies which param-type IDs the CamX AEC node requests from the algo; discriminates between "HDR data not requested" vs "requested but node drops it downstream". Resolves by exported symbol. | RESILIENT |

### EDR / tone-mapping subsystem (APP — `com.oplus.camera`)

| Probe | Subsystem | What it observes / flips | Resilience |
|-------|-----------|--------------------------|------------|
| `trace_edr_invocation.js` | EDR / tone-mapping | OEM libgui `setEdrSdrRatio` + `setExtendedRangeBrightness` (SIMD-register float decode via `context.d0/d1`); `OplusEdrViewTransform` 4×4 struct (memory read); `OplusEdrUtils` Java-side invocation. Symmetric diff oracle R3/B2. | RESILIENT (exported symbols + memory read) |
| `probe_basictone.js` | EDR / tone-mapping | `libBasicTonePhoto.so` — `OGLBasicToneProcess` + `saveOutImg` entry/exit; locates how `libAlgoProcess` reaches the OGL tone operator (GOT vector the `libapsfixup` shim must hook) and confirms `Image->field_0x38`. Offset-pinned (BuildID 012716fe). | FRAGILE |
| `trace_turbohdr_tag.js` | EDR / TurboHDR | Per-HDR-frame: OEM IPE TurboHDR vendor-tag (~0x4d78) presence + `field_0x4d88` non-null check at the deref site. Stock: tag PRESENT → `parseTurboHdrInfo` stores → `field_0x4d88` non-null → `strlen` safe. LOS: tag absent → `field_0x4d88` NULL → `strlen(NULL)` SIGSEGV (#6, masked today by `libapsfixup` Family-III). Diff oracle R6. | MIXED |

### gralloc / P010 subsystem (APP — `com.oplus.camera`)

| Probe | Subsystem | What it observes / flips | Resilience |
|-------|-----------|--------------------------|------------|
| `trace_gralloc_p010_chain.js` | gralloc / P010 | Full P010 alloc→map→lock chain (Part C): `AHardwareBuffer_allocate` usage/format; `QtiMapper5::getMetadata(PLANE_LAYOUTS)` per-plane offset/stride/contiguity; `AHardwareBuffer_lockPlanes` realized plane ptrs. The contiguity decision (Cr = Y + stride×alignedH) is the surviving divergence root. Symmetric diff oracle for `libapsfixup` Family-I. | RESILIENT (exported symbols) |
| `trace_p010_planes.js` | gralloc / P010 | Targeted P010 plane layout: libui/QTI mapper lock reports vs `APSGrallocUtils::getPlaneLayout` blob computation; `camApsBufferLockPlanes` final descriptor. Decisive comparison of lock-reported Cb offset vs blob-computed Cb. | MIXED |
| `probe_getoplushwbuffer.js` | gralloc / P010 | Confirms whether the OCS/APS SDK reflectively selects `ImageReader$SurfaceImage.getOplusHardwareBuffer()` vs falls back to `getHardwareBuffer()`. Causal-link layer; pairs with `trace_p010_planes.js` (success-criterion layer). | RESILIENT (Java reflection) |

### Provider stream-config subsystem (provider — `vendor.qti.camera.provider-service_64`)

| Probe | Subsystem | What it observes / flips | Resilience |
|-------|-----------|--------------------------|------------|
| `hook_configure_streams.js` | Provider stream-config | `camera.oemlayer.v2.so OCamera3Dev::configure_streams` entry: dumps `camera3_stream_configuration` (num_streams, op_mode, per-stream type/width/height/format/usage). Pre-mutation view; pairs with `hook_before_configure_streams.js` for before/after StreamSet diff. 8K op_mode expected: `0x80a9`. | RESILIENT (exported vaddr symbol) |
| `hook_eisv2_ports.js` | Provider stream-config | `com.oplus.node.sstabrealt.so EISV2NodeQueryBufferInfo` — dumps `numInputPorts` vs `numOutputPorts` + portIds. The mismatch is the 8K -38 root (node logs "pure bypass, num inputs should equal outputs"). Offset-pinned (not exported, file-offset 0x355b4). | FRAGILE |

### APS metadata / preview-engine subsystem (APP — `com.oplus.camera` → `libAlgoProcess.so`)

| Probe | Subsystem | What it observes / flips | Resilience |
|-------|-----------|--------------------------|------------|
| `observe_getmetadata.js` | APS metadata | `APSMetadata::getMetadata` overloads (int-tag + string-key); logs every `(tag, rc)` the APS decision reads. rc == -2 (`0xfffffffe`) = tag not present = vendor-tag-registration gap. Resolves by exported symbol (BuildID 82fe443b; Ghidra offsets invalid on this build). | RESILIENT |
| `trace_aps_metadata_lifecycle.js` | APS metadata | Per-frame APS metadata lifetime invariant: `setMetaImageRef(Object, String, Z)` inc/dec balance + `metaBufferMap.size()`; `decMetaRefZeroToRemove` zero-release upcall. Stock target: balance ≈ 0, map bounded ≈ 2–4. LOS diff target: inc >> dec, balance/map climb → pool exhaust (#1/#4). | RESILIENT (exported symbols) |
| `probe_aps_preview_routine.js` | APS preview-engine | **NEW — TIER-1 freeze Gate-B.** `APSPreviewManager::previewManagerRoutine` — samples command-count (`this+0x150`) and cond-var state (`this+0x17c`) over time. Frame 1 renders; if the input Image is never returned, count stays 0, routine starves → preview freeze. Resolves via _anchor export rung (symbol `_ZN17APSPreviewManager21previewManagerRoutineEPv`, BuildID `2217d555…`, fallback off 0x1aa694). APP-side; `libAlgoProcess.so`. | RESILIENT |
| `probe_sendinputdata_gate.js` | APS preview-engine | **NEW — TIER-1 freeze Gate-B.** `APSPreviewManager::sendInputData(AlgoPreviewProcessData*, ModeConfig*)` — checks `AlgoPreviewProcessData->InitParamters[+0x378][0] == 1` (per-frame release gate). If gate is false or pointer null, input buffer is never returned → feeds `previewManagerRoutine` starvation. Resolves via _anchor export rung (fallback off 0x1b534c). APP-side. | RESILIENT |
| `trace_preview_delivery.js` | APS preview-engine | OCS preview delivery chain: `ImageReader.acquireNextImage/acquireLatestImage` (null-return = pool exhaustion); `getOplusHardwareBuffer` creation count; `Image.close()` / `HardwareBuffer.close()` cadence; `onImageAvailable` fire rate. Localizes freeze as exhaustion vs downstream stall. | RESILIENT (Java hooks) |

### OEM `media.camera` transaction layer (SERVER — `cameraserver` → `libcsextimpl.so`)

| Probe | Subsystem | What it observes / flips | Resilience |
|-------|-----------|--------------------------|------------|
| `hook_before_configure_streams.js` | OEM stream-config | **NEW — TIER-2 8K -38.** `CameraServiceExtImpl::beforeConfigureStreamsLocked(CameraMetadata&, op_mode, String8, StreamSet&, int)` — post-mutation StreamSet dump (stock cameraserver may inject the 7680×4320 OUTPUT stream EISv2 needs here). Pairs with `hook_configure_streams.js` for before/after diff. Resolves via _anchor export rung (`_ZN7android20CameraServiceExtImpl28before…`, libcsextimpl 16.0.8.300). SERVER-side. | RESILIENT |
| `probe_get_extension_opmode.js` | OEM stream-config | **NEW — TIER-2 8K -38.** `CameraServiceExtImpl::getExtensionOperatingMode(CameraMetadata&, ulong, int)` — return value; 8K HDR expected: `0x80a9`. If stock shapes op_mode here and LOS never calls the hook, the 8K pipeline op_mode is wrong upstream of EISv2. Correlate with `hook_before_configure_streams.js`. Resolves via _anchor export rung (libcsextimpl @0x8875c, fallback BuildID `039e6cf7…`). SERVER-side. | RESILIENT |

### Log-enablers / clobber-defeat subsystem (provider)

| Probe | Subsystem | What it observes / flips | Resilience |
|-------|-----------|--------------------------|------------|
| `enable_camx_logging.js` | Log-enabler | Writes `CamX::g_logInfo` (`libcamxcommonutils.so` +0x68010) wide open + sets `enableAsciiLogging=1`; re-asserts after every `UpdateLogInfo` call. Excludes SENSOR(bit 1), NCS(bit 23), TRACKER(bit 2) groups (known SIGSEGV path). Build-pinned offsets (V16.1.0 / 16.0.7.201). | FRAGILE (offset-pinned to g_logInfo) |
| `unclobber_camx_logs.js` | Log-enabler | In-memory twin of `patch_chi_logclobber.py`. Writes `retaa` over the 2nd instruction of CHI log-mask clobbers in `libextensionlayer.so` (#1/#3) and `com.qti.chi.override.so` (#2) so `camxoverridesettings.txt` CHI verbose masks survive `configure_streams`. Resolves all three targets by exported symbol. | RESILIENT |
| `enable_ascii_logging.js` | Log-enabler | Live StaticSettings POD writes: `enableAsciiLogging=1` + log-mask raise (INFO/CoreCfg/EntryExit; VERBOSE optional via `WANT_VERBOSE`). Offset-pinned to `libcamxsettingsmanager.so` (V16.1.0). Does NOT touch `g_logInfo` (use `enable_camx_logging.js` for that). | FRAGILE |
| `enable_olog_oemlayer.js` | Log-enabler | Flips `camera.oemlayer.v2.so` OLog level globals (`_ZN4OLog15g_enableLogInfoE` etc.) to 1; re-asserts every 1 s. Resolves by exported symbol. | RESILIENT |
| `enable_ocs_sdk_log.ts` | Log-enabler | TypeScript; requires `frida-compile`. Forces the OCS camera SDK's Java loggers to MAX verbosity in `com.oplus.camera` (library load, vendor-tag init, APS HDR decision `Util.isHdrOn`). Must be compiled to `.compiled.js` before use. | RESILIENT (Java hooks) |
| `read_gloginfo.js` | Log-enabler | Reads and prints the live `g_logInfo` struct (all mask slots + `enableAsciiLogging`) from `libcamxcommonutils.so` +0x68010 + `g_logInfoUpdated` / `g_logInfoStored`. Diagnostic companion to `write_gloginfo.js`. | FRAGILE |
| `write_gloginfo.js` | Log-enabler | Forces `g_logInfo` masks to `0xFFFFFFFF` and `enableAsciiLogging=1` unconditionally; sets `g_logInfoUpdated=1`. One-shot fix-verify helper. Build-pinned. | FRAGILE |

### CamX settings subsystem (provider)

| Probe | Subsystem | What it observes / flips | Resilience |
|-------|-----------|--------------------------|------------|
| `dump_camxsettings.js` | CamX settings | Calls `WriteCamxSettingsToFile(this)` by offset (not exported); reads known HDR lever offsets (+0x6a28 / +0x6a18). Dumps all `name=value` pairs to `/data/vendor/camera/camxsettingsdump.txt`. Diff OOS↔LOS to find the `camxoverridesettings.txt` key names for the HDR/SHDR levers. Build-pinned offsets (V16.1.0). | FRAGILE |

### Framework surface / OCS SDK subsystem (APP)

| Probe | Subsystem | What it observes / flips | Resilience |
|-------|-----------|--------------------------|------------|
| `fwk_trace.js` | Framework surface | Intercepts framework classes loaded from a non-app classloader, `Class.forName` / `Method.invoke` reflective calls into `com.oplus.*` / `android.*oplus*`, and `ServiceManager.getService` names. Produces the stub surface needed to build accurate framework stubs. | RESILIENT (Java hooks) |

### OCS SDK (APP)

| Probe | Subsystem | What it observes / flips | Resilience |
|-------|-----------|--------------------------|------------|
| `enable_ocs_sdk_log.ts` | OCS SDK | (See Log-enablers above.) | RESILIENT |

---

## Subdirectories

None. All scripts are flat in `tools/frida/`. Compiled output for TypeScript sources
(e.g. `enable_ocs_sdk_log.compiled.js`) lands here after `frida-compile`.

---

## For AI Agents

- Probes are referenced by **BASENAME** (no `.js`) from `conditions/*.env` `EXTRA_PROBES` and from
  the persistence bundle `manifest`. **Do not rename any file** in this directory.
- `_anchor.js` is the shared resolver; it is not a probe. Never add it to `EXTRA_PROBES`.
- **All new probes must use the frida-17 instance API** (`Process.findModuleByName(lib).findExportByName(sym)`)
  for exported symbols. For non-exported targets, use `_anchor.js` resolve() with `export`, `symtab`,
  `pattern`, and `fallback` rungs populated as available.
- The four new probes (`probe_aps_preview_routine`, `probe_sendinputdata_gate`,
  `hook_before_configure_streams`, `probe_get_extension_opmode`) are the first real `_anchor.js`
  consumers; use them as the canonical template for new probes.
- Probe routing (set by `run_condition.sh` + `app_probe_capture.sh`):
  - **PROVIDER-side**: `dump_camxsettings`, `probe_aec_hdrdetect`, `probe_aec_getparam`,
    `hook_configure_streams`, `hook_eisv2_ports`, `observe_getmetadata`
  - **SERVER-side** (cameraserver): `hook_before_configure_streams`, `probe_get_extension_opmode`
  - **APP-side** (com.oplus.camera): `trace_edr_invocation`, `trace_motionphoto`,
    `probe_getoplushwbuffer`, `trace_preview_delivery`, `trace_p010_planes`,
    `trace_aps_metadata_lifecycle`, `trace_turbohdr_tag`, `trace_gralloc_p010_chain`,
    `probe_aps_preview_routine`, `probe_sendinputdata_gate`
- `enable_camx_logging.js` and `unclobber_camx_logs.js` are always co-attached by `run_condition.sh`
  regardless of `EXTRA_PROBES`; do not duplicate them in condition `.env` files.
- Cross-reference: `../observability/tables/lever-index.md` for per-subsystem WORKS/CLOBBERED/DARK
  status and the exact mechanism each lever exercises.
- Build identity must be verified before trusting offset-pinned (`FRAGILE`) probes: check
  `adb shell getprop ro.build.version.oplusrom` and the `.so` GNU BuildID via `_anchor.js` logs.

## Dependencies

- Rooted device (KernelSU), `frida-server` running on device, `frida` CLI on host `PATH`.
- `frida >= 17` (instance-API mandatory; static `Module.getExportByName` absent).
- `frida-compile` (npm) for TypeScript sources (`enable_ocs_sdk_log.ts`).
- `adb shell setenforce 0` required for provider/cameraserver attach on this build.
- BuildID cache directory `/data/local/tmp/probe-symbols/` created on first `_anchor.js` resolve.

<!-- MANUAL: -->
