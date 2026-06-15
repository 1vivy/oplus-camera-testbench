<!-- Parent: ../INDEX.md -->
<!-- Node template + FACT contract: ../SCHEMA.md -->

---
node: C6
title: "APS / libAlgoProcess + camera.oemlayer.v2 (in-app preview-decision engine + OEM tag layer)"
plane: control
partition: /odm
blob_identical_oos_los: true
characterization: PARTIAL       # (a) result-delivery G4 denominator now OBSERVED (preview-baseline V16.1.0: ~30 fps/stream via camxhal3 process_capture_result; oemlayer ConfigureHDRInformation/InitPackageName seen) — but the decMetaRefZeroToRemove decref upcall (isInc=false) itself is still UNSEEN app-side (probes did not fire), so not end-to-end
conviction: OPEN                # no root claim asserted; OOS↔LOS A/B deferred to LOS phase (G-SYM), fact-to-resolve still open
verdict: ""
confidence: low
symptoms: [1, 2]
probes: [probe_aec_hdrdetect.js, enable_olog_oemlayer.js, debug/10_runtime_debug.sh]
gaps: [G7, G4, G8]
dodge_ref: ""
dirty_ref: ""
divergence: ""
upstream: [C5, C4]
downstream: [D2, D4]
refuted_refs: []
doc_refs: [doc-47, doc-42, doc-41, doc-48]
updated: 2026-06-14
---

# C6 — APS / libAlgoProcess + camera.oemlayer.v2

> Trunk axiom: `libAlgoProcess.so` BuildID `82fe443b408f8ed027558b0d4ffb1500` and `camera.oemlayer.v2.so`
> are **byte-identical OOS↔LOS** (doc-42 §blobs; re-baked, never edited). So C6 is a STALL SITE, never a
> root. The root is a broken propagation contract in C6's environment — what C5/C4 hand it (hdr_detected,
> OEM tags) and what /system hands back (the buffer-release upcall). A blob edit here is forbidden.

## (a) Propagation contract

**What enters C6 (carriers consumed):**
- `com.qti.stats_control.hdr_detected` — the AEC HDR flag from C5/C4 (AEC node). Computed only if the
  `HDRDetectProcess` master-enable gate is open (see below). When unset, C6 runs the non-HDR branch.
- AEC HDR-detect gate `*(*aecCtx + 0x48)` in `libaecCustom.so` (Ghidra `HDRDetectProcess` `0x1b4d8c` /
  device `0x0b4d8c`): `if(*(*ctx+0x48)==0) return;` → producer `HDRTriggerFlagDetection` (`0x0ed7e4`,
  writes `hdr_detected` at `aecOut+0xfc`) is never reached. This is the gate C6's HDR branch keys off.
- OEM vendor-tags resolved inside `camera.oemlayer.v2.so` — `DefaultRequestSettings`,
  `ConfigureHDRInformation`, `InitPackageName` (named in `enable_olog_oemlayer.js` header). These set the
  per-request HDR/customVendorTag state C6 acts on; `customVendorTag 120` is now PRESENT (doc-47; R-06 closed).
- Preview input buffers + their metadata, queued onto `APSPreviewManager`'s own command-queue semaphore
  (`previewManagerRoutine+1560`, libAlgoProcess) — the input C6 is starved of at the freeze.

