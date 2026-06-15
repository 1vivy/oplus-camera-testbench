<!-- STATUS: MIXED — inference-surgery applied 2026-06-14. Verified body = directly observed/measured facts
     (config A/B on host, R5 publish OBSERVED on stock N=3, X1 SHDR knob reads 0 in-scene N=3, md5 diffs,
     grep-verified carrier counts). All optimal-form mechanism verdicts, R5/R6 session-typing root attributions,
     and forward fix specifications moved to "Inferences & Open" below.
     Guard: a measured config-absence SITE is never a verified ROOT; "SUPPORTED" conviction = host A/B only,
     not a device runtime proof. -->
<!-- Parent: ../interop-tree/INDEX.md · Re-scoped from interop-tree/facilitation/E3-toggles-config.md (Phase-2 F-lane migration) -->
<!-- Owns REQUIREMENTS rows: R5 (hdr_detected publish), R6 (TurboHDR vendor-tag publish). X1 = DOWNGRADED, do-not-author. -->
---
node: F3
title: "toggles / config → HDR session-state typing (props · permissions XML · overlays · the RETIRED camxoverridesettings knob)"
plane: facilitation
partition: mixed
owns_requirements: [R5, R6]
downgraded_requirements: [X1]   # selectSHDRAutoExposureUsecase — CONFIRMED red herring, DO NOT author
blob_identical_oos_los: true    # config text, not a blob; every lever here is an environment/facilitation contract
characterization: CHARACTERIZED # dodge-oracle structural map complete (md5 diffs + grep-verified carriers); proof-of-form resolved per row
conviction: SUPPORTED           # carried from E3: config A/B (dodge-oracle vs dirty) run on host; R5 publish OBSERVED on stock, R6 DARK
confidence: medium
symptoms: [2, 6]
probes: [B1, B2, dump_camxsettings.js, parse_strace.py, observe_getmetadata]
gaps: [G3]                      # G3 narrowed: NOT "does stock ship the SHDR file" (answered NO) but "is the session-typed in-scene publish reproduced on LOS"
dodge_ref: "dodge-camera-port/repos/{vendor_oplus_camera/{configs,opluscamera.mk,sepolicy}, android_device_oneplus_dodge/{vendor,odm,system_ext}.prop, proprietary_vendor_oneplus_dodge/proprietary/odm/etc/camera/*, android_hardware_oplus/overlay}"
dirty_ref: "vendor_oplus_camera/{configs, overlay, opluscamera.mk}; tools/enable_verbose.sh (runtime camxoverridesettings.txt overlay — logging-only)"
divergence: "differs — perms 7 vs 3 (intentional E1/HDR plumbing, KEEP), privapp XML differs (md5 3df7a941→4a4cec19, stubs-dep, KEEP), props superset (HDR/EDR, KEEP), camxoverridesettings.txt in NEITHER repo; NEITHER side ships a functional SHDR knob ⇒ the knob is a red herring, not a missing artifact"
upstream: [C4, C5]
downstream: [C4, C5]
supersedes: ["interop-tree/facilitation/E3-toggles-config.md §(c)/§(e) camxoverridesettings recommendation"]
refuted_refs: [X1]
doc_refs: [doc-42, doc-47, doc-48, rearch/47, POST-PROCESSING-CONTRACT.md]
updated: 2026-06-13
phase_d_artifacts: "D2 config-derivative walk: R5/R6 carrier = infiniti odm CameraHWConfiguration.config (device-native, NOT adopt-from-dodge); R6 namespace = same_process_hal_file APS/CamX label family (parity with dodge); HDR/EDR props superset (KEEP)"
---

# F3 — toggles / config → HDR session-state typing (R5 hdr_detected publish · R6 TurboHDR tag)

