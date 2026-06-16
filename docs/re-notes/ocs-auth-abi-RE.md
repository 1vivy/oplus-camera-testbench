<!-- STATUS: VERIFIED (Ghidra surfaceflinger-300 + jadx oplus-framework-300.jar + OCS SDK jar, 2026-06-15)
     separated from INFERENCE. Static RE only; no A/B run here. The "OCS-auth gap ⇒ no-JPEG" causal claim stays
     INFERENCE/SUPPORTED-by-mechanism until LOS A/B (AOSP SF+framework lack the entire subsystem). -->
# OCS client-auth → SurfaceFlinger ABI (the #1 save-blocker) — static RE

> Phase-3 reverse-engineering of the **OnePlus Camera SDK (OCS) client-auth extension** that AOSP SurfaceFlinger
> + AOSP framework LACK on LOS. This is the path that, on OOS, records a per-process **OcsAuthInfo** in SF and
> unlocks the OEM EDR/extension composition (`customVendorTag 120 → oemChimetadatas 1 → SAT-Fusion reprocess →
> JPEG`). On LOS the chain is dead ⇒ `customVendorTag 0` ⇒ `oemChimetadatas 0` ⇒ plain offline reprocess ⇒ no
> image saved.
>
> Date: 2026-06-15 · Three sources, all from the **OOS `dump300_full` reference** (`vivy@10.9.20.67`):
> - **SF server** (Ghidra): `system/bin/surfaceflinger` → local `/tmp/ocs-re/surfaceflinger-300`
>   (md5 `100c0288f091f1e7311611d7620ce05e`, 11,437,080 B, AArch64 PIE, **Ghidra image_base 0x100000;
>   file_off = Ghidra_addr − 0x100000**). Ghidra program name `surfaceflinger-300`. 33,901 fns.
> - **Framework client** (jadx): `system/framework/oplus-framework.jar` → `/tmp/ocs-re/oplus-framework-300.jar`
>   (md5-bearing prebuilt; 3,323 classes). Holds the WRITE side — it is **Java**, NOT native libgui.
> - **OCS SDK + stub** (jadx): `my_product/product_overlay/framework/com.oplus.camera.unit.sdk.jar`
>   (`/tmp/ocs-re/ocs-sdk-300.jar`) + the framework stub `android.hardware.camera2.OplusCameraManager`
>   (in `oplus-framework.jar`).
>
> Axiom (SCHEMA.md trunk): a byte-identical blob is a SITE, never a ROOT. Here the SF subsystem and the
> framework client are **wholly ABSENT on LOS** (AOSP SF + AOSP framework), so this is a **facilitation gap**
> (E-plane): the port must re-provide the write side (framework) and the read side (SF), or ship the OOS blobs.

---

## ⚠️ Premise correction (vs the task brief)

The brief assumed the WRITE side is **native libgui** (`OplusSurfaceComposerClient::notifyAuthInfo`,
`libgui.so`). **It is not.** On `dump300`:

- `notifyAuthInfo` / `OplusSurfaceComposerClient` exist **only as Java** in `oplus-framework.jar`
  (class `com.oplus.display.OplusSurfaceComposerClient`). `grep -a` over **every** `.so` in
  `system/lib64`, `system_ext/lib64`, `vendor/lib64` returns **zero** native `notifyAuthInfo`. `libgui-300.so`
  has the EDR transaction setters (`setEdrViewTransform`, `setEdrFlags`, …) but **no** Auth/Ocs symbol.
- So **shipping the OOS `libgui.so` does NOT restore OCS auth** — the write side lives in the framework jar, and
  the read side lives in the SF **main binary** (`surfaceflinger`), not in libgui. (See §Patch-plan / blob-swap.)

This is the SAME shape as the prior cameraserver auth RE (`oem-client-identity-gate-RE.md`): an OEM
binder-extension reached through a Java client that hand-marshals a Parcel onto an existing service binder, with
an OEM-only transaction code above the AOSP code range.

---

## TL;DR — the full chain (VERIFIED)

