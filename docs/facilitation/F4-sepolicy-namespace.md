<!-- STATUS: MIXED — inference-surgery applied 2026-06-14. Verified body = directly measured/observed facts
     (static dodge A/B on stock: grep-verified counts, md5-verified .te files, REFUTED falsifier for X4,
     lock geometry observed contiguous). All optimal-form verdicts, reduction-map retirement conclusions,
     and root/subsystem attributions moved to "Inferences & Open" below.
     Guard: a measured namespace-absence SITE is never a verified ROOT; "REFUTED" conviction = falsifier fired
     on host oracle, not a device runtime proof of the alternative root. -->
<!-- Parent: ./INDEX.md -->
<!-- Migrated + re-scoped from ../interop-tree/facilitation/E4-sepolicy-namespace.md (Phase-2 facilitation).
     E4 = "dodge-vs-dirty DIFF"; F4 = "requirements → mechanism → optimal-LOS-form".
     Front-matter verdicts/evidence carried forward verbatim; status model = ../interop-tree/SCHEMA.md (two axes). -->

---
node: F4
supersedes: E4
title: "sepolicy + linker namespace (public.libraries.txt · sphal · .te / file_contexts) — optimal LOS form"
plane: facilitation
partition: mixed                 # /vendor-config (public.libraries.txt, ld.config) + /vendor (sepolicy .te/file_contexts) + /odm (libapsfixup label)
blob_identical_oos_los: true     # mapper.qti.so / libgrallocutils.so / libcamxexternalformatutils.so all byte-identical
characterization: CHARACTERIZED  # dodge-oracle structural map complete: 12-lib public.libraries set + sepolicy form identified; reduction-map (POST-PROCESSING-CONTRACT) folded in
conviction: REFUTED              # falsifier fired: libcamxexternalformatutils ABSENT from every app-public public.libraries.txt yet dodge works ⇒ doc-42 §2.5 P010 namespace theory REFUTED (X4)
verdict: "KEEP the Treble-clean sepolicy + the IDENTICAL 12-lib public.libraries patch. P010 namespace theory REFUTED (X4: libcamxexternalformatutils ABSENT both sides yet dodge works ⇒ P010 resolves in sphal/same_process_hal_file, not app namespace; #5 re-homed at D1 lock-math). NEW: supersede the old 'keep libapsfixup as accepted defense' — the shim is 6 interposers/3 families; KEEP irreducible Family-I (P010/chroma geometry, rearch/14, no lever), RETIRE Family-II (copyMetadata null-guard — MASKS #4, root fix = R1 release-upcall, F2) and Family-III (TurboHDR strlen guard — root fix = R6 publish, F3). Shim shrinks to Family-I as the contract is satisfied at the root. Dodge ALSO ships libapsfixup ⇒ dodge has NOT done the root fix; we can do better."
confidence: high
owns_requirements: [X4, "libapsfixup-REDUCTION-MAP (POST-PROCESSING-CONTRACT.md)"]
symptoms: [5]                    # P010 / IMapper@4.0 NULL — F4 is the facilitation candidate-root, REFUTED at this layer
probes: [r3-gralloc, G5]
gaps: [G5]
dodge_ref: "dodge-camera-port/repos/proprietary_vendor_oneplus_sm8750-common/proprietary/vendor/etc/public.libraries.txt (22 lines = 10 base + 12 patch adds; libcamxexternalformatutils ABSENT — VERIFIED count=0); dodge-camera-port/repos/vendor_oplus_camera/sepolicy/ (vendor/opluscamera_app.te md5 5d5d515b… VERIFIED); dodge-camera-port/repos/android_device_qcom_sepolicy_vndr/generic/vendor/common/{file_contexts,domain.te}; dodge libapsfixup.so SHIPPED (line 22) ⇒ dodge did NOT root-fix"
los_ref: "vendor_oplus_camera/sepolicy/ (Treble-clean rewrite); op15-camera-porting/patches-crdroid/patch-dodge/device,oneplus,sm8750-common/{0001-public-libraries,0002-Label-libapsfixup.so}.patch; device,qcom,sepolicy_vndr,sm8750/{0001,0002}.patch"
upstream: [D1]                   # D1 gralloc/CamxFormatUtil is the data-plane site F4 facilitates
downstream: [D1, C4, F2, F3]     # F2 owns R1 (Family-II retire); F3 owns R6 (Family-III retire)
refuted_refs: [X4]
doc_refs: [doc-42, POST-PROCESSING-CONTRACT]
updated: 2026-06-14
---

