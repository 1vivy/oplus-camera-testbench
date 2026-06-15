<!-- Parent: ../INDEX.md -->
---
id: 7
symptom: "getOplusHardwareBuffer fallback → NN OUTPUT ERROR → ApsResult$ImageBuffer pool exhaustion"
path_nodes: [D3, E2]            # D3 proximate-site → E2 facilitation root
edge: "D3 takes AOSP getHardwareBuffer fallback (metadata-less buffer) → Infiniti NN OUTPUT ERROR → input Image never closed → 20-deep ImageReader pool exhausts; ROOT = nativeGetOplusHardwareBuffer JNI bridge (base/0001) absent/ineffective at runtime (E2)"
decisive_probe: "probe_getoplushwbuffer.js + nm -DC symbol scan of built libandroid_runtime.so / libcameraservice.so"
characterization: PARTIAL       # D3 edge observed via on-device backtrace (bridge executing); E2 bridge-effectiveness edge unconfirmed (native DARK, symbol unscanned) — path not traced end-to-end
conviction: REFUTED             # a falsifier fired: D3 REFUTES #7-as-root for preview (bridge present, no fallback); E2 holds #7 ROOT only conditional on base/0001 NOT effective — apply/runtime unconfirmed
updated: 2026-06-13
---

# S7 — getOplusHardwareBuffer fallback → NN error → pool exhaustion

THIN leaf. Encodes the PATH only; node content lives in the referenced files.

- **D3** (`../data/D3-imagereader-hwbuffer.md`) — **PROXIMATE-SITE.** The preview Image crosses ImageReader→OCS APS via the OEM `getOplusHardwareBuffer()` bridge into a 20-deep pool (`KEY_PREVIEW_MAX_IMAGES=0x14`). D3 **REFUTES #7-as-root for preview**: the crash backtrace shows the bridge executing into `nativeGetOplusHardwareBuffer` (no AOSP-fallback log), gating is on `mPreviewErrorCode`/`mFrameworkErrorCode` not `mMetadata`, and the progressive-leak model was refuted on-device (single-shot stall). Edge → the held input is starved by a skipped native `decMetaRefZeroToRemove` upcall, redirecting #1 to C6/D2.
- **E2** (`../facilitation/E2-system-framework.md`) — **ROOT (conditional).** Holds #7 as root **iff** the byte-identical `frameworks/base/0001` JNI patch is NOT effective in the shipped /system image (`nativeGetOplusHardwareBuffer` not JNI-registered → SDK falls back). Patch FILE is 4/4 sha256-identical dodge↔ours; apply/runtime is `unknown` with counter-evidence (base/0001 `9d03af14` unproven, libcsextimpl dropped `d654641`).
- **Verdict:** characterization PARTIAL, conviction REFUTED (path unconfirmed end-to-end). The fallback→pool-exhaust framing is refuted at D3 (bridge present per backtrace) but the E2 bridge-effectiveness is not symbol-confirmed on our build — decisive probe is the `probe_getoplushwbuffer.js` Java hook (native side DARK) backed by an `nm -DC` symbol scan of the built `libandroid_runtime.so`. If the symbol is present+reached, E2 closes benign and #7 is fully refuted; if absent, E2 is the root and re-apply/rebuild is the action.
