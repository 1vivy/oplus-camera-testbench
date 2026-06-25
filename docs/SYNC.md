# SYNC — Mac → builder, and the push tiers

How code moves from the Mac edit-site to the builder, and how to keep `cam-final` clean.
See `WORKFLOW.md` for the big picture; this is the sync/push detail.

## The edit-site

The Mac is the **only** place you edit and push (git creds live here). The 11 forks are cloned into
`infiniti-camera-port/repos/<path>` — **gitignored** (`.gitignore: /infiniti-camera-port/repos/`); the
README repo table + `local_manifests/infiniti-camera.xml` are the source of truth for what to clone.

```
cd infiniti-camera-port
./bootstrap-repos.sh                              # all 11 forks (skip existing)
./bootstrap-repos.sh device/oneplus/sm8850-common # just one (unblock a single fix)
```
Each repo is cloned from `https://github.com/1vivy/<name>` on `lineage-23.2-cam-final` (LFS skipped by
default; set `OPLUS_LFS=1` for blobs). The builder **pulls** these forks — it never pushes.

> Scripts are `#!/usr/bin/env bash` and assume a modern bash (macOS host has a brew-installed bash 5.x —
> the stock-3.2 `mapfile`/coreutils gaps are resolved environment-side, not a workflow concern).

## Push tiers (no Gerrit — `repo start`/`repo abandon` only)

| Tier | When | Branch | Build |
|------|------|--------|-------|
| 0 · Overlay | reversible device test | none (file in `camera-bringup/overlays/`) | — |
| 1 · WIP | experimental, not yet trusted | `wip/<topic>` on the fork | builder syncs that branch ad-hoc |
| 2 · Canonical | validated | `lineage-23.2-cam-final` | builder syncs cam-final, builds the artifact |

Keep speculative work on `wip/<topic>`; promote to `cam-final` only once confirmed. We deliberately do
**not** use `repo upload`/Gerrit/change-ids/merge-test-order — that's a future maturity step.

### Tier 1 — push a wip branch without touching cam-final
```
cd infiniti-camera-port/repos/<path>
git add -p && git commit
git branch wip/<topic>                                  # move the commit onto a wip branch
git branch -f lineage-23.2-cam-final origin/lineage-23.2-cam-final   # keep local cam-final == remote
git checkout wip/<topic>
git push -u origin wip/<topic>
```
Build it ad-hoc on the builder: `git -C <tree>/<path> fetch origin wip/<topic> && git -C ... checkout FETCH_HEAD`.

### Tier 2 — promote (one-way, ff-only)
```
git checkout lineage-23.2-cam-final
git merge --ff-only wip/<topic>
git push origin lineage-23.2-cam-final
```
Then on the builder: `repo sync <project>` pulls the promoted commit (manifest pins `cam-final`).

## Proprietary sync-commit discipline (blob_fixup changes)

When a change alters what an `extract-files.py` blob_fixup *produces* (DT_NEEDED, SONAME, APK patch, or an
injected XML node like the DV fix): the source `extract-files.py` lives in `device/*`, but the regenerated
`Android.bp`/`.mk`/blobs live in the `proprietary_vendor_oneplus_*` repo. After the builder re-runs the
extract, commit the regenerated proprietary content as a **"proprietary/blob sync commit"** and push it,
so every build input traces to a commit (source cam-final commit AND proprietary sync commit, pushed
together). Never patchelf/hand-edit an extracted blob — re-run the extract (it regenerates `Android.bp`
from real DT_NEEDED). Details: `oplus-logs build-doc` (AGENT.md) → "Conventional flow".

## Worked example (DV fix, this session)
`wip/dv-codec` pushed (Tier 1) → on-device registration verified → `merge --ff-only` → `cam-final` (Tier 2)
→ pushed. The builder then `repo sync device/oneplus/sm8850-common` + re-extract bakes it into the build.
