<!-- Parent: ../AGENTS.md -->
<!-- Build-pinned: V16.1.0 / 16.0.8.300 / OP611FL1 / CPH2745 -->

# tools/observability/campaign — capture kit + condition schema

## Purpose

Serial, device-locked capture harness for controlled, reproducible camera-symptom data collection on
CPH2745 (OOS V16.1.0 / 16.0.8.300). Each **condition** is a named `.env` file under `conditions/`
that declares a shooting mode, AE/AF lock state, repeat count, and the frida probes to co-attach.
The harness owns the device for the duration of the run (lockfile), fires deterministic replayed-UI
stimulus (`drive_cycle.sh`), attaches frida to the appropriate processes (provider, cameraserver, or
app), and pulls artifacts to `reference/campaign/<condition>/`. Downstream, `parse_condition.py` and
`diff_oos_los.py` reduce the captures to per-condition verdict tables and OOS↔LOS divergence rows.

The device is a hard serialization point — one camera session at a time. Throughput comes from
host-side analysis and parallelism between conditions run on separate devices, never from concurrent
camera sessions on the same unit.

---

## Key Files

| File | Description |
|------|-------------|
| `campaign.sh` | **Top-level orchestrator.** Runs a set of conditions serially behind a device lockfile (`/tmp/.oplus-campaign.devicelock`). Accepts condition names as args (default: every `conditions/*.env`). `RUNNER` env var selects the per-condition script; default `run_condition.sh`; set `RUNNER=full_baseline.sh` to run all four lanes (framework + app probes + r3 + r4) for each condition. |
| `run_condition.sh` | **Per-condition orchestrator.** Reads `conditions/<cond>.env`; enables verbosity once (restarts provider); co-attaches frida to provider (always: `enable_camx_logging`, `unclobber_camx_logs`) + routes `EXTRA_PROBES` to provider / cameraserver / app lanes; runs `REPEAT_N` × `ab_capture` with deterministic `drive_cycle.sh` stimulus; pulls each run to `reference/campaign/<cond>/run<k>/`; writes `metadata.json`. APP-side probes are deferred to `app_probe_capture.sh`. |
| `full_baseline.sh` | **Four-lane single-pass baseline.** Composes all proven lanes in one invocation: (1) `run_condition.sh` (framework + graph + provider frida), (2) `app_probe_capture.sh` (APP-side frida via `DRIVE_NAVONLY`), (3) `r3-gralloc/30_run_r3.sh` (gralloc/P010 alloc→map→lock chain; `RUN_R3=1`), (4) `r4-oem-transact/30_run_r4.sh` (media.camera OEM-transaction depths; `RUN_R4=1`). r3/r4 are best-effort; their failure never voids the core baseline. Invoked by `campaign.sh` when `RUNNER=full_baseline.sh`. |
| `app_probe_capture.sh` | **APP-side frida capture.** Navigates to the mode with shutter suppressed (`DRIVE_NAVONLY=1`), attaches frida to the fresh `com.oplus.camera` PID, then fires the shutter so probes see the full preview→capture invocation. Handles the APP-side `EXTRA_PROBES` subset (`trace_edr_invocation`, `trace_motionphoto`, `probe_getoplushwbuffer`, `trace_preview_delivery`, `trace_p010_planes`, `trace_aps_metadata_lifecycle`, `trace_turbohdr_tag`, `trace_gralloc_p010_chain`, `probe_aps_preview_routine`, `probe_sendinputdata_gate`). |
| `validate_modes.sh` | **Phase-1a UI reliability gate.** Runs each UI mode K times from a cold start; asserts the `drive_cycle.sh` action-log markers are present and deterministic (reach rate = K/K to graduate). Flaky modes are reported rather than silently captured. Navigation-reliability analogue of `parse_condition.py`'s signal-determinism gate, applied upstream. |
| `parse_condition.py` | **Per-condition verdict writer.** Delegates to `capture/parse_ab.py` detectors (no logic duplication); computes the stock signal on every `run<k>/ab`; flags each row `stable` (identical across all runs — the only state that backs a CONFIRMED tree verdict) or `flaky` (varies under identical stimulus = non-deterministic; must not be promoted). Writes `<cond>/verdict.json`. |
| `record_session.sh` | **Host gesture recorder.** Captures `getevent -t` touch stream + `screenrecord` for a named session; output stored in `sessions/<name>.events` + `.mp4`. Replayed byte-identically by `drive_cycle.sh replay <name>` across all repeats and later LOS runs. Satisfies the FACT contract G-COND/G-REP gates. |
| `diff_oos_los.py` | **OOS↔LOS B-side diff harness.** Compares matched OOS and LOS condition directories: per-symptom `verdict.json` rows + per-probe checkpoint records. Emits a divergence table (OOS value | LOS value | MATCH/DIVERGE). The first diverging checkpoint along a symptom's node path is where LOS went wrong. `--self` mode sanity-checks mechanics against a single dir. |

