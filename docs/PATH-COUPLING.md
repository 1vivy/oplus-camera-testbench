# PATH-COUPLING — paths you must not rename

These paths are hardcoded by scripts/workflows; renaming them breaks things **silently** (no error, just
wrong/empty results). Grep before you move any of them.

| Path | Hardcoded by | Symptom if renamed |
|------|--------------|--------------------|
| `docs/interop-tree/` | facilitation-audit workflows `tools/observability/campaign/{phase2_facilitation_workflow,nodefill_workflow}.mjs` | workflow reads empty node set |
| `docs/facilitation/` | same `.mjs` workflows | same |
| `tools/frida/*.js` (43 hooks) | observability harness orchestrators (capture/campaign) | hook injection no-ops |
| `reference/<lane>/<cond>/` layout (`baseline campaign r3 r4 strace`) | capture scripts + parsers (`parse_ab.py`, `parse_condition.py`, `diff_oos_los.py`) + `oplus-logs cond` | parse/diff/pull find nothing |
| `tools/observability/capture/baseline.sh` | golden capture entry point referenced across docs | runbooks point at a dead path |
| `infiniti-camera-port/local_manifests/infiniti-camera.xml` | `bootstrap-repos.sh` (parses it) + the builder's `.repo/local_manifests/` copy | bootstrap clones nothing; builder sync drifts |
| `infiniti-camera-port/repos/<path>` | edit-site convention (`.gitignore`, `bootstrap-repos.sh`, `WORKFLOW.md`) | edits land outside the tracked workflow |

Cross-host (env-coupled, **out-of-repo on purpose** — never commit these):
| Path | Owner | Note |
|------|-------|------|
| `~/.local/bin/oplus-logs` | the Mac↔builder bridge | env-coupled; reinstall locally if missing |
| `/srv/android/{AGENT.md,scripts,worktrees,artifacts,logs,dumps}` | the builder | reached via `oplus-logs` (`SROOT`) |

## Refactor checklist
1. `grep -rn '<old-path>' --include='*.mjs' --include='*.py' --include='*.sh' .` (and `~/.local/bin/oplus-logs`).
2. Check the builder too: `oplus-logs grep '<old-path>'` and `.repo/local_manifests/` for manifest paths.
3. Update the table above in the same change.

(The two `.mjs` workflows and the `reference/<lane>/<cond>` layout are the easiest to break — they fail
silently, so always grep first.)
