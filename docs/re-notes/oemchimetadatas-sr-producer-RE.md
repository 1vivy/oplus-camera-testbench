<!-- STATUS: VERIFIED (Ghidra com.qti.chi.override.so + com.qti.hwcfg.ipe.so, infiniti port; + strings/dynsym
     cross-check vs OOS dump300; libAlgoProcess strings) separated from INFERENCE. Static RE only, no device run.
     Date: 2026-06-15. -->
# `oemChimetadatas` (size 0) + IPE SR-CCM (`getRawSRAlgoMetaData ccm is null`) producers — static RE

> Phase-N static RE of the two convicted OEM-reprocess-OUTPUT symptoms on LOS:
> (a) `chxmulticamerabase.cpp:6131 CreateUsecaseRequestObjectInputParam() … oemChimetadatas.size: 0` (OOS=1)
> (b) `opluscamxchinodehwcfgipedummy.cpp:1427 OplusOverrideIPECCMData() … getRawSRAlgoMetaData ccm is null`
> Answers brief Q1–Q4. Cross-refs the libapsfixup hypothesis (another agent).

## Blobs / image bases (build-pinned)

| blob | role | md5 (infiniti port) | image base |
|---|---|---|---|
| `…/vendor/lib64/hw/com.qti.chi.override.so` | `CreateUsecaseRequestObjectInputParam`, `oplusGetOemChimetadatas` | `3f25d02079aa98f47a188205d0e69836` | **0x100000** (ELF off = Ghidra − 0x100000) |
| `…/vendor/lib64/camera/components/com.qti.hwcfg.ipe.so` | `OplusOverrideIPECCMData` / the IPE CCM node (src `opluscamxchinodehwcfgipedummy.cpp`) | `9a17cbdac28a8a6d99e5d19888e38304` | **0x100000** |
| `…/odm/lib64/libAlgoProcess.so` | OEM SR/APS engine (produces `ccmData[9]` + `com.oplus.custom.ccm.sync.result`) | `b9f3f955766372258a1369b2bc4b3647` | (Ghidra: dump201 copy md5 `a774058…`) |

> ⚠️ Brief premise correction: the `OplusOverrideIPECCMData` / `getRawSRAlgoMetaData` symbols are NOT in
> `com.qti.chi.override.so`. They live in the small (152 KB) IPE HW-config node component **`com.qti.hwcfg.ipe.so`**
> (the brief's "oplus*ipe* node lib"). Both target functions imported into Ghidra project `oos-baseline-v3`.

---

## Key symbols (Ghidra addr / ELF off)

| symbol | Ghidra | ELF off | lib |
|---|---|---|---|
| `ChiMulticameraBase::CreateUsecaseRequestObjectInputParam` | `0x5414f8` | `0x4414f8` | chi.override |
| `ChiFeature2UsecaseRequestObjectImpl::oplusGetOemChimetadatas` | `0x3c30f0` | `0x2c30f0` | chi.override |
| oemChimetadatas POPULATE site #1 (line 836) | `0x3bb8cc` | `0x2bb8cc` | chi.override |
| oemChimetadatas POPULATE site #2 (line 1147/1151) | `0x3bfb48` | `0x2bfb48` | chi.override |
| `m_oemChimetadatas` vector member (begin/end/cap) | URO **+0x4770 / +0x4778 / +0x4780** | — | chi.override |
| `ChiFeature2GraphManagerImpl::OplusSetAidlOfflineMeta` (**8-byte STUB**) | `0x42cc38` | `0x32cc38` | chi.override |
| `ChiHwCfgIPE::OplusOverrideIPECCMData` | `0x11894c` | `0x1894c` | hwcfg.ipe |
| CCM tag read (`com.oplus`/`ipe.ccm`) + null branch (line 1427) | `0x118a18`→null@`0x593` | `0x18a18` | hwcfg.ipe |

---

## Q2 — SR-CCM / `getRawSRAlgoMetaData`: it is a **vendor-tag metadata read** (`com.oplus` :: `ipe.ccm`) — VERIFIED

`ChiHwCfgIPE::OplusOverrideIPECCMData(this, p2, p3=reqInfo, p4=out)` does **two metadata lookups** through the
HwCfg metadata pool (helpers reloc-resolved: `func_0x11d390`=`ChiHwCfgUtils::GetVendorTagId(fn,section,name)`,
`func_0x11d3d8`=`ChiHwCfgUtils::GetDataList(map, HwCfgMetaInfo, tagId, idx)`):

1. **AEC input** (line 0x56c=1388): `GetVendorTagId("com.qti.stats_control","aec_frame_control")` → `GetDataList`.
2. **THE CCM** (line **0x593=1427**): `GetVendorTagId(section="com.oplus", name="ipe.ccm")` →
   `GetDataList(this+0x158 map, this+0x128 HwCfgMetaInfo, tagId | 0x8000000, 0)` → `piVar6`.
   - `piVar6 == NULL` ⇒ `*p4 = 0`; **LOG `"%s HW Binary: getRawSRAlgoMetaData ccm is null"` @ line 1427** —
     this is the brief's exact LOS line. ("getRawSRAlgoMetaData" is the human label of this CCM read; there is
     no separate `getRawSRAlgoMetaData` function — it is the `com.oplus/ipe.ccm` `GetDataList`.)
   - On hit, validates `*piVar6!=0 && piVar6[1]!=0.0` (else `*p4=0`, "ccm invalid" @ line 0x58c=1420), then writes the
     **3×3 CCM** = `piVar6[1..9] * _UNK_1075a0` (denom 1e6) into `p4+3`, `*p4=1`. Logged elsewhere as
     `"OEM update CCM table, AICCM {%f %f %f, …}"` — i.e. the AI-CCM the IPE node applies (also `OverrideIPE2DLUTData`).

