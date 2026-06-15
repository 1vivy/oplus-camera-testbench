<!-- Parent: ../INDEX.md -->
<!-- Node template + FACT contract: ../SCHEMA.md. Six sections (a)-(f) are fixed. -->

---
node: C4
title: "HAL provider (vendor.qti.camera.provider-service_64) — OEM vendor-tag publish into per-frame result metadata"
plane: control
partition: /vendor
blob_identical_oos_los: true
characterization: CHARACTERIZED  # (a) hdr_detected publish OBSERVED end-to-end on daytime HDR scene: tag 0x80be000b in hash table + OplusPublishCameraMetadata HDRDetected:1, N=3 stable (photo-hdr verdict.json). OEM IPE TurboHDR ~0x4d78 carrier still DARK (app-side observe_getmetadata never loaded libAlgoProcess) — noted in (a), does not block the #2 publish characterization.
conviction: OPEN               # leading hypothesis only; no claim convicted, OOS↔LOS A/B deferred to LOS phase (stock-only capture, no LOS arm)
verdict: "hdr_detected (0x80be000b) IS published rc=0-equivalent on stock daytime HDR: OplusPublishCameraMetadata() emits HDRDetected:1 (frameLuma~58, touchLuma~38, preRealAdjMaxEV 3.0→7.08) once scene triggers; libaecCustom gate +0x48=1 + HDRTriggerFlagDetection ran 2294×."
confidence: high
symptoms: [2, 6]
probes: [enable/10, observe_getmetadata.js, probe_aec_getparam.js]
gaps: [G2, G3, G7, G8]
dodge_ref: ""
dirty_ref: ""
divergence: ""
upstream: [C5, C6]
downstream: [D2, D4]
refuted_refs: []
doc_refs: [doc-42, doc-45, doc-47, doc-48]
updated: 2026-06-14
---

# C4 — HAL provider: OEM vendor-tag publish into per-frame result metadata

> **Axiom for this node.** The provider service binary is **byte-identical OOS↔LOS** (it inherits
> CamX/CHI/OEM levers in-process; lever-index: HAL provider = **WORKS**, no md5 delta recorded). The
> provider *is the publish SITE* of the OEM result-metadata tags — it is **never the ROOT**. The root of a
> missing tag is the **session-state / settings input** that should make the CamX AEC/IPE node *populate*
> the tag this frame: `camxoverridesettings.txt` (E3) and the static-cap-seeded HDR session params (C5
> `LegacyUpdateStaticSettings` gated by `+0x6544`/`HWMFHDRSupported`). C4 publishes what C5/C6 hand it.

## (a) Propagation contract — named carriers

> **OBSERVED on stock (photo-hdr campaign, daytime window+wall HDR, build V16.1.0 / OP611FL1, photo mode,
> ae_lock=1, N=3 ALL STABLE — `verdict.json`).** The #2 publish contract is now seen END-TO-END: the
> libaecCustom compute/export gate AND the CamX OEM AEC-node publish of `0x80be000b` both fire on the HDR
> scene. The OEM IPE TurboHDR `~0x4d78` carrier remains UN-OBSERVED (app-side probe dark — see below).

**What enters C4** (from C5 CamX/CHI + C6 APS, same process):
- AEC node output via `camAECGetParam(handle, paramType, in, out)` (export, `libaecCustom.so`) — the
  per-param-type pull the publish loop reads `hdr_detected` (algo writes `aecOut+0xfc`) and `drc_gain` from.
  **OBSERVED:** native probe `probe_aec_hdrdetect.log` (frida, in `vendor.qti.camera.provider-service_64`
  PID 1536, `libaecCustom.so @ 0x7a58485000`) caught the `HDRDetectProcess`/`HDRTriggerFlagDetection` pair
  firing **2294×** on the HDR scene: every fire `[HDRDetect] enable(+0x48)=1` (master gate open — RE
  `@0x1b4d8c`, `*(ctx+0x48)`) and `[HDRTrigger] ran (hdr_detected computed this frame)` (producer writes
  `aecOut+0xfc` — RE `@0x1ed7e4`). Both `tuning+0xd0` branches exercised: `bgsat=1` 1529× (motion path),
  `bgsat=0` 765× (BGSat over-exposure-ratio path). ⇒ compute+export confirmed live, matching the static RE.
