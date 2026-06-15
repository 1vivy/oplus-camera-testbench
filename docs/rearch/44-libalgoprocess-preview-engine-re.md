<!-- STATUS: VERIFIED — evidence-anchored RE/capture (doc-50 method).
     Root-attribution note (Pass-C spot-check): UPDATE 5's "This IS the project's metadata-starvation
     root" subheading is a root attribution claim in the body; it is SUPERSEDED by UPDATE 6
     (disambiguation — CloseHandle leak is NOT the image-pool freeze) and UPDATE 8 (FIX #2 refuted
     on-device; the ~19-frame gradual-pool-exhaustion model is REFUTED; freeze is output-starvation).
     The UPDATE 5 subheading has been retitled to mark it superseded inline. No separate Inferences
     section added — UPDATE 8 is the authoritative correction already in the body.
     Guard (interop-tree SCHEMA trunk axiom): a measured stall SITE is never a verified ROOT. -->

# 44 — libAlgoProcess APS preview engine: previewManagerRoutine freeze RE

**worker-2, 2026-06-11. Native RE of `/odm/lib64/libAlgoProcess.so` (BuildID 82fe443b…), Ghidra
project `gbl_root_canoe`. Freeze localized (lead): APS IS the preview renderer; it renders frame 1
then `APSPreviewManager::previewManagerRoutine` parks without the next command ever arriving.**
Offsets: file (image base 0) = Ghidra − 0x100000. frida: `module.base + <file off>`.

---

## The consumer thread: `APSPreviewManager::previewManagerRoutine`
Ghidra `0x2aa694` / **file `0x1aa694`** (symbol `_ZN17APSPreviewManager21previewManagerRoutineEPv`).
Single arg = `this` (the APSPreviewManager). Structure (after a one-time JSON-config preamble):

```
do {
  pthread_mutex_lock(this+0x154);                       // mutex @ this+0x154
  while (*(int*)(this+0x150) == 0)                       // command COUNT @ this+0x150
      pthread_cond_wait(this+0x17c, this+0x154);         // ★ THE PARK ★  cond @ this+0x17c
  *(int*)(this+0x150) -= 1;                              // consume one
  pthread_mutex_unlock(this+0x154);
  cmd = dequeue(this+0x40, 1);                           // command queue @ this+0x40
  switch (cmd->type /* *(int*)cmd */) {
    case 1: bVar7=false;        // STOP  -> falls to cleanup+return (thread EXIT)
    case 2: ... drop/release AlgoPreviewProcessData ...  // flush
    case 3: ... PROCESS a preview frame ...  (the main path, below)
    case 5: ... release held AlgoPreviewProcessData ...
    case 7: process-variant (func_0x7743f0(this, cmd[2], this+0x30))
  }
  free(cmd);
  if (!bVar7) { ...cleanup...; return; }   // only cmd==1 (STOP) exits
} while (true);
```

**cmd 3 (the preview-frame process):**
```
if (this+0x30 != 0) { func_0x774420(this); release(this+0x30 via vtable+8); this+0x30 = 0; }  // free PREVIOUS frame's data
data = malloc(0x3b0); android::AlgoPreviewProcessData::AlgoPreviewProcessData(data);           // new per-frame data (0x3b0 B)
*(data+0x108) = this+0x208;
func_0x7746d8(*(this+0x38), data, 4, 0);   // ★ DISPATCH to the pipeline @ this+0x38 (async) ★
```
i.e. cmd-3 hands the per-frame `AlgoPreviewProcessData` to the pipeline object at `this+0x38`
(`this[7]`, a 0x230-byte pipeline created in the ctor, bound to `pipelineDataCallback` as its result
handler). The result returns ASYNC via `pipelineDataCallback`.

## The freeze mechanism (matches the lead's thread dump)
`previewManagerRoutine` is a pure CONSUMER. After dispatching frame 1 (cmd-3) it loops back and
**parks on `pthread_cond_wait(this+0x17c)` because `*(this+0x150)==0`** — i.e. the command queue is
empty. A new command is only enqueued (count++ + `pthread_cond_signal(this+0x17c)`) when the **app
calls `addPreviewImage` again**, which only happens when the app's `ImageReader.onImageAvailable`
fires, which only happens when **frame 1's INPUT preview Image is released back to the app**. So the
missing step is the **per-frame input-Image release**; if it doesn't happen, the ImageReader exhausts
after frame 1 → `onImageAvailable` stops → no `addPreviewImage` → `previewManagerRoutine` parks
forever. The park IS the input-starve the lead dumped.

⇒ The bug is NOT in `previewManagerRoutine` itself (it correctly waits for work) — it is in the
**result/release path that should return frame 1's input buffer to the app**, which runs in
`pipelineDataCallback` (the async result of the cmd-3 dispatch). Frame 1's OUTPUT renders (lead saw
it), so the pipeline processed + the output callback fired; what's missing is the INPUT-buffer return.

## Architecture (from the ctor `_ZN17APSPreviewManagerC2E…`, Ghidra 0x2a9730 / file 0x1a9730)
- Spawns the routine thread: `pthread_create(this+0x29, 0, previewManagerRoutine, this)`.
- App callbacks stored: `this[0xaa]` = params-callback (`PFvi(vector<params_key_value_t>)`),
  `this[0xab]` = **callback_data callback (`PFvi(vector<callback_data_t>, void*, void*)`) = the OUTPUT
  result/render callback**, two `PFvii` (`void(int,int)`) status callbacks, and a bool.
- `this[0xae] = func_0x771528(param5, "createNode")` — a node-factory pointer resolved at ctor
  (string `0x1c6bda` = `"createNode"`). It worked for frame 1, so it is NOT the NULL pointer; noted
  for completeness (the `gAPSOps.pfn*`-NULL pattern lives elsewhere if present).
- Pipeline object `this[7]` (`this+0x38`, 0x230 B) bound to
  `APSPreviewManager::pipelineDataCallback` (Ghidra 0x2a9dd4 / **file 0x1a9dd4**) as its result
  handler.