---

## Subdirectories

| Directory | Contents |
|-----------|----------|
| `conditions/` | Named `.env` files — one per experimental condition. Each file declares the knobs for a single campaign run (see schema below). Currently 22 conditions covering photo/video/burst/night/8K/EDR/P010/gralloc/metadata/TIER-1/TIER-2 probes. |
| `sessions/` | Recorded gesture sessions (`.actions` + `.mp4`) produced by `record_session.sh`. Referenced by `SESSION=` in `MODE=replay` conditions. Currently contains `rgbfan-photo-aelock.actions` (the canonical high-DR de-confound session). |

---

## conditions/ `.env` schema

Every `conditions/<name>.env` is sourced by `run_condition.sh`, `full_baseline.sh`, and
`app_probe_capture.sh` after setting safe defaults. Keys not present in the file take the default.

| Key | Type | Default | Meaning | Consumed by |
|-----|------|---------|---------|-------------|
| `MODE` | string | `photo` | Camera mode passed to `drive_cycle.sh`. One of: `photo`, `scene`, `burst`, `holdshutter`, `video`, `video8k`, `portrait`, `text`, `selfie`, `motionphoto`, `beauty`, `filter`, `night`, `longexp`, `scandoc`, `switch`, `replay`. | `run_condition.sh`, `app_probe_capture.sh`, `full_baseline.sh` |
| `AE_LOCK` | 0\|1 | `0` | Whether `drive_cycle.sh` applies an AE/AF long-press lock before the shutter tap. `0` when `MODE=replay` (the `.actions` file locks itself). | `run_condition.sh`, `app_probe_capture.sh` |
| `SELINUX` | `enforcing`\|`permissive`\|`""` | `""` (keep current) | If non-empty, sets SELinux mode via `setenforce` before the run. Blank = leave as-is (Enforcing on this device; frida/strace work under Enforcing). | `run_condition.sh` |
| `REPEAT_N` | int | `3` | Number of identical `ab_capture` cycles per condition. All `REPEAT_N` runs must produce a `stable` verdict for the symptom row to be promoted to a CONFIRMED tree finding (G-REP gate). | `run_condition.sh`, `full_baseline.sh` |
| `NOTE` | string | `""` | Human-readable annotation written into `metadata.json` and surfaced in `parse_condition.py` output. No functional effect. | `run_condition.sh` |
| `EXTRA_PROBES` | space-separated basenames | `""` | Frida probes to co-attach for this condition. Values are **basenames without `.js`** that must match files in `tools/frida/`. `run_condition.sh` routes each name to the correct lane (provider / cameraserver / app) via its internal case statement. `enable_camx_logging` and `unclobber_camx_logs` are always co-attached regardless of this key. | `run_condition.sh`, `app_probe_capture.sh` |
| `RUN_R3` | 0\|1 | `1` | Whether `full_baseline.sh` invokes the r3-gralloc kit lane (`../r3-gralloc/30_run_r3.sh`). Best-effort; failure does not void the core baseline. | `full_baseline.sh` |
| `RUN_R4` | 0\|1 | `1` | Whether `full_baseline.sh` invokes the r4-oem-transact kit lane (`../r4-oem-transact/30_run_r4.sh`). Best-effort. | `full_baseline.sh` |
| `SESSION` | string | `""` | Replay session name (filename stem under `campaign/sessions/`). Required when `MODE=replay`; passed to `drive_cycle.sh replay <SESSION>`. | `run_condition.sh`, `app_probe_capture.sh` |

