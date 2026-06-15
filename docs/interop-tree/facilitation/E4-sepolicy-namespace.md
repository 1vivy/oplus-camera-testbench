<!-- Parent: ../INDEX.md -->

---
node: E4
title: "sepolicy + linker namespace (public.libraries.txt · sphal · .te / file_contexts)"
plane: facilitation
partition: mixed                 # /vendor-config (public.libraries.txt, ld.config) + /vendor (sepolicy .te/file_contexts)
blob_identical_oos_los: true     # mapper.qti.so / libgrallocutils.so / libcamxexternalformatutils.so all byte-identical
characterization: CHARACTERIZED  # E-node dodge-oracle-vs-dirty structural map is complete in (e): 8-row diff + correct (dodge) form identified
conviction: REFUTED              # falsifier fired: libcamxexternalformatutils ABSENT from every app-public public.libraries.txt yet dodge works ⇒ doc-42 §2.5 namespace theory for #5/P010 refuted
verdict: "libcamxexternalformatutils is ABSENT from every app-public public.libraries.txt (dodge + ours + on-device) yet dodge is reliable ⇒ the P010 plane-layout decode resolves it in the SPHAL/vendor same-process-HAL namespace (file_contexts: same_process_hal_file:s0), NOT the app namespace; the public.libraries patch is load-bearing only for app-direct dlopens (arcsoft+QNN+libapsfixup), not for P010"
confidence: high
symptoms: [5]                    # P010 / IMapper@4.0 NULL — E4 is the facilitation candidate-root tested here; co-equal with D1
probes: [r3-gralloc, G5]
gaps: [G5]
dodge_ref: "dodge-camera-port/repos/proprietary_vendor_oneplus_sm8750-common/proprietary/vendor/etc/public.libraries.txt; dodge-camera-port/repos/patches-crdroid/patch-dodge/device,oneplus,sm8750-common/0001-extract-files-Patch-public-libraries.txt-to-allow-op.patch; dodge-camera-port/repos/vendor_oplus_camera/sepolicy/; dodge-camera-port/repos/android_device_qcom_sepolicy_vndr/generic/vendor/common/{file_contexts,domain.te}"
dirty_ref: "vendor_oplus_camera/sepolicy/; op15-camera-porting/patches-crdroid/patch-dodge/device,oneplus,sm8750-common/{0001-extract-files-Patch-public-libraries.txt-to-allow-op.patch,0002-sepolicy-Label-libapsfixup.so.patch}; op15-camera-porting/patches-crdroid/patch-dodge/device,qcom,sepolicy_vndr,sm8750/{0001,0002}*.patch"
divergence: "same (P010-relevant); differs (opluscamera_app.te + xdsp/dsp grants, both functionally faithful — ours adds hal_camera_client + drops xdsp chr_file rw, dodge keeps it)"
upstream: [D1]                   # D1 gralloc/CamxFormatUtil is the data-plane site E4 facilitates
downstream: [D1, C4]
refuted_refs: []
doc_refs: [doc-42]
updated: 2026-06-13
---

# E4 — sepolicy + linker namespace

**One-liner:** E4 is the facilitation candidate-root for **#5 (P010 / non-contiguous lock)** under the doc-42
§2.5 "in-app namespace can't dlopen the camx plane authority" theory. The dodge oracle **REFUTES** that theory:
`libcamxexternalformatutils.so` is exposed in **no** app-public `public.libraries.txt` — dodge's, ours, or the
on-device dump — yet dodge captures reliably. So P010 is decoded in the **sphal / vendor same-process-HAL
namespace**, not the app namespace, and E4's public.libraries patch is load-bearing only for libs the **app
process dlopens by name** (ArcSoft + QNN + `libapsfixup.so`).

## (a) Propagation contract

**What enters (carriers crossing the linker / policy boundary):**
- `public.libraries.txt` (`/vendor/etc/`) entries the app namespace may dlopen by leaf name: `libarcsoft_hdr_couple_api.so`,
  `libarcsoft_high_dynamic_range_couple.so`, `libarcsoft_smart_denoise.so`, `libarcsoft_turbo_hdr_raw.so`,
  `libarcsoft_turbo_raw.so`, `libarcsoft_qnnhtp.so`, `libQnnHtp.so`, `libQnnSystem.so`, `libQnnHtpV79Stub.so`,
  `libQnnGpu.so`, `libQnnHtpStub.so`, `libapsfixup.so`.
- sphal-namespace transitive `DT_NEEDED` chain (NOT public-listed): `mapper.qti.so` → `libgrallocutils.so`
  (`DT_NEEDED`, + `libgralloccore.so`) → dlopen → **`libcamxexternalformatutils.so`** (driven by
  `/vendor/etc/display/camera_alignments.json`).
