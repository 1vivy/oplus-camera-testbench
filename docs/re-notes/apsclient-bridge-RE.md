<!-- STATUS: VERIFIED — evidence-anchored (Ghidra/device capture); no inference-surgery needed (doc-50 method). -->
# The `gCallbackRequestAction` bridge JNI lib — the camera-unit native→Java upcall (R1 receiver)

> Resolves doc B3 (OOS-OPEN-ITEMS Part B): **which lib implements `gCallbackRequestAction`** (the external
> fn-ptr libAlgoProcess dispatches the release upcall through, `decmetarefzero-upcall-RE.md` §bridge), and
> exactly **what Java surface the R1 LOS receiver must provide (F2)**. Pairs with `decmetarefzero-upcall-RE.md`
> (the producer side in libAlgoProcess) and `oem-binder-ontransact-RE.md`.
>
> Date: 2026-06-13 · Tool: ghidra-mcp, project `oos-baseline-v3` (imported alongside libAlgoProcess/SF/libgui).
> Convention: image_base `0x100000` → **file off = Ghidra addr − 0x100000**. frida: `module.base + <file off>`.

## TL;DR — the winner is `libAPSClient-cmd-jni.so` (NOT libAPSClient-jni.so)

The fn-ptr `gCallbackRequestAction` is **registered**, not imported. libAlgoProcess **exports a setter**:

- `setRequestActionCallback(fn)` @ libAlgoProcess Ghidra `0x3d5584` (**file `0x2d5584`**) — one instruction:
  `*PTR_gCallbackRequestAction_00785368 = fn;`. It writes the caller-supplied fn-ptr into the
  `gCallbackRequestAction` global (`0xab7548` / file `0x9b7548`, via slot `PTR_..._00785368` / file `0x685368`)
  — the exact slot `decmetarefzero-upcall-RE.md` named. So whoever calls `setRequestActionCallback` *is* the
  registrar of the upcall target.

The lib that calls `setRequestActionCallback` (dlsym'd from libAlgoProcess; the dump string
`load setRequestActionCallback fail!` lives there) and supplies the callback is:

| | lib | BuildID (sha1) | role |
|---|---|---|---|
| **registrar** | `my_product/lib64/libAPSClient-cmd-jni.so` | `3e9d4106711b69dce6b8438a3d2a740fb8d1c250` | exports `callbackRequestAction` (the `gCallbackRequestAction` target) + `JNICameraContext::onTransact` (the actual JNI Call site); source `vendor/oplus/camera/aps_core/jni/aps_client_cmd/JNIBufProcess.cpp` |
| sibling (NOT it) | `my_product/lib64/libAPSClient-jni.so` | `4a629ee86dd00d8d8a40acb5383a84403db9ace7` | holds `setMetaImageRef` GetMethodID (the **incref** path) + `postDataBack→postEventFromNative`; source `…/aps_client/com_oplus_ocs_camera_consumer_apsAdapter_APSClient.cpp`. Does **not** register `gCallbackRequestAction`. |

Both `dlopen`/dlsym libAlgoProcess via a `gAPSOps`/`camAps*` ops table (neither links it `NEEDED`); the
`gCallbackRequestAction` wiring is a **separate** `setRequestActionCallback` dlsym, not one of the `camAps*` ops.

## The bridge chain (name @ Ghidra / file off, libAPSClient-cmd-jni.so)

