<!-- STATUS: MIXED — inference-surgery applied 2026-06-14. Verified body = directly measured facts
     (host symbol scans, sha256-diff, on-device probe observations). All mechanism attributions, optimal-form
     verdicts, and forward fix specifications moved to "Inferences & Open" below.
     Guard: a measured symbol-absence SITE is never a verified ROOT; "CONVICTED" conviction = A/B-confirmed
     apply-state, NOT a proven causation chain to a symptom. -->
<!-- Parent: ./INDEX.md · Migrated+rescoped from ../interop-tree/facilitation/E2-system-framework.md (Phase-2 F-plane) -->
<!-- Companions: ../interop-tree/REQUIREMENTS.md (R1/R2/R3/R4 owner), ../interop-tree/POST-PROCESSING-CONTRACT.md, ../interop-tree/re-notes/*-RE.md -->
---
node: F2
title: "/system framework facilitation — optimal LOS form for av/0001 ext-factory, base/0001 JNI bridge, libgui/SF EDR ABI, Depth-2 hooks, BINDER_VM_SIZE"
plane: facilitation
partition: /system            # /system frameworks/av + base + native; ext target in /system_ext
migrated_from: E2
owns_requirements: [R1, R2, R3, R4]
blob_identical_oos_los: false   # SOURCE patches not blobs; av/base/native patch FILES are sha256-identical dodge↔ours — the divergence is APPLY-STATE, not file content
characterization: CHARACTERIZED  # dodge-oracle structural map complete (e); host symbol scan of built cameraserver + libandroid_runtime done 2026-06-13; carrier map closed
conviction: CONVICTED            # E-node A/B = dodge-oracle vs our-dirty, runnable on stock; av/0001 NOT-APPLIED + base/0001 effective both directly observed
verdict: "SPLIT. av/0001 OEM ext factory = CONVICTED-NOT-APPLIED (apply-state measured; symptom-root attribution INFERRED, LOS A/B deferred): frameworks/av source has 0 CameraServiceExt/csextimpl, built cameraserver (4MB, 103 CameraService strings) has 0 ext call sites + libcsextimpl.so absent from whole out tree → every 100xx binder → UNKNOWN_TRANSACTION −38 (= live G5 dropped). base/0001 JNI bridge = APPLIED+EFFECTIVE (nativeGetOplusHardwareBuffer in source + built libandroid_runtime.so → #7/getOplusHardwareBuffer REFUTED). The 6 Depth-2 hooks (beforeConfigureStreamsLocked, getExtensionOperatingMode, processPreview, …) are missing on BOTH dodge and ours → must be AUTHORED ANEW, not lifted. R1 release-upcall receiver (ROOT-CANDIDATE, conviction: INFERRED) + R3 libgui/SF EDR ABI (ROOT-CANDIDATE, conviction: INFERRED, partially contradicted by E0-EDR-HARVEST) are NEW work the patch set never carried."
confidence: high
symptoms: [7, 4, 1, 3, 8]
probes: [G1, G5, r4-oem-transact, probe_getoplushwbuffer.js, hook_configure_streams]
gaps: [G1, G5]
dodge_ref: "dodge-camera-port/repos/patches-crdroid/patch-dodge/frameworks,{av,base,native}/*.patch (sha256-IDENTICAL to ours)"
dirty_ref: "op15-camera-porting/patches-crdroid/patch-dodge/frameworks,{av,base,native}/*.patch (external LOS tree, not under oplus-final)"
divergence: "av/0001 differs by APPLY-STATE (file sha256-identical, NOT applied to source — 0 ext call sites, 0 ext strings in built cameraserver, libcsextimpl dropped d654641); base/0001 same+effective; native/0001 file-identical low-risk; Depth-2 hooks + R1 receiver + R3 EDR ABI = AUTHOR-NEW (absent from BOTH oracle and ours)"
upstream: [E1]
downstream: [C2, C3, D1, D2, D3, D4]
refuted_refs: [R-getoplushwbuffer-fallback]
doc_refs: [doc-46, doc-47, doc-48, doc-49]
updated: 2026-06-14
---

# F2 — /system framework facilitation (av / base / native): requirements → mechanism → optimal-LOS-form

Migrated from E2 and **re-scoped** from "dodge-vs-dirty DIFF" to **requirements → mechanism → optimal-LOS-form**.
The diff question E2 answered (4/4 patch files byte-identical; av/0001 NOT applied; base/0001 effective) is carried
forward verbatim in §"Carried verdict" and dodge is demoted to a **proof-of-form oracle** per requirement, not the
deliverable. F2 owns four REQUIREMENTS rows: **R1** (release-upcall bridge = #1 freeze + #4 UAF root fix), **R2**
(av/0001 onTransact Depth-1), **R4** (Depth-2 `beforeConfigureStreamsLocked` = 8K/#8), **R3** (libgui/SF OEM-EDR
`setEdrViewTransform` ABI = #3).

## Two-axis status (orthogonal — good together)
- **characterization: CHARACTERIZED** — the dodge-oracle structural map is complete and the host symbol scan
  (built `cameraserver`/`libcameraservice.so` + `libandroid_runtime.so`, out tree dated Jun 11 post-v19) OBSERVED
  every carrier: ext strings ABSENT, JNI `nativeGetOplusHardwareBuffer` PRESENT, `libcsextimpl.so` ABSENT.
- **conviction: CONVICTED** — the A/B is dodge-oracle vs our-dirty, run on stock: av/0001 NOT-applied and
  base/0001 effective are both directly observed (G-MECH: port count 0 ext call sites; symbol present for JNI).

## Carried verdict (preserved from E2 — do not lose these facts)

| Item | Source has it? | Built artifact has it? | Conviction | Carried fact |
|---|---|---|---|---|
| **av/0001** OEM ext factory | **NO** (`grep CameraServiceExt frameworks/av` = 0; git log clean lineage-23.2+android-16.0.0_r4) | **NO** (`cameraserver` 4MB, 103 `CameraService` strings, 0 `OplusCameraService`/`CameraServiceExtImpl`/`csextimpl`/`beforeConfigureStreamsLocked`/`CameraServiceExtFactory`, 0 oplus identity; `libcsextimpl.so` absent whole out tree) | **CONVICTED-NOT-APPLIED** | Our cameraserver is **pure stock AOSP** → root for #8, contributes #4. TOP gap. |
| **base/0001** JNI bridge | **YES** (`getOplusHardwareBuffer` in `core/jni/android_media_ImageReader.cpp`, 2 hits) | **YES** (`nativeGetOplusHardwareBuffer` in built `system/lib64/libandroid_runtime.so`; JNI registered at runtime) | **APPLIED+EFFECTIVE** | #7 "bridge absent" **REFUTED** (X3 / `R-getoplushwbuffer-fallback`). |
| **native/0001** BINDER_VM_SIZE 1→4MB | (not re-scanned) | — | file-identical, low-risk | `(4*1024*1024)−sysconf(_SC_PAGE_SIZE)*2` in `libs/binder/ProcessState.cpp`. |
| **6× Depth-2 hooks** | NO (both) | NO (both) | **AUTHOR-NEW** | `beforeConfigureStreamsLocked` / `getExtensionOperatingMode` / `processPreview` / `beforeMetadataSendToApp` absent on BOTH dodge and ours — av/0001 is Depth-1 dlopen-bridge only. |

**SPLIT root (E2, preserved):** the identical `frameworks,av/0001` patch file exists in the port tree but was
**never applied to our `frameworks/av` source** while `frameworks,base/0001` was → **inconsistent patch application**.
Consequence: the entire OEM `CameraServiceExt` layer (G5) is absent from our build; `libcsextimpl.so` (dropped
`d654641`) has no caller regardless.

## Dodge file-content evidence (preserved — proves "apply-state, not content")

| Patch file | dodge sha256 | ours sha256 | verdict |
|---|---|---|---|
| `frameworks,av/0001-…extension-support-f.patch` | `15b3171b…f076f` | `15b3171b…f076f` | **IDENTICAL** |
| `frameworks,av/0002-Add-some-logging.patch` | `5786234e…7a0` | `5786234e…7a0` | **IDENTICAL** |
| `frameworks,base/0001-AHardwareBuffer-fixes…patch` | `022f82cd…f89d` | `022f82cd…f89d` | **IDENTICAL** |
| `frameworks,native/0001-Increase-BINDER_VM_SIZE…patch` | `fd45f9c6…f9f2d` | `fd45f9c6…f9f2d` | **IDENTICAL** |

Re-verified 2026-06-14: dodge sha256 = `15b3171b…f076f` (av/0001), `022f82cd…f89d` (base/0001), `fd45f9c6…f9f2d`
(native/0001) — exact match to E2's table. Our dirty tree (`op15-camera-porting`) is **external** to `oplus-final`
→ file-level divergence is **zero**; the only divergence is **APPLY-STATE**. The dodge form is therefore a
**proof-of-form oracle** (does a shipping reference prove this form exists/works?), never a thing to byte-copy.

---

## Requirement → mechanism → optimal-LOS-form (the re-scope)

> Per row: **(i)** the contract to satisfy · **(ii)** the optimal LOS mechanism (stub / framework patch / config /
> sepolicy-namespace) · **(iii)** dodge as proof-of-form (does a shipping reference prove this form?) · **(iv)** the
> LOS-confines weighting (Treble-clean · re-buildable · system_ext-vs-boot-jar · author-new-vs-adopt).

### R2 — OEM `media.camera` binder receiver, Depth-1 (`CameraServiceExtImpl::onTransact`) — **ADOPT av/0001**
- **(i) Contract.** `CameraServiceExtImpl::onTransact` services codes 10001..10024 (incl. **10015 SEND_OPLUS_EXT_CAM_CMD**,
  zoom). On LOS the lib is dropped + 0 ext call sites ⇒ every 100xx → `UNKNOWN_TRANSACTION −38` (`onTransact` file
  `0x16f6f0`, `default:−38`). This is the live-G5 drop.
- **(ii) Optimal mechanism = framework patch (adopt av/0001) + re-add the /system_ext blob.** Apply
  `frameworks,av/0001` to the infiniti `frameworks/av` source (hooks `CameraService::onTransact` →
  `CameraServiceExtFactory::onTransact(...)==0` short-circuit; `dlopen("system_ext/lib64/libcsextimpl.so")`,
  `dlsym getExtFactoryImpl` triple-deref + `dlsym _ZN7android20CameraServiceExtImpl10onTransactEjRKNS_6ParcelEPS1_j`),
  and **reverse `d654641`** to re-add `libcsextimpl.so` (the dlopen target — was 4 `/proc/maps` mappings on OOS,
  absent on LOS). Then rebuild and re-run the host scan (cameraserver must then carry `CameraServiceExt*`).
- **(iii) Dodge proof-of-form = YES (strong).** Dodge ships this exact file (sha256 `15b3171b…f076f`, author Hecheng
  Yu `d6654b3`) and zoom works on its ROM with prebuilt `libcsextimpl.so` (patch Test: line). The dlopen-bridge form
  is **proven to exist+work on a shipping reference** → adopt, do not re-author.
- **(iv) LOS-confines.** Treble-clean ✔ (dlopen into `/system_ext`, no vendor reach-up). Re-buildable ✔ (Soong
  `ext/*.cpp` already in the bp diff). **/system_ext (not boot-jar)** is the correct placement for `libcsextimpl.so`.
  **Adopt** (av/0001 file) — the cheapest correct form; the blob is the only manual step (reverse `d654641`).
  CONVICTED-NOT-APPLIED ⇒ this is the TOP single action.