## Where to look for the missing input-release (the next RE / the hooks)
The result+release path: cmd-3 dispatch → pipeline (`this+0x38`) → async → **`pipelineDataCallback`**
→ `packPreviewResult` (Ghidra 0x2b6834 / file 0x1b6834) + `notifyCallbackIfNeeded`
(0x2b5e9c / 0x1b5e9c) → the app callbacks (`this[0xab]` output, the `PFvii` status). The input Image
return is one of: `releaseBuffer` (0x2af144 / **0x1af144**), `dropProcessData` (0x2aecd4 /
0x1aecd4), or a callback inside `pipelineDataCallback`/`packPreviewResult`. Candidate root: the
input-buffer-return callback (`this[0xab]` or a `PFvii`) is **not invoked** (or returns without
closing the Java `Image`) on LOS after frame 1 — analogous to the known `gAPSOps.pfnAPSMemHWAcquire`
NULL / `getMetadata rc=-2` plumbing gaps. (Also check per-frame metadata: `previewDecision`
0x2bea2c / 0x1bea2c, `updateMetaInfoForInputData` 0x2b0b5c / 0x1b0b5c, `setRequestMetadata`
0x2b3f04 / 0x1b3f04 — if one reads a vendor-tag/metadata that's rc=-2 on LOS and bails before the
release, that's the gap.)

## EXACT frida-native hooks for the lead (module `libAlgoProcess.so`, base+off)
1. **previewManagerRoutine** `+0x1aa694` — entry. To watch the command loop, hook the dequeue/cmd
   dispatch; simplest: read `this` from x0 at entry, then live-watch `*(int*)(this+0x150)` (queue
   count) and `*(int*)(this+0x208…)`. If count is stuck at 0 after frame 1 → starved waiting for the
   app to enqueue. (cond `this+0x17c`, mutex `this+0x154`, count `this+0x150`, queue `this+0x40`.)
2. **pipelineDataCallback** `+0x1a9dd4` — does it fire for frame 1 (yes, expected) and AGAIN? If it
   fires ONCE then never → the result side completed once but the input wasn't returned. Log its args
   (the `callback_data` vector + the `AlgoPreviewProcessData*`).
3. **packPreviewResult** `+0x1b6834` and **notifyCallbackIfNeeded** `+0x1b5e9c` — the callbacks to
   the app. If the input-return/status callback (`this[0xab]` or a `PFvii`) is NULL or not called,
   this is the gap. Read `this[0xaa]/[0xab]` (offsets `this+0x550/0x558`) to check for NULL.
4. **releaseBuffer** `+0x1af144` / **dropProcessData** `+0x1aecd4` — the buffer-release. Does either
   fire after frame 1? If NEVER → the input Image is never released = the freeze.
5. (metadata gap check) **previewDecision** `+0x1bea2c`, **updateMetaInfoForInputData** `+0x1b0b5c` —
   hook return values; an early-bail / rc=-2 here before release would strand the input.

## Next RE (worker-2, continuing)
- Pin the **enqueue** function (who does `count++ @ this+0x150` + `pthread_cond_signal(this+0x17c)`)
  = the native side of `ApsAdapterInterface.addPreviewImage` — to prove a 2nd command is never posted.
- Trace `pipelineDataCallback` → the exact input-Image-return call (and whether it's gated on a
  metadata rc / a NULL callback). That call (or its absence) is THE fix site.

## Anchors
- `previewManagerRoutine` 0x2aa694/0x1aa694; ctor 0x2a9730/0x1a9730; `pipelineDataCallback`
  0x2a9dd4/0x1a9dd4; `packPreviewResult` 0x2b6834/0x1b6834; `notifyCallbackIfNeeded` 0x2b5e9c/0x1b5e9c;
  `releaseBuffer` 0x2af144/0x1af144; `dropProcessData` 0x2aecd4/0x1aecd4; `getHoldImage` 0x2af4f4/0x1af4f4;
  `previewDecision` 0x2bea2c/0x1bea2c; `sendInputData` 0x2b534c/0x1b534c; `dispatchInputData` 0x2b1ad0/0x1b1ad0;
  `updateMetaInfoForInputData` 0x2b0b5c/0x1b0b5c; `setRequestMetadata` 0x2b3f04/0x1b3f04.
- State offsets in `APSPreviewManager`: count `+0x150`, mutex `+0x154`, cond `+0x17c`, queue `+0x40`,
  current-frame-data `+0x30`, pipeline `+0x38` (`this[7]`), thread `+0x29`, params-cb `+0x550`(`[0xaa]`),
  output-cb `+0x558`(`[0xab]`), createNode-ptr `+0x570`(`[0xae]`).
- cmd types: 1=stop(exit), 2=drop, 3=process(main), 5=release, 7=process-variant.

---

## UPDATE — the input-buffer-RETURN call + its gate (the fix site candidate)

`APSPreviewManager::sendInputData` (Ghidra 0x2b534c / **file 0x1b534c**) contains the per-frame
input-buffer return. Near its completion tail:

```
data = <AlgoPreviewProcessData*>;                 // the frame's process data
if ( *(void**)(data+0x378) != NULL                // data->InitParamters  (set at createProcessData)
     && **(int**)(data+0x378) == 1 ) {            // ★ GATE: InitParamters[0] == 1 ★
    build params_key_value_t vector {...};
    (**(code**)(this+0x550))(8, &params);          // ★ call this[0xaa] = the PARAMS callback, type 8 = RELEASE ★
    *(void**)(data+0x378) = 0;                      // mark returned
}
```

So the **input Image is returned to the app via the params callback `this[0xaa]` (offset
`this+0x550`), invoked with command 8** (release/return-buffer), and **only if
`AlgoPreviewProcessData->InitParamters` (field `+0x378`) is non-null AND its first int == 1**.

⇒ **Prime root candidate:** on LOS, after frame 1, either (a) the params callback `this[0xaa]`
(`this+0x550`) is NULL / mis-bound so the return no-ops, OR (b) the gate fails —
`data+0x378` (`InitParamters`) is NULL or `InitParamters[0] != 1` — so the release call is SKIPPED →
frame 1's input Image is never returned → `onImageAvailable` stops → `previewManagerRoutine` parks.
`InitParamters` is built in `createProcessData` (0x2af584/0x1af584) / the per-frame metadata path; if
LOS leaves `InitParamters[0]` != 1 (a metadata/param it doesn't populate), that's the gate that
strands the buffer — the same "LOS doesn't provide a per-frame input the engine waits on" pattern.

### Pinpoint hooks (frida-native, base+off) — add to the set
- **sendInputData** `+0x1b534c` — hook; on entry read the `AlgoPreviewProcessData*` (param2/x1), then
  read `*(void**)(data+0x378)` and, if non-null, `*(int*)(*(void**)(data+0x378))`. Does the
  `(*this[0x550])(8,…)` release call execute after frame 1? If the gate (`InitParamters[0]==1`) is
  false → THAT is the skip.
- Read **`this[0xaa]` = `*(void**)(this+0x550)`** (params cb) and **`this[0xab]` = `*(void**)(this+0x558)`**
  (output cb) — confirm neither is NULL.
- **createProcessData** `+0x1af584` — where `InitParamters` (`data+0x378`) is built; check what sets
  `InitParamters[0]` and whether a LOS-missing metadata leaves it != 1.

### Fix shape (once confirmed)
- If the callback is NULL/mis-bound → fix the JNI registration (app-side params callback) so the
  release reaches Java `Image.close()`.
- If the gate (`InitParamters[0]!=1`) skips it → either supply the missing per-frame input that makes
  `InitParamters[0]==1`, or (apsfixup-style) force the gate / unconditionally return the input buffer
  for preview so the ImageReader never starves.

---

## CORRECTION/REFINEMENT — `notifyCallbackIfNeeded` is the INIT-params delivery, gate confirmed clean
Decompiled `notifyCallbackIfNeeded(this, APSCmd* cmd)` directly (standalone; the earlier sendInputData
"merge" was a decompiler tail-read). Clean body:
```
data = *(AlgoPreviewProcessData**)(cmd + 8);
if ( data->InitParamters(+0x378) != NULL && *(int*)data->InitParamters == 1 ) {   // GATE confirmed
    params = [ {"pipeline_name" : "pipeline_preview"},
               {"init_parameters" : serialize(data->InitParamters)} ];           // keys read from .rodata
    (**(code**)(this+0x550))(8, &params);     // this[0xaa] params callback, cmd 8
    *(void**)(data+0x378) = 0;                // ONE-SHOT: cleared after sending
}
```
So this is a **one-shot delivery of the preview pipeline's `init_parameters` to the app** (param keys
`"pipeline_name"="pipeline_preview"`, `"init_parameters"=<serialized InitParamters>`), fired the first
time `InitParamters[0]==1` and then cleared. It is **likely the INIT handshake, not the per-frame
input-buffer release** — so do not over-anchor the freeze on this gate alone. (It's still worth
checking: if the app needs this init delivery to keep the preview loop alive and LOS leaves
`InitParamters[0]!=1`, it would stall — but that's unconfirmed.)

### So the per-frame INPUT-buffer release is still in the result path — pin it with the hooks
The frame-1-renders-then-starves symptom means frame 1's INPUT Image isn't returned. The return is in
the async result path (`pipelineDataCallback` → `packPreviewResult` / the OUTPUT callback `this[0xab]`
(`this+0x558`) / `releaseBuffer` / `dropProcessData`), NOT necessarily in `notifyCallbackIfNeeded`.
**The on-device hooks (does `releaseBuffer`/`dropProcessData` fire after frame 1? does
`pipelineDataCallback` fire again? is `this[0xab]` NULL?) are the definitive pinpoint** — static RE of
the 50 KB `pipelineDataCallback` is lower-value than letting the hooks show which call is missing.

### Confirmed-clean facts (for the writeup)
- Park: `previewManagerRoutine` `+0x1aa694`, `pthread_cond_wait(this+0x17c, this+0x154)` while
  `*(int*)(this+0x150)==0`. cmd-3 dispatches a frame to pipeline `this+0x38`; result async via
  `pipelineDataCallback` `+0x1a9dd4`.
- Callbacks: `this[0xaa]`=`this+0x550` (params cb, gets cmd 8 = init_parameters delivery),
  `this[0xab]`=`this+0x558` (callback_data/OUTPUT cb).
- `notifyCallbackIfNeeded` `+0x1b5e9c`: one-shot `init_parameters` (`pipeline_preview`) delivery, gated
  `data->InitParamters[0]==1` (`data+0x378`).
- Open: the exact per-frame input-Image-return call (result path) — resolve via the on-device hooks.

---

## UPDATE 2 — the ALOG preview-decision config failures: GRACEFUL, likely a parallel red herring (RE'd)

Lead's ALOG (forcelog) shows the native preview-decision (`ApsPreviewDecisionByJsonTree`, in
**libAlgoInterface.so** — NOT libAlgoProcess) failing per-frame param/valueRange lookups. RE'd the
failure handling:

### (a) The valueRange parser is NON-BLOCKING
`PreviewDecisionLevel::updateIntValRangeByJsonObj` (libAlgoInterface Ghidra `0x17284f8`;
`ApsPreviewDecisionByJsonTree.cpp:274`): when the `min`/`max` valueRange key is missing or wrong-type,
it **logs the `"please check valueRange exist"` warning and returns 1 (success), leaving the int
range default/empty** — it does NOT block, abort, or error-propagate. So the `:274` valueRange
failures are **graceful degradation**: the decision proceeds with empty ranges. They are loud but, on
their own, do NOT stall `previewManagerRoutine`. ⇒ likely a **parallel red herring** for the freeze
(the input-release-skip is in libAlgoProcess's result path; a graceful decision-parse warning doesn't
skip the release).

CAVEAT: a decision running with empty value-ranges + missing per-frame metadata (the `:147`
"can't find param: rawValue, sensorName, fwkLuxIdx, currentdrcGain, currentdarkBoostGain" — the
**same AEC-stats `getMetadata rc=-2` family** as the long-documented `hdr_detected`/`stats_control`
root) could produce a malformed decision RESULT. The freeze would only follow IF libAlgoProcess's
result handler **skips the input-release on a decision-error/incomplete result** (a robustness bug) —
that's the link to verify, not the parse-warning itself.

### (b) Config source
The valueRange/params come from **`/odm/etc/camera/config/oplus_camera_aps_config`** — **present but
ENCRYPTED** (52344 B, header `01 01 78 f9 …`, not plaintext). The ALOG's
`getJsonObjFromRUSPath '/data/user/0/com.oplus.camera/files/odm/etc/camera/config/oplus_camera_aps_config'
FAILED` is the **RUS OVERRIDE** path (the per-user update copy) — its absence is **normal** on a fresh
build (no RUS update pushed). The open question: does the decision load the **base `/odm` config**
(which has the params) or **only** the RUS `/data` override? If it reads only the RUS path, then with
no RUS push the entire `aps_config` is missing → every param fails (would explain the wholesale
valueRange/param failures). If it reads base + RUS-override, the base should supply them unless the
base **decrypt/parse fails on LOS**. (`ApsPreviewDecision::apsSeneorJsondataParse`/`apsResultDataParse`
0x16b0ce4/0x16bdfcc are the parse entries to check decrypt success.)

### (c) `/data/system/camera_rus` mkdir Permission denied
`APSFileStorage.cpp:1110 mkdir /data/system/camera_rus FAILED Permission denied` — a **sepolicy gap**
(no `camera_rus`/`/data/system/camera_rus` file_context in the infiniti sepolicy; grep empty). This is
the **write side** (the engine caching/storing a RUS config), not the read of the base config. So it
is unlikely the read-side freeze cause, but it IS a real sepolicy gap to close for RUS config storage.

### DISCRIMINATING on-device test (fastest)
The valueRange parse being graceful means the config failures might be benign noise. To settle it:
**make the config load cleanly** — push a valid `oplus_camera_aps_config` to the RUS path
`/data/user/0/com.oplus.camera/files/odm/etc/camera/config/` (or fix the base-config load), reboot,
re-check the ALOG for the param failures AND whether preview unfreezes.
- Unfreezes → config IS causal (the decision needs real params; a malformed decision skips the
  release downstream) → fix = supply the config / fix base-config load + the camera_rus sepolicy.
- Still frozen → config is a RED HERRING → the freeze is the libAlgoProcess result-handler
  skipping the input-release (the `releaseBuffer`/`dropProcessData`/`this[0xab]` path from §44 hooks).
Either way the §44 hooks (does `releaseBuffer` fire after frame 1?) remain the definitive locator.

Symbols (libAlgoInterface.so, file off = Ghidra − 0x100000): `updateIntValRangeByJsonObj` 0x17284f8/
0x16284f8; `ApsPreviewDecision::handlerPreviewMetaArrived` 0x16abb10/0x15abb10; `apsPreviewMetadataParse`
0x16b1244/0x15b1244; `apsSeneorJsondataParse` 0x16b0ce4/0x15b0ce4; `apsResultDataParse` 0x16bdfcc/0x15bdfcc;
`ApsPreviewDecisionFactory::createClient` 0x16a03fc/0x15a03fc.

---

## UPDATE 3 — pipelineDataCallback does NOT skip result delivery on an error/empty result (theory REFUTED)

Traced the full control flow of `APSPreviewManager::pipelineDataCallback` (Ghidra 0x2a9dd4 /
file 0x1a9dd4). Real body = lines spanning the result decode → the output callback → return (the
decompiler tail-merged `previewManagerRoutine` after it; ignore that part). Structure:

```
ulong pipelineDataCallback(int resultType=p1, vector<callback_data_t>& cb=p2, void* ctx=p3,
                           AlgoPreviewProcessData* data=p4, APSPreviewManager* this=p5) {
  if (this != NULL) {                                  // (A) line 143
    if (cb.end != cb.begin /* cb NON-EMPTY */) {       // (B) line 146
        status = cb[0].field@0x480;
        if (resultType==1) { ...copy params / update this state (0x4b8..0x520, frame counter 0x58c)... }
        else if (resultType==2 && status<4 && ctx@0x10==2) { ...same...}
    }                                                  // (B) ends line 477  — ONLY the inner PROCESSING is gated on non-empty
    // ↓ ALWAYS REACHED when this!=0 (NOT inside the cb-non-empty if):
    (**(code**)(this+0x558))(statusByte, cb, ctx, &outVec);   // ★ OUTPUT callback this[0xab] — UNCONDITIONAL ★ (line 481)
    ...free outVec...
  }
  return ret;                                          // line 506
}
```

**Answer to the lead's question: NO.** The output/result-delivery callback `this[0xab]` (`this+0x558`)
is called **unconditionally** whenever `this != NULL` — it is NOT inside the `cb-non-empty` (B) guard
and there is **no error/early-return that bypasses it**. An empty or malformed result only skips the
inner state-update (B); the engine **still delivers the result to the app** via `this[0xab]` with a
`statusByte` (1, or 2 when `status==2`, etc.). So the **"the native result-handler skips the input
release on a decision-error result" theory is REFUTED** — there is no such branch in
`pipelineDataCallback`.

### What this implies for the freeze (redirect)
Since the native engine ALWAYS calls the output callback (and frame 1 DID render → the callback fired
with a renderable result), the input-release-skip is NOT a native result-handler early-return. It is
one of:
1. **App-side (OCS SDK) handling of the result `statusByte`**: `this[0xab]` is the app's
   `callback_data` callback (the OCS `ConsumerImpl`/`ApsProcessor` result handler). If it
   renders-but-does-not-close the input Image when the status signals error/incomplete (the malformed
   decision result from the missing AEC-stats metadata), the input is stranded — but that's a Java/OCS
   decision keyed on the native `statusByte`, not a native skip.
2. **One-frame-deep input hold + ImageReader depth**: the input `AlgoPreviewProcessData` is held at
   `this+0x30` and only freed when the NEXT command's cmd-3 runs (`previewManagerRoutine`: "if
   this+0x30 != 0: release; this+0x30 = new"). If the app's ImageReader is shallow (maxImages small),
   holding frame 1's input one frame deep while frame 2 never gets enqueued = immediate starve.

### Net for the lead
- The freeze is NOT a native `pipelineDataCallback` error-branch that bypasses the release (refuted) —
  so an "apsfixup force the native release" patch in `pipelineDataCallback` has no skipped call to force.
- The decision-config failures (UPDATE 2) feed a **status/result** the app receives via `this[0xab]`;
  the release decision is then **app-side** (the OCS `callback_data` handler keyed on `statusByte`), or
  it's the one-frame-deep hold. Highest-value next: (i) read the `statusByte` (pbVar16) the engine
  passes at line 481 for frame 1 (frida-hook `pipelineDataCallback +0x1a9dd4`, log arg0/x0) — is it an
  error code? (ii) re-examine the OCS `callback_data` handler (ApsResult/ConsumerImpl) for "render but
  skip Image.close() on error-status". (iii) confirm the preview ImageReader `maxImages` depth.

---

## UPDATE 4 — maxImages=20 (one-frame-hold REFUTED) → SINGLE-SHOT stop → config failures reconnect; statusByte arg confirmed

### (iii) Preview ImageReader maxImages = 20 (default) — the one-frame-hold theory is REFUTED
`com.oplus.ocs.camera.producer.mode.BaseMode.getPreviewImageReaderMaxImages` (SDK jar):
```
maxImages = CameraConfigHelper.getConfigValue(KEY_PREVIEW_MAX_IMAGES, /*default*/ 20)
```
The APS preview ImageReader is created (`SurfacePool.createImageReader` → `ImageReader.newInstance(w,h,fmt,maxImages,usage)`)
with **maxImages defaulting to 20**. So holding frame 1's input one frame deep (`this+0x30`, freed on
the next cmd-3) would take ~20 frames to exhaust — it does NOT starve on frame 1. ⇒ **Candidate #2
(shallow ImageReader / one-frame-deep hold) is REFUTED.**