```
[camera session setup, on behalf of authed client]
  → com.oplus.display.OplusSurfaceComposerClient.get().notifyAuthInfo(uid, pid, permBits=0x80000000, pkg)   [Java, oplus-framework.jar]
      → SFClient.notifyAuthInfo: Parcel{ token="android.ui.ISurfaceComposer"; int uid; int pid; int permBits; String pkg }
      → IBinder("SurfaceFlinger").transact(OPLUS_NOTIFY_AUTH_INFO=24001 / 0x5dc1, data, reply, 0)
  → [SF server, surfaceflinger]
      OplusSurfaceFlinger::checkTransactCodeCredentials(0x5dc1)  → require com.oplus.permission.safe.MEDIA (else Permission Denial)
      → onTransact case 0x5dc1: readInt32 uid; readInt32 pid; readInt32 permBits; readString16 pkg
          → OplusClientRecorder::get()->addOcsAuthInfo( OcsAuthInfo{uid,pid,String8(pkg),permBits} )
          → mOcsAuthInfoMap[pkg-or-procName] = {uid,pid,pkg,permBits}            ★ the recorded grant
  → [SF composition, per layer, later]
      <EDR-type permission gate>(snapshot, procName):
          required = {1→0x80000000, 2→0x40000000, 4→0x20000000, 5→0x10000000}[edrType]
          → OplusClientRecorder::get()->checkOcsPermission(procName, required)
              return (required & ~mOcsAuthInfoMap[procName].permBits) == 0       ★ subset test ⇒ grant EDR path
```

The reply contract: SF replies `readException(); reply.writeInt(0)` ⇒ Java reads `reply.readInt()==0` ⇒ `true`.

---

## THREAD A — WRITE side (Java framework, VERIFIED via jadx)

### A1. `com.oplus.display.OplusSurfaceComposerClient` — the SF binder client (VERIFIED, full source)
Singleton (`get()`); inner `SFClient implements IBinder.DeathRecipient` holds
`ServiceManager.getService("SurfaceFlinger")`. The transaction:

```java
private static final int OPLUS_NOTIFY_AUTH_INFO = 24001;          // = 0x5dc1
public boolean notifyAuthInfo(int uid, int pid, int permBits, String packageName) {
    Parcel data = Parcel.obtain(); Parcel reply = Parcel.obtain();
    // log: "notifyAuthInfo uid=%d pid=%d permBits=0x%x packageName=%s"
    data.writeInterfaceToken("android.ui.ISurfaceComposer");       // ← legacy ISurfaceComposer token, NOT android.gui
    data.writeInt(uid); data.writeInt(pid); data.writeInt(permBits); data.writeString(packageName);
    mClient.transact(OPLUS_NOTIFY_AUTH_INFO, data, reply, 0);
    reply.readException();
    return reply.readInt() == 0;                                   // success iff reply int == 0
}
```
Public wrapper `OplusSurfaceComposerClient.notifyAuthInfo(...)` guards `uid>0 && pid>0` then delegates to
`mSFClient`. (Sibling code 22022 = `OPLUS_SURFACEFLINGER_PERF_INFO`, unrelated.)

- **Transaction code = 24001 (0x5dc1)** on the **legacy** `"android.ui.ISurfaceComposer"` binder (the same
  descriptor AOSP uses for `ISurfaceComposer`/the SF service). It is a **NEW OEM code above the AOSP range**
  (the SF AOSP first-call codes are far lower), reached on the *existing* SF service binder — NOT a new service,
  NOT the new AIDL `android.gui.ISurfaceComposer`. This matters for the patch: the SF receiver hooks the
  existing SF `onTransact`, exactly like the EDR `OPLUS_CODE_SET_HDR_VISION_STATUS=0x56ce` path
  (`edr-sf-readside-RE.md`).
- Parcel layout (write order): **`int uid · int pid · int permBits · String16 packageName`**.

