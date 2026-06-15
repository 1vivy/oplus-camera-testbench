<!-- STATUS: MIXED — inference-surgery applied 2026-06-14 (doc-50 method). Verified body = "### Established"
     blocks per symptom (on-device measurements, build-id checks, static analyses, on-tree cross-refs).
     All root/subsystem attributions, causal claims, forward plans, and "questionable/live-open" items
     live in "### Refuted-or-overreach", "### Questionable", "### Gaps", and "### Revisit targets" —
     those sub-sections are INFERENCES/PLAN, not verified facts.
     Guard (interop-tree SCHEMA trunk axiom): a measured stall/crash SITE is never a verified ROOT;
     "evidence-anchored" applies to OBSERVATIONS only — never to root/subsystem/layer attributions. -->
<!-- Parent: ./INDEX.md -->

---
title: Dirty-Notes Symptom Examination — Consolidated Consensus Report
date: 2026-06-13
scope: >
  Reconcile the legacy "dirty notes" investigation corpus (the AUDIT/PROBE/A-cluster
  dossiers, doc-29/14/16/28 lineage and the v6/v16/v17/v19 capture notes) against the
  curated clean interop-tree (INDEX axiom, REFUTED-LOG R-01..R-09, DODGE-VS-DIRTY,
  facilitation E1–E4, docs 35/40/41/42/43/44/45/46/47/48/49, OOS-BASELINE-V16.1.0).
  Two adversarial review lenses (ESTABLISH = what survives; SKEPTIC = what overreaches)
  were run per symptom and adjudicated into a single consensus per symptom.
sources_examined:
  - dirty-notes JSON corpus (per-symptom AUDIT/PROBE/A-cluster findings, doc-14/16/28/29 lineage)
  - capture logs (v6, matched-201 OCS set, v16, v17, v19/infiniti port; aps_capture.log, ocslog_*, live_capture.log)
  - CAPTURE-FIRES-FINDINGS.md, missing-vendor-tags lists, PROBE-R1/R1b/R1c/R1d, PROBE-S7
