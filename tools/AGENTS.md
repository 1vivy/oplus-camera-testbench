<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-01 | Updated: 2026-06-14 -->

# tools

## Purpose
The scripting toolbox for this **clean reference** repo. Scope here is deliberately narrow — the
**baseline-testing + observability** surface for OOS↔LOS camera bringup: device-side enablers/probes
(run as root via KernelSU, all **READ-ONLY / reversible**) and host-side parsers that turn captures
into verdicts. Output lands in `../reference/`.

> **This is not the full op15 toolbox.** The broad RE/inventory/proprietary-files scripts
> (`manifest.sh`, `recon.sh`, `elfsym.py`, `read_gapsops.py`, `gen3.py`, the `fwk_trace_run*.py`
> runners, `repro_cam.sh`/`mode_matrix.sh`, &c.) live in `~/op15-camera-porting/tools/` and were
> intentionally **not** copied here. If you need one, go to that repo; do not recreate it here.

## Key Files (what actually lives in this repo)
### Device-side (`#!/system/bin/sh`, `su -c 'sh /data/local/tmp/<x>.sh'`)
> Read the real `/odm` via cameraserver's mount namespace (`/proc/<pid>/root`) — KernelSU `su`'s own
> `/odm` view is unreliable. KernelSU `su -c` drops lines after the first → keep scripts **single-block**.

| File | Description |
|------|-------------|
| `enable_verbose.sh` | Enable max stock camera verbosity (CamX/CHI override overlay + logd unthrottle, reversible, no partition writes) |
| `patch_chi_logclobber.py` | Build-pinned (16.0.7.201) binary patcher that defeats the 4-stage CamX/CHI/OEM log-clobber; **re-verify offsets against the build hash** before trusting it. Lead-only push, never committed to a flashed image. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `frida/` | Frida instrumentation scripts (framework-API surface tracer, AEC/HDR probes, P010/gralloc tracer, OEM/OLog enablers, settings dumper, anchor). See `frida/README.md` for per-script lever mapping; `observability/tables/lever-index.md` for which script flips which subsystem. |
| `observability/` | Consolidated observability + baseline-testing harness (enable → capture → attribute) plus strace / runtime-debug / UI-driver kits and the `TEST-PLAN.md` gap map. See `observability/AGENTS.md`. |
| `persistence/` | Persistence kit: hook-facet (Pathway A — survive reboot) and patch-overlay facet (Pathway B). See `persistence/README.md`. |

> Note: `tools/facilitation-audit/` was removed — it was an empty orphan directory.

## For AI Agents

### KernelSU single-block rule + /odm-via-cameraserver-/proc
- Device scripts are `#!/system/bin/sh`, pushed to `/data/local/tmp/` and run via `su -c 'sh /data/local/tmp/<x>.sh'`.
- KernelSU `su -c` drops all lines after the first — keep device scripts **single-block** (no chained `su -c` calls).
- Read `/odm` via cameraserver's mount namespace: `ls /proc/<cameraserver-pid>/root/odm/`. KernelSU's own `/odm` view is unreliable.
- **Never write to `persist.*` props or real partitions.** All verbosity changes use reversible bind-mount overlays and `setprop`.

### Host vs device split
- **Device-side:** shell scripts under `enable_verbose.sh`, `observability/enable/`, `observability/capture/`, `observability/strace/`, `observability/debug/`. Run on device as root.
- **Host-side:** Python parsers (`observability/capture/parse_ab.py`, `observability/strace/parse_strace.py`, `observability/debug/parse_tombstone.py`, `observability/r3-gralloc/parse_r3.py`, `observability/r4-oem-transact/parse_r4.py`) and `patch_chi_logclobber.py`. Run on the host; stdlib only, no third-party deps.
- **Frida:** `frida/` scripts run from the host CLI but instrument the device process via frida-server.

### Build-pinned offsets
Binary offsets in `patch_chi_logclobber.py` and in Frida hooks (`addr = module.base + offset`) are pinned to a specific build hash (stated in each file's header). **Re-verify against the running build hash before trusting any offset.**

## Dependencies
### External
- Frida (`frida` Python module + frida-server on device, host `frida` CLI).
- A static aarch64 `strace` (not committed — see `observability/strace/README.md`).
- Python 3 stdlib only for all parsers (no third-party deps).
- Rooted device (KernelSU).

### Internal
- Output → `../reference/` (raw captures, A/B dirs).

<!-- MANUAL: -->