### A2. The trigger — WHO calls notifyAuthInfo (PARTIAL / INFERENCE)
`notifyAuthInfo` is invoked from framework/service Java, not from the OCS SDK jar directly. Confirmed callers /
siblings in `oplus-framework.jar` (string + class evidence):
- **Satellite path (VERIFIED present):** `com.oplus.internal.evolution.{SatelliteAgent,IEvolution}.notifySatelliteOcsAuthResult(pkg, uid, pid, byte[] permission)` and `com.oplus.evolution.SatelliteManager` — the satellite-comms OCS-auth result publisher. Log family `"addAuthResultInfo permBits = "`, `"addAuthResultInfo success/failed."`, `"addAuthResultInfo to Pending..."`.
- **Camera path (INFERENCE — exact site not pinned in jadx here):** the camera grant is recorded by the
  cameraserver-side `AuthAppManager::addAuthResultInfo` (code 10001, `oem-client-identity-gate-RE.md` §B1/§B6).
  The SF-side `notifyAuthInfo(...,0x80000000,...)` is the *parallel* publish so SF's composition gate can see the
  grant. The precise Java/native site that calls `OplusSurfaceComposerClient.notifyAuthInfo` for the **camera**
  uid is not located in this pass (candidates: a system_server camera hook, or a native cameraserver→framework
  upcall). It is NOT in the OCS SDK jar and NOT in `OplusCameraManager`. **Follow-up:** trace from the SF binder
  on a live OOS capture (Frida hook `OplusSurfaceComposerClient.notifyAuthInfo`) to get the caller stack + the
  exact `(uid,pid,permBits,pkg)` at camera open.

### A3. The cameraserver auth channel is SEPARATE (VERIFIED, reconciliation)
The framework stub `android.hardware.camera2.OplusCameraManager` (in `oplus-framework.jar`) is a **different**
binder client: `OplusCameraManagerGlobal` marshals codes **10001..10027** onto `ServiceManager.getService("media.camera")` with descriptor **`"android.hardware.camera"`** — the cameraserver `CameraServiceExtImpl` channel from the prior RE. Its `addAuthResultInfo` (code **10001**) writes `{uid,pid,permBits,String pkg}` to **cameraserver**, while `isAuthedClient` (code **10004**) / `setClientInfo` (10005) are the cameraserver auth ladder. **Two distinct auth sinks carry the same `(uid,pid,permBits,pkg)` quad:** cameraserver (10001) and SurfaceFlinger (24001). This doc covers the SF sink; the cameraserver sink is `oem-client-identity-gate-RE.md`.

---

## THREAD B — READ side (SF native, VERIFIED via Ghidra `surfaceflinger-300`)
All addresses are Ghidra (image_base 0x100000); **file_off = addr − 0x100000**.

### B1. The recorder + functions
| Symbol | Ghidra | file_off |
|---|---|---|
| `OplusClientRecorder::get()` (singleton @ global `0xb48770`) | `0x4b9474` | `0x3b9474` |
| `OplusClientRecorder::addOcsAuthInfo(OcsAuthInfo&&)` | `0x6539dc` | `0x5539dc` |
| `OplusClientRecorder::checkOcsPermission(const std::string&, uint)` | `0x653af8` | `0x553af8` |
| `OplusClientRecorder::clearOcsAuthInfo()` | `0x653bcc` | `0x553bcc` |
| `OplusClientRecorder::dump()` | `0x653c04` | `0x553c04` |
| `android::to_string(const OcsAuthInfo&)` | `0x653ac8` | `0x553ac8` |
| `OplusSurfaceFlinger::checkTransactCodeCredentials(uint)` | `0x484240` | `0x384240` |
| SF onTransact case-0x5dc1 body (inside a stripped local fn) | call @ `0x487b34` | `0x387b34` |
| EDR-type permission gate (the consumer, stripped local fn) | `0x4f43ac` | `0x3f43ac` |

`OplusClientRecorder` is a process-global singleton (`get()` lazily constructs at `0xb48770` via a guard).
Layout (from decompiled accessors):
- `+0x38` = `mProcessDataMap` node-list head (per-pid layer-count recorder; `incProcessData`/`decProcessData`).
- `+0x50` = `std::mutex` guarding both maps.
- `+0x78` = **`mOcsAuthInfoMap` : `std::unordered_map<std::string, OcsAuthInfo>`** (begin node-list head at `+0x88`).