**What leaves C6 (carriers produced):**
- `decMetaRefZeroToRemove` — the JNI release upcall libAlgoProcess makes to the /system frameworks/base
  layer when a preview frame's metadata refcount hits zero, signalling "frame consumed, release it"
  (attribution-matrix #1; TEST-PLAN test-3). **On LOS this upcall is never made → frame 1 is held forever.**
- The processed preview buffer handed downstream to D2/D4 (`ImageReader→GLThread→SurfaceView`).
- OLog diagnostics gated by `OLog::g_enableLogInfo/Verbose/Warning/Error` globals (off by default).

**OBSERVED working values (preview-baseline campaign, V16.1.0 stock, `mode=video`, HDR scene, SELinux
Enforcing; CamX logs un-clobbered + un-locked via `enable_camx_logging` info=0x1f0fb7b8 verb=0xe010200,
SENSOR/NCS excluded; N=3 runs, verdict.json ALL STABLE):**
- **Result-delivery cadence (the G4 denominator) = ~29-30 fps per preview/display stream.** Measured at
  CamX-core depth via `camxhal3.cpp:2472 process_capture_result()` — its `frame_number` field advances
  **+29.3 / +30.0 / +29.4 per wall-second** (run1/run2/run3) across the ~40 s active window; the INFO line
  itself is throttled to ~1/s (95/103/102 lines/run), so the **frame_number delta is the true cadence
  carrier**, not the line count. Corroborated by `camxsession.cpp:7275 ProcessResults()` (CORE VERB,
  594/561/623 per-sequenceId across RealtimeDefault0/1/2) and the framework hand-off
  `camxhaldevice.cpp:370/378 ProcessCaptureResult() Returning framework result` (58 buffered-frame +
  3 metadata-only in run1). This is the per-display-stream form of the C5 §SESSION-FACT 69.5 results/s
  logical-4 aggregate (~30 fps/stream) — now confirmed for the single video preview stream.
- **`OnProcessCaptureResult` is ABSENT (0 hits)** at CamX-core — confirms it is the framework-layer name,
  not a CamX-core term (do not grep for it here).
- **oemlayer (a)-input carriers OBSERVED at runtime:** `ConfigureHDRInformation()`
  (`chxextensionmodule.cpp:12455/12558` — `Logical camera:4 HDRMode set to:1`, 6×),
  `InitPackageName()` (`pluginbase.cpp`, vendor-tag resolution, 5×), `oemlayer` internal-stream
  classification (`streamclassifier.cpp:232`), and libAlgoProcess output publish
  `oplusAWBPublishAlgoProcessOutput()` (99×/run); `hdr_detected` vendor tag present (verdict #2 stable).
- **STILL DARK (residual gap — app-side):** the `decMetaRefZeroToRemove` decref upcall **itself** (the
  central "what leaves C6" release carrier) was NOT observed — `decMetaRefZeroToRemove`,
  `MetaImageRefCounter`, `setMetaImageRef`, `metaBufferMap`, `callbackToCamUnit`, `previewManagerRoutine`
  all = 0 in logcat, and `app_probes/` is EMPTY (`trace_preview_delivery` / `probe_getoplushwbuffer`
  did not fire this pass). So the working G4 *denominator* (~30 fps) is observed, but the per-frame
  release *event* against it is not — see §(c) characterization note.

> **G-MECH (runtime↔RE pairing):** the working ~29-30 fps `process_capture_result` cadence is the
> denominator the `ApsCallbackMetaRefInc::callbackToCamUnit` upcall (`libAlgoProcess.so + 0x31fa1c`,
> `gCallbackRequestAction` JNIAction=2, `isInc=false`; decmetarefzero-upcall-RE.md) must match **one
> release per consumed preview frame** on a working preview — i.e. a working preview expects the decref
> upcall to fire ~30×/s/stream, tracking this cadence, with `metaBufferMap.size()` bounded (~2-4, never
> climbing to 20). That per-frame upcall is the G-MECH proof site; it is RE-confirmed but not yet
> runtime-observed (app-side probe DARK), so this stays the open mechanism for §(c).

## (b) Environment dependencies

- **/odm blobs** (in the camera-provider + app process): `libAlgoProcess.so`, `libAlgoInterface.so`
  (BuildID per doc-42), `camera.oemlayer.v2.so`, optional `camera.oemlayer.logger.so`. Partition /odm.
- **/system frameworks/base** — the receiver of the `decMetaRefZeroToRemove` JNI upcall and the
  `getOplusHardwareBuffer` buffer path that feeds APS (attribution-matrix #1, #7 feeds #1). This is the
  non-blob layer suspected of breaking C6's release contract.
- **C5/C4 publish** of `hdr_detected` + OEM HDR tags via `camxoverridesettings.txt` session state
  (`selectSHDRAutoExposureUsecase`) — see C5 (#2 ROOT-A). C6 consumes their output; it does not gate it.
- OLog globals are **/odm FRIDA-ONLY** (no setprop/override lever) — see (d).

## (c) Fact-to-resolve

**ONE question:** *On a stable working-state cycle, what is the cadence of the `decMetaRefZeroToRemove`
JNI release upcall per preview frame — and is the LOS stall because that upcall is absent (frameworks/base
contract broken) or because no frame ever arrives to release (input starvation upstream)?*

- **If the upcall fires per-frame on a working baseline but is absent/0 on LOS while frames arrive** →
  root is the /system frameworks/base release bridge (likely tied to `nativeGetOplusHardwareBuffer`, #7).
  Action: confirm/restore the JNI bridge (`9d03af14`, unproven) — NOT a blob edit. Sets #1 ROOT B.
- **If `APSPreviewManager` is input-starved (`previewManagerRoutine` parked in `pthread_cond_wait`, no
  frame ever enqueued)** → C6 is innocent; freeze root is upstream consumer delivery (D2/D3) or C5 Gate A.
  Action: chase the ImageReader→GLThread enqueue gap (doc-41 §2-NEXT), not C6.
- **If forcing the HDR gate open also un-freezes** → Gate A↔Gate B unify (doc-47 disproves this so far);
  fix = AEC HDR-detect tuning. doc-47 predicts this is FALSE (fusion runs without hdr_detected).

This is the **#1 freeze denominator**: C6 cannot be attributed root or innocent without the working-state
release cadence (G4). doc-47 holds A and B are independent; the A→B link through C6 is the open mechanism.

> **SESSION FACT (G4 working-preview cadence CAPTURED, 2026-06-13 — `reference/captures/camxcore-clean/`):** with
> CamX-core logging unlocked (the `g_logInfo` lever, `tools/frida/enable_camx_logging.js` — see C5 FACT 4), a clean
> stock preview on the HDR scene gives the **working delivery denominator**: **2674 `OnProcessCaptureResult` over
> 38.49 s = 69.5 results/s, 7.0 ms median interval** (multicam logical-4 aggregate; alternating `capIntent 1`
> buffered-frame + `capIntent -1` metadata-only ⇒ ~30 fps per display stream); Oplus gamma metadata published every
> frame. This is the **G4 baseline the consensus flagged as the top unblock** (gates the #1/#4/#5 runtime A/Bs) —
> now have it stock-side; the LOS-frozen A/B compares against this cadence. The `decMetaRefZeroToRemove` release
> upcall itself is STATS_AEC/CORE/SYNC VERBOSE in the post-shutter window (add SYNC bit13 to the lever's VERB_MASK,
> SENSOR/NCS at 0). Characterization: the (a) carriers are now OBSERVED at CamX-core depth (no longer G4-dark).

## (d) Runtime probe(s)

- **`tools/frida/probe_aec_hdrdetect.js`** — *THE decisive #1 probe* (doc-47 §"single decisive open
  action"). Hooks `HDRDetectProcess` (`+0x0b4d8c`) to read `enable(+0x48)` and `bgsat(+0xd0)` per frame;
  `FORCE=true` writes `+0x48=1` and re-hooks `HDRTriggerFlagDetection` (`+0x0ed7e4`). Decision: force the
  gate ON → if preview un-freezes, A→B unifies; if `hdr_detected` computes but preview stays frozen, Gate B
  is a separate consumer-path defect (C6/D2/D3, not AEC). **Lever: WORKS** (libaecCustom.so md5 f8fb639d,
  BuildID d0204b3e — offsets valid on-device; attach DURING preview-start, the burst is one-shot).
- **`tools/frida/enable_olog_oemlayer.js`** — flips `camera.oemlayer.v2.so` OLog globals
  (`_ZN4OLog15g_enableLogInfoE` etc., export + GOT fallbacks `0x42dfe8`/`0x42dff8`/`0x42e0e0`) to 1, re-asserts
  every 1s through the cold-config window. Emits vendor-tag resolution / `ConfigureHDRInformation` /
  `InitPackageName` traces. **Lever: FRIDA-ONLY** (lever-index: OEM oemlayer /odm — no setprop). Run via
  `run_gcvt_hook.py camera.provider`.
- **`debug/10_runtime_debug.sh`** — live backtrace (B4 / TEST-PLAN test-3) to capture where APS/preview
  threads sit on a *working* preview (the freeze denominator) and locate the parked frame's release path.

> **G7 caveat — alog SELF-KILLS.** Do NOT arm APS native verbosity (`persist.sys.camera.lao.enable` /
> `oplus.autotest.camera.debug.forcelog` → `/data/vendor/cam_alog/`): the disk I/O trips
> `ERROR_CAMERA_DEVICE` on the marginal HAL (doc-43; lever-index APS row). Self-kill runs are discarded,
> not counted (G-REP). Use the frida native hooks above (`probe_aec_*`, OLog globals) and simpleperf
> (G7-safe) for APS profiling instead. The two probes here are I/O-light and survive the marginal HAL.

## (e) Dodge-vs-dirty diff

Not an E-node — C6 is a control-plane runtime node, A/B is OOS↔LOS and **deferred to the LOS phase**
(G-SYM). The working v16 release cadence was never captured (G4 dark), so the OOS-side denominator is
missing. Note the facilitation cross-link: `camera.oemlayer.v2.so` is shipped by our port (videodehaze
excluded, `f4b50d9`, doc-46) — that packaging decision is audited at **E3** (toggles/config), not here.
The release-bridge environment knob (`decMetaRefZeroToRemove` receiver) is audited at **E2** (/system
frameworks/base edits) and **C2** (`nativeGetOplusHardwareBuffer`, #7).

## (f) Symptom leaves

- **#1 preview freeze (frame-1 stall) — C6 is PROXIMATE-SITE (candidate), edge → /system frameworks/base
  (ROOT, OPEN).** `libAlgoProcess` holds frame 1; `decMetaRefZeroToRemove` upcall never made
  (attribution-matrix #1). Thread state: `APSPreviewManager::previewManagerRoutine+1560` parked in
  `pthread_cond_wait` on its own input semaphore = **input-starved, NOT a DSP/metadata hang** (doc-41 §2).
  AEC-stats forcing was **ruled out** as the cause (attribution-matrix #1, force-test). The root is
  environmental: either the missing JNI release bridge (#7→#1) or upstream consumer starvation — the
  fact-to-resolve in (c) settles which. The blob is innocent.
- **#2 no-JPEG / hdr_detected rc=-2 — C6 is CONSUMER, edge → C5 (SHDR gate, ROOT-A) / E3
  (`camxoverridesettings.txt`).** C6 reads `hdr_detected`; it does not produce or gate it. doc-47
  established that fusion/JPEG run even with `hdr_detected` off (Gate A does not block capture), so C6's
  HDR branch is a downstream effect of the C5/E3 publish, not the #2 root. Do not re-chase GCVT=0 here
  (`customVendorTag 120` present, doc-47 do-not-re-chase).