# F4 — sepolicy + linker namespace (optimal LOS form)

**Migration note.** F4 supersedes E4. E4 answered *"where does our dirty diverge from the dodge oracle?"* (an 8-row
A/B). F4 answers *"for each owned REQUIREMENTS contract, what is the **optimal LOS form** of the fix, and does a
shipping reference **prove that form**?"* The CONVICTED/REFUTED/SUPPORTED facts are carried forward unchanged; the
framing turns from *diff* to *requirement → mechanism → optimal-LOS-form*. Two-axis status header retained:
**characterization: CHARACTERIZED · conviction: REFUTED** (the P010 namespace falsifier fired — that is a *success*,
not an incompleteness).

**One-liner.** F4 is the facilitation candidate-root for **#5 (P010 / non-contiguous lock)** under the doc-42 §2.5
"in-app namespace can't dlopen the camx plane authority" theory. The dodge oracle **REFUTES** that theory
(`libcamxexternalformatutils.so` exposed in **no** app-public `public.libraries.txt` — dodge's, ours, on-device —
yet dodge captures reliably). F4 owns two REQUIREMENTS items: **X4** (the REFUTED P010-namespace row) and the
**libapsfixup REDUCTION MAP** (POST-PROCESSING-CONTRACT.md). Carried-forward verdicts: KEEP the Treble-clean
sepolicy + the IDENTICAL 12-lib public.libraries patch; P010 → sphal namespace, re-homed at **D1**; supersede the
old "keep libapsfixup whole" verdict with **keep Family-I, retire Family-II/III**.

---

## (1) Carried-forward verdict + evidence (do not lose these)

| Fact (from E4 / X4 / oracle) | Status | Evidence anchor |
|---|---|---|
| `libcamxexternalformatutils.so` ABSENT from every app-public `public.libraries.txt` (dodge **and** ours **and** on-device) yet dodge captures reliably | **REFUTED** (falsifier fired) | dodge `proprietary/.../public.libraries.txt` = 22 lines, `grep camxexternalformat = 0` (VERIFIED this session); ours patch+dump = ABSENT; doc-42 §2.5 theory refuted ⇒ X4 |
| P010 plane-layout decode resolves in the **sphal / vendor same-process-HAL** namespace, NOT the app namespace | **SUPPORTED → root** | `file_contexts:353` → `libcamxexternalformatutils.so : same_process_hal_file:s0`; loads transitively via `mapper.qti.so → libgrallocutils.so (DT_NEEDED) → dlopen` (driven by `/vendor/etc/display/camera_alignments.json`) |
| #5 (P010 / IMapper@4.0 NULL) is **not** an F4 namespace grant; it re-homes at **D1** consumer-side lock-math | **REFUTED at F4 → BLOCKED at D1** | doc-42 §2 CORRECTION + EXHAUSTIVE VERDICT; lock OBSERVED contiguous `Cr−Y = stride×1472` (D1 §a); `getPlaneLayout` file `0x12127c` (armed, did not fire); BLOCKED behind freeze #1 |
| The 12-lib `public.libraries.txt` patch is **byte-identical** dodge↔ours | **CONVICTED (diff clean)** | dodge `…/0001-…public-libraries…patch` (5 arcsoft + 6 QNN + `libapsfixup.so`) = ours `op15-camera-porting/…/0001`; on dodge file lines 11–22 (VERIFIED) |
| The Treble-clean `vendor/opluscamera_app.te` rewrite (ours) is **functionally faithful** vs dodge's raw-find form | **SUPPORTED (improvement, not regression)** | dodge md5 `5d5d515b…` (VERIFIED; keeps `xdsp chr_file rw`, raw `find`); ours md5 `81296e45…` (adds `halclientdomain`+`hal_camera_client`, `binder_call(system_suspend)`, `dontaudit`+drops xdsp rw) — both grant offline-service reachability |
| `/odm/lib64/libapsfixup.so` needs **both** a `same_process_hal_file` label and a public.libraries entry | **CONVICTED** | label fixes `cameraserver avc denied {read}` on `vendor_file`; public.libraries entry fixes `vndksupport: … sphal … libapsfixup.so not found` dlopen-by-leaf |