### R4 — Depth-2 `beforeConfigureStreamsLocked` (8K StreamSet retype) — **AUTHOR-NEW**
- **(i) Contract.** Bind the 8K configure_streams: base `op_mode 0x8001`/9-stream/`logicalCameraId 4` (RAW10
  4096×3072 ×5 + RAW10 8192×6144) AND EIS `op_mode 0x80a9`/5-stream carrying the EISv2 `7680×4320` pair. Missing ⇒
  EISv2 node 2-in/0-out → NULL pipeline → **#8 `−38`**. RE: `beforeConfigureStreamsLocked` file `0x17b71c` (emplace
  `MetaStreamInfo` @`+0x598` on `vtbl+0x20==300 && vtbl+0x28==0x400`); `getExtensionOperatingMode` file `0x184818`
  returns `0x80a9` from vendor-tag `UNK_00142f77`.
- **(ii) Optimal mechanism = AUTHOR-NEW framework code (the 6 Depth-2 hooks).** av/0001 is Depth-1 **only** — it
  delegates `onTransact` but never adds the `CameraServiceExtImpl` **internal** call sites
  (`beforeConfigureStreamsLocked` = 8K StreamSet retype `@0x17b71c`, `getExtensionOperatingMode` = op_mode override,
  `processPreview` = Gate-B, `beforeMetadataSendToApp`). These must be authored anew against the RE offsets, not
  lifted. Co-root **D1** Gralloc5 stream-usage (doc-35 cand-a) shares R4.