---

## Notable condition: `freeze-gateb.env`

`conditions/freeze-gateb.env` is the first condition that exercises both TIER-1 and TIER-2 probes
simultaneously. `MODE=video8k` (8K is where Gate-B and the -38 error manifest).

**TIER-1 (freeze Gate-B — APP-side, `libAlgoProcess.so`):**
- `probe_aps_preview_routine` — samples `APSPreviewManager::previewManagerRoutine` command-count and
  cond-var state to confirm the starvation loop.
- `probe_sendinputdata_gate` — checks `InitParamters[+0x378][0]` gate in `sendInputData` to confirm
  the input-buffer release path.

**TIER-2 (8K -38 — SERVER-side, `libcsextimpl.so` in cameraserver):**
- `hook_before_configure_streams` — post-mutation StreamSet dump from
  `CameraServiceExtImpl::beforeConfigureStreamsLocked`.
- `probe_get_extension_opmode` — return value of `CameraServiceExtImpl::getExtensionOperatingMode`
  (expected: `0x80a9` for the 8K HDR session).

**PROVIDER-side (pre-mutation reference):**
- `hook_configure_streams` — pre-mutation StreamSet view; pair with
  `hook_before_configure_streams` for before/after diff.

`run_condition.sh` routes TIER-2 probes to `attach_server` (cameraserver), TIER-1 to the APP lane
reminder, and `hook_configure_streams` to `attach_provider`. `RUN_R3=0` (not relevant); `RUN_R4=1`
(r4 captures the OEM-transaction context). Trace upward via `docs/interop-tree` and
`../tables/attribution-matrix.md` (#1 freeze, #8 8K-38).

---

## For AI Agents

- **Add a condition** by copying an existing `.env` (e.g. `cp conditions/photo-hdr.env conditions/my-new.env`)
  and editing the knobs. Do not add logic to the `.env`; it is sourced, not executed.
- `EXTRA_PROBES` names must be **exact basenames** (no `.js`) of files that exist in `tools/frida/`.
  Probes not present there will be skipped with a warning; the run continues.
- The `conditions/<x>.env` ↔ `reference/campaign/<x>/` parity is the integrity invariant: every
  condition file must have a corresponding artifact directory after a successful run. Do not create
  orphan artifact directories or condition files without a corresponding run.
- `enable_camx_logging` and `unclobber_camx_logs` are permanently wired in `run_condition.sh` and
  must not appear in `EXTRA_PROBES` (they would double-attach).
- `MODE=replay` requires a matching `SESSION=<name>` and a recorded `.actions` file in `sessions/`.
  Run `record_session.sh` first.
- Scripts follow `../../AGENTS.md` conventions: `#!/usr/bin/env bash`, READ-ONLY with respect to
  device partitions (overlay + setprop; never write persist/partition), output to
  `/data/local/tmp/obs-*`, artifacts pulled to `reference/campaign/<cond>/`.
- Cross-reference: `tools/frida/README.md` for the full probe→subsystem index and routing table;
  `../tables/lever-index.md` for per-subsystem WORKS/CLOBBERED/DARK status.

---

## Dependencies

- Rooted device (KernelSU), `frida-server` on device, `frida` CLI on host `PATH`.
- `adb` on host `PATH`; device connected and `adb get-state` returning `device`.
- `python3` on host for `parse_condition.py` and `diff_oos_los.py`.
- Recorded sessions in `sessions/` for any condition using `MODE=replay`.
- Stock OOS reference unit (`oos-probe-r2-20260603`) for symmetric OOS↔LOS A/B captures
  (`diff_oos_los.py`). Stock-only phase captures run on the primary device alone.

<!-- MANUAL: -->