> The whole carried evidence base is **static dodge A/B on stock** (G-SYM met for E-nodes per SCHEMA). The residual
> runtime confirm — does `com.oplus.camera` map the lib / does `"Failed to link CamxFormatUtil"` fire — is the **G5**
> gate, BLOCKED at runtime by freeze #1; the oracle already shows exposure is NOT what makes dodge work.

---

## (2) Per-requirement: contract → optimal LOS mechanism → dodge proof-of-form → LOS-confines weighting

F4 owns **X4** (one contract, REFUTED) and the **libapsfixup REDUCTION MAP** (three families = three contracts).
Each row states **(i)** the contract to satisfy, **(ii)** the optimal LOS mechanism, **(iii)** dodge as
proof-of-form (does a shipping reference prove the form exists/works?), **(iv)** the LOS-confines weighting.

### X4 — P010 namespace (the REFUTED row F4 owns)

- **(i) Contract.** `libcamxexternalformatutils.so` (the camx plane-layout authority for `getStandardMetadata(PLANE_LAYOUTS)` / `CamxFormatUtil_GetPlaneAlignment`) must be **reachable by the decode path** so the P010 lock returns a contiguous layout, not the `"Failed to link CamxFormatUtil"` generic fallback (→ D1).
- **(ii) Optimal LOS mechanism = sepolicy-namespace grant, NOT a public.libraries entry.** The lib must be a `same_process_hal_file:s0` on the **sphal/vendor** namespace search path; it then loads **transitively** (`mapper.qti.so → libgrallocutils.so DT_NEEDED → dlopen`, driven by `camera_alignments.json`). **Author-NEW public.libraries/ld.config grant for this lib = WRONG FORM** (the refuted lever) — it would expose to the app namespace a lib the app never dlopens by name.
- **(iii) Dodge proof-of-form = NEGATIVE (decisive).** Dodge's shipping `public.libraries.txt` (22 lines, VERIFIED) **does not list** `libcamxexternalformatutils` (`grep = 0`) — and dodge captures reliably. A shipping reference therefore **proves the public.libraries form is NOT needed**: the correct form is the existing `file_contexts:353` label resolving in sphal. *Falsifier fired ⇒ X4 REFUTED.*
- **(iv) LOS-confines weighting.** Treble-clean: ✔ (no new app-namespace exposure). Re-buildable: ✔ (the label already exists in the qcom vndr repo we patch). `system_ext` vs boot-jar: N/A (vendor-config + /vendor label). Author-new vs adopt: **ADOPT** (the label is inherited; **owe no new artifact**). → **Stop chasing a public.libraries/ld.config grant for `libcamxexternalformatutils`; re-home #5 at D1 lock-math.**

### Reduction-map Family-I — P010 / chroma geometry (the IRREDUCIBLE keep)

- **(i) Contract.** APS must lock the P010 buffer with the stock shape: `planeCount=1`, `pixStride=0`, `rowStride=5120`, `descriptor=0x0` (`trace_p010_planes.log`); chroma ptr = luma + `page_align(⅔·avail)`, `pitch[1]=pitch[0]` — the geometry the lock-math produces.
- **(ii) Optimal LOS mechanism = KEEP the `libapsfixup` Family-I interposers** (`p010LSB2MSBNeon` slot `0x689ba8`; `ARC_Turbo_RAW_Process`/`ARC_TFRSN_Process` dlsym). This is a **config/shim artifact**, minimal and irreducible — rearch/14: an OOS↔LOS lock-math divergence with **no upstream facilitation lever**. No stub/framework-patch/sepolicy form can satisfy it; the shim *is* the optimal form here.
- **(iii) Dodge proof-of-form = POSITIVE.** Dodge **also ships `libapsfixup.so`** (public.libraries line 22, VERIFIED). A shipping reference proves the geometry-defense form exists and works — but only for the geometry core (see Net, below).
- **(iv) LOS-confines weighting.** Treble-clean: ✔ (`/odm` shim, `same_process_hal_file` label). Re-buildable: ✔ (ships unstripped from in-tree source `apsfixup.cpp`). Author-new vs adopt: **KEEP (minimal)** — do not expand. This is the **only** residue once II/III retire.

