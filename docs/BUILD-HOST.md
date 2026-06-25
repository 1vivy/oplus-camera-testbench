# BUILD-HOST — building on aosp-builder (index)

> **Authority = `/srv/android/AGENT.md` on the builder.** Read it from the Mac with `oplus-logs build-doc`.
> This file is the discoverable *map* (so a fresh session knows the shape without sshing blind); it does
> not duplicate AGENT.md — when they disagree, AGENT.md wins.

## Where things are

| What | Path (on `vivy@aosp-builder`) | Reach from Mac |
|------|------------------------------|----------------|
| Build tree | `/srv/android/worktrees/lineage-infiniti` (`$T`) | `oplus-logs status` (HEADs) |
| OOS dumps | `/srv/android/dumps/extracted/dump300_full` (= CPH2745 16.0.8.300) | — |
| Artifacts | `/srv/android/artifacts/lineage-23.2-vX.Y-infiniti.zip` (~3.2G) | `oplus-logs artifact ls\|pull` |
| Build logs | `/srv/android/logs/*.log` | `oplus-logs build-log [id\|latest] [-f]` |
| Ops guide | `/srv/android/AGENT.md` | `oplus-logs build-doc` |
| Env / wrappers | `/srv/android/scripts/{build_env.sh,build.sh}` | — |

## Build commands

Always `source` the canonical env first (keeps `CC_WRAPPER` stable → no needless full rebuild):
```
source /srv/android/scripts/build_env.sh     # sets $T, ccache, PATH, lunch lineage_infiniti-bp4a-userdebug
m nothing                                    # gate: rc==0 = graph parses
mka bacon                                    # full ROM zip -> out/target/product/infiniti/lineage-23.2-*.zip
mka vendorimage                              # targeted: config/XML-only change (no extract) — fast
```
**Long builds run in tmux** (ssh drop = dead build):
```
tmux new-session -d -s build "bash /srv/android/scripts/build.sh bacon >> /srv/android/logs/build.log 2>&1"
```
`build.sh` sources env, gates `m nothing`, builds at **full -j** (swap-backed), prints `build_rc`.

**Stage + retrieve the artifact.** `mka bacon` writes to `out/target/product/infiniti/lineage-23.2-*.zip`.
Promote the freshest one into the artifact store with the version convention, then pull it to the Mac:
```
bash /srv/android/scripts/stage-artifact.sh <ver>      # e.g. v2.4 -> artifacts/lineage-23.2-v2.4-infiniti.zip (+ .sha256)
oplus-logs artifact ls                                  # confirm it appears
oplus-logs artifact pull lineage-23.2-<ver>-infiniti.zip   # -> $ARTDIR on the Mac (default ~/oplus-artifacts)
```
`stage-artifact.sh` refuses to overwrite an existing version unless given `-f`.

## Build-launch traps (learned the hard way — check before scripting a build)

These cost real cycles this session; a build wrapper that ignores them fails at step 0.

1. **No `set -u` (and no `set -e`) around the env source.** `build/envsetup.sh` and `lunch` reference
   unbound vars and return non-zero — under `set -u`, `source build_env.sh` dies with `env source failed`.
   The canonical `build.sh` uses **no `set` flags**; match it. If you want `pipefail`, set it *after* the
   env source, never `set -u`.
2. **`repo` is NOT on PATH** — not even in a login shell on the builder. Two ways to sync:
   - launcher: `"$T"/.repo/repo/repo sync <project>`
   - single project (preferred for a targeted fix — no full-tree lock/mtime churn):
     ```
     git -C <project> fetch vivy <branch> && git -C <project> reset --hard FETCH_HEAD
     ```
   The build-tree remote is named **`vivy`** (the 1vivy fork), **not `origin`** — `git ... origin` no-ops.
3. **Long builds MUST run in tmux** (`tmux new-session -d -s <name> "...">> log 2>&1"`) — a bare ssh build
   dies on connection drop. Log to `/srv/android/logs/` so `oplus-logs build-log <id> -f` can tail it.
4. **Guard the build behind a cheap precondition.** e.g. the DV build aborts before `mka` unless the
   re-extract produced `c2.qti.dv`==3 — so a regressed fixup wastes 5 min, not 50.

(See also `docs/re-notes/cameraserver-static-link-build-traps.md` for the statically-linked-binary /
ccache-stale-object / adb-remount traps on `frameworks/av` work.)

## extract-files (regenerate blobs from the dump)
```
cd "$T"
PYTHONPATH=tools/extract-utils prebuilts/build-tools/linux-x86/bin/py3-cmd \
  device/oneplus/sm8850-common/extract-files.py \
  /srv/android/dumps/extracted/dump300_full --allow-prohibited-files
```
- Server Python 3.8 is too old → use the prebuilt `py3-cmd` (3.13). `-m` = makefiles only (no blob copy).
- **Re-running extract mtime-bombs the graph → near-full rebuild.** Per the incremental rule: *touch only
  the files you changed*; do NOT `git checkout --force` / `git lfs pull` / re-extract before an incremental.
- **DV CAVEAT (now retired):** the COMMON extract used to clobber the inline DV in `media_codecs_canoe_v2.xml`,
  requiring a manual `git checkout` restore. The `extract-files.py` blob_fixup now re-injects the 3 `c2.qti.dv`
  nodes automatically — re-extract regenerates DV; no manual restore. Verify: `grep -c 'MediaCodec name="c2.qti.dv'
  vendor/oneplus/sm8850-common/proprietary/vendor/etc/media_codecs_canoe_v2.xml` == 3.

## Host stability (why full `-j` is safe here)
- **64G swapfile** `/srv/swapfile` (fstab, `vm.swappiness=10`) — the dexpreopt/r8 phase spikes >62G RAM;
  swap is the cushion. `exit 137` = OOM, not a code error. Build at full `-j`, never `-j8`.
- **ccache** `compiler_check=content` (not mtime) → survives sync-bumped clang mtimes (0%→100% hit rate).
- Build from a clean `CCACHE_DIR` + verify at the **binary** level when LTO `.o` are bitcode (a stale `.o`
  can make `mka exit 0` ≠ change shipped — a documented cameraserver trap).

For the full reconciliation flow (commit → repo sync → extract → proprietary sync commit → push → build),
see `docs/SYNC.md` and `oplus-logs build-doc`.
