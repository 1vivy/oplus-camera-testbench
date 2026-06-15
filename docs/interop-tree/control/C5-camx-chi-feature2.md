<!-- Parent: ../INDEX.md -->
---
node: C5
title: "CamX / CHI / feature2 — StaticSettings, graph selection, EISv2"
plane: control
partition: /vendor
blob_identical_oos_los: true
characterization: CHARACTERIZED  # (a) contract observed END-TO-END on the HDR scene: enters-side StaticSettings via dump_camxsettings (shdrAutoExp +0x6a28=0), CHI graph-selection + leaves-side un-clobbered (ConfigureHDRInformation, F2GS, OplusSATFusion fusion ran), hdr_detected publish present+stable ×3
conviction: CONFOUNDED       # unchanged — root CLAIM still LOS-deferred; but the de-confound is RESOLVED: the SHDR-auto-exp knob is a red herring (reads 0 in-scene), stock HDR = HDRMode/DCG path
verdict: "stock HDR = HDRFeature/HDRMode=1 + DCG numHDRExposure 1→2 + offline fusion (OplusSATFusion); selectSHDRAutoExposureUsecase(+0x6a28)=0 even in HDR scene — red herring for #2; hdr_detected publish PRESENT+stable"
confidence: medium
symptoms: [2, 8, 6]
probes: [G3, G2]
gaps: [G2, G3]
dodge_ref: ""
dirty_ref: ""
divergence: ""
upstream: [C4]
downstream: [C6, D2]
refuted_refs: []
doc_refs: [doc-47, doc-48, doc-45]
updated: 2026-06-14
---

# C5 — CamX / CHI / feature2

CamX (`libcamxsettingsmanager`, `camxhal3`) + CHI override (`com.qti.chi.override`) + the chifeature2
graph builder. This is the `/vendor` node where the **StaticSettings struct** gates the SHDR/HDR usecase
branch and where **graph selection** picks the offline-fusion reprocess nodes. Blob is byte-identical
OOS↔LOS (`libaecCustom` / `chi.override` / `libcamxsettingsmanager` all md5-match) — per the axiom this is
a crash/stall **site**; the root is the configure-time **session state** that feeds these settings, not the
binary. Capture is **NOT blocked here** (doc-47: fusion runs at shutter with `hdr_detected` off).

## (a) Propagation contract — named carriers

> **OBSERVED end-to-end** on the **photo-hdr** condition (`campaign/photo-hdr`, `meta.txt`:
> `mode=photo ae_lock=1 SELinux=Enforcing build V16.1.0/16.0.7 OP611FL1`, daytime window+wall HDR) and
> confirmed on **beauty** (`mode=beauty`), N=3 each, **verdict.json = ALL STABLE**. Carriers below carry the
> measured value + the exact log/probe tag they were read from. The `selectSHDRAutoExposureUsecase` knob is
> CONFIRMED to read **0 even inside a real HDR scene** — resolving the prior de-confound (it is a red herring;
> stock HDR rides the HDRFeature/HDRMode + DCG fusion path, NOT the auto-exposure usecase).