Re-scope of E3 from "dodge-vs-dirty DIFF" to **requirements → mechanism → optimal-LOS-form**. The config surface
our port ships (PRODUCT_COPY_FILES permissions/sysconfig + PRODUCT_*_PROPERTIES props + RRO overlay) and applies
at runtime (`tools/enable_verbose.sh` bind-mount) is no longer scored against dodge symmetry; it is scored against
the two REQUIREMENTS contracts this node OWNS (R5, R6) and the **session-state typing** that satisfies them.
Per the trunk axiom every lever here is an environment/facilitation knob, never a blob edit.

## ⚠ CRITICAL CORRECTION (authoritative — retires the old E3 recommendation)

**RETIRE** E3 §(c)/§(e)'s "author a functional `camxoverridesettings.txt` with `selectSHDRAutoExposureUsecase=1`."
That knob is **X1 = DOWNGRADED / CONFIRMED red herring** (REQUIREMENTS X1; C5 §a SESSION FACT 2/3/4):

- `dump_camxsettings` reads `+0x6a28 LEVER(shdrAutoExp)=0` **even inside a real daytime HDR scene**;
  `ConfigureHDRInformation() GetSHDRAutoExposureUsecase = 0` on every run, `= 1` appears **0×** (N=3).
- Siblings `+0x6a18`, `setHDRMode +0x6a40`, `enable3expSHDRSnapshot +0x1e0` are **all 0 in-scene** too.
- Stock HDR rides **`HDRFeature`/HDRMode=1 + DCG `numHDRExposure 1→2` + offline fusion**
  (`OplusSATFusionOfflineReprocess`), **NOT** the auto-exposure usecase.

**Proof-of-form from the oracle:** dodge ships **no** `camxoverridesettings.txt` and **no** `selectSHDRAutoExposureUsecase`
string anywhere in its tree (grep = 0 hits); its HDRMode/numHDRExposure carriers live in proprietary **odm CamX
config blobs** (`proprietary_vendor_oneplus_dodge/proprietary/odm/etc/camera/CameraHWConfiguration.config`,
`config/camera_unit_config`), not in any author-able config our port owns. So the oracle **refutes** a shippable
SHDR-config-file fix and **confirms** the lever is session-state, not a toggle file. **Do NOT author the knob.**

## Two-axis status

`characterization: CHARACTERIZED` (dodge-oracle structural map complete; X1 closed; proof-of-form per row resolved) ·
`conviction: SUPPORTED` (config A/B = dodge-oracle-vs-dirty, host; R5 publish OBSERVED on stock, R6 carrier DARK).

---

## Owned requirements → mechanism → optimal-LOS-form

### R5 — `hdr_detected` (0x80be000b) must be PUBLISHED into per-frame result metadata in an HDR scene

- **(i) Contract to satisfy.** AEC computes+exports `hdr_detected` unconditionally
  (`HDRTriggerFlagDetection` writes `aecOut+0xfc`, device `0x0ed7e4`; gate `HDRDetectProcess` `*(*ctx+0x48)==0⇒no-op`,
  device `0x0b4d8c`). Stock: **PRESENT + stable daytime HDR** (`camxvendortags.cpp:419` resolves `location 80be000b`;
  `opluscamxcaecioutil.cpp:1374 OplusPublishCameraMetadata() HDRDetected:1`, frameLuma~58, preRealAdjMaxEV 3.0→7.08;
  gate `+0x48=1`; `HDRTriggerFlagDetection ran` 2294×, N=3). LOS arm = `rc=−2`, LOS-deferred. This is the **#2
  PUBLICATION** contract, **not** the #1 freeze root (R-08 / X2 refuted that conflation).
