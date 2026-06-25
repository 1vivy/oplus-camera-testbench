# CLAUDE.md — oplus-camera-testbench (always-loaded glossary + cheatsheet)

**Start at [`WORKFLOW.md`](WORKFLOW.md)** for the full loop; this file is the quick reference so routine
tasks don't need a doc read. Constraints: `AGENTS.md`. Build-host ops truth: `oplus-logs build-doc`.

## The loop (3 machines)
- **edit-site = this Mac** — `infiniti-camera-port/repos/` holds the 11 gitignored 1vivy forks. Edit + push here (git creds are Mac-only).
- **build-host = `vivy@aosp-builder`** (`/srv/android`) — pulls the forks, builds. No adb. Reach via `oplus-logs` / `ssh`.
- **device = on the Mac** (adb, root) — flash, or `adb remount` overlay for a reversible test.

## Glossary
- **cam-final** = `lineage-23.2-cam-final`, the canonical branch the builder syncs + builds.
- **push tiers** (leeway, no Gerrit): 0 = overlay (device test, no commit) · 1 = `wip/<topic>` branch · 2 = promote to cam-final (one-way, when validated).
- **the dump** = `/srv/android/dumps/extracted/dump300_full` (stock OOS; extract source).
- **oplus-logs** (`~/.local/bin`, out-of-repo) = Mac↔builder bridge (captures + build logs/artifacts).
- **stage-artifact** = builder helper: `out/` ROM → `artifacts/lineage-23.2-<ver>-infiniti.zip`.

## Cheatsheet (one per concern)
| Task | Command |
|------|---------|
| bootstrap edit-site | `infiniti-camera-port/bootstrap-repos.sh` |
| push (tier 2) | edit `repos/<path>` → commit → `git push origin lineage-23.2-cam-final` |
| sync one project on builder (no `repo` on PATH) | `git -C <project> fetch vivy lineage-23.2-cam-final && git -C <project> reset --hard FETCH_HEAD` |
| build | builder, in tmux: `source /srv/android/scripts/build_env.sh; m nothing; mka bacon` |
| overlay test | `adb remount; adb push <file> <part>/etc/...; adb shell am force-stop <consumer>` |
| retrieve | `oplus-logs status` · `build-log [id] -f` · `artifact pull <zip>` · `build-doc` |
| stage + pull artifact | builder `stage-artifact.sh <ver>` → `oplus-logs artifact pull lineage-23.2-<ver>-infiniti.zip` |

## Gotchas (each cost a failed run before it was written down)
- Build scripts: **no `set -u`/`set -e`** around the env source (envsetup/lunch reference unbound vars → "env source failed").
- **`repo` is not on PATH** on the builder — use `git fetch vivy` (remote is `vivy`, not `origin`) or `$T/.repo/repo/repo`.
- **Never bulk-copy `reference/`** (119G) — `oplus-logs pull` slices only.
- Ledger: tier 0/1 → `camera-bringup/records/LEDGER.md`; a tier-2 build → `infiniti-camera-port/ITERATION-LOG.md`.

*Detail lives in `docs/{SYNC,BUILD-HOST,OVERLAY,LEDGER-SCHEMA,PATH-COUPLING}.md`. Read those only when this isn't enough.*