**Enters (settings struct read at configure, by NAME — build-independent; OBSERVED values):**
- `selectSHDRAutoExposureUsecase` (hash `0xDC4EAFC3`, struct `+0x6a28`) — **OBSERVED = 0**. Live struct read by
  `dump_camxsettings.js` during the HDR scene: `[HDR offsets] … +0x6a28 LEVER(shdrAutoExp)=0` (photo-hdr frida).
  And `chxextensionmodule.cpp:12455 ConfigureHDRInformation() GetSHDRAutoExposureUsecase = 0` on **every** run of
  photo-hdr + beauty (`GetSHDRAutoExposureUsecase = 1` appears **0×** across all 6 logcats) — it stays 0 even
  when `isAutoHDREnabled = 1` / `Set HDR mode = 1`. ⇒ NOT the OOS↔LOS differentiator (red herring for #2).
- `+0x6a18` (2nd forced lever, HDR-mode-info gate, strongest candidate `setAutoHDRMode`) — **OBSERVED = 0**
  (`+0x6a18 LEVER(hdrModeInfo)=0`, dump_camxsettings, HDR scene).
- `setHDRMode` (`+0x6a40`) **=0**, `enable3expSHDRSnapshot` (`+0x1e0`) **=0**, `selectedDCGMode` (`+0x6a2c`) **=0**,
  `+0x6544` **=1** — all read live from the struct (`dump_camxsettings` HDR-scene line). The static SHDR-snapshot
  levers are all 0 in-scene; HDR is driven dynamically below, not by these static struct defaults.
- **HDRFeature / HDRMode (the path that IS taken):** CHI `ConfigureHDRInformation()` publishes
  `isAutoHDREnabled = 1`, `Set HDR mode = 1`, `HDRMode set to:1 DCG mode:0` for the primary camera once the scene
  is HDR (photo-hdr run3 primaryCameraId:0; beauty all runs) — with `isSHDRAutoExpNotSupportUsecase = 1`
  (the "SHDR-auto-exp NOT-supported usecase" branch is the one taken). DCG engages:
  `chifeature2graphselectoroem.cpp:1825 GetCustomVendorTagFromCaptureIntent() … cameraHDRMode 1, appEnabledQHDR 0,
  enableRawHDR 0, numHDRExposure 2` and `chxusecaseutils.cpp:9666 ConfigureHDRExposureCount() … numHDRExposure 2`
  (beauty run1) — i.e. **numHDRExposure 1→2** (DCG 2-frame staggered SHDR) on the snapshot. Oplus tuning in steady
  preview: `opluscamxchinodehwcfgipedummy.cpp:739 OplusOverrideIPETuningMode() … captureHDR:0, previewHDR:1`
  (photo-hdr run1, on `OplusSATFusionOfflineReprocess0_IPE0`) — capture-HDR applied at shutter.
- `MFHDRHWEnable`, `enableHWMFHDRSnapshot`, `enableAutoHDRCapability` — the multi-frame HDR HW path enables (per
  OOS-BASELINE §4 these = 1 at idle; not re-dumped here but consistent with the MFHDR/fusion path being live).
- Log masks `logInfoMask`/`logVerboseMask`/`traceGroupsEnable`/`enableAsciiLogging` — clobbered at configure
  (`OverrideLogSettingsAtConfigureFile`@`0x151c4`) and **defeated for this capture** via the frida levers
  (`enable_camx_logging.js`: info=0x1f0fb7b8 verb=0xe010200 ascii=1, SENSOR/NCS excluded; `unclobber_camx_logs.js`
  retaa'd #1/#2) — this is the visibility lever that let the contract be read, not a capability gate.

**Leaves (graph selection → downstream; OBSERVED):**
- Selected chifeature2 fusion nodes **RAN at capture**: `OplusSATFusionOfflineReprocess` (e.g.
  `OplusSATFusionOfflineReprocess0_IPE0`), `MCXSuperFG`, `MultiCameraReprocessRealtime` — all present with high
  counts on the HDR/snapshot runs (photo-hdr run3: OplusSATFusion 20712 / MCXSuperFG 95 / MultiCamReproc 62;
  beauty run1: 28699 / 188 / 101). ⇒ the offline-fusion graph is selected and executed end-to-end on stock.
- `com.qti.stats_control.hdr_detected` (+ `couple_hdr_detected`, `qbc_hdr_detected`) — **publish PRESENT and
  stable ×3** in both photo-hdr and beauty (`verdict.json` row `#2 hdr_detected publish = present` ×3); the tag
  resolves in `camxvendortags.cpp:419 QueryVendorTagLocation() … hdr_detected … location 80be000b`, and the AEC
  producer is observed live: `probe_aec_hdrdetect.log` shows `[HDRDetect] enable(+0x48)=1 bgsat(+0xd0)=1` +
  `[HDRTrigger] ran (hdr_detected computed this frame)` every frame. This resolves the prior "hdr_detected NOT
  visible / inconclusive" gap (SESSION FACT 2/3): it is now OBSERVED present. (→ C6 / D2.)
- EISv2 stabilization node ports for the 8K (`0x80a9`) pipeline — the 2-in/0-out "pure bypass" → NULL pipeline
  descriptor that yields `configure_streams −38` (doc-48 §5, symptom 8). NOT exercised here: photo mode, and
  `verdict.json` `#8 8K configure_streams −38 = False` ×3 (8K path not triggered in these photo/beauty captures).

> **G-MECH (runtime ↔ RE offset pairing):** the `probe_aec_hdrdetect.log` runtime reads `enable(+0x48)=1
> bgsat(+0xd0)=1` map directly onto the static RE in `re-notes/aec-hdrdetect-publish-RE.md`:
> `HDRDetectProcess @ device 0x0b4d8c` master gate `*(*aecCtx+0x48)==0 ⇒ no-op` (observed = 1, so it RUNS), and
> `HDRTriggerFlagDetection @ device 0x0ed7e4` writes the decision at `aecOut+0xfc` selected on
> `tuning+0xd0` = `enableHDRDetectionByBGSat` (observed = 1 ⇒ BGSat over-exposure-ratio path). The `[HDRTrigger]
> ran` every frame confirms `aecOut+0xfc` is written — the compute/export the RE note proves intact, now seen
> live producing the `com.qti.stats_control.hdr_detected` publish that `verdict.json` buckets present+stable.

## (b) Environment dependencies

- `/vendor/etc/camera/camxoverridesettings.txt` — the override file that can force the StaticSettings keys at
  configure. **md5-identical blobs; the file is the environment knob** (attribution-matrix #2: file absent on LOS).
- `/vendor` provider process (`vendor.qti.camera.provider-service_64`) — CamX runs in-process; inherits CamX+CHI+OEM levers.
- Session metadata fed from C4 (HAL provider) / C3 (`beforeConfigureStreamsLocked`, `getExtensionOperatingMode`) — the
  configure-time op_mode + StreamSet shaping that, on stock, may be what flips the SHDR usecase / binds the EIS output stream.
- `setprop persist.vendor.camera.oplus.enableLogging true` — defeats CHI clobber #3 (visibility only).

## (c) Fact-to-resolve

**Q:** Does stock OOS flip `selectSHDRAutoExposureUsecase` (`0xDC4EAFC3`, `+0x6a28`) from **0→1 only inside an
HDR-triggering session**, or is it always 0 on stock (making `camxoverridesettings.txt=1` a port-only addition)?

- **If it flips 0→1 in an HDR scene** → the OOS value is *session-state-driven*, not a static default; the LOS
  divergence is the missing session-state path (C3/C4 configure hooks), and shipping `selectSHDRAutoExposureUsecase=1`
  in `camxoverridesettings.txt` *statically forces* what stock does dynamically. Action: ship the override key +
  re-verify `hdr_detected` publish + fusion (lever already force-proven on-device per matrix #2).
- **If it stays 0 even in an HDR scene on stock** → `+0x6a28` is NOT the OOS↔LOS differentiator; the prior matrix
  attribution is refuted and the no-JPEG root moves elsewhere (C6 publish, or C3 session typing). Action: re-attribute #2.

This is the **#2 de-confound** (INDEX traversal step 2) and the TOP open item (OOS-BASELINE §4 follow-up 3).

## (d) Runtime probe(s)

- **`tools/frida/dump_camxsettings.js`** (gap **G3**) — lever **WORKS**: calls `WriteCamxSettingsToFile` by
  offset `+0x13168` (re-derived, unchanged on V16.1.0), self-checks the 16 prologue bytes
  `3f2303d5fd7bbca9fc5f01a9f65702a9`, runs under **Enforcing** (KernelSU frida into the provider). Dumps 1061
  settings BY NAME. **Must be re-run during an actual HDR scene/snapshot**, not idle — idle is G-COND-insufficient for #2/#6.
- **`tools/patch_chi_logclobber.py`** (gap **G2**) — host patch to declobber the CHI/CamX graph trace so
  `MultiCameraReprocessRealtime`/`MCXSuperFG`/`OplusSATFusionOfflineReprocess` selection is visible. CamX-tag
  patch **#4 is mandatory** (no property defeat) to read the `configure_streams −38` reason (symptom 8).
  **All 4 clobber offsets RE-VERIFIED valid on V16.1.0 (= 16.0.7.201), 2026-06-13** — `--verify` passes (paciasp +
  `sub sp` intact) and all 3 log libs are byte-identical (md5) to the `.201` dump: #4 `OverrideLogSettingsAtConfigureFile`
  `libcamxsettingsmanager.so@0x151c4`, #2 `ExtensionModule::ModifyLogSettings` `com.qti.chi.override.so@0x4ab6f8`,
  #1 `OverrideChiLogSettingsAtConfigureFile` + #3 `OnPostModifySettings` `libextensionlayer.so@0x4000c/0x41a18`
  (#3 preferably neutralized by `setprop persist.vendor.camera.oplus.enableLogging true`). Instrument is trustworthy.
- Companion (8K): `tools/frida/hook_configure_streams.js` for the EISv2 8K-vs-4K stream diff (doc-48 probe).
- The path to lift C5 to `characterization: CHARACTERIZED` is to UN-CLOBBER the CamX/CHI logs (`tools/patch_chi_logclobber.py`) so the stack narrates its own SHDR graph-selection decisions, plus run observe-only `dump_camxsettings` during an HDR scene — i.e. we RECORD how the SHDR knob is plumbed, we do NOT try to CONVICT it (conviction stays CONFOUNDED).

## (e) Dodge-vs-dirty diff

N/A — this is a control-plane (`C*`) node, not a facilitation (`E*`) node. The facilitation root that ships the
override file lives in **E3** (`camxoverridesettings` / props / overlays); cross-link E3 for the dodge-vs-our
diff of whether the override key is present. The byte-identical blob means any divergence here resolves to E3
(config) or to the C3/C4 session-state hooks upstream — never a CamX binary edit.

## (f) Symptom leaves

- **#2 no-JPEG / `hdr_detected` rc=−2 / no fusion graph** — PROXIMATE-SITE here (SHDR gate `+0x6a28`=0 → SHDR
  branch not taken). ROOT is **E3 / session-state** (override file absent, or stock sets it only in-session).
  Edge: C5 → E3 (config) and C5 ← C3/C4 (configure-time session typing). **CONFOUNDED**: matrix assumed OOS idle
  `=1`, but OOS-BASELINE §4 measured stock idle `=0` — the A/B compared a non-identical/assumed condition
  (G-COND fail; HDR scene never used). doc-47 corrects the overreach: capture is NOT gated by this (fusion runs).
- **#6 strlen-null TurboHDR** — sibling of #2; OEM TurboHDR tag unpublished, likely the same configure-time
  HDR-session-state class. PROXIMATE at C4/C5; ROOT at E3 (session state). Test whether the ROOT-A override also publishes it.
- **#8 8K `configure_streams(0x80a9)` −38** — PROXIMATE-SITE here as the EISv2 2-in/0-out NULL-pipeline-descriptor
  graph-build failure. ROOT candidate is **C3** `beforeConfigureStreamsLocked` StreamSet mutation never invoked on
  LOS (doc-48 §5) OR `/vendor` Gralloc5 stream-usage (D1). Edge: C5 ← C3 (Depth-2 hook) / C5 ↔ D1 (Gralloc5 usage).

> **SESSION FACT (OOS-BASELINE-V16.1.0 §4):** on stock V16.1.0 at **idle/PHOTO**,
> `selectSHDRAutoExposureUsecase (0xDC4EAFC3) = 0` — NOT 1 as the matrix assumed. Siblings `setHDRMode`,
> `setAutoHDRMode`, `enable3expSHDRSnapshot`, `selectedDCGMode`, `isSHDRFusionOffline` also = 0; while
> `MFHDRHWEnable` / `enableHWMFHDRSnapshot` / `enableAutoHDRCapability` = 1. ⇒ the ROOT-A lever is **not a
> static stock default** — likely set dynamically only in an HDR session. The open fact-to-resolve (c) settles it.

> **SESSION FACT 2 (daytime HDR-scene capture, 2026-06-13 — `reference/captures/unclobber-day-hdr-1/`):** with
> CHI INFO logging un-clobbered (`enableLogging`+`logInfoMask`), a live capture on a genuine daytime HDR scene
> (window+wall) logged `chxextensionmodule.cpp:12455 ConfigureHDRInformation() **GetSHDRAutoExposureUsecase = 0**`
> while the fusion graph (`MCXSuperFG`/`OplusSATFusion`/`MultiCameraReprocess`) ran FULLY at capture. ⇒ stock does
> **NOT** drive HDR via the SHDR-auto-exposure usecase even in an HDR scene — it uses the MFHDR/fusion path. This
> answers most of (c): the `selectSHDRAutoExposureUsecase` knob stays 0 in-scene too (low confidence as the #2
> root, consistent with doc-47). `hdr_detected` was NOT visible — but that is **CamX-core mask-gated**
> (props raised INFO only; VERBOSE/`#4` still clobbered), so it is **inconclusive**, not negative. Re-home the #2
> fact toward the AEC publish + fusion path; reach it via the `#4` retaa (`tools/frida/unclobber_camx_logs.js`)
> on the same scene. Characterization of the CHI-level SHDR plumbing = **observed**; CamX-core layer = pending.

> **SESSION FACT 3 (richer HDR-scene capture, frida #1/#2/#4 retaa'd pre-configure, 2026-06-13):** the decisive
> CHI line in full — `ConfigureHDRInformation() **GetSHDRAutoExposureUsecase = 0, isAutoHDREnabled = 1**,
> isSHDRAutoExpNotSupportUsecase = 0/1` and `**HDRMode set to: 1** DCG mode:0 long bit:0 short bit:0`. ⇒ stock has
> HDR **fully ON** (AutoHDR enabled, HDRMode=1) yet the SHDR-auto-exposure usecase is **0** — HDR is driven by
> **HDRMode/AutoHDR + the offline fusion graph** (142 `OplusSATFusionOfflineReprocess` StripingLogs on cam2), NOT
> by `selectSHDRAutoExposureUsecase`. This is the cleanest evidence yet that the knob is a red herring for #2.
> **CamX-core layer gate identified:** even with masks un-clobbered (#4 retaa'd + `persist.camera.logInfoMask`),
> CamX-core INFO/VERBOSE (the `hdr_detected` publish) does NOT reach logcat — gated by
> `m_pStaticSettings->enableAsciiLogging`, which is **override-file-only** (no `persist.*` prop; the
> `/vendor/etc/camera` file is absent on V16.1.0 — see `reference/captures/unclobber-day-hdr-1/FINDINGS.md`).
> CamX-core `[ALWAYS_ON]` lines DO flow (`camxhal3 configure_streams operation_mode: 0x8001`). To read
> `hdr_detected`: set `enableAsciiLogging=TRUE` via a struct write or a readable override file, or parse the
> binary `/data/vendor/camera/camera_config_dump.bin` sink.

> **SESSION FACT 4 (CamX-core UNLOCKED — crash-free, 2026-06-13 — `reference/captures/camxcore-clean/`):** the
> CamX log gate is the **global `CamX::g_logInfo` (libcamxcommonutils.so +0x68010)**, NOT StaticSettings (a decoy
> the override file / configure-apply write to). On a stock user build `SettingsManagerImpl::OverrideUpdateLogSettings`
> ZEROES it (release/confidential clobber). Crash-free CamX-core logging is now a reusable lever —
> **`tools/frida/enable_camx_logging.js`**: writes `g_logInfo` (INFO=0x1f0fb7b8, VERB=0x0e010200) with the
> **SENSOR(bit1)+NCS(bit23) groups EXCLUDED** (their SSC/QMI sensor-hub `[VERB]` log SIGSEGVs in vfprintf — never
> enable them) + a `Log::UpdateLogInfo` re-assert hook. Layout + full CamxLogGroup enum:
> `docs/re-notes/camx-loginfo-layout-and-groups.md`; gate RE: `docs/re-notes/camx-logmask-gate-FINDINGS.md`.
>
> **CamX-core SHDR plumbing (clean capture, full depth):** `cameraHDRMode=1` (HDR ON), `appEnabledQHDR=0`,
> `enableRawHDR=0`; the session FORCES `hdrmode:1` (`chifeature2generic.cpp:3888 Override HDR mode from session
> setting`), no per-stream override; **`numHDRExposure` transitions 1→2** (DCG 2-frame staggered SHDR engages on
> the HDR scene); sensor cap `HDR mode 1, DCG mode 4, Long/ShortBpp 10`; graph prune `previewHDRProfile:1
> videoHDRProfile:0`; Oplus tuning **previewHDR=1, captureHDR=0** in steady preview on
> `OplusSATFusionOfflineReprocess0_IPE0` (capture-HDR at shutter). `GetSHDRAutoExposureUsecase=0` holds at CamX-core
> depth. ⇒ **stock HDR = HDRMode/DCG-2-frame + offline fusion, NOT `selectSHDRAutoExposureUsecase`** — the knob is
> a red herring for #2, now CamX-core-confirmed (final). `hdr_detected`/`couple_hdr_detected` writes are
> STATS_AEC/SYNC VERBOSE in the post-shutter window (reachable: dwell post-shutter / add SYNC bit13, SENSOR/NCS at 0).
