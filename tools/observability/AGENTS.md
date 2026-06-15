<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-12 -->

# tools/observability

## Purpose
Consolidated camera **observability harness + attribution knowledge**: turn on every subsystem's
debug verbosity in one run, map where logging is dark, and attribute each downstream symptom to its
true root subsystem/layer. Built to close the project's biggest blind spot — the LOS-replaced
**/system** layer (frameworks/av, frameworks/base, SurfaceFlinger/EDR) — while the /vendor + oplus
blobs are byte-consistent OOS↔LOS and already well-tooled.

## Key Files
| File | Description |
|------|-------------|
| `TEST-PLAN.md` | **Orienting map (read first):** open symptom → decisive test → tool → ROI rank; coverage matrix; baseline-on-stock sequence |
| `README.md` | Layout index + quickstart + the /system instrumentability decision tree |
| `enable/00_enable_all.sh` | Run-all enabler; prints per-subsystem PASS/DARK visibility summary |
| `enable/10_vendor_camx_chi.sh` | CamX/CHI/OEM overlay masks + clobber-defeat property (reversible) |
| `enable/20_system_framework.sh` | **/system dark-zone probe** — AOSP `log.tag.*`/atrace/perfetto/dumpsys; answers "instrumentable without a build?" |
| `enable/30_aps_native.sh` | APS selectors + alog self-kill warning + frida-native-hook pointers |
| `capture/ab_capture.sh` | Identical open→preview→capture→close cycle, artifacts auto-tagged by build (OOS vs LOS); `[mode]` arg delegates stimulus to `capture/ui/` |
| `capture/parse_ab.py` | A/B verdict parser — prints the attribution-matrix tells from an OOS dir + LOS dir (the missing parser the r3/r4 kits already had) |
| `capture/ui/` | Deterministic mode-aware UI driver (hybrid: intent-first, uiautomator fallback via `resmap.sh`); reaches burst (#4) / video8k (#8) |
| `capture/AB-RUNBOOK.md` | Symmetric OOS↔LOS capture procedure + per-subsystem diff guide + debug-image recipe |
| `strace/` | Syscall env-failure A/B kit — ENOENT (missing config #2) / EACCES (sepolicy #5) the logs can't show (`10_` probe + `30_` orchestrator + `parse_strace.py`); needs a pushed static aarch64 strace |
| `debug/` | AOSP runtime-debug kit — `debuggerd -b` live freeze unwind (#1) + G7-safe `simpleperf` + `parse_tombstone.py` (#4/#6) |
| `tables/lever-index.md` | Per-subsystem lever table (WORKS/CLOBBERED/DARK + exact mechanism) |
| `tables/attribution-matrix.md` | Symptom → proximate site → attributed root → **true divergence layer** → comparability → missing artifact |
| `tables/logging-gap-register.md` | Dark-spot map (G1–G8) with bridge actions, priority-ordered |
| `r3-gralloc/` | OOS baseline v3 capture kit — handle-correlated allocate→dlopen→lock A/B that settles the doc-42 §2.5 CamxFormatUtil-namespace root (camxformat probe, alloc/dlopen frida, orchestrator, parser) |
| `r4-oem-transact/` | OOS baseline v3 capture kit — `media.camera` OEM layer (doc-48 / G5): `libcsextimpl`/`CameraServiceExtImpl` Depth-1 (binder 10000–10022) + Depth-2 (internal hooks; 8K `beforeConfigureStreamsLocked`); presence probe, dual-mode frida, orchestrator, parser |

## For AI Agents
- Device scripts follow `../AGENTS.md` conventions: `#!/system/bin/sh`, **single-block** (KernelSU drops
  post-first `su -c` lines), **READ-ONLY / reversible** (overlay + setprop; never write persist/partition),
  output to `/data/local/tmp/obs_*`, read /odm via cameraserver `/proc/<pid>/root`.
- This folder **orchestrates** existing tools (`../enable_verbose.sh`, `../patch_chi_logclobber.py`,
  `../frida/*`) — extend those for new levers; keep this folder as the index + harness, not a re-implementation.
- Binary offsets in `../patch_chi_logclobber.py` are build-pinned (16.0.7.201). Re-verify against the build
  hash before trusting them (see that file's header).
- The tables encode the standing finding: **a byte-identical blob is never the root** — update the divergence-layer
  column as captures resolve the OPEN/INFERRED rows (#1 freeze, #5 P010).

## Dependencies
- Rooted device (KernelSU), frida-server present (same as all `../` tools).
- Stock OOS reference unit for the symmetric A/B captures (the `oos-probe-r2-20260603` device).

<!-- MANUAL: -->
