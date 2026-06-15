<!-- STATUS: VERIFIED — evidence-anchored (Ghidra/device capture); no inference-surgery needed (doc-50 method). -->
---
id: OOS-BL-001
title: "OOS V16.1.0 stock camera baseline — CPH2747/OP611FL1 (tooling bring-up + golden photo capture)"
skill: L2-multimedia-audio-expert
date: 2026-06-13
source: oem-baseline-capture
device: OnePlus CPH2747 / OP611FL1 (ossi), OxygenOS V16.1.0 (display 16.0.7), build BP2A.250605.015 user/release-keys
artifacts: reference/ab/oos-photo/   (logcat_all, dumpsys_camera_{pre,post}, sf_{pre,post}, app_backtrace, {cameraserver,camera}_daemon_bt, ui_action, meta)
---

## Scope
First baseline session on the **stock OOS reference unit** for the Oplus→custom-ROM camera port.
Goal: stand up + confirm the testing tools, then capture a *golden working* stock photo cycle to diff
LOS against. This is the **denominator** for `tools/observability/TEST-PLAN.md` rows. SELinux Enforcing;
rooted via KernelSU (`u:r:ksu:s0`). Device prepped: screen-off 5 min, stay-awake on USB, lockscreen off.

## Tooling readiness (confirmed on V16.1.0)
- Host: `frida 17.9.11`, `python3 3.12.3`, `adb 1.0.41`. Device: KernelSU `su`, `frida-server` running.
- Device tools present: `simpleperf`, `atrace`, `perfetto`, `uiautomator`, `debuggerd`.
- `strace`: **was absent** — pushed static aarch64 `strace 6.7` (Zackptg5/Cross-Compiled-Binaries-Android)
  to `/data/local/tmp/strace`; **ptrace-attaches to cameraserver under Enforcing** via KernelSU su (no
  `setenforce 0` needed just to attach). Binary git-ignored at `tools/observability/strace/strace.aarch64`.
- `debuggerd -b` works for **native daemons** (cameraserver/provider) — reliable, non-fatal. For an ART
  **app** process its output is unreliable on this build; freeze diagnosis should lean on the daemon bt.

## Insight — the load-bearing findings

### 1. Stock camera can enter a MediaCodec crash-loop; **reboot clears it** (reusable hindsight)
On first launch attempts the stock `com.oplus.camera` **crash-looped** (a fresh tombstone ~every 1.4 s):
`SIGSEGV` in `/system/lib64/libstagefright.so`
`VideoRenderQualityTracker::Configuration::getFromServerConfigurableFlags` → `MediaCodec::MediaCodec()`
→ `MediaCodec::CreateByType`, in a **`SoundDecoder` thread** (shutter/focus-sound decode). `am start`
reported `Status: ok` but the process then died → bounced to launcher. **Logs showed `CameraService::connect`
so captures *looked* successful — only a screenshot revealed the UI never came up.**
- `libstagefright.so` was **stock & unmodified** (clean `system_lib_file` context, not bind-mounted); no
  `render_metrics` `device_config` override existed. **Not** caused by our verbosity levers (they touch only
  `log.tag.*` + the `/vendor/etc/camera` CamX-logging overlay — never MediaCodec/stagefright).
- **A single `adb reboot` fixed it** — afterwards the camera opens, holds foreground
  (`com.oplus.camera/com.oplus.camera.Camera`), and renders live preview (visually confirmed).

**Lesson:** if the stock (or ported) camera bounces to launcher with a `VideoRenderQualityTracker` /
`MediaCodec` SIGSEGV in a SoundDecoder thread, it is **transient device state — reboot first**, do *not*
chase it as a camera-pipeline bug. Always **visually confirm preview** (`screencap`) — a `CameraService::connect`
in logcat is necessary but **not sufficient** proof the camera actually came up.

### 2. /system framework IS runtime-instrumentable on stock V16.1.0 (resolves TEST-PLAN G1 for the stock side)
After `enable/20_system_framework.sh`, a photo cycle yielded **`CameraService` / `Camera3-Device` VERBOSE
lines** (incl. `CameraService::connect`, `OplusCameraService: CameraServiceExtImpl.cpp`). So AOSP
`log.tag.*` bridges the /system camera framework here — **no eng debug image needed for stock-side visibility.**

