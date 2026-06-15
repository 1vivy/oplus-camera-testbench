<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-15 -->

# reference

Output tree for all captures produced by `tools/observability/`. Each subdirectory is either the
direct output of a named kit or an indexed manifest produced by `capture/baseline.sh`. No file here
is hand-authored; every artifact is a kit output or a parser verdict.

## Purpose

Accumulate the raw captures and parsed verdicts that feed the OOS↔LOS attribution workflow. A
capture without its `parse_*.py` output is half a test — the directory alone proves nothing until
the parser has emitted an OOS-vs-LOS verdict.

## Key Files

| Capture dir | Producing script | What it does | What it resolves / diagnoses |
|---|---|---|---|
| `reference/baseline/<cond>/` | `capture/baseline.sh <cond>` | GOLDEN entry point: preflight → validate\_modes gate → full\_baseline lanes 1-4 (framework+graph ab\_capture, provider probes, app probes, r3, r4) → strace lane → auto-parse → VERDICT (GOLDEN / PARTIAL / BLOCKED). Writes `BASELINE.md`, `verdict.json`, `links.txt` (indexes raw lane dirs), and `parse_*.txt` per parser. Heavy raw artifacts stay in their lane dirs; this dir is the manifest. | End-to-end single-condition verdict. GOLDEN iff preflight=ready AND modes-gate=PASS AND core ran AND signal=all-stable. The primary artifact to cite in bug reports. |
| `reference/ab/<tag>/` | `capture/ab_capture.sh [mode] [session]` (device-side, via adb su) | One identical camera cycle (launch → preview → shutter → settle → close): clears logcat, captures all buffers + dumpsys camera pre/post + SurfaceFlinger HDR state + debuggerd backtraces for app/cameraserver/provider + fresh tombstones. Auto-tags artifacts by `ro.build.version.oplusrom` (or `ro.lineage.build.version`) so OOS and LOS runs stay distinct. UI stimulus delegated to `drive_cycle.sh` when a mode is given; falls back to legacy `KEYCODE_CAMERA` keyevent. | Both halves of the OOS↔LOS A/B diff: framework layer (logcat\_all, dumpsys) + native daemon backtraces. Run OOS then LOS with the same mode arg → diff per-subsystem. |
| `reference/campaign/<cond>/run<k>/` | `campaign/run_condition.sh <cond>` | Host orchestrator: enables verbosity once (reversible), attaches provider-side Frida probes (`enable_camx_logging`, `unclobber_camx_logs`, EXTRA\_PROBES) for the whole condition, then runs REPEAT\_N identical replay-driven `ab_capture` cycles. Writes `metadata.json` (condition fingerprint) and calls `parse_condition.py`. | Determinism gate: REPEAT\_N runs of the same stimulus; `parse_condition.py` emits ALL\_STABLE or flags divergence. Provider-side frida logs in `reference/campaign/<cond>/frida/`. App-side probes (trace\_edr\_invocation, trace\_preview\_delivery, etc.) need a separate `app_probe_capture.sh` run. |
| `reference/campaign/full-baseline/` | `campaign/full_baseline.sh <cond>` | Composes all four lanes in one pass: (1) `run_condition.sh` (framework+graph + provider probes), (2) `app_probe_capture.sh` (app-side probes via DRIVE\_NAVONLY attach), (3) `r3-gralloc/30_run_r3.sh` (P010 alloc/map/lock chain), (4) `r4-oem-transact/30_run_r4.sh` (OEM binder depths). The r3/r4 kits are auto-driven via a FIFO feed; they never need manual ENTER here. Writes `FULL-BASELINE.md` with a layers-captured table and per-lane verdicts. | The per-condition baseline unit that `baseline.sh` and `campaign.sh RUNNER=full_baseline.sh` invoke. r3/r4 are best-effort: failure is logged, core verdict still stands. |
| `reference/r3/<cond>/` | `r3-gralloc/30_run_r3.sh <tag>` | Attaches Frida to `com.oplus.camera` by PID (`-p`, not `-n` — SELinux-safe); records `20_trace_alloc_camxformat.js` (alloc + dlopen + CamxFormatUtil namespace) + `trace_p010_planes.js` (P010 plane-layout contract); runs `10_camxformat_probe.sh` in-flight for the `/proc/<pid>/maps` namespace snapshot; pulls `/data/vendor/camera/*.log`. Interactive: prompts for a manual negative-control photo then a P010/Night target, reads ENTER, then snaps + pulls. | doc-42 §2.5: settles the CamxFormatUtil-namespace root, P010 alloc→dlopen→lock A/B (symptom #5 P010 layout contract). Pure differ: needs an OOS dir + LOS dir for `parse_r3.py`. |
| `reference/r4/<cond>/` | `r4-oem-transact/30_run_r4.sh <tag>` | Attaches `20_trace_ext_transact.js` to both cameraserver (by name) and `com.oplus.camera` (by PID). Runs `10_ext_presence.sh` (libcsextimpl present/absent probe), snapshots cameraserver `/proc/maps`, captures logcat, dumpsys camera pre/post, `oem_slice.txt`. Interactive: prompts for a VIDEO-8K + PHOTO cycle, reads ENTER, tears down. | doc-48 / gap G5: `media.camera` OEM layer Depth-1 (`libcsextimpl`/`CameraServiceExtImpl` binder 10000–10022) + Depth-2 (`beforeConfigureStreamsLocked`, 8K StreamSet). Pure differ: needs an OOS dir + LOS dir for `parse_r4.py`. Verified on oplusrom V16.1.0 / display 16.0.8.300 / OP611FL1 / CPH2745. |
| `reference/strace/<cond>/` | `strace/30_run_strace.sh <tag> [seconds]` | Pushes a static aarch64 strace binary, attaches to cameraserver + provider via `10_strace_camera.sh`, gives a WIN-second window (default 25s) for a drive-cycle stimulus, pulls `/data/local/tmp/obs_strace/` artifacts. In `baseline.sh` this lane is auto-driven without manual ENTER (strace starts, then `drive_cycle.sh` fires after 4s, then `wait`). | Syscall env-failure A/B: ENOENT (missing config, gap #2) and EACCES (sepolicy, gap #5) — the two failure modes logcat cannot show. Pure differ: needs an OOS dir + LOS dir for `parse_strace.py`. Verified on oplusrom V16.1.0 / display 16.0.8.300 / OP611FL1 / CPH2745. |
| `reference/validate_modes/report.txt` | `campaign/validate_modes.sh [K] [mode …]` | Runs every UI mode K times from a cold start; checks that `drive_cycle.sh`'s action log contains the required nav markers (`goto_main_mode <M> OK`, `tap_desc`, `ensure 8K`, etc.) and no `FAILED`. Emits per-mode reach-rate and a `GATE: PASS / HOLD` line. `baseline.sh` copies this to `reference/baseline/<cond>/validate_modes_report.txt` and gates on PASS. | Navigation reliability gate (Phase 1a): a HOLD here means the mode strip calibration is wrong or resmap ids are stale — fix before burning a capture cycle. |
| `reference/captures/<name>/` | Legacy ad-hoc pre-kit pulls | Hand-pulled artifacts from before the kit framework existed. Frozen reference only; not a kit output and not updated by any script. | Historical baseline anchors (e.g. `oos-photo`, `oos-photo-v16.0.8.300`). Do not treat as a kit artifact. |
| `reference/camxsettings/<build>.txt` | `tools/frida/dump_camxsettings.js` (Frida, provider-pid) | Frida script calls `WriteCamxSettingsToFile(this)` (non-exported, reached by offset from `libcamxsettingsmanager.so` base: Ghidra 0x113168 → runtime +0x13168) via the exported `SettingsManager::GetInstance`. Writes `<name> (<hash>) = <value>` for every CamX StaticSetting to `/data/vendor/camera/camxsettingsdump.txt`; pulled here. Offsets are build-pinned — verify against build hash before re-running on a new point release. | Names the HDR/SHDR levers at fixed struct offsets (+0x6a28 SHDR-auto-exp gate, +0x6a18 HDR-mode-info gate) so OOS vs LOS diff reveals the `camxoverridesettings.txt` keys to ship. Verified on oplusrom V16.1.0 / display 16.0.8.300 / OP611FL1 / CPH2745. |

## Subdirectories

| Directory | Purpose |
|---|---|
| `baseline/` | Per-condition GOLDEN manifest dirs, each with `BASELINE.md`, `verdict.json`, parse outputs, and `links.txt` indexing raw lane dirs |
| `ab/` | Raw OOS/LOS A/B capture dirs from `ab_capture.sh` (tagged by build identity) |
| `campaign/` | Per-condition `run_condition.sh` + `full_baseline.sh` outputs: `run<k>/`, `frida/`, `app_probes/`, `metadata.json`, `FULL-BASELINE.md` |
| `r3/` | Gralloc / P010 alloc-map-lock chain captures from `30_run_r3.sh` |
| `r4/` | OEM binder (`media.camera` / `CameraServiceExtImpl`) captures from `30_run_r4.sh` |
| `strace/` | Syscall A/B traces from `30_run_strace.sh` |
| `validate_modes/` | `report.txt` from `validate_modes.sh` (nav reliability gate output) |
| `captures/` | Frozen legacy pre-kit ad-hoc pulls — do not write here |
| `camxsettings/` | `dump_camxsettings.js` output per build (e.g. `oos-V16.1.0.txt`) |

## How the UI driver works

`capture/ui/drive_cycle.sh <mode>` is the deterministic stimulus used on both builds to guarantee
identical input. It is **intent-first and build-independent**: cold-starts the camera via `am start`,
navigates the mode strip with a calibrated single-finger horizontal swipe (250 px / 600 ms at
y=2548, verified on OP611FL1 / OOS V16.1.0), and logs every action to
`/data/local/tmp/obs_ui_action.log`. The uiautomator `resource-id` tap fallback is used **only** for
elements intents cannot reach: mode-tab overlays (night, long-exposure, scan-docs), the 8K resolution
toggle in VIDEO, and the front-camera switch button. Resource ids are keyed per build in
`capture/ui/resmap.sh` (one `case "$BUILD")` arm per firmware variant). Every action — both
intent-side and uiautomator-side — is logged to `obs_ui_action.log`, proving OOS and LOS received
identical stimulus. `validate_modes.sh` reads that log as the reliability gate before any capture.

## Ready for your firmware + Oplus variant

### (a) resmap calibration — new build/variant

If `preflight.sh` reports `needs-calibration` (no `case` arm matched for this `ro.build.version.oplusrom`
/ `ro.lineage.build.version`), preflight prints the exact steps:

1. Open the camera to the relevant screen (PHOTO bar, VIDEO resolution panel, MORE grid).
2. `adb shell uiautomator dump /sdcard/u.xml && adb pull /sdcard/u.xml`
3. Grep for `resource-id="com.oplus.camera:id/..."` — locate `shutter_button`, `switch_camera_button`,
   `live_photo`, `camera_menu_left_enter_button`, `camera_menu_right_enter_button`, `more_item`,
   the VIDEO resolution chip bounds, the 8K cell bounds, and the mode-strip Y center.
4. Add a `case "$BUILD")` arm to `tools/observability/capture/ui/resmap.sh` (clone the `V16.1.0*|*OP611*`
   arm; fill `RID_*`, `VID_RES_CHIP`, `VID_RES_8K`, `MODE_ORDER`, `STRIP_STEP_*`, `MODE_STRIP_Y`).
5. Re-run `validate_modes.sh 3` — all modes must reach K/K before running `baseline.sh`.

`preflight.sh` auto-detects a missing case and prints these steps verbatim.

### (b) binary-offset re-anchor — new point release

`tools/patch_chi_logclobber.py` and `tools/frida/dump_camxsettings.js` carry build-pinned offsets
(verified on display 16.0.8.300 / OP611FL1). Re-verify both against the new build hash before
re-running on any point release. Frida probes that go through `_anchor.js` self-heal: the resolve
ladder tries exported symbol → `.symtab` local symbol → memory pattern scan → BuildID-gated cached
offset, logging which rung succeeded; a miss is loud, never silent.

## For AI Agents

- This tree is **populate-only** from kit scripts. Never create or rename directories here by hand —
  every script that reads or writes these paths hardcodes the directory names (`reference/baseline/`,
  `reference/r3/`, `reference/r4/`, `reference/strace/`, `reference/campaign/`, `reference/camxsettings/`).
  Renaming a directory silently breaks every kit that references it.
- A capture directory without its corresponding `parse_*.py` output is not a completed test. Before
  citing a capture as evidence, confirm the parser has run and emitted an OOS-vs-LOS verdict.
- `r4` and `strace` captures are pure differs: a single-side directory is raw material only.
  `parse_r4.py` and `parse_strace.py` both require an OOS dir and a LOS dir argument.
- Do not treat `reference/captures/` as a live kit output. It is a frozen legacy artifact set.
- All build/device attestations in this file are verified on: **oplusrom V16.1.0 / display 16.0.8.300 /
  OP611FL1 / CPH2745**.

## Dependencies

- `tools/observability/capture/baseline.sh` — GOLDEN entry point (composes all other scripts)
- `tools/observability/campaign/` — `run_condition.sh`, `full_baseline.sh`, `validate_modes.sh`, `parse_condition.py`
- `tools/observability/r3-gralloc/`, `tools/observability/r4-oem-transact/`, `tools/observability/strace/` — kit runners and parsers
- `tools/frida/dump_camxsettings.js`, `tools/frida/_anchor.js` — camxsettings dump + offset resolver
- `tools/patch_chi_logclobber.py` — binary patcher (build-pinned offsets, host-only, never committed to device image)
- `docs/interop-tree/`, `tools/observability/tables/attribution-matrix.md` — attribution tree for upward root tracing from a verdict