- HDR session-param set seeded by C5 `LegacyUpdateStaticSettings` (Ghidra `0x472534`) — gated on
  `SettingsManager+0x6544`; only when seeded do the AEC/IPE nodes have HDR fields to publish. **OBSERVED:**
  `dump_camxsettings.log` reads `+0x6544 (was already 1)=1` on stock (the seed gate is satisfied); the SHDR
  usecase levers `+0x6a18(hdrModeInfo)=0 +0x6a28(shdrAutoExp)=0 +0x6a40(setHDRMode)=0` read 0 at this
  daytime-HDR window (single-frame HDR-detect path, not the 3-exp SHDR usecase — `+0x1e0 enable3expSHDRSnapshot=0`).
- IPE TurboHDR raw-info struct → `TurboRaw::parseTurboHdrInfo` store into `field_0x4d88` (consumed by
  `setProcessOtherParams+140` = `0x1441ad4`, which loads `field_0x4d88` via `ldr x23,[x0,#0x4d88]`).

**What leaves C4** (published into per-frame `camera_metadata` result, read downstream by C6/D2/D4):
- `com.qti.stats_control.hdr_detected` — **tag id `0x80be000b`**. **OBSERVED PRESENT on stock OOS daytime
  HDR (N=3 stable):** the tag resolves in the vendor-tag hash table every run (`camxvendortags.cpp:419
  QueryVendorTagLocation() … tag hdr_detected … location is 80be000b`, 4/4/4 across run1/run2/run3), and the
  OEM AEC IO node **publishes the value** via `opluscamxcaecioutil.cpp:1374 OplusPublishCameraMetadata()` —
  `HDRDetected:1` on the HDR scene (e.g. run1 ReqId 308/366/592/675: `frameLuma 58.2`, `touchLuma 38.0`,
  `preRealAdjMaxEV` jumps `3.0→7.08`), vs `HDRDetected:0` on the dark/idle baseline frames (ReqId 81/196/281:
  `frameLuma ~49`, `touchLuma -1`, no HDR-EV). `OplusPublishCameraMetadata HDRDetected:1` fired 4/3/2 per run
  (present every run, `verdict.json #2 hdr_detected publish = present ×3, variance stable`). This is the
  stock `rc=0`-equivalent baseline; the LOS `rc=-2 / 0xfffffffe` (NOT PRESENT) arm is **deferred to the LOS
  phase** (stock-only capture). Sibling fields publish in the same node (`OplusPublishStatControlMetadata()`
  `[AECDBG]` emits `drc_gain`/`QBCHDRDetected`/ADRC each ReqId regardless) → the (predicted LOS) gap is
  *selective per-field*, not whole-section.
- `org.quic.camera.AutoHDRSupport` (QCom capability/result tag family; sibling of the static cap
  `org.quic.camera.HWMFHDRSupported`/`isHWMFHDRSupported` that gates the C5 seeder).
