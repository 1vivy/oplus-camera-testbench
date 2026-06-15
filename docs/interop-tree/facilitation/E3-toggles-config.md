<!-- Parent: ../INDEX.md -->
---
node: E3
title: "toggles / config (camxoverridesettings · props · permissions XML · overlays)"
plane: facilitation
partition: mixed
blob_identical_oos_los: true   # the override file is config text, not a blob; SHDR knob lives here, never in libaecCustom
characterization: CHARACTERIZED  # E-node: dodge-oracle-vs-dirty structural map complete (md5 diffs + grep-verified carriers in (a)/(e))
conviction: SUPPORTED             # root claim has evidence-for (config A/B run now), G-MECH/on-device G3 confirm pending
verdict: "Our shipped config carries logging/identity/HDR props but NOT the functional SHDR knob; the only runtime camxoverridesettings.txt (enable_verbose.sh) is LOGGING-MASK-ONLY (no selectSHDRAutoExposureUsecase=1) — so #2/#6 are un-facilitated by config we ship; the privapp-permissions delta is correct/intentional, not the #2/#6 root"
confidence: medium
symptoms: [2, 6]
probes: [B1, B2, dump_camxsettings.js, parse_strace.py]
gaps: [G3]
dodge_ref: "dodge-camera-port/repos/{vendor_oplus_camera/configs, android_device_oneplus_dodge/{vendor,odm,system_ext}.prop, android_hardware_oplus/overlay}"
dirty_ref: "vendor_oplus_camera/{configs, overlay, opluscamera.mk}; tools/enable_verbose.sh (runtime camxoverridesettings.txt overlay)"
divergence: "differs — perms set 7 vs 3 (gallery extras + stubs dep), privapp XML differs (md5 3df7a941→4a4cec19), props superset (HDR/EDR), camxoverridesettings.txt in NEITHER repo; runtime overlay is logging-only ⇒ MISSING the SHDR functional knob"
upstream: [C4, C5]
downstream: [C4, C5]
refuted_refs: []
doc_refs: [doc-42, doc-47, doc-48]
updated: 2026-06-13
---

# E3 — toggles / config (camxoverridesettings · props · permissions XML · overlays)