- **(ii) Optimal LOS mechanism = HDR SESSION-STATE / scene-typing config, NOT the SHDR knob.** Publish SITE is **C4**;
  the lever is whatever **types the session as HDR** so the AEC enters the in-scene branch that publishes
  `hdr_detected`. Concretely: the HDRMode=1 / numHDRExposure 1→2 session typing (the path stock actually rides) —
  carried by the OEM camera **session/CamX config** + the HDR/EDR **props** that gate the OEM HDR feature, **not** a
  `selectSHDRAutoExposureUsecase` toggle. Optimal form is therefore: **adopt** the OEM session-typing config carrier
  (config artifact) + **keep** the HDR-feature props that arm it; author **nothing new** at the SHDR-knob site.
- **(iii) Dodge as proof-of-form.** Does a shipping reference prove this form? **YES, by negation + by carrier.**
  Dodge proves the SHDR-toggle form does **not** exist on a working device (no knob file, no knob string), AND proves
  the working session-typing carriers live in **odm CamX config blobs** (`CameraHWConfiguration.config`,
  `config/camera_unit_config` — grep-confirmed HDRMode carriers). So the optimal form ("type the session via the OEM
  CamX/session config, let the AEC publish") **is** the shipping reference form. Cite:
  `dodge-camera-port/repos/proprietary_vendor_oneplus_dodge/proprietary/odm/etc/camera/{CameraHWConfiguration.config, config/camera_unit_config}`.
- **(iv) LOS-confines weighting.** Treble-clean: **high** — session-typing config is /vendor|/odm-side, no boot-jar or
  framework patch needed; re-buildable: **high** (config artifact, not a binary); system_ext-vs-boot-jar: N/A (config,
  not jar); author-new-vs-adopt: **ADOPT** the odm CamX session-typing carrier, do not author a new toggle. The HDR/EDR
  props superset our port already ships (`persist.sys.feature.{localhdr_version=2,hdr_vision_app=1,uhdr.support,support.edrlistener,dolby_vision}`,
  `persist.camera.override_preview_hdr_support=1`, `ro.vendor.oplus.hdr.uniform=1`) is the **right** divergence — it arms
  the OEM HDR feature path — **keep it**.

### R6 — OEM IPE TurboHDR vendor tag (~0x4d78) must be PUBLISHED in an HDR scene (sibling of R5)

- **(i) Contract to satisfy.** Un-published ⇒ `TurboRaw::parseTurboHdrInfo` cbz-skips its store ⇒ `field_0x4d88` null
  ⇒ `setProcessOtherParams+140` `strlen(null)` SIGSEGV (**#6**), device `0x1441ad4`. Stock carrier is **DARK** — RE-inferred
  only; `observe_getmetadata` never loaded `libAlgoProcess.so` this run (intCalls=0). Currently **MASKED** by libapsfixup
  **Family-III** (`strlen@LIBC` null-guard, slot `0x1bb6888`, `strlen(null)→0`; POST-PROCESSING-CONTRACT.md §(III), Verdict
  table row 3).
- **(ii) Optimal LOS mechanism = ensure the TurboHDR vendor-tag publishes in an HDR scene (same session-state class as R5),
  then RETIRE the Family-III guard.** Same lever family as R5: the HDR-session typing that puts the OEM IPE HDR path in its
  in-scene branch is what makes `parseTurboHdrInfo` take the store branch (non-null `field_0x4d88`). This is **not** a new
  toggle and **not** a framework patch — it is the same session-typing config carrier as R5, plus ensuring the
  `~0x4d78` vendor-tag is **registered/resolvable** (vendor-tag namespace, the same surface R5's `80be000b` resolves through
  at `camxvendortags.cpp:419`). Once R6 publishes in-scene, **retire libapsfixup Family-III** (the guard becomes dead code;
  POST-PROCESSING-CONTRACT.md Verdict: "RETIRE via root fix — III TurboHDR `strlen` guard").
- **(iii) Dodge as proof-of-form.** Does a shipping reference prove this form? **PARTIAL.** Dodge proves the carrier-namespace
  form: the entire APS/CamX library family is labeled `u:object_r:same_process_hal_file:s0` in
  `dodge-camera-port/repos/vendor_oplus_camera/sepolicy/vendor/file_contexts` (libaps*, libcamera_metadata, postproc,
  camera-metadata NDK), i.e. the vendor-tag producer resolves in the **sphal / same_process_hal** namespace — the form R6's
  tag publish must live in. Dodge does **not** give a runtime trace of the `~0x4d78` publish (no app-side capture), so it is
  proof-of-**namespace-form**, not proof-of-publish; the publish itself stays **DARK** pending `observe_getmetadata` with
  `libAlgoProcess` loaded in-scene. Cite: `dodge-camera-port/repos/vendor_oplus_camera/sepolicy/vendor/file_contexts` (# Camera block).
- **(iv) LOS-confines weighting.** Treble-clean: **high** — sepolicy-namespace grant (`same_process_hal_file` label on the
  APS/CamX tag-producer libs) + the same odm session-typing config; re-buildable: **high** (sepolicy + config, no binary);
  system_ext-vs-boot-jar: N/A; author-new-vs-adopt: **ADOPT** the dodge sepolicy `same_process_hal_file` labeling form for the
  APS/CamX tag-producer family + the R5 session-typing carrier; author **no** new guard (the goal is to **delete** Family-III,
  not add). The `strlen` guard is a **mask to retire**, not a fix to keep.

### X1 — `selectSHDRAutoExposureUsecase` (DO NOT AUTHOR)

- **DOWNGRADED — CONFIRMED red herring** (see CRITICAL CORRECTION above; REQUIREMENTS X1). Reads `0` in a real HDR scene,
  N=3; stock HDR does not use it. **Do not author the knob, do not ship a functional `camxoverridesettings.txt`, do not
  redirect R5/R6 to it.** Kept here only so no session re-chases it. The only `camxoverridesettings.txt` our port
  materializes is `tools/enable_verbose.sh`'s **logging-mask-only** overlay (`enableAsciiLogging`, `overrideLogLevels`,
  `logInfoMask=0x1FFFFF`, `chiLog*Mask`) — that is a debug lever, correctly carries **no** functional key, and must stay
  logging-only.

---

## (e) Dodge-vs-dirty — KEEP/RETIRE ledger (carried from E3, re-verdicted)

Oracle = `dodge-camera-port/repos/{vendor_oplus_camera/{configs,opluscamera.mk}, android_device_oneplus_dodge/*.prop, android_hardware_oplus/overlay}`.
Ours = `vendor_oplus_camera/{configs, overlay, opluscamera.mk}` + runtime `tools/enable_verbose.sh`.

| Artifact | Dodge (oracle) | Ours (dirty) | Verdict (re-scoped) |
|---|---|---|---|
| **permissions XML count** | 3 | **7** (+gallery/features/extensions) | **KEEP** — extras are intentional E1/HDR plumbing (gallery/EDR), off the R5/R6 lever |
| **`privapp-permissions-oplus.xml`** | md5 `3df7a941…` | md5 `4a4cec19…` (stubs-dep + safe grants) | **KEEP** — `dependency="oplus.camera.stubs"` is correct E1 plumbing; do NOT revert to dodge |
| **`sysconfig/hiddenapi…`, `oplus_camera_default_grant…`, `oplus_google_lens_config.xml`** | byte-identical | byte-identical | **same** (axiom: identical config is never a root) |
| **props (HDR/EDR superset)** | lean set in device `.prop` (`# Camera` = market-name only: `ro.vendor.oplus.market.{enname,name}` only) | `opluscamera.mk` superset (localhdr_version=2, hdr_vision_app, uhdr, edrlistener, dolby_vision, override_preview_hdr_support=1, hdr.uniform=1) | **KEEP** — these ARM the OEM HDR feature path R5/R6 ride (E1/HDR plumbing, intentional) |
| **`camxoverridesettings.txt`** | **absent** (no knob file, no SHDR string in tree) | **absent**; only `enable_verbose.sh` logging-mask overlay | **same (both missing) ⇒ X1 red herring** — do NOT author; the lever is session-typing, not this file |
| **HDRMode/numHDRExposure session typing** | in odm CamX config blobs (`CameraHWConfiguration.config`, `config/camera_unit_config`) | not yet carried | **ADOPT** — this is the R5/R6 optimal-form carrier |
| **APS/CamX tag-producer sepolicy** | `same_process_hal_file` label family (`sepolicy/vendor/file_contexts` # Camera) | (verify parity) | **ADOPT** the namespace-form for the R6 vendor-tag producer |
| **overlay structure** | RRO (FrameworksRes/SystemUI/Wifi; no camera RRO) | `CameraThemedIcon` only | **differs/cosmetic** — neither is an R5/R6 lever |

## (f) Symptom leaves

- **#2 (`hdr_detected rc=−2`)** — F3 is the **config/session-typing owner**, PROXIMATE-SITE = **C4** (publish site).
  Root = absent HDR session-typing that puts the AEC in the in-scene publish branch (R5). **NOT** the SHDR knob (X1).
- **#6 (strlen-null TurboHDR)** — F3 is the **config/session-typing + sepolicy-namespace owner**, PROXIMATE-SITE = **C4**
  (TurboHDR `~0x4d78` vendor-tag unpublished). Root = same HDR session-typing class as R5; currently MASKED by libapsfixup
  Family-III. Fix R6 → retire the guard.

**Ledger (SUPPORTED — config A/B = dodge-oracle vs our-dirty, host; R5 publish OBSERVED on stock, R6 DARK):**
`condition: config-tree static A/B (host) + stock V16.1.0 daytime HDR N=3 | N=3 (R5) / N=0 app-side (R6 DARK) | stock_signal: hdr_detected PUBLISHED (HDRDetected:1, 80be000b resolves); TurboHDR ~0x4d78 RE-inferred only | oracle(dodge)_signal: NO camxoverridesettings.txt, NO selectSHDRAutoExposureUsecase string, HDRMode carriers in odm CamX config, APS/CamX libs = same_process_hal_file | falsifier: "dodge proves a shippable SHDR config file" → REFUTED (dodge ships none; X1 reads 0 in-scene) | mechanism: R5 publish gate observed firing on stock via session typing (not the SHDR knob); R6 carrier not yet observed app-side`

---

## D2 — config-derivative walk: the artifacts the port must ship + diff checkpoints (Phase-D)

> **Phase-D add.** Walk each R5/R6 config-derivative to its concrete artifact (file + location), adopt-vs-author,
> and the **diff checkpoint** (the OOS value the LOS B-side test compares). Verified on the **built infiniti
> image** + the port `vendor_oplus_camera` tree vs the dodge oracle. **NOT the X1 SHDR knob** (red herring,
> retired above). Key Phase-D finding: the R5/R6 session-typing carrier is **device-native** to the OnePlus 15
> (infiniti) dump — it is **NOT** an adopt-from-dodge artifact; the port already ships its own.

### Artifact 1 — R5/R6 HDR session-typing carrier: the odm CamX `CameraHWConfiguration.config`

- **Artifact + location.** `odm/etc/camera/CameraHWConfiguration.config` (+ `odm/etc/camera/config/camera_unit_config`).
  Port source: `vendor/oneplus/infiniti/proprietary/odm/etc/camera/CameraHWConfiguration.config` →
  installed `out/target/product/infiniti/odm/etc/camera/`. This is the carrier that types the HDR session
  (the `[OverrideOemSHDRTypeMatching]` `op_mode 0x8001` SHDR-type rows + the captureMode DCG bitmask map that
  drives `numHDRExposure 1→2`).
- **Adopt-vs-author = ADOPT-DEVICE-NATIVE (neither adopt-dodge nor author).** **Correction to the E3/INDEX
  "adopt the dodge odm CamX carrier" framing:** the OnePlus 15 (infiniti) ships its **own** device-specific
  config from the stock dump — **611 `Mode[]` rows vs dodge's 572**, with `infinitimain`/`infinititele`/
  `infinitiultrawide` physical-cam tokens and infiniti-specific captureMode masks. You do **NOT** port dodge's
  `dodgemain`/`dodgetele2` config onto infiniti — the right carrier is the **infiniti stock config already in the
  port tree**. Dodge proves the **form** (an `[OverrideOemSHDRTypeMatching]` block with `0x8001 0x0200/0x0800`
  1dol/2dol SHDR rows + DCG-bitmask captureMode typing exists on a working device); the **content** is
  device-native. So: **adopt the infiniti stock `CameraHWConfiguration.config` verbatim from the dump; do not
  cross-port dodge's.**
- **Diff checkpoint (the OOS value the LOS B-side diffs).** The `[OverrideOemSHDRTypeMatching]` rows that type a
  photo HDR session: `Mode[8/9] = 0x8001; 0x0200/0x0800; …; infinitimain` (w 1dol/2dol shdr), `Mode[10/11]`
  (tele), `Mode[26/27]` (uw), plus the captureMode DCG-bitmask legend (`0x0040 dcg 2exp`, `0x0048 dcg 2exp izoom`,
  `0x2040 dolby dcg 2exp`). **LOS B-side test:** in a daytime HDR scene, the AEC enters the in-scene branch
  (`HDRDetectProcess` gate `*(ctx+0x48)==1`) and publishes `hdr_detected 0x80be000b` (`OplusPublishCameraMetadata
  HDRDetected:1`) — i.e. the config types the session so the publish fires (R5). On the stock-port this read
  `rc=−2` (deferred); the checkpoint is "the infiniti SHDR-type rows + DCG captureMode map are byte-present in the
  installed odm config" (host) → "`hdr_detected` published in-scene" (device, R5). **Status: the carrier is
  PRESENT in the port image** (verified: `[OverrideOemSHDRTypeMatching]` block + 611 Mode rows installed) — the
  config artifact is satisfied; the residual is the runtime in-scene publish A/B (G3).

### Artifact 2 — R6 TurboHDR vendor-tag namespace: the `same_process_hal_file` sepolicy label family

- **Artifact + location.** `vendor_oplus_camera/sepolicy/vendor/file_contexts` — the `# Camera` block labeling the
  APS/CamX tag-**producer** libs `u:object_r:same_process_hal_file:s0` (the sphal/same_process_hal namespace the
  `~0x4d78` TurboHDR vendor-tag must publish/resolve through, the same namespace R5's `80be000b` resolves through
  at `camxvendortags.cpp:419`).
- **Adopt-vs-author = ADOPT (dodge namespace-form, already at parity).** The port **already** labels the full
  tag-producer family: `libAlgoProcess.so`, `libcamera_metadata.so`, `libcamerapostproc.so`, and the `libaps*`
  family (`libapspng/yuv/jpeg/exif/ultrahdr/darksight/.interface.log`) — **byte-parity with the dodge oracle**
  (`dodge-camera-port/repos/vendor_oplus_camera/sepolicy/vendor/file_contexts`, same lines). No new label to
  author; the namespace-form is adopted and present.
- **Diff checkpoint (the OOS value the LOS B-side diffs).** Host: `grep same_process_hal_file file_contexts`
  must carry `libAlgoProcess.so` + `libcamera_metadata.so` + `libcamerapostproc.so` + the `libaps*` family (it
  does — parity vs dodge). Device: the tag-producer maps under the loading domain with **no `avc denied`** and
  the `~0x4d78` tag **resolves in-scene** (R6) — currently **DARK** (`libAlgoProcess` did not load app-side in
  the observe run). Once R6 publishes in-scene, **retire libapsfixup Family-III** (`strlen` null-guard). **Status:
  the sepolicy artifact is PRESENT + at dodge parity**; the open item is the runtime publish (R6 DARK, not a
  missing label).

### Artifact 3 — the HDR/EDR props superset (arms the OEM HDR feature path)

- **Artifact + location.** `vendor_oplus_camera/opluscamera.mk` `PRODUCT_*_PROPERTIES`. The superset that arms
  the OEM HDR/EDR path R5/R6 ride.
- **Adopt-vs-author = KEEP (already shipped, intentional divergence).** Verified present in the port mk:
  `persist.sys.feature.localhdr_version=2`, `hdr_vision_app=1`, `uhdr.support=true`, `support.edrlistener=true`,
  `dolby_vision=1`, `dolby_vision_app=1`, `persist.camera.override_preview_hdr_support=1`,
  `ro.vendor.oplus.hdr.uniform=1` (+ `vendor.oplus.hdr.uniform.debug=1`). Dodge's device `.prop` is lean (`# Camera`
  = market-name only); the port superset is the **right** divergence — it arms the OEM HDR feature path. **KEEP.**
- **Diff checkpoint.** Host: `grep -E 'hdr|edr|uhdr|dolby|localhdr' opluscamera.mk` carries the 8-prop superset
  (it does). Device: the OEM HDR feature path is armed (preview HDR support advertised; EDR listener active) — the
  precondition for R5's in-scene publish. **Status: PRESENT; KEEP.**

### Artifact 4 — permissions/privapp supersets (E1/HDR plumbing, KEEP — off the R5/R6 lever but ship-required)

- **Artifact + location.** `vendor_oplus_camera/configs/permissions/` (7 XML vs dodge's 3) +
  `privapp-permissions-oplus.xml` (`dependency="oplus.camera.stubs"`, md5 `4a4cec19…` vs dodge `3df7a941…`).
- **Adopt-vs-author = KEEP.** The +4 perms (gallery/features/extensions/EDR) are intentional E1/HDR plumbing; the
  privapp `dependency="oplus.camera.stubs"` is correct F1 `<uses-library>` plumbing (keep in sync with the F1 stub
  lib name — BUILD-ORDER edge "F1 surface name ⟶ F3 privapp grant"). **Do NOT revert to dodge's lean set.**
- **Diff checkpoint.** Host: privapp XML carries `<library name="oplus.camera.stubs">`-dependency for OplusCamera +
  the 7-XML permissions set; device: OplusCamera resolves the stub lib (no `<uses-library>` link failure). **KEEP.**

### X1 anti-checkpoint — the SHDR knob (DO NOT ship)

- **Artifact = `camxoverridesettings.txt` with `selectSHDRAutoExposureUsecase=1`.** **Diff checkpoint = the knob
  reads 0 in a real HDR scene (N=3); dodge ships no such file/string.** The port's only `camxoverridesettings.txt`
  is `tools/enable_verbose.sh`'s **logging-mask-only** overlay (no functional key) — keep it logging-only.
  **Do NOT author the knob, do NOT redirect R5/R6 to it.** (Retired above; restated here as the negative checkpoint.)

### D2 verdict deltas (fold into INDEX)
- **R5/R6 carrier = device-native infiniti odm config, ADOPT-FROM-DUMP (not adopt-from-dodge).** Correction to the
  "adopt the dodge odm CamX carrier" wording — the right artifact is the **infiniti stock config** (611 Mode rows,
  infiniti physical-cam tokens); dodge proves only the **form**. The carrier is **already present** in the port
  image; the residual is the runtime in-scene publish A/B (G3 / R5 `rc=−2`, R6 DARK), not a missing artifact.
- **R6 sepolicy namespace-form = ADOPT, already at dodge parity** (`same_process_hal_file` on the APS/CamX
  tag-producer family) — no label to author; the open item is the runtime publish, then retire Family-III.
- **Props + permissions supersets = KEEP** (intentional E1/HDR plumbing; verified present).

---

## Inferences & Open (UNVERIFIED — heavy-check)

> Per the interop-tree trunk axiom, a measured config-absence or carrier-absence SITE is never a verified ROOT,
> and a host-only A/B is never a device runtime confirmation. The items below are mechanism attributions,
> optimal-form verdicts, root assignments, and forward fix specifications — NOT verified until an OOS↔LOS
> device A/B proves each propagation-contract break.

### R5 — `hdr_detected` root and session-typing form (INFERRED)

- **ATTRIBUTION (inferred):** "Root of #2 (hdr_detected rc=−2) = absent HDR session-typing that fails to arm
  the AEC in-scene branch." The R5 publish is OBSERVED on stock (`HDRDetected:1`, gate `+0x48=1`, producer
  2294×, N=3). That its absence on LOS (rc=−2) is caused specifically by the session-typing carrier being
  mis-armed (vs. a CamX node configuration difference, a missing vendor-tag registration, or another AEC-path
  divergence) is inferred from the HDRMode=1/DCG model. The LOS `rc=−2` arm is DEFERRED — no device A/B
  comparing the AEC gate state OOS vs. LOS has been run.
- **OPTIMAL FORM (inferred):** "Adopt the odm CamX session-typing carrier (HDRMode session-state, the
  `[OverrideOemSHDRTypeMatching]` block) + keep HDR/EDR props." The carrier is device-native infiniti and
  PRESENT in the port image (verified host). That this carrier alone arms the AEC in-scene branch and produces
  the R5 publish is the unconfirmed hypothesis; the G3 runtime A/B has not been run.
- **NEGATIVE CLAIM (inferred):** "X1 (`selectSHDRAutoExposureUsecase=1`) is the root — REFUTED (reads 0 N=3;
  dodge ships none)." The refutation of X1 as a lever IS supported (reads 0 in-scene, dodge ships no knob).
  But the conclusion "therefore session-typing is the lever" is an inference by exclusion, not a positive proof
  that the session-typing carrier is sufficient.