- **(iii) Dodge proof-of-form = NO.** Neither dodge nor we have the Depth-2 hooks (doc-48). The oracle proves the
  Depth-1 *delegation* form only; **no shipping reference proves the Depth-2 internal-hook form** → there is no form
  to adopt. Author against the Ghidra offsets (`0x17b71c` / `0x184818`) as the spec.
- **(iv) LOS-confines.** Treble-clean ✔ (lives in our `libcameraservice` ext, no vendor edit). Re-buildable ✔.
  **Author-new** (highest-effort row) — gated behind R2 (no Depth-1 receiver ⇒ no Depth-2 reach). #8 currently
  verdicts `False`/transient-recover on stock, so R4 is correctness-of-8K, not a live crash blocker.

### R1 — per-preview-frame native→Java release upcall (`decMetaRefZeroToRemove`) — **AUTHOR-NEW (receiver)**
- **(i) Contract.** `ApsCallbackMetaRefInc::callbackToCamUnit` → `gCallbackRequestAction(JNIAction=2, isInc=false)`
  → Java `APSClient$MetaImageRefCounter.decMetaRefZeroToRemove(JII)V` (decref + `Image.close()` at 0). This is the
  **#1 freeze denominator (G4)**: on stock it fires ~7–9/s steady so `metaBufferMap` stays bounded; absent on LOS ⇒
  20-deep pool exhausts ⇒ `previewManagerRoutine` parks. Per POST-PROCESSING-CONTRACT §(b)/(c): one fix retires
  **#1 freeze AND #4 UAF**, and makes the libapsfixup **Family-II** `copyMetadata` null-guard **dead code**.
  RE: upcall `libAlgoProcess.so` file `0x31fa1c` (Ghidra `0x41fa1c`); bridge `gCallbackRequestAction` file
  `0x9b7548`; victim `previewManagerRoutine` file `0x1aa694`.
