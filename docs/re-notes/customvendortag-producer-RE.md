<!-- STATUS: VERIFIED observations (jadx OCS-SDK jar + Ghidra com.qti.feature2.gs.sm8850.so + repo A/B capture corpus, 2026-06-15)
     separated from INFERENCE. Static RE + existing capture logs only; no new device run here.
     IMPORTANT: this note CORRECTS the task brief's premise (see §0). -->
# `customVendorTag` producer + the OEM-extension gate (static RE)

> Phase-N static reverse-engineering of the CHI value logged as **`customVendorTag`** (`GetPruneDecisionFactors()
> … customVendorTag 120 … captureType 0`), the brief's "no-JPEG sink (a)": OOS=120, LOS reported=0 → claimed
> `oemChimetadatas.size 0` → SR-CCM null → no JPEG.
>
> Date: 2026-06-15. Sources:
> - **OCS SDK jar** (jadx-mcp): `/tmp/ocs_sdk.jar` = `com.oplus.camera.unit.sdk.jar` (843 classes; on device
>   `/odm/etc/...`-config-driven). Also dex `strings`/baksmali over `/tmp/ocs_extract/classes.dex`,
>   `/tmp/ocs_smali/`.
> - **CHI graph-selector blob** (Ghidra, 2 sub-agent passes): `vendor/lib64/com.qti.feature2.gs.sm8850.so`
>   (md5 `44dfea54803388a209373fa13addacc1`; copy `/tmp/gs-re/...`). **ELF image base 0; ELF_off = Ghidra_addr − 0x100000.**
> - **cameraserver ExtImpl** `libcsextimpl.so` (`getExtensionOperatingMode`, the `com.oplus.extension.operation.mode`
>   override) — already RE'd in `oem-client-identity-gate-RE.md` §B2.
> - **Repo A/B capture corpus**: `reference/_golden-oos-V16.1.0/campaign/<cond>/run1/ab/{,_pull/}logcat_all.txt`
>   (`ab` = OOS `OPlus`; `_pull` = LOS `infiniti`) + `dumpsys_camera_pre.txt`.
>
> Axiom (SCHEMA trunk): a byte-identical blob is a SITE, never a ROOT.

---

## 0. ⚠️ PREMISE CORRECTION — the brief's "LOS=0 always" is REFUTED by the repo's own A/B data

The brief states the divergence is **"LOS customVendorTag = 0 (never set)"** and that this is THE no-JPEG root.
The campaign A/B corpus that already lives in this repo does **not** support "never": **`customVendorTag` is
condition/scene/run-dependent on BOTH sides**, and LOS DOES produce 120 in at least one clean condition.

`grep -ho "customVendorTag [0-9]*"` per A/B pair (`ab`=OOS, `_pull`=LOS), `_golden-oos-V16.1.0/campaign`:

| condition | OOS (`ab`) | LOS (`_pull`) |
|---|---|---|
| photo (`ab/oos-photo`) | **120** (172×) | — |
| night | 120 (6×) | **0** (14×) |
| filter | 120 (9×) | **0** (10×) |
| burst | 120 (12×) | **0** (4×) |
| p010 | 120 (43×) | **0** (14×) |
| motionphoto | 120 (1×) | **0** (14×) |
| **beauty** | 120 (2×) | **120 (27×)** + 0 (1×) |
| photo-hdr | **0** (10×) *and* `oemChimetadatas.size:0` | (no F2GS customVendorTag emitted) |

OOS golden whole-corpus: `120` ×3705, `0` ×4. So 120 is OOS's *dominant* value, NOT universal (photo-hdr =0 on
OOS too). And LOS's `beauty` run is a clean **counterexample to "LOS never sets it"** — LOS produced 120 27×.
This independently corroborates the project's own **REFUTED-LOG R-06 / doc-47** ("`customVendorTag 120` PRESENT in
v19 LOS logs; GCVT=0-as-no-JPEG-root REFUTED, do-not-re-chase").

