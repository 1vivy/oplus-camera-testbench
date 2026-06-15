<!-- STATUS: VERIFIED OBSERVATIONS (jadx OCS-SDK jar + Ghidra libcsextimpl.so, 2026-06-15) separated from INFERENCE.
     Static RE only; no A/B run here. The allowlist-as-root claim stays INFERENCE until LOS A/B (libcsextimpl.so absent on LOS). -->
# OEM client-identity → OEM-extension-pathway gate (static RE)

> Phase-2 static reverse-engineering of *how* `com.coloros.ocrscanner` / `com.oplus.camera` authenticate as
> OEM clients and are granted the `op_mode=0x8001` extension pathway, beyond the live trace in
> `tools/observability/campaign/conditions/scandoc.env:13-24`.
>
> Date: 2026-06-15 · Two sources:
> - **Jar** (Thread A): `/product/framework/com.oplus.camera.unit.sdk.jar` (the OCS-SDK; pulled to
>   `/tmp/ocs_sdk.jar`, 5,058,475 B, 843 classes) + `…unit.sdk.adapter.jar` (`/tmp/ocs_sdk_adapter.jar`).
>   NOTE: the jar is at `/product/framework/`, NOT `/system_ext/` as the plan assumed (that path returns ENOENT).
>   jadx-mcp `load_apk` OK.
> - **Binary** (Thread B): `/home/vivy/op15-work/dump201_full/system_ext/lib64/libcsextimpl.so` (AArch64,
>   image_base `0x100000`; file_off = Ghidra_addr − 0x100000). Already open in ghidra-mcp project; 2748 fns.
>   C++ names retained in `.dynsym`.
>
> Axiom (SCHEMA.md trunk): a byte-identical blob is a SITE, never a ROOT. The allowlist contents below are a
> *site* (the policy lives in this `/system_ext` blob + a `/data`/`/vendor` config it reads); the *root* of the
> LOS divergence is environmental — `libcsextimpl.so` is absent on LOS (`d654641`), so the codes return −38.

---

## TL;DR

The gate is a **three-tier identity ladder**, two tiers in the SDK (Java) and one tier in cameraserver (native):

1. **SDK tier-1 (hardcoded first-party):** `"com.oplus.camera".equals(pkgName)` → authed. (`CameraUnitImpl.isAuthedClient`)
2. **SDK tier-2 (config allowlist):** `CameraConfigHelper.isInAuthedWhiteList(pkgName)` → substring-match against
   a JSON unit-config value keyed `com.oplus.authed.white.list`. (data-driven, NOT baked in the jar)
3. **Native tier-3 (cameraserver):** `OplusCameraManager.getInstance().isAuthedClient(ctx)` → binder transact to
   `CameraServiceExtImpl::onTransact` **code 10004** → `android::AuthAppManager::isAuthedClient(uid, pkg, …)`,
   which checks (a) a runtime `(uid→pkg)` map populated by **code 10005 SET_CLIENT_INFO**, (b) an auth-result
   set with a **~24 h validity window**, and (c) a separate **hardcoded 7-package privileged list**
   (`isPrivilegedApp`).

The `op_mode=0x8001` is independent of the auth result: it is an **OR-combination of per-mode + per-feature
hex strings** built by `OperationModeDecision`, then carried to CamX as vendor-tag
**`com.oplus.extension.operation.mode`**, which `getExtensionOperatingMode` reads. The `arg_mode=0x1b5f2bc1`
token from the live trace is **NOT present in either jar** (any encoding) — see §A4.

---

## THREAD A — OCS-SDK jar (VERIFIED, jadx)

### A1. The auth ladder — `CameraUnitImpl.isAuthedClient` (VERIFIED)
`com.oplus.ocs.camera.CameraUnitImpl.isAuthedClient(Context)`:
```java
if (!"com.oplus.camera".equals(context.getPackageName())
        && !CameraConfigHelper.isInAuthedWhiteList(context.getPackageName())) {
    return OplusCameraManager.getInstance().isAuthedClient(context);   // <- native tier
}
return true;                                                            // first-party or config-allowlisted
```
- `OplusCameraManager` is imported as **`android.hardware.camera2.OplusCameraManager`** — a *framework stub*
  class that lives OUTSIDE both jars (the E1 stub layer). The SDK never assembles raw binder codes itself; it
  delegates to this manager, which is the binder client that reaches `CameraServiceExtImpl::onTransact`.