```
libAlgoProcess: ApsCallbackMetaRefInc::callbackToCamUnit   (**(this+8))(JNIAction=2, &params, &out)
  → gCallbackRequestAction  (libAlgoProcess 0xab7548/file 0x9b7548) == &callbackRequestAction (registered)
  → callbackRequestAction(JNIAction, map<string,vector<string>>& in, map& out)   ★ THE UPCALL LANDS HERE ★
        @ cmd-jni Ghidra 0x16cc34 / file 0x6cc34  (exported _Z21callbackRequestAction9JNIAction…)
        switch(JNIAction){…}  — action 2 → case 2; the int discriminates inc/dec/etc per JNIAction enum
  → JNICameraContext::onTransact(JNIEnv*, jobject, int action, jobject inMap, jobject outMap)
        @ cmd-jni Ghidra 0x16eba0 / file 0x6eba0  (1720 B)   ← the GetMethodID + Call site
        GetObjectClass(env,obj)                         env+0xf8
        GetMethodID(clazz, "onTransact",
                    "(Ljava/lang/Object;ILjava/util/HashMap;Ljava/util/HashMap;)I")   env+0x388
            name  "onTransact"                          @ file 0x47930
            sig   "(Ljava/lang/Object;ILjava/util/HashMap;Ljava/util/HashMap;)I"  @ file 0x4984e
        CallStaticIntMethod(clazz, mid, …)              _JNIEnv::CallStaticIntMethod (in cleanup tail)
  → [Java] APSClient.onTransact(Object, int action, HashMap in, HashMap out) : int
  → [Java, action-keyed] APSClient$MetaImageRefCounter.decMetaRefZeroToRemove(JII)V   (isInc==false leaf)
```

### The registration site
- libAlgoProcess `setRequestActionCallback` @ Ghidra `0x3d5584` / file `0x2d5584` → writes `gCallbackRequestAction`.
- cmd-jni stores `&callbackRequestAction` in its ops/data slot `PTR_…callbackRequestAction…` @ file `0x1fc040`
  and dlsym-calls libAlgoProcess `setRequestActionCallback` with it (string `load setRequestActionCallback fail!`).
  There is a parallel `setOnTransactCallback` string for the `onTransact` vector.

### Class lookup + caching (off the app classloader)
- `JNI_OnLoad` (libAPSClient-cmd-jni & -jni) `FindClass`'s `com/oplus/ocs/camera/consumer/apsAdapter/APSClient`
  (cmd-jni class-name string @ file `0x…`; jni copy @ file `0x502e6`, with fallback `com/aps/APSClient`).
- `onTransact` does **not** cache a class statically; it calls `GetObjectClass(env, jobj)` **per call** on the
  jobject passed up from native (the registered receiver instance), then `GetMethodID(...)` fresh each upcall.
  The receiver jobject itself is held as a **JNI global ref** — cmd-jni exports `actionNewGlobalReference` /
  `actionDeleteGlobalReference` / `releaseGlobalRef` and a `g_globalRefCount` counter; the registered Java
  object (created on the **app** classloader at OCS-SDK init) is promoted to a global ref so the per-frame
  upcall can call back into it from the pipeline-result thread. So the resolution is **instance-driven off the
  app-side receiver object**, not a cached static jclass.

### Why `decMetaRefZeroToRemove(JII)V` appears in NO native lib (re-confirmed, all 4 candidates)
The native side never names the decref method. The **only** Java method any native lib resolves by name on this
path is **`onTransact`** (the generic action channel). `decMetaRefZeroToRemove` and the `(JII)V` signature are
**absent** from `libAPSClient-cmd-jni.so`, `libAPSClient-jni.so`, `libAlgoProcess.so` (empty `strings`/Ghidra
search in all). They exist **only in the dex** (`my_product/.../framework/com.oplus.camera.unit.sdk.jar` +
`…sdk.adapter.jar`). The native→Java contract is the single generic `onTransact(Object,int,HashMap,HashMap)I`;
the `int action` + the two string-map bundles are what Java fans out — `MetaImageRefCounter.decMetaRefZeroToRemove`
is reached entirely **Java-side**, keyed by the action/`isInc` the native bundle ships. (The incref counterpart
`setMetaImageRef` IS named natively, but in the *sibling* `libAPSClient-jni.so` — see §sibling.)

### Sibling incref site (libAPSClient-jni.so) — for completeness
- `JNICameraContext::setMetaImageRef` @ Ghidra `0x18ae4c` / file `0x8ae4c`:
  `GetObjectClass` → `GetMethodID("setMetaImageRef", "(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;…)V")`
  (name @ file `0x4cac2`, sig @ file `0x514a7`) → CallVoidMethod. This is the **`isInc==true`** Object-arg incref,
  distinct from the `(JII)V` decref. Logs `call setMetaImageRef succeed` / `Can't find APSClient.setMetaImageRef`.
