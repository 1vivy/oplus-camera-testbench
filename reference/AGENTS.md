<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-15 -->

# reference — Assisted-Automated Capture Runbook

Prescriptive pipeline for an AI agent (or an engineer following agent instructions) to execute,
parse, and trace a golden capture from start to a root-attributed verdict. Every step is mandatory
in order. Do not skip preflight. Do not skip parse. Do not rename capture directories.

All build/device attestations in this file are verified on: **oplusrom V16.1.0 / display 16.0.8.300 /
OP611FL1 / CPH2745**.

## Purpose

One authoritative runbook for the full capture-to-root pipeline, so an agent executing `baseline.sh`
knows exactly what each phase gate means, what to do when it blocks, and how to trace a verdict
upward to the true divergence layer — not just to the proximate symptom.

## Key Files

| File | Description |
|---|---|
| `README.md` | Per-capture table, UI driver mechanics, and resmap/offset re-anchor procedures |
| `baseline/<cond>/BASELINE.md` | Top-level verdict manifest produced by `capture/baseline.sh` |
| `baseline/<cond>/verdict.json` | Machine-readable verdict: preflight, modes\_gate, lanes, signal, los\_ref, verdict |
| `baseline/<cond>/PREFLIGHT.md` | Preflight detail: blockers, warnings, resmap calibration steps if needs-calibration |
| `validate_modes/report.txt` | Navigation reliability gate output from `validate_modes.sh` |

## Pipeline (prescriptive, in order)

### 1. PREFLIGHT

```
tools/observability/capture/preflight.sh <cond> reference/baseline/<cond>/
```

Checks: adb reachable, KernelSU `su` grants uid=0, frida-server alive and major-version-matched to
host `frida` CLI, no fresh camera-signed tombstone (crash-loop guard), SELinux state recorded,
`resmap.sh` has a case arm for this build (pushes the capture tree to device and evaluates
`resmap.sh` on-device where `getprop` resolves), frida-inject persistence status.

Exit codes:
- `0` = **ready** — proceed to step 2.
- `3` = **needs-calibration** — resmap has no `case` arm for `ro.build.version.oplusrom` /
  `ro.lineage.build.version`. See step 2 (CALIBRATE). `baseline.sh` will block here unless
  `BASELINE_FORCE=1` is set.
- `2` = **blocked** — a hard blocker (no root, frida major mismatch, camera crash-loop). Fix the
  blocker before proceeding; do not force-continue.

Preflight writes `reference/baseline/<cond>/PREFLIGHT.md` regardless of outcome.

### 2. CALIBRATE-IF-NEEDED

**Only required when preflight exits 3 (needs-calibration).** Skip entirely if preflight exited 0.

`PREFLIGHT.md` prints the exact steps. The abbreviated form:

1. Open OplusCamera to the relevant screen on the device.
2. `adb shell uiautomator dump /sdcard/u.xml && adb pull /sdcard/u.xml`
3. Grep `u.xml` for `resource-id="com.oplus.camera:id/..."` to locate:
   `shutter_button`, `switch_camera_button`, `live_photo`, `camera_menu_left_enter_button`,
   `camera_menu_right_enter_button`, `more_item`, the VIDEO resolution chip bounds, the 8K cell
   bounds, and the mode-strip Y center (the `headline_view` bounds mid-Y).
4. Add a `case "$BUILD")` arm to `tools/observability/capture/ui/resmap.sh`. Clone the
   `V16.1.0*|*OP611*` arm (verified 2026-06-13 on OP611FL1) and fill all `RID_*`, `VID_RES_CHIP`,
   `VID_RES_8K`, `MODE_ORDER`, `STRIP_STEP_*`, and `MODE_STRIP_Y` fields.
5. Re-run `tools/observability/campaign/validate_modes.sh 3` — every mode must reach K/K (GRADUATE)
   before proceeding. Any FLAKY result means the arm is wrong or a calibration coord is off.

**Binary-offset re-anchor (do this in parallel with resmap calibration when on a new point release):**
- `tools/patch_chi_logclobber.py` carries hardcoded offsets pinned to display 16.0.8.300 / OP611FL1.
  Verify the target `.so` build hash matches before running. Offset derivation: Ghidra
  decompile → apply `image_base = 0x100000` correction → runtime offset = Ghidra addr − 0x100000.
- `tools/frida/dump_camxsettings.js` carries `WriteCamxSettingsToFile` at runtime offset `+0x13168`
  in `libcamxsettingsmanager.so`, pinned to the same build. Re-verify against the GNU BuildID of
  `libcamxsettingsmanager.so` on the new build.