- sepolicy attributes onto `opluscamera_app`: `halclientdomain`, `hal_camera_client`; `binder_call(opluscamera_app,
  system_suspend_server)`; service `find` on `hal_system_suspend_service`.
- `file_contexts` labels: `libcamxexternalformatutils.so` / `libgrallocutils.so` / `libgralloccore.so` →
  `same_process_hal_file:s0`; `/odm/lib64/libapsfixup.so` → `same_process_hal_file:s0`.

**What leaves (effect downstream):**
- The P010 `getStandardMetadata(PLANE_LAYOUTS)` / `CamxFormatUtil_GetPlaneAlignment` decode result → **D1**
  (contiguous vs the `"Failed to link CamxFormatUtil"` generic fallback layout).
- App-direct dlopen success for ArcSoft/QNN/`libapsfixup` → unblocks C6/APS turbo path; resolves the
  `vndksupport: Could not load … from sphal namespace … libapsfixup.so not found` failure.
- `vendor_xdsp_device:chr_file` access for the QNN/DSP path → C6.

## (b) Environment dependencies

- **/vendor-config:** `vendor/etc/public.libraries.txt` (extract-files `blob_fixup`); `system_ext/oplusex/ld.config.oplus.txt`
  (16 lines — does **not** itself spell a camx grant; sphal search-paths carry vendor reachability).
- **sphal namespace:** `libcamxexternalformatutils.so` is reachable here **because it is a `same_process_hal_file`**
  already on the vendor namespace search path — no public.libraries entry needed.
- **sepolicy domains/types:** `opluscamera_app` (must JOIN `hal_camera_client` attribute, not a naked `find`),
  `cameraserver`, `same_process_hal_file`, `vendor_xdsp_device`, `vendor_file`.
- **/odm:** `libapsfixup.so` needs both (i) a `same_process_hal_file` label (else `cameraserver` AVC `denied {read}`
  on `vendor_file`) and (ii) a public.libraries entry (else dlopen-by-leaf-name fails in sphal).

## (c) Fact-to-resolve

**Q:** Is `libcamxexternalformatutils.so` in any app-visible `public.libraries.txt` (ours / dodge), and does dodge
decode P010 correctly **without** that exposure?
- **If absent in dodge AND dodge works** ⇒ doc-42 §2.5 namespace theory is **REFUTED** for #5; the camx plane
  authority resolves in the **sphal namespace**, not the app namespace; no public.libraries fix for P010 is owed.
  *Unlocked action:* stop chasing a public.libraries/ld.config grant for `libcamxexternalformatutils`; re-home #5
  at **D1** (consumer-side lock-math / non-usage allocation input, per doc-42 §2 CORRECTION + EXHAUSTIVE VERDICT).
- **If present (either side)** ⇒ namespace exposure is the lever; mirror it the way dodge does.

**Answer (from oracle, this session): ABSENT in BOTH; dodge works ⇒ REFUTED.** (Static A/B is decisive now; the
runtime confirm — does `com.oplus.camera` actually map the lib / does `"Failed to link CamxFormatUtil"` fire —
is the residual G5 gate, but the oracle already shows exposure is NOT what makes dodge work.)

## (d) Runtime probe(s)

- **`tools/observability/r3-gralloc/10_camxformat_probe.sh`** — device, read-only, frida-free: is
  `libcamxexternalformatutils` mapped in `com.oplus.camera` (`/proc/pid/maps`)? + logcat fire-count of
  `"Failed to link CamxFormatUtil"` / `"Unable to get IS_UBWC from snap"` + vendor-process positive control.
- **`tools/observability/r3-gralloc/20_trace_alloc_camxformat.js`** — frida native-only: handle-keyed
  `allocate→import→lock` + `dlopen(libcamxexternalformatutils)` success/null + `CamxFormatUtil` symbol resolution.
- **Lever status (lever-index.md):** gralloc/mapper = **FRIDA-ONLY** (`trace_p010_planes.js`; no setprop verbosity
  lever exists). The fallback-string fire is the **G-MECH** observation. **BLOCKED** at runtime by freeze #1
  (preview wedges before the P010 lock fires) → static dodge A/B is the only A/B runnable now.

## (e) Dodge-vs-dirty diff  *(PRIMARY)*