### B2. `OcsAuthInfo` struct (VERIFIED from addOcsAuthInfo writes + to_string + checkOcsPermission read)
`addOcsAuthInfo` (decompiled) emplaces by key (the package/proc string) and writes the value:
```
node value base = node+0x28
  *(node+0x28)  = *param2          // 8 bytes  → { int uid; int pid; }   (from stp w_pid,w_uid in onTransact; see B4)
  __move_assign(node+0x30, …)      // std::string packageName            (0x18 bytes, ends 0x48)
  *(node+0x48)  = *(param2+0x20)   // uint permBits
```
So:
```c
struct OcsAuthInfo {              // sizeof ≈ 0x28 (value portion); in-map value at node+0x28
    int          uid;            // +0x00   (relative to value base node+0x28)
    int          pid;            // +0x04
    std::string  packageName;    // +0x08   (libc++ std::string, 0x18)
    uint32_t     permBits;       // +0x20   (== node+0x48)
};
```
`to_string(OcsAuthInfo&)` format @ `0x170af1`: **`"pid=%d uid=%d permission=0x%x packageName=%s"`** — confirms
fields pid/uid/permBits(=permission)/packageName. `dump()` line @ `0x1c5daa`:
**`"       pid: %d, procName: %s, ocs authInfo: 0x%x\n"`** — confirms the in-map dump prints pid, the key
string (procName/pkg), and permBits (`ocs authInfo`). The **map KEY** is the package-or-process name string.

### B3. `checkOcsPermission` — the subset test (VERIFIED, full disasm)
```c
bool OplusClientRecorder::checkOcsPermission(this, const std::string& procName, uint requested) {
    lock(this+0x50);
    node = mOcsAuthInfoMap.find(procName);             // this+0x78
    if (node == 0) { result = false; }                 // ← NOT recorded ⇒ DENIED
    else {
        // log: "checkOcsPermission (0x%x) in cached ocsAuthInfo <to_string>"
        uint stored = *(uint*)(node+0x48);             // OcsAuthInfo.permBits
        result = (requested & ~stored) == 0;           // ★ all requested bits present in stored ⇒ true
    }
    unlock(this+0x50);
    return result;
}
```
Disasm proof (`0x553b7c`): `ldr w8,[x21,#0x48]` (stored permBits); `bics wzr,w20,w8` (`requested & ~stored`);
`cset w20,eq` (== 0). **This is a bitmask SUPERSET check**: the cached grant must contain every requested bit.

### B4. SF onTransact case 0x5dc1 = OPLUS_NOTIFY_AUTH_INFO (VERIFIED, disasm @ file 0x387ac4..0x387b34)
```
readInt32 → uid (w19)
readInt32 → pid (w21)
readInt32 → permBits (w22)
readString16 → String16 pkg ;  String8(pkg)
OplusClientRecorder::get()                              // x20 = recorder
stp w_pid, w_uid, [stack OcsAuthInfo+0x00]             // {uid@+0,pid@+4} packed (note: stored uid/pid order)
<String8 move into OcsAuthInfo.packageName @ +0x08>
stur w_permBits, [OcsAuthInfo+0x20]                     // permBits
OplusClientRecorder::addOcsAuthInfo(recorder, &OcsAuthInfo)   // bl 0x6539dc
```
Parcel read order **uid, pid, permBits, String16 pkg** == the Java write order (A1). ✓