### Synthesis: the freeze is a SINGLE-SHOT stop after frame 1
maxImages=20 + "previewManagerRoutine starved with only ~1 command ever enqueued" + "frame 1 renders
then frozen" ⇒ the app submits **exactly one** preview frame and then STOPS — a single-shot halt, NOT
gradual buffer exhaustion. A single-shot stop right after frame 1's RESULT is delivered points at the
**OCS result handler hitting an error/halt while processing frame 1's result** (which then stops the
preview submit loop), NOT a buffer-depth issue.

⇒ This **reconnects the decision-config failures** (UPDATE 2). They are non-blocking *natively* (the
valueRange parser returns success), BUT a preview decision built from the **missing AEC-stats
per-frame metadata** (`:147` `rawValue`/`sensorName`/`fwkLuxIdx`/`currentdrcGain` — the
`getMetadata rc=-2` family) produces a **malformed/incomplete result**. The native engine delivers
that result UNCONDITIONALLY (UPDATE 3) with a `statusByte`; if the **OCS Java result handler errors
or takes a "don't continue" branch** on that malformed result/status, it stops re-submitting →
`previewManagerRoutine` starves. So UPDATE 2's "pure red herring" was too strong — the config
failures don't block natively, but they shape the result the OCS handler chokes on. (Net: provide the
config so the decision result is well-formed, OR make the OCS handler robust / force the status.)