- Same class also calls `OplusCameraManager.getInstance().preOpenCamera(ctx)` and `.setDeathRecipient(new Binder())`.
- `checkAuthenticationPermission(ctx, ver, code)` gates on `CameraConfigHelper.isConfigFileExist(isSystemCameraPackage(pkg))`
  — i.e. the SDK refuses to authenticate at all if the OEM unit-config JSON is missing.

### A2. The config allowlist — `CameraConfigHelper.isInAuthedWhiteList` (VERIFIED)
```java
public static boolean isInAuthedWhiteList(String str) {
    Map<String,String> m = sVendorTagMap;
    if (m == null) m = new JsonParser().loadUnitConfigAndParseVendorTag();
    String str2 = m.get(CameraConfigBase.KEY_AUTHED_WHITE_LIST.getName());
    return str2 != null && str2.contains(str);          // <- substring .contains, not exact match
}
```
- `CameraConfigBase.KEY_AUTHED_WHITE_LIST = new Key<String>("com.oplus.authed.white.list", String.class)`
  (recovered from the dex string table; the field-key NAME is `com.oplus.authed.white.list`).
- The allowlist **content** is loaded from the JSON unit-config at runtime (`JsonParser.loadUnitConfigAndParseVendorTag`),
  NOT baked into the jar — so the jar cannot tell us *which* third-party packages are config-allowed; that is a
  `/my_product`/`/product` etc. data file. (A `.contains()` substring test means the config value is a delimited
  package blob.)