**Net:** `customVendorTag` is **not a hard LOS-vs-OOS binary gate**. The dominant LOS value is 0 in most
conditions, but the quantity is a *computed, scene-dependent decision code*, not an auth flag that is on/off. The
"LOS=0 always → no-JPEG" framing is an over-unification; see §3 for what actually drives 120 vs 0. The no-JPEG
verdict should NOT rest on customVendorTag alone.

---

## 1. The customVendorTag PRODUCER — it is a CHI-computed decision code, NOT an app-set vendor tag (VERIFIED)

**`customVendorTag` is produced inside CHI, not written by the app/SDK.** It is the return of
`ChiFeature2GraphSelectorOEM::GetCustomVendorTagFromCaptureIntent` in `com.qti.feature2.gs.sm8850.so`, surfaced by
`ChiFeature2GraphSelector::GetPruneDecisionFactors` (the log site, `chifeature2graphselector.cpp:3006`).

| symbol | Ghidra addr | ELF off |
|---|---|---|
| `ChiFeature2GraphSelectorOEM::GetCustomVendorTagFromCaptureIntent` | `0x208970` | `0x108970` |
| base `ChiFeature2GraphSelector::GetCustomVendorTagFromCaptureIntent` (fall-through → **0**) | `0x1e91e0` | `0xe91e0` (PLT `0x180920`) |
| `ChiFeature2GraphSelector::Initialize` (writes the op-mode field) | `0x18b360` | `0x8b360` (store @ `0x8b444`) |
| `ChiFeature2GraphSelector::GetPruneDecisionFactors` (the log site) | `0x1a5200` | `0xa5200` |
| the **only** `mov w28,#0x78` (= 120) site | `0x208fcc` | `0x108fcc` |
| HDR-mode source `ExtensionModule::GetLogicalDeviceHDRModeInfo` | (PLT) `0x181250` | — |
| HDR-mode source `ExtensionModule::GetPhysicalDeviceHDRModeInfo` | (PLT) `0x180c08` | — |

- The blob contains **no `com.oplus.*` vendor-tag string and no OEM tag-section read** for this value. It reads
  only QTI/AOSP tags (`com.qti.chi.stackedFrame`, `com.qti.chi.qllControl`,
  `com.qti.stats.internal.perFrame.frameControl`, `org.codeaurora.qcamera3.af_bracket`) plus internal helpers
  (`GetSceneMode`, `GetNoiseReductionMode`, `IsAFBracketingPossible`, `IsUnifiedHDRMode`).
- **120 = 0x78** is a single branch's literal — a **capture-graph selection / still-capture decision code**, NOT a
  count, size, or bitmask. The function returns a dense space of such codes (0x67, 0x69–0x71, 0x77–0xa9).

So "who *sets* customVendorTag 120" = **CHI's OEM graph selector computes it**; nothing in the app or OCS SDK
"writes" it. The app/SDK only supply the **inputs** (op-mode + HDR/scene/capture-intent metadata) the selector
decides on. This reframes the brief's Q1: there is no app-side `com.oplus.*customVendorTag` producer to port.

---

## 2. What feeds the selector — op-mode (`selector+0x538`) and how 0x8001 gets there (VERIFIED)

`GetCustomVendorTagFromCaptureIntent` gates branches on `*(uint*)(this+0x538) < 0x8001` (the "+0xa7" qword index).
That field is written **once at configure time** by `ChiFeature2GraphSelector::Initialize`:
```
0x8b430  ldr  w15,[x19,#0x70]   ; ChiFeatureGraphManagerConfig->[0x70] = the CHI session operation_mode
0x8b444  str  w15,[x20,#0x538]  ; selector->op_mode = that
```
i.e. **selector op-mode = the CHI/CamX StreamConfiguration `operation_mode`** carried through
`AdvancedCameraUsecase::Initialize` — NOT a per-request vendor tag inside the GS blob.