| Artifact | Dodge oracle | Ours (dirty) | Verdict |
|---|---|---|---|
| `vendor/etc/public.libraries.txt` patch | `…/patch-dodge/device,oneplus,sm8750-common/0001-…public-libraries…patch` (12 adds: 5 arcsoft + 6 QNN + `libapsfixup.so`) | `op15-camera-porting/…/device,oneplus,sm8750-common/0001-…public-libraries…patch` | **IDENTICAL** (`diff` clean) |
| on-device shipped `public.libraries.txt` | `proprietary_vendor_oneplus_sm8750-common/proprietary/vendor/etc/public.libraries.txt` (22 lines; 12 = the patch adds) | `op15-work/dump201_full/vendor/etc/public.libraries.txt` (10 lines, pre-patch base) | dodge = base+patch; ours applies the SAME patch over the SAME base |
| **`libcamxexternalformatutils` in public.libraries** | **ABSENT** (proprietary + patch) | **ABSENT** (patch + dump) | **SAME — absent both sides; dodge reliable ⇒ doc-42 §2.5 theory REFUTED** |
| `libcamxexternalformatutils` label | `android_device_qcom_sepolicy_vndr/…/file_contexts:353` → `same_process_hal_file:s0` | inherited (we patch the same qcom vndr repo) | **SAME** — resolved via sphal, not app-public |
| `.te` — `private/opluscamera_app.te`, `public/opluscamera_app.te`, `vendor/hal_camera_default.te`, `vendor/app.te`, `vendor/init.te`, `vendor/mediaserver.te`, `private/service.te` | dodge `vendor_oplus_camera/sepolicy/` | `vendor_oplus_camera/sepolicy/` | **SAME** (md5 match) |
| `.te` — `vendor/opluscamera_app.te` | md5 `5d5d515b…` (keeps `xdsp_device:chr_file rw`, raw `find` on offline+suspend) | md5 `81296e45…` (adds `typeattribute … halclientdomain/hal_camera_client`, `dontaudit` xdsp, drops xdsp rw, `binder_call` system_suspend) | **DIFFERS — functionally faithful**: ours reaches the offline service via `hal_camera_client` (Treble-clean, recovery-buildable) where dodge uses raw finds; both grant the offline-service reachability |
| `.te` — `vendor/file.te`, `file_contexts`, `genfs_contexts`, `private/seapp_contexts`, `private/property_contexts` | dodge | ours (+ extra `private/mac_permissions.xml`, `private/platform_app.te`) | **DIFFERS** — labeling/property scope; not P010-relevant |
| qcom vndr `domain.te` xdsp grant (`- opluscamera_app` in the `vendor_xdsp_device` neverallows) | `android_device_qcom_sepolicy_vndr/…/domain.te:91,98` | `…/device,qcom,sepolicy_vndr,sm8750/0001-…xdsp…patch` | **SAME** edit (byte-equivalent neverallow exemption) |
| `/odm/lib64/libapsfixup.so` label | (dodge labels via its file_contexts) | `…/device,oneplus,sm8750-common/0002-sepolicy-Label-libapsfixup.so.patch` → `same_process_hal_file:s0` | **SAME class** — both label it for `cameraserver`/sphal read (fixes the `avc denied {read}` + `vndksupport` dlopen-fail) |

**Correct (dodge) form:** the public.libraries set is exactly the 12 app-direct-dlopen libs (arcsoft + QNN +
`libapsfixup`); P010's `libcamxexternalformatutils` is **deliberately not** listed because it loads transitively
through `mapper.qti.so`→`libgrallocutils.so` in the sphal/same-process-HAL namespace. **We are already at the
correct form** (patch byte-identical). The only real divergence is the `vendor/opluscamera_app.te` rewrite, which
is a Treble/recovery-build correctness improvement over dodge's raw-find form, not a P010 regression. Cross-link:
`DODGE-VS-DIRTY.md` (E4 row).

## (f) Symptom leaves

- **#5 (P010 / IMapper@4.0 NULL)** attaches here as a **candidate ROOT that is REFUTED at this layer**. The edge:
  #5's proximate site is **D1** (non-contiguous P010 lock / `getPlaneLayout` returns the generic fallback). E4 was
  the doc-42 §2.5 facilitation candidate ("the app namespace can't reach `libcamxexternalformatutils`"). The dodge
  oracle shows the lib is never app-exposed yet dodge works ⇒ **the root is NOT an E4 namespace grant**; #5 returns
  to **D1** (consumer-side lock-math, or a non-usage allocation input — doc-42 §2 EXHAUSTIVE VERDICT / CORRECTION),
  with `libapsfixup` staying as the rearch/14-blessed consumer-side defense.
- E4 **does** own the *enabling* facilitation for the C6/turbo path: the arcsoft+QNN public.libraries exposure,
  the `xdsp_device` grant, and the `libapsfixup.so` label/exposure (the `vndksupport … sphal … libapsfixup.so not
  found` and `cameraserver avc denied {read}` failures are E4-rooted and E4-fixed) — but those facilitate APS/turbo,
  not the P010 layout decode.