### B5. `checkTransactCodeCredentials` — the SF permission gate for 0x5dc1 (VERIFIED)
`OplusSurfaceFlinger::checkTransactCodeCredentials(uint code)` @ `0x484240` is consulted by SF `onTransact`
before dispatch. For `code == 0x5dc1`:
```c
if (checkPermission(/*perm obj*/ 0xb48628, callingPid, callingUid)) return true;   // permission held ⇒ allow
else { log "Permission Denial: can't access safe media pid=%d, uid=%d, code=0x5dc1"; return false; }
```
- Deny string @ `0x19201f`: **`"Permission Denial: can't access safe media ..."`** ⇒ the required permission is
  **`com.oplus.permission.safe.MEDIA`** (matches the Java client's `PERMISSION_SAFE_MEDIA` constant).
- Companion OEM codes `0x520b`/`0x5b23` use permission obj `0xb48620` (generic `"can't access SurfaceFlinger"`).
  Codes `20000`, `0x7532`, and `code+0x9096999d<3` (i.e. `0x6f696663..65`) are allowed unconditionally.
- ⇒ **The SF caller of `notifyAuthInfo` must hold `com.oplus.permission.safe.MEDIA`** (a signature|privileged
  OEM permission), otherwise SF rejects the transaction before it ever reaches `addOcsAuthInfo`.

### B6. The consumer gate — how an authed result unlocks the OEM path (VERIFIED mechanism)
The `checkOcsPermission` consumer @ `0x4f43ac` is an **EDR-type permission gate** reached on the SF composition
path (vtable-dispatched per layer/effect — no direct BL; consistent with the EDR effect tree in
`edr-sf-readside-RE.md`). Decompiled:
```c
uint edrType = (in_w8 >> 0x10) & 0xff;                 // EDR type carried in a struct-passed arg
layerFlags = *(byte*)(*(snapshot+0x6c8) + 0x29);       // OEM EDR change/state flags byte
switch (edrType) {
  case 1: required = 0x80000000; break;                            // ← the camera's bit
  case 2: if (layerFlags>>2 & 1) return 1; required = 0x40000000; break;
  case 4: if (layerFlags & 0x60) return 1; required = 0x20000000; break;
  case 5: if (layerFlags>>2 & 1) return 1; required = 0x10000000; break;
  case 8: return (layerFlags & 6) ? 1 : (sign(*(snapshot+0x6c8+0x31)) ? 1 : 0);   // no Ocs; pure layer-flag
  default: log "check unknown edr type %d"; return 1;
}
return checkOcsPermission(OplusClientRecorder::get(), procName, required) ? 1 : 0;
```
**permBits semantics (VERIFIED):** the 4 high bits are per-EDR-type grants —
**`0x80000000`=EDR-type-1, `0x40000000`=type-2, `0x20000000`=type-4, `0x10000000`=type-5.**
The camera grants itself **`0x80000000`** = EDR-type-1, the primary HDR/EDR composition path. When the grant is
present in `mOcsAuthInfoMap[procName]`, this gate returns true ⇒ the OEM EDR composition (the 0x5C
view-transform tonemap, `edr-sf-readside-RE.md`) is applied ⇒ the OEM extension/SAT-fusion render path proceeds
⇒ JPEG. On LOS the whole subsystem is absent ⇒ the gate (and the upstream EDR readers) never run ⇒ the OEM
path is never unlocked.

> Note: this gate sits in the **SF EDR composition** subsystem, the read counterpart of the EDR write-side
> (`edr-sf-readside-RE.md` `setEdrMetadata`/`GameEdr::setEDRStatus`). The `+0x6c8` object is the per-layer OEM
> snapshot/`OplusRequestedLayerState`; `+0x29` is its OEM EDR flags byte. The OCS auth and the EDR view-transform
> are two halves of the SAME OEM SF feature set — both absent on AOSP SF.

---

## VERIFIED-vs-INFERENCE ledger

**VERIFIED (tool-derived, this pass):**
- WRITE side is **Java** (`OplusSurfaceComposerClient` in `oplus-framework.jar`); **no native `.so` exports
  `notifyAuthInfo`** (grep over all lib64 dirs = 0). libgui has EDR setters but no Auth/Ocs symbol. (§Premise, A1)
- Transaction **code 24001 / 0x5dc1** on descriptor **`"android.ui.ISurfaceComposer"`**, parcel
  `int uid·int pid·int permBits·String pkg`, reply success == `readInt()==0`. (A1, B4)
- SF `OcsAuthInfo {int uid; int pid; std::string packageName; uint permBits;}`, keyed by pkg/proc string in
  `mOcsAuthInfoMap` (`unordered_map<string,OcsAuthInfo>` @ recorder+0x78). (B2)
- `checkOcsPermission(proc, req)` = **`(req & ~stored.permBits)==0`** subset test; absent key ⇒ false. (B3)
- SF read of code 0x5dc1: reads uid/pid/permBits/pkg, calls `OplusClientRecorder::get()->addOcsAuthInfo`. (B4)
- code 0x5dc1 is gated by **`com.oplus.permission.safe.MEDIA`** in `checkTransactCodeCredentials`. (B5)
- permBits bit map: 0x80000000/0x40000000/0x20000000/0x10000000 = EDR types 1/2/4/5; **camera uses 0x80000000
  (type 1)**; the consumer gates the OEM EDR composition on `checkOcsPermission`. (B6)
- The cameraserver auth channel (codes 10001–10027 on `media.camera`/`"android.hardware.camera"`) is SEPARATE
  from the SF channel; both carry the same `(uid,pid,permBits,pkg)`. (A3)
- Both OOS builds (`.300`, `.201`, same `BP2A.250605.015`) ship the OCS subsystem (strings present in both SF).

**INFERENCE (NOT proven here — LOS A/B deferred; SCHEMA G-SYM):**
- That the SF OCS-auth gap is **the** (or a) root of the LOS no-JPEG. It is a facilitation gap: AOSP SF and AOSP
  framework lack the entire subsystem, so on LOS `notifyAuthInfo` has no client AND SF would `UNKNOWN_TRANSACTION
  (−38)` it anyway, AND the composition gate doesn't exist. SUPPORTED-by-mechanism; convict via OOS↔LOS A/B
  (Frida: confirm OOS fires `notifyAuthInfo(...,0x80000000,...)` at camera open and the gate returns true; LOS
  absent).
- The exact **camera** caller of `OplusSurfaceComposerClient.notifyAuthInfo` (the trigger site + the uid/pid it
  passes). Satellite caller is verified; camera caller is not pinned (A2 follow-up: live Frida hook).
- The consumer `0x4f43ac` is vtable-reached; its owning EDR class name and the precise per-layer call site were
  not fully resolved (the gate logic + the checkOcsPermission edge ARE verified).

---

## LOS-impl PATCH PLAN

Two independent legs must both exist on LOS; the write side is **framework Java**, the read side is **SF native**.

### Option 1 — REIMPLEMENT (the R3 libgui/SF ABI pattern) — RECOMMENDED
**Leg 1 — WRITE side (framework Java).** Add `com.oplus.display.OplusSurfaceComposerClient` to the LOS
framework (it is a self-contained Java class — reproduce A1 verbatim). It needs:
  - The transaction: token `"android.ui.ISurfaceComposer"`, code `24001`, parcel `uid,pid,permBits,pkg`,
    `transact(...,0)`, success `reply.readInt()==0`.
  - A **trigger**: call `OplusSurfaceComposerClient.get().notifyAuthInfo(camUid, camPid, 0x80000000, camPkg)` at
    camera-session setup for the authed camera client. Simplest LOS placement: from the same hook that already
    drives the cameraserver auth (the `oem-client-identity-gate-RE.md` path), publish to SF in parallel. The
    caller's process must hold **`com.oplus.permission.safe.MEDIA`** (grant it in the LOS framework
    permission/privapp-permissions for that uid, or send from a system context that already holds it — system
    server / cameraserver-adjacent). If the caller can't hold safe.MEDIA, also patch SF's
    `checkTransactCodeCredentials` to allow 0x5dc1 (Leg 2 already touches SF).