authoritative_tree:
  - docs/interop-tree/INDEX.md (trunk axiom + status dashboard + symptom→path map)
  - docs/interop-tree/REFUTED-LOG.md (R-01..R-09 dead-end ledger)
  - docs/interop-tree/DODGE-VS-DIRTY.md (facilitation oracle ledger)
  - docs/interop-tree/symptoms/{S1..S8}.md
  - docs/interop-tree/{control,data,facilitation}/*.md (C1–C6, D1–D4, E1–E4)
  - docs/rearch/{35,40,41,42,43,44,45,46,47,48,49}.md
  - OOS-BASELINE-V16.1.0 (§4, 2026-06-13 — newest evidence on the SHDR lever)
consensus_confidence: high (S1–S5, S7, S8, cross); medium (S6)
---

# Dirty-Notes Symptom Examination — Consolidated Consensus Report

> **How to read this.** Each symptom was examined by two lenses (ESTABLISH / SKEPTIC) and merged into
> one consensus. "Established" = survives both lenses + is tree-consistent. "Refuted-or-overreach" = dead
> as a root, OR a dirty `note_status:proven` that the tree downgrades. "Questionable" = live-open, unproven.
> "Gaps" = the missing capture that would settle it. "Contradictions" = where the dirty corpus and the clean
> tree actually disagree (the highest-value items to resolve). Cross-links point at the authoritative tree
> nodes (`symptoms/Sn`, `control/Cn`, `data/Dn`, `facilitation/En`) and `REFUTED-LOG` rows (R-01..R-09).

---

## VERIFIED — cross-cutting observations (measured / build-confirmed facts only)

- All HAL/AEC/config blobs are byte-identical OOS↔LOS (BuildID anchor `82fe443b`, libaecCustom f8fb639d,
  chi.override 3f25d020, CamxFormatUtil, mapper.qti — trunk axiom applies to every symptom).
- HAL produces preview while app render callbacks = 0 (`onCaptureCompleted/onPreviewFrame/updatePreview = 0`;
  FIX#2 drain + clean reboot still froze; GC-force did not unfreeze) — measured on-device.
- Offline fusion graph ran at shutter with `captureHDR:0 previewHDR:0 featuretype 50` — capture/JPEG
  NOT gated by `hdr_detected` (doc-45 FORCE-TEST, lines 411–425, on-device).
- `*(aecCtx+0x48)==1` every frame (954× normal preview); AEC computes + exports hdr_detected unconditionally
  via `processExt` (`aecOut+0xfc`) — on-device measured (doc-45).
- Forcing `+0x6a28` (`selectSHDRAutoExposureUsecase`) + `+0x6a18` flipped hdr_detected rc=−2→0 AND
  GCVT→120 on-device; yet preview remained byte-identical-frozen (doc-45 force-test — the anchor for the
  two-gate split; [R-08](REFUTED-LOG.md)).
- `nativeGetOplusHardwareBuffer` JNI bridge present in built `libandroid_runtime.so` (host nm-DC +
  AOSP-fallback log ABSENT N=3); AOSP-fallback code path not taken at runtime (E2 base/0001 applied).
- frameworks/av source: 0 `CameraServiceExt`/csextimpl call sites; built cameraserver 0 ext strings;
  `libcsextimpl.so` absent from whole out tree (host grep, 2026-06-13).
- `customVendorTag 120` PRESENT in v19 logs (`ocslog_1781146046` @20:47:25, reqID 238–241) — [R-06](REFUTED-LOG.md).
- `libcamxexternalformatutils` ABSENT from every app-public `public.libraries.txt` on both dodge AND ours
  AND on-device — dodge reliable without it (host static A/B).
- SIGSEGV at `APSMetadata::copyMetadata+60` proven by tombstone regs (fault `x21+0xc / x20=0xaaaa`) +
  static disasm; CLEAN on stock (227 hits, 0 crashes) — [R-07](REFUTED-LOG.md) / D2 trunk axiom: SITE not ROOT.
- `strlen(null)` crash mechanism proven by tombstone_32 (x23=0; backtrace `strlen ← setProcessOtherParams+140`)
  + static disasm `ldr x23,[x0,#0x4d88]` (field load, not 0x5880 — X1 doc-bug corrected 2026-06-13).
- EISv2 node wired 2-in/0-out ("pure bypass") on the 8K 0x80a9 path — confirmed via frida port-dump
  (numInputPorts=2 numOutputPorts=0; `chxpipeline.cpp:602` NULL pipeline; `chifeature2base.cpp:15188`
  descriptor failed).
- OOS stock V16.1.0: `selectSHDRAutoExposureUsecase` reads **0** at idle/PHOTO (not 1) — `dump_camxsettings`
  `+0x6a28 LEVER=0`; stock HDR runs via HDRMode/DCG+fusion, NOT this knob statically (2026-06-13).

> Per the interop-tree trunk axiom, each measured SITE above is never a verified ROOT. Root attributions,
> causal chain claims, facilitation assignments, and forward plans live in the per-symptom "Refuted-or-overreach",
> "Questionable", "Gaps", "Contradictions", and "Revisit targets" sub-sections below — those are
> **INFERENCES / PLAN**, not observation-anchored facts.

## Inferences & Open (UNVERIFIED — heavy-check)
> Per the interop-tree trunk axiom, the items in the per-symptom sub-sections below that go beyond
> direct measurement (root attributions, causal chains, conviction claims, forward-probe plans) are
> NOT verified until an OOS↔LOS A/B proves the contract break. The "### Established" blocks per
> symptom hold the observations; everything else is inference or plan. The SUMMARY TABLE below
> mixes both — read the "Established root / status" column as CURRENT-BEST-INFERENCE (not convicted
> root) for any node whose conviction is not CONVICTED in the INDEX status dashboard.

---

## SUMMARY TABLE

| # | Symptom | consensus_conf | Established root / status (clean tree) | Top gap | Primary revisit |
|---|---------|----------------|----------------------------------------|---------|-----------------|
| 1 | preview freeze (frame-1 stall) | high | OUTPUT-starvation; producer-alive/consumer-starved, single-shot; proximate site D2/[C6](control/C6-aps-oemlayer.md); **conviction OPEN** | **G4** working-state release cadence uncaptured | Capture G4 baseline; hook `onPreviewReceived` (>1×?) |
| 2 | no-JPEG / hdr_detected rc=-2 | high | SHDR gate [C5](control/C5-camx-chi-feature2.md)→[E3](facilitation/E3-toggles-config.md)/[C4](control/C4-hal-provider.md); lever proven, fix **CONFOUNDED** | idle-vs-HDR-scene de-confound never run | `dump_camxsettings.js` on **stock in a real HDR scene** |
| 3 | over-exposure (~5×) | high | [D4](data/D4-render-sf-edr.md) no-tonemap→[E1](facilitation/E1-stubs.md) stub→[E2](facilitation/E2-system-framework.md) missing EDR ABI; **conviction OPEN** | **G6 DARK** — no EDR-invocation ever observed in HDR scene | eng SF build w/ ALOGV in EDR path, HDR scene |
| 4 | copyMetadata UAF | high | crash-site `copyMetadata+60` proven; root = result-metadata lifetime ([C3](control/C3-cameraserver-extimpl.md)/[C4](control/C4-hal-provider.md)); **conviction OPEN/BLOCKED** | free/use ordering never captured; C3-vs-C4 owner unattributed | `ab_capture burst` + `parse_tombstone.py`, guard disabled |
| 5 | P010 / IMapper@4 NULL | high | consumer-side; **S5 conviction REFUTED**, [E4](facilitation/E4-sepolicy-namespace.md) namespace refuted; only [D1](data/D1-gralloc-camxformat.md) lock-math survives (**BLOCKED**, inferred) | decisive r3-gralloc A/B never run (gated behind #1) | r3-gralloc + `grep "Failed to link CamxFormatUtil"` |
| 6 | strlen-null TurboHDR | medium | crash mechanism proven; root = OEM IPE TurboHDR tag ~0x4d78 unpublished ([C4](control/C4-hal-provider.md)); leaning C4 over [E3](facilitation/E3-toggles-config.md) | HDR-scene `observe_getmetadata.js` never run; tree doc-bug `0x5880` | tag-presence A/B on stock HDR scene |
| 7 | getOplusHardwareBuffer fallback | high | **S7 conviction REFUTED** — bridge present+executing, fallback not taken; root re-homed to [C6](control/C6-aps-oemlayer.md)/[D2](data/D2-hal-fill-aps.md) | E2 bridge runtime-REACH unconfirmed (host PRESENT only) | `probe_getoplushwbuffer.js` + nm symbol scan |
| 8 | 8K configure_streams −38 | high | crash-site [C5](control/C5-camx-chi-feature2.md)/feature2 (2-in/0-out EISv2); root **OPEN** (C3/[E2](facilitation/E2-system-framework.md) hook vs [D1](data/D1-gralloc-camxformat.md) Gralloc5) | no 8K OOS↔LOS A/B run; oracle trace EXISTS (515 lines) but does not log the return constant | `hook_configure_streams.js` 8K vs 4K + r4-oem-transact |
| × | cross-cutting (facilitation) | high | identity-relay refuted ([R-09](REFUTED-LOG.md)); G5 ext layer genuinely missing ([E2](facilitation/E2-system-framework.md) CONVICTED); two-gates ([doc-47](../rearch/47-root-cause-correction-two-gates.md)) | static SHDR value to ship unknown (stock reads 0 at idle) | author `camxoverridesettings.txt` after HDR-scene dump |

---

## SYMPTOM 1 — preview freeze (frame-1 stall)

**Clean tree:** [`S1-preview.md`](symptoms/S1-preview.md), path D2 (APS holds frame 1) → [C6](control/C6-aps-oemlayer.md) / [D3](data/D3-imagereader-hwbuffer.md); characterization PARTIAL, **conviction OPEN**.

### Established
- **Producer-alive / consumer-delivering-nothing.** HAL produces preview (CamX `repeatingRequestEnd` frameNumber climbs ~586 over ~19s) while app render callbacks = 0 (`onCaptureCompleted/onPreviewFrame/updatePreview` = 0; in-app filter SDK sees `preview_w/h/dataspace/format=0`). Corroborated by [R-07](REFUTED-LOG.md) and doc-44 UPDATE 8.
- **The freeze is SINGLE-SHOT, not gradual pool exhaustion.** FIX#2 (metaBufferMap drain 0x10→0x3) + poison-db clear + clean reboot STILL FROZE (doc-44 U8). `maxImages=20` ⇒ a one-frame-deep hold would surface at ~frame 20, not frame 1. The "~frame-19 / 20-pool exhaustion" timing was a HAL frame-counter red herring.
- **NOT a HardwareBuffer/GraphicBuffer leak** ([R-07](REFUTED-LOG.md)): GC-force (trim-memory RUNNING_CRITICAL ×5) did not unfreeze; the 698 CloseGuard leaks are real but non-causal.
- **NOT AEC-stats / hdr_detected starvation** ([R-08](REFUTED-LOG.md), doc-47). The decisive [doc-45](../rearch/45-aec-hdr-detect-publication-gate.md) FORCE-TEST (lines 411–425) drove `hdr_detected` rc=-2→rc=0 PUBLISHED + GCVT→120 fusion ~5500×, yet preview stayed byte-identical-frozen. **Strongest established result; the anchor both lenses keep.**
- **The freeze is OUTPUT starvation, not input/submit starvation.** No blocking per-frame submit gate exists; the only blocking ConditionVariable is `stopPreview(block 500)`. With APS enabled the screen updates ONLY via the native APS result callback (`ApsServiceListener.onPreviewReceived → ConsumerImpl.onPreviewReceived` GL render); the engine never emits a preview output, so SurfaceView holds the last frame.
- **`previewManagerRoutine` is a PURE CONSUMER parked input-starved** (`pthread_cond_wait(this+0x17c)` while cmd-count `this+0x150==0`). The bug is upstream, not in the routine.
- **`isPreviewNotSendAps=true` → preview BLACK ⇒ `libAlgoProcess` IS the preview renderer** (no separate direct HAL→SurfaceView path).
- **ERROR_CAMERA_DEVICE self-kill is LOGGING-induced** (clean baseline w/ logging off stays alive+frozen; verbose alog trips the device-error self-kill on the marginal HAL). Methodological gotcha, not a root.

### Refuted-or-overreach
- "Freeze = HardwareBuffer/GraphicBuffer leak" → REFUTED ([R-07](REFUTED-LOG.md)).
- "Freeze = AEC-stats / hdr_detected starvation" → REFUTED ([R-08](REFUTED-LOG.md), doc-47, doc-45 force-test).
- The 20-pool / ~frame-19 GRADUAL exhaustion model → **REFUTED on-device** (doc-44 U8 fired an actual on-device falsifier), not merely "superseded." (SKEPTIC-correct.)
- The `mMetadata==null skip ⇒ IMAGE-pool freeze` mechanism → REFUTED for the freeze; `onPreviewReceived` gates on `mPreviewErrorCode/mFrameworkErrorCode`, NOT on `r.mMetadata`. Survives only as a PARALLEL CloseHandle leak.
- FIX#2 (metaBufferMap overflow-drain) as a freeze fix → REFUTED on-device. Freeing INPUT cannot make the engine produce OUTPUT.
- "app stops submitting after ~1 frame" as a SUBMIT-side block → REFUTED; re-scoped to OUTPUT-starvation.
- "ROOT LOCALIZED: `libAlgoProcess` IS the renderer" → **OVER-LABELS** (SKEPTIC-correct): the blob is byte-identical OOS↔LOS (trunk axiom) so it is a STALL SITE, never the root. Downgrade to **proximate-site / renderer localized**. The root is the environmental release/delivery contract (`decMetaRefZeroToRemove` upcall / E2 bridge / native decision-complete).

### Questionable (live-open)
- **The TRUE root of Gate B is unconvicted.** Leading mechanism: `libAlgoProcess` never emits a preview OUTPUT because the per-frame decision never completes ⇒ the native `decMetaRefZeroToRemove` release-upcall cadence is absent on LOS. Rests on inference, not a captured working/broken diff.
- **The A→B link is UNPROVEN-OPEN, not refuted.** Whether the MISSING per-frame AEC-stats metadata shapes a malformed/incomplete decision result the engine refuses to emit on (doc-44 synthesis) is unsettled — distinct from the refuted "hdr_detected gate blocks delivery."
- The precise stop link (decision-never-completes vs `decMetaRefZeroToRemove` upcall skipped vs ConsumerImpl GL-render break) is not yet pinned to ONE site.
- A7 forced-opmode-0 SIGSEGV is a self-inflicted artifact; the clean freeze is a STALL (parked thread, no tombstone), not a SIGSEGV. Off-path.

### Gaps
- **G4 working-state preview-DELIVERY / release cadence is UNCAPTURED** — highest leverage; both D2 §c and C6 §c block on it; S1's whole A/B is gated on it.
- Native `decMetaRefZeroToRemove` per-frame firing on a WORKING vs FROZEN cycle is uncaptured (cached-jmethodID `CallVoidMethod`, string absent in all blobs).
- Whether `ApsServiceListener.onPreviewReceived` (3c6730) fires MORE THAN ONCE during the freeze is unmeasured — cheapest direct OUTPUT-starvation confirmation.
- `statusByte` (arg0/x0 at `pipelineDataCallback` line 481) for frame 1's result is UNMEASURED — cheapest discriminator between handler-halt and malformed-content.
- Whether `ConsumerImpl.onPreviewMetaArrived` keeps firing per frame (proves app feed is complete) during the freeze is unmeasured.

### Contradictions with the clean tree
- **NONE survive.** The tree (S1 PARTIAL/OPEN; C6 trunk axiom "stall site, never root"; R-07/R-08; A→B UNPROVEN-open) is internally consistent with the surviving dirty findings.
- Apparent A4 (`preview 30fps verified working`) vs A8/clean-S1 (`frame-1 freeze`) is a **BUILD-CONFOUND** (A4 = matched-201 OCS state; S1 = v19/infiniti port), not a real contradiction. A4 must NOT refute S1.
- Dirty A5 "decision-loop fires ~40× then freezes, a CONSEQUENCE of the hdr_detected root" CONTRADICTS doc-47/[R-08](REFUTED-LOG.md). Carry as measurement-liveness only, NOT as a consequence of hdr_detected.
- Dirty A2 "PICTURE_METADATA onImageAvailable never fires" must NOT be folded into S1 — that is the snapshot/capture-metadata path (S2/copyMetadata family), a different stream/symptom class.

### Revisit targets
1. **G4 BASELINE CAPTURE** (highest leverage): on a KNOWN-WORKING state capture preview-delivery + release cadence (`capture/ab_capture.sh`, `debug/10_runtime_debug.sh` live all-thread unwind). Also confirm the live partition fingerprint to settle the A4-vs-A8 build-confound.
2. **OUTPUT-STARVATION CONFIRM** (cheapest, GC-safe): hook `ApsProcessor$ApsServiceListener.onPreviewReceived` during the freeze — fires >1×? Zero/one = native OUTPUT-starvation; many = downstream GL break in `ConsumerImpl.onPreviewReceived` (757755). Pair with `onPreviewMetaArrived` (3da42c).
3. **NATIVE statusByte PROBE**: `Interceptor.attach pipelineDataCallback` (+0x1a9dd4), log x0 (statusByte) + arg4 for frame 1. Use **native attach, NOT frida-Java** (the getOplusHardwareBuffer path crashes ART GC under frida-Java, doc-43).
4. **decMetaRefZeroToRemove tracing**: find the cached-jmethodID `CallVoidMethod`; confirm per-frame on working baseline vs never-on-LOS.
5. **A→B CLOSER** (predicted to CLOSE, not discover a root): `probe_aec_hdrdetect.js` attached DURING preview-start; expect it to ratify Gate-A/Gate-B independence.
6. **8K REVISIT NOTE**: keep S1-preview conclusions distinct from the snapshot/8K capture/record stream — re-measure OUTPUT-starvation + pool depth at 8K before transferring.

---

## SYMPTOM 2 — no-JPEG / hdr_detected rc=-2 / SHDR usecase gate

**Clean tree:** [`S2-nojpeg.md`](symptoms/S2-nojpeg.md), path [C5](control/C5-camx-chi-feature2.md) (SHDR gate, PROXIMATE-SITE) → [E3](facilitation/E3-toggles-config.md) (`camxoverridesettings`) / [C4](control/C4-hal-provider.md) (OEM tag publish); characterization PARTIAL, **conviction CONFOUNDED**.

### Established
- **All HAL/AEC/config blobs are byte-identical OOS↔LOS** (libaecCustom f8fb639d, chi.override 3f25d020, camera.qcom.core, sensor .bin; `CameraHWConfiguration.config` differs only on 2 off-path FD lines). Runtime-input / configure-time divergence, NOT a wrong-blob problem. **Do NOT propose blob swaps.**
- **No config file is missing/divergent on the SHDR path** (md5 diff of odm tree: 766 stock vs 738 LOS = only 24 UI .mp4s + 4 DRM licenses missing). The `[AndroidMetadataFilter]` is EXCLUDED as the publish gap (identical filters; stock publishes at opMode 0x8001 which neither covers, yet still emits hdr_detected).
- **The app / OCS SDK / framework Java layer is NOT the gate.** `Util.isHdrOn`, `QComPlatformDiff.getHdrDetected` are pure readers. `com.oplus.auto.hdr.enable` is a per-request category-4 key (never CONFIGURE).
- **hdr_detected is a registration-OK, runtime-POPULATION gap.** Tag id `0x80be000b` registered identically on both; rc=-2 is per-tag -ENOENT — sibling `drc_gain` in the SAME `com.qti.stats_control` section publishes fine. Gap is SELECTIVE per-field.
- **Identity-relay is NOT a metadata/JPEG cause** — performance axis only ([R-09](REFUTED-LOG.md)).
- **On-device v19 NEGATIVE facts:** (a) the AEC COMPUTES hdr_detected 954× with `*(aecCtx+0x48)==1` on EVERY frame in NORMAL preview ⇒ the `+0x48` producer-gate is REFUTED; divergence is the CamX result-PUBLISH step. (b) `processExt` writes hdr_detected (`aecOut+0xfc`) UNCONDITIONALLY ⇒ libaecCustom ALWAYS exports it; the drop is downstream in the CamX AEC node.
- **The proven LEVER (mechanism aside):** StaticSettings `+0x6a28` = `selectSHDRAutoExposureUsecase` (hash 0xDC4EAFC3) + sibling `+0x6a18`, both read 0 on clean-boot LOS. Forcing them flipped hdr_detected rc=-2→rc=0 AND GCVT→120 fusion (~5500×) TOGETHER — publish + fusion share one lever (Root A). Fix vehicle = a shipped `/vendor/etc/camera/camxoverridesettings.txt`.
- **The freeze is a SEPARATE root from no-JPEG:** forcing the gates flipped rc=0 + fusion but did NOT un-freeze preview ([R-08](REFUTED-LOG.md), doc-47). Two independent gates.

### Refuted-or-overreach
- "`+0x48` is the producer gate / AEC never computes hdr_detected" → REFUTED on-device (954×, force was a no-op).
- "`+0x6544` / HWMFHDRSupported / LegacyUpdateStaticSettings as the single root" → REFUTED: `+0x6544` already 1 on LOS; LUSS NEVER fired (runs once at provider-init, pre-attach); GCVT + publish read the forced StaticSettings DIRECTLY. **Kills the dirty CONSENSUS ~75%-confidence root and the doc-45 "advertise HWMFHDRSupported=1" primary fix.**
- "customVendorTag 120 missing / GCVT=0 as the no-JPEG root" → REFUTED ([R-06](REFUTED-LOG.md): tag 120 PRESENT in v19 logs).
- "hdr_detected gate blocks JPEG / fusion" → REFUTED ([R-08](REFUTED-LOG.md): offline fusion runs cleanly with captureHDR:0 previewHDR:0 featuretype 50).
- "`+0x6a28/+0x6a18` == enable3expSHDRSnapshot/setHDRMode" name-mapping → REFUTED on-device (those are `+0x1e0` / `+0x6a40`). `+0x6a28` is `selectSHDRAutoExposureUsecase`; `+0x6a18` is NOT name-pinned.
- "setHDRMode (`+0x6a40`) is THE bakeable lever" → mis-attribution; the real levers are `+0x6a28` + `+0x6a18`.
- The A1 "SHDR sensor-mode selection / MCX cascade" cluster (ChiMcxStaticPolicy, IsMatchingHDRExposureType keystone) → the AutoHDR-the-submode DETOUR; self-marked superseded. **Do NOT revive.**
- A8 "InitSHDREnable / empty SHDR match table → HDR mode 0 → GCVT 0 → no JPEG" → dead twice over (contradicts byte-identity AND the [AndroidMetadataFilter] exclusion; tag 120 present). A stale "open" row that should be "refuted."
- A2/A3 "addPictureMeta=0 == GCVT=0, one blocker" → SUPERSEDED (conflates S2 with the SEPARATE #1 freeze, Gate B).

### Questionable (live-open)
- **THE headline root claim itself** — "SHDR/AEC enable is off on LOS, fix = `selectSHDRAutoExposureUsecase=1`" — is **CONFOUNDED, NOT convicted.** The force-test proves the lever is LIVE but does NOT establish the LOS value DIVERGES from stock under the SAME condition. **G-COND violation:** `+0x6a28=0` / rc=-2 measured at IDLE / indoor PHOTO; OOS-BASELINE C5 SESSION FACT records stock ALSO reads `selectSHDRAutoExposureUsecase=0` at idle/PHOTO. If stock flips 0→1 only inside a genuine HDR scene, the lever is session-state-driven and the LOS root moves to the C3/C4 configure-time session-typing path.
- The OOS-PIPELINE "falsifiable proof" (GCVT 0→139/120 force) is SUPPORTED-at-best / CONFOUNDED (force-experiment in the wrong lighting condition does not establish causation).
- The per-field CamX publish gate (candidate 1 = AEC node publishes HDR-detect sub-family only when numHDRexposure>1 / HDRMode set vs candidate 2 = a separate StaticSettings stats-publish flag) is unresolved.
- `+0x6a18` is not name-pinned (strongest candidate `setAutoHDRMode` 0xA49DE767).
- Whether shipping the txt actually flips rc=-2→0 NATIVELY (no frida) is unobserved; the dodge oracle ships NO functional camxoverridesettings.txt, so dodge is NOT an oracle for a config-file fix here.

### Gaps
- **THE S2 de-confound (highest value):** `dump_camxsettings.js` on a STOCK unit during an ACTUAL HDR-triggering scene (NOT idle indoor); read `+0x6a28` / `+0x6a18`. Stock flips 0→1 only under HDR ⇒ session-state-driven (root C3/C4); stock is 1 even at idle ⇒ static divergence is real (root E3).
- `camAECGetParam` split-probe (`probe_aec_getparam.js`, device 0x0bae78): is the HDR/stats param-type REQUESTED on LOS? Localizes WHERE in the CamX node the per-field gate sits.
- De-clobber CHI/CamX graph logs (`tools/patch_chi_logclobber.py`, 4 offsets valid on V16.1.0) + observe-only dump in an HDR scene → lift C5 to CHARACTERIZED.
- Name `+0x6a18` exactly via `SettingsManager::WriteCamxSettingsToFile` (libcamxsettingsmanager 0x113168) stock-vs-LOS diff.
- Ship-and-verify the authored txt then re-run light sweep + `observe_getmetadata.js`.
- **JPEG-land confirmation is gated:** in v19 the JPEG remained UNTESTABLE because a frozen UI can't drive capture. rc=0 / GCVT=120 is NECESSARY but NOT SUFFICIENT — Root B (freeze) must be cleared in parallel.

### Contradictions with the clean tree
- The dirty single most-repeated POSITIVE root claim ("fix `selectSHDRAutoExposureUsecase=1`") is asserted as THE root; the tree downgrades it to **CONFOUNDED** (S2; C5; INDEX line 75). Headline OVERREACHES.
- Multiple dirty rows carry `note_status:proven` for a CAUSAL ROOT (the A4 broken-chain; the GCVT-force "falsifiable proof"; the data-plane "self-reinforcing loop"). Against the on-device evidence these are at most CONFOUNDED/SUPPORTED. The genuinely "proven" facts are OBSERVATIONAL.
- Dirty CONSENSUS ~75% on `+0x6544`/HWMFHDRSupported/LUSS seeder → tree records `+0x6544` already=1, LUSS never fires. Direct contradiction.
- Dirty "customVendorTag=0 → no JPEG" → contradicts [R-06](REFUTED-LOG.md).
- Dirty A2 "one blocker" → contradicts the two-gate split ([R-07](REFUTED-LOG.md), [R-08](REFUTED-LOG.md)).
- Dirty D-seed "setHDRMode `+0x6a40` is THE lever" → contradicts the FORCE-TEST result.

### Revisit targets
1. **S2 DE-CONFOUND (do FIRST):** `dump_camxsettings.js` on STOCK in a REAL HDR scene; read `+0x6a28` / `+0x6a18`. This single probe lifts S2 off CONFOUNDED.
2. **OEM-HANDLER / configure-time tracing (C3/C4):** if session-state-driven, trace `beforeConfigureStreamsLocked` / `getExtensionOperatingMode` (C3) and the provider tag-publish loop (C4, tag `0x80be000b`). Pair with `probe_aec_getparam.js`.
3. **JNI/OCS/framework tracing:** one-pass JNI/OCS trace to rule out a stale-flash regression hiding a CONFIGURE-time path (use `apk-re-jadx` on OplusCamera.apk + OCS SDK).
4. **8K (#8) shares C5 but is a DISTINCT node** — do NOT conflate; trace with `hook_configure_streams.js`.
5. **SHIP-AND-VERIFY** (after greenlight): author `/vendor/etc/camera/camxoverridesettings.txt` with `selectSHDRAutoExposureUsecase=1` (+ candidate `setAutoHDRMode=1`) via PRODUCT_COPY_FILES; minimal set (over-enabling SHDR/DCG can destabilize).
6. **DECOUPLE Root B:** clear the freeze in parallel so a non-frozen UI can drive capture.

---

## SYMPTOM 3 — over-exposure (~5×)

**Clean tree:** [`S3-overexposure.md`](symptoms/S3-overexposure.md), path [D4](data/D4-render-sf-edr.md) (proximate, no tonemap) → [E1](facilitation/E1-stubs.md) (`OplusEdrUtils` no-op stub) → [E2](facilitation/E2-system-framework.md) (missing native libgui/SF OEM-EDR ABI), w/ display-HAL HDR-cap as co-factor; **conviction OPEN** / characterization PARTIAL, gated on the DARK **G6** EDR-invocation probe.

### Established
- **MISFILING IS THE HEADLINE (both lenses agree).** The dirty JSON filed the entire A1-shdr-autohdr cluster (12–15 of ~24–25 findings) plus the A2/CoupleHDR findings under "symptom 3." Per the tree: INDEX line 91 roots S3 at D4→E1/E2 (none of C4/C5/C6); INDEX line 90 roots AutoHDR/hdr_detected at **symptom 2**. **The A1 cluster is real RE work but is symptom-2 evidence — relabel, don't count toward S3.**
- The over-exposure proximate site is **D4** (un-tonemapped BT2020-HLG SurfaceView); immediate carrier is the `OplusEdrUtils` no-op stub (E1): `getBlastSurfaceControl()→null` short-circuits `PreviewHDRControl.A()/B()` so no EDR transaction is requested. **Rated "near-ROOT carrier / necessary-but-insufficient," NOT "proven sole root."**
- **doc-49 libgui EDR-ABI RE is load-bearing.** OOS libgui std `setExtendedRangeBrightness` writes `layer_state_t +0x41C/+0x420`, what-bit48 (present on LOS), but the panel tonemap is driven by the OEM `Transaction::setEdr*` family (`setEdrViewTransform@0x27fd48`) writing `+0x0A0 / +0x0D0`, what-bit63 — the curve being the `OplusEdrViewTransform` 4×4 matrix. AOSP/LOS libgui export only the std ratio method. **This demotes the stub-only fix to insufficient.**
- **Over-exposure is INDEPENDENT of the freeze (#1).** `persist.camera.override_preview_hdr_support=false` forces SDR → colors correct while both HDR and forced-SDR previews still freeze (doc-43 elimination matrix).
- **The dominant trigger is the 10-bit HLG dataspace, not the headroom value** — dropping headroom 5.0→1.0 did NOT fix it. (PROVENANCE VERIFIED 2026-06-13: the dirty cite "doc-29" is VALID — `op15-camera-porting/docs/rearch/29-preview-hdr-sdr.md` §2 states the on-device discriminator "dropping the headroom to 1.0 did NOT fix it → the dominant cause is the HLG DATASPACE, not the headroom," and §4 the OEM-HDR display-path co-factor. doc-29 lives in the dirty corpus, not the clean `oplus-final/docs/rearch/` tree (which holds 35/38/40–49); doc-40 carries the EDR/HLG mechanism but NOT the 5.0→1.0 discriminator, doc-47 carries none — so doc-29 is the primary source for this specific claim. The claim stands; the provenance is correct, NOT spurious.)
- **OOS SF is heavily OEM-patched, LOS ships clean AOSP SF** (~100 oplus dynsyms; doc-35/46 Addendum A). The precise refined form is the libgui-WRITE + SF-READ ABI pair (doc-49 §Porting).
- **[R-03](REFUTED-LOG.md) cross-confirms:** "The EDR frameworks/native port (doc-49) is over-exposure-only — NOT the P010 lever." doc-49 EDR work belongs to S3, distinct from the P010/#5 path.

### Refuted-or-overreach
- "One gate → freeze + no-JPEG + over-exposure" unification → REFUTED ([R-08](REFUTED-LOG.md)).
- GCVT / customVendorTag 120 as a thing the port must "make happen" (for any symptom incl. S3) → REFUTED ([R-06](REFUTED-LOG.md)).
- The `+0x6544` / HWMFHDRSupported / LUSS-seeder gate model → REFUTED on-device (doc-45 CORRECTION).
- doc-41's "single root of BOTH over-exposure AND freeze" → REFUTED/contradicted (D4 §f line 125; R-07/R-08). Mark contradicted-by-tree, not "worth testing."
- CoupleHDR symbol-miss as an S3 cause → REFUTED (over-exposure is EDR composition, not algo-symbol-miss; benign red herring absent on stock too). The lingering "speculative" CoupleHDR note should be closed.
- The dirty "EnableAutoHDR is the WRITER, DefaultRequestSettings seeds it" causal claim → REFUTED/superseded (DRS seeds with DEFAULT 0; the live gap is the CamX AEC-node result-publish).

### Questionable (live-open)
- **The candidate `OplusEdrUtils` EDR-plumb fix** (`setEdrSdrRatio → txn.setExtendedRangeBrightness`) is QUESTIONABLE-AND-PREDICTED-TO-FAIL. D4 §c lines 88–90 tags it the explicit FALSIFIER for the stub-only-fix hypothesis (AOSP SF never reads the OEM `setEdrViewTransform/+0x0A0/bit63` curve). The on-device "INCONCLUSIVE / still over-exposed" result is very likely the predicted falsifier firing, NOT a ClassLoaderContext/overlay-jar mystery. **Two entangled questions:** (a) was the stub even invoked? (b) is the std-ratio approach ABI-insufficient by construction (tree says yes)?
- The `OplusEdrUtils` stub as the SOLE/PROVEN root is QUESTIONABLE as stated — stub-is-no-op is established; stub-is-THE-sole-root is NOT (conviction OPEN, G6 DARK; doc-49 proves a second necessary condition — the missing E2 ABI).
- **Display-HAL HDR-cap advertisement is an UNVERIFIED co-factor** (does the OP15 panel advertise HLG/PQ via `IComposerClient::getHdrCapabilities`?).
- The SF READ side (`OplusRequestedLayerState::{setExtendedRangeBrightness,setDesiredHdrHeadroom,setEdrMetadata}`, `OplusDolbyVision::setEDRStatus`) is "next decompile," not yet confirmed to read `+0x0A0/bit63`.

### Gaps
- **G6 IS DARK** — no one has observed at runtime whether SF ever RECEIVES an EDR program in an actual HDR scene (doc-47's colorMode 0 / hdrSdrRatio NaN reading was an IDLE/SDR session — G-COND not met). The data-plane confirmation that discriminates E1-vs-E2 does not exist.
- EDR-invocation tracing is build-only (not frida-hookable at the call site) — needs an eng SF build w/ LOG_NDEBUG 0 + ALOGV + a full /system flash.
- display-HAL HDR-cap state uncaptured (a cheap `dumpsys SurfaceFlinger` HDR-caps read could kill/confirm the co-factor first).
- The SF read-side ABI is undecompiled (pure host RE, no device).
- Stub-invocation confirmation is unsettled (tested via overlay w/ ClassLoaderContext mismatch — never confirmed the stub even ran).

### Contradictions with the clean tree
- DIRTY mislabels the A1-shdr-autohdr cluster (12–15 findings) + A2/CoupleHDR as symptom 3; INDEX line 91 (S3=D4→E1/E2) and line 90 (S2=C5→E3/C4) put that machinery under **symptom 2**. S3 `path_nodes:[D4,E1,E2]` contains NO C4/C5/C6 node.
- DIRTY rates the stub root "proven/DEFINITIVE"; clean S3 rates **conviction OPEN / PARTIAL, G6 DARK**.
- DIRTY keeps the `setEdrSdrRatio→setExtendedRangeBrightness` candidate as a live fix and blames its failure on overlay/ClassLoader; clean D4 §c marks the std-ratio-only approach as the explicit FALSIFIER (predicted-insufficient by construction).
- DIRTY (doc-41) floats a single root for over-exposure AND freeze; clean tree insists #3 is independent of #1.
- DIRTY treats GCVT-120 and the `+0x6544`/LUSS seeder as live levers; clean [R-06](REFUTED-LOG.md) + doc-45 CORRECTION close both.
- DIRTY cites "doc-29" — VERIFIED VALID (2026-06-13): it exists at `op15-camera-porting/docs/rearch/29-preview-hdr-sdr.md` (dirty corpus, not the clean `oplus-final/docs/rearch/` tree) and is the PRIMARY source for the 5.0→1.0 headroom discriminator + OEM-HDR display-path co-factor. Conclusion stands; provenance is correct (the earlier "non-existent doc-29 / spurious" assertion was an artifact of looking only in the clean rearch tree).

### Revisit targets
1. **G6 IN AN HDR SCENE (the single decisive probe):** eng SF build w/ LOG_NDEBUG 0 + ALOGV in the EDR path (or `dumpsys SurfaceFlinger` HDR-caps + native EDR-invocation trace), driven by an ACTUAL HDR scene. Zero EDR calls ⇒ root E1; calls land but panel stays bright ⇒ root E2 / display-HAL caps.
2. **CHEAP DISPLAY-HAL CHECK FIRST:** `dumpsys SurfaceFlinger | grep -iE 'supportedhdrtypes|hdrcapab'` on LOS (read-only, no flash).
3. **DECOMPILE THE SF READ SIDE** (host RE, no device): confirm `OplusRequestedLayerState`/`OplusDolbyVision` read `+0x0A0/bit63` and apply the 4×4 matrix.
4. **BUILD+FLASH (not overlay)** the stub w/ a log line in `setEdrSdrRatio` to separate "not invoked" from "invoked-but-insufficient"; verify STILL over-exposed.
5. **JNI/OCS/FRAMEWORK TRACING — route to symptom 2, NOT 3.** Any `com.oplus.auto.hdr.enable` / `+0x6a28` / CamX AEC publish / GCVT tracing belongs to S2 and will NOT fix over-exposure. Do not re-count toward S3.
6. **OEM-HANDLER TESTING:** once the libgui WRITE + SF READ ABI pair is recovered, test the full `OplusEdrViewTransform/setEdrViewTransform` 4×4 path end-to-end. **This is the actual S3 fix (an ABI port).**
7. **8K (#8) adjacent:** keep it segregated from S3 (shares no node with the EDR path).

---

## SYMPTOM 4 — copyMetadata UAF (back-to-back capture)

**Clean tree:** [`S4-copymetadata.md`](symptoms/S4-copymetadata.md), path [D2](data/D2-hal-fill-aps.md) (`APSMetadata::copyMetadata+60`) → [C3](control/C3-cameraserver-extimpl.md)/[C4](control/C4-hal-provider.md) (result lifetime); **conviction OPEN** (D2 node BLOCKED behind #1).

### Established
- **CRASH SITE (byte-precise, 3 independent tree anchors).** SIGSEGV at `APSMetadata::copyMetadata+60`, deref of a non-null-but-freed source `camera_metadata` header at `+0x0c` (entry_count) / `+0x18` (data_capacity), past the null-guard. Dirty evidence (Ghidra byte-identical ×2, tombstone regs fault `x21+0xc / x20=0xaaaa`, nm-confirmed symbol) is legitimately PROVEN and tree-corroborated. (doc-42 line 307)
- **BLOB IS BYTE-IDENTICAL OOS↔LOS ⇒ D2 IS A SITE, NOT THE ROOT** (trunk axiom). `libAlgoProcess.so` BuildID `82fe443b408f8ed027558b0d4ffb1500`.
- **copyMetadata RUNS CLEAN ON STOCK** (~227 hits, 0 crashes in `aps_capture.log`). Divergence is upstream metadata lifetime, not the binary.
- **LEADING ROOT MECHANISM (as hypothesis):** AOSP/LOS `CameraMetadataNative` frees the result `camera_metadata` sooner than the OnePlus contract the blob was built against, so the deferred quick-jpeg job (`DeferJob::startCapture`) derefs it after free. doc-42 §3 Family II grades the fix confidence **MEDIUM, not proven.**
- **gAPSOps-NULL / Midas-HAL root theory is CORRECTLY RETRACTED.** Stock 122k-line verbose capture emits `gAPSOps NULL ×188` + `getMetadata res:-2 ×376` with ZERO crashes ⇒ benign app-side noise. Tree makes no gAPSOps/Midas claim; C4 treats `getMetadata rc=-2` as benign optional-tag-absent.
- **INTERIM DEFENSE = libapsfixup copyMetadata GOT-slot interposer** (COPYMETA_GOT_OFF 0x686ee8, body 0x292960), crash-safe-by-design (validate source-mapped+sane header, AArch64 TBI strip, `entry_count>0x100000 || data_capacity>0x4000000 ⇒ null`, mprotect GOT install). Retireable once the provider holds the result ref.
- **The divergence is a LIFETIME-CONTRACT divergence, NOT a config/prop value** (`defercap.support=1` and `isSupportCloseCaptureResult=FALSE` on BOTH sides).

### Refuted-or-overreach
- MATCHED-SET / BuildID-MISMATCH root theory (96ce3735 vs e8e4317c) → KILLED TWICE (identical-blob axiom; on-disk BuildID 82fe443b matches NEITHER). Notes self-marked superseded.
- "bug-a-class skew from mixing 17.0.0.31 blobs into 16.0.7.201" → inherits the refuted matched-set premise; build-hygiene note only.
- Midas HAL unreachable → gAPSOps NULL → crash → triple-refuted (zero-crash stock capture; tree never invokes Midas; note self-flagged speculative).
- `DeferJob::startCapture @0x3c9abc` → fabricated address (decompiler-bridge hallucination); self-refuted to @0x2d2c5c. NEITHER address is anchored in the tree. **Cautionary example of raw-address fabrication.**
- PORT-vs-stock binary objdump diff of copyMetadata as the next-step probe → METHODOLOGICALLY FUTILE on a byte-identical blob. The PROVEN tag belongs only to the stock-clean OBSERVATION (227 hits, 0 crashes); the diff recipe is refuted-as-confounded. **Correct probe = the metadata-lifetime A/B.**
- A8 "DeferJob synchronously copies request metadata AFTER framework recycled the slot" tagged `proven` → OVERREACH. Crash-SITE is proven; ROOT-ATTRIBUTION is OPEN. Demote to LEADING HYPOTHESIS.

### Questionable (live-open)
- **C3-vs-C4 lifetime-owner attribution is UNRESOLVED** — which side frees first: cameraserver/ExtImpl result dispatch (C3: `beforeMetadataSendToApp / returnOutputBuffers / sendCaptureResult`) vs HAL-provider result publish (C4). **The single biggest live unknown.**
- INTERNAL-TREE FRAMING TENSION: S4 holds "C3/C4 = ROOT, D2 = proximate-site"; C3 (f) #4 previously said "co-factor here, ROOT at D2." The authoritative symptom leaf (S4) governs: D2 site, C3/C4 root, OPEN. **RECONCILED 2026-06-13:** C3 (f) #4 reworded to "ROOT-bearing here (C3/C4 lifetime owner); D2 is the proximate crash-SITE," aligning it with the S4 leaf.
- Poison-pointer ORIGIN is speculative at the instruction level.
- Offset reconciliation (CORRECTED 2026-06-13): the tree's LOS-blob offsets ARE already reconciled — doc-25 (`op15-camera-porting/docs/rearch/25-copymeta-uaf-evidence.md`, dirty corpus) proves both via live base arithmetic on the on-disk `82fe443b` `libAlgoProcess.so`: body `copyMetadata @ 0x292960` and GOT `R_AARCH64_JUMP_SLOT @ 0x686ee8` (run base `0x7783633000`: `+0x292960 = 0x77838c5960` = the `real=` printed by the hook; `+0x686ee8 = 0x7783cb9ee8` = the hooked GOT slot). The dirty `0x2982b8` (file) / `0x3982b8` (Ghidra) are a DIFFERENT blob — the **stock** `e8e4317c4b60cd8bb8f935883e340884` `libAlgoProcess.so` (`bug-a-rootcause.md:35`, `APS-CAPTURE-FINDINGS.md:267`), NOT a rebase of `82fe443b`. So there is no `0x686ee8↔0x292960` open item (doc-25 closed it); the only residual is confirming the live LOS on-disk BuildID is `82fe443b` (one `readelf -n` pass), after which the `0x292960`/`0x686ee8` pair is trusted and the stock `0x2982b8` is simply a separate-blob value not used as a LOS hook target.
- **D2 NODE-LEVEL conviction is BLOCKED, not merely OPEN** (D2 front-matter line 11: wedged on the #1-freeze G4 working-state denominator). Even the proximate-site node cannot fully run its root test until the #1 freeze is unwedged.

### Gaps
- **G-MECH free/use ORDERING never captured** — THE capture that converts the leading hypothesis into a convicted root and settles C3 vs C4.
- C3-vs-C4 lifetime-owner not attributed.
- No provider/OCS result-ref-hold A/B has been run (retain the result `camera_metadata` across the deferred window, burst repro w/ GOT hook DISABLED; absence of SIGSEGV attributes the root).
- Offset/BuildID reconciliation pass (`readelf -n` + `nm` on live on-disk lib).
- D2 node is BLOCKED behind the #1 freeze (may need #1 unwedged first, or a stock-device burst repro).

### Contradictions with the clean tree
- Dirty matched-set / BuildID-mismatch root → CONTRADICTS the identical-blob axiom AND the notes' own 82fe443b readelf.
- Dirty Midas/gAPSOps-NULL chain → NO presence in the clean S4 path; tree treats `getMetadata rc=-2` as benign.
- Dirty A8 `proven root mechanism` → OVERSTATES vs S4 OPEN / doc-42 MEDIUM (confidence contradiction).
- Dirty A2/A5 "no copyMetadata UAF exists / metadata blocker is producer-side STARVATION" → contradicts S4 + D2 line 112-117. CLUSTER-LOCAL absences; the starvation framing belongs to the no-JPEG / Gate-A symptom.
- Dirty PORT-vs-stock binary-diff recipe → contradicts the identical-blob axiom (diff guaranteed empty).

### Revisit targets
1. **DECISIVE (settles C3 vs C4):** `ab_capture burst` w/ the copyMetadata GOT guard DISABLED, then `debug/parse_tombstone.py` to confirm `copyMetadata+60` fault PC and identify the freed-allocation OWNER.
2. **FRAMEWORK/OCS ref-hold A/B:** instrument the provider/OCS deferred-job layer to RETAIN the result `camera_metadata` across the deferred window; burst repro w/ hook disabled; expect no SIGSEGV. Success → lets the GOT guard be dropped (doc-42 Family II).
3. **JNI/framework free/use ordering instrument:** hook `DeferJob::startCapture` (re-resolve LIVE — NOT the fabricated 0x3c9abc, NOT the dirty 0x2d2c5c) vs the framework `CameraMetadataNative` free, OOS vs LOS.
4. **OEM-handler / C3 result-delivery test:** trace `beforeMetadataSendToApp / returnOutputBuffers / sendCaptureResult` on LOS vs stock.
5. **Reconciliation pass:** `readelf -n` + `nm` on live `libAlgoProcess.so` to re-confirm the on-disk BuildID is `82fe443b` (the LOS blob doc-25's base arithmetic already pins body `0x292960` / GOT `0x686ee8` against). Note `0x2982b8/0x3982b8` are the STOCK `e8e4317c` blob, not a rebase of `82fe443b` — do NOT use the stock offset as a LOS hook target.
6. **Unwedge dependency:** prefer running the S4 burst repro on a STOCK device for the OOS side (freeze does not occur, copyMetadata ran 227× clean); capture the G4 working-release cadence in the same session so #1 and #4 share one denominator.
7. **8K-mode revisit:** re-run the burst repro in 8K (larger result-metadata payload may shift the free/use window); compare freed-header `+0x0c/+0x18` across 8K vs default.

---

## SYMPTOM 5 — P010 / IMapper@4.0::getService NULL / non-contiguous gralloc

**Clean tree:** [`S5-p010.md`](symptoms/S5-p010.md), conviction:**REFUTED**, characterization:PARTIAL. [E4](facilitation/E4-sepolicy-namespace.md) linker-namespace candidate REFUTED by the dodge oracle; only the [D1](data/D1-gralloc-camxformat.md) consumer-side lock-math co-root survives (**BLOCKED**, INFERRED).

### Established
- **Both LOS binaries NULL `IMapper@4.0::getService(getStub=false)`; OOS ALSO NULLs it** (hwservicemanager ships-but-off, `hwservicemanager.disabled=true` on both). [R-04](REFUTED-LOG.md)/[R-05](REFUTED-LOG.md).
- **The failure is CONSUMER-SIDE, not allocation-side:** `mapper.qti.so` / `libgrallocutils.so` / `libcamxexternalformatutils.so` byte-identical OOS↔LOS. The 32-row align (1440→1472) is BY DESIGN (`scanline_align:64`). [R-01](REFUTED-LOG.md)/[R-02](REFUTED-LOG.md)/[R-03](REFUTED-LOG.md).
- **The libapsfixup P010/chroma repair (GOT redirect P010_GOT_OFF 0x689ba8 → `APSFormatConverterNeon::p010LSB2MSBNeon` @0x4fc094) is the CORRECT consumer-side DEFENSE to KEEP** (doc-42 §2 CORRECTION).
- **The full "OOS↔LOS gralloc allocation/path divergence" branch is exhaustively REFUTED** ([R-01](REFUTED-LOG.md)..[R-05](REFUTED-LOG.md): libui lock-math, snapalloc engine, OEM usage bit, getStub-flip, Gralloc4 steer).
- **The `same_process_hal_file` / CHI-node labeling fix is REAL** — but for the APS/turbo/ArcSoft/QNN/libapsfixup app-direct-dlopen path (C6), NOT for the P010 plane-layout decode (E4 §f). **ORTHOGONAL to S5.**
- **sepolicy access-denial for the P010 path is REFUTED by permissive-mode repro** (OOB still occurs under `setenforce 0`).
- **The freeze #1 gate blocks the S5 runtime A/B** (doc-47 Gate A / Gate B independence; the D1 r3-gralloc A/B is LOS-deferred).

### Refuted-or-overreach
- "OOS returns contiguous P010 while LOS returns non-contiguous as a stable allocation property" → REFUTED/SUPERSEDED (no allocation divergence; the `align_up(luma,4GB)` garbage is the FAILURE SIGNATURE of `getPlaneLayout` returning −1, not a contiguity difference).
- "A16 removed IMapper@4.0 drives the failure (LOS-only divergence)" → REFUTED (the R-04/R-05 LOS-only theory; getService NULLs on BOTH sides).
- "Expose `libcamxexternalformatutils.so` in public.libraries is the P010 root/lever" (doc-42 §2.5) → REFUTED by the dodge oracle ([E4](facilitation/E4-sepolicy-namespace.md) conviction REFUTED; lib ABSENT both sides, dodge reliable). **Re-home #5 at D1.**
- "There is no clean facilitation lever" as a FINALITY claim → the "consumer-side, keep the shim" half survives; the "no lever exists" half is SUPERSEDED (a candidate WAS later proposed and refuted). Note frozen at a pre-doc-42 state.
- "The allocator-V1 facilitation hypothesis" → REFUTED on both sides (vestigial DT_NEEDED, V1⊂V2).

### Questionable (live-open)
- **The surviving D1 consumer-side lock-math root is INFERRED, never traced.** The contiguity invariant (`Cb − Y == stride × height_aligned`) and the `getPlaneLayout` Cb-garbage prediction (`align_up(luma,4GB)`, `lo32<0x100000`) are PREDICTIONS — D1 conviction BLOCKED, confidence low. **The single genuinely-open S5 thread.**
- EVERY dirty note marked `proven` for S5 contradicts the tree's `conviction:REFUTED` (S5) / `BLOCKED`/INFERRED (D1).
- The Family-D Heisenbug/UAF hypothesis (`camApsBufferLockPlanes` borrows-without-acquire) is UNCORROBORATED for S5 and arguably MIS-ROUTED — the tree routes UAF/lifetime to Family II (copyMetadata, #4/#1), not a P010 garbage-geometry UAF; S5's surviving root is STATIC lock-math, not a timing race.
- The Family-A/C SEGV-fix MECHANISM (apsfixup repair window; `wrap_arc/ARC_TFRSN/BasicTone`) is established as carriers; its specific parameters are confounded.
- Dirty findings #1/#4 ("no P010 finding asserted in clusters A2/A5") are TRUE per-cluster but NON-LOAD-BEARING (absence-of-evidence scoped to particular clusters).

### Gaps
- **The decisive S5 A/B has NEVER RUN:** `r3-gralloc (30_run_r3.sh oos|los)` + `adb logcat | grep -iE 'Failed to link CamxFormatUtil|Unable to get IS_UBWC from snap'` in `com.oplus.camera`. Fallback line fires = namespace root (REVIVES E4, needs a new falsifier); absence = confirms D1 lock-math.
- No per-handle plane-layout capture exists (`trace_p010_planes.js`, NATIVE-ONLY — record lock-reported Cb vs blob `getPlaneLayout` Cb).
- The freeze-#1 unblock prerequisite is uncaptured (`probe_aec_hdrdetect.js` must clear/characterize the freeze first).
- No build/partition fingerprint behind any dirty "on-device validated" claim (stale-partition caveat, doc-47).
- No tree record of the alt-(ii) NON-USAGE allocation input (format enum / dims / allocator instance).

### Contradictions with the clean tree
- **WINDOW POLICY:** dirty #9 claims an on-device-VALIDATED WIDEN to `[0x60,0x7f]`. The tree's standing interim policy is NARROW `[0x70,0x7f]` (doc-42 l.208-209, l.371). No `[0x60,0x7f]` widen appears anywhere. **NOT accepted as "proven."**
- **GEOMETRY-PATCH MECHANISM:** dirty #5/#7 assert a commit `f3f372e` and a `min(plane-diff, described-height)` formula. NEITHER exists in the clean tree; the consumer defense is the libapsfixup GOT-redirect, not a geometry-diff patch. UNVERIFIED.
- **ON-DEVICE VALIDATION STATUS:** dirty Family-A/C marks SEGV fixes "VALIDATED ON-DEVICE near-baseline." The tree has NO such record, NO tombstone_42/44, NO widen-window. The fix MECHANISM is established; the on-device-PROVEN status is an unreconciled contradiction.
- **UAF ROUTING:** dirty #10 collapses a "UAF-like/Heisenbug" story into S5. The tree routes ALL lifetime/UAF to Family II (copyMetadata, #4/#1). Category error.
- **DIRTY DOC PROVENANCE:** the dirty notes cite docs 14/16/28, ABSENT from the current rearch/ (only 35–49 survive). The notes are PINNED to a pre-doc-42 state (have not absorbed §2.5-refutation, narrow-window directive, E4 dodge-oracle result).

### Revisit targets
1. **DECISIVE S5 PROBE (run first after unfreeze):** `r3-gralloc 30_run_r3.sh los` + `parse_r3.py` + the `Failed to link CamxFormatUtil` grep. Fallback fires → namespace root (revive E4, log a new falsifier); absent → confirms D1 lock-math.
2. **UNBLOCK PREREQUISITE:** `probe_aec_hdrdetect.js` on a stable session to clear/characterize freeze #1 so the P010 lock actually fires.
3. **`trace_p010_planes.js` (NATIVE-ONLY):** lock-reported aligned Cb (stride×1472) vs blob `getPlaneLayout` Cb. **Mirror apsfixup's `[0x70,0x7f]` window (NOT the dirty `[0x60,0x7f]`).**
4. **JNI/OCS/framework trace** for the Family-D mis-routing: hook `getOplusHardwareBuffer` lifetime + `camApsBufferLockPlanes` (D1 0x1c96f8) to test whether a P010-specific UAF exists OR the lifetime story belongs entirely to Family II (#4).
5. **OEM-handler / on-device reconciliation:** locate the device session + log behind the dirty `[0x60,0x7f]` widen claim; confirm partitions match source BEFORE promoting any widen/geometry-patch from dirty-"proven."
6. **8K-path probe:** capture P010 plane geometry under 8K to test whether the `align_up(luma,4GB)` signature scales with resolution.
7. If r3 confirms D1: trace the alt-(ii) non-usage allocation input (predict usage column MATCHES OOS↔LOS).

---

## SYMPTOM 6 — strlen-null TurboHDR

**Clean tree:** [`S6-strlennull.md`](symptoms/S6-strlennull.md), root candidates [C4](control/C4-hal-provider.md) (OEM TurboHDR tag unpublished) → [E3](facilitation/E3-toggles-config.md) (session state); C5 conviction CONFOUNDED, E3 SUPPORTED/G3-pending. **consensus_confidence: medium.**

### Established
- **CRASH MECHANISM (two independent evidence classes):** `setProcessOtherParams` does an unconditional `strlen` on `TurboRaw->field_0x4d88` (null on LOS → SIGSEGV at `__strlen_aarch64`). Proven by tombstone_32 (x23=0; backtrace `strlen ← setProcessOtherParams+140 ← preparedProcessParam ← turboHdrProcess ← turboHdrProcessV2 ← APSCaptureModeManager::workRoutine`) AND static disasm (`ldr x23,[x0,#0x4d88]`, encoding f966c417). `note_status:proven` justified for the mechanism.
- **NULL-SOURCE/SETTER CHAIN:** `parseTurboHdrInfo` (libAlgoInterface) loads tag base w22=0x4d78, calls `getMetadata`, gets null on LOS, cbz-skips the store `str x8,[x20,#0x4d88]`, leaving the field null. (C4 lines 43-44/52-53; doc-42 §4 line 332-334.)
- **STRLEN-HOOK GOT OFFSET:** `strlen@LIBC` JUMP_SLOT at GOT `libAlgoInterface+0x1bb6888`, readelf-confirmed. The interim null-guard wrap is INTERIM crash-safe defense, NOT the root fix.
- **ROOT IS A HYPOTHESIS NOT A CONVICTION:** leading root = the OEM IPE TurboHDR result-metadata tag (~0x4d78) never published on LOS. Established as the SHARED POSTURE.
- **THE 14-TAG RETRACTION IS A TRUE NEGATIVE:** the 14 missing `com.oplus` vendor tags (incl. `aps.turbo.raw.scene`) are NOT the root (all 14 absent on stock-201 too → benign noise). The clean S6 tag (~0x4d78 IPE result tag) is NOT among the 14.
- **The "NOT DOCUMENTED / zero grep hits" notes carry ZERO evidential weight** (scope-local negatives; S6 is a named symptom leaf, doc-42 §4 documents it fully).

### Refuted-or-overreach
- The `0xED / ChiVendorTagCache / libchifeature2 / g_vendorTagTable` identification as the S6 tag → REFUTED as S6 evidence (ZERO grep hits across the interop-tree). `0xED` is a per-REQUEST ChiMetadata sensor-mode-SELECTION tag (Gate A) feeding the SHDR Gate-A/Gate-B chain — a SIBLING-ROOT candidate belonging to **#2/SHDR-gate, NOT S6.**
- The "14 com.oplus tags / `aps.turbo.raw.scene` is the carrier" line → REFUTED (self-refuted; same class as [R-06](REFUTED-LOG.md)).
- The flat equivalence "#6 has the SAME ROOT as #2 hdr_detected rc=-2" → REFUTED AS STATED (overreach). [R-08](REFUTED-LOG.md) split the single-gate framing; #2 itself no longer has the simple root the note equates #6 to. The tree only claims #6 is the SIBLING of #2 and LIKELY the same configure-time HDR-session-state class — conviction OPEN/CONFOUNDED.

### Questionable (live-open)
- **ROOT ATTRIBUTION (tag-unpublished-on-LOS) is PLAUSIBLE-BUT-UNPROVEN.** The decisive probe `observe_getmetadata.js` has never been run in an HDR scene (G-COND/G-SYM unmet). Tag-present-on-stock-HDR is predicted but unobserved.
- **The `0x5880` vs `0x4d88` offset framing: the ESTABLISH lens is CORRECT and the clean tree carries a DOC BUG.** The actual crash CODE site is `setProcessOtherParams+140 = 0x1441ad4` (doc-28:213,235), NOT 0x5880; the only field load is `+0x4d88`, base tag ~0x4d78. doc-28:238-241 explicitly proves the brief's 0x5880 "incorrect" and "No other `ldr xN,[x0,#0x5880]` exists in this function." The clean tree (C4:44,118; S6:17) uses 0x5880 AS the crash site — a stale brief value. The SKEPTIC's "both offsets stand" rebuttal does NOT survive the evidence.
- **ROOT-vs-PROXIMATE between E3 (config) and C4 (tag-publish) is UNSETTLED but LEANING toward C4.** NEW EVIDENCE (C5 SESSION FACT 2, 2026-06-13): on a genuine daytime HDR scene, `ConfigureHDRInformation() GetSHDRAutoExposureUsecase = 0` while the MFHDR/fusion graph ran fully — i.e. stock does NOT drive HDR via the SHDR-auto-exposure usecase even in-scene. **This pushes #6's likely ROOT toward C4 tag-publish, weakening "ship `selectSHDRAutoExposureUsecase=1` fixes #2/#6."**
- The strlen workaround is loaded-but-never-device-triggered on the null path (doc-28:666 — the validation scene fired turbo-hdr Family C, not the strlen-null path).
- Neither OEM tag is NAME-PINNED.

### Gaps
- No decisive on-device A/B: `observe_getmetadata.js` in a real HDR scene on stock to confirm the IPE tag (~0x4d78) is present (rc=0).
- Trigger the strlen-null path on-device with the hook loaded; confirm "strlen: null ptr intercepted" fires.
- CamX-CORE layer for #2/#6 is still mask-gated/clobbered (need `tools/frida/unclobber_camx_logs.js` on the same HDR scene).
- G3 stock `dump_camxsettings.js` to name `+0x6a28/+0x6a18` exactly.
- Name-resolve BOTH tags (hook `GetVendorTagId(0xED)` + dump section.name; resolve ~0x4d78 hash to its registered name). Consensus: almost certainly distinct (request-selection vs result-publish).
- **Clean-tree doc bug fix:** the wrong 0x5880 crash-site should be reconciled with `setProcessOtherParams+140` / `+0x4d88`.

### Contradictions with the clean tree
- **CLEAN TREE 0x5880 CRASH-SITE IS STALE/WRONG.** S6:17 and C4:44,118 assert "SIGSEGV at TurboRaw+0x5880" and treat 0x5880 as the crash SITE. doc-28 (the proven source) shows the crash code site is `setProcessOtherParams+140 = 0x1441ad4`, null field `+0x4d88`. **The dirty note is the MORE CORRECT source here — a doc bug in the clean tree.** Suggest patching 0x5880→0x4d88 (field) / `setProcessOtherParams+140` (code site) in S6:17 and C4:44,118.
- **CLEAN TREE 0xED ORPHAN:** the `0xED`/SHDR-sensor-mode mechanism (PROBE-S7) has NO foothold in the tree. If a real sibling-root for #2, add it as a C5 #2-branch leaf or explicitly mark out-of-tree.
- DIRTY "same root as hdr_detected" → contradicts the tree's cautious "sibling of #2, conviction OPEN/CONFOUNDED."
- **NEW IN-TREE EVIDENCE POST-DATES BOTH EXAMINERS:** C5 SESSION FACT 2 (2026-06-13) + the doc-47 two-gates split shift the #2/#6 picture toward "SHDR-auto-exposure knob is NOT the lever; HDR runs via MFHDR/fusion." This weakens the E3-config root and tilts #6 toward C4 tag-publish.

### Revisit targets
1. **OEM-HANDLER TEST (decisive for #6 root):** on STOCK in a real HDR scene, run `observe_getmetadata.js` at the `parseTurboHdrInfo` getMetadata call to confirm the ~0x4d78 IPE RESULT tag is present (rc=0). Present-on-stock/absent-on-LOS → ROOT = C4 tag-publish; given SESSION FACT 2, demote the E3-config root. **Highest-value S6 probe.**
2. **8K (#8 sibling context):** #6 and #8 both route through C5 — run `dump_camxsettings.js` + `unclobber_camx_logs.js` on the SAME HDR scene; confirm whether the C3 `beforeConfigureStreamsLocked` hook is invoked (shared configure-time root candidate).
3. **JNI/OCS/framework tracing:** trace whether any LOS app/OCS-SDK/OEM-HAL default seeds the request-side OEM sensor-mode tag (`0xED`) and the IPE result-publish trigger; hook `VendorTagDescriptor` + `GetVendorTagId(0xED)` to NAME both tags (prediction: distinct).
4. **Trigger-and-verify the strlen null-guard end-to-end** before relying on the interim defense.
5. **E3↔C4 coupling test, NOW BOUNDED:** ship a functional txt with `selectSHDRAutoExposureUsecase=1` and re-run `observe_getmetadata.js` — but weight the expectation LOW (SESSION FACT 2 shows stock keeps the knob =0 in-scene). Tag still won't publish (likely) → ROOT stays C4; if it DOES → ROOT collapses to E3 and the hook can retire.
6. **Doc-hygiene:** reconcile 0x5880 → `setProcessOtherParams+140` / `+0x4d88`; ingest or out-of-tree-mark the `0xED`/PROBE-S7 sibling-root.

---

## SYMPTOM 7 — getOplusHardwareBuffer fallback / pool exhaustion

**Clean tree:** [`S7-getoplushardwarebuffer.md`](symptoms/S7-getoplushardwarebuffer.md), path [D3](data/D3-imagereader-hwbuffer.md) (proximate) → [E2](facilitation/E2-system-framework.md) (conditional facilitation root); characterization PARTIAL, **conviction REFUTED.**

### Established
- **The `nativeGetOplusHardwareBuffer` JNI bridge IS present and executing.** Triple-corroborated: E2 host symbol scan of built `libandroid_runtime.so` (2026-06-13, base/0001 applied, 9d03af1), doc-46 Addendum A, doc-43 live crash backtrace showing the JNI executing with the OCS "use getHardwareBuffer" fallback log **ABSENT.** D3: "bridge IS present+executing... does NOT fall back to AOSP getHardwareBuffer."
- **The AOSP-fallback framing is REFUTED at D3** for the preview path (the fallback code path is NEVER taken at runtime).
- **The HardwareBuffer / GraphicBufferWrapper leak is a SIDE-EFFECT, not the freeze root** ([R-07](REFUTED-LOG.md): freeze is preview DELIVERY starvation, callbacks=0). The CloseGuard flood is fatal in neither SDR nor HDR.
- **The freeze is preview-DELIVERY starvation (Gate B); capture/fusion is independent and ALIVE** ([R-08](REFUTED-LOG.md)). No-JPEG resolved via [R-06](REFUTED-LOG.md) (tag 120 PRESENT) and R-08, NOT via Midas/APS-NULL.
- **D3 is the proximate STALL SITE, not the root.** `ConsumerImpl.onPreviewReceived` gates on `mPreviewErrorCode/mFrameworkErrorCode`, NOT on `ApsResult.mMetadata`. The real edge is the skipped native `decMetaRefZeroToRemove` upcall, redirecting the freeze root to [C6](control/C6-aps-oemlayer.md)/[D2](data/D2-hal-fill-aps.md).
- **The progressive "20-pool exhaust at ~frame 19" model is REFUTED on-device** (threshold-3 drain still froze ⇒ single-shot, not progressive). doc-44 re-scopes to OUTPUT-starvation.
- **The static-RE finding that the fallback is GRACEFUL/CORRECT survives at its narrow scope** (benign IF taken on stock .201 + OCS SDK). The live path does not take it ⇒ non-causal for the freeze.
- **Net S7 status: conviction REFUTED, characterization PARTIAL.** Only a narrow, conditional, host-confirmed-benign-but-runtime-DARK residual survives at E2.

### Refuted-or-overreach
- The cluster-A2 still-capture root ("cammidasservice unregistered → `gAPSOps.pfnAPSMemHWAcquire` NULL") → ORPHAN, mis-filed under S7. ZERO mentions of `pfnAPSMemHWAcquire`/cammidasservice/Midas in the interop-tree (the only surviving occurrence is an ANALOGY at doc-44 ~l.79). **Skeptic's kill HOLDS.**
- A4 "no JPEG = QCFA/remosaic-then-AutoHDR blocker" → SUPERSEDED ([R-08](REFUTED-LOG.md)).
- A4 "ncsUnreleased 16 offline-stream leak → −74 → watchdog SIGABRT; fix = app HDR session topology" → UNSUPPORTED; points at a DIFFERENT mechanism than the converged Gate-B root.
- **The A8 "PROVEN" label on the progressive-pool-drain chain → OVERSTATED.** The telemetry (NN OUTPUT ERROR + unclosed-buffer counts) is real, but the causal chain "leak → pool drains → BufferQueue stalls → freeze" is REFUTED on-device (single-shot) and closed by [R-07](REFUTED-LOG.md). **Down-grade A8-PROVEN to REFUTED-causal. The single biggest carry-forward hazard.**
- The full "AOSP getHardwareBuffer fallback → metadata-less buffer → NN OUTPUT ERROR → 20-deep pool exhaustion" chain as a PREVIEW-FREEZE ROOT → REFUTED.

### Questionable (live-open)
- **E2 bridge-effectiveness end-to-end (the ONLY conditional S7-as-root residual).** S7 holds as root iff base/0001 is NOT effective at runtime. Host symbol scan says base/0001 IS applied+effective (4/4 sha256-identical), but the native side is DARK: `nativeGetOplusHardwareBuffer` is PRESENT-confirmed, not REACHED-confirmed at runtime. Counter-flags: base/0001 9d03af14 runtime-unproven, libcsextimpl dropped d654641.
- The A→B link (Gate A → Gate B freeze): doc-47 marks it "plausible but UNPROVEN."
- The A8 hedged note "bridge gap matters only if the AOSP fallback handle lacks OnePlus gralloc metadata the NN expects" is correctly hedged — questionable-but-honest, the conditional E2 still carries.
- Whether the NN OUTPUT ERROR telemetry (v17, x1381) is a downstream symptom of Gate-B starvation vs an independent input-metadata defect is not disentangled.

### Gaps
- `nm -DC` symbol scan + RUNTIME-REACH confirmation of `libandroid_runtime.so` / `libcameraservice.so`, plus `probe_getoplushwbuffer.js` to count native-path vs catch/fallback hits — the decisive E2 probe (native side currently DARK).
- `probe_aec_hdrdetect.js`: force `*(aecCtx+0x48)` non-zero, observe whether preview un-freezes (collapses the A-vs-B link).
- `trace_preview_delivery.js` for the `onImageAvailable → addPreview → ImageBuffer` chain. CAVEAT (doc-43): prefer native `Interceptor.attach` on `decMetaRefZeroToRemove` over Java hooks (the hot getOplusHardwareBuffer path crashes ART GC under frida).
- Capture G4 working-state preview-delivery baseline (the freeze "denominator" was never captured).
- Verify live partitions match the intended build BEFORE re-attributing any S7 behavior (stale-partition caveat).
- OEM-handler test for the C6/D2 root: native trace of the input-buffer-return callback in `libAlgoProcess.so` (`pipelineDataCallback / packPreviewResult / this[0xab]` output, `releaseBuffer 0x1af144`, `dropProcessData 0x1aecd4`).

### Contradictions with the clean tree
- A2 (Midas/pfnAPSMemHWAcquire still-capture root) → CONTRADICTS the tree (asserts a convicted root from a node-set that does not exist anywhere; the only surviving occurrence is an explicit analogy).
- A8 "PROVEN" progressive-pool-drain → CONTRADICTS D3 (single-shot) and [R-07](REFUTED-LOG.md).
- A4 "no JPEG = QCFA/AutoHDR blocker" → CONTRADICTS [R-08](REFUTED-LOG.md).
- A4 "fix = HDR session topology / ncs-leak" → CONTRADICTS the converged Gate-B → C6/D2 root.
- **NO dirty note establishes a NEW fact that contradicts the tree's surviving spine** — every contradiction is a dirty note the tree has already overruled.

### Revisit targets
1. **E2 CLOSER (highest priority):** `nm -DC` symbol scan of the as-shipped libs to confirm `nativeGetOplusHardwareBuffer` is exported AND JNI-registered, then `probe_getoplushwbuffer.js` (Java-side hook) to count native-path vs fallback on a live preview session. Present+reached → E2 benign, S7 fully REFUTED, **stop chasing S7**; absent/not-reached → E2 is root, re-apply/rebuild base/0001 (check dropped libcsextimpl d654641).
2. **8K / high-res mode:** re-run the getOplusHardwareBuffer + preview-delivery trace in 8K (20-deep pool / single-shot stall may behave differently at 8K sizes/strides).
3. **JNI/OCS/framework trace of the REAL root (C6/D2):** native `Interceptor.attach` on `APSClient$MetaImageRefCounter.decMetaRefZeroToRemove(J,I,I)` and the libAlgoProcess input-return path. Prefer native attach over Java hooks (ART GC crash, doc-43).
4. **OEM-handler test for the A→B link:** `probe_aec_hdrdetect.js` force `*(aecCtx+0x48)` non-zero; observe whether enabling hdr_detected un-freezes preview.
5. **Capture G4 working-state baseline** so the freeze is diffed against a real delivery denominator.
6. **Build-fingerprint verification** before re-attributing any S7 behavior.
7. **Explicitly RE-LABEL before any revisit:** A8-"PROVEN" → REFUTED-causal; A2 (Midas) → ORPHAN/mis-filed; A4 (QCFA-AutoHDR + ncs-leak) → SUPERSEDED. Carry forward only the three honest findings (graceful-fallback static benign; no-throw/executes-into-JNI; the two zero-grep-hit meta-findings).

---

## SYMPTOM 8 — 8K video configure_streams(0x80a9) −38

**Clean tree:** [`S8-8k.md`](symptoms/S8-8k.md) (labeled BAD_VALUE) / doc-35 (INTERNAL_ERROR / −38). Crash site [C5](control/C5-camx-chi-feature2.md)/feature2; **root OPEN** (two parallel candidates: C3/[E2](facilitation/E2-system-framework.md) hook vs [D1](data/D1-gralloc-camxformat.md) Gralloc5).

### Established
- **CRASH MECHANISM PROVEN (verbatim across docs):** 8K 0x80a9 EISv2 node wired 2-in/0-out → "pure bypass" (`camxchinodesstabrealt.cpp:779`, trace L498) → `chxpipeline.cpp:602` NULL pipeline handle → `chifeature2base.cpp:15188 CreatePipeline OplusOfflineReprocess descriptor failed` → `chifeature2graphmanager Init Error 1` → configure_streams −38. The 2-in/0-out frida port-dump (numInputPorts=2 numOutputPorts=0) is confirmed.
- **CRASH SITE = C5/feature2, NOT a blob edit.** Every static topology input is byte-identical OOS↔LOS (`CameraHWConfiguration.config` incl. Mode[4]=0x80A9, eisModeTable[2] Super_EIS_8K; sensor bins; `eis_camera.vcfg`; `OplusOfflineReprocess.json`; all feature2/EIS libs).
- **EIS-DISABLE IS AN INVALID WORKAROUND.** Changing Mode[4]/eisModeTable[2] 0x80A9→0xFFFF SIGSEGVs configure_streams at NULL+0x44 — the graph forces the 8K EIS node regardless of the enable flag. **Fix locus is the stream→port mapping, not the EIS-enable flag.**
- **FIX LOCUS = runtime stream→port resolution / StreamSet shaping** for the 8K OplusOfflineReprocess usecase. The 7680×4320 video OUTPUT stream (fmt 0x22, usage 0x10010300) the EISv2 output port should bind to is absent or mis-typed on LOS; 4K works because its EIS graph resolves a matching output port. (LOCUS only; root OPEN.)
- **IDENTITY-GATE CANDIDATE REFUTED-as-cause is established:** `com.oplus.packageName` IS absent at the 8K configure BUT `VideoMode.useOplusCameraCase()` returns true so IS_OPLUS_PACKAGE is stamped regardless; failure is downstream at port-count ([R-09](REFUTED-LOG.md)).
- **WORKAROUNDS correctly characterized, neither fixes 8K:** (A) `AllowOplusHealthMoniterAbort=FALSE` silences the downstream ncsUnreleased 16 watchdog SIGABRT; (B) drop the 7680×4320 EncoderProfile from media_profiles so the picker never offers 8K. Both "stability only, not baseline."

### Refuted-or-overreach
- "-ENOSYS / Function not implemented (-38)" error-code framing → REFUTED (ZERO grep hits for "function not implemented"/"ENOSYS" across rearch/ AND interop-tree/; the string exists only in dirty A7). The trace shows op_mode 0x80a9 is RECOGNIZED and fails DOWNSTREAM at port-count — a pipeline-BUILD failure, not a capability rejection. The ENOSYS gloss is a strerror coincidence.
- Op-mode 0x8001 and 0x8009 findings as part of SYMPTOM 8 → REFUTED as a confound (0x8001/0x8009 appear ONLY in doc-45 AEC/HDR photo path, NEVER in any 8K file; 0x8001 is non-divergent photo/SAT family with an 8192×6144 RAW set). **Firewall from S8.**
- "8K −38 ROOT NAMED" → REFUTED as overreach (the word ROOT, not the port-count fact). doc-48 §5: "this is a hypothesis with strong mechanistic support, NOT proven." S8 leaf: characterization UNCHARACTERIZED / conviction OPEN.
- The ncsUnreleased-16 gyro-leak causal chain as "proven" → REFUTED as unverified elevation (ONLY surviving mention is the doc-35 L92-93 workaround knob; the detailed chain — gyro subscribe → StopNCS never called → SIGABRT, 5 tombstones, Ghidra `m_allowSignalAbort@0x1c034` — is ABSENT from the curated tree). **The tree carries only the workaround knob.**

### Questionable (live-open)
- **ROOT CAUSE (the cause of the missing EISv2 output port) — genuinely OPEN, two parallel candidates, NO observed edge.** (1) C3/E2 PROXIMATE-UPSTREAM: LOS lacks Depth-2 `beforeConfigureStreamsLocked` StreamSet-mutation + `getExtensionOperatingMode` hooks (libcsextimpl dropped d654641, 0 call sites). C3 conviction = SUPPORTED, NOT CONVICTED. (2) D1 parallel root: Gralloc5 stream-usage resolution — if 100xx/Depth-2 is answered yet the 7680×4320 stream stays mis-typed, #8 falls to D1 usage-bit resolution. D1 conviction BLOCKED behind freeze #1.
- The dirty "recurring metadata / vendor-tag-not-populated root" inference — plausible but unverified (doc-35 frames it as one of two HYPOTHESIS candidates).
- **BAD_VALUE vs INTERNAL_ERROR label — UNRESOLVED at the primary-evidence level (but for a corrected reason).** "BAD_VALUE" appears ONLY in S8; "INTERNAL_ERROR" ONLY in doc-35. CORRECTION (verified 2026-06-13): the cited oracle trace EXISTS — `op15-camera-porting/docs/rearch/8k-configure-38-declobbered-trace.log` (515 lines, the dirty-corpus path doc-35 references; it is NOT under `oplus-final/docs/rearch/`). The file is NOT missing; it simply does **not log the numeric return constant** — it ends at `camxhal3.cpp:1982 configure_streams() HalOp: End CONFIG` after the EISv2-pure-bypass → `chxpipeline.cpp:602` NULL-pipeline → `chifeature2base.cpp:15188` descriptor-failed → `chifeature2graphmanager.cpp:527 Initialize() Error: 1` chain, with no `-38`/`BAD_VALUE`/`INTERNAL_ERROR`/`rc=` line. So NEITHER label is primary-sourced **because the trace doesn't print the constant**, not because the trace is absent. **The verdict stands (returned constant unconfirmed); only the "file missing" reason was wrong.**
- WORKAROUND-B "infinite crash-loop until pm clear" — plausible but downstream of the unverified ncsUnreleased chain.

### Gaps
- **The declobbered 8K trace oracle file EXISTS but does NOT log the returned constant.** Located at `op15-camera-porting/docs/rearch/8k-configure-38-declobbered-trace.log` (515 lines; dirty corpus, NOT `oplus-final/docs/rearch/`). It carries the full configure_streams chain (op_mode 0x80a9 → streamclassifier → EISv2 pure-bypass → NULL pipeline → chifeature2 descriptor-fail → graphmanager Error 1 → HalOp End CONFIG) but no `-38`/BAD_VALUE/INTERNAL_ERROR/rc= line. To settle BAD_VALUE-vs-INTERNAL_ERROR, a NEW capture that logs the configure_streams return value is needed (the existing oracle cannot, by its content, settle it).
- No OOS↔LOS runtime A/B has been run for 8K (the decisive edge between C3/E2 and D1 is unobserved, LOS-deferred behind freeze #1). `hook_configure_streams.js` (8K vs 4K, dumping `camera3_stream_configuration`) would name whether the 7680×4320 OUTPUT stream is absent/mis-typed BEFORE the graph builder.
- `r4-oem-transact` not run (whether LOS returns UNKNOWN_TRANSACTION on OEM 100xx codes while the SDK believes `mRemote != null`).
- The missing oracle half: a STOCK declobbered 8K trace (does stock ALSO log "pure bypass" yet succeed?). All three runtime probes depend on `tools/patch_chi_logclobber.py` (4 offsets valid on V16.1.0; CamX-tag patch #4 mandatory).
- Whether `beforeConfigureStreamsLocked` is actually what binds the EIS output stream on stock is UNCONFIRMED (doc-48 §5 flags this as the explicit "must be confirmed").

### Contradictions with the clean tree
- DIRTY "-ENOSYS / Function not implemented" → tree contains ZERO such strings; the ENOSYS reading directly contradicts the tree's build-failure mechanism.
- DIRTY files op-mode 0x8001/0x8009 (photo-SAT RAW set) under S8 → tree is emphatic #8 is exclusively 0x80a9 (7680×4320 video). Symptom-family confound.
- DIRTY A8 "8K −38 ROOT NAMED" proven → contradicts S8 OPEN/UNCHARACTERIZED + doc-48 §5 "NOT proven."
- DIRTY A8 presents the ncsUnreleased gyro-leak chain as proven → tree carries NONE of this mechanism, only the `AllowOplusHealthMoniterAbort=FALSE` knob.
- **NO contradictions on the REFUTED items:** dirty A8's three refutations (IS_OPLUS_PACKAGE not the cause; static-config/blob/identity not the root; EIS-disable Mode[4]=0xFFFF invalid) all MATCH the tree. The CHI log-clobber RE is self-labeled "superseded" and consistent with the corrected 4-offset set (#4 0x151c4, #2 0x4ab6f8, #1 0x4000c, #3 0x41a18) — cite `tools/patch_chi_logclobber.py`, not the retired note.

### Revisit targets
1. **8K capture (gated behind freeze #1 — unfreeze first):** `hook_configure_streams.js` capturing `camera3_stream_configuration` for an 8K (0x80a9) session vs a working 4K session — dump num_streams + each stream's type/WxH/format/usage/dataspace. The diff names whether the 7680×4320 OUTPUT stream is absent/mis-typed. **Decisive for C3/E2-vs-D1.**
2. **OEM-handler testing:** `tools/observability/r4-oem-transact/` (presence + trace + run + parse, both sides) to confirm whether codes 10000-10022 (esp. 10016 SET_IS_CAMERA_UNIT_SESSION, 10015 SEND_OPLUS_EXT_CAM_CMD) are SERVICED vs UNKNOWN_TRANSACTION. Verdict logic: 100xx UNKNOWN AND EISv2 lacks output port → root C3/E2; 100xx answered but stream mis-typed → root D1.
3. **JNI/OCS/framework tracing:** hook the OCS VideoMode 8K stream-setup path (`getSurfaceSize / getSurfaceUseCase`) in `com.oplus.camera.unit.sdk.jar` + OplusCamera.apk — pin whether the divergence is app-side (OCS hands a different stream list) or provider-side (graph port-map).
4. **Stock declobbered 8K trace (the missing oracle half):** apply `tools/patch_chi_logclobber.py` on STOCK and capture an 8K configure. Also re-capture/recover the missing `8k-configure-38-declobbered-trace.log` to settle the BAD_VALUE-vs-INTERNAL_ERROR question from primary evidence.
5. **OEM-handler / Depth-2 confirmation:** once libcsextimpl is re-added (reverse d654641), trace whether `CameraServiceExtImpl::beforeConfigureStreamsLocked` and `getExtensionOperatingMode` fire at configure and bind/retype the 8K EIS output stream (the doc-48 §5 "must be confirmed" item that lifts C3 SUPPORTED→CONVICTED). **Keep 0x8001/0x8009 photo-SAT and ncsUnreleased gyro threads OUT of S8 work.**

---

## CROSS-CUTTING (facilitation: stubs / framework edits / toggles / sepolicy-namespace / identity)

**Clean tree:** INDEX axiom + [REFUTED-LOG](REFUTED-LOG.md) R-01..R-09 + [DODGE-VS-DIRTY](DODGE-VS-DIRTY.md) + facilitation [E1](facilitation/E1-stubs.md)–[E4](facilitation/E4-sepolicy-namespace.md) + docs 42/45/46/47/48 + OOS-BASELINE-V16.1.0.

### Established
- **BINDER PROTOCOL:** `OplusCameraManager` is a real client-side binder bridge, codes 10000-10022 on `media.camera` / descriptor `android.hardware.camera`. CLIENT-side reality only.
- **MISSING OEM EXT LAYER (G5) IS A REAL, CONVICTED GAP:** frameworks/av source has 0 `CameraServiceExt`/csextimpl call sites; built cameraserver (4MB) carries 0 ext/identity strings; `libcsextimpl.so` dropped (d654641), absent from the whole out tree. **[E2](facilitation/E2-system-framework.md) CONVICTED / high.** Its real load is zoom (Depth-1) + 8K stream-shaping (Depth-2), NOT no-JPEG/identity.
- **base/0001 JNI bridge (`nativeGetOplusHardwareBuffer`) IS applied + effective** (in frameworks/base source AND built libandroid_runtime.so). Symptom #7 "bridge absent" REFUTED.
- **`OplusEdrUtils` is a live prop-reader but a no-op for the actual EDR/SurfaceControl path.** EDR is display-plane not capture-plane. Necessary-but-insufficient.
- **AutoHDR-deciding blobs are byte-identical stock↔LOS.** Divergence is a RUNTIME INPUT, not a blob (trunk axiom).
- **THE `+0x6a28/+0x6a18` SHDR LEVER IS ON-DEVICE PROVEN AS A LEVER** (doc-45 FORCE-TEST: rc -2→0 PUBLISHED, GCVT→120 ~5500×). Publish + fusion share one lever (Root A). `+0x6a28` = `selectSHDRAutoExposureUsecase` (0xDC4EAFC3).
- **`camxoverridesettings.txt` with the functional SHDR key is shipped by NEITHER side** (dirty repo absent; our runtime overlay is LOGGING-MASK-ONLY). Correct form = an AUTHORED (not lifted) PRODUCT_COPY_FILES file gated on a stock dump.
- **TWO INDEPENDENT GATES, not one** (doc-47 AUTHORITATIVE): Gate A = HDR/exposure (does NOT block capture); Gate B = app-side preview-frame delivery starvation (the freeze).
- **APP-SIDE STREAM CONFIG IS CORRECT** (`isSystemCamera()=='com.oplus.camera'` → PICTURE_METADATA stream configured).
- **SEPOLICY IS NOT THE DATA-PLANE / no-JPEG ROOT** (decisive measurements were Permissive; LaneA is ship-hygiene).
- **P010 NAMESPACE THEORIES ARE CLOSED** ([R-01](REFUTED-LOG.md)..[R-05](REFUTED-LOG.md) + [E4](facilitation/E4-sepolicy-namespace.md)); #5 re-homes at D1 consumer-side lock-math.
- **OPERATIONAL/TEST-HARNESS FACTS:** dual-vendor-checkout discipline (build tree = 1vivy/android lineage vendor, not the koaaN/dodge clone); shutter is OCS-SDK→APS not camera2; injected touch filtered; device fragility; launch-crash MediaCodec SIGSEGV cleared by reboot. Stale-partition caveat upheld.

### Refuted-or-overreach
- **IDENTITY-RELAY-AS-ROOT (the entire dirty A2 cluster):** `com.oplus.packageName → CameraAPPType → fusion-gated → GCVT 0 → no JPEG`, plus the SHIPPABLE-FIX to inject packageName at configure_streams → REFUTED by [R-09](REFUTED-LOG.md) / doc-47 / doc-48 (identity relay is the PERFORMANCE axis ONLY; OEM libcameraservice edits are identity-only, touch zero buffer/metadata contracts; stock fuses with `m_isCameraUint 0`). PROBE-R1d "UNIFIED ROOT" and PROBE-S7 #1 are the worst offenders. **DEAD.**
- **GCVT=0 / customVendorTag-120-missing AS THE no-JPEG ROOT** → REFUTED ([R-06](REFUTED-LOG.md)).
- **"hdr_detected / SHDR / AEC gate (+0x48) BLOCKS CAPTURE/JPEG"** (the doc-45-pre-correction ONE-GATE unification) → REFUTED on-device ([R-08](REFUTED-LOG.md)). NOTE: the SHDR setting still legitimately gates HDR/exposure QUALITY and fusion-publish — only "blocks capture/JPEG" is refuted.
- **`DeferOfflineSessionThread / OplusSetAidlOfflineMeta` MUST FIRE** → REFUTED (both 0 on stock during real JPEG captures; fusion uses the FGM path).
- **`OplusFeatureConfigManager.hasFeature` GATES HDR** → self-refuted; the "APPLIED FIX" to OplusFeatureConfigManager is off-path.
- **Any P010 fix via getStub-flip / libui-steer / Gralloc4 passthrough / namespace grant** → REFUTED ([R-01](REFUTED-LOG.md)..[R-05](REFUTED-LOG.md) + [E4](facilitation/E4-sepolicy-namespace.md)).

### Questionable (live-open)
- **SHIPPABLE VALUE of `selectSHDRAutoExposureUsecase=1` (the single most consequential unresolved point).** OOS-BASELINE-V16.1.0 §4 (2026-06-13, NEWER than docs 45/47) finds that on STOCK V16.1.0 at idle/PHOTO, `selectSHDRAutoExposureUsecase` READS **0** — NOT 1 as the attribution matrix assumed (setHDRMode/setAutoHDRMode/enable3expSHDRSnapshot/selectedDCGMode/isSHDRFusionOffline also read 0 at idle). **The lever is PROVEN-when-forced but is NOT a static stock default; stock likely sets it dynamically during an HDR session.** The "stock ships it, LOS doesn't" static divergence is UNCONFIRMED. ⇒ The LEVER crosses the established line; the AUTHORED-FILE FIX does NOT yet (we don't know the static value to write).
- Exact NAME of `+0x6a18` (NOT name-pinned; strongest candidate `setAutoHDRMode` 0xA49DE767). Whether `+0x6a28` alone suffices or `+0x6a18` is also required is OPEN.
- **SERVER-SIDE servicing of OEM transactions 10000-10022 is confounded:** client bridge is real, but the receiver (libcsextimpl) is genuinely MISSING ⇒ transactions silently return UNKNOWN_TRANSACTION while `mRemote != null`. Even if re-added, [R-09](REFUTED-LOG.md) says the identity sliver is off the JPEG path (real value = zoom + 8K).
- **Gate B (preview-freeze) ROOT** is a SEPARATE app-render-path root (frozen WITH hdr_detected rc=0 + fusion engaged; colorMode 0, hdrSdrRatio NaN). The dirty A2 metadata-starvation H2/H3/H4 hypotheses need re-grounding against the render path.
- 8K configure_streams −38 (#8) — doc-48 `beforeConfigureStreamsLocked` Depth-2 hypothesis is "strong mechanistic, NOT proven."
- Over-exposure (#3) native depth — the real depth is the missing native EDR ABI (`setEdrSdrRatio/setEdrViewTransform`) that AOSP/LOS does not export AND dodge does NOT donate. The dirty "SMOKING GUN" framing for the 8 HDR/EDR props is overreach.

### Gaps
- **`WriteCamxSettingsToFile` stock↔LOS diff IN AN HDR SCENE (not idle):** `dump_camxsettings.js` on stock during an actual HDR snapshot to (a) settle whether stock dynamically flips `selectSHDRAutoExposureUsecase/+0x6a18` to 1, and (b) name `+0x6a18` exactly + enumerate the HDR/SHDR settings that are 1-on-stock/0-on-LOS. **This single capture converts the proven LEVER into a known SHIPPABLE FILE.**
- Author + ship `/vendor/etc/camera/camxoverridesettings.txt` (PRODUCT_COPY_FILES), then re-run `observe_getmetadata.js` (rc) + hook_gcvt (120) on a CLEAN-BOOT build.
- `probe_aec_hdrdetect.js` + screencap A/B on a STABLE session to settle Gate A→Gate B independence definitively.
- Apply patch-dodge `frameworks/av/0001` to infiniti + reverse d654641 (re-add libcsextimpl), rebuild, re-scan cameraserver for `CameraServiceExt*`, then `hook_configure_streams.js` / r4-oem-transact for the 8K −38 Depth-2 hypothesis.
- Verify live partitions match the build fingerprint before attributing any residual symptom to source.
- App render-path trace for Gate B (ImageReader/GL/SurfaceView, VRR/FRTC, EDR display caps — currently the weakest-mapped node).

### Contradictions with the clean tree
- Dirty A2/A1 "first-party identity relay gates JPEG/metadata" → CONTRADICTS [R-09](REFUTED-LOG.md). Several dirty claims keep this at `note_status:open` while the dirty corpus's OWN E-oemlayer-packagename-RE marked it REFUTED (internal dirty self-contradiction the tree resolves against the open notes).
- Dirty A2 "GCVT=0 kills the metadata chain" → CONTRADICTS [R-06](REFUTED-LOG.md).
- Dirty A4 treats the frameworks/av relay only as something to REFUTE and concludes it is closed/benign; the tree CONTRADICTS completeness: **[E2](facilitation/E2-system-framework.md) CONVICTED that av/0001 was NEVER APPLIED** (apply-state defect making the whole CameraServiceExt layer genuinely missing — root for #8, contributes #4). Dirty correctly refuted relay-as-JPEG-cause but NEVER discovered the apply-state defect.
- Dirty A4/A6 SELinux "proven" claims describe a DIFFERENT, OLDER snapshot than the current [E4](facilitation/E4-sepolicy-namespace.md) ledger (vendor/opluscamera_app.te md5 81296e45 adds `hal_camera_client`, DROPS xdsp chr_file rw). Conclusion (sepolicy != data-plane root) still agrees.
- Dirty "OplusCameraManager bridge is NOT a no-op (proven)" → CONTRADICTS the end-to-end reality (the SERVER receiver is missing → UNKNOWN_TRANSACTION). True client-side, false end-to-end.
- **OOS-BASELINE-V16.1.0 §4 (newest) partially-contradicts the confident "selectSHDRAutoExposureUsecase=1 shipped by NEITHER side" static-divergence framing:** on stock it reads 0 at idle, so the static stock-default assumption is wrong — it is dynamically set in an HDR scene. The lever survives; the static-divergence claim does not (yet).

### Revisit targets
1. **8K (#8):** apply patch-dodge `frameworks/av/0001` to infiniti + reverse d654641 (re-add libcsextimpl.so), rebuild, re-scan cameraserver for `CameraServiceExt*`/`beforeConfigureStreamsLocked`; then `hook_configure_streams.js` / r4-oem-transact OOS↔LOS A/B + `hook_eisv2_ports.js`. **The correct home for the dirty "missing structural gap" intuition (zoom + 8K, NOT identity-JPEG).**
2. **JNI/OCS/framework tracing:** base/0001 is APPLIED+EFFECTIVE so #7 "bridge absent" is refuted — trace #7's TRUE root DOWNSTREAM via `probe_getoplushwbuffer.js` + the native `decMetaRefZeroToRemove` upcall (C6/D2). Confirm no silent UNKNOWN_TRANSACTION on 10000-10022 is the proximate stall.
3. **OEM-handler testing:** stand up `r4-oem-transact` (hook `media.camera` onTransact) on stock-vs-LOS to observe whether 10000-10022 are SERVICED (OOS, 4 mappings) vs UNKNOWN_TRANSACTION (LOS, receiver dropped). Convicts/clears the missing-receiver root for #8/#4 without attributing it to identity.
4. **SHDR ROOT-A (highest ROI):** `dump_camxsettings.js` on STOCK DURING AN HDR-TRIGGERING SCENE (not idle) to settle whether stock dynamically flips `selectSHDRAutoExposureUsecase/+0x6a18` and to name `+0x6a18`; diff against LOS. THEN author the txt + re-run `observe_getmetadata.js` + hook_gcvt on a clean-boot build. **The gating capture that turns the proven lever into a shipped fix.**
5. **Gate A vs Gate B independence:** `probe_aec_hdrdetect.js` + screencap A/B; if preview stays frozen with rc=0 + fusion engaged, pivot the freeze workstream entirely to the app render path.
6. **Hygiene gate before any attribution:** verify live partition build fingerprint; re-confirm the current sepolicy state (vendor/opluscamera_app.te md5 81296e45 + mac_permissions.xml + platform_app.te) rather than the older dirty "proven" snapshot.

---

## CONTRADICTIONS WITH THE CLEAN INTEROP-TREE (consolidated — highest-value to resolve)

These are the points where the dirty notes and the clean tree actually disagree. Two are **doc bugs in the clean tree** (the tree is wrong); the rest are dirty overreach the tree already overruled. Resolve in priority order.

| # | Disagreement | Dirty says | Clean tree says | Adjudication | Action |
|---|--------------|-----------|-----------------|--------------|--------|
| **X1** | **S6 crash-site offset** | `setProcessOtherParams+140 = 0x1441ad4`, field `+0x4d88`, base tag ~0x4d78 (disasm + tombstone_32) | "SIGSEGV at TurboRaw+0x5880" (S6:17, C4:44/118) | **Dirty is CORRECT — tree doc bug.** 0x5880 has no disasm provenance; doc-28:238-241 (`op15-camera-porting`) proves it "incorrect." | **APPLIED 2026-06-13:** patched `0x5880 → setProcessOtherParams+140 (0x1441ad4)` / field `+0x4d88` in [S6](symptoms/S6-strlennull.md):17 and [C4](control/C4-hal-provider.md):44, 53-54, 117-118. |
| **X2** | **S8 returned constant** | (not load-bearing) | BAD_VALUE (S8) vs INTERNAL_ERROR (doc-35) — internal disagreement | **Unconfirmed but trace EXISTS (corrected 2026-06-13):** oracle `op15-camera-porting/docs/rearch/8k-configure-38-declobbered-trace.log` (515 lines) is present — it just does NOT print the numeric return constant. Verdict stands; "file missing" was wrong. | Flag [S8](symptoms/S8-8k.md) as "returned constant unconfirmed (oracle trace exists but does not log the constant)"; a NEW capture logging the configure_streams return value is required. |
| **X3** | **av/0001 apply-state (#8/#4)** | frameworks/av relay is closed/benign; refuted as a JPEG cause | **[E2](facilitation/E2-system-framework.md) CONVICTED: av/0001 was NEVER APPLIED → the whole CameraServiceExt layer is genuinely missing** (root for #8, contributes #4) | **Tree found a gap the dirty notes missed.** Dirty correctly refuted relay-as-JPEG but never discovered the apply-state defect. | Apply patch-dodge av/0001 + reverse d654641; re-scan cameraserver. |
| **X4** | **SHDR static divergence** | "selectSHDRAutoExposureUsecase=1 shipped by NEITHER side" (assumes stock default=1) | OOS-BASELINE §4: stock reads **0 at idle** — dynamically set in an HDR scene | **Newest evidence sides against the static-divergence framing.** Lever survives; static stock-default assumption is wrong. | `dump_camxsettings.js` on stock in a REAL HDR scene before authoring the txt. |
| **X5** | **Identity-relay as root** | `com.oplus.packageName → no JPEG` (PROBE-R1d UNIFIED ROOT, kept `open`) | [R-09](REFUTED-LOG.md): identity = performance axis only | **Tree correct; dirty self-contradicts** (its own E-oemlayer RE marked it refuted). | Stop chasing; close the open dirty rows. |
| **X6** | **GCVT=0 / tag-120 no-JPEG** | GCVT=0 kills the metadata chain | [R-06](REFUTED-LOG.md): customVendorTag 120 PRESENT in v19 logs | **Tree correct.** | Do not re-chase. |
| **X7** | **One-gate unification** | hdr_detected/AEC gate blocks JPEG/capture/freeze | [R-08](REFUTED-LOG.md): two independent gates; fusion runs at captureHDR:0 | **Tree correct.** | Keep Gate A / Gate B separate everywhere. |
| **X8** | **P010 window policy** | on-device-VALIDATED WIDEN to `[0x60,0x7f]` + commit `f3f372e` + min(plane-diff,height) geometry patch | NARROW `[0x70,0x7f]`; no f3f372e, no geometry formula, no on-device validation record | **Tree correct (dirty unverifiable).** Notes pinned to a pre-doc-42 state. | Do NOT promote the widen/geometry-patch; mirror `[0x70,0x7f]`. |
| **X9** | **A8 "PROVEN" causal roots** | progressive pool-drain (#7), DeferJob copies-after-recycle (#4), 8K ROOT NAMED (#8), ncs gyro-leak chain (#8), matched-set BuildID (#4) | single-shot ([R-07](REFUTED-LOG.md)/D3); S4/S8 conviction OPEN; identical-blob axiom | **Tree correct — every "PROVEN" causal ROOT label is overreach.** Crash-SITES are proven; root-attribution is OPEN. | Demote all to LEADING-HYPOTHESIS before any revisit. |
| **X10** | **Symptom mis-filing** | A1-shdr-autohdr cluster (12-15) under #3; Midas/gAPSOps under #7; 0x8001/0x8009 + 0xED under #8/#6; A2 PICTURE_METADATA under #1 | INDEX symptom→path map partitions these to #2 (SHDR), orphan/analogy (Midas), photo-SAT family (0x8001), snapshot lane (A2) | **Tree correct.** These are real RE work filed under the wrong symptom. | Relabel to the correct symptom; do not count toward the host symptom. |

**Priority:** X1 + X2 (tree doc bugs/missing oracle — fix the record) → X3 + X4 (newest evidence shifts the live plan) → X5–X10 (dead branches to keep closed).

---

## REVISIT CHECKLIST (concrete probes mapped to symptoms)

### A. UNFREEZE PREREQUISITE (gates #4, #5, #8 runtime A/Bs)
- [ ] **Capture the G4 working-state baseline** (`capture/ab_capture.sh`, `debug/10_runtime_debug.sh`) — the freeze "denominator." Blocks #1, #4 (D2), #5 (r3), #8 (configure A/B). _(#1, #4, #5, #8)_
- [ ] **`probe_aec_hdrdetect.js`** force `*(aecCtx+0x48)` non-zero + screencap A/B on a stable session — doc-47's single decisive Gate-A-vs-B action. Predicted to CLOSE the A→B question, not open a root. _(#1, #2, #5, #7)_

### B. 8K (#8)
- [ ] **`hook_configure_streams.js`** — dump `camera3_stream_configuration` (num_streams + per-stream type/WxH/format/usage/dataspace) for 8K (0x80a9) vs working 4K. Names whether the 7680×4320 OUTPUT stream (fmt 0x22, usage 0x10010300) is absent/mis-typed. Decisive for C3/E2-vs-D1.
- [ ] **Stock declobbered 8K trace** — apply `tools/patch_chi_logclobber.py` (4 offsets: #4 0x151c4, #2 0x4ab6f8, #1 0x4000c, #3 0x41a18; CamX-tag patch #4 mandatory) on STOCK; does stock ALSO "pure bypass" yet succeed? The LOS oracle `op15-camera-porting/docs/rearch/8k-configure-38-declobbered-trace.log` (515 lines) EXISTS but does not print the configure_streams return constant — a NEW capture that logs the return value is what settles X2 (BAD_VALUE vs INTERNAL_ERROR).
- [ ] Keep `0x8001/0x8009` photo-SAT and the ncsUnreleased gyro thread OUT of S8 work.

### C. JNI / native tracing (prefer native `Interceptor.attach` — the hot getOplusHardwareBuffer path crashes ART GC under frida-Java, doc-43)
- [ ] **`decMetaRefZeroToRemove`** native upcall — confirm per-frame on a working baseline, never on LOS (the C6/D2 freeze root). _(#1, #7)_
- [ ] **`pipelineDataCallback`** (+0x1a9dd4) statusByte (x0) for frame 1 — handler-halt vs malformed-content discriminator. _(#1)_
- [ ] **`copyMetadata` GOT guard DISABLED + `ab_capture burst` + `parse_tombstone.py`** — confirm `copyMetadata+60` fault PC and the freed-allocation OWNER (settles C3 vs C4). Re-resolve `DeferJob::startCapture` LIVE (NOT 0x3c9abc, NOT 0x2d2c5c). _(#4)_
- [ ] **`readelf -n` + `nm`** on live `libAlgoProcess.so` — re-confirm on-disk BuildID 82fe443b (doc-25 already pins body 0x292960 / GOT 0x686ee8 on this blob via base arithmetic). `0x2982b8/0x3982b8` are the STOCK `e8e4317c` blob, NOT a rebase of 82fe443b — never a LOS hook target. _(#4)_
- [ ] **`trace_p010_planes.js`** (NATIVE-ONLY) — lock-reported aligned Cb (stride×1472) vs blob `getPlaneLayout` Cb (`align_up(luma,4GB)`); mirror apsfixup `[0x70,0x7f]` window (NOT dirty `[0x60,0x7f]`). _(#5)_

### D. OCS / app-layer tracing (`apk-re-jadx`: OplusCamera.apk + OCS SDK)
- [ ] **OCS VideoMode 8K stream-setup** (`getSurfaceSize / getSurfaceUseCase`) — does the OCS SDK hand a different `camera3_stream` list than stock? _(#8)_
- [ ] **`onPreviewReceived` (3c6730) >1× during freeze?** + `onPreviewMetaArrived` (3da42c) — native OUTPUT-starvation vs downstream GL break; proves app feed is complete. _(#1)_
- [ ] **`probe_getoplushwbuffer.js`** (Java-side hook) — count native-path vs catch/fallback hits on a live preview session. _(#7)_
- [ ] One-pass JNI/OCS trace to rule out a stale-flash regression hiding a CONFIGURE-time HDR path (`EnableAutoHDR`/`HDRMode`/`numHDRexposure`). _(#2)_

### E. Framework / SF tracing (build-only where noted)
- [ ] **eng SF build w/ LOG_NDEBUG 0 + ALOGV in the EDR path**, driven by an ACTUAL HDR scene — the G6 decisive probe. Zero EDR calls → root E1; calls land but panel bright → root E2 / display-HAL caps. _(#3)_
- [ ] **`dumpsys SurfaceFlinger | grep -iE 'supportedhdrtypes|hdrcapab'`** on LOS (read-only, no flash) — kill/confirm the panel HLG/PQ co-factor first. _(#3)_
- [ ] **Decompile the SF read side** (host RE): `OplusRequestedLayerState::{setExtendedRangeBrightness,setDesiredHdrHeadroom,setEdrMetadata}` + `OplusDolbyVision::setEDRStatus` — confirm `+0x0A0/bit63` + the 4×4 `OplusEdrViewTransform` matrix (closes the doc-49 write/read ABI pair). _(#3)_
- [ ] **C3 result-delivery trace:** `beforeMetadataSendToApp / returnOutputBuffers / sendCaptureResult` on LOS vs stock — the result-lifetime owner for the UAF. _(#4)_

### F. OEM-handler testing
- [ ] **`r4-oem-transact`** (hook `media.camera` onTransact, both sides) — are codes 10000-10022 (esp. 10016/10015) SERVICED on OOS vs UNKNOWN_TRANSACTION on LOS (libcsextimpl dropped)? Convicts/clears the missing-receiver root. _(#8, #4)_
- [ ] **Re-add `libcsextimpl.so` (reverse d654641) + apply av/0001**, rebuild, re-scan cameraserver for `CameraServiceExt*`; trace whether `beforeConfigureStreamsLocked` / `getExtensionOperatingMode` fire at configure and bind the 8K EIS output stream (doc-48 §5 "must be confirmed"). _(#8)_
- [ ] **`observe_getmetadata.js` on STOCK in a real HDR scene** — confirm the ~0x4d78 IPE TurboHDR RESULT tag is present (rc=0). Present-on-stock/absent-on-LOS → ROOT = C4 tag-publish (demote E3-config given SESSION FACT 2). _(#6)_

### G. SHDR root-A / config (highest ROI for #2)
- [ ] **`dump_camxsettings.js` on STOCK DURING AN HDR-TRIGGERING SCENE** (NOT idle) — read `+0x6a28` (`selectSHDRAutoExposureUsecase` 0xDC4EAFC3) / `+0x6a18`; name `+0x6a18` exactly; enumerate 1-on-stock/0-on-LOS keys. Decides E3 (static config ship) vs C3/C4 (configure-time session-typing). Settles X4. _(#2, #6)_
- [ ] **Author `/vendor/etc/camera/camxoverridesettings.txt`** (PRODUCT_COPY_FILES, minimal key set) AFTER the HDR-scene dump; re-run `observe_getmetadata.js` + hook_gcvt on a clean-boot build to confirm rc=-2→0 natively. _(#2, #6)_

### H. r3-gralloc / P010 (#5, after unfreeze)
- [ ] **`r3-gralloc 30_run_r3.sh los` + `parse_r3.py`** + `adb logcat | grep -iE 'Failed to link CamxFormatUtil|Unable to get IS_UBWC from snap'` in `com.oplus.camera`. Fallback fires → namespace root (revives [E4](facilitation/E4-sepolicy-namespace.md), log a new falsifier); absent → confirms D1 lock-math. Lifts D1 from BLOCKED/INFERRED to traced.

### I. Hygiene gates (before ANY attribution)
- [ ] **Verify live /system + /vendor partition fingerprint matches the intended build** (stale-partition caveat, doc-47 — no fingerprint was recoverable from v19 logs). _(all)_
- [ ] **Re-confirm current sepolicy state** (vendor/opluscamera_app.te md5 81296e45 + mac_permissions.xml + platform_app.te) rather than the older dirty "proven" snapshot. _(cross)_
- [ ] **RE-LABEL dirty notes before reuse:** A8-"PROVEN" → REFUTED-causal (#7); A2 (Midas/pfnAPSMemHWAcquire) → ORPHAN/mis-filed (#7); A4 (QCFA-AutoHDR + ncs-leak) → SUPERSEDED (#7); matched-set BuildID → refuted (#4). _(cross)_
- [x] **Fixed the two tree doc bugs (2026-06-13):** X1 (S6/C4 offset 0x5880 → `setProcessOtherParams+140`/`+0x4d88`) APPLIED; X2 (S8 returned-constant flag) APPLIED — S8 leaf now flags the constant unconfirmed and notes the oracle trace EXISTS (`op15-camera-porting/.../8k-configure-38-declobbered-trace.log`, 515 lines) but does not log the constant. _(#6, #8)_

---

## Companion ledgers
- [`INDEX.md`](INDEX.md) — the trunk + status dashboard + symptom→path map.
- [`REFUTED-LOG.md`](REFUTED-LOG.md) — dead-end ledger R-01..R-09 (keyed to node ids).
- [`DODGE-VS-DIRTY.md`](DODGE-VS-DIRTY.md) — facilitation oracle divergence ledger.
- Source rearch docs: 35, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49 (under `../rearch/`).