### Reduction-map Family-II — metadata `copyMetadata` null-guard (RETIRE)

- **(i) Contract.** The metadata **lifetime** invariant: incref → `copyMetadata` → **per-frame native→Java release upcall** → bounded `metaBufferMap`. The guard (slot `0x686ee8`, body `+0x292960`) null-returns on a freed/insane source — it **MASKS #4 (UAF); it does not cause it**.
- **(ii) Optimal LOS mechanism = framework patch at the ROOT (NOT a shim guard).** Satisfy POST-PROCESSING-CONTRACT (b): reproduce stock's release upcall so the native `ApsCallbackMetaRefInc::callbackToCamUnit (UPCALL JNIAction=2 RELEASE)` lands at Java `APSClient$MetaImageRefCounter.decMetaRefZeroToRemove(JII)V`. This is **R1**, owned by **F2** (`/system` frameworks/base release bridge, `nativeGetOplusHardwareBuffer`-adjacent). One root fix retires **#1 freeze AND #4 UAF** — then the Family-II guard is **dead code**.
- **(iii) Dodge proof-of-form = NEGATIVE/INSTRUCTIVE.** Dodge **ships `libapsfixup` with this guard** (line 22) ⇒ **dodge did NOT do the root fix either** — it carries the mask. So dodge proves only the *mask* form, not the *root* form. **We can do better than the reference.** (`grep metaObjRef|MetaImageRef|decMetaRef|isInc|callbackToCamUnit` over the binary = **0** — the shim never touches lifetime, so it *cannot* be the break, only hide it.)
- **(iv) LOS-confines weighting.** Treble-clean: ✔ (`/system` framework patch). `system_ext` vs **boot-jar**: the release-receiver lands in frameworks/base (R1, F2). Author-new vs adopt: **AUTHOR-NEW root fix at F2 → then RETIRE the adopted guard.** Net risk: shim *sheds* an interposer.

### Reduction-map Family-III — TurboHDR `strlen` null-guard (RETIRE)