### (ii) The OCS result-handler close path — partially blocked by R8 desugaring
The input Image, when APS is ON, is owned by APS (app does NOT close in `ApsProcessor.addPreview`'s
APS branch — `addPreview` only calls `Image.close()` on the bypass/`isPreviewNotSendAps` path,
matching the lead's black-screen test). When APS is on, the per-frame close happens in the **result
listener** `com.oplus.ocs.camera.consumer.ApsProcessor$ApsServiceListener` — which is **R8
lambda-desugared** (`$$ExternalSyntheticLambda0..7`), so the exact close-vs-`statusByte` branch is
not cleanly statically resolvable from the dex. The `Image.close()` sites are: `ApsProcessor.addPreview`
(bypass), `ConsumerImpl$7.onImageAvailable`, `Util.dealWithImageOverflow`, `ApsProcessor.addPreviewMeta`.
⇒ Whether the result-listener gates the input close on `statusByte` is the open question best settled
by the runtime `statusByte` hook (below), not static R8-lambda tracing.

### statusByte arg confirmed (for the apsfixup fix)
At the native `this[0xab]` call (`pipelineDataCallback` line 481):
`(**(code**)(this+0x558))(statusByte, callback_data_vec, ctx, &outVec)`.
**`statusByte` = arg0 = AArch64 `w0`/`x0`** (passed as a small int; observed values
`{resultType, 1, 2}`). So an apsfixup-style interpose on the `this[0xab]` call could force `w0` to the
success value — IF (ii) confirms the OCS listener skips the input close on a non-success `statusByte`.
The target is the `this[0xab]` function pointer (`this+0x558`), set at ctor from the APSPreviewManager
constructor's `param_3` (the OCS APS-client native callback).

### Decisive next step (the lead, on-device — native frida OK)
Hook `pipelineDataCallback` (`libAlgoProcess.so +0x1a9dd4`) and log **arg0 (`x0`) = the `statusByte`**
the engine passes for frame 1's result (and the AlgoPreviewProcessData arg4). If `statusByte` is a
non-success value AND the OCS listener then skips the input close → force `w0`→success at the
`this[0xab]` call. If `statusByte` is already "success" for frame 1 → the OCS handler halts for another
reason (the malformed callback_data content, not the status) → fix at the OCS result handler /
the config. Either branch is now a small, targeted fix at the native/OCS boundary.

---

## UPDATE 5 — the status-gated skip FOUND (Java side): onPreviewReceived `if (mMetadata==null) skip CloseHandle decref` → refcount leak ↔ the AEC-stats metadata root

Cracked the OCS result path (the `this[0xab]` → binder service → Java chain). The APS result arrives at
`ApsProcessor$ApsServiceListener.onPreviewReceived(ApsResult result, ApsTotalResult total)` (SDK jar).
Its body opens with **`if (result.mMetadata == null) goto 0x1a0`** (`mMetadata` = the result's
`TotalCaptureResult`):

```
onPreviewReceived(ApsResult r, ApsTotalResult t) {
  if (r.mMetadata == null) goto L_0x1a0;           // ★ SKIP the close-handle block on null result-metadata ★
  // 0x04..0x19e: OplusCaptureResult CloseHandle refcount management —
  //   mPreviewCaptureResultHandles.get(frameKey); CloseHandle.isValid/getOPlusCaptureResult;
  //   OplusCaptureResult.addResultRefCount / CloseHandle.close(...)   ← the per-frame DECREF/close
L_0x1a0:
  mConsumerContract.onPreviewReceived(r, t);       // ALWAYS forwards to ConsumerImpl (render + input handling)
}
```

**This is the status-gated skip the lead predicted** — gated on `result.mMetadata == null` (not a
statusByte int). Per frame, `addPreviewMeta` **increfs** the `OplusCaptureResult`
(`addResultRefCount` → a `CloseHandle` in `mPreviewCaptureResultHandles`); `onPreviewReceived`
**decrefs/closes** it — but **SKIPS that decref when `mMetadata == null`**. So a preview result with
**null `mMetadata`** → the per-frame `CloseHandle` is never closed → the `OplusCaptureResult` handles
(and whatever buffer/result they pin) **LEAK and accumulate** → the bounded pool (maxImages 20 / the
result-handle cache) exhausts at ~frame 19-20 → `onImageAvailable` stops → `previewManagerRoutine`
starves. **This matches the ~19-frame timing exactly.**

### This WAS the attributed metadata-starvation root (SUPERSEDED by UPDATE 6 + UPDATE 8 — see below)
`result.mMetadata == null` happens when the native APS decision **can't attach a valid
`TotalCaptureResult`** — which is precisely the long-documented **missing AEC-stats / `getMetadata
rc=-2`** condition (the `:147` `rawValue`/`sensorName`/`fwkLuxIdx`/`currentdrcGain` failures from
UPDATE 2; the `hdr_detected`/`stats_control` family). So the SAME provider-side metadata gap that's
been the project's central thread → null `mMetadata` on the preview result → the `onPreviewReceived`
skip → the refcount leak → the freeze. Config failures (UPDATE 2) are in the chain after all (they
null the result metadata), confirming the UPDATE-4 reconnection.

### Confirm + fix (statically-derived; runtime confirm is one read)
- **Confirm (on-device, any layer):** is `ApsResult.mMetadata == null` for the frozen preview's
  results? (frida-hook `ApsProcessor$ApsServiceListener.onPreviewReceived`, read arg0's `mMetadata`
  field — Java hook is fine here since it's the consumer thread, not the native ART-GC hot path; or
  hook native and read the binder payload.) If null → confirmed.
- **Fix shapes:**
  1. **Root**: publish the AEC-stats vendor tags the native decision needs so it builds a valid
     `TotalCaptureResult` (the provider/CamX metadata work — the project's standing root) → `mMetadata`
     non-null → decref runs → no leak.
  2. **App-boundary (smali, like the other OCS patches)**: in
     `ApsProcessor$ApsServiceListener.onPreviewReceived`, **don't skip the `CloseHandle` decref when
     `mMetadata == null`** — i.e. remove/relax the `if (mMetadata==null) goto 0x1a0` so the per-frame
     handle is always closed (or close it on the null path before forwarding). This is a self-contained
     smali fix at the same layer as the existing `extract-files.py` OCS patches — no native interpose
     needed. (Mirror the close-handle decref from the non-null path onto the null path.)
  3. **Native (apsfixup)**: force the decision to attach a non-null metadata / a benign default so
     `mMetadata != null` — harder; prefer (2).

### Anchors
- `ApsProcessor$ApsServiceListener.onPreviewReceived` (SDK jar `com.oplus.camera.unit.sdk.jar`): the
  `if (mMetadata==null) goto 0x1a0` gate at method offset ~0x02; the skipped CloseHandle block
  0x04..0x19e (`OplusCaptureResult.addResultRefCount`/`$CloseHandle.close`/`mPreviewCaptureResultHandles`);
  forward to `ConsumerImpl.onPreviewReceived` at 0x1a0.
- Incref side: `ApsProcessor.addPreviewMeta` (`OplusCaptureResult.addResultRefCount` +
  `mPreviewCaptureResultHandles`).
- `ConsumerImpl.onPreviewReceived` (the forwarded consumer handler) is large/branchy — the proper
  input-Image release lives there too, conditionally; the refcount-leak above is the cleaner,
  statically-pinned mechanism that matches the 20-pool/~19-frame timing.

---

## UPDATE 6 — DISAMBIGUATION: TWO leaks from the same root; the IMAGE-pool freeze = the native decMetaRef upcall skip (not the Java mMetadata gate)

Mapped the full `APSClient$MetaImageRefCounter` (Java inner class) image-refcount API + the
`ConsumerImpl.onPreviewReceived` gating. Result: the lead's two candidate resources are GENUINELY
DISTINCT, and the IMAGE-pool freeze is the native-upcall path, not the Java `mMetadata==null` skip.

### The image refcount API (Java, `APSClient$MetaImageRefCounter`)
- Fields: `metaBufferMap` (the per-image ref map), `TYPE_APS_PREVIEW`, `MAX_REF_LEN`,
  `MAX_REF_CNT_WITH_VIDEO_IMAGE`, `mCntWithVideoImage`.
- **`setMetaImageRef`** = INCREF (per submitted preview frame → into `metaBufferMap`).
- **`decMetaRefZeroToRemove(JII)V`** = DECREF, and `Image.close()` when the ref hits 0.
- Java callers of `decMetaRefZeroToRemove` are **VIDEO/flush only**:
  `checkToRemoveVideoImageRefOnLastFrame`, `flushImage`, `removeVideoImageRefBefore`. **None is the
  per-frame PREVIEW decref.** ⇒ for preview, `decMetaRefZeroToRemove` is the **native JNI upcall** the
  lead identified — and it's invoked via a **cached `jmethodID`** (passed from Java at init), which is
  why the string `decMetaRefZeroToRemove` appears in **no** native lib (grepped the whole dump). So the
  native call-site can't be found by string; it's a `CallVoidMethod(env, obj, cachedMid, …)` in
  libAlgoProcess's preview-completion path.

### The two leaks (both rooted in `r.mMetadata==null` / missing AEC-stats), distinct resources
| leak | resource | gate | where | fix |
|---|---|---|---|---|
| **CloseHandle / metadata** | `OplusCaptureResult` handles (`mPreviewCaptureResultHandles`) | **Java**: `ApsServiceListener.onPreviewReceived` `if (r.mMetadata==null) goto 0x1a0` skips the per-frame `CloseHandle.close()` decref | SDK smali | **smali**: on the null path, still close `mLastPreviewCaptureResultCloseHandle` (the lead's read) |
| **IMAGE pool (THE FREEZE)** | the 20 preview `Image`s (`metaBufferMap` / ImageReader) | **NATIVE**: the per-preview `decMetaRefZeroToRemove` JNI upcall is SKIPPED when the decision result is incomplete/error (missing AEC-stats) → `setMetaImageRef` keeps increfing, the decref never fires → `metaBufferMap` accumulates → 20-pool exhausts at ~frame 19 | libAlgoProcess preview-completion (cached-mid `CallVoidMethod`) | **native (apsfixup) force the decref upcall**, or **root** = publish AEC-stats so the decision completes |

`ConsumerImpl.onPreviewReceived` (the forward target) handles `mRefHardwareBuffer`/`setImageReader`/
`getImageBuffer` and gates on **`mPreviewErrorCode`/`mFrameworkErrorCode`** — **NOT on `r.mMetadata`**.
So the image release there is NOT skipped by the `mMetadata==null` check; the image return is driven by
the native `decMetaRefZeroToRemove` upcall (gated natively on the decision result). ⇒ **The smali
`onPreviewReceived` fix (UPDATE 5) addresses the CloseHandle/metadata leak — a PARALLEL leak — NOT the
image-pool freeze.** The image freeze needs the native upcall to fire.

### DECISIVE on-device test (settles which leak is the freeze, frida-Java OK)
Hook the Java `APSClient$MetaImageRefCounter.setMetaImageRef` (incref) AND `decMetaRefZeroToRemove`
(decref) during the freeze:
- If `setMetaImageRef` keeps firing (~20 frames) while `decMetaRefZeroToRemove` STOPS (or never fires
  for preview) → the native decref upcall is being skipped → `metaBufferMap` grows to MAX → **IMAGE-pool
  starve = the freeze.** (Confirms the native-gate path.)
- Read `metaBufferMap.size()` climbing toward `MAX_REF_LEN` over ~19 frames = the smoking gun.

### Fix target for the FREEZE
The image freeze is the native side skipping the per-preview `decMetaRefZeroToRemove` upcall on an
incomplete decision result. Fix candidates:
1. **Root**: publish the AEC-stats vendor tags (the standing provider/CamX metadata work) → decision
   completes → native makes the decref upcall → `metaBufferMap` drains → preview flows.
2. **apsfixup (native)**: force the per-preview decref upcall to ALWAYS fire (interpose the
   preview-completion path so it releases the input regardless of decision status). This is the
   "doesn't need provider-side plumbing" candidate — but the call-site is a cached-`jmethodID`
   `CallVoidMethod` in libAlgoProcess's preview-completion, found via the JNI-init that caches the mid
   (next RE step, if pursued) rather than by string.
3. **Java safety-net (smali)**: in `MetaImageRefCounter`, when `metaBufferMap` exceeds a threshold
   (or on the result path), force-`decMetaRefZeroToRemove` the oldest preview refs — a self-contained
   overflow drain at the SDK layer (mirrors `Util.dealWithImageOverflow`). Lowest-risk app-side fix.

⇒ Both leaks share the root `r.mMetadata==null` = missing AEC-stats. The CloseHandle leak is
smali-fixable (UPDATE 5); the IMAGE freeze is the native decref-upcall skip — fix via root metadata,
native apsfixup force, or a Java overflow-drain safety-net.

---

## UPDATE 7 — FIX #2 PINNED: the `metaBufferMap` overflow-drain (copy-paste smali + extract-files.py)

Full structure RE done on `com.oplus.camera.unit.sdk.jar` (`/tmp/vt/sdk.dd` dexdump). The leak
container, the per-frame PUT site, the decref mechanism, and the exact insertion point are all pinned.
**This is the ready-to-apply patch.**

### A. Corrected model (one prior assumption fixed)

`MAX_REF_LEN = 6` is **NOT** a map-size cap — it is the **length of the per-image `int[6]` refcount
array** (one slot per pipeline role). Confirmed from `<clinit>`/ctor + `initMetaMap`:

- `metaBufferMap : LinkedHashMap<Image, int[6]>` (insertion-ordered → **oldest first**), guarded by
  `metaBufferMapLock : Object`. Static slot indices into the `int[6]`:
  `TYPE_APS_PREVIEW=0`, `TYPE_APS_VIDEO=1`, `TYPE_APS_ASD=2`, `TYPE_APP=4` (`MAX_REF_LEN=6`,
  `MAX_REF_CNT_WITH_VIDEO_IMAGE=35`).
- **PUT (per preview frame):** `APSClient.addPreviewFrameBuffToAPS(ApsPreviewParam, ApsWatermarkParam)I`
  calls `mMetaImageRefCounter.initMetaMap(param)` **FIRST** (registers the Image: `metaBufferMap.put(image, int[6])`
  with `[0]=1` preview-ref, `[4]=1` app-ref), THEN hands the buffer to the native engine via
  `APSClientWrapper.addPreviewFrameBuff`.
- **DECREF (native upcall):** the engine, on a completed decision, upcalls
  `decMetaRefZeroToRemove(timestamp, type, limit)` → decrements `int[type]`; when the whole `int[6]`
  is zero it does `Image.close()` + `metaBufferMap.remove`/`iterator.remove` (this returns the buffer
  to the ImageReader BufferQueue). `setMetaImageRef(Object,String,Z)Z` is the inc/dec-by-pipeline
  variant with the same close-at-zero tail (insns `00e8`: `Image.close()`+`remove`).

**The size cap that drives the freeze is the preview ImageReader `maxImages = 20`, NOT `MAX_REF_LEN`.**
On LOS the decision never completes → `decMetaRefZeroToRemove` never fires for preview → `metaBufferMap`
grows one entry/frame, each holding an **acquired, never-closed** preview Image → the 20-deep pool
exhausts at ~frame 19 → `onImageAvailable` stops → native `previewManagerRoutine` parks. **★ root of
the freeze, now closed end-to-end.**

> **Why the existing `Util.dealWithImageOverflow` does NOT save it:** that drain (called from
> `ConsumerImpl.onPreviewImageArrived` with `reader.getMaxImages()`=20) reflects the ImageReader's
> **`mAcquiredImages`** list — the *display* path. The frozen images are held in **`metaBufferMap`**
> (a different container the APS engine owns); `dealWithImageOverflow` is blind to them. Hence fix #2
> drains `metaBufferMap` directly, mirroring that proven pattern.

### B. The patch — a private drain method + a one-line prologue call in `initMetaMap`

Drain the **oldest** `metaBufferMap` entries (LinkedHashMap iteration order) whenever the map reaches a
high-water mark **below** the 20 pool limit, closing the Image (returns the dequeued slot) and removing
it. Runs once per preview frame at the top of `initMetaMap`, under the same `metaBufferMapLock`.

**Threshold = `0x10` (16):** in a HEALTHY build the engine decrefs each frame so `metaBufferMap.size()`
stays low (~2–4) → the `if-lt` guard is never taken → **zero behavioral change**. In the FROZEN build
size climbs → at 16 the drain recycles the oldest → preview keeps flowing with a 4-buffer margin below
the hard pool limit (20). This makes the drain **both the fix and the test**: if preview un-freezes, the
metaBufferMap-starve model is proven on-device.

**UAF-safety (confirmed safe by codebase precedent + gralloc refcounting):**
1. `Image.close()` only releases the **Java-side dequeued slot** back to the ImageReader BufferQueue.
   The underlying gralloc `GraphicBuffer` is independently refcounted; if the native APS engine still
   holds it (via its own `AHardwareBuffer_acquire`), the buffer stays valid — close does not free it
   under the engine.
2. The SDK already force-closes acquired Images out from under in-flight processing in
   **`Util.dealWithImageOverflow`** (and `setMetaImageRef` insns `00e8`) — same pattern, same risk
   profile, shipped by OPlus. We only target the **oldest** entries (the ones the frozen engine has
   demonstrably abandoned — no decref is coming).
3. A later native `decMetaRefZeroToRemove` for an already-drained timestamp is a no-op: it iterates
   only live entries and its `catch` logs "already closed, continue".

#### B.1 New method (append verbatim to `APSClient$MetaImageRefCounter.smali`)

```smali
.method private drainMetaBufferOverflow()V
    .locals 5

    iget-object v0, p0, Lcom/oplus/ocs/camera/consumer/apsAdapter/APSClient$MetaImageRefCounter;->metaBufferMapLock:Ljava/lang/Object;

    monitor-enter v0

    :try_start_0
    iget-object v1, p0, Lcom/oplus/ocs/camera/consumer/apsAdapter/APSClient$MetaImageRefCounter;->metaBufferMap:Ljava/util/LinkedHashMap;

    if-nez v1, :cond_loop

    monitor-exit v0

    return-void

    :cond_loop
    iget-object v1, p0, Lcom/oplus/ocs/camera/consumer/apsAdapter/APSClient$MetaImageRefCounter;->metaBufferMap:Ljava/util/LinkedHashMap;

    invoke-virtual {v1}, Ljava/util/LinkedHashMap;->size()I

    move-result v1

    const/16 v2, 0x10

    if-lt v1, v2, :cond_done

    iget-object v1, p0, Lcom/oplus/ocs/camera/consumer/apsAdapter/APSClient$MetaImageRefCounter;->metaBufferMap:Ljava/util/LinkedHashMap;

    invoke-virtual {v1}, Ljava/util/LinkedHashMap;->entrySet()Ljava/util/Set;

    move-result-object v1

    invoke-interface {v1}, Ljava/util/Set;->iterator()Ljava/util/Iterator;

    move-result-object v1

    invoke-interface {v1}, Ljava/util/Iterator;->hasNext()Z

    move-result v2

    if-eqz v2, :cond_done

    invoke-interface {v1}, Ljava/util/Iterator;->next()Ljava/lang/Object;

    move-result-object v2

    check-cast v2, Ljava/util/Map$Entry;

    invoke-interface {v2}, Ljava/util/Map$Entry;->getKey()Ljava/lang/Object;

    move-result-object v2

    check-cast v2, Landroid/media/Image;

    if-eqz v2, :cond_remove

    invoke-virtual {v2}, Landroid/media/Image;->close()V

    :cond_remove
    invoke-interface {v1}, Ljava/util/Iterator;->remove()V

    goto :cond_loop

    :cond_done
    monitor-exit v0
    :try_end_0
    .catchall {:try_start_0 .. :try_end_0} :catchall_0

    return-void

    :catchall_0
    move-exception v1

    monitor-exit v0

    return-void
.end method
```

Notes: `:catchall_0` **swallows** (exits the monitor and returns) so a stray `IllegalStateException`
from a racing close can never propagate into the preview frame path. `invoke-direct {p0}` (next step)
calls it as a private method — no extra registers needed.

#### B.2 Inject the prologue call into `initMetaMap`

`initMetaMap` smali header (verified against real baksmali output of the built
`com.oplus.camera.unit.sdk.jar`) is `.method public initMetaMap(Lcom/oplus/ocs/camera/consumer/apsAdapter/adapter/ApsPreviewParam;)Z`
followed by **`.registers 12`** (baksmali emits `.registers`, not `.locals`; `ins=2` → `p0=v10`,
`p1=v11`). Insert the drain call immediately after the `.registers` line — `invoke-direct {p0}` uses
only the existing `p0`, so the register count need not change:

```smali
.method public initMetaMap(Lcom/oplus/ocs/camera/consumer/apsAdapter/adapter/ApsPreviewParam;)Z
    .registers 12                                   # <-- unchanged

    invoke-direct {p0}, Lcom/oplus/ocs/camera/consumer/apsAdapter/APSClient$MetaImageRefCounter;->drainMetaBufferOverflow()V   # <-- INJECTED

    # ... original body unchanged ...
.end method
```

### C. extract-files.py blob_fixup (same form as the other smali patches)

Add this fixup and chain it on the `com.oplus.camera.unit.sdk.jar` entry **after**
`blob_fixup_apktool_unpack_src` and **before** the pack step. It is idempotent (guards on a sentinel
label) and anchors on class/field/method **shape**, not R8 names (there are none here — these are
real OPlus class names), so it survives re-bakes.

```python
def blob_fixup_oplus_camera_aps_metabuffer_drain(ctx, file, file_path, *args, tmp_dir=None, **kwargs):
    # FREEZE FIX #2 (doc 44 UPDATE 7): bound APSClient$MetaImageRefCounter.metaBufferMap so a stalled
    # native APS decision (missing AEC-stats -> decMetaRefZeroToRemove never upcalled for preview)
    # cannot leak the 20-deep preview ImageReader to exhaustion (the v19 ~frame-19 freeze). Drain the
    # OLDEST metaBufferMap entries (LinkedHashMap = insertion order) when size >= 16, closing the Image
    # (returns the dequeued slot to the BufferQueue) + removing it. In a healthy build size stays low
    # so the guard never fires (no behavioral change). Mirrors Util.dealWithImageOverflow (same
    # force-close-acquired-Image pattern the SDK already ships). Idempotent (sentinel :aps_drain_done).
    if tmp_dir is None:
        return

    CLASS = 'Lcom/oplus/ocs/camera/consumer/apsAdapter/APSClient$MetaImageRefCounter;'
    SENTINEL = 'drainMetaBufferOverflow'
    DRAIN_METHOD = (
        '.method private drainMetaBufferOverflow()V\n'
        '    .locals 5\n\n'
        f'    iget-object v0, p0, {CLASS}->metaBufferMapLock:Ljava/lang/Object;\n\n'
        '    monitor-enter v0\n\n'
        '    :try_start_0\n'
        f'    iget-object v1, p0, {CLASS}->metaBufferMap:Ljava/util/LinkedHashMap;\n\n'
        '    if-nez v1, :cond_loop\n\n'
        '    monitor-exit v0\n\n'
        '    return-void\n\n'
        '    :cond_loop\n'
        f'    iget-object v1, p0, {CLASS}->metaBufferMap:Ljava/util/LinkedHashMap;\n\n'
        '    invoke-virtual {v1}, Ljava/util/LinkedHashMap;->size()I\n\n'
        '    move-result v1\n\n'
        '    const/16 v2, 0x10\n\n'
        '    if-lt v1, v2, :cond_done\n\n'
        f'    iget-object v1, p0, {CLASS}->metaBufferMap:Ljava/util/LinkedHashMap;\n\n'
        '    invoke-virtual {v1}, Ljava/util/LinkedHashMap;->entrySet()Ljava/util/Set;\n\n'
        '    move-result-object v1\n\n'
        '    invoke-interface {v1}, Ljava/util/Set;->iterator()Ljava/util/Iterator;\n\n'
        '    move-result-object v1\n\n'
        '    invoke-interface {v1}, Ljava/util/Iterator;->hasNext()Z\n\n'
        '    move-result v2\n\n'
        '    if-eqz v2, :cond_done\n\n'
        '    invoke-interface {v1}, Ljava/util/Iterator;->next()Ljava/lang/Object;\n\n'
        '    move-result-object v2\n\n'
        '    check-cast v2, Ljava/util/Map$Entry;\n\n'
        '    invoke-interface {v2}, Ljava/util/Map$Entry;->getKey()Ljava/lang/Object;\n\n'
        '    move-result-object v2\n\n'
        '    check-cast v2, Landroid/media/Image;\n\n'
        '    if-eqz v2, :cond_remove\n\n'
        '    invoke-virtual {v2}, Landroid/media/Image;->close()V\n\n'
        '    :cond_remove\n'
        '    invoke-interface {v1}, Ljava/util/Iterator;->remove()V\n\n'
        '    goto :cond_loop\n\n'
        '    :cond_done\n'
        '    monitor-exit v0\n'
        '    :try_end_0\n'
        '    .catchall {:try_start_0 .. :try_end_0} :catchall_0\n\n'
        '    return-void\n\n'
        '    :catchall_0\n'
        '    move-exception v1\n\n'
        '    monitor-exit v0\n\n'
        '    return-void\n'
        '.end method\n'
    )
    CALL = (
        f'    invoke-direct {{p0}}, {CLASS}->drainMetaBufferOverflow()V\n'
    )

    for smali in Path(tmp_dir).glob('smali*/**/*.smali'):
        data = smali.read_text(encoding='utf-8')
        # robust class match: the file's `.class` line must name MetaImageRefCounter
        if not re.search(r'(?m)^\.class[^\n]*' + re.escape(CLASS), data):
            continue
        if SENTINEL in data:
            continue  # already patched
        # 1. inject the prologue call after initMetaMap's `.locals N`
        new_data, n = re.subn(
            r'(?m)^(\.method public initMetaMap\(Lcom/oplus/ocs/camera/consumer/apsAdapter/adapter/ApsPreviewParam;\)Z\n\s*\.(?:locals|registers) \d+\n)',
            r'\1\n' + CALL,
            data,
        )
        if n != 1:
            continue  # shape changed — do not patch blindly
        # 2. append the drain method at end of the class file
        new_data = new_data.rstrip('\n') + '\n\n' + DRAIN_METHOD
        smali.write_text(new_data, encoding='utf-8')
```

Chain it (sdk jar entry, after unpack, before pack):

```python
'system_ext/.../com.oplus.camera.unit.sdk.jar': blob_fixup()
    .call(blob_fixup_apktool_unpack_src)
    # ... existing sdk smali patches ...
    .call(blob_fixup_oplus_camera_aps_metabuffer_drain)   # <-- FIX #2
    .call(blob_fixup_smali_pack_api35),                   # faithful 039 pack (doc 10) or .apktool_pack()
```

### D. Manual deploy (lead, next session — no rebuild needed to test)

```sh
# on host: pull the deployed jar, baksmali -> edit -> smali -> push
adb pull /system_ext/framework/com.oplus.camera.unit.sdk.jar .
PRE=prebuilts/extract-tools/common/smali
java -jar $PRE/baksmali.jar d -o smout com.oplus.camera.unit.sdk.jar          # multi-dex: repeat per classesN
#   in smout/.../APSClient$MetaImageRefCounter.smali:
#     (1) after initMetaMap's `.registers 12` line, add the invoke-direct drain call (B.2)
#     (2) append the drainMetaBufferOverflow method (B.1)
java -jar $PRE/smali.jar a --api 35 smout -o classes.dex                       # api 35 -> dex 039 (doc 10)
zip -j com.oplus.camera.unit.sdk.jar classes.dex                              # replace the patched dex
adb push com.oplus.camera.unit.sdk.jar /system_ext/framework/
# purge the AOT/odex so the patched dex is used
adb shell rm -f /system_ext/framework/oat/arm64/com.oplus.camera.unit.sdk.{odex,vdex,art}
adb shell setenforce 0
# relaunch camera; watch logcat for "MetaImageRefCounter, flushImage, metaBufferMap size:" staying
# bounded (<=16) and preview NOT freezing at ~frame 19.
```

### E. Expected outcome & interpretation

- **Preview un-freezes** (runs past frame 19, degraded/dropped frames possible) → confirms the
  `metaBufferMap`-starve model AND gives a usable preview while the **root** fix (publish AEC-stats
  vendor tags → decision completes → native decref fires naturally) is pursued. Fix #2 is the
  safety-net, not the cure.
- **Preview still freezes** → the starve is upstream of `metaBufferMap` (e.g. the native input
  ImageReader the engine reads is a *different* reader, or it parks before `addPreviewFrameBuffToAPS`
  is even reached) → re-scope to the native `previewManagerRoutine` input acquire.

### Anchors (UPDATE 7)
- `APSClient$MetaImageRefCounter`: ctor `metaBufferMap`/`metaBufferMapLock` init (dexdump `3de020`);
  statics `MAX_REF_LEN=6`, `MAX_REF_CNT_WITH_VIDEO_IMAGE=35`, `TYPE_APS_PREVIEW=0`/`VIDEO=1`/`ASD=2`/`APP=4`.
- `initMetaMap(ApsPreviewParam)Z` — the per-frame PUT (`metaBufferMap.put(image,int[6])`), dexdump
  `3de44c`, `registers=12 ins=2`. Caller `APSClient.addPreviewFrameBuffToAPS` (`3e1af8`, calls
  initMetaMap at `3e1b0c` then `addPreviewFrameBuff`).
- `decMetaRefZeroToRemove(JII)V` decref+close-at-zero (`3de280`); `setMetaImageRef(Object,String,Z)Z`
  inc/dec+close-at-zero tail `00e8` (`3de8f0`); `flushImage()V` = `decMetaRefZeroToRemove(0,4,0)`
  (`3de3fc`).
- Drain template precedent `Util.dealWithImageOverflow(ImageReader,I)V` (dexdump `3aaf2c`): reflect
  `mAcquiredImages` CopyOnWriteArrayList, close+remove when `size >= maxImage` — but on the **display**
  reader, blind to `metaBufferMap`.
- dexdump source: `/tmp/vt/sdk.dd`. Patch-helper form: `camera-sm8850/extract-files.py:73`
  `_replace_smali_method` + the `blob_fixup_oplus_camera_*` family.

---

## UPDATE 8 — FIX #2 REFUTED ON-DEVICE → re-scoped: the freeze is OUTPUT-starvation, not input/submit

**On-device (lead, this session):** the UPDATE-7 drain was applied exactly (drainMetaBufferOverflow +
initMetaMap prologue, reassembled `--api 35`→039, patched class confirmed loaded via CLC checksum),
poison `capture_defer_data.db` cleared + clean reboot → **STILL FROZEN**. Dropped the threshold
`0x10`→`0x3` (aggressive) → **STILL FROZEN**. ⇒ **Fix #2 refuted, and the maxImages=20/~19-frame
gradual-pool-exhaustion model with it** — a threshold-3 drain would have prevented a gradual exhaustion
freeze; it didn't. The "~19 frames" was a HAL frame-counter red herring (as flagged in UPDATE 6). The
freeze is effectively **single-shot**.

### Submit-chain RE — which link stops (the re-scope ask)

Traced the full preview submit chain in `com.oplus.camera.unit.sdk.jar` (`/tmp/vt/sdk.dd`). Result:
**no link on the SUBMIT/input side stops or blocks.** The freeze is on the OUTPUT side.

**1. Image feed — NO blocking gate.** `onImageAvailable → ConsumerImpl.onPreviewImageArrived`
(`3da02c`) `acquireNextImage()` per frame → gate `isPreviewImageNeedApsProcessor()` (`3d94ac`, returns
`isNeedApsProcessor() && mApsTag.mbPreviewProcessByAps` — **session-stable flags, does not flip per
frame**) → `ApsProcessor.addPreview` (`3d0fac`) → `generateImageInfo` → `ApsAdapterInterface.addPreviewImage`
(native enqueue). `addPreview` has **no in-flight/lock/cap gate** — it just generates + enqueues.

**2. Metadata feed — NO blocking gate.** `ConsumerImpl.onPreviewMetaArrived` (`3da42c`) per frame →
one-shot `mbFirstPreviewMetaArrived` guard (drops only the very first) + gate `isNeedPreviewMeta(result)`
(`3d928c` — `isNeedApsProcessor() && producer.needApsProcessor() && producer.isSendPreviewMeta() &&
mApsTag.mbPreviewProcessByAps`, **all session-stable**) → `ApsProcessor.addPreviewMeta` (`3d1034`) →
native. `previewDecision(CaptureResult)` (`3d3e4c`) is the decision, throttled to every ~4th frame
(`mAPSDecisionPreviewFrameCount`, interval 3) — **needs per-frame CaptureResult, does not block**.

**3. The `mProcessingPreviewFrameSet`/`mProcessingPreviewCondition`/`mPreviewResultCacheNum` handshake is
a STOP-DRAIN, not a per-frame submit throttle.** Add: `onPreviewFrameProcessStarted` (`3d3584`). Remove+
open-when-empty: `onAddPreviewFrameBuffFail` (`3d2ee8`). Clear: `onSessionClosed`/`stopPreview`. The
ConditionVariable is **blocked-on in exactly ONE place — `stopPreview` (`3d423c`) with `block(500)`
(bounded)**. `mPreviewResultCacheNum` is read only in `ApsServiceListener.onPreviewReceived$5` (`3c69a8`)
to **close stale CloseHandles** (the UPDATE-5 CloseHandle-cache bound), NOT to gate submit. ⇒ **The
lead's hypothesis #4 (submit blocks waiting for the prior result) is REFUTED** — there is no blocking
submit handshake. (The capture-side `ImageProcessHandler` close+block at `3ec70e`/`3ec81e`/`3ec8e4`
gates on `isApsCaptureAlgoInitializing()` — the CAPTURE algo-init signal, not preview. Not the freeze.)

**4. ★ The render, when APS-preview is enabled, goes ONLY through the native APS OUTPUT.** In
`onPreviewImageArrived`, the gate-TRUE (APS) branch calls `addPreview` then `goto 013e` = overflow-drain
+ traceEnd + return — **it does NOT render**. The screen is updated **only** via the APS result callback:
`ApsProcessor$ApsServiceListener.onPreviewReceived` (`3c6730`) → `mConsumerContract.onPreviewReceived`
(`3c6a8c`) → `ConsumerImpl.onPreviewReceived` (`757755`, the GLThread/SurfaceView render). The
direct-render path (`PreviewResult.Builder` → `onPreviewReceived`) exists ONLY on the gate-FALSE
(non-APS) branch (`onPreviewImageArrived` `00eb`).

### Conclusion — output starvation (reconciles every datum)

With APS preview enabled, the **only** way the screen updates is the native engine emitting a preview
result (`ApsServiceListener.onPreviewReceived`). The input side (image + metadata) keeps being submitted
every frame with **no gate, no block, no cap** — but the native APS engine never emits a preview output
(the `previewManagerRoutine` parks, doc-44 main body), so the GLThread/SurfaceView holds the last
rendered frame = **frozen**. This explains:
- **Why fix #2 (and threshold-3) did nothing** — freeing INPUT buffers cannot make the engine produce
  OUTPUT. The freeze was never input-pool exhaustion.
- **Single-shot** — one (or zero) APS output is rendered, then the engine stops emitting.
- **doc-40 "HAL produces frame 586 but app never renders"** — input flows (HAL→reader→addPreview ×586),
  output never comes.

⇒ **The freeze is NOT app-side-fixable via any submit/release/drain lever** (fix #2 dead, a submit-gate
fix would be dead too — there is no gate). The broken link is the native engine **not producing a
preview output**, because the per-frame **decision never completes** — the standing **AEC-stats
metadata root** (`getMetadata rc=-2` / `hdr_detected`/`stats_control`), now reached from the app side:
`previewDecision` consumes the `CaptureResult`, and an incomplete result yields no decision → no output.

### Next probes (ranked)
1. **Confirm output-starvation directly (device):** does `ApsProcessor$ApsServiceListener.onPreviewReceived`
   (`3c6730`) fire **more than once** during the freeze? (frida-Java hook — it's a service-callback
   thread, not the crash-prone consumer/GC thread.) Zero/one call = output starvation confirmed; many
   calls = the break is downstream in `ConsumerImpl.onPreviewReceived`'s GL render (re-scope again).
2. **Confirm the metadata the app feeds is complete:** hook `ConsumerImpl.onPreviewMetaArrived` (`3da42c`)
   — does it keep firing per frame (it should), and does `isNeedPreviewMeta` stay true? If meta keeps
   flowing but no output comes, the gap is purely the native decision (AEC-stats), not the app feed.
3. **Root fix (unchanged):** publish the AEC-stats vendor tags (provider/CamX) so the native decision
   completes → engine emits preview output → render resumes. This is the only real lever.
4. **Native passthrough fallback (apsfixup):** interpose `previewManagerRoutine`/`pipelineDataCallback`
   so the engine emits a passthrough preview output even on an incomplete decision (un-freeze without the
   metadata, degraded). High-effort native, last resort.

### Anchors (UPDATE 8)
- `ConsumerImpl.onPreviewImageArrived` `3da02c` (APS branch `00c8`→addPreview→`013e`; no render);
  `isPreviewImageNeedApsProcessor` `3d94ac`; `ApsProcessor.addPreview` `3d0fac` (no gate).
- `ConsumerImpl.onPreviewMetaArrived` `3da42c`; `isNeedPreviewMeta` `3d928c`; `ApsProcessor.addPreviewMeta`
  `3d1034`; `previewDecision` `3d3e4c` (interval-3 throttle, `mAPSDecisionPreviewFrameCount`).
- Handshake = stop-drain: add `onPreviewFrameProcessStarted` `3d3584`; remove+open `onAddPreviewFrameBuffFail`
  `3d2ee8`; only block `stopPreview` `3d423c` `block(500)`; cap read `onPreviewReceived$5` `3c69a8`
  (CloseHandle cache, not submit gate).
- Render path = APS output only: `ApsServiceListener.onPreviewReceived` `3c6730` → `mConsumerContract.onPreviewReceived`
  `3c6a8c` → `ConsumerImpl.onPreviewReceived` `757755`.