**So the SR-CCM source is NOT a shared-mem handle from libAlgoProcess and NOT an APS deferjob result read directly
by the IPE node — it is the per-request vendor tag `com.oplus`::`ipe.ccm`.** Null on LOS ⇒ nothing UPSTREAM
published `com.oplus/ipe.ccm` into the metadata pool for this reprocess request.

### Who PUBLISHES `com.oplus/ipe.ccm` (the producer chain) — VERIFIED by strings/symbols
- `ipe.ccm` string exists in 4 libs (both infiniti port and OOS dump300, identical set): `com.qti.hwcfg.ipe.so`
  (consumer), `camera.qcom.core.so`, `com.qti.chi.override.so`/`libchifeature2.so` (5690440-byte twins).
- The **publisher** is **`camera.qcom.core.so`** (CamX core AWB): symbols `oplusAWBGetAlgoProcessInput`,
  `oplusAWBPublishAlgoProcessOutput`, computes `oplusAWBLocalCCM`/`oplusAWBFaceCCM` (err lines 637/668
  "…CCM is null!"), then publishes tag `ipe.ccm` ("OEM update CCM table publishControl %u", `forcePublish`).
- The **CCM data ultimately originates in `libAlgoProcess.so`** (OEM SR/APS engine): it emits `ccmData[0..8]` (a
  3×3 CCM, log `pHdrTransformData … ccmData[0..8]`) and writes tag **`com.oplus.custom.ccm.sync.result`**
  ("update com.oplus.custom.ccm.sync.result failed"). That tag is bridged by **`camera.oemlayer.v2.so`**
  (`OemLayer::ORequestObject::GetInputMetaData`, reads `com.oplus.custom.ccm.sync.result`) +
  `libAlgoInterface.so`. (`libAlgoProcess` does NOT contain the `ipe.ccm` string itself — it produces the
  upstream CCM/result; the QTI side translates it into `ipe.ccm`.)