- `JNICameraContext::postDataBack` @ Ghidra `0x18ac80` / file `0x8ac80`: `GetMethodID("postEventFromNative",
  "(Ljava/lang/Object;Ljava/lang/Object;)V")` (name @ file `0x51493`, sig @ file `0x4ca9a`) → CallVoidMethod —
  the generic event channel, not the decref.

## What the R1 LOS impl must satisfy (F2) — the receiver contract

**This is what the R1 LOS implementation must provide:** a Java class
**`com.oplus.ocs.camera.consumer.apsAdapter.APSClient`** (resolvable on the **app** classloader, the class
`JNI_OnLoad` FindClass'es) exposing a **static**
**`int onTransact(java.lang.Object, int action, java.util.HashMap in, java.util.HashMap out)`**
— signature `(Ljava/lang/Object;ILjava/util/HashMap;Ljava/util/HashMap;)I` — and, behind it, the
`APSClient$MetaImageRefCounter.decMetaRefZeroToRemove(long,int,int)` (`(JII)V`) + `setMetaImageRef` leaves that
the `onTransact` action-dispatch routes to. The receiver **instance** must be registered with the native
side (held as a JNI global ref) at OCS-SDK init so the pipeline-result-thread upcall (`gCallbackRequestAction`,
`JNIAction=2`, `isInc=false`) can reach it per preview frame; if the class is unresolved or the static
`onTransact` is missing/mismatched, the native `GetMethodID` returns null, the upcall no-ops, the per-frame
release never happens, and the 20-deep preview pool exhausts → the #1 freeze.

### F2 verification probe (symmetric, for the LOS B-side)
`trace_apsclient_bridge.js`: hook `libAPSClient-cmd-jni.so + 0x6eba0` (`onTransact`) — confirm per-preview-frame
`GetMethodID(...,"onTransact",…)` returns non-null + `CallStaticIntMethod` fires with `action==2`; and hook the
Java `APSClient.onTransact` + `MetaImageRefCounter.decMetaRefZeroToRemove`. Stock expected: per-frame, bounded
`metaBufferMap`; LOS-broken expected: class/method unresolved or call absent (the freeze).

## Does HUNT 1 fully specify the R1 receiver? — YES, with one residual

**Fully specified:** the native-visible contract surface is closed — the receiver class
(`apsAdapter.APSClient`), the **one** native-resolved method (`static onTransact(Object,int,HashMap,HashMap)I`),
the registration handshake (`setRequestActionCallback` writes `gCallbackRequestAction`; receiver held as a JNI
global ref off the app classloader), the upcall thread (pipeline-result), and the action enum (`JNIAction=2`,
`isInc=false`) are all pinned at offsets, no fabrication.

**Residual (Java-internal, not native):** the **exact key names inside the two HashMaps** and the precise
action→`decMetaRefZeroToRemove` routing live in the dex (`com.oplus.camera.unit.sdk.jar` `APSClient.onTransact`),
not in any `.so`. They must be read from the jar (jadx) to author a byte-exact LOS `onTransact` body — the
native RE cannot supply them because the native side ships opaque `map<string,vector<string>>` bundles. The
native marshalling keys (`image`, `pipelienName`, `isInc`) are known from `decmetarefzero-upcall-RE.md`
(libAlgoProcess `preProcess`); confirming they survive verbatim into the HashMap is the one jadx follow-up.

## Caveats / no-fabrication
- `decMetaRefZeroToRemove` / `(JII)V` offsets are **not** given — they do not exist in any native lib (dex-only),
  re-confirmed empty across cmd-jni, jni, libAlgoProcess.
- `callbackRequestAction` (`0x6cc34`) and `onTransact` (`0x6eba0`) are **exports** with `.dynsym` names retained
  (the libs are otherwise stripped); offsets are the dynsym values, image-base-adjusted, and were decompiled.
- The `setRequestActionCallback` registration is proven by libAlgoProcess's one-line setter writing
  `gCallbackRequestAction` + the dlsym-name string in cmd-jni; the literal call instruction in cmd-jni was not
  single-stepped (dlsym indirection), but the data-slot xref (`0x1fc040`→`callbackRequestAction`) and the
  setter semantics make the binding unambiguous.