- **(i) Contract.** The OEM IPE TurboHDR vendor-tag (~`0x4d78`) must be **published into per-frame result metadata in an HDR scene**. Un-published ⇒ `TurboRaw::parseTurboHdrInfo` cbz-skips its store ⇒ `field_0x4d88` null ⇒ `setProcessOtherParams+140 strlen(null)` SIGSEGV (#6). Guard at slot `0x1bb6888` does `strlen(null)→0`.
- **(ii) Optimal LOS mechanism = config artifact at the ROOT (HDR-session-state / vendor-tag publish), NOT a shim guard.** Publish the TurboHDR tag in-scene — **R6**, owned by **F3** (same HDR-session-state class as R5; `camxoverridesettings.txt` / HDR session typing). Then `parseTurboHdrInfo` stores, `field_0x4d88` is non-null, the guard is **dead code**.
- **(iii) Dodge proof-of-form = NEGATIVE/INSTRUCTIVE.** Same as Family-II: dodge ships the guard (in the same `libapsfixup` line 22), so it proves only the mask form. R6 itself is **DARK** at runtime (`libAlgoProcess` did not load app-side that run; RE-inferred only) ⇒ retirement is **deferred** until the publish is confirmed, but the *form* is settled (publish-at-root, not guard).
- **(iv) LOS-confines weighting.** Treble-clean: ✔ (vendor-config / session-state, no blob edit). Re-buildable: ✔. Author-new vs adopt: **AUTHOR-NEW publish at F3 → then RETIRE the adopted guard.** Lower priority than II (R6 DARK; #6 not yet runtime-confirmed).

### Carried-faithful sepolicy grants (the enabling-facilitation F4 also owns, non-P010)

- **Contract.** App-direct dlopen for ArcSoft+QNN (the 11 non-apsfixup public.libraries leaves), the `vendor_xdsp_device:chr_file` grant for the QNN/DSP path, and the `libapsfixup` label — these unblock the **C6/APS turbo** path (the `vndksupport … sphal … libapsfixup.so not found` and `cameraserver avc denied {read}` failures are F4-rooted and F4-fixed). **NOT P010.**
- **Optimal LOS mechanism.** KEEP the byte-identical 12-lib public.libraries patch; KEEP the Treble-clean `.te` rewrite (reach the offline service via `hal_camera_client`, not a raw `find`) + the `domain.te` xdsp neverallow exemption (byte-equivalent to dodge).
- **Dodge proof-of-form = POSITIVE.** Patch byte-identical (diff clean); `.te` md5-match on every file except `vendor/opluscamera_app.te` (the deliberate Treble improvement).
- **Weighting.** Treble-clean ✔ / re-buildable ✔ / **ADOPT** the dodge patch verbatim; the only authored delta is the `.te` rewrite, a recovery-build correctness improvement.

---

## (3) Net — the optimal form, one line per owned contract

| Owned contract | Optimal LOS form | Mechanism class | Dodge proof-of-form | Verdict |
|---|---|---|---|---|
| **X4** P010 namespace | sphal `same_process_hal_file` label (existing); **no** public.libraries entry | sepolicy-namespace (adopt) | **NEGATIVE — decisive** (absent in dodge, dodge works) | **REFUTED → re-home #5 at D1 lock-math** |
| **Family-I** P010/chroma geometry | KEEP `libapsfixup` geometry interposers (minimal) | config/shim (keep) | **POSITIVE** (dodge ships it) | **KEEP — irreducible (rearch/14)** |
| **Family-II** `copyMetadata` guard | root fix R1 release-upcall at **F2**; then RETIRE guard | framework patch (author-new) | **NEGATIVE/INSTRUCTIVE** (dodge ships the mask; we can do better) | **RETIRE via root (retires #1 + #4)** |
| **Family-III** TurboHDR `strlen` guard | root fix R6 publish at **F3**; then RETIRE guard | config artifact (author-new) | **NEGATIVE/INSTRUCTIVE** (dodge ships the mask; R6 DARK) | **RETIRE via root (retires #6) — deferred (R6 DARK)** |
| Sepolicy/public.libraries enablers (non-P010) | KEEP 12-lib patch (identical) + Treble-clean `.te` | sepolicy + config (adopt + 1 authored .te) | **POSITIVE** (diff clean / md5 match) | **KEEP — already optimal** |

**Net trajectory.** As the post-processing contract is satisfied at the root (R1 @ F2, R6 @ F3), `libapsfixup`
shrinks to its irreducible **Family-I geometry core**. The shim stops accreting risk and starts shedding it.
**Dodge ships the un-reduced shim ⇒ dodge has not done the root fix — F4's optimal form is strictly better than the
shipping reference.** This supersedes the old E4/F4 "keep libapsfixup as accepted defense" verdict
(POST-PROCESSING-CONTRACT §"F4 reframe").

## (4) Symptom leaves

- **#5 (P010 / IMapper@4.0 NULL)** attaches as a **candidate ROOT that is REFUTED at F4.** Proximate site = **D1**
  (non-contiguous P010 lock / `getPlaneLayout` generic fallback). The dodge oracle shows the lib is never
  app-exposed yet dodge works ⇒ the root is **NOT an F4 namespace grant**; #5 returns to **D1** consumer-side
  lock-math (BLOCKED behind freeze #1), with Family-I `libapsfixup` staying as the rearch/14-blessed geometry
  defense.
- **#1 freeze + #4 UAF** are retired by the **R1 root fix at F2** (Family-II guard → dead code). **#6 strlen-SIGSEGV**
  is retired by the **R6 publish at F3** (Family-III guard → dead code, deferred while R6 is DARK). F4 owns the
  *decision* (keep I / retire II,III); F2 and F3 own the *root fixes* that earn the retirement.

> Cross-refs: REQUIREMENTS X4 (P010 namespace REFUTED) · R1 (release upcall → F2) · R6 (TurboHDR → F3) ·
> POST-PROCESSING-CONTRACT.md (reduction map, §"F4 reframe") · D1 §a (plane geometry / lock-math) ·
> ../interop-tree/facilitation/E4-sepolicy-namespace.md (migrated source).

---

## Inferences & Open (UNVERIFIED — heavy-check)

> Per the interop-tree trunk axiom, a measured namespace or label SITE is never a verified ROOT, and a static
> oracle A/B (host-only) is never a device runtime confirmation. The items below are mechanism attributions,
> optimal-form verdicts, reduction-map retirement conclusions, and root/subsystem assignments — NOT verified
> until an OOS↔LOS A/B proves each propagation-contract break.

### X4 — re-homing #5 at D1 (INFERRED)

- **REFUTATION (verified — falsifier fired):** `libcamxexternalformatutils.so` is ABSENT from every
  app-public `public.libraries.txt` (dodge AND ours AND on-device, grep=0 VERIFIED). This falsifier is a
  measured fact: a shipping reference works without the entry.
- **RE-HOMING ATTRIBUTION (inferred):** "Therefore #5 (P010 / IMapper@4.0 NULL) re-homes at D1 consumer-side
  lock-math." The falsifier disproves the F4 namespace-grant form; it does NOT prove D1 is the root. The D1
  attribution (non-contiguous P010 lock, `getPlaneLayout` generic fallback) is separately inferred from the
  lock geometry observation (`Cr−Y = stride×1472`, contiguous measurement at D1 §a). The full #5 causal chain
  to a user-visible symptom remains unconfirmed (G5 blocked behind freeze #1).
- **OPTIMAL FORM (inferred):** "Sepolicy `same_process_hal_file` label (existing); no public.libraries entry."
  That the existing label is sufficient for P010 resolution on LOS (not just on dodge) is not device-confirmed.

### Reduction-map Family-II and Family-III retirement (INFERRED, deferred)

- **FAMILY-II RETIREMENT (inferred):** "R1 lands (release upcall fires per-frame) → `metaBufferMap` bounded →
  no freed source → `copyMetadata` guard dead code → retire." This retirement chain is a forward-spec
  consequence of the R1 landing. R1 is currently RE-BLOCKED (bridge JNI lib not located; LOS A/B not run);
  the retirement is blocked on R1 confirmation.
- **FAMILY-III RETIREMENT (inferred, DARK):** "R6 publishes TurboHDR tag in-scene → `parseTurboHdrInfo` stores
  → `field_0x4d88` non-null → `strlen` guard dead code → retire." R6 is DARK (carrier RE-inferred only;
  `libAlgoProcess` did not load app-side). The retirement form is settled as a design judgment; the execution
  is deferred and unconfirmed.
- **"WE CAN DO BETTER THAN DODGE" (inferred):** "Dodge ships the mask (libapsfixup Family-II/III); our
  reduction is the improvement." This is a correct observation about the state of the dodge reference, but the
  improvement claim is forward-spec: it depends on R1 and R6 actually landing and retiring their respective
  families. Until those root fixes are confirmed, the shim stays as-is.

### Reduction-map Family-I — irreducibility claim (SUPPORTED, one open item)

- **SUPPORTED:** Dodge ships Family-I (`libapsfixup.so` in public.libraries line 22, VERIFIED). The
  geometry-defense form (P010/chroma geometry interposers) is proven by a shipping reference.
- **INFERRED:** "No upstream facilitation lever exists → irreducible." That there is NO other mechanism to
  satisfy the P010 lock geometry (i.e. the shim is the only correct form, rearch/14) is a design judgment
  from the investigation, not a proof-of-exhaustion of all possible forms.

### Sepolicy/public.libraries enablers (non-P010) — net verdict (SUPPORTED)

- The 12-lib public.libraries patch byte-identical (diff clean VERIFIED), the `.te` md5 characterization
  (VERIFIED), and the `libapsfixup` label need are all measured. The "functionally faithful" judgment on the
  Treble-clean `.te` rewrite vs. dodge's raw-find form is a design assessment, not a runtime-confirmed
  equivalence. Device confirmation (no avc denied, ArcSoft/QNN loads) is the G5-blocked outstanding item.
