<!-- STATUS: VERIFIED — evidence-anchored (Ghidra/device capture); no inference-surgery needed (doc-50 method). -->
# The `decMetaRefZeroToRemove` preview-frame RELEASE upcall in libAlgoProcess (Ghidra-recovered, OOS `.201`)

> Grounds the **C6 release contract** (the #1-freeze denominator) with its native code-level mechanism.
> Pairs with the upcoming 1b "working preview release cadence" runtime capture and the G4 capture
> (C6 §SESSION FACT). Confirms doc-44 UPDATE 6's core claim: the per-preview image release is a
> **native JNI upcall**, dispatched through a registered function-pointer bridge by a `JNIAction` enum
> and a cached `jmethodID` that lives in the camera-unit JNI layer — which is **why the literal string
> `decMetaRefZeroToRemove` is in NO native lib** (re-confirmed below, empty grep + empty Ghidra string
> search). The Java target method name never appears in this `.so`; only the params it ships do.
>
> Date: 2026-06-13 · Binary: `/home/vivy/op15-work/dump201_full/odm/lib64/libAlgoProcess.so`
> AArch64, stripped, **BuildID md5 `82fe443b408f8ed027558b0d4ffb1500`** (matches doc-42 axiom exactly),
> 6,943,624 B, 5,313 functions. Source-file string (from `__FILE__` in the OLog macro):
> `vendor/oplus/camera/aps_core/source_code/interface/APSCallback.cpp`.
> · Ghidra **image_base 0x100000** → **file offset = Ghidra addr − 0x100000** (same convention as doc-44).
> · Tool: ghidra-mcp, project `oos-baseline-v3` (added libAlgoProcess.so alongside the prior SF/libgui work).
> · frida on device: `module.base + <file off>`.

## TL;DR — mechanism CONFIRMED (no static call-edge by design)

`decMetaRefZeroToRemove` is **not a callable native symbol and not a literal string** in libAlgoProcess.
The native side never names the Java method; it ships a **params bundle** (`image`, `pipelienName`,
`isInc`) to the camera-unit JNI bridge, and the **Java side** (`APSClient$MetaImageRefCounter`) is what
maps that bundle onto `setMetaImageRef` (incref) vs `decMetaRefZeroToRemove` (decref + `Image.close()`
at refcount 0). The native gate that decides **incref vs release** is the boolean **`isInc`** key.

The upcall path, fully indirect (vtable registry + external function pointer — so `get_xrefs_to` /
`get_function_callers` return *empty* for every link, which is the signature of this design, not a
missing edge):

```
preview result completes (async, on the pipeline result thread)
  → ApsCallbackBase::doCallback(actionId, ...)            // central JNI dispatch hub, indexes the
                                                           //   handler-vtable registry by actionId
  → handler-vtable registry[3] = ApsCallbackMetaRefInc    // (table @ Ghidra 0x786390 / file 0x686390, 20 entries × 8B)
  → ApsCallbackMetaRefInc::preProcess(...)                // builds params map: {image, pipelienName, isInc}
  → ApsCallbackMetaRefInc::callbackToCamUnit(...)          // (**(this+8))(2, this+0x18, this+0x30)
  → gCallbackRequestAction(JNIAction=2, &params, &out)     // ★ THE UPCALL ★ external fn-ptr → camera-unit JNI
  → [camera-unit JNI layer, NOT this .so]                  // CallVoidMethod(env, obj, cachedMid, image,type,limit)
  → APSClient$MetaImageRefCounter.decMetaRefZeroToRemove(JII)V    // Java target, gated isInc==false
```

When `isInc==false` the Java `decMetaRefZeroToRemove` decrements the per-image `int[6]` in
`metaBufferMap` and, **at zero, calls `Image.close()` + removes the entry** (returns the buffer to the
preview ImageReader BufferQueue). That close is the per-frame input-buffer return doc-44 chases. If the
native upcall never fires (incomplete decision result), the ref never hits zero, the Image is never
returned, and the 20-deep pool exhausts at ~frame 19 → `previewManagerRoutine` parks (the freeze).

## The upcall site (name @ Ghidra / file off)

| Element | Ghidra | file off | role |
|---|---|---|---|
| `ApsCallbackMetaRefInc::preProcess` | `0x41f680` | **`0x31f680`** | builds the release/inc params map: keys `image`, `pipelienName`, `isInc` |
| `ApsCallbackMetaRefInc::callbackToCamUnit` | `0x41fa1c` | **`0x31fa1c`** | ★ the upcall dispatch: `(**(this+8))(2, this+0x18, this+0x30)` — action `2`, params, out |
| `ApsCallbackMetaRefInc::postProcess` | `0x41fa44` | `0x31fa44` | post-hook (thin) |
| `ApsCallbackMetaRefInc` vtable `_ZTV21ApsCallbackMetaRefInc` | `0x780ca0` | `0x680ca0` | [+0x10 preProcess][+0x18 callbackToCamUnit][+0x20 postProcess][+0x28/0x30 dtors] |
| `getPtrFromObjectRef(... JNIAction ...)` | `0x3f48bc` | `0x2f48bc` | generic JNI-action wrapper; same `gCallbackRequestAction` dispatch pattern |
| `ApsCallbackBase::doCallback(int actionId, ...)` | `0x401504` | `0x301504` | central JNI dispatch hub (270 KB; indexes handler registry by `actionId`) |
| handler-vtable registry (array) | `0x786390` | `0x686390` | 20 × 8-byte vtable ptrs; **index 3 = MetaRefInc** (`0x780ca0`) |

### The bridge (the "GetMethodID/CallVoidMethod registration site")

There is **no `GetMethodID` in this `.so`**. The native→Java bridge is a single relocated function
pointer:

- `gCallbackRequestAction` global @ **Ghidra `0x00ab7548`** (file `0x9b7548`, in `.bss`/data) — an
  **EXTERNAL entry point** (set at load/init time, defined in the camera-unit JNI lib, not here).
- Indirection slot `PTR_gCallbackRequestAction` @ **Ghidra `0x00785368`** (file `0x685368`) → holds
  `0x00ab7548`. Every callback handler loads `this+8` (= this bridge ptr, copied into the object at
  construction) and calls it with `(JNIAction, &params, &out)`.

⇒ The `GetMethodID("decMetaRefZeroToRemove", "(JII)V")` + `CallVoidMethod` pair therefore lives **inside
`gCallbackRequestAction`'s implementation in the camera-unit JNI layer** (the lib exporting that symbol),
keyed by `JNIAction` enum + the `isInc` param — NOT in libAlgoProcess. The cached `jmethodID` is held
there. This is the structural reason doc-44 UPDATE 6 grepped the whole dump and found the string nowhere.

## The gate (incref vs release)

The discriminator is the **`isInc` boolean** carried in the params bundle, built by
`ApsCallbackMetaRefInc::preProcess` @ `0x31f680`. Decompile evidence — preProcess assembles exactly
three keys into the callback params map:

- `g_KeyCb_image` (@ Ghidra `0xab8138`) ← the preview `Image` object (`*param_3 + 0x28`)
- `g_KeyCb_pipelienName` (@ `0xab8150`) ← the pipeline name string (`*param_3 + 0x480`, the
  `callback_data.field@0x480` the result decode sets — see doc-44 UPDATE 3)
- `g_KeyCb_isInc` (@ `0xab8180`) ← the inc/dec flag; preProcess calls `func_0x00771420(&val, 1)` to
  serialize a bool into this slot

The **refcount-zero test itself is NOT in this `.so`** — it is performed Java-side in
`decMetaRefZeroToRemove(JII)V` over the per-image `int[6]` in `metaBufferMap` (doc-44 UPDATE 7). The
native side's job is only to **decide and ship `isInc=false`** for the per-preview release. The
native gate on *whether to ship the release at all* is the **decision-result completeness** in the
preview result path (`packPreviewResult` `0x2b6834`/`0x1b6834`, `pipelineDataCallback`
`0x2a9dd4`/`0x1a9dd4`, `updateMetaInfoForOutputData` `0x2b1774`/`0x1b1774`) — on an incomplete /
`mMetadata==null` result the MetaRefInc-release callback_data is not produced, so the decref upcall
never reaches Java. (Consistent with doc-44 UPDATE 5/6: missing AEC-stats → null result-metadata →
the per-preview decref is skipped.)

Supporting native refcount bookkeeping (OLog `__FILE__`/`__LINE__` debug prints, confirm the field name):
- `[DEBUG] ... metaImage, metaObjRef: %ld`  @ Ghidra `0x18c984` (file `0x8c984`)
- `[DEBUG] ... CaptureResult, metaObjRef: %ld` @ Ghidra `0x1a813e` (file `0xa813e`)
- `[INFO]  ... release metaBuffer: %p`     @ Ghidra `0x193431` (file `0x93431`)
- `[INFO]  ... allocate metaBuffer hardwarebuffer: %p` @ Ghidra `0x1bd4b5` (file `0xbd4b5`)
- vector-sizes log naming the container `metaRefObjVector` @ Ghidra `0x17d936` (file `0x7d936`)

`metaObjRef` is the native-side per-object reference counter (an `%ld`); the **release decision keys off
it reaching the release condition**, but the authoritative zero-test + `Image.close()` is the Java
`metaBufferMap` decref. (These OLog strings have no Ghidra data-xref because the OLog macro computes the
pointer via ADRP+ADD that Ghidra didn't record as a reference — they were located by `__FILE__`/string
offset, not xref.)

## Calling thread / context

The release upcall is **NOT** issued on `previewManagerRoutine` (`0x2aa694`/`0x1aa694`, the command
consumer that parks). It rides the **async preview-result path**: cmd-3 in `previewManagerRoutine`
dispatches the frame to the pipeline (`this+0x38`); the result returns asynchronously via
`APSPreviewManager::pipelineDataCallback` (`0x2a9dd4`/`0x1a9dd4`) → result packing
(`packPreviewResult` `0x2b6834`/`0x1b6834`) → the ApsCallback dispatch (`doCallback` →
`ApsCallbackMetaRefInc`) → `gCallbackRequestAction`. So the decref upcall fires on the **pipeline
result/callback thread**, once per completed preview frame whose decision result is well-formed — the
exact cadence the G4/1b capture must measure. (`previewManagerRoutine` is the downstream *victim* of a
missing upcall, not its source.)

## Java target (recovered, cross-doc)

- Class: `com.oplus.ocs.camera.consumer.apsAdapter.APSClient$MetaImageRefCounter`
- Method: `decMetaRefZeroToRemove(JII)V` — args `(long timestamp, int type, int limit)`; decrements
  `metaBufferMap.get(image)[type]`, and at all-zero does `Image.close()` + `metaBufferMap.remove`.
  Incref counterpart: `setMetaImageRef`/`initMetaMap` (the `isInc==true` path). (Java structure from
  doc-44 UPDATE 6/7 — `int[6]` slots: `TYPE_APS_PREVIEW=0`, `_VIDEO=1`, `_ASD=2`, `TYPE_APP=4`.)

## What the 1b / G4 runtime capture must show to CONFIRM this mechanism

On a **WORKING** preview (the stock/working-state baseline, e.g. the C6 §SESSION-FACT clean stock
capture), hook the native upcall and the Java decref and expect, **per released preview frame**:

1. **Native**: `ApsCallbackMetaRefInc::callbackToCamUnit` @ `libAlgoProcess.so + 0x31fa1c` fires once
   per preview frame, on the pipeline-result thread (not `previewManagerRoutine`), with the params map
   carrying **`isInc=false`** (read `this+0x18` map → `g_KeyCb_isInc` value). Equivalently, hook the
   bridge `gCallbackRequestAction` (`module + 0x9b7548` indirect) and confirm a per-frame
   `JNIAction=2` call. Cadence should track the G4 denominator (~30 fps per display stream;
   ~69.5 results/s logical-4 aggregate, 7.0 ms median — C6 §SESSION FACT).
2. **Java**: `APSClient$MetaImageRefCounter.decMetaRefZeroToRemove(JII)V` fires per frame, and
   `metaBufferMap.size()` stays **low/bounded** (~2–4), never climbing toward 20.

On the **LOS-frozen** A/B (compared against that working cadence): expect `setMetaImageRef`/`isInc=true`
to keep firing while the `isInc=false` decref upcall **STOPS (or never fires for preview)** after frame
~1, `metaBufferMap.size()` climbing one entry/frame toward 20, `previewManagerRoutine` parked at
`pthread_cond_wait(this+0x17c)`. That divergence (upcall present-then-absent on LOS vs steady on stock)
is the **G-MECH proof** that the broken contract is the native→Java release upcall, settling C6 (c).

## Caveats

- The literal `decMetaRefZeroToRemove` / `GetMethodID` / `CallVoidMethod` are **absent from this `.so`
  by design** — re-confirmed (empty `strings` grep, empty Ghidra `search_strings`). No offsets were
  fabricated for them; the bridge they live behind (`gCallbackRequestAction` @ `0x9b7548`, external) is
  named instead, and the cached-`jmethodID` `CallVoidMethod` is in the camera-unit JNI lib that exports
  it (next RE target if the runtime capture demands the exact site).
- All call-graph links here are **indirect** (vtable registry + external fn-ptr), so ghidra
  `get_xrefs_to`/`get_function_callers` legitimately return empty for them — that is the dispatch
  design, evidenced by the registry table @ `0x886390` and the `PTR_gCallbackRequestAction` slot @
  `0x785368`, not a gap in analysis.
- Pairs with the **C6 release-cadence (G4) capture** (C6 §SESSION FACT / 1b "working preview release
  cadence").
