# AGENTS.md — oplus-final root agent runbook

> Build-pinned tags: **OOS V16.1.0 / 16.0.8.300 / OP611FL1 / CPH2745**

> **Start here → [`WORKFLOW.md`](WORKFLOW.md)** — the Mac↔builder↔device loop switchboard (bootstrap,
> sync, build, overlay-test, retrieve, ledger). It routes to the runbooks in `docs/` (`SYNC`, `BUILD-HOST`,
> `OVERLAY`, `LEDGER-SCHEMA`, `PATH-COUPLING`). Build-host ops truth: `oplus-logs build-doc`.

> **Quick reference → [`CLAUDE.md`](CLAUDE.md)** — always-loaded workflow glossary and cheatsheet. Treat it
> as a compact companion to `WORKFLOW.md`; this `AGENTS.md` remains the authoritative constraint set.

## Purpose

`oplus-final` is the **clean reference + capture harness** for porting the Oplus/OnePlus camera stack
(OOS→LOS) to the OnePlus 15 (infiniti, SM8850, CPH2745). It deliberately excludes working-tree
variations and historical ambiguity so that every artifact and decision is traceable forward.

### Two fix pathways

**Pathway A — Frida hooks (live, preferred)**
Runtime instrumentation via `tools/frida/*.js` hooks injected by frida-server. Also the
`tools/persistence/` hook-facet for making hooks survive reboot. Lightest touch: no partition
writes, reversible, can target a specific symbol address in a running OOS image.

**Pathway B — Blob patches (heavier fallback)**
Binary patches applied to blobs before flashing. Primary artifact: `tools/patch_chi_logclobber.py`
(defeats the 4-stage CamX/CHI/OEM log-clobber chain). The `tools/persistence/` patch-overlay facet
and the forward LOS patch set in `los-impl/patches/` are also part of this pathway. Use when a
hook cannot reach the target site or when the fix must survive across an OEM update.

---

## Subdirectories

| Directory | Role |
|-----------|------|
| `tools/` | Scripting toolbox: device-side enablers, observability harness, Frida scripts, persistence overlay, host parsers. See `tools/AGENTS.md`. |
| `reference/` | **Populate-only** — capture output destination. Never edit files here manually; they are written by `tools/observability/capture/baseline.sh` and sibling scripts. |
| `docs/` | Research, facilitation board, interop-tree spec, RE notes. Taxonomy index at `docs/INDEX.md`. |
| `dodge-camera-port/` | sm8750 oracle: read-only upstream clones of the proven OP13s/dodge camera port used as proof-of-form cross-check. See `dodge-camera-port/README.md`. |
| `infiniti-camera-port/` | OP15 LOS scaffold: local_manifests snippet + working clones of all 11 `lineage-23.2-cam-final` repos (owned by `1vivy`). See `infiniti-camera-port/README.md`. |
| `los-impl/` | Forward LOS patch set + implementation blueprint (R1–R7). Staged only — nothing applied to the external tree yet. See `los-impl/README.md`. |

---

## For AI Agents

### Device-side constraints (READ-ONLY / reversible)
- All device scripts use `#!/system/bin/sh`, run as `su -c 'sh /data/local/tmp/<x>.sh'` via KernelSU.
- KernelSU `su -c` drops lines after the first → keep device scripts **single-block** (no multi-statement chains).
- Read the real `/odm` via cameraserver's mount namespace: `ls /proc/<cameraserver-pid>/root/odm/`. KernelSU's own `/odm` view is unreliable.
- **Never write to `persist.*` props or real partitions.** Verbosity overlays and `setprop` are the only allowed levers; they are fully reversible.

### Build-pinned offsets
- Binary offsets in `tools/patch_chi_logclobber.py` and in Frida hooks (`addr = module.base + offset`) are **pinned to a specific OOS build hash** (header states which). Re-verify against the running build's hash before trusting any offset. A mismatch silently hooks the wrong site.

### Path-coupling — do NOT rename
The following paths are hardcoded by scripts and workflow `.mjs` files; renaming breaks them silently:

| Path | Hardcoded by |
|------|-------------|
| `reference/<x>/` subdirectory layout | capture scripts and parsers |
| `tools/frida/*.js` | observability harness orchestrators |
| `docs/interop-tree/` | facilitation-audit workflow `.mjs` |
| `docs/facilitation/` | facilitation-audit workflow `.mjs` |

### Attribution model
When a symptom appears, **do not isolate to a single subsystem**. Instead:
1. Capture the action/scope via `tools/observability/` (golden entry: `capture/baseline.sh`).
2. Trace **upward** through the attribution tree:
   - `docs/interop-tree/` — requirement/symptom/data/control/facilitation nodes
   - `tools/observability/tables/attribution-matrix.md` — symptom → proximate site → true divergence layer
3. Never attribute to a byte-identical blob (standing finding: a byte-identical blob is never the root).

### Capture output
All capture output lands under `reference/`. Raw A/B dirs, parsed verdicts, and derived artifacts all
go there. Do not redirect output to any other path.

---

## Dependencies

| Dependency | Where needed |
|------------|-------------|
| Rooted device (KernelSU) | All device-side scripts |
| `frida-server` on device | Pathway A (frida hooks) |
| Host `frida` CLI + `frida` Python module | Pathway A orchestration |
| `python3` (stdlib only) | All host-side parsers |
| Static aarch64 `strace` (not committed) | `tools/observability/strace/` kit |
| Stock OOS reference unit | Symmetric A/B captures (`oos-probe-r2-20260603`) |