- Frida probes that use `tools/frida/_anchor.js` **self-heal**: the resolve ladder (exported symbol →
  `.symtab` local → memory pattern → BuildID-gated cached offset) tries each rung in order and logs
  which one hit. A cache entry keyed to a different BuildID is automatically ignored. A complete
  miss is logged loudly — escalate to Ghidra re-anchor for that probe; do not silently proceed.

### 3. CAPTURE by action / scope

Captures are keyed by **action** (the mode / stimulus) at a **scope** (breadth of lanes).

**Golden single-condition run (the standard):**
```
tools/observability/capture/baseline.sh <cond> [los-ref-root]
```
Composes: preflight → validate\_modes gate (K=2 on the condition's mode) → full\_baseline lanes 1-4
→ strace lane → auto-parse → VERDICT written to `reference/baseline/<cond>/BASELINE.md`.
The optional `los-ref-root` argument enables the two-side differs (r4, strace); without it those
parsers emit "single-side — raw artifacts only".
`BASELINE_FORCE=1` overrides a needs-calibration or modes-HOLD block (use only when you have
confirmed the calibration issue is non-blocking for the specific mode being tested).

**Set of conditions (batch):**
```
tools/observability/campaign/campaign.sh RUNNER=full_baseline.sh <cond1> <cond2> …
```
Serialises over conditions (the device is a hard serialization point).

**Individual lane re-run (kit-only, for targeted re-capture):**
- r3 gralloc chain: `tools/observability/r3-gralloc/30_run_r3.sh <tag>` — interactive (reads ENTER
  after frida attaches; drive a negative-control photo then a P010/Night target).
- r4 OEM binder: `tools/observability/r4-oem-transact/30_run_r4.sh <tag>` — interactive (reads
  ENTER; drive VIDEO-8K + PHOTO cycle).
- strace syscall: `tools/observability/strace/30_run_strace.sh <tag> [seconds]` — auto-times out
  after WIN seconds; drive the cycle within the window.
- A/B only: `capture/ab_capture.sh <mode>` (device-side, via `adb shell su -c '...'`).

### 4. PARSE

Parsers turn raw captures into OOS-vs-LOS verdicts. A directory without its parser output is not a
completed test. Run the relevant parser immediately after each capture lane.

| Lane | Parser | Required inputs |
|---|---|---|
| campaign / ab | `tools/observability/campaign/parse_condition.py <reference/campaign/<cond>>` | Single-side OK (OOS or LOS alone); emits ALL\_STABLE or flags divergence across REPEAT\_N runs |
| r3 gralloc | `tools/observability/r3-gralloc/parse_r3.py <oos-dir> [los-dir]` | Single-side gives raw summary; **true verdict requires both OOS and LOS dirs** |
| r4 OEM binder | `tools/observability/r4-oem-transact/parse_r4.py <oos-dir> <los-dir>` | **Pure differ — both dirs required.** Emits presence/absent per depth + binder-code diff |
| strace syscall | `tools/observability/strace/parse_strace.py <oos-dir> <los-dir>` | **Pure differ — both dirs required.** Emits ENOENT/EACCES diffs across both daemons |
| baseline manifest | auto-run inside `baseline.sh` step [4] | parse\_condition + parse\_r3 always; parse\_r4 + parse\_strace only when `los-ref-root` is given |
| frida coverage | `tools/observability/campaign/frida_coverage.py <repo-root> <cond>` (auto-run inside `baseline.sh` step [4b]) | Single-side OK. Classifies every expected probe ARMED / NODATA(hook-only) / DEAD / MISSING. **DEAD or MISSING ⇒ coverage GAP** |

`baseline.sh` writes parser output to `reference/baseline/<cond>/parse_*.txt` and the aggregate
signal (`all-stable` or `see-parse`) feeds the GOLDEN vs PARTIAL verdict.

**Frida coverage is a GOLDEN gate (step [4b]).** "A golden baseline needs it all" — so GOLDEN now requires
the frida lanes to have *armed and captured*, not just exited 0. `frida_coverage.py` opens every expected
probe's log (across attach retries — an early attach-race 0-byte log is rescued by a later good one) and
marks it: **ARMED** (hook installed + real data line), **NODATA** (hook installed, no event in window —
acceptable: absence of an event is a real reading), **DEAD** (0-byte / banner-only / attach-fail — the
silent-no-op class), **MISSING** (no log). Any DEAD/MISSING ⇒ `verdict=GAP` ⇒ `baseline.sh` downgrades
GOLDEN→PARTIAL and lists the offending probes in `frida_coverage.txt`. When a probe legitimately can't fire
(target lib not in that pid, no qualifying event), it lands NODATA and does NOT void golden — only a dead
hook does. This closes the frida-17-static-API / attach-race failure class that a `CORE=ran` check misses.

### 5. TRACE-TO-ROOT

**This is not subsystem isolation.** Do not pick one subsystem and test it in isolation until it
passes. That approach gets lost. The correct model: start from the observed **symptom** (the parser
verdict or the raw artifact tell) and walk the attribution tree **upward** rung by rung until the
true divergence layer is confirmed.

The tree:

```
symptom (parser verdict / raw tell)
  → proximate site (where the failure first manifests in the capture)
    → attributed root (the subsystem owning the proximate site)
      → true divergence layer (OOS vs LOS: /system replacement, blob, config, sepolicy, …)
```

**Sources (read in this order):**

1. `docs/interop-tree/` — the full attribution tree; every open symptom has a node.
2. `tools/observability/tables/attribution-matrix.md` — tabular form: symptom → proximate site →
   attributed root → true divergence layer → comparability → missing artifact.
3. `tools/observability/tables/lever-index.md` — per-subsystem lever table (WORKS / CLOBBERED /
   DARK + exact mechanism). Confirms which probe or lever to run next at each rung.
4. `tools/frida/README.md` (when it exists) / `tools/observability/AGENTS.md` — which Frida script
   exercises which subsystem.

**Protocol per rung:**

- Identify the symptom node in the attribution matrix.
- Read the "attributed root" and "true divergence layer" columns.
- Confirm each rung with the next probe/lever from `lever-index.md` before moving upward.
- Update the `comparability` and `missing artifact` columns in `attribution-matrix.md` as each rung
  is confirmed or ruled out.
- The `OPEN`/`INFERRED` rows in the matrix are the standing unknowns — target those next.

**LOS reality note:** A full LOS capture will not pass end-to-end from the start. Each failing
symptom (action) must be reproduced independently (run `baseline.sh <cond>` for that action's
condition), then traced upward to its root. Work symptom by symptom; do not attempt a single
all-passing LOS run as the first milestone.

## For AI Agents

- **Device levers are READ-ONLY and reversible**: verbosity via bind-mount overlay + `setprop`, never
  `dd` or writes to real partitions (`/vendor`, `/odm`, `/system`). Never add a `dd`/partition-write
  to any script in this repo.
- **Single-block `su -c`**: KernelSU drops lines after the first `su -c` argument. Always wrap
  multi-line device commands in a single heredoc or a pushed script file, not a multi-line `su -c`.
  Pattern: `adb shell su -c 'sh /data/local/tmp/<pushed-script>.sh'`.
- **Never rename capture directories.** Every script that reads or writes `reference/baseline/`,
  `reference/r3/`, `reference/r4/`, `reference/strace/`, `reference/campaign/`, or
  `reference/camxsettings/` hardcodes those names. A rename silently breaks all kit paths.
- **Never skip parse.** A capture directory without a parser verdict is not evidence. If a parser
  fails (e.g. missing LOS dir for a pure differ), record the raw artifact location and mark the
  test as PARTIAL — do not claim a verdict.
- **Trace upward, not inward.** When a parser emits a divergence, do not immediately instrument the
  proximate subsystem further. First read `attribution-matrix.md` to identify the likely true
  divergence layer, then pick the next probe from `lever-index.md` to confirm that rung. Staying
  inside the proximate subsystem is the trap.
- **Prefer `baseline.sh` over manual lane composition.** It is the single entry point that enforces
  the preflight → gate → capture → parse → verdict order. Manual lane composition risks skipping a
  gate or producing a capture without a parse.
- **Build/device attestation**: tag every new coord, offset, or resource-id in comments with the
  build and device it was verified on (format: `oplusrom V16.1.0 / display 16.0.8.300 / OP611FL1 /
  CPH2745`). Unattested offsets or ids are a silent failure risk on the next point release.

## Dependencies

- Rooted device (KernelSU), frida-server on device, host `frida` CLI — same major version.
- Static aarch64 `strace` binary for the strace lane (not shipped; see `tools/observability/strace/README.md`).
- `tools/observability/capture/ui/resmap.sh` — must have a `case` arm for the connected build before any capture.
- `tools/observability/tables/attribution-matrix.md` + `docs/interop-tree/` — required for step 5 (trace-to-root).
- Python 3 stdlib only for all parsers (no third-party deps).
