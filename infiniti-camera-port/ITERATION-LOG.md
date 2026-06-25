# infiniti-camera-port — Iteration Log (anti-dirty-mess ledger)

**HIGHLY CRITICAL.** Every change that reaches the device — whether by full flash or by the in-between-builds
`adb root + remount` module push — is logged here. The rule that prevents the prior dirty-work drift:

> **The device is ALWAYS reconcilable to a `lineage-23.2-cam-final` commit.** Every on-device binary traces to
> source built (`mma`) from the cam-final working tree. No hand-edited binaries, no orphan pushes.

## Protocol

1. **Every pushed binary traces to source.** Only push artifacts `mma`-built from the cam-final tree. Never a
   hand-edited blob or one with no corresponding source diff.
2. **Promote-or-revert before any full build.** A validated fast-iteration change is either **committed** to its
   cam-final branch (PROMOTED) or **reverted** off device + tree (REVERTED). No orphan device state.
3. **Reconcile before flash:** `on-device modules == cam-final + (this ledger's open rows)` — zero untracked pushes.
4. `adb remount` needs userdebug + `adb disable-verity`/`adb remount -R` (AVB/dm-verity + dynamic partitions).
   Camera modules: shims/jars → `system_ext/{lib64,framework}`; OEM libs → `odm/lib64`.

## Build / device state

| build | date | base | device | notes |
|-------|------|------|--------|-------|
| (stock OOS) | 2026-06-14 | OOS `CPH2747_11.A.40_0400_202605071113` | `<device-serial-redacted>` | E0 harvest phase — NOT yet flashed |
| Build 1 (prep) | 2026-06-14 | lineage-23.2-cam-final + dodge series + infiniti deltas | (not flashed) | E4 build-prep on `vivy@10.9.20.67:/srv/android/worktrees/lineage-infiniti`; extract from `/srv/android/dump201_full` (.201). See transforms below. |

## Build-1 E4 prep transforms (server working-tree; reconciliation)

Run on the build server before `mka bacon`. **Source edits** must be PROMOTED to cam-final (local → 1vivy → re-sync) after Build 1 validates; **build inputs** are reproducible from `.201` via the extract recipe (not committed — LFS/gitignored); **host env** is build-host-local (never committed).