### R6 — TurboHDR vendor-tag publish and Family-III retirement (INFERRED / DARK)

- **ATTRIBUTION (inferred, carrier DARK):** "Root of #6 (`strlen(null)`) = TurboHDR vendor-tag (~0x4d78)
  unpublished → `parseTurboHdrInfo` cbz-skips → `field_0x4d88` null." The store mechanism is RE-mapped; the
  carrier is RE-inferred only — `observe_getmetadata` never loaded `libAlgoProcess.so` app-side (intCalls=0).
  No runtime evidence of the tag publish or its absence on LOS. DARK.
- **OPTIMAL FORM (inferred):** "Same session-typing carrier as R5 + `same_process_hal_file` namespace form
  arms the R6 publish." Both the form and the lever are inferred from the R5 model; the R6 publish path has
  not been runtime-confirmed on stock or LOS.
- **FAMILY-III RETIREMENT (inferred, deferred):** "Fix R6 → retire libapsfixup Family-III (`strlen` guard →
  dead code)." This retirement depends on the R6 publish being confirmed and landing; currently DARK and
  deferred.

### D2 config-derivative verdicts (INFERRED for unconfirmed items)

- **VERIFIED (host):** `[OverrideOemSHDRTypeMatching]` block + 611 Mode rows are PRESENT in the installed
  odm config (byte-level host check). `same_process_hal_file` label family is at dodge parity (grep-verified).
  HDR/EDR props superset is PRESENT in `opluscamera.mk` (grep-verified). These artifact-presence facts are
  measured.
- **INFERRED (not device-confirmed):** That the installed carrier arms the AEC in-scene branch (G3 publish A/B),
  that the `same_process_hal_file` label on the tag-producer family is sufficient for R6 resolution, and that
  retiring Family-III after R6 lands is safe — all are forward-spec claims pending device runtime confirmation.
