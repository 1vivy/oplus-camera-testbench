<!-- STATUS: VERIFIED — evidence-anchored (Ghidra/device capture); no inference-surgery needed (doc-50 method). -->
# `APSClient.onTransact` Java routing — the R1 dex residual (D1, byte-exact LOS receiver spec)

> Closes the **one residual** the native RE left open (`apsclient-bridge-RE.md` §"Does HUNT 1 fully specify
> the R1 receiver? — YES, with one residual"): the **exact HashMap key strings + the action→decref routing**
> inside `APSClient.onTransact`, which live **only in the dex** (`com.oplus.camera.unit.sdk.jar`), not in any
> `.so`. With this note the R1 LOS receiver body is **fully specified** — no fabrication, all from jadx.
>
> Date: 2026-06-13 · Tool: jadx-mcp + jadx CLI · Jar: `com.oplus.camera.unit.sdk.jar` (OOS `.201` baseline,
> `dump201_full/my_product/product_overlay/framework/`, 843 classes). Pairs with `apsclient-bridge-RE.md`
> (native bridge) + `decmetarefzero-upcall-RE.md` (libAlgoProcess producer).

## TL;DR — the routing, end to end

```
[native cmd-jni] callbackRequestAction(JNIAction=2, in:map<string,vector<string>>, out)
  → JNICameraContext::onTransact → CallStaticIntMethod(APSClient, "onTransact",
       "(Ljava/lang/Object;ILjava/util/HashMap;Ljava/util/HashMap;)I", weakRef, 2, in, out)
  → [Java] APSClient.onTransact(Object obj, int i=2, HashMap in, HashMap out)         ★ static, private
        → return APSClientCallback.onTransact(obj, i, in, out)                         (pure delegation)
  → [Java] APSClientCallback.onTransact(...)  switch(i){ case 2: processMetadataRef(apsClient, in, out); return 0; }
        obj is cast ((WeakReference) obj).get() → APSClient   ← the receiver instance is held native-side as a WeakReference
  → processMetadataRef(apsClient, in, out):
        Object  image        = in.get(KEY_SET_METADATA_REF_IMAGE)          // "_IMAGE_OBJECT_"
        String  pipelineName = getString(in, KEY_SET_METADATA_REF_PIPELINE_NAME)  // "pipelineName_STRING_BASIC_"
        boolean isInc        = getBoolean(in, KEY_SET_METADATA_REF_IS_INC) // "isInc_BOOLEAN_BASIC_"
        if (image==null || pipelineName==null) return;                     // ← the null-guard (no decref if keys absent)
        apsClient.setMetaImageRefCounter(image, pipelineName, isInc);
  → APSClient.setMetaImageRefCounter(Object,String,boolean) → mMetaImageRefCounter.setMetaImageRef(...)
  → APSClient$MetaImageRefCounter.setMetaImageRef(Object image, String pipelineName, boolean isInc) : boolean
        // THE decref+close leaf for the per-preview RELEASE (isInc=false). int[6] decrement; image.close() at all-zero.
```

**The correction to the native-RE assumption:** the action-2 release upcall does **NOT** call
`decMetaRefZeroToRemove(JII)V` directly. It calls **`setMetaImageRef(Object,String,boolean)`** — that method
holds the per-image `int[6]` decrement + `Image.close()` + `metaBufferMap.remove()` at all-zero.
`decMetaRefZeroToRemove(long,int,int)` IS present in the same `MetaImageRefCounter` class but is a **separate
sweep** invoked **Java-internally** (from `removeVideoImageRefBefore`, `checkToRemoveVideoImageRefOnLastFrame`,
`flushImage`), not from the native `onTransact` action-2 path. The native side only ever resolves the single
generic static `onTransact(Object,int,HashMap,HashMap)I` (confirmed in `apsclient-bridge-RE.md`); the fan-out
to `setMetaImageRef` vs `decMetaRefZeroToRemove` is entirely Java-internal.

## The action-int switch (`APSClientCallback.onTransact`, full table — for the LOS receiver)

`obj` is `((WeakReference) obj).get()` → `APSClient`. The whole body is wrapped in `try{…}catch(Exception){
return 0;}` (so a null/stale weakref logs and no-ops, returning 0 — never throws to native).

| action int | const | handler |
|-----------:|-------|---------|
| **2** | `TRANSACTION_SET_METADATA_REF` | **`processMetadataRef` ← the R1 release/incref path** |
| 3 | `TRANSACTION_CALLBACK_CAPTURE` | `processCallbackCapture` |
| 4 | `TRANSACTION_CALLBACK_PREVIEW` | `processCallbackPreview` |
| 5 | `TRANSACTION_CLOSE_OBJECT` | `processCloseObject` |
| 6 | `TRANSACTION_RELEASE_IMAGE` | (falls through to `return 0` — no-op; note case 7 falls into 6) |
| 7 | `TRANSACTION_BUF_MANIPULATE` | `processManipulate` (then falls into case 6 → return 0) |
| 8 | `TRANSACTION_CHECKOUT_OBJECT` | `processCheckoutObject` |
| 10 | `TRANSACTION_DEBUG_TRIGGER_GC` | `processTriggerGC` |
| 11 | `TRANSACTION_SET_UX_THREAD` | `processSetUxThread` |
| 12 | `TRANSACTION_PROCESS_DS_MSG_DATA` | `processDcsMsgData` |
| 13 | `TRANSACTION_CLEAR_INVALID_DEFER_JOB` | `clearInvalidDeferJob` |
| 14 | `TRANSACTION_APS_START_PROCESS` | `onApsStartProcess` |
| 15 | `TRANSACTION_GENERATE_WATERMARK` | `generateWatermark` |
| 16 | (stop process) | `onApsStopProcess` |
| 17 | `TRANSACTION_GET_VENDOR_TAG_IDS_CALLBACK` | `getVendorTagIds` |
| 18 | `TRANSACTION_APS_MANAGE_WAKELOCK` | `manageAPSWakeLock` |
| 19 | `TRANSACTION_APS_GET_DECISION` | `getDecisionResult` |
| 20 | `TRANSACTION_APS_OTEST_CALLBACK` | `onApsOtestCallback` |
| 21 | `TRANSACTION_APS_SENT_BITMAP` | `onApsSentBitmapCallback` |
| 22 | `TRANSACTION_BITMAP_POOL_CALLBACK` | `onBitmapPoolCallback` |
| 23 | `TRANSACTION_GENERATE_VIDEO_COVER_FRAME` | `generateVideoCoverFrame` |
| 24 | `TRANSACTION_DEFER_STOP_CALLBACK` | `onDeferJobSaveEnd` |
| 25 | `TRANSACTION_APS_ALGO_ACTION_CALLBACK` | `onApsAlgoActionCallback` |
| 9 / default | — | log `"onTransact, not match this code: "+i`; **return −1** |

`FIRST_CALL_TRANSACTION = 1`. Action **2** is the only one R1 needs; the rest are listed so the LOS receiver's
switch is byte-faithful (the native side may also drive 3/4/5 capture/preview/close, but those are not the
freeze denominator).

## The three HashMap keys — exact string VALUES (the byte-exact residual)

The keys are **not** literal strings in the source — they are built at class-init by
`APSClientKeyBase.buildKey(prefix, name, suffix)` (the 3-arg overload → 5-arg
`buildKey(prefix,name,"","",suffix)`; underscore-joins non-empty prefix/name, then **appends** suffix with no
separator). Resolved values (derived by replaying `buildKey`):

| field (APSClientCallback) | `buildKey(...)` args | **literal map key string** |
|---|---|---|
| `KEY_SET_METADATA_REF_IMAGE` | `("", "", "_IMAGE_OBJECT_")` | **`_IMAGE_OBJECT_`** |
| `KEY_SET_METADATA_REF_PIPELINE_NAME` | `("", "pipelineName", "_STRING_BASIC_")` | **`pipelineName_STRING_BASIC_`** |
| `KEY_SET_METADATA_REF_IS_INC` | `("", "isInc", "_BOOLEAN_BASIC_")` | **`isInc_BOOLEAN_BASIC_`** |

`buildKey` body (`APSClientKeyBase.java:364`): StringBuilder; append prefix if non-empty; if name non-empty
append `'_'` then name (only if sb already non-empty); same for the two middle args; finally append suffix
verbatim (or replace whole thing with `"ERROR"` if suffix empty). So with empty prefix the key = `name` (if any)
+ `suffix` with the underscore living **inside** the `_…_` suffix literal.

> **Interlock note (I2 refinement).** The native marshalling keys named in `decmetarefzero-upcall-RE.md`
> (`g_KeyCb_image` / `g_KeyCb_pipelienName` / `g_KeyCb_isInc`) are the **native-side global string names**; what
> actually lands in the Java HashMap are these `buildKey` values. The native cmd-jni layer must marshal its
> `map<string,vector<string>>` under the **Java** key strings above (`_IMAGE_OBJECT_`, `pipelineName_STRING_BASIC_`,
> `isInc_BOOLEAN_BASIC_`) — i.e. the wire-key contract is the dex `buildKey` output, not the native global name.
> Since the LOS port reuses the **same native cmd-jni blob** (byte-identical, trunk axiom), this marshalling is
> already correct on LOS; the residual was never the keys diverging, only documenting them so the **receiver**
> reads the right keys. (A LOS author writing a fresh receiver must `in.get("_IMAGE_OBJECT_")` etc., verbatim.)

## `processMetadataRef` — the case-2 handler (verbatim shape)

```java
private static void processMetadataRef(APSClient apsClient, Map<String,Object> in, Map<String,Object> out) {
    Object  image        = in.get(KEY_SET_METADATA_REF_IMAGE);                 // "_IMAGE_OBJECT_"
    String  pipelineName = getString(in, KEY_SET_METADATA_REF_PIPELINE_NAME);  // "pipelineName_STRING_BASIC_"
    boolean isInc        = getBoolean(in, KEY_SET_METADATA_REF_IS_INC);        // "isInc_BOOLEAN_BASIC_"
    ApsAdapterLog.i(TAG, () -> "TRANSACTION_SET_METADATA_REF, imageObject: "+image+", pipelineName: "+pipelineName+", isInc: "+isInc);
    if (image == null || pipelineName == null) return;     // ← guard: no image or no pipeline ⇒ silently skip
    apsClient.setMetaImageRefCounter(image, pipelineName, isInc);
}
```
`getString`/`getBoolean` (`APSClientKeyBase`): `getString` = `(String) map.get(key)` or null; `getBoolean` =
`map.get(key)!=null && ((Boolean)…).booleanValue()` (so a **missing** isInc ⇒ `false` ⇒ **release**, which is the
per-preview decref default — important: an absent `isInc` key defaults to the RELEASE branch).

## `MetaImageRefCounter` — the `metaBufferMap` structure + the decref leaf (the R1 freeze denominator)

`public static class MetaImageRefCounter` (`APSClient.java:491`). Fields:
- `LinkedHashMap<Image,int[]> metaBufferMap` (the per-image refcount table; insertion-ordered)
- `Object metaBufferMapLock` (all mutate paths `synchronized` on it)
- `int[] availablePipelines = new int[6]`; `long mFirstTimeStampWithVideoImage`; `int mCntWithVideoImage`
- consts: `MAX_REF_LEN = 6`, `MAX_REF_CNT_WITH_VIDEO_IMAGE = 35`,
  **`TYPE_APS_PREVIEW = 0`, `TYPE_APS_VIDEO = 1`, `TYPE_APS_ASD = 2`, `TYPE_APP = 4`** (slot 3 + slot 5 unused;
  the `int[6]` is `{preview, video, asd, _, app, _}`)

### `setMetaImageRef(Object image, String pipelineName, boolean isInc) : boolean` — the case-2 decref/incref leaf
```
if (image==null) return false;
synchronized(metaBufferMapLock) {
  if (metaBufferMap.get(image)==null) return false;        // not tracked ⇒ no-op
  if (isInc) {                                              // ── INCREF branch
     if ("pipeline_asd".equals(pipelineName))  arr[2]++;
     else if (pipelineName==null)              arr[4]++;    // (app)
     return true;
  }
  // ── DECREF branch (isInc==false — the per-preview RELEASE) ──
  if (("pipeline_preview".equals(pn) || "pipeline_default".equals(pn)) && arr[0]>0) arr[0]--;
  else if ("pipeline_video".equals(pn) && arr[1]>0)  arr[1]--;
  else if ("pipeline_asd".equals(pn)   && arr[2]>0)  arr[2]--;
  else if (arr[4]>0)                                  arr[4]--;   // fallthrough → app slot
  // refcount-zero test:
  for (int i=0;i<arr.length;i++) if (arr[i]>0) { log "still ref"; return true; }   // any slot >0 ⇒ keep
  image.close();                       // ★ ALL slots zero ⇒ return buffer to the preview ImageReader BufferQueue
  metaBufferMap.remove(image);
  return true;
}
```
**Pipeline-name string constants** the decref keys on (these are the `pipelineName` values native ships per
frame): `"pipeline_preview"`, `"pipeline_default"`, `"pipeline_video"`, `"pipeline_asd"`. (Confirmed present in
the dex string pool alongside `APS_PIPELINE_NAME_PREVIEW/VIDEO/ASD/DEFAULT`.) The per-**preview**-frame release
is the `pipeline_preview`/`pipeline_default` → `arr[0]--` path → at all-zero `image.close()`.

### `initMetaMap(ApsPreviewParam) : boolean` — the incref/insert (counterpart, sets the entry)
On a new image inserts `int[6]` with `arr[0]=1` (preview), `arr[4]=1` (app), and `arr[1]=1` iff
`videoImageAddToAps`; `mFirstTimeStampWithVideoImage=0` otherwise. `metaBufferMap.put(image, arr)`. (This is the
incref side that `setMetaImageRef(isInc=true)` then bumps and the case-2 decref unwinds.)

### `decMetaRefZeroToRemove(long timestamp, int type, int limit)` — the SEPARATE sweep (NOT case-2)
Iterates `metaBufferMap`; for entries with `key.getTimestamp() < timestamp || timestamp==0`, if `arr[type]==1`
and all other slots zero → `key.close(); it.remove()`; else `arr[type]--`. Honors `limit` (stop after `limit`
removals). Called Java-internally with `(0L,1,1)` / `(timeStamp,1,0)` / `(0L,1,0)` from `removeVideoImageRefBefore`
& `checkToRemoveVideoImageRefOnLastFrame` (video-image cleanup) and `(0L,4,0)` from `flushImage` (app/teardown).
**Not reachable from the native action-2 upcall** — it is the bulk/video/flush GC, not the per-preview release.

## Receiver registration handshake (how the native upcall finds the instance)

`APSClient.connect(int)` (`APSClient.java:911`): calls `create(new WeakReference(this))` (the legacy JNI path,
`APSClient.java:920`) **or** `mAPSClientWrapper.create(new WeakReference(this))` (the new cmd-jni path, `:918`,
gated on `mbAPSClientJNICmdVersion`). Either way the **receiver passed to native is `new WeakReference(this)`** —
matching `APSClientCallback.onTransact`'s `((WeakReference) obj).get()` cast. Native promotes it to a JNI global
ref (`apsclient-bridge-RE.md` §class-lookup) and calls back `onTransact(weakRef, 2, in, out)` per preview frame
on the pipeline-result thread. ⇒ **the LOS receiver instance is the live `APSClient`** the app already
constructs at OCS-SDK init; no extra registration object to author — the WeakReference wrapping is the only
indirection, and it is already in the consumed dex.

## Does this now FULLY specify the R1 LOS receiver? — YES (residual closed)

Combining `apsclient-bridge-RE.md` (native surface) + this note (dex routing), the R1 receiver is byte-exact:

1. **Class** `com.oplus.ocs.camera.consumer.apsAdapter.APSClient` resolvable on the **app** classloader (it is —
   ships in `com.oplus.camera.unit.sdk.jar`, a system_ext framework jar `<uses-library>`-linked, NOT in the
   stub jar; see F1).
2. **Static** `private static int onTransact(Object, int, HashMap, HashMap)` → delegates to
   `APSClientCallback.onTransact`; the action-2 switch case → `processMetadataRef`.
3. **Three keys** read from the in-HashMap: `_IMAGE_OBJECT_` (Image), `pipelineName_STRING_BASIC_` (String),
   `isInc_BOOLEAN_BASIC_` (Boolean; absent ⇒ false ⇒ release).
4. **Routing** → `setMetaImageRefCounter(image, pipelineName, isInc)` → `MetaImageRefCounter.setMetaImageRef`,
   the `int[6]{preview,video,asd,_,app,_}` decrement + `image.close()` at all-zero.
5. **Pipeline-name match strings**: `pipeline_preview` / `pipeline_default` (preview slot 0), `pipeline_video`
   (slot 1), `pipeline_asd` (slot 2), else app slot 4.
6. **Registration**: receiver = `new WeakReference(apsClient)`, passed via `create(...)` at `connect()`.

> **Crucial implication for the F2 verdict.** R1's "author-new release receiver" is **already wholly present in
> the consumed dex** (`com.oplus.camera.unit.sdk.jar`). The receiver class, the static `onTransact`, the action
> switch, the keys, the `MetaImageRefCounter` decref leaf, and the WeakReference registration **all ship in the
> OCS SDK jar the port already installs.** So R1 does **not** need an authored Java receiver in `frameworks/base`
> — it needs (a) the OCS SDK jar resolvable on the app classloader (F1 / C1, already satisfied) and (b) the
> **native side to actually fire the action-2 upcall per preview frame on LOS** (the producer reachability —
> `decmetarefzero-upcall-RE.md`'s decision-result completeness). The Java leg is complete-in-dex; the LOS gap is
> producer-side (does `callbackToCamUnit` fire), not a missing Java receiver. This **revises** the INDEX's R1
> "author-new (Java release receiver)" framing toward "verify the native producer fires; the Java receiver is
> already in the shipped OCS SDK dex." (See F1 update for the stub-vs-SDK provider split.)

## Caveats / no-fabrication
- Jar = `com.oplus.camera.unit.sdk.jar` from `dump201_full` (OOS `.201`). The in-tree built copy
  (`out/.../system_ext/framework/com.oplus.camera.unit.sdk.jar`) is the same prebuilt (proprietary, copied not
  compiled) — the routing is fixed by the prebuilt, not re-derivable from source.
- Key-string values are **derived** by replaying `buildKey` against the decompiled `<clinit>` args (the
  `buildKey("","" ,"_IMAGE_OBJECT_")` etc. constants were read verbatim from `APSClientCallback.java:32-34`); the
  concatenation rule was read verbatim from `APSClientKeyBase.buildKey` (`:364-395`). Both confirmed by the dex
  string pool containing `_IMAGE_OBJECT_`, `pipelineName`, `isInc`, `_STRING_BASIC_`, `_BOOLEAN_BASIC_`.
- `decMetaRefZeroToRemove(JII)V` **exists** in the dex (refuting any "dex-only-and-unused" doubt) but is
  **not** on the action-2 path — the case-2 release is `setMetaImageRef(Object,String,boolean)`. Both were read
  in full from `APSClient.java` (`:517` setMetaImageRef, `:670` decMetaRefZeroToRemove, `:581` initMetaMap).