The config surface our port *ships* (PRODUCT_COPY_FILES permissions/sysconfig + PRODUCT_*_PROPERTIES props +
RRO overlay) vs the config it *applies at runtime* (`tools/enable_verbose.sh`'s bind-mount of
`/vendor/etc/camera/camxoverridesettings.txt`). Per the trunk axiom, the SHDR/HDR functional knob for #2/#6
is **config text in the blob's environment**, never the byte-identical `libaecCustom`/`chi.override` blob
(attribution-matrix #2: blobs md5-identical, root is the absent `/vendor/etc/camera/*.txt`).

## (a) Propagation contract — named carriers

**What enters (config we author/apply):**
- `configs/permissions/privapp-permissions-oplus.xml` → `system_ext/etc/permissions/` — `<uses-library>` grants +
  `dependency="oplus.camera.stubs"` on `com.oplus.camera.unit.sdk{,.adapter}.jar` + the `oplus.camera.stubs`
  `<library>` entry (feeds E1 stub resolution) + ~20 `com.oplus.permission.safe.*`/`OPLUS_COMPONENT_SAFE` grants.
- `configs/permissions/{com.oplus.android-features.xml, default-permissions-oneplus-gallery.xml}`,
  `configs/compatconfig/oplus-gallery-receiver-compat-config.xml` (`DYNAMIC_RECEIVER_EXPLICIT_EXPORT_REQUIRED`
  id 161145287 disabled), `configs/permissions/oplus_google_lens_config.xml` → `system_ext/etc/{permissions,default-permissions,compatconfig}/`.
- `configs/sysconfig/hiddenapi-package-oplus-whitelist.xml` → `system/etc/sysconfig/` (hidden-API greylist).
- `opluscamera.mk` props (carriers, by name): `persist.vendor.camera.privapp.list=com.oplus.camera`,
  `persist.sys.camera.private.log.enable=debug,pre,mp`, `ro.camerax.extensions.enabled=true`,
  `oplus.software.camera.10bit=1`, `persist.camera.override_preview_hdr_support=1`,
  `persist.sys.feature.{localhdr_version=2,hdr_vision_app=1,uhdr.support=true,support.edrlistener=true,dolby_vision=1}`,
  `ro.vendor.oplus.hdr.uniform=1`, `$(call soong_config_set,camera,package_name,com.oplus.packageName)`,
  `$(call soong_config_set_bool,camera,override_format_from_reserved,true)`.
- **Runtime-only** (`tools/enable_verbose.sh`): bind-mounts `/vendor/etc/camera/camxoverridesettings.txt` with
  keys `enableAsciiLogging=TRUE`, `overrideLogLevels=1`, `logInfoMask=0x1FFFFF`, `logVerboseMask=0x1FFFFF`,
  `chiLog{Info,Verbose,Config,Dump}Mask`, `chiNodeLog{Info,Verbose}Mask` — **logging masks only**.

**What leaves (into the planes):**
- CamX `StaticSettings` ingestion at configure (`OverrideLogSettingsAtConfigureFile`@0x151c4 reads the file) →
  shapes C5/C4 logging only. The **functional** key `selectSHDRAutoExposureUsecase` (StaticSettings +0x6a28/+0x6a18,
  attribution-matrix #2 / doc-47 Gate A) is **NOT present in any carrier above** — neither shipped nor runtime-overlaid.
- `oplus.camera.stubs` `<uses-library>` dependency → E1 (stub classloader resolution).
- HDR/EDR props → C6.hdr_detected→D4 EDR path (#3) and the SDK's `override_preview_hdr_support` gate.

## (b) Environment dependencies

- `/vendor/etc/camera/` must exist + be writable-by-overlay (`enable_verbose.sh` bind-mounts a `tmpfs`-style copy
  from `/data/local/tmp/camcfg_overlay`); SELinux ctx `u:object_r:vendor_configs_file:s0` (chcon/restorecon in the script).
- HAL re-read requires `killall vendor.qti.camera.provider-service_64 cameraserver` (override read only at provider init).
- `system_ext/etc/permissions/` must be on the priv-app permission scan path; `oplus.camera.stubs` lib file
  (`system_ext/framework/oplus-camera-stubs.jar`) must exist for the `dependency=` to resolve (E1 cross-dep).
- `soong_config` namespace `camera` (package_name, override_format_from_reserved) consumed at build, not runtime.

## (c) Fact-to-resolve

**ONE question:** *Does the config our port ships (or `enable_verbose.sh` overlays) ever set
`selectSHDRAutoExposureUsecase=1` (or any functional HDR-session key) reaching CamX StaticSettings — and does
the stock OOS runtime dump of `/vendor/etc/camera/` contain such a key that we omit?*
- **Answer = NO key shipped/overlaid, stock dump HAS it** ⇒ prediction: #2 `hdr_detected rc=-2` + #6 strlen-null
  persist because the SHDR usecase gate stays 0 (attribution-matrix #2 already proves the lever on-device).
  **Action unlocked:** ship a *functional* `camxoverridesettings.txt` (or vendor RRO) with `selectSHDRAutoExposureUsecase=1`
  to `/vendor/etc/camera/` as a PRODUCT_COPY_FILES artifact — the cheapest-class fix (TEST-PLAN §2 rank 2).
- **Answer = stock dump has NO such file either** ⇒ prediction: the SHDR knob lives in session-state/vendor-tag
  publish (C4/C5), not a config file; #2/#6 converge on a configure-time HAL path, not E3. Action: redirect to C4/C5.

This is the G3 probe payload: `dump_camxsettings.js` on the **stock** unit names +0x6a28/+0x6a18 exactly.

## (d) Runtime probe(s)

- `tools/observability/frida/dump_camxsettings.js` — B1, lever **CamX = CLOBBERED→fixable** (lever-index): names
  the exact OOS `+0x6a28`/`+0x6a18` StaticSettings values; closes **G3** (cheapest high-value probe). Run on STOCK.
- `tools/observability/strace/parse_strace.py` (B3) — A/B `openat("/vendor/etc/camera/camxoverridesettings.txt")`:
  ENOENT on LOS where OOS opens it = copy-one-file fix confirmed (TEST-PLAN §2 rank 2). Lever **WORKS** (cfg opens).
- `tools/observability/capture/ab_capture.sh` + `parse_ab.py` hdr row (B2) — confirms #2 SHDR-gate sign post-fix.
- `tools/enable_verbose.sh` — the runtime applier itself; note it is the ONLY thing that materializes a
  `camxoverridesettings.txt`, and it ships **logging masks, no functional key**.

## (e) Dodge-vs-dirty diff  *(PRIMARY — read concretely)*

Oracle = `dodge-camera-port/repos/{vendor_oplus_camera/configs, android_device_oneplus_dodge/*.prop, android_hardware_oplus/overlay}`.
Ours = `vendor_oplus_camera/{configs, overlay, opluscamera.mk}` + runtime `tools/enable_verbose.sh`.

| Artifact | Dodge (oracle) | Ours (dirty) | Verdict |
|---|---|---|---|
| **permissions XML count** | 3: `oplus_camera_default_grant_permissions_list.xml`, `oplus_google_lens_config.xml`, `privapp-permissions-oplus.xml` | **7**: + `com.oplus.android-features.xml`, `default-permissions-oneplus-gallery.xml`, `compatconfig/oplus-gallery-receiver-compat-config.xml`, `androidx.camera.extensions.impl.jar` | **differs (superset)** — extras are gallery/features, off the #2/#6 path |
| **`privapp-permissions-oplus.xml`** | md5 `3df7a941…` | md5 `4a4cec19…` | **differs** — ours adds `dependency="oplus.camera.stubs"`, the `oplus.camera.stubs`/`androidx.camera.extensions.impl` `<library>` entries, and ~20 `com.oplus.permission.safe.*`+`OPLUS_COMPONENT_SAFE` grants. **Intentional E1-stub plumbing, NOT a #2/#6 lever.** |
| **`sysconfig/hiddenapi-package-oplus-whitelist.xml`** | md5 `5d386f44…` | md5 `5d386f44…` | **same** (byte-identical — axiom: identical config is never the root) |
| **`oplus_camera_default_grant…`, `oplus_google_lens_config.xml`** | b004d5ee…, 0f648351… | b004d5ee…, 0f648351… | **same** (byte-identical) |
| **props** | `opluscamera.mk` lean set (logd-limits + identity + 10bit) | `opluscamera.mk` **superset**: adds `persist.sys.feature.{localhdr_version=2,hdr_vision_app,uhdr.support,support.edrlistener,dolby_vision*}`, `persist.camera.override_preview_hdr_support=1`, `ro.vendor.oplus.hdr.uniform=1`, oplusrom V16 version triplet | **differs (superset)** — our HDR/EDR props feed #3, not the SHDR gate |
| **prop location** | device tree `android_device_oneplus_dodge/{vendor,odm,system_ext}.prop` (no camera-functional entries; `# Camera` = market-name only) | `vendor_oplus_camera/opluscamera.mk` PRODUCT_*_PROPERTIES (no `*.prop` files) | **differs (location)** — non-load-bearing for #2/#6 |
| **`camxoverridesettings.txt`** | **absent** from repo | **absent** from repo; only `enable_verbose.sh` overlays one at runtime, **logging-mask-only** | **same (both missing the functional file)** — and ours' runtime form lacks `selectSHDRAutoExposureUsecase=1` |
| **overlay structure** | RRO `android_hardware_oplus/overlay/{qssi,generic}` (FrameworksRes/SystemUI/Wifi — no camera RRO); device `overlay/OPlus*ResTarget` | `vendor_oplus_camera/overlay/CameraThemedIcon` only (launcher icon RRO) | **differs** — neither ships a *camera-settings* RRO; both cosmetic for #2/#6 |

**The correct (dodge) form, and the gap:** dodge **also** does not ship `camxoverridesettings.txt` and **also**
lacks the SHDR functional prop — so the oracle does NOT prove a config-file fix. dodge's only #2/#6-relevant
delta is what it does NOT have that we do: nothing. **Conclusion: the SHDR knob is not a config artifact either
side ships;** per attribution-matrix #2 the lever is real and on-device-proven, so the *correct* facilitation
form (to be authored, not lifted from dodge) is a new PRODUCT_COPY_FILES `camxoverridesettings.txt` with
`selectSHDRAutoExposureUsecase=1` — gated on the G3 stock dump (c). Our `privapp` delta is the *right* divergence
(stubs dependency); do not "revert to dodge" there. Cross-link: `DODGE-VS-DIRTY.md` (E3 rows).

## (f) Symptom leaves

- **#2 (no-JPEG / `hdr_detected` rc=-2)** — E3 is **ROOT (config-layer)**: the `/vendor/etc/camera/camxoverridesettings.txt`
  carrying `selectSHDRAutoExposureUsecase=1` is absent in our ship AND only logging-overlaid at runtime. Edge:
  proximate site is C5 (SHDR gate closed) → root here. Decisive: G3 `dump_camxsettings.js` on stock (c/d).
- **#6 (strlen-null TurboHDR)** — E3 is **candidate ROOT (sibling of #2)**: attribution-matrix converges #6 with #2
  on "the same `camxoverridesettings` session-state class." Edge: proximate site C4/C5 (TurboHDR vendor-tag unpublished);
  if the same SHDR config publishes the tag, root is here; else root migrates to C4 tag-publish (doc-42 Family III).

**Ledger (SUPPORTED — E-node A/B = dodge-oracle vs our-dirty, run NOW; G-MECH/on-device confirm pending G3):**
`condition: config-tree static A/B (host) | N=1 file-diff | stock_signal: camxoverridesettings.txt + SHDR key UNKNOWN (G3 dark) | oracle(dodge)_signal: file absent, SHDR prop absent, privapp differs | falsifier: "dodge proves a shippable SHDR config file" → REFUTED (dodge ships none) | mechanism: SHDR key absent in every carrier we ship/overlay (grep-verified) — not yet observed on-device that adding it flips rc=-2→0`