- **OEM IPE TurboHDR vendor tag, hash `~0x4d78`** — written into per-frame result metadata by the OEM IPE
  metadata node; LOS never publishes it ⇒ `parseTurboHdrInfo` cbz-skips its store ⇒ `field_0x4d88` stays
  null ⇒ `setProcessOtherParams+140` (`0x1441ad4`) `strlen(null)` SIGSEGV (symptom #6).
  **NOT OBSERVED (carrier still DARK):** the app-side reader probe `observe_getmetadata.log` reports
  `libAlgoProcess.so never loaded` (intCalls=0, distinctFails=0) — the in-app `APSMetadata::getMetadata`
  hook never attached this run, so the `~0x4d78` TurboHDR tag was not seen at the app boundary. #6's carrier
  is therefore inferred from RE only, not yet runtime-confirmed (keeps that sub-contract honest at unseen).
- `com.qti.stats_control.*` peer fields (`aec/hdr/drc/adrc/lux/expos` keyspace) that `observe_getmetadata.js`
  classifies PRESENT/OK vs MISSING. **OBSERVED:** the CamX section is heavily live — `stats_control` tag
  resolutions 728/771/317 per run (`ExposureCount 80be0002`, `DCGMode 80be0005`, `drc_gain 80210000`,
  `couple_hdr_detected 80be000f`, `qbc_hdr_detected 80be001e`, etc. all resolve in-hash).

## (b) Environment dependencies (the non-blob things the publish needs)

- `/vendor` binary `vendor.qti.camera.provider-service_64` — present; the AIDL provider host process the
  CamX/CHI/OEM libs run inside. (Not the root; the blob is identical.)
- **`/vendor-config` `/vendor/etc/camera/camxoverridesettings.txt`** — absent on LOS (strace:
  `openat(".../camxoverridesettings.txt") = -1 ENOENT`). Its session-state keys (`selectSHDRAutoExposureUsecase`
  `0xDC4EAFC3` family) are what flip the SHDR/HDR usecase so the node has `hdr_detected` to publish (E3).
- **Static camera metadata cap `org.quic.camera.HWMFHDRSupported`/`isHWMFHDRSupported`** in the LOS device
  sensor caps — derives C5 `StaticSettings+0x6544`; if 0/absent, `LegacyUpdateStaticSettings` is skipped and
  no coherent HDR set exists to publish (E3/C5 upstream).
- CamX/CHI log-clobber defeat (`OverrideLogSettingsAtConfigureFile@0x151c4`, `ModifyLogSettings@0x4ab6f8`) —
  needed only to *observe* the publish, not for it to occur (lever-index CamX/CHI = CLOBBERED→fixable).

## (c) Fact-to-resolve (ONE question → knob/root)

**Q: In an HDR-triggering scene, does the provider publish `com.qti.stats_control.hdr_detected (0x80be000b)`
with `rc=0` on stock OOS — and is the gate the *publish step in the node* or the *upstream session-state
input* (`camxoverridesettings.txt` / `+0x6544`-seeded params)?**

- **If `observe_getmetadata.js` shows `hdr_detected@rc=0` on stock but `rc=-2` on LOS, and the `camAECGetParam`
  tally shows the HDR/stats param-type IS pulled on stock but NOT on LOS** ⇒ root is **upstream session-state**
  (E3 `camxoverridesettings.txt` + C5 `+0x6544` cap), C4 is an innocent publish site. → Action: ship the E3
  override key + advertise `HWMFHDRSupported=1`; the OEM tag (`0x4d78`) is predicted to publish *for free* once
  the same HDR session-state turns on (doc-42: #6 is the sibling of #2). This is the leading hypothesis.
- **If stock pulls the param-type yet still does NOT emit `0x80be000b` at the app while drc_gain does** ⇒ root
  is a **CamX-side per-field publish gate inside the node** (the provider/CamX publish list), a /vendor-blob-
  internal selection — but per the axiom (identical blob) that selection must itself be data-driven by a
  setting, looping back to E3. → Action: name the publish-selecting setting via `dump_camxsettings.js` (G3).

## (d) Runtime probe(s)

- **`enable/10` (`enable/10_vendor_camx_chi.sh`)** — bind-mounts a wide-open `camxoverridesettings.txt` + sets
  `persist.vendor.camera.oplus.enableLogging=true`, then `killall vendor.qti.camera.provider-service_64` +
  `cameraserver` to re-read. Status **WORKS** (provider inherits CamX+CHI+OEM levers, same process).
- **`tools/frida/observe_getmetadata.js`** — hooks `APSMetadata::getMetadata` overloads in
  `libAlgoProcess.so` (in-app) and logs `(tag,rc)`; rc `-2` = tag absent. Resolves the named `com.qti.stats_control.*`
  / `org.quic.*` tags by NAME (build-id robust). Status **FRIDA-ONLY/WORKS**; reads C4's *output* contract.
- **`tools/frida/probe_aec_getparam.js`** — hooks `camAECGetParam` in the provider; tallies which `paramType`s
  the CamX node pulls from the algo on LOS vs stock. Status **WORKS** (attach to provider; G8 split-probe — the
  algo-exports-vs-node-drops discriminator). G7 caveat: APS alog disk verbosity SELF-KILLS the marginal HAL
  (doc-43) → use these native frida hooks, never `lao.enable` alog, on C4.
- **Gaps:** G3 (stock StaticSettings dump names the publish-gating key), G2 (declobbered CHI snapshot graph).
  HDR-family facts (#2/#6) require an **HDR-triggering scene** (OOS-BASELINE §3: 0 `hdr_detected` mentions at
  idle indoor — G-COND fails for any idle capture).

## (e) Dodge-vs-dirty diff

Not an E-node; no dodge oracle artifact for C4 (the publish blob is identical OOS↔LOS — dodge ports nothing
here). The actionable divergence is environmental and lives in the **E3** node (`camxoverridesettings.txt`
present OOS / absent LOS) and the **C5** static-cap seeder, not in this provider. `divergence: ""` (n/a here).

## (f) Symptom leaves

- **#2 (no-JPEG / `hdr_detected` rc=-2)** — C4 is the **PROXIMATE publish SITE** (`0x80be000b` not in result
  metadata → app/APS read `rc=-2`). **ROOT is upstream**: C5 SHDR gate (`selectSHDRAutoExposureUsecase
  0xDC4EAFC3`) / E3 `camxoverridesettings.txt`. Edge: `C5→C4` (gate decides whether C4 has the field to
  publish). Note doc-47: this gate is real for HDR/exposure but does **not** block JPEG/fusion (those run
  without it) — C4's tag-publish symptom is the HDR/exposure leaf, not the freeze.
- **#6 (strlen-null TurboHDR)** — C4 is the **ROOT-bearing publish SITE for the OEM IPE TurboHDR tag
  (`~0x4d78`)**: never published → `parseTurboHdrInfo` skip → null `field_0x4d88` → SIGSEGV at
  `setProcessOtherParams+140` (`0x1441ad4`, deref `field_0x4d88`). Edge: same HDR-session-state class as #2 (doc-42 Family III ≡ #2 sibling); resolved by
  the same E3/C5 lever, not a provider blob edit. The `libapsfixup` `strlen` null-guard (GOT `0x1bb6888`) is
  the interim crash-safe defense, not the root fix.

> **Ledger gate status.** characterization **CHARACTERIZED** (the #2 publish wire is now OBSERVED end-to-end on
> stock) / conviction OPEN (no root claim convicted; OOS↔LOS A/B deferred to LOS phase), confidence high.
> **G-MECH (runtime↔RE pairing):** the RE gate `HDRDetectProcess @0x1b4d8c` (`*(ctx+0x48)`) and producer
> `HDRTriggerFlagDetection @0x1ed7e4` (writes `aecOut+0xfc`) are DIRECTLY observed live — `probe_aec_hdrdetect.log`
> caught `enable(+0x48)=1` + `HDRTrigger ran` 2294× on the HDR scene, and the value reaches result metadata as
> `OplusPublishCameraMetadata() HDRDetected:1` (tag `0x80be000b`), N=3 stable. This is a **#2 publication** contract
> (computes correctly on stock), NOT the #1 freeze root (R-08). G-COND met (daytime HDR scene, HDRDetected 0→1
> transition recorded); G-SYM (OOS↔LOS) remains LOS-deferred ⇒ conviction stays OPEN. Remaining DARK carrier: the
> OEM IPE TurboHDR `~0x4d78` tag (#6) — app-side `observe_getmetadata` never loaded `libAlgoProcess.so` this run.