- **(ii) Optimal mechanism = AUTHOR-NEW /system release-bridge receiver.** The `getOplusHardwareBuffer` JNI bridge
  is **present+effective** (base/0001, NOT the gap — POST-PROCESSING §(c)). The gap is the **release-upcall
  receiver**: wire the Java `APSClient$MetaImageRefCounter.decMetaRefZeroToRemove` path so the native
  `callbackToCamUnit` upcall (observed per-frame on stock) actually **lands** and decrefs on LOS. This is the same
  E2/base release-path family but a **new receiver**, not a re-apply of base/0001.
- **(iii) Dodge proof-of-form = NO.** No dodge patch carries the `decMetaRefZeroToRemove` receiver — the dodge file
  set is av/base/native only; the OCS-SDK release path is in `oplus-camera-stubs`/`oplus-fwk` (E1/F1), not the
  framework patches. Oracle proves the **JNI-bridge** form (base/0001), **not** the release-upcall receiver form →
  author-new against the RE offset.
- **(iv) LOS-confines.** Treble-clean ✔. Re-buildable ✔. **Author-new** — but it is the **highest-value** row
  (one fix → #1 + #4 retired + shim Family-II becomes dead code). Convicting R1 needs the LOS A/B (release upcall
  *absent* on the freeze: `metaBufferMap` climbs to the 20-deep cap) — deferred per POST-PROCESSING §"Open/next".