**Leg 2 — READ side (SF native).** Reproduce, in the LOS SF (`frameworks/native` SurfaceFlinger or an OEM
overlay shim), exactly:
  1. `OplusClientRecorder` singleton with `std::unordered_map<std::string, OcsAuthInfo>` and a mutex;
     `OcsAuthInfo{int uid; int pid; std::string packageName; uint permBits;}` (§B2).
  2. `addOcsAuthInfo(OcsAuthInfo&&)` → `map[key]=info` (key = pkg/proc string); `checkOcsPermission(proc, req)`
     → `(req & ~map[proc].permBits)==0`, absent ⇒ false (§B3).
  3. In SF `onTransact`, add case `24001`: `readInt32 uid; readInt32 pid; readInt32 permBits; readString16 pkg;`
     `OplusClientRecorder::get().addOcsAuthInfo({uid,pid,String8(pkg),permBits}); reply.writeNoException();
     reply.writeInt(0);` and allow it in `checkTransactCodeCredentials` (require safe.MEDIA, or allow if Leg-1
     caller is trusted) (§B4/B5).
  4. The **consumer**: gate the OEM EDR composition (the EDR view-transform apply, `edr-sf-readside-RE.md`) on
     `checkOcsPermission(procName, 0x80000000)` for EDR-type-1 (§B6). NOTE: this only matters if the LOS port
     also reimplements the OEM EDR read path; if the EDR subsystem is itself absent on LOS, the recorder alone is
     necessary-but-not-sufficient — the **EDR composition read side must also exist** (it does not in AOSP SF).
     ⇒ Leg 2 is **co-dependent with the EDR-read-side port** (`edr-sf-readside-RE.md`): the OCS recorder is the
     *gate input*; the EDR view-transform reader is the *gated feature*. Port both or neither.