**How operation_mode becomes 0x8001 (two converging paths — both VERIFIED):**
1. **SDK path (Java, this jar).** `OperationModeDecision.updateOperationMode` builds the hex op-mode string
   (`base "8" | feature`, §A3 of `oem-client-identity-gate-RE.md`) → `CameraSessionEntity.setOperationMode(...)` →
   the SDK calls `createCaptureSession with operation mode: 0x8001` (log string present in the dex; the SDK passes
   it as the `SessionConfiguration` session/operation mode). The SDK **also** stamps the per-request vendor tag
   `com.oplus.extension.operation.mode` (= `KEY_EXTENSION_OPERATION_MODE`, tag-id `0x8114007d`) from
   `BaseMode`/`CameraMetadataKey` using `getOperationMode()`, and the extension extenders
   `HDRRequestTask`/`BokehRequestTask`/`NightRequestTask` set it too (`/tmp/ocs_smali/.../extender/*.smali:350`).
2. **cameraserver override path (native).** `libcsextimpl.so::CameraServiceExtImpl::getExtensionOperatingMode`
   reads the `com.oplus.extension.operation.mode` tag and **overrides** the session op-mode ("update operation
   mode from %d to %d") before `configure_streams` (`oem-client-identity-gate-RE.md` §B2).

Either way, the value that reaches `ChiFeatureGraphManagerConfig+0x70` → `selector+0x538` is the session
operation_mode, and the `com.oplus.extension.operation.mode` tag is the carrier. (OOS dumpsys confirms the OOS
session op-mode is `0x8001`.)

---

## 3. The REAL discriminator for 120 vs 0 — HDR-mode + capture-intent, with op-mode as a SECONDARY gate (VERIFIED)

This is the load-bearing correction to the old "op_mode 0x8001 ⇒ customVendorTag 120" story. Disasm of
`GetCustomVendorTagFromCaptureIntent`:

```
0x208e88  cmp  w6,#2              ; w6 = captureIntent (param_3)
0x208e90  ccmp ... ;  w12 = (intent==2) || ((intent & ~3)==4)   → "is a snapshot/still intent"
0x208e98  cbz  w23,0x208f70       ; if (HDRmode==0) → OEM still tree (the inner com.oplus codes)
0x208e9c  tbz  w12,#0,0x208fc0    ; if NOT snapshot intent → non-snapshot branch
0x208fc0  cmp  w23,#1             ; HDRmode == 1 ?
0x208fcc  mov  w28,#0x78          ; ⇒ return 120
```
- `w23` (HDRmode) comes from `ExtensionModule::Get{Logical,Physical}DeviceHDRModeInfo`.
- **120 (0x78)** is returned on the path: HDRmode == 1 AND a **non-snapshot** capture-intent.
- **0** is returned when the prologue HDR/scene helpers all yield the base case and control falls through to the
  **base** `GetCustomVendorTagFromCaptureIntent` (PLT `0x180920`) → `if (iVar8==0) return 0;`.
- The `op_mode < 0x8001` guard governs only the **inner OEM still-code tree** (taken on the snapshot path). When
  op_mode ≥ 0x8001 those inner blocks are *skipped* — i.e. the OEM extension op-mode actually **suppresses** the
  inner per-frame still codes, leaving the trailing tag-based fixups + the `op_mode==0x8004` special case.

**Consequence (VERIFIED-by-mechanism, matches the A/B table in §0):** the dominant LOS `customVendorTag 0` is
the **base fall-through**: on LOS the OEM **HDR/scene metadata from `ExtensionModule` is not being produced**, so
`HDRmode`/scene inputs are 0 and the selector returns the base 0. The `beauty` condition is the counter-example —
its request path drives HDRmode==1 on LOS too (app/SDK-driven via `BokehRequestTask`), so LOS yields 120. This is
exactly why customVendorTag is scene-dependent, not an on/off auth bit.

---

## 4. The auth gate — first-party authed TRUE on LOS; the SDK does NOT zero customVendorTag (VERIFIED)

Brief Q2: is `customVendorTag` gated by `isAuthedClient` / `checkAuthenticationPermission`?

- `CameraUnitImpl.isAuthedClient(ctx)`: `"com.oplus.camera".equals(pkg)` ⇒ **return true** (tier-1). The LOS app
  package is still `com.oplus.camera` ⇒ **authed TRUE on LOS**, no native call needed.
- `CameraUnitImpl.checkAuthenticationPermission(ctx, ver, code)`: returns false **only if**
  `CameraConfigHelper.isConfigFileExist(...)` is false, i.e. if `/odm/etc/camera/config/camera_unit_config` is
  absent. The odm partition ships on LOS, so this is **true on LOS**.
- `Util.isSystemCamera()` = `"com.oplus.camera".equals(pkg)` ⇒ **TRUE on LOS** (no config/auth needed).

So the SDK-side identity/auth ladder is **NOT** the thing that zeros customVendorTag for the first-party camera.
The op-mode is computed and the `com.oplus.extension.operation.mode` tag is set regardless of native auth (auth is
TRUE first-party). The customVendorTag-0 cases are NOT an SDK auth failure; they are the CHI base fall-through
(§3) caused by missing OEM **HDR/scene** metadata production, which is an upstream (AEC/ExtensionModule/CHI-override)
gap — consistent with this project's `47-root-cause-correction-two-gates.md` Gate A (`hdr_detected` never computed).

> The cameraserver native auth ladder (10004/10005, `libcsextimpl` absent on LOS, returns −38) and the SF 24001
> OcsAuth sink DO matter for the OEM **EDR composition / over-exposure** (Gate-A/R3 lane,
> `ocs-auth-abi-RE.md`/`oem-client-identity-gate-RE.md`) — but they are NOT the direct producer of the CHI
> `customVendorTag`. Do not re-fuse these two pathways.

---

## 5. OplusCfgFilePolicy stub — NOT implicated in the vendor-tag load (VERIFIED, answers Q3)

**The OCS-SDK config/vendor-tag loader does NOT use `com.oplus.cust.OplusCfgFilePolicy`.** Verified:

- `JsonParser.loadUnitConfigAndParseVendorTag()` and `JsonParser.getConfigPath()` use a **hardcoded** path:
  `CONFIG_PATH = "/odm/etc/camera/config/camera_unit_config"` (and `THIRD_CONFIG_PATH =
  "/odm/etc/camera/config/third_camera_unit_config"`), via plain `new File(path)` / `FileInputStream`. No cust
  locator. `getConfigPath(z) = (z || isFromExtension() || !isFileExist(THIRD_CONFIG_PATH)) ? CONFIG_PATH : THIRD…`.
- `CameraConfigHelper.isConfigFileExist(z) = Util.isFileExist(JsonParser.getConfigPath(z))` — same hardcoded path.
- dex `strings` of `classes.dex`: zero references to `OplusCfgFilePolicy` (the "cust" hits are unrelated
  `customKey`/`customSize`/`CUSTOM_LIST` tokens). The SDK never imports `com.oplus.cust.*`.

**What the OplusCfgFilePolicy stub actually addresses (VERIFIED from `LEDGER.md` Iter-4):** it fixes
`com.oplus.aiunit`'s `NoClassDefFoundError: com.oplus.cust.OplusCfgFilePolicy` in
`BaseOSLoadStrategy.listFilesFromOS` — i.e. the **AIUnit** asset/cust-config locator, a *different* subsystem.
It is unrelated to the OCS-SDK camera config.

**Does returning EMPTY break anything for camera vendor-tags?** No. (a) The OCS SDK doesn't call it at all. (b) The
real OOS `OplusCfgFilePolicy` (baksmali of `oplus-framework-300.jar`) is itself driven by the `CUST_LEVEL_LIST`
env var → `sCfgDirs`; when that env is unset `getCfgLevelListCommon` returns an empty list anyway — so the
genuine impl *also* yields empty when no cust partitions are mounted (LOS case). The empty stub is therefore
behaviorally faithful for the no-cust-partition environment. **The stub is NOT implicated in customVendorTag=0.**

> If a future need arises to make the stub return real paths (for AIUnit cust configs only): the relevant on-disk
> camera config is `/odm/etc/camera/config/camera_unit_config` + the `/odm/etc/camera/*.json` set, but those are
> reached by the OCS SDK's own hardcoded path, not via OplusCfgFilePolicy — so no stub change helps the camera.

---

## 6. The vendor-tag DESCRIPTOR is registered identically on LOS (VERIFIED, answers Q4)

The brief's Q4 ("is the `com.oplus.*` section registered on LOS; if not, the app can't set the tag") is **answered:
it IS registered, identically.** From `dumpsys camera` pre-capture, OOS (`ab`) vs LOS (`_pull`),
`_golden-oos-V16.1.0/campaign/motionphoto/run1`:
```
0x8114007d (extension.operation.mode) with type 1 (int32) defined in section com.oplus   # PRESENT on BOTH
```
- `grep -c com.oplus` over the dumpsys vendor-tag dump = **567 on LOS, 567 on OOS** (identical section size,
  byte-for-byte the same tag ids incl. `com.oplus.extension.operation.mode = 0x8114007d`).
- ⇒ The cameraserver enumerates the full OnePlus vendor-tag section on LOS. The app **can** set every
  `com.oplus.*` tag, including the op-mode carrier. Vendor-tag registration is **NOT** the divergence.

---

## VERIFIED-vs-INFERENCE ledger

**VERIFIED (tool/data-derived):**
- `customVendorTag` is computed by `ChiFeature2GraphSelectorOEM::GetCustomVendorTagFromCaptureIntent`
  (`com.qti.feature2.gs.sm8850.so`, ELF `0x108970`); 120=0x78 is a graph-decision code, not a count; base
  fall-through returns 0 (§1).
- selector op-mode field (`+0x538`/"+0xa7") = CHI session `operation_mode` written at `Initialize`
  (`0x8b444`); gate constant `< 0x8001`; the 120 branch is HDRmode==1 + non-snapshot intent and is independent of
  op-mode; op_mode ≥ 0x8001 *suppresses* the inner OEM still codes (§2, §3).
- op-mode 0x8001 reaches CHI via the SDK `createCaptureSession` session-mode + the
  `com.oplus.extension.operation.mode` (tag `0x8114007d`) tag, which `libcsextimpl.getExtensionOperatingMode`
  overrides on OOS (§2).
- First-party `isAuthedClient`/`isSystemCamera`/`checkAuthenticationPermission` are **TRUE on LOS** for
  `com.oplus.camera` (package-name-only); the SDK does not zero customVendorTag (§4).
- OCS SDK config/vendor-tag load uses **hardcoded `/odm/etc/camera/config/camera_unit_config`**, NOT
  `OplusCfgFilePolicy`; the stub fixes AIUnit, is behaviorally faithful (empty when no cust partition), and is
  **not implicated** (§5).
- `com.oplus.*` vendor-tag section incl. `extension.operation.mode` is **registered identically on LOS** (567==567,
  same tag ids) (§6).
- The repo's own A/B corpus shows customVendorTag is **scene/condition-dependent on both sides** and LOS DOES emit
  120 (beauty 27×) — refuting "LOS=0 always" (§0; corroborates REFUTED-LOG R-06 / doc-47).

**INFERENCE (not proven here):**
- That the dominant LOS `customVendorTag 0` is caused specifically by **missing OEM HDR/scene metadata from
  `ExtensionModule`/AEC** (the base fall-through trigger). Mechanism is verified in the selector; the *producer*
  of HDRmode (AEC `hdr_detected`, doc-45/47 Gate-A) on LOS is the suspected upstream zeroer but needs a live
  per-frame trace of `ExtensionModule::Get*DeviceHDRModeInfo` inputs to convict.
- That `customVendorTag 0` is THE no-JPEG root. The repo already REFUTED this (R-06/doc-47: JPEG/fusion run
  without it; LOS can produce 120). It is at most a co-symptom of the HDR/scene-metadata gap, not an independent
  save-blocker.

---

## 7. Concrete LOS-impl fix candidate

The brief asked for "the smallest missing thing that makes it 0" and a los-impl fix. The honest answer from the
evidence: **there is no smallest single thing, and customVendorTag is the wrong knob to chase directly.**

1. **Do NOT** try to "make the app set customVendorTag" — nothing sets it; CHI computes it. Do NOT touch the
   OplusCfgFilePolicy stub for this (§5) and do NOT add a `com.oplus.*` vendor-tag section (already present, §6).
2. **The actual lever is the OEM HDR/scene metadata** that `ExtensionModule::Get{Logical,Physical}DeviceHDRModeInfo`
   reads (§3). On LOS this is the same gap as **Gate A** (`47-root-cause-correction-two-gates.md`): AEC
   `hdr_detected` never computed → HDRmode 0 → selector base fall-through → customVendorTag 0. The fix candidate is
   the AEC HDR-detect lane (`HDRDetectProcess`/`HDRTriggerFlagDetection`, doc-45 anchors), NOT a customVendorTag
   patch.
3. **Verify, don't assume the save-blocker:** before spending effort, run the doc-47 decisive probe
   (`tools/frida/probe_aec_hdrdetect.js`) and a hook on `ExtensionModule::Get*DeviceHDRModeInfo` +
   `GetCustomVendorTagFromCaptureIntent` (ELF `0x108970`) to confirm the LOS input that forces the base-0 path,
   AND confirm whether JPEG actually fails when customVendorTag is 0 (R-06 says it does not).
4. **If a no-JPEG save genuinely persists**, pursue the `oemChimetadatas` producer at
   `chxmulticamerabase.cpp:6131 CreateUsecaseRequestObjectInputParam` (LEDGER Iter-6) and the SR-CCM path — that is
   downstream of, and more directly tied to, the missing-image symptom than customVendorTag.

## Anchors / files of record
- OCS SDK jar `/tmp/ocs_sdk.jar`; `JsonParser`/`CameraConfigHelper`/`OperationModeDecision`/`CameraUnitImpl`/`Util`
  (jadx); `CameraMetadataKey.smali:1627` (tag string), `UConfigureKeys`/`BaseMode`/`*RequestTask.smali` (setters).
- CHI GS blob `vendor/lib64/com.qti.feature2.gs.sm8850.so` md5 `44dfea54803388a209373fa13addacc1` (ELF base 0).
- `libcsextimpl.so` `getExtensionOperatingMode` (`oem-client-identity-gate-RE.md` §B2).
- Vendor-tag registration: `reference/_golden-oos-V16.1.0/campaign/motionphoto/run1/ab{,/_pull}/dumpsys_camera_pre.txt`.
- A/B customVendorTag corpus: `reference/_golden-oos-V16.1.0/campaign/*/run1/ab{,/_pull}/logcat_all.txt`.
- Cross-refs: `47-root-cause-correction-two-gates.md` (Gate A/B; R-06), `docs/interop-tree/REFUTED-LOG.md` (R-06),
  `oem-client-identity-gate-RE.md` (auth ladder + op-mode override), `ocs-auth-abi-RE.md` (SF EDR sink),
  `OplusCfgFilePolicy.java` stub (`camera-bringup/overlays/`, `infiniti-camera-port/.../oplus-fwk/src/com/oplus/cust/`).
