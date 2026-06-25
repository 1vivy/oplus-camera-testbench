# WORKFLOW — the loop (start here)

> **New session? Read this first.** It is the switchboard for every routine task: bootstrap, edit,
> sync, build, overlay-test, retrieve, ledger. Each row points to the authoritative runbook so you
> don't have to reconstruct the workflow from scattered docs. The Dolby-Vision codec fix is threaded
> through as the worked example.

## Three machines, one loop

```
  Mac (HERE) = EDIT SITE            aosp-builder = BUILD SITE              device (on the Mac)
  infiniti-camera-port/repos/  push  /srv/android/worktrees/lineage-       flash / overlay
  = 11 gitignored clones of   ─────► infiniti  — repo-syncs from 1vivy  ─► + on-device verify
  1vivy forks (cam-final)     1vivy   then builds (mka) per /srv/android/    (adb, root)
                              creds    AGENT.md; artifacts+logs under /srv
                          ◄──────────────────────────────────────────────
                            oplus-logs  (retrieve: reference/ + build logs/artifacts/AGENT.md)
```

- **Mac = the only place you edit and push.** Git creds live here; the builder is pull-only.
- **aosp-builder = the only place you build.** It `repo sync`s the 1vivy forks into the build tree.
  Its ops authority is `/srv/android/AGENT.md` — read it from here with `oplus-logs build-doc`.
- **device = on the Mac** (adb, root). Flash full builds, or overlay a single file for a reversible test.

## Push tiers — not everything is branch-worthy (no Gerrit)

Use `repo start` / `repo abandon` for in-flight hygiene; we deliberately stop short of `repo upload`/Gerrit.

| Tier | For | Lives in | Ledger |
|------|-----|----------|--------|
| **0 · Overlay** | reversible device A/B test | `camera-bringup/overlays/` (gitignored) via `adb remount` | `camera-bringup/records/LEDGER.md` |
| **1 · WIP build** | experimental build, not canonical | `wip/<topic>` branch on the fork; builder syncs it ad-hoc | overlay ledger, marked WIP |
| **2 · Canonical** | validated, branch-worthy fix | merge `wip/<topic>` → `lineage-23.2-cam-final` | `infiniti-camera-port/ITERATION-LOG.md` |

Promotion is one-way (0/1 → 2) and only when it earns it. `cam-final` stays clean — only promoted work lands.

## The six routine concerns

| Concern | Do this | Authority |
|---------|---------|-----------|
| **Bootstrap edit-site** | `infiniti-camera-port/bootstrap-repos.sh` (clones the 11 forks into `repos/`) | `infiniti-camera-port/README.md` |
| **Sync Mac → builder** | edit in `repos/<path>` → commit → `git push` → on builder `repo sync <project>` | `docs/SYNC.md` |
| **Build (full / module)** | builder: `source /srv/android/scripts/build_env.sh` → `m nothing` → `mka bacon` (or `mka vendorimage`) | `oplus-logs build-doc` (= `/srv/android/AGENT.md`), `docs/BUILD-HOST.md` |
| **Overlay a change (reversible)** | `adb remount` → push file to a partition → restart consumer → verify → revert | `docs/OVERLAY.md`, `KERNELSU-MOUNT-NOTES.md` |
| **Retrieve logs / artifacts** | `oplus-logs status` · `build-log [id\|latest] [-f]` · `artifact pull <zip>` · `cond pull <c>` | `oplus-logs help` |
| **Ledger it** | Tier 0/1 → `camera-bringup/records/LEDGER.md`; Tier 2 → `infiniti-camera-port/ITERATION-LOG.md` | `docs/LEDGER-SCHEMA.md` |

Hardcoded paths that must not be renamed: see `docs/PATH-COUPLING.md`.

## Worked example — the DV codec fix (one full loop)

Symptom: DV HDR video broke again on v2.3 — the loaded `media_codecs_canoe_v2.xml` shipped **0 `c2.qti.dv`**
because the `sm8850-common` device extract strips the DV nodes and never re-injects them (recurring trap #29).

1. **Bootstrap** the edit-site: `infiniti-camera-port/bootstrap-repos.sh` → `repos/device/oneplus/sm8850-common`.
2. **Tier-0 overlay** (prove the content + immediate stopgap, no build):
   ```
   adb remount
   adb push fixed_media_codecs_canoe_v2.xml /vendor/etc/media_codecs_canoe_v2.xml
   adb shell am force-stop com.oplus.camera        # rebuilds its MediaCodecList on next open
   ```
   Verify registration (no UI needed): the loaded XML has `c2.qti.dv ×3` **and** the codec2 store lists them:
   ```
   adb shell getprop ro.media.xml_variant.codecs                                  # _canoe_v2
   adb shell grep -c 'MediaCodec name="c2.qti.dv' /vendor/etc/media_codecs_canoe_v2.xml   # 3
   adb shell dumpsys android.hardware.media.c2.IComponentStore/default | grep -B1 video/dolby-vision
   ```
   Revert: `adb shell cp /data/local/tmp/media_codecs_canoe_v2.xml.orig /vendor/etc/media_codecs_canoe_v2.xml`
3. **Durable fix** (Tier 1 → 2): edit `repos/device/oneplus/sm8850-common/extract-files.py` — extend the
   `media_codecs_canoe_v2.xml` blob_fixup to re-inject the 3 DV nodes after the google-strip (so every
   re-extract keeps DV). Push as `wip/dv-codec`; promote to `cam-final` once confirmed.
4. **Build** on the builder: `repo sync device/oneplus/sm8850-common` → re-run extract (fixup fires) →
   `m nothing` → `mka bacon`. Retrieve: `oplus-logs artifact pull lineage-23.2-vX.Y-infiniti.zip`. Flash.
5. **Ledger**: Tier-0 result in `camera-bringup/records/LEDGER.md`; the promoted build in `ITERATION-LOG.md`.

---
*Companion runbooks: `docs/SYNC.md`, `docs/BUILD-HOST.md`, `docs/OVERLAY.md`, `docs/LEDGER-SCHEMA.md`,
`docs/PATH-COUPLING.md`. Build-host ops truth: `oplus-logs build-doc`.*