This is the same shape as the EDR `OPLUS_CODE_SET_HDR_VISION_STATUS=0x56ce` add-a-binder-case pattern; keep all
offsets out of the patch (reimplement by behavior, not by offset).

### Option 2 — SHIP the OOS blobs (Treble/risk tradeoff)
- **libgui.so swap: USELESS for OCS auth.** The write side is NOT in libgui (Premise correction). Swapping
  `libgui.so` buys nothing for this feature (it would only matter for the EDR *transaction setters*, a separate
  concern).
- **surfaceflinger binary swap: HIGH RISK, NOT Treble-safe.** `surfaceflinger` is a `/system` binary tightly
  coupled to the exact `frameworks/native`/libgui/`libsurfaceflinger`/HWC HAL versions of the OOS build. Dropping
  the OOS `surfaceflinger` (md5 `100c0288…`) onto LOS will almost certainly fail to link/boot (ABI skew with the
  LOS `libgui`, `libsurfaceflinger`, composer HAL, sepolicy). It also drags in the entire OEM SF feature set
  (EDR, DolbyVision, blur, traces). **Not recommended.**
- **oplus-framework.jar (the write side): viable to ship** — it is a prebuilt OEM framework jar the port likely
  already overlays for other OEM framework hooks; it self-contains `OplusSurfaceComposerClient`. But it is
  inert without the SF read side. So even the "ship the jar" route requires Leg-2 SF work.

**Verdict:** Option 1 (reimplement both legs as the R3 ABI pattern), co-developed with the EDR-read-side port.
Blob-swap is a dead end for the SF binary; the libgui swap is irrelevant here.

---

## Anchors / follow-ups
- Pairs with `oem-client-identity-gate-RE.md` (cameraserver auth ladder; the SEPARATE 10001/10004/10005 channel)
  and `edr-sf-readside-RE.md` (the EDR composition read side that this OCS gate guards).
- Image base 0x100000; file_off = Ghidra addr − 0x100000. Ghidra program: `surfaceflinger-300`
  (`/tmp/ocs-re/surfaceflinger-300`, md5 `100c0288f091f1e7311611d7620ce05e`).
- **Follow-up (LOS conviction):** Frida-hook `com.oplus.display.OplusSurfaceComposerClient.notifyAuthInfo` on
  OOS to capture (a) the camera caller stack, (b) the exact `(uid,pid,permBits,pkg)` at camera open; and hook
  the SF onTransact 0x5dc1 to confirm the recorder write + the composition-gate read. Then A/B vs LOS (absent).