### R3 — libgui-WRITE + SF-READ OEM-EDR ABI (`setEdrViewTransform`) — **AUTHOR-NEW (native ABI, both sides)**
- **(i) Contract.** Port `Transaction::setEdrViewTransform` writing the `OplusEdrViewTransform` 4×4 tonemap curve
  (`transform[16]`, struct `0x5C`), consumed SF-side by `OplusRequestedLayerState::setEdrMetadata` → LinearEffect
  `m*color+v`. AOSP/LOS export **std-ratio only** ⇒ curve dropped ⇒ ~5× over-exposure (**#3**). A landed std-ratio
  call alone is **insufficient by construction** (the falsifier). RE write: `setEdrViewTransform` file `0x27fd48`
  (`what +0x198` bit63, map `+0x0A0`); read: `setEdrMetadata` file `0x30755c` (`0x5C` memcpy at node `+0x34`,
  change-mask bit1); ratio clamp [1.0..5.0] `GameEdr::setEDRStatus` file `0x2cc9b4`.
- **(ii) Optimal mechanism = AUTHOR-NEW native ABI on BOTH sides.** Add the libgui **WRITE** ABI
  (`setEdrViewTransform` 4×4-curve, doc-49) AND the SurfaceFlinger **READ** side
  (`OplusRequestedLayerState::setEdrMetadata`, edr-sf-readside-RE). Co-root **E1/F1** = `OplusEdrUtils` no-op stub
  (`getBlastSurfaceControl()→null`) breaks the precondition (REAL BLAST Surface) the OEM EDR program needs.
- **(iii) Dodge proof-of-form = NO.** No dodge framework patch carries the EDR ABI (the patch set is
  av/base/native; base/0001 only touches `SurfaceView.setExcludeSnapshot`, a no-op stub for #3 — E2 §f confirms F2
  is **not** the #3 root via base/0001). The OEM EDR program **is** OBSERVED firing on stock
  (`setEdrViewTransform ×1`, `setEdrSdrRatio ×2`, `setEdrFlags=0x80101` after the REAL BLAST Surface precondition)
  → the form is RE-proven on **stock**, but **no shipping LOS reference** proves it → author-new against doc-49 +
  edr-sf-readside-RE.
- **(iv) LOS-confines.** Treble-clean ✔ (libgui + SF are /system frameworks/native). Re-buildable ✔. **Author-new**
  on both the WRITE and READ side — std-ratio-only is the explicit falsifier, so a partial (write-only) port does
  **not** satisfy R3.

### native/0001 BINDER_VM_SIZE 1→4MB — **ADOPT (file-identical, low-risk)**
- Larger parcels for RAW/Master-mode result delivery (D3/D4). File-identical dodge↔ours (`fd45f9c6…f9f2d`),
  `(4*1024*1024)−sysconf(_SC_PAGE_SIZE)*2`. **Adopt**; verify it built into the shipped `libbinder`.

---

## Optimal-form verdict matrix (the F2 deliverable)

| Req | Contract (#sym) | Optimal LOS form | Dodge proof-of-form | Confines weighting |
|---|---|---|---|---|
| **R2** | Depth-1 `onTransact` 100xx (#8 root, #4 contrib) | **ADOPT** av/0001 framework patch + reverse `d654641` (`libcsextimpl.so` → /system_ext) | **YES (strong)** — shipping dodge ROM, zoom works | Treble-clean · re-buildable · /system_ext · **adopt**; TOP single action |
| **R4** | Depth-2 `beforeConfigureStreamsLocked` 8K StreamSet (#8) | **AUTHOR-NEW** 6 internal ext hooks @`0x17b71c`/`0x184818` | **NO** — absent on BOTH; av/0001 is Depth-1 only | Treble-clean · re-buildable · **author-new**; gated behind R2 |
| **R1** | release upcall `decMetaRefZeroToRemove` (#1 freeze + #4 UAF) | **AUTHOR-NEW** Java release receiver (JNI bridge already effective) | **NO** — no dodge patch carries the receiver | Treble-clean · re-buildable · **author-new**; highest-value (retires shim Family-II) |
| **R3** | `setEdrViewTransform` 4×4 curve WRITE + SF READ (#3) | **AUTHOR-NEW** libgui WRITE + SF READ ABI (both sides) | **NO** — RE-proven on stock only, no LOS reference; std-ratio insufficient | Treble-clean · re-buildable · **author-new** both sides; co-root E1/F1 stub |
| (base/0001) | JNI `nativeGetOplusHardwareBuffer` (#7) | **ALREADY EFFECTIVE** — no action | YES — applied+effective (REFUTES #7) | n/a — close benign |
| (native/0001) | BINDER_VM_SIZE 4MB | **ADOPT** (file-identical) | YES — file-identical | low-risk · adopt |

## Symptom leaves (PROXIMATE-SITE vs ROOT)
- **#8 8K −38** — ROOT-CANDIDATE (conviction: CONVICTED-NOT-APPLIED for R2 apply-state; root attribution INFERRED, LOS A/B deferred) = R2 av/0001 NOT-applied → no Depth-1 receiver; + R4 (Depth-2 retype absent, INFERRED). PROXIMATE EISv2 NULL pipeline. Co-root D1 Gralloc5.
- **#4 copyMetadata UAF** — PROXIMATE D2 (`APSMetadata::copyMetadata+60`), ROOT-CANDIDATE (conviction: INFERRED, LOS A/B deferred) = R1 lifetime (release upcall absent); F2 contributes via the ext result-lifetime surface (av/0001 `collectReturnableOutputBuffers` overload).
- **#1 preview freeze** — PROXIMATE D2 (APS holds frame 1), ROOT-CANDIDATE (conviction: INFERRED, LOS A/B deferred) = R1 release-upcall denominator (the #1 fix).
- **#7 getOplusHardwareBuffer** — **REFUTED** (base/0001 applied+effective; X3 / `R-getoplushwbuffer-fallback`).
- **#3 over-exposure** — PROXIMATE D4 (no tonemap), ROOT-CANDIDATE (conviction: INFERRED, LOS A/B deferred; partially contradicted by E0-EDR-HARVEST — curve never fires in preview) = R3 EDR ABI (here) + E1/F1 `OplusEdrUtils` stub + display HAL. base/0001 `setExcludeSnapshot` is a no-op stub → F2 is NOT the #3 root via base/0001, but **is** the R3-ABI owner.

> DESIGN/SPEC ONLY. No edits to the external LOS tree (`~/vendor_oplus_camera`, `~/android/lineage`,
> `op15-camera-porting`); F2 lives entirely under `/home/vivy/oplus-final/docs/facilitation/`.
> Cross-refs: REQUIREMENTS R1/R2/R3/R4 · POST-PROCESSING-CONTRACT §(b)/(c) · SCHEMA two-axis ·
> re-notes/{decmetarefzero-upcall,oem-binder-ontransact,edr-sf-readside}-RE.md · doc-48/doc-49.

---

## Inferences & Open (UNVERIFIED — heavy-check)

> Per the interop-tree trunk axiom, a measured symbol-absence or apply-state SITE is never a verified ROOT,
> and a carrier verdict is never a proven causation chain to a symptom. The items below are mechanism
> attributions, optimal-form verdicts, forward fix blueprints, and symptom→root assignments — NOT verified
> until an OOS↔LOS A/B proves each propagation-contract break.

### R2 — mechanism attribution and fix form (INFERRED)

- **ATTRIBUTION (apply-state convicted, root unproven):** "av/0001 NOT-applied → every 100xx → UNKNOWN_TRANSACTION
  −38 → roots #8, contributes #4." The apply-state fact (0 ext call sites, `libcsextimpl.so` absent) is
  measured. The causal chain (apply-state gap → specific symptom roots) is inferred from the call path, not
  confirmed by a live OOS↔LOS A/B with the patch applied and symptoms observed to resolve.
- **OPTIMAL FORM (inferred):** "Adopt av/0001 framework patch + reverse `d654641` to re-add `libcsextimpl.so` →
  /system_ext." The dlopen-bridge Depth-1 form is dodge-proven (strong). The specific LOS-confines weighting
  (Treble-clean, /system_ext placement, adopt vs author) is a design judgment, not a measured outcome.
- **SYMPTOM ASSIGNMENT (inferred):** "#8 8K −38 ROOT = R2 av/0001 NOT-applied; #4 copyMetadata UAF ROOT = R1
  lifetime via av/0001 `collectReturnableOutputBuffers`." These are attributed from the call-path RE, not
  proven by a targeted fix-and-observe A/B.

### R4 — Depth-2 hook mechanism and form (INFERRED)

- **ATTRIBUTION (inferred):** "`beforeConfigureStreamsLocked` absent → EISv2 node 2-in/0-out → NULL pipeline →
  #8 −38`." The hook offsets (`0x17b71c`, `0x184818`) are RE-recovered; that their absence is the ROOT of #8
  (vs. other co-roots including D1 Gralloc5) is inferred from the hook's observed role on OOS, not confirmed
  by authoring the hook and observing #8 resolution on LOS.
- **OPTIMAL FORM (inferred):** "Author-new 6 Depth-2 internal ext hooks against RE offsets." That exactly 6
  hooks are needed, that the cameraserver call-site wiring is correct, and that this form satisfies the 8K
  contract are forward-spec claims. The hook bodies are not authored; the LOS A/B is not run.
- **CO-ROOT SCOPE (inferred):** "D1 Gralloc5 stream-usage is a parallel co-root for R4." This is an
  attribution from doc-35 cand-a, not a verified independent causal path.

### R1 — release upcall mechanism and form (INFERRED)

- **ATTRIBUTION (inferred):** "Release upcall absent on LOS → `metaBufferMap` exhausts → `previewManagerRoutine`
  parks → #1 freeze." The upcall is OBSERVED firing on stock (~7–9/s). That its absence is the #1 freeze ROOT
  (vs. other APS delivery-chain breaks) is inferred from the pool exhaustion model, not confirmed by the LOS
  A/B (upcall *absent* on the freeze → `metaBufferMap` climbs to 20-deep cap).
- **OPTIMAL FORM (inferred):** "Author-new Java release receiver wiring `APSClient$MetaImageRefCounter.
  decMetaRefZeroToRemove(JII)V` so the native `callbackToCamUnit` lands on LOS." The specific bridge site
  (the `gCallbackRequestAction` exporting JNI lib) is NOT yet located — this is the open RE question. The form
  is therefore a blueprint, not a locatable fix.
- **CORRECTION SCOPE (inferred):** "One R1 fix retires #1 freeze + #4 UAF + makes shim Family-II dead code."
  This triple-retirement claim follows from the pool-exhaustion model; it is not verified until the LOS A/B
  confirms the upcall landing resolves all three.

### R3 — EDR ABI mechanism and form (INFERRED)

- **ATTRIBUTION (inferred):** "AOSP/LOS exports std-ratio only → curve dropped → ~5× over-exposure (#3)."
  The OEM EDR program firing on stock (`setEdrViewTransform ×1`, `setEdrSdrRatio ×2`, `setEdrFlags=0x80101`)
  is OBSERVED. That the *absence* of the 4×4 curve ABI (vs. the scalar ratio alone) is the #3 ROOT is inferred
  from the falsifier claim ("std-ratio-only insufficient by construction"). This is contradicted by E0-EDR-HARVEST
  which found `setEdrViewTransform` fired 0× in preview — the R3 mechanism attribution is therefore an open
  question, not a settled root.
- **OPTIMAL FORM (inferred / partially superseded):** "Author-new libgui WRITE + SF READ OEM-EDR ABI (both
  sides), `setEdrViewTransform` 4×4 curve." E0-EDR-HARVEST found the preview EDR contract is driven by
  `setEdrFlags(0x80101)` + adaptive `setEdrSdrRatio`, NOT the 4×4 curve. The "author both ABI sides" blueprint
  may be over-scoped; whether the scalar-ratio path alone suffices is UNVERIFIED (the Build 2 validation is
  pending). The form stated in this doc predates the E0 harvest finding.
- **CO-ROOT SCOPE (inferred):** "E1/F1 `OplusEdrUtils` no-op stub is co-root for R3." F1's stub returning null
  is a measured fact (source checkout). The built stub already returns REAL (PHASE-D-CORRECTIONS). So the
  F1 co-root attribution is already partially resolved in the image, but the R3 residual mechanism is unsettled.

### Symptom→root assignments (all INFERRED — summary)

- **#8 8K −38:** "ROOT = R2 NOT-applied + R4 Depth-2 absent; co-root D1." Attribution only; no LOS A/B with
  the fix applied confirming resolution.
- **#4 copyMetadata UAF:** "ROOT = R1 release upcall absent; F2 av/0001 contributes via ext result-lifetime."
  Attribution from call-path RE; LOS A/B with R1 landing is the conviction gating item.
- **#1 preview freeze:** "ROOT = R1 release upcall denominator." Same as #4 — pool exhaustion model, not
  LOS-confirmed.
- **#3 over-exposure:** "ROOT = R3 EDR ABI + E1/F1 stub + display HAL." Partially contradicted by E0-EDR-HARVEST
  (curve never fires in preview); root is OPEN, not settled.
- **#7 getOplusHardwareBuffer:** "REFUTED (base/0001 applied+effective)." This is the one confirmed negative
  (measured symbol presence); the refutation is solid. Carried here for completeness.