### A3. op_mode is an OR-combined hex string — `OperationModeDecision` (VERIFIED)
`com.oplus.ocs.camera.producer.decision.OperationModeDecision`:
- `MODE_OPERATION_BEGINNING = "8"` (a string constant — the high-nibble "OEM extension" marker).
- `updateOperationMode()` takes the per-mode base (`CameraConfigHelper.getModeOperationModeMap().get(modeName)`)
  and the per-feature contribution (`parserFeatureOperationMode` → `FeatureImpl.getOperationMode(value)` which
  looks the value up in a per-feature `mFeatureOperationModes` map), then:
  ```java
  private static String calculateOperationMode(String a, String b) {
      ...
      return Integer.toHexString(Integer.valueOf(a,16).intValue() | Integer.valueOf(b,16).intValue());
  }
  ```
  i.e. **`op_mode = base | feature` as 16-bit hex strings**, seeded from `"8"`. This is exactly why the live
  values are `0x8001` (base 0x8000 | feature 0x0001) and `0x80a9` for 8K (extra feature bits OR'd in).
- All inputs (`getModeOperationModeMap`, `getFeatureOperationMode`, the per-feature value→mode maps) are loaded
  from the OEM config — so the *specific* `0x8001`/`0x80a9` numbers are config-data, not jar constants.

### A4. The `0x1b5f2bc1` token is NOT in the jar (VERIFIED-NEGATIVE)
- Searched both dex blobs (`/tmp/ocs_extract/classes.dex`, `/tmp/ocs_adapter/classes.dex`) for `459957185`
  (=0x1b5f2bc1) as: raw LE/BE 4-byte literal, ULEB128, decimal string, hex string, `0x…` string. **0 hits in all
  encodings, both jars.**
- Conclusion: `arg_mode=0x1b5f2bc1` is **not a constant the OCS-SDK computes or stores**. It is either built at a
  layer the SDK delegates to (the `android.hardware.camera2.OplusCameraManager` framework stub / native), or
  passed down from the scanner app itself, or assembled by native `getExtensionOperatingMode` callers. The SDK's
  own op-mode value is the hex-string OR-combination (§A3), which yields `0x8001`, not `0x1b5f2bc1` — so
  **`0x1b5f2bc1` and `0x8001` are different quantities**: 0x1b5f2bc1 is the *arg_mode the provider receives*, and
  getExtensionOperatingMode maps it to 0x8001 (see §B2; the mapping is the vendor-tag override, not arithmetic on
  the token). This refines scandoc.env's open question: the token does NOT live in the jar.

### A5. `TRANSACTION_*` codes in the jars are the APSClient channel, not the ExtImpl codes (VERIFIED)
Both jars contain a large `FIRST_CALL_TRANSACTION`/`TRANSACTION_*` enum (`TRANSACTION_ALGO_INIT`,
`TRANSACTION_CALLBACK_PREVIEW`, `TRANSACTION_ADD_FRAME_BUFF`, …). These belong to the **APSClient algo-process
binder interface** (the `APSClient.transact` native bridge from C1's consume path), NOT the cameraserver
`CameraServiceExtImpl` 100xx codes. The 100xx codes are emitted only by the out-of-jar `OplusCameraManager` stub.

### A6. `ClientPackageManager` is CTS/ITS test packages, not the OEM gate (VERIFIED, exclusion)
`com.oplus.ocs.camera.extensions.pkg.ClientPackageManager` holds Base64-encoded package names that decode to
`androidx.camera.integration.extensions`, `androidx.camera.integration.extensions.test`, `android.camera.cts`,
`com.android.cts.verifier` — the camera2-extensions CTS/ITS strategy selector. **Not** part of the OEM-identity gate.

---

## THREAD B — `libcsextimpl.so` (VERIFIED, Ghidra; addrs are Ghidra image-based, file_off = addr − 0x100000)

### B1. The identity functions
| Symbol | Ghidra | file_off | finding |
|---|---|---|---|
| `CameraServiceExtImpl::isSystemCameraPkgName(char*)` | `0x174d08` | `0x074d08` | reads a config-driven package list (NOT a baked string); see §B3 |
| `CameraServiceExtImpl::isSystemCameraUid(int)` | `0x176c94` | `0x076c94` | walks a **runtime RB-tree** at `this+0x350`/`+0x358` comparing `node+0x1c == uid`; the UID set is *populated at runtime*, NOT hardcoded |
| `AuthAppManager::isAuthedClient(int uid, String8 pkg, bool, bool)` | `0x1b1dbc` | `0x0b1dbc` | the real native auth check; see §B4 |
| `AuthAppManager::isPrivilegedApp(String8)` | `0x1b2494` | `0x0b2494` | **hardcoded 7-package allowlist**; see §B5 |
| `AuthAppManager::addToPackageNameAndUidMap(String16 pkg, int uid)` | `0x1b26b4` | `0x0b26b4` | SET_CLIENT_INFO storage; inserts `pkg`→`uid` into the RB-tree at `this+0x108`/`+0x110` |
| `AuthAppManager::addAuthResultInfo(int,int,int,String8)` | `0x1b156c` | `0x0b156c` | records an auth result (uid, value, timestamp via clock) into the vector at `this+8`/`+0x18` |
| `AuthAppManager::checkAuthResult(int,int,String8,void*)` | `0x1b1c80` | `0x0b1c80` | consults the auth-result set + a death-recipient binder set |
| `AuthAppManager::isAuthedClient(void*)` | `0x1b2404` | `0x0b2404` | binder-pointer overload — checks a wp<IBinder> set at `this+0x60`/`+0x68` |
| `AuthAppManager::setDeathRecipient(sp<IBinder>&,int,int)` | `0x1b1924` | `0x0b1924` | registers the client binder for death notification |

`_GLOBAL__sub_I_AuthAppManager.cpp @ 0x1b31b8` — the auth manager is its own translation unit (`AuthAppManager.cpp`).

### B2. `getExtensionOperatingMode` — vendor-tag override (VERIFIED)
`CameraServiceExtImpl::getExtensionOperatingMode(const CameraMetadata&, m, int)` @ Ghidra `0x188818` (file `0x088818`):
```c
// reads vendor-tag id UNK_00142f77 from the metadata
iVar2 = find_camera_metadata_entry(&UNK_00142f77, entry_buf, &slot);   // func_0x0024b6c8
if (iVar2 == 0) {                                                       // tag PRESENT
    find_entry(&slot, metadata, tagid);                                 // func_0x0024b6e0
    if (count != 0) uVar12 = *entry.data;                               // op_mode := tag value
    else            uVar12 = (uint)param_4;                             // else fall back to passed-in default
    return uVar12;
}
// tag absent → return default param_4
```
- **Vendor-tag id `UNK_00142f77` = the ASCII string `"com.oplus.extension.operation.mode"`** (read directly from
  `0x142f77`). So the op_mode override is driven by the CamX/metadata vendor-tag of that name.
- Mechanism CONFIRMED: arg_mode passed in (`param_4`, the `0x1b5f2bc1` the provider sees) is **overridden** to the
  value stored in the `com.oplus.extension.operation.mode` vendor-tag (= `0x8001`, or `0x80a9` for 8K). It is a
  **tag-lookup override, not arithmetic** on the token — which is why the token need not appear anywhere as 0x8001.

### B3. `isSystemCameraPkgName` — config-driven list, with the config KEYS recovered (VERIFIED)
The function loads a delimited string from config and splits it on `';'` (`0x3b`) — it does NOT carry the package
names itself. The string referenced inline (`UNK_00140718`) is just the separator `";"`. The config KEYS it
reads are recovered from the adjacent string pool at `0x13beaa`:
- **`privileged_app_list`** (`0x13beaa`)
- **`skip_3rd_app_aftrigger_list`** (`0x13bebe`)

So `isSystemCameraPkgName` checks the caller package against the `privileged_app_list` value loaded from an OEM
config file (a `/data` or `/vendor` cameraservice config). The list *content* is environmental, not in the blob.
It also calls `is3rdPartyAppPrivileged(String16)` inline.

### B4. `AuthAppManager::isAuthedClient(uid, pkg, b1, b2)` — the real check (VERIFIED)
Decompiled logic (params: `uid`, `String8* pkg`, `bool checkTime`, `bool requireTimeWindow`):
1. Iterate the auth-result vector at `this+0x10` (count `this+0x18`); for each entry whose `uid` matches, compare
   the stored package string to `pkg`.
2. If `requireTimeWindow` (b2) AND pkg matches: compute `|now − stored_timestamp|` (clock at `func_0x0024d378`)
   and require it `< 0x15181` (= **86401 seconds ≈ 24 h**) — i.e. **the auth is time-limited to ~1 day**. Outside
   the window → not authed (and logs "…" via the debug path).
3. If no time-gated match, fall through to: look up `pkg` in the **`pkg→uid` RB-tree at `this+0x108`** (the
   SET_CLIENT_INFO map, §B6) and verify the tree node's uid `== uid`.
Returns the boolean to the onTransact reply parcel.

### B5. `AuthAppManager::isPrivilegedApp` — the HARDCODED 7-package allowlist (VERIFIED — actual strings)
`isPrivilegedApp(String8)` does a flat `strcmp` of the package against **7 baked strings** (recovered from the
blob's `.rodata`):
| # | package | (addr) |
|---|---|---|
| 1 | `com.ss.android.ugc.aweme` | `0x147b4c` |
| 2 | `com.meitu.meiyancamera` | `0x13a5d3` |
| 3 | `com.finshell.wallet` | `0x149d96` |
| 4 | **`com.coloros.ocrscanner`** | `0x149daa` |
| 5 | `com.fintech.life` | `0x14846c` |
| 6 | `com.oplus.omoji` | `0x13b774` |
| 7 | `com.coloros.smartsidebar` | `0x13e2de` |

This is **THE identity-gate policy baked into the blob** — `com.coloros.ocrscanner` (#4, the doc-scanner from the
scandoc.env capture) is on it. NOTE: `com.oplus.camera` is **NOT** in this native list — the camera app is gated
by the SDK tier-1 hardcode (§A1) and/or `isSystemCameraPkgName`'s config list (§B3), a separate path.

### B6. onTransact dispatch — the relevant codes (VERIFIED from the `switch` @ 0x1726f0)
`CameraServiceExtImpl::onTransact` @ Ghidra `0x1726f0` (file `0x16f6f0`), `switch(code)` over `0x2711..0x272b`
(10001..10027), `default → 0xffffffda = −38` (UNKNOWN_TRANSACTION). The auth-relevant cases:

| Code | hex | handler (decompiled) |
|---|---|---|
| **10004** | `0x2714` | **CLIENT_IS_AUTHED.** reads String16 pkg → calls `param_1[0x10]->isAuthedClient(getCallingUid, pkg, 1, 1)` (= `AuthAppManager::isAuthedClient`, §B4) → writes the bool back to the reply parcel via `func_0x0024b878(param_4, result)`. **This is the auth gate.** (Matches the live trace's "10004 CLIENT_IS_AUTHED x1".) |
| **10005** | `0x2715` | **SET_CLIENT_INFO.** reads String16 pkg + 2 ints (`uid`, 2nd int). Calls `param_1[0x10]->addToPackageNameAndUidMap(pkg, uid)` (§B6 storage), inserts `uid` into the RB-tree at `param_1[0x6b]` (separate uid index, `+0x6c` count), and stores `uid`→`param_1+0x6d`, 2nd int→`param_1+0x36c`. (Matches live "10005 SET_CLIENT_INFO x43".) |
| 10003 | `0x2713` | setPackageName — locked write into the `param_1+0x69` map (the live trace explicitly saw 10005 NOT 10003). |
| 10001 | `0x2711` | addAuthResultInfo — 3 ints + String16 → `param_1[0x10]->fn(...)` (= `AuthAppManager::addAuthResultInfo`, §B1). |
| 10027 | `0x272b` | privileged-app query — reads int, looks up the map at `param_1[0x108]` (the SET_CLIENT_INFO tree) → reply string. |
| 10015 | `0x271f` | SEND_OPLUS_EXT_CAM_CMD — builds `aidl…sendextcamcmd::ExtCamCmd`, vtbl `*param_1+0x430` (the validated zoom/cmd channel; live "10015 x3"). |

`param_1[0x10]` is the `AuthAppManager` instance pointer (its methods are reached vtable-style; the RE xrefs to
`isAuthedClient`/`addToPackageNameAndUidMap` are DATA xrefs = vtable slots, consistent with this call shape).

> Reconciliation with scandoc.env:13-16 and the prior doc: the live trace and this static dispatch **agree** that
> 10004 = CLIENT_IS_AUTHED and 10005 = SET_CLIENT_INFO. (The Phase-2 prompt's "10004 … dispatch ~0x2724" was an
> approximation; the binary places the isAuthedClient handler at case `0x2714` = 10004, and `0x2724` = 10020 is an
> unrelated device-callback register. Use `0x2714` for 10004.)

---

## What is VERIFIED vs INFERENCE

**VERIFIED (tool-derived):**
- The 3-tier auth ladder (§A1) and its exact SDK source.
- The config-allowlist key `com.oplus.authed.white.list` / `isInAuthedWhiteList` substring semantics (§A2).
- op_mode = OR-combined hex strings seeded from `"8"`; carried as vendor-tag `com.oplus.extension.operation.mode`
  which `getExtensionOperatingMode` reads to OVERRIDE arg_mode → 0x8001/0x80a9 (§A3, §B2).
- `0x1b5f2bc1` is absent from both jars in every encoding (§A4).
- The **hardcoded native 7-package privileged allowlist** incl. `com.coloros.ocrscanner` (§B5), the
  `isAuthedClient` ~24 h time-window + uid/pkg map check (§B4), and the 10004/10005 onTransact handlers (§B6).
- `isSystemCameraUid` is a runtime RB-tree (registered, not baked); `isSystemCameraPkgName` reads a config
  `privileged_app_list` (§B1, §B3).

**INFERENCE (NOT proven here — LOS A/B deferred; SCHEMA.md G-SYM):**
- That this identity gate is *THE root* granting the extension pathway. It is a **SITE** in a `/system_ext` blob
  that is byte-absent on LOS; the live trace shows the codes fire on OOS, and scandoc.env records that on LOS
  `libcsextimpl.so` is dropped (`d654641`) → 10004/10005 return −38 → client degrades to vanilla camera2. The
  causal claim (gate ⇒ pathway) needs the OOS↔LOS A/B to convict (G-SYM/G-MECH); until then it stays SUPPORTED-
  by-mechanism, not CONVICTED. Per the trunk axiom, the blob is a site; the root is the facilitation gap (the
  blob + its config + the `OplusCameraManager` framework stub absent on our port).
- The *content* of the SDK config allowlist (`com.oplus.authed.white.list`) and of `privileged_app_list` /
  the per-mode/per-feature op-mode maps: these are environmental config files (not in the jar/blob), un-read here.
- The provenance of `0x1b5f2bc1` (which layer emits it as the provider arg_mode): not in the jar; candidates are
  the out-of-jar `android.hardware.camera2.OplusCameraManager` stub or the scanner app. Un-resolved.

## Blockers / deviations from plan
- Jar path was `/product/framework/com.oplus.camera.unit.sdk.jar`, not `/system_ext/…` (plan's path ENOENT).
  Resolved by `find` on device; pulled via `adb shell su -c cat`.
- jadx-mcp `search_method_by_name` matches exact method names only (no substring); used `get_class_source` +
  dex `strings` grep to fill gaps. `CameraConfigBase` resolves under `com.oplus.ocs.camera.common.util`, not
  `producer.info` (one class-source pull exceeded the token cap and was grepped from the saved file instead).
- `0x1b5f2bc1` token search is a VERIFIED-NEGATIVE (absent), not a blocker.