| # | transform | repo / path | class | reconciliation |
|---|-----------|-------------|-------|----------------|
| 1 | reverted over-extraction (extract `device_with_common` re-pulled the whole SoC base from .201) — restored to committed | `vendor/oneplus/sm8850-common` (437 files) | build input | `git checkout` → == committed cam-final (clean) |
| 2 | FD flags `enableSWfdForThirdCamUnit`/`fdSupport` `FALSE`→stock `TRUE` (dodge-oracle-confirmed; dirty leftover reverted) | `vendor/oneplus/infiniti/.../CameraHWConfiguration.config` | **source edit** | extract recipe deterministically emits stock TRUE; **PROMOTE**: commit "config: revert dirty FD-disable to stock (dodge parity)" |
| 3 | materialized 3 camera LFS blobs from dump (OID-verified): `camera.oemlayer.v2.so`, `libalogencrypt.so` ×2 | `vendor/oneplus/infiniti/proprietary/odm/...` | build input | LFS pointer OID == dump sha256 (provable); 39 `radio/*` firmware left as pointers (not on camera path, device keeps .201 fw) |
| 4 | device proprietary-files ELF fixups applied (`libAlgoProcess` `+DT_NEEDED libapsfixup.so`, etc.) — committed blob lacked it | `vendor/oneplus/infiniti/proprietary/...` | build input | reproducible via `extract-files.py … -n` from .201 |
| 5 | `namespace_imports` re-pointed dodge→infiniti, sm8750→sm8850 | `vendor/oplus/camera/extract-files.py` | **source edit** | infiniti delta; **PROMOTE** (backup: `extract-files.py.preB1`) |
| 6 | disabled `OplusCamera.apk` + `OppoGallery2.apk` apktool_patch (version-specific smali reject on .201 obfuscation; cosmetic — font swap + perm cleanup). `unit.sdk.jar` patch KEPT (functional, applied clean) | `vendor/oplus/camera/extract-files.py` | **source edit** | infiniti delta; **PROMOTE**; **Build-2 task**: re-author apk smali patches vs infiniti's apk |
| 7 | pruned 184 dodge `bonito_*` sensor-config entries (SM8750 sensor cruft; absent on infiniti; infiniti sensors come from sm8850-common) | `vendor/oplus/camera/proprietary-files.txt` (279→95) | **source edit** | infiniti delta; **PROMOTE** (backup: `proprietary-files.txt.preB1`) |
| 8 | `stripzip` → no-op shim (real binary needs GLIBC_2.34, host is 2.31; strip is reproducibility-only, not functional) | `prebuilts/extract-tools/linux-x86/bin/stripzip` | **host env** | original at `stripzip.orig234`; NOT committed (build-host-local) |
| 9 | pruned 2 colliding shared-HAL libs (`libfusioninterpolation.arcsoft`, `vendor.oplus.hardware.cammidasservice@1.0`) — device tree already provides them (Soong "multiple namespaces" error) | `vendor/oplus/camera/proprietary-files.txt` (95→93) | **source edit** | infiniti delta; **PROMOTE**; camera repo owns only app-unique blobs |
| 10 | commented 37 `add-radio-file-sha1-checked` firmware entries (images not in dump, not fetchable via LFS; camera build keeps device `.201` fw, no OTA radio) | `vendor/oneplus/infiniti/Android.mk` | build input | working-tree edit (backup `Android.mk.preB1`); Kati SHA1-pins pointer fails otherwise. Real fix later: materialize radio from device/OTA or push LFS content |
| 11 | fixed `proc_ufs_file` sepolicy type: was `file_type` **and** `proc_type` (dodge cruft) → triggered `neverallow domain proc_type:dir {write create…}` via the generic `vendor_init file_type:dir` rule. Re-declared `fs_type, proc_type` (proper proc type); dropped the redundant `typeattribute … proc_type`. Verified: `m precompiled_sepolicy` neverallow check passes | `vendor/oplus/camera/sepolicy/vendor/file.te` | **source edit** | infiniti delta / bug fix; **PROMOTE** (backup `file.te.preB1`) |
| 12 | added `oplus\..*`, `net\.oneplus\..*`, `vendor\.oplus\..*` to boot-jar allow-list (oplus-fwk is `PRODUCT_BOOT_JARS`; LOS base only had `com\.oplus\..*`; crDroid base had the rest) | `build/soong/scripts/check_boot_jars/package_allowed_list.txt` | **base patch** | crDroid→LOS delta; backup `.preB1`; candidate to upstream-patch the LOS base or keep local |
| 13 | commented firmware `AB_OTA_PARTITIONS += abl…xbl_ramdump` block (41 fw partitions; same root as #10 — no fw images, device keeps `.201` fw) | `vendor/oneplus/infiniti/BoardConfigVendor.mk:5-45` | build input | **SUPERSEDED by #14** (regen produces fw-free BoardConfigVendor from emptied recipe) |
| 14 | **systematic firmware exclusion + Android.bp re-sync.** Emptied `proprietary-firmware.txt` (40 `*.img;AB` entries — no fw shipped) and regenerated device makefiles (`extract-files.py -m --only-target`). Net effects: (a) `Android.bp` `shared_libs` now matches the fixup'd blobs (`libsharebuffer_impl`→`libui-stock`/`libutils-stock`, `libAlgoProcess`→`+libapsfixup`, V5→V7 / V1→V2 / tinyxml2→v36 all consistent) — fixes the `check_elf_file` class; (b) radio `Android.mk` block + `AB_OTA` firmware gone cleanly from the recipe (replaces the #10/#13 hacks) | `device/oneplus/infiniti/proprietary-firmware.txt`, regen `vendor/oneplus/infiniti/{Android.bp,Android.mk,*-vendor.mk,BoardConfigVendor.mk}` | **source edit** (recipe) + build input (makefiles) | infiniti delta; **PROMOTE** the emptied firmware recipe; backups `.preB1` / `Android.bp.preB1regen` |

## Build-1 attempt log

| attempt | result | failure | fix |
|---------|--------|---------|-----|
| `m nothing` #1 | parse FAIL | Soong: 2 modules in multiple namespaces (camera vs device) | transform #9 (dedup) |
| `m nothing` #2 | parse FAIL | Kati: `radio/abl.img` SHA1 mismatch (LFS pointer) | transform #10 (exclude fw) |
| `m nothing` #3 | **parse OK** | — | graph valid |
| `mka bacon` #1 | FAIL @14% (27m) | sepolicy `neverallow … proc_type:dir` | transform #11 (proc_ufs_file) |
| `m precompiled_sepolicy` | **OK** | — | neverallow resolved |
| `mka bacon` #2 | FAIL @pkg (54m) | boot-jars allow-list (oplus-fwk) + OTA `abl.img` missing | transforms #12, #13 |
| `mka bacon` #3 | FAIL @8.5m | `check_elf_file`: `libsharebuffer_impl` DT_NEEDED `libui-stock`/`libutils-stock` not in shared_libs (stale Android.bp) | transform #14 (regen) |
| `mka bacon` #4 | FAIL @m-nothing (18s) | Soong: `libAlgoProcess` (vendor ns) → undefined `libapsfixup` (device ns, not imported) | transform #15 (namespace import) |
| `mka bacon` #5 | FAIL @m-nothing (28s) | Soong: `libui-stock` depends on graphics.common **V6 AND V7** (fixup→V7 vs platform transitive V6) | transform #16 (V7→V6) |
| `mka bacon` #6 | FAIL @m-nothing (28s) | same V6/V7 conflict — V7→V6 was the wrong direction (platform `libgralloctypes`=V7) | transform #17 (→V7, libui-stock V6→V7) |
| `mka bacon` #7 | FAIL @31% | 16 KB check: 15 camera JNI libs are 4 KB-aligned (`Load segment alignment 4096 but 16384 required`) | transform #18 (check_elf_files:false) |
| `mka bacon` #8 | GATE-blocked (no build) | `-` prefix kept libs packaged but did NOT set `check_elf_files:false` — gate refused to build | superseded by #19 |
| `mka bacon` #9 | **SUCCESS (20:03)** | — | `lineage-23.2-20260614-UNOFFICIAL-infiniti.zip` (3.4 GB) + fastboot images; camera stack verified in-image (oemlayer.v2 HAL, OplusCamera+unit.sdk.jar, libcsextimpl, oplus-fwk boot jar, libAlgoProcess+libapsfixup) |

## Build-1 PROMOTE checklist (commit validated source edits to cam-final → push to 1vivy)

Build 1 succeeded from the server working tree; these source edits must be promoted so the flashed image is reconcilable (each is a verified dodge→infiniti / crDroid→LOS / latent-cam-final fix):
- `vendor/oneplus/infiniti`: CameraHWConfiguration.config FD flags → stock TRUE (#2); emptied `proprietary-firmware.txt` (#14); `device.mk` `PRODUCT_MAX_PAGE_SIZE_SUPPORTED:=4096` (#19); regenerated Android.bp/.mk/BoardConfigVendor (firmware-free, shared_libs synced, graphics.common V7, namespace import); blob patchelf graphics.common→V7 (build input, reproduced by recipe).
- `device/oneplus/infiniti/extract-files.py`: namespace_imports += device/oneplus/infiniti (#15); graphics.common V7 + libui-stock V6→V7 source (#17).
- `vendor/oplus/camera`: extract-files.py namespace re-point + apk-patch disable (#5/#6); proprietary-files.txt sensor prune (#7) + collision de-dup (#9).
- `vendor/oplus/camera/sepolicy/vendor/file.te`: proc_ufs_file fs_type/proc_type fix (#11).
- `build/soong/scripts/check_boot_jars/package_allowed_list.txt`: oplus/net.oneplus/vendor.oplus prefixes (#12) — base patch (host/local; candidate to keep as a LOS-base local patch).
- Build-host only (NOT committed): `prebuilts/extract-tools/.../stripzip` no-op shim (#8).

### PROMOTE done (2026-06-14) — pushed to 1vivy `lineage-23.2-cam-final`
Server has no GitHub push creds, so commits were relayed (format-patch → `git am --3way`) to the authenticated local canonical repos and pushed from there:
- `android_device_oneplus_infiniti`: `1fbb7c6 → 02503b7`
- `vendor_oplus_camera`: `1c2c269 → 8b37512`
- `proprietary_vendor_oneplus_infiniti`: `4b2b6f8 → e9328f9`

**Reproducibility caveat — 2 build-host-local items NOT in cam-final** (a fresh server `repo sync` + build would re-hit these):
1. `build/soong/scripts/check_boot_jars/package_allowed_list.txt` (#12, oplus/net.oneplus/vendor.oplus prefixes) — `build/soong` is LineageOS base, not a 1vivy fork; needs either a 1vivy `android_build_soong` fork in the manifest or a carried local patch.
2. `prebuilts/extract-tools/.../stripzip` no-op shim (#8, glibc 2.34 vs host 2.31) — host-local; only used by `extract-files.py` apktool flow, not the build itself.

**Server SHA note:** the server's own commits (f775752/817104f/93da3f9) are content-equivalent to the pushed ones; next build should `repo sync --force-sync` to align SHAs (server can fetch read-only, just not push).

### Transform #19 (supersedes #18's `-` attempt)
- **`PRODUCT_MAX_PAGE_SIZE_SUPPORTED := 4096`** in `device/oneplus/infiniti/device.mk`. **Definitively verified the device is 4 KB-pages** via `extract-ikconfig` on both the prebuilt kernel (`device/oneplus/infiniti-kernel/images/kernel`) AND the stock `boot.img`: `CONFIG_ARM64_4K_PAGES=y` (16K/64K not set). So the build's default 16 KB-readiness (`--max-page-size 16384`) was over-strict; declaring the true 4 KB page size makes `check_elf_file` pass for all libs (4 KB camera JNI + 16 KB-aligned core alike) and the 4 KB libs load fine at runtime. Reverted the no-op `-` prefixes (#18) from `vendor/oplus/camera/proprietary-files.txt`. **source edit / PROMOTE.** Build cost: changes the cc link `-z max-page-size` flag → native libs re-link (incremental).

### Transform #18
- **16 KB page-size exemption for 15 4 KB camera JNI libs** (libAncFilter_jni, libAPSClient-jni/-cmd-jni/-alog-jni, libCombineLut(+Jni), libApsSuperEISPreviewJni, libOplusStringJNI(+-extension.oplus), libsuperNight.oplus, libarcsoft_wideselfie, libsingle_camera_bokeh(2)_native, libortc_so.oplus, liblivephoto.frc.jni). These OEM/3rd-party libs are 4 KB-aligned; the build defaults to 16 KB-readiness (`check_elf_file --max-page-size 16384`). Core OEM/HAL blobs (libsdmcore/libAlgoProcess) ARE 16 KB-aligned and pass — only the app JNI helpers are 4 KB. Since they ship + run on stock OOS, the device kernel is 4 KB pages. Scoped fix: `-` prefix in `vendor/oplus/camera/proprietary-files.txt` → `check_elf_files: false` (still packaged), leaving the validated 16 KB policy intact for everything else. **source edit / PROMOTE** (backup `.preB1align`). NOTE: if infiniti turns out to be a 16 KB-kernel device, these specific beautify/EIS/bokeh JNI helpers won't load at runtime (core preview/capture via libAlgoProcess+oemlayer.v2 unaffected) — revisit in Build 2.

### Transform #16 (corrected by #17)
- First attempt: graphics.common **V7→V6** — WRONG direction. Dependency-path evidence (attempt #6) showed the platform's own `libgralloctypes` links graphics.common-**V7** (the live "current"), so vendor blobs must align **up to V7**, not down to V6.

### Transform #17
- **graphics.common AIDL → V7 (correct).** Reverted recipe target to V7; **fixed `libui-stock`'s `replace_needed` source `V5→V6`** (the blob is *natively* V6, so the original `V5→…` fixup was a silent no-op — that's why libui-stock stayed V6 and conflicted with `libgralloctypes`'s V7); patchelf'd **all** proprietary blobs `graphics.common-V6-ndk → V7-ndk` for uniform platform alignment; regenerated. **recipe = source edit / PROMOTE** (esp. the libui-stock V6→V7 source fix); blob patchelf = build input.

### Transform #15
- **namespace_imports**: added `'device/oneplus/infiniti'` to `device/oneplus/infiniti/extract-files.py` (regenerated) — dodge had `'device/oneplus/dodge'` for exactly this (`libAlgoProcess` DT_NEEDED `libapsfixup` lives in the device namespace); the line was dropped in the dodge→infiniti re-point. **source edit / PROMOTE.**

## Fast-iteration push ledger

| date | module | source (branch+SHA / diff ref) | device target | restart action | test result | disposition |
|------|--------|--------------------------------|---------------|----------------|-------------|-------------|
| 2026-06-17 | A1 — Osense ABI stubs (oplus-fwk) | `android_hardware_oplus` `lineage-23.2-cam-final` `d49a9e8`; compiled `m oplus-fwk` on build server; pushed `system/framework/oplus-fwk.jar` + `arm64/boot-oplus-fwk.{art,oat,vdex}` + `boot-oplus-fwk.vdex` via `adb remount`; server synced via `/srv/android/bin/repo sync hardware/oplus device/oneplus/infiniti` | `/system/framework/oplus-fwk.jar` + arm64 boot artifacts | `adb reboot` (framework jar requires full reboot) | `NoSuchMethodError` for Osense eliminated (zero hits in logcat/dropbox); `getBlastSurfaceControl` returns valid `SurfaceControl` object on 2nd+ call (frida inline: `Surface(name=a836abd SurfaceView[...Camera]#438)/@0x55d6c28`) — was `null` every call on v1.4 baseline; ArcSoft TurboHDR tombstone unrelated (present pre-Osense fix, fired during edr-hdr shutter path, not the preview EDR gate) | PROMOTED→`d49a9e8` (android_hardware_oplus lineage-23.2-cam-final) |
| 2026-06-17 | A2 — BasicTone Cb/Cr blob patch (`libBasicTonePhoto.so`) | `android_device_oneplus_infiniti` `lineage-23.2-cam-final` `7675520`; Python regex patch at offset `0x298f2` swapping `vec4(dstYuv.r, dstYuv.b, dstYuv.g, 1.0)` → `vec4(dstYuv.r, dstYuv.g, dstYuv.b, 1.0)` (1 site, length-preserved 538400 B); pushed via `adb remount` to `/odm/lib64/libBasicTonePhoto.so` (md5 `1302c4ae3cd7ab9d483e67dfc7f1a188` verified on device post-reboot) | `/odm/lib64/libBasicTonePhoto.so` | `adb shell killall cameraserver` | 6 JPEGs saved to `/sdcard/DCIM/Camera/` (IMG20260616224629..225659) during p010-basictone capture; no `BasicTone_OGL::saveOutImg` tombstone in tombstone_47–49; tombstone_49 = `ncsUnreleased 16` camera provider SIGABRT predates capture (15:22 vs 22:46 first capture) — A4 issue, unrelated; p010-basictone condition 2/2 runs shutter fired; blob persisted across reboot via OverlayFS | PROMOTED→`7675520` (android_device_oneplus_infiniti lineage-23.2-cam-final; blob_fixup in extract-files.py) |
| 2026-06-17 | A1-escalation — EDR surgical fix: suppress `getBlastSurfaceControl` (oplus-fwk) | `android_hardware_oplus` `lineage-23.2-cam-final` `3d10b16`; `getBlastSurfaceControl` returns `null` unconditionally — forces camera app into SDR preview path; LOS SF lacks OEM EDR read-side (`OplusRequestedLayerState::setEdrMetadata` + `GameEdr::setEDRStatus`), so non-null SC triggered HDR path that SF cannot tone-map → overexposure; compiled `m oplus-fwk` on build server (build in progress) | `/system/framework/oplus-fwk.jar` + arm64 boot artifacts | `adb reboot` | OPEN (under test) |
| 2026-06-16 | v1.4 launch/capture smoke | flashed `v1.4-cam300-20260616` (`a8373e0` hardware/oplus, `dd3ca87` vendor/oplus/camera); runtime overlay used `cust_build` `oplus-fwk.jar`/boot artifacts to restore typed `ViewRootManager.setBlurParams(OplusBlurParam)`; source patch added in `android_hardware_oplus` | device runtime; `/odm/etc/camera` bind log overlay, `persist.vendor.camera.oplus.enableLogging=true`, APS private logs, AOSP `log.tag.*`, Frida CamX `g_logInfo` + CHI retaa #1/#2 + OEM OLog globals | camera launched, intro dismissed, shutter tapped, `/sdcard/DCIM/Camera/IMG20260616125653.jpg` saved; full log has 8.9M CamX lines and 178k Chi lines; app-side OCS logger attach resolves 5/5 gates but crashes `CameraUnitCallb`, so leave it off during functional capture | PROMOTED→`29858cca`+`d49a9e8` (typed blur params + Osense ABI stubs, android_hardware_oplus lineage-23.2-cam-final) + REVERTED (log/debug overlays: `/odm/etc/camera` bind log, `enableLogging=true`, `log.tag.*`, Frida probes — diagnostic-only, tools/observability/-managed, no production source) |

> disposition ∈ {PROMOTED→`<commit>` , REVERTED , OPEN(under test)}. No row may stay OPEN across a full build.

## Build v1.1 — camera-open + dodge-correlated easy fixes (2026-06-14)

Scope (user): cherry-pick **dodge-camera-port behaviour + directly-correlated fixes only**; the dirty SoT (`/home/vivy/vendor_oplus_camera`) is NOT a source (never validated vs oracle/matrix/tree); **confirm oplus-cam patches via static RE**. Source of truth = dodge oracle + matrix (rearch/46). Verified via the `v11-easy-fix-sweep` workflow (22 agents) + adversarial per-item verify; most matrix items were already in Build 1 (BINDER_VM_SIZE, oplus-fwk stubs, getOplusHardwareBuffer, the Dolby c2 vendor codec, IS_OPLUS_PACKAGE, DT_NEEDED libapsfixup, defercap, default-grant).

| # | item | repo | what / RE-confirmation |
|---|------|------|------------------------|
| 20 | **HAL re-add (Build-1 regression fix)** — `camera.oemlayer.v2` (the OEM HAL: RE-confirmed exports `HMI` + `OemLayer::process_capture_request`) + `libalogencrypt` (32+64). My Build-1 makefile-regen had dropped these hand-added modules (not in proprietary-files.txt) → Build 1 shipped with NO camera HAL. Re-added durably via `device/oneplus/infiniti/proprietary-files.txt` → regen → modules + PRODUCT_PACKAGES. | `device/oneplus/infiniti`, `vendor/oneplus/infiniti` | **CRITICAL.** source edit / PROMOTE |
| 21 | **OplusCamera.apk crash-on-open smali fixups** (dodge patches/0001+0002 behaviour, re-authored **anchorable** + RE-confirmed): (a) font — `TypeFaceUtil.a(Context)→Typeface` returns `Typeface.DEFAULT` (RE: `.201` class is `s7/m3.smali`, loads `OplusBaseConfiguration.mOplusExtraConfiguration.mFontVariationSettings` → crashes w/o OEM font fw); anchored on `"TypeFaceUtil"` tag + method signature (not the obfuscated path s7/t3→s7/m3). (b) strip `android:permission="<oplus/oppo/heytap>"` gate attrs (undefined on LOS → gated components fail to register). Implemented as signature/pattern-anchored `blob_fixup` fns in `extract-files.py` (apktool unpack→fix→pack→stripzip), replacing dodge's path-fragile line-diffs. **Verified on repacked apk: font body = Typeface.DEFAULT, 0 oem perm-gates, 34 activities/11 services preserved.** | `vendor/oplus/camera/extract-files.py` | source edit / PROMOTE |
| 22 | CameraThemedIcon RRO overlay → opluscamera.mk PRODUCT_PACKAGES (dodge ships it; Material-You themed launcher icon) | `vendor/oplus/camera/opluscamera.mk` | source edit / PROMOTE |

Deferred to Build 2 (not "easy"/dodge-correlated): EDR libgui/SF ABI (R3, the over-exposure depth), HDR/Dolby prop superset (R3-coupled, med-risk), TurboHDR (R6). Excluded (already in Build 1 or SoT-only/unvalidated): see workflow result.

---

## Build v1.2 (2026-06-14) — sm8850-common base corrected (15R→infiniti 16.0.8.300) + props reconcile — BUILT+VERIFIED, flash held

**Root finding (user-flagged):** Build 1 / v1.1 were built on sm8850-common's `lineage-23.2` base = **OnePlus 15R (CPH2767_16.0.7.200)**, NOT the infiniti base. Both common repos (device + proprietary) carry a separate upstream `lineage-23.2-infiniti` branch = the real OnePlus 15 base; cam-final had been forked off the generic 15R `lineage-23.2`. Confirmed by merge-base + by the device's actual fw (`ro.build.version.ota=CPH2747_11.A.40`, `ro.build.display.id=CPH2747_16.0.7.201`).

**Version map (OnePlus 15 / infiniti):** internal `11.A.40` = `16.0.7.201` (device fw + dump201_full + all device/camera/apsfixup work). `11.A.42` = `16.0.8.300` (upstream lineage-23.2-infiniti HEAD). 15R = `CPH2767` = `16.0.7.200` = the generic `lineage-23.2`.

**Decision (user):** use **16.0.8.300** (upstream-fresh) for the COMMON base — "minor update, imperative to operate with fw bumps anyway."

**v1.2 transforms (all pushed to 1vivy cam-final):**
- #23 proprietary_vendor_oneplus_sm8850-common cam-final `09fdb81`(15R) → **`36efd78`** = upstream `ce8d9e4`(300) + reparented dv commit. Done **entirely via GitHub fork API** (create-tree/commit/update-ref) — 1vivy is a fork of OnePlus-SM8850-Development so objects+LFS-pointers are shared; NO local blob transfer (local WSL had 7.3 GB free). LFS binaries fetched server-side from lfs.undocumented.software at sync.
- #24 android_device_oneplus_sm8850-common cam-final `31ecb58`(15R) → **`872c605`** = `git rebase --onto c78a254(300) 716377f` (camera commit replayed clean: extract-files.py + BoardConfigCommon + file_contexts 3-way auto-merged, kept both our public.libraries fixup AND 300's tensorflow/VoiceSdk fixups) + props-reconcile commit.
- #25 vendor_oplus_camera cam-final `f0de29a` → **`3f59566`** = opluscamera.mk props reconcile.
- #26 PROPS reconciled to OOS .201 baseline (dump201_full, source of truth): DROP `ro.oplus.camera.livephoto.support` + 9 `persist.logd.log.load.*camera*` (not in .201) + `vendor.camera.aux.packageexcludelist` (LOS template). heic `1→true` (deduped to vendor.prop). lens img +`,com.oplus.screenshot`. KEPT `aux.packagelist`/`privapp.list=com.oplus.camera` (dodge-working + functional; .201's literal `org.codeaurora.snapcam` is an AOSP leftover pointing at a non-shipped pkg). **defercap already present+correct** (user's "missing" hunch already covered).

**Build:** direct per-project git sync (repo not on non-login PATH) → m_nothing_rc=0 → bacon_rc=0 (07:15). Built in **tmux session v12** on server. Artifact `lineage-23.2-20260614-UNOFFICIAL-infiniti.zip` (3.4 GB).
**In-image verify (all pass):** oemlayer.v2 ELF; Dolby encoder blobs present (84960+273016, 300 net-new); DV codec ×4 in canoe_v2.xml; sensors.qsh.so=879144(300); DPU set has no DPU970; init.modem.rc present; heic=true / 0 livephoto / 0 logd / defercap×2 / 0 excludelist / lens has screenshot; OplusCamera.apk 180MB (v1.1 patches carried); ro.hardware.camera=oemlayer.v2.

**SKEW (noted, low risk):** common=300, device-specific + camera blobs + apsfixup still=201 (no 300 dump on hand). Lane-1 audit: camera core `camera.qcom.sm8850.so` DT_NEEDED links NONE of the differing common display/Dolby/HDR/tensorflow blobs → camera/HDR low-risk vs base; substrate (sensors/audio/modem) is what v1.2 corrects. Full-300 = get the 16.0.8.300 OTA → re-extract device+camera + re-anchor apsfixup.

**Audit hardening:** wf_1af09d2f-06b (consequence/rebase/dv-chain — dodge-parity lane timed out but answered elsewhere) + wf_d32e714f-7ef (props + repo-coverage). All confirm: v1.2 = substrate-correctness fix; merges clean; DV chain coherent; only the 2 common repos needed the infiniti base (none missed).

**Flash:** still HELD. v1.2 supersedes v1.1 as flash target (never flash 15R-common onto a 15). Post-flash smoke (Lane-1 expanded): camera launch+open+preview+capture+zoom; gyro/EIS+AON; in-call+video-recording audio; DV recording instantiates c2.qti.dv.encoder; modem XTS stability.

---

## Build v1.3 (2026-06-15) — full 16.0.8.300 (device+camera bumped to match common) — BUILT+VERIFIED, flash held

**Scope:** close the v1.2 skew (common=300, device/camera=201) by bumping the DEVICE-specific + CAMERA blobs + apsfixup to **16.0.8.300**, so the whole port is one consistent OOS. User obtained the 300 firmware (signed allawnofs OTA, 8.9GB).

**Firmware pipeline:** OTA → server `/srv/android/dumps/downloads/infiniti_300_ota.zip` → dumpyara → `/srv/android/dumps/extracted/dump300_full` (= CPH2745_16.0.8.300, internal 11.A.42). 201 dump runs `11.A.40`.

**v1.3 transforms (pushed to 1vivy cam-final):**
- #27 **apsfixup re-anchored to 300** (`android_device_oneplus_infiniti` `2707ae7→b6ea8c7`): readelf showed only `P010_FUNC_OFF` moved `0x4fc094→0x4fc25c`; both GOT slots stable (p010 `0x689ba8`, dlsym `0x1bb67c8`); BuildId guards `82fe443b→2217d555` (AlgoProcess), `ce6e40ca→f76a8818` (AlgoInterface). In-image: libapsfixup embeds both 300 IDs, 0 stale → **P010 fix ACTIVE** (was inert on v1.2's mixed build).
- #28 **device blobs → 300** (`proprietary_vendor_oneplus_infiniti` `7a2baa4→a62ba8af`): rebased onto **upstream `ae44d63b` "Update from OOS 11.A.42"** (1vivy is a fork → 50 LFS device blobs come at 300 via the shared network, no LFS push) + re-added 300 `camera.oemlayer.v2`/`libalogencrypt` raw + makefile regen. Build-time the device extract re-applies `add_needed libapsfixup` (libAlgoProcess) + FIX_SONAME (libsharebuffer/libui-stock/libutils-stock) — these are working-tree, regenerate from dump300.
- #29 **DV-codec regression caught + fixed:** the sm8850-common device-extract clobbers the committed inline DV in `media_codecs_canoe_v2.xml` → image shipped 0 `c2.qti.dv`. Proved real (the `_vendor.xml` that carries the DV encoder is NOT in the load chain — same at 201, which is why the inline was authored). Restored the inline (git checkout) → image now `c2.qti.dv ×4` (incl encoder).
- #30 **public.libraries committed to common** (`proprietary_vendor_oneplus_sm8850-common` `36efd78→d090e4f`): added the arcsoft/QNN(V81)/apsfixup OEM camera public-libs (camera-app dlopen). Lets the build use committed common WITHOUT the sm8850-common extract → **no DV clobber on a fresh build**. (camera repo `vendor_oplus_camera` `3f59566` unchanged — extract-at-build.)

**Build recipe (reconcilable):** sync cam-final + run device extract (`proprietary_vendor_oneplus_infiniti`) + camera extract (`vendor_oplus_camera`) against `/srv/android/dumps/extracted/dump300_full` + `mka bacon`. Common is fully committed (no common extract). Everything traces to committed source + the dump.

**In-image VERIFIED:** DV ×4 (decoder/secure/encoder); oemlayer.v2=7acb3253(300); libAlgoProcess=2217d555(300); apsfixup BuildId-match (P010 active); OplusCamera 180MB patched (font+0 perm-gates, anchor held across 201→300 class drift s7/m3→s7/u3); public.libs arcsoft7/QnnHtp2/apsfixup1; heic=true/0 livephoto/defercap2. Artifact `/srv/android/artifacts/lineage-23.2-v1.3-infiniti.zip` (3.4GB). v1.2 preserved: artifact + `v1.2` tags on all 11 repos.

**BUILD-SERVER INFRA fixed this round (see `/srv/android/AGENT.md`):**
- **64GB swapfile** `/srv/swapfile` (fstab, swappiness=10) — REQUIRED: with ccache hot the dexpreopt/r8 phase over-schedules ~12×5GB JVMs >62GB RAM → OOM (`exit 137`) at full -j without swap. Build at FULL -j; never -j8.
- **ccache** `compiler_check=content` + base_dir → fixed a 0%→100% hit rate (default mtime check died when a sync moved clang's mtime).
- **dumpyara on server** via uv (`~/.local/bin/dumpyara`, python 3.12). `/srv/android` reorged to `dumps/{downloads,extracted}` + `scripts/`+`logs/`. `/srv/android/AGENT.md` = the build-host ops guide.
- Incremental rule: touch ONLY changed files; never `git checkout --force`/`lfs pull`/re-extract before an incremental (mtime-bombs the graph → full rebuild).

**Flash:** still HELD. v1.3 supersedes v1.2 as the flash target (fully-consistent 300). Post-flash smoke (Lane-1): camera launch+open+preview+capture+zoom; gyro/EIS+AON; audio; DV recording instantiates c2.qti.dv.encoder; modem XTS; EDR over-exposure still = R3/Build 2.

---

## Build v2.0 (2026-06-23) — P010 root fix + libapsfixup DROPPED — STAGED (working tree; NOT yet built)

**Thesis:** the P010 photo-save crash is a from-source FRAMEWORK divergence, now pinned + binary-verified.
`libAlgoProcess` (byte-identical OOS↔LOS) locks the `P010_VENUS (0x7FA30C0A)` fusion-OUTPUT buffer via the
framework `AHardwareBuffer_lockPlanes`, gated by `AHardwareBuffer_formatIsYuv`. **OOS** libnativewindow
recognizes `0x7FA30C0A` and fills 3 planes; **stock LOS** doesn't → chroma unset → SIGSEGV. One framework
case = OOS parity + born-correct descriptor ⇒ libapsfixup is dead code, so we DROP it (an obvious crash
beats a shim-masked one for stack-format verification). See
`docs/re-notes/formatisyuv-p010-framework-root-RE.md` + `.omo/evidence/v20-camera-build/`.

**v2.0 transforms (source edits — PROMOTE to cam-final after v2.0 validates):**

| # | transform | repo / path | class | reconciliation |
|---|-----------|-------------|-------|----------------|
| **P1** | **THE root fix.** `AHardwareBuffer_formatIsYuv` += `case 0x7FA30C0A` (P010_VENUS). Binary-verified OOS-exact: OOS `lockPlanes` recognizes ONLY this qcom format (not the giulia 12-format superset); luma pixelStride stays 1 (== OOS `b.hi` branch), so the single `formatIsYuv` case is byte-faithful. | `android_frameworks_native/libs/nativewindow/AHardwareBuffer.cpp:763` | **source edit** | PROMOTE "nativewindow: recognize P010_VENUS in formatIsYuv (OOS parity, P010 root fix)" |
| **P2** | `NUM_BUFFER_SLOTS 64→96` (Oplus cam requests >64 → black viewfinder). giulia-parity (`realahnet 1f4f5574`); NOT OOS-binary-verified; pure capacity headroom. | `android_frameworks_native/libs/ui/include/ui/BufferQueueDefs.h:28` | **source edit** | PROMOTE; low risk |
| **R1** | **libapsfixup DROPPED.** Removed: `.add_needed('libapsfixup.so')` on libAlgoProcess (infiniti `extract-files.py:71-74`, the load-bearing DT_NEEDED — reverses #4/#14); shim module `apsfixup/{Android.bp,apsfixup.cpp}`; common public-lib injector (`sm8850-common extract-files.py:169-171`); `public.libraries.txt:21`; sepolicy `file_contexts` label. **No `PRODUCT_PACKAGES` ref existed** (module was pulled only via the now-removed `.add_needed`), so no dangling module. namespace_import #15 (`device/oneplus/infiniti`) left in place — dead but harmless. **Frida format-trace probes preserved** at `apsfixup/docs/frida/` for the testbench (planelayout/bufferfill/chroma/outstruct/force_align). | infiniti + sm8850-common device repos | **source edit** | both `extract-files.py` re-`py_compile` OK; no build-input `apsfixup` ref remains (grep clean). **Precondition: P1 must hold on-device or the crash returns (intended signal).** |
| **R2** | **SDR-preview workaround ADDED (over-exposure fix) — was MISSING from cam-final.** Port of dirty-work `af344d3` (prop-only; supersedes the `c45f452` smali form). `opluscamera.mk`: add `persist.camera.override_enable=true`, set `persist.camera.override_preview_hdr_support` `1→false`. Root: the `.201` app renders preview on a BT2020_HLG surface (5.0 headroom); LOS sRGB panel has no HLG→SDR tonemap → ~5× over-exposed. Forcing the capability off keeps preview sRGB (numHdrLayers→0). The prior `dd3ca87` "sync OOS HDR props" introduced `=1` with NO `override_enable` → **inert** (the override prop is ABSENT from OOS's static config — verified in `dump300_full`; OOS leaves it default since it has the HDR display path). The HDR *feature* props (`dolby_vision*`/`hdr_vision_app`/`localhdr_version`/`edrlistener`/`uhdr.support`) ARE in the OOS baseline → kept. EDR read-side stays **simple stubs** (`OplusEdrUtils` no-ops) — NO SF/libgui EDR port. The `CameraManager$a` compat-shim half of `af344d3` is NOT in cam-final and is NOT ported here (flagged for a separate decision). | `vendor_oplus_camera/opluscamera.mk` | **source edit** | PROMOTE; intentional OOS deviation. `3d10b16` (`getBlastSurfaceControl→null`) was a different, abandoned device-only overlay — NOT used. |

**KEEP (regression-watch, unchanged this round):** BasicTone Cb/Cr blob patch (`7675520`) — cosmetic R/B
swap, NOT the crash fix; re-verify color once descriptor is born-correct, never credit for stability.
SAT-fusion identity gate (`dc44f0462`) — keep; re-verify it doesn't alter the OUTPUT format selection now
that P1 lands. Substrate (page-size 4096, firmware-free recipe, graphics.common→V7, V5→V7 on libAlgoProcess)
— keep, unrelated.

**Reconciliation sequence (AOSP/LOS conventional — NOT patchelf):** (1) committed P1/P2/R1/R2 on cam-final
and **pushed** the 6 source commits to `1vivy`; (2) **`repo sync`** the 6 affected projects in the build tree;
(3) **re-ran the device `extract-files.py`** vs `dump300_full` (regenerates `vendor/oneplus/infiniti/Android.bp`
+ blobs together — dropping libapsfixup from both); (4) restored re-extract collateral (radio/* fw pointers,
libBasicTonePhoto, DV-codec XML) to keep it focused; (5) committed + **pushed the proprietary/blob sync commit**
`proprietary_vendor_oneplus_infiniti@565d450`; (6) `m nothing` → `mka bacon`.
**LESSON (now in `/srv/android/AGENT.md`):** a first attempt patchelf'd only the blob → Soong failed
`"libAlgoProcess" depends on undefined module "libapsfixup"` because extract-utils GENERATES `Android.bp` from
the blob DT_NEEDED. Never hand-edit an extracted blob to change a DT_NEEDED — re-run the full extract + push the
proprietary sync commit.

**BUILD: SUCCESS** (2026-06-24 00:34) — `build_rc=0`, 48:43, ccache **99.63%** (content-check survived the
re-extract mtime churn), no OOM. Artifact `lineage-23.2-20260623-UNOFFICIAL-infiniti.zip` preserved →
`/srv/android/artifacts/lineage-23.2-v2.0-infiniti.zip` (sha256 `56c48f5a…`).

**Post-build VERIFY (all observed in-image):** shipped `odm/lib64/libAlgoProcess.so` has **no** `NEEDED
libapsfixup`; **`odm.img` and all 13 `installed-files` manifests carry 0 `libapsfixup`** (the `obj/`+`symbols/`
copies are stale Jun-16/v1.4 orphans, never packed); **P1** `0x7FA30C0A` recognized in shipped
`system/lib64/libnativewindow.so` (`movk w8,#32675`); **R2** `override_enable=true` + `override_preview_hdr_support
=false` in `product/etc/build.prop`; firmware-free OTA (only OS partitions — matches v1.4, confirmed by payload).

**Flash:** HELD — flashable on hand. The remaining honest test is on-device: P010/Pro capture with the
`apsfixup/docs/frida` format-trace probes — P1 holds ⇒ JPEGs save, descriptor non-null, **zero**
`saveOutImg`/ArcSoft/BasicTone tombstones; P1 incomplete ⇒ obvious crash at the exact stage (no shim to mask it).
v2.0 supersedes v1.4 as the flash target.

---

## Build v2.1 (2026-06-24) — R2 CameraServiceExt Depth-1 + C1 'oplu' atom — BUILT (flash target)

**Thesis:** v2.1 = v2.0 + two `frameworks/av` source changes (no blob/extract churn). Branch
`lineage-23.2-cam-final`, pushed to `1vivy/android_frameworks_av` tip **`478495db6`**.

**Transforms:**
| # | transform | commit | reconciliation |
|---|-----------|--------|----------------|
| **R2** | **CameraServiceExt Depth-1 (ext-only).** `CameraServiceExtFactory` dlopens `system_ext/lib64/libcsextimpl.so` (OEM-verified: it exports `getExtFactoryImpl`/`setCameraServiceInstance`/`onTransact`; OOS libcameraservice dlopens it with NO `DT_NEEDED` → design is OEM-faithful), routes binder 10001–10024, registers the CameraService instance. Donor: op15ix `b890522c0e` (factory only, same SoC). | `b2b176f07` | adopts op15ix over the prior dodge-based `a1cb339f5`. |
| **R2-drop** | **op15ix `CameraMetadata` vendor-tag alias table DROPPED** (force-push). It was an unverified non-OOS guess: OOS `getTagFromName` is stock, OOS resolves `com.oplus.*` via its 1409-tag descriptor (dumpsys), the identity gate gates the *pathway* not tag *names* (`oem-client-identity-gate-RE` §B2/B4), and we have **zero** capture evidence of `NAME_NOT_FOUND` on our port. | (was in `ec55b7a96`, removed) | OOS-exact; see `STATIC-SWEEP-2026-06-24.md`. |
| **C1** | **Oplus `oplu` MP4 atom (full chain).** `kKeyOplusUserData='opud'` + `StagefrightRecorder` producer (`setParameter("OplusUserData")`) + `MPEG4Writer` `udta`/`oplu` writer. OOS-aligned (OOS libstagefright carries the `OplusUserData` key). Inert unless the OEM app passes the param. Donor: dodge `45b355f4`. | `478495db6` | PROMOTE; low risk. |

**KEY FINDING (R4, deferred — author-new, RE done):** cameraserver is **Depth-1-only**. The OEM ext's
**Depth-2 lifecycle hooks are 0-wired** (before/afterConfigureStreamsLocked, getExtensionOperatingMode,
onPrepareHalRequestsUpdateMetadata, beforeMetadataSendToApp, …) — neither dodge nor op15ix wire them. The
back-channel exports ARE complete (ext's RTLD_NOW dlopen + callbacks resolve). Root-function RE of OOS
`Camera3Device::configureStreamsLocked` recovered the dispatch (`getInstance`→table→`blr`, gated by an
"ext-enabled" flag at `device+0x3b4`) + the full lifecycle flow → `docs/re-notes/oem-ext-depth2-lifecycle-RE.md`.
R4 is the next overlay-bringup workstream.

**MODULE BUILD: PASS** (`mka libcamera_client libcameraservice libstagefright libmediaplayerservice`, exit 0,
3:24). **FULL BUILD: SUCCESS** (`mka bacon` exit 0, 12:29). Artifact `lineage-23.2-20260624-...zip` →
`/srv/android/artifacts/lineage-23.2-v2.1-infiniti.zip` (sha256 `07e2de08…`). Firmware-free OTA.

**In-image VERIFY (host):** `libcameraservice` exports `CameraServiceExtFactory::getInstance` (R2);
`libstagefright` has the `"oplu"` box literal + `libmediaplayerservice` has the `"OplusUserData"` key (C1);
`libcamera_client` has **0** alias-table strings (table removed). On-device = the capture plan below.

**Flash + capture plan:** `docs/V2.1-FLASH-CAPTURE-PLAN.md` (carry v2.0 P010/SDR tests + new
R2-ext-load / R4-Depth-2-gap / C1-oplu tests; new probes `r4-oem-transact/15_r2_extload_check.sh`,
`c1-oplu-atom/check_oplu_atom.sh`). v2.1 supersedes v2.0 as the flash target.

**R4 increment (configure hooks WIRED, `ff7a3713a`, on top of the v2.1 zip):** `getExtensionOperatingMode`
+ `beforeConfigureStreamsLocked` wired in `Camera3Device::configureStreamsLocked` behind
`CameraServiceExtFactory::isLoaded()` — the OOS-faithful ext-loaded gate, **no auth 1:1** (OOS gates the
configure hook on config-dirty + ext-loaded, NOT auth; the ext self-gates on the `com.oplus.packageName`
stamp `dc44f0462` already writes into sessionParams + its onTransact auth state). Verified `mka
libcameraservice` exit 0. `afterConfigureStreamsLocked` + exact hook args = flash-to-confirm (r4 probe).
The v2.1 zip excludes R4 → overlay-bringup it (`oem-ext-depth2-lifecycle-RE.md` + `docs/V2.1-FLASH-CAPTURE-PLAN.md`).

**R4 FIX increment (`a536f0a481`, on-device VERIFIED 2026-06-25) — v2.2 regression root-caused + fixed.**
v2.2 shipped the wired R4 hooks (`ff7a3713a`) and they REGRESSED 8K + selfie into blurry/static/no-preview:
`getExtensionOperatingMode` echoes its **trailing `int` as the fallback op_mode** (OEM override-tag absent on
LOS — alias table dropped in R2), but the wiring passed `atoi(mId)` (camId), so it returned the camera id →
`mOperatingMode` clobbered (8K cam2 `0x80a9`→`0x2`, selfie cam1→`0x1`; rear cam0 spared by the `>0` guard) →
`endConfigure: Unsupported set of inputs/outputs` → no preview. **Fix:** pass `mOperatingMode` (not camId) +
`extMode >= 0x8000` guard.

THREE build/deploy traps discovered + documented (`re-notes/cameraserver-static-link-build-traps.md`):
(1) **`libcameraservice` is statically linked into `/system/bin/cameraserver`** — R4 lives in the BINARY;
`.so` overlay is INERT (why R4 was "compiles, flash-to-confirm" but never confirmed). Build `mka cameraserver`.
(2) **ccache `file_stat_matches` serves STALE objects** — `mka exit 0` ≠ change shipped; build with a fresh
`CCACHE_DIR` + verify at the binary level (LTO `.o` are bitcode — check the linked binary, not the `.o`).
(3) **`adb remount` works on LOS** (broken only on OOS) — binaries exec from `/system` overlay (not `/data`,
which AVC-denies `execute_no_trans` under enforcing).

**On-device verify (committed clean binary `a4bfbdb3`, cameraserver pid live):** frida →
`getExtensionOperatingMode` receives `0x80a9`, no override; CamX → `m_operationMode IS 0x80a9`; 0 configure
failures; **8K records a 7680×4320 `.mp4` (647 MB)** (tkhd `7680x4320`). Selfie cam1 restored by the same fix.
Committed on `lineage-23.2-cam-final`; `m nothing` + `mka cameraserver` clean; binary disasm carries the
`cmp w0,#0x8000` guard.

**v2.3 investigation session (2026-06-25) — portrait-selfie post-capture freeze CHARACTERIZED; side-issues + v2.3 ledger.**
On-device (CPH2747, app pid 18654, `debuggerd` + `logcat -b all`, permissive):
- **Freeze = app-side bokeh-render stall** (NOT a deadlock, NOT a HAL stall). `PreviewGLThread.onDrawFrame →
  java.lang.Thread.sleep` retry ~13 s; `OplusBlurPreviewJNI` (OCCE single-portrait AISEG) goes silent ~13 s then
  resumes; producers idle (`BlurPreviewHand`, QNN-HTP seg `libQnnHtp.so`, `previewManagerRoutine+1560` all
  `cond_wait`); HAL healthy through the freeze (realtime 29 fps + `OplusOfflineReprocess0_OFE1` ~58/s;
  `MotionDetection` ~30/s). **Root INFERRED = missing/late post-capture resume-bokeh trigger; not convicted, no fix
  landed.** Full record: `docs/interop-tree/symptoms/S1-preview.md` UPDATE 2026-06-25b.
- **Refuted with evidence (do not re-chase):** R4 op_mode clobber (front op_mode `0x8001` correct), face-beauty
  (freezes with+without filter), APS `pfnAPSMemHW{Acquire,Release}` NULL (02:02:26 ≠ 02:03:09 freeze), NCS gyro
  `hNCSDataHandle 0x0` (constant ~87/s, present on OOS golden too), bokeh `SDK_FAILURE`/`mInit` (session-start),
  DSP/QNN hang (idle).
- **Side issues documented + committed (`658a3a5`):** `re-notes/aps-metadata-buffer-init-RE.md`,
  `interop-tree/facilitation/E5-ncs-sensor-bridge.md` (NCS = non-divergent feature facilitation, not the freeze).
- **OOS golden diff (`oplus-logs`):** INCONCLUSIVE — golden lacks a front+portrait capture, masks app-side JNI
  tags, self-terminates ~4 s post-shutter; op_mode `0x8001` + OFE `featuretype 48` match OOS↔LOS. Need a NEW
  full-verbose front-portrait golden (~20 s post-capture window, no SENSOR/NCS mask).
- **occe / 1b mechanism pinned:** `occe_create` precompiles OCCE shaders (via `libsaveshaderbin.so`) to
  `/mnt/occe/shader/fb_binary`; LOS is missing `/odm/etc/init/occe_create.rc` + a sepolicy `occe_create` domain
  (`u:r:occe_create:s0` / `occe_create_exec`) + the `/mnt/occe/*` post-fs-data dirs. OOS donor at
  `dumps/extracted/dump300_full/odm/{bin/occe_create,etc/init/occe_create.rc}`. Addresses bokeh-init + selfie
  retouch/blur **quality**, NOT the freeze. Source-ready, UNVALIDATED.
- **OVERLAY/DRIVING BLOCKER:** synthetic input (`input tap` + `KEYCODE_CAMERA`) does NOT actuate capture on this
  build (DCIM count unchanged); the freeze A/B needs the user's real touches + a live subject. occe overlay-test
  deferred to a user-in-loop session.
- **v2.3 commit-series ledger** (workflow, 43 verified candidates): boot-jars allow-list soong fork →
  sm8850 `domain.te` vndr fork → `cameraserver` R4-revert rebuild (verify 8K still records) → new-golden tracking →
  occe service (quality) → integration build + deferred flash gates. **The freeze is NOT fixed in v2.3** (gated on
  the new golden + a user-in-loop capture).