Chain: **libAlgoProcess (SR engine: ccmData + `com.oplus.custom.ccm.sync.result`) → camera.oemlayer.v2 / camera.qcom.core (`oplusAWB*CCM` → publishes `com.oplus/ipe.ccm`) → com.qti.hwcfg.ipe (`OplusOverrideIPECCMData` reads `ipe.ccm`, else "ccm is null").**

---

## Q1 — `oemChimetadatas` producer + the size-0 condition — VERIFIED (data model) / INFERENCE (LOS trigger)

`oemChimetadatas` is a `std::vector<ChiMetadata*>`. Three layers, all VERIFIED:

1. **URO member `m_oemChimetadatas`** = vector at URO `+0x4770/+0x4778/+0x4780`.
2. **`createInputInfo.oemChimetadatas`** (the one logged at chxmulticamerabase.cpp:6131) is filled by
   `CreateUsecaseRequestObjectInputParam` reading the URO member through
   `oplusGetOemChimetadatas()` (`0x3c30f0`: copies all `(end−begin)>>3` `ChiMetadata*` from URO+0x4770).
   So `createInputInfo.oemChimetadatas.size == m_oemChimetadatas.size`.
3. **`m_oemChimetadatas` is populated** at `0x3bb8cc` and `0x3bfb48` by **copying a SOURCE vector at `srcObj+0x658`
   (begin) / `+0x660` (end)** into URO+0x4770 (helper `0x2c7954` = vector assign). Pattern (disasm @0x2bfb48):
   ```
   ldr x8,[x19,#0x4770]; str x8,[x19,#0x4778]   ; clear m_oemChimetadatas
   ldr x23,[x20,#0x658]; ldr x24,[x20,#0x660]   ; SOURCE OEM-meta vector (x20 = OEM/APS request obj)
   cmp x24,x23; b.eq <skip>                      ; if source EMPTY -> m_oemChimetadatas stays size 0
   … bl 0x2c7954(dest=&x19[0x4770], src_begin, src_end, count)
   ```
   `srcObj` (`x20`) is the OEM/APS request object that carries the `com.oplus.*` APS InputMetadata ChiMetadata
   objects. (chi.override itself sets `com.oplus.InputMetadataBokehAPSLite` / `InputMetadataOpticalZoomAPSLite`
   vendor tags — these are the contents of those ChiMetadata entries.)

**LOS divergence:** `createInputInfo.oemChimetadatas.size:0` ⇒ `m_oemChimetadatas` empty ⇒ the SOURCE vector
`srcObj+0x658` is empty, i.e. **no OEM/APS ChiMetadata was produced/attached for this reprocess request.** The
chi.override copy logic is BUILD-IDENTICAL to OOS (same strings, same line numbers) — the gap is the upstream
APS/OEM result, NOT the chi.override copy.

### Refuted candidate: `OplusSetAidlOfflineMeta` is NOT the divergence — VERIFIED
`ChiFeature2GraphManagerImpl::OplusSetAidlOfflineMeta` is an **empty stub (`ret`)** on the infiniti port. But
dynsym shows it is **8 bytes on BOTH infiniti (0x32cc38) and OOS dump300 (0x36cf60)** — an empty stub on OOS too.
So this no-op is not LOS-specific and does not explain size 0.

---

## Q3 — APS app-side "not in defer scene" / "aps no defer job" / 0-byte rename — INFERENCE

Not in these two native blobs (it is an `OCAM_DeferJobController` app-side decision; the APS save lives in
`libAlgoProcess`/`APSCmdThread::getProcCmd` + the Java `APSClient`, covered by `apsclient-*-RE.md`/`libapsfixup-…`).
But the producer they share is the **same APS/SR engine (`libAlgoProcess`) result**: when the OEM/APS engine does
not produce the per-request OEM result (the ChiMetadata + the `com.oplus.custom.ccm.sync.result`/HDR-transform
output), (a) the reprocess request gets no OEM ChiMetadata (`oemChimetadatas`=0), (b) the IPE node finds no
`ipe.ccm` ("ccm is null"), AND (c) the app sees no APS deferjob/result to save → 0-byte temp. This is a
mechanism-level inference; convicting it needs a live trace of the APS-result publication (see probes below).