### 3. Stock golden-baseline readings (reference/ab/oos-photo, photo of an indoor scene)
| Signal | Stock OOS value | Note for the LOS A/B |
|--------|-----------------|----------------------|
| CamX fusion-graph nodes | **present** (1012 log lines / 3030 mentions: MCXSuperFG, OplusSATFusionOfflineReprocess…) | LOS≈0 ⇒ graph-selection divergence (#2/G2) |
| `libcsextimpl` in cameraserver `/proc/maps` | **present (4 mappings)** | LOS absent ⇒ G5 confirmed (OEM cameraserver layer dropped) |
| SurfaceFlinger HDR/color | `supportedHdrTypes=SYSTEM`, `Current color mode: ColorMode::DISPLAY_P3` | diff vs LOS for #3/G6 over-exposure co-factor |
| `media.camera` UNKNOWN_TRANSACTION | 16 (baseline noise level; compare deltas) | LOS spike ⇒ OEM 100xx dropped (G5) |
| `hdr_detected` publish | **0 mentions — NOT triggered by an indoor photo** | needs an HDR-triggering scene; re-capture for the #2 stock value |
| cameraserver daemon bt | 12 threads, healthy (working-state ref) | the G4 working baseline to diff the freeze #1 against |

### 4. B1 / G3 StaticSettings dump — RESOLVED (offset re-derived; dump captured)
`tools/frida/dump_camxsettings.js` calls `WriteCamxSettingsToFile` **by offset** (non-exported). The
on-device lib is **build-id `1e7abaf1521db441ffc3e9dd70cd8c77`** (V16.1.0 = 16.0.7.201; the lib is md5-identical
to the `.201` dump — see §5, so the offset was never at risk). Re-derived in
Ghidra (image base `0x100000`): `CamX::SettingsManagerImpl::WriteCamxSettingsToFile` is at Ghidra
`0x113168` → runtime **`+0x13168` — UNCHANGED** from 16.0.7.201 (confirmed by symbol + the decompiled
code being the dumper + a valid `paciasp` prologue). The script now **self-checks the 16 prologue bytes**
(`3f2303d5fd7bbca9fc5f01a9f65702a9`) before calling, so a wrong-build offset can never crash the provider.
Ran **under Enforcing** (no `setenforce 0` needed — KernelSU frida injection into the provider works) →
`reference/camxsettings/oos-V16.1.0.txt` (1061 settings, by NAME = build-independent).

**Finding that refines ROOT-A (#2):** on stock V16.1.0 at idle/PHOTO, **`selectSHDRAutoExposureUsecase
(0xDC4EAFC3) = 0`** — NOT `1` as the attribution matrix assumed. Other HDR levers also read 0 at idle
(`setHDRMode`, `setAutoHDRMode`, `enable3expSHDRSnapshot`, `selectedDCGMode`, `isSHDRFusionOffline`),
while `MFHDRHWEnable`/`enableHWMFHDRSnapshot`/`enableAutoHDRCapability` = 1. So the ROOT-A lever is **not
a static stock default** — it is likely set dynamically during an HDR-triggering session. **Re-capture the
dump during an actual HDR scene/snapshot** to confirm whether stock flips it to 1 then; that is the real
OOS-vs-LOS comparison. (The by-offset struct *reads* `+0x6a28`=0 agreed with the by-name value, but trust
the NAMES — struct layout is build-pinned and unverified on V16.1.0.)

### 5. CamX/CHI log-clobber offsets — RE-VERIFIED valid on V16.1.0 (unblocks the log-unclobber instrument)
**Version note:** OOS **V16.1.0 *is* 16.0.7.201** (`ro.build.version.incremental` = `B.R4T3.4af8531…`; the
".201" is the internal increment, "16.1" is just the general OOS-16.1 branding). So the offsets
`patch_chi_logclobber.py` "Verified on 16.0.7.201" were always the *same build* — confirmed empirically: all
THREE log libraries are **byte-identical (md5)** between the live device and the `op15-work/dump201_full` (.201)
dump, and all FOUR clobber prologues are intact (`patch_chi_logclobber.py --verify --extlayer-aggressive`):

| # | lib | clobber fn | offset | md5 (live ↔ .201) |
|---|-----|-----------|--------|-------------------|
| 4 | `libcamxsettingsmanager.so` | `OverrideLogSettingsAtConfigureFile` | `0x151c4` | `ca57937e…` identical |
| 2 | `com.qti.chi.override.so` | `ExtensionModule::ModifyLogSettings` | `0x4ab6f8` | `3f25d020…` identical |
| 1 | `libextensionlayer.so` | `OverrideChiLogSettingsAtConfigureFile` | `0x4000c` | `0c33572b…` identical |
| 3 | `libextensionlayer.so` | `OnPostModifySettings` (has functional tail) | `0x41a18` | (same lib) identical |

⇒ build-pinned offsets are safe; **the log-unclobber instrument is trustworthy on V16.1.0.** #1/#2/#4 take the
`retaa` no-op; #3 is preferably neutralized by `setprop persist.vendor.camera.oplus.enableLogging true` (preserves
its tail vtable call). This is the **cheapest path to CHARACTERIZE the CamX/CHI plumbing** — let the stack narrate
its own SHDR graph-selection decisions (interop-tree C5: observe/record the plumbing, do **not** convict the knob).
Pulled read-only (`su cp`→`/data/local/tmp`→`adb pull`→`rm`); no device state changed.

## Tooling fixes made this session (test-quality, in `tools/observability/`)
All discovered *by running the real device* — the point of a baseline shakedown:
1. **`pgrep -f camera-provider` matched nothing** (provider cmdline is `vendor.qti.camera.provider-service_64`
   → dot, not dash). Fixed repo-wide to `camera.provider` (6 scripts incl. the pre-broken `enable/30_aps_native.sh`).
2. **toybox `grep` lacks `\|` BRE alternation** → `sf_*.txt` were empty. Switched to `grep -iE`.
3. **`/data/anr/` is empty on A16** (SIGQUIT traces don't land there) → `ab_capture.sh` now uses
   `debuggerd -b` for the app *and* the native daemons (`*_daemon_bt.txt`).
4. **tombstone freshness guard** — `ab_capture.sh` now copies a tombstone only if `mtime >= cycle start`
   (was copying the newest unconditionally → stale crashes).
5. **SurfaceFlinger token reality** — this build reports `supportedHdrTypes=` / `ColorMode::` /
   "Wide-Color", not `hdrCapabilities`/HLG/PQ literals; updated `ab_capture.sh` grep + `parse_ab.py` `t_edr`.
6. **freeze detector** (`parse_ab.py` `t_freeze`) no longer mis-reads native debuggerd bt as "stalled".
7. **`resmap.sh`** filled for this build: `shutter_button`, `switch_camera_button` **confirmed by id**.
8. **Workflow gotcha:** `adb push <dir>` onto an *existing* remote dir nests it (`obs-capture/capture/…`) —
   always `adb shell rm -rf` the remote dir before re-pushing, else the old script keeps running.

## Open follow-ups (priority order)
1. ✅ **DONE — `WriteCamxSettingsToFile` offset re-derived** (`+0x13168`, unchanged) + script made build-safe
   + stock dump captured to `reference/camxsettings/oos-V16.1.0.txt`. See §4.
2. ✅ **DONE — mode-strip swipe in `drive_cycle.sh`** — `swipe_to_mode`/`goto_mode` navigate by reading the
   `headline_view` mode name and sweeping both directions; verified PHOTO→VIDEO on-device. `launch()` now
   cold-starts + wakes (the app sleeps/blanks the strip when idle → `current_mode` empty otherwise).
3. **#2 stock value needs an HDR scene** (now the TOP open item) — `selectSHDRAutoExposureUsecase`=0 at idle
   (§4); re-capture the camxsettings dump **and** `ab_capture.sh photo` pointing at a high-dynamic-range
   scene to see whether stock flips the SHDR levers / publishes `hdr_detected`. This is the real ROOT-A check.
4. **8K toggle id** for `video8k` (#8) — the 8K resolution toggle inside VIDEO settings has no stable
   resource-id; `drive_cycle video8k` currently records plain VIDEO and logs the gap. Calibrate the toggle
   (uiautomator dump in VIDEO mode → fill `resmap.sh RID_8K_TOGGLE`, or a tap coordinate).
5. Minor: provider daemon bt filename is `camera_daemon_bt.txt` (from `camera.provider`); rename to
   `provider_daemon_bt.txt` for clarity.
6. **LOS side**: repeat this exact `ab_capture.sh photo` on the LOS build, then
   `parse_ab.py reference/ab/oos-photo reference/ab/los-photo` for the first real A/B. Same for the
   camxsettings dump (`reference/camxsettings/los-*.txt`) — diff BY NAME.

## Cross-Skill Impact
- **L2-security-selinux-expert** — strace under Enforcing is the planned path to surface the #5 allocator/
  mapper `EACCES`; audit2allow workflow applies once we have the LOS denial.
- **L2-hal-vendor-interface-expert** — `libcsextimpl` presence (G5) + the camera provider
  `vendor.qti.camera.provider-service_64` are the OEM/AIDL boundary to preserve in the port.
- **L2-framework-services-expert** — `CameraServiceExtImpl` OEM binder layer logs on stock; absent on LOS.