---

## Q4 — Convergence + libapsfixup cross-reference

**Single upstream root (INFERENCE, strongly supported):** both `oemChimetadatas=0` AND `ipe.ccm`=null trace to
the **OEM/APS reprocess RESULT not being produced/published**, whose engine is **`libAlgoProcess.so`**:
- `oemChimetadatas` = vector of `com.oplus.* APS InputMetadata` ChiMetadata (Bokeh/OpticalZoom/AEC) — APS-engine output.
- `ipe.ccm` = AI-CCM derived from libAlgoProcess `ccmData[]` + `com.oplus.custom.ccm.sync.result`, bridged through
  `camera.oemlayer.v2`→`camera.qcom.core`. Same engine, sibling output.
They are **two consumers of one producer** (the libAlgoProcess SR/APS result reaching CamX), not two unrelated
gaps. The chi.override copy and the IPE CCM read are both build-identical to OOS — neither is the root.

**Does the SR-CCM come from libAlgoProcess (which libapsfixup patches)? — SUPPORTS the libapsfixup line, with a
caveat.** Static evidence: the CCM data (`ccmData[9]`) and `com.oplus.custom.ccm.sync.result` are produced inside
`libAlgoProcess` — so the SR-CCM ROOT is in the very lib libapsfixup interposes. **However**, per
`libapsfixup-interposition-RE.md`, libapsfixup's current hooks (`p010LSB2MSBNeon`, `copyMetadata` UAF-guard,
`OGLBasicToneProcess` inert) are **buffer-geometry / null-guards only — "metadata reach: ADJACENT, not
participatory"**; they do NOT inject or restore the OEM CCM / OEM-metadata. So: the SR-CCM does originate in
libAlgoProcess (libapsfixup's target), but libapsfixup as written does **not feed** the `ipe.ccm` /
`oemChimetadatas` path. If those are empty on LOS, the cause is upstream of (and untouched by) the present
libapsfixup hooks — i.e. the APS engine simply isn't emitting the OEM result for this reprocess, OR its result
isn't being attached to the URO source vector / published as `ipe.ccm`.

---

## Concrete LOS-impl fix candidate

1. **Do NOT** patch `com.qti.chi.override.so` copy logic or the `OplusSetAidlOfflineMeta` stub — both are
   build-identical to OOS / no-ops on OOS too. Do NOT patch `OplusOverrideIPECCMData` — it correctly reads a tag.
2. The lever is **getting the OEM/APS result produced AND attached**: (a) `com.oplus.*` APS InputMetadata
   ChiMetadata into the URO source vector (`srcObj+0x658` → `m_oemChimetadatas`), and (b) the AI-CCM published as
   `com.oplus/ipe.ccm` (via `camera.qcom.core` `oplusAWBPublishAlgoProcessOutput` / `camera.oemlayer.v2`
   reading `com.oplus.custom.ccm.sync.result`). The single producer to make work is the **libAlgoProcess SR/APS
   result for the reprocess request**.
3. **Decisive next probes (live, for the device-owning agent):**
   - Hook `OplusOverrideIPECCMData` (`com.qti.hwcfg.ipe.so` ELF `0x1894c`) and dump the `GetDataList` return for
     `com.oplus/ipe.ccm`; hook `oplusAWBPublishAlgoProcessOutput` in `camera.qcom.core.so` — confirm whether
     `ipe.ccm` is ever published on LOS, and whether `oplusAWBLocalCCM`/`oplusAWBFaceCCM` go null (lines 637/668).
   - Hook the `m_oemChimetadatas` populate at chi.override ELF `0x2bfb48` and read `srcObj+0x658..0x660` size; and
     hook `libAlgoProcess` writing `com.oplus.custom.ccm.sync.result` — confirm the engine emits the OEM result.
   - Check whether `camera.oemlayer.v2.so` / `libAlgoInterface.so` is actually loaded + its
     `GetInputMetaData`/`com.oplus.custom.ccm.sync.result` path runs on LOS (a missing/short-circuited OEM layer
     would zero BOTH outputs at once — the single-root scenario).

---

## VERIFIED-vs-INFERENCE ledger

**VERIFIED (tool/data-derived):**
- `OplusOverrideIPECCMData` (`com.qti.hwcfg.ipe.so` `0x11894c`) reads CCM via vendor tag `com.oplus`::`ipe.ccm`
  (`GetVendorTagId`+`GetDataList`, reloc-resolved); null branch logs "getRawSRAlgoMetaData ccm is null" @ line 1427;
  on hit writes a 3×3 CCM. Source-file path `opluscamxchinodehwcfgipedummy.cpp` matches the brief log. (§Q2)
- `m_oemChimetadatas` = `std::vector<ChiMetadata*>` at URO+0x4770; `createInputInfo.oemChimetadatas` is its copy
  via `oplusGetOemChimetadatas` (`0x3c30f0`); populated from a SOURCE vector `srcObj+0x658/0x660` at chi.override
  `0x3bb8cc`/`0x3bfb48`; size 0 ⇔ source empty. (§Q1)
- `OplusSetAidlOfflineMeta` is an 8-byte empty stub on BOTH infiniti and OOS dump300 (refuted as divergence). (§Q1)
- `ipe.ccm` producer = `camera.qcom.core.so` (`oplusAWB*`/`publishControl`); CCM data + `com.oplus.custom.ccm.sync.result`
  produced by `libAlgoProcess.so`; bridged by `camera.oemlayer.v2.so`. chi.override carries the `com.oplus.*APS`
  InputMetadata tags (= oemChimetadatas contents). (§Q2/Q4)

**INFERENCE (not proven here, needs live probe):**
- That `oemChimetadatas=0` AND `ipe.ccm`=null share ONE upstream root = the libAlgoProcess/OEM-layer APS result not
  being produced/attached for the reprocess request (mechanism-supported; not traced live).
- That the app-side "not in defer scene"/0-byte rename is driven by the same missing APS result (Q3; lives in
  app/APSClient, not these blobs).
- That libapsfixup *should* but currently does not feed this path (supported by libapsfixup-RE: its hooks are
  geometry/UAF only, "metadata reach ADJACENT, not participatory").

## A-vs-B RESOLUTION (axis-3, 2026-06-15): SR-CCM is an INDEPENDENT gate, NOT downstream of fusion — VERIFIED (logs)

Decisive counterexample (golden device, full CamX logmask, `reference/_golden-oos-V16.1.0/campaign/beauty/run1/ab/logcat_all.txt`):
the OEM/fusion path is SATISFIED (`customVendorTag 120`, `oemChimetadatas.size: 1` ×4, `SaveOemLayerChiMetas`,
`MCXSuperFG` ×188, `OplusSATFusionOfflineReprocess`) **yet `getRawSRAlgoMetaData ccm is null` STILL fires**.
⇒ Populating `oemChimetadatas` / running fusion does NOT clear the SR-CCM gate. The two are **separate
producers** (fake-convergence with the oemChimetadatas root is REJECTED for the CCM specifically).

The SR-CCM consumer reads vendor tag id **`-1995177860 = 0x8914007C`** (OEM section bit 0x8000000 set;
base `0x8114007C`) via `camxchinodehwcfgutils.cpp:142 GetDataList()` inside the OFE/IPE dummy nodes
(`opluscamxchinodehwcfgofedummy.cpp:203` / `camxchinodehwcfgipedummy.cpp:497 OverrideIPECCMData run failed!`).

Log-robust (WARN/ERROR, verbosity-independent) discriminator — `OplusOverrideIPECCMData run failed`:
| capture | OverrideIPECCMfailed | ccm-null | AWBpublish (VERB) |
|---|---|---|---|
| LOS photo-hdr | **3420** (every frame) | 3207 | 0 (logmask off) |
| LOS full-baseline | **3498** | 3287 | 0 |
| GOLD device beauty | **10** (warmup only) | 6 | 43 (succeeds) |
| OOS-300 ref | **0** | 0 | 0 (logmask off) |

OOS/golden: CCM present → `OverrideIPECCMData` succeeds for capture frames. LOS: fails ~3500×, EVERY frame.
Because OOS-300 shows `OverrideIPECCMfailed=0` with its STATS logmask OFF, the failure-side count is NOT a
verbosity artifact — when the CCM is published the WARN simply never fires.

**Producer chain (from §Q2):** `libAlgoProcess` (ccmData[] + `com.oplus.custom.ccm.sync.result`) →
`camera.qcom.core.so` `opluscamxcawbstatsprocessor.cpp` `oplusAWBPublishAlgoProcessOutput()` (line 692
`IPECCMData{...}`; null-guards lines 637/668 `oplusAWBLocalCCM/FaceCCM is null!`) → publishes tag
`0x8114007C` (`com.oplus/ipe.ccm`). On LOS this publisher's output never reaches the per-request HwCfg pool
(`GetDataList TagId 0x8914007C not find`). camera.qcom.core.so (LOS md5 `4480876f04ebf20102179734ff7545ac`)
DOES contain `oplusAWBPublishAlgoProcessOutput` + `opluscamxcawbstatsprocessor.cpp` symbols, so the blob is
present; the break is runtime (engine produces no CCM, OR publish short-circuits, OR the OEM AWB stats
processor is not instantiated). **The LOS-vs-golden absence of the VERB publish line is NOT conclusive on its
own (logmask confound).**

**Decisive device probe (for device-owning coordinator):** hook `oplusAWBPublishAlgoProcessOutput` in
`camera.qcom.core.so` (symbol present) on LOS during an HDR/SR capture and read (a) whether it is called at
all, (b) `oplusAWBLocalCCM`/`oplusAWBFaceCCM` null at lines 637/668, (c) the `IPECCMData{}` it publishes. If
never called → break is upstream (libAlgoProcess SR engine not emitting `com.oplus.custom.ccm.sync.result` /
ccmData, OR the OEM AWB stats processor not wired). If called but values null → break is the SR/AWB compute
input. This single hook splits (a) engine-not-producing vs (b) publish-not-firing vs (c) processor-not-wired.

## v1.4 baseline correction (2026-06-16)

The current `full-baseline` is decision-ready for normal photo and does not show the old no-save shape: shutter
fires, `hdr_detected` is present, `copyMetadata` UAF is false, and the preview overexposure does not propagate to
the saved JPEG. Therefore this note should be scoped as a **mode-specific SR/CCM/OEMLayer gate**, not the current
preview-overexposure root and not downstream of the EDR/SF failure.

Keep the independent-gate verdict: `oemChimetadatas`/fusion and SR-CCM can diverge separately. Use this RE when
HDR/SR/beauty/night captures show missing OEM metadata or `OverrideIPECCMData` failures; do not use it to explain
normal-photo preview tonemapping.

## Anchors / files of record
- Ghidra project `oos-baseline-v3` (socket `/run/user/1000/ghidra-mcp/…`): programs `com.qti.chi.override.so`,
  `com.qti.hwcfg.ipe.so` (imported + annotated this session; plate comments @ `0x11894c`, `0x3c30f0`, `0x42cc38`;
  decompiler/disasm comments @ `0x3bfb48`, `0x118a18`). Saved.
- Local copies: `/tmp/sr-re/com.qti.chi.override.so`, `/tmp/sr-re/com.qti.hwcfg.ipe.so`.
- Cross-refs: `libapsfixup-interposition-RE.md` (libAlgoProcess hooks, metadata-reach=ADJACENT),
  `customvendortag-producer-RE.md` §7 (this thread's predecessor), `apsclient-*-RE.md`, `44-libalgoprocess-…`,
  `45-aec-hdr-detect-…`, `47-root-cause-correction-two-gates.md`.
