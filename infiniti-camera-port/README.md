# infiniti-camera-port

LOS-side bring-up scaffold for porting the Oplus camera stack to the **OnePlus 15
(infiniti, SM8850)** on LineageOS 23.2. Parallel to `../dodge-camera-port` (which is
the sm8750 oracle), but owned end-to-end by `1vivy` on a single unified branch so the
camera work can be landed and the B-side diff run cleanly.

## What this is

- **`local_manifests/infiniti-camera.xml`** — the "local snippet": a repo local-manifest
  that overrides the infiniti device-closure + camera-modification projects to point at
  the **`1vivy`** forks on branch **`lineage-23.2-cam-final`**, and adds the two camera-port
  projects that are not in the base manifest (`vendor/oplus/camera`,
  `device/qcom/sepolicy_vndr/sm8850`).
- **`repos/`** — the canonical working clones of all 11 repos at `lineage-23.2-cam-final`
  (origin → `1vivy`), held **locally here** in `infiniti-camera-port/repos/` (~12 GB; not committed
  to the parent git tree). Edit + land patches here, push to `1vivy`. The **build server** does not
  keep a manual copy — it `repo sync`s these branches from `1vivy` via the snippet at build time.

## The 11 repos (branch `lineage-23.2-cam-final`, origin `1vivy`)

| path (in a synced tree) | 1vivy repo | cam-final base | role |
|---|---|---|---|
| `device/oneplus/infiniti` | android_device_oneplus_infiniti | lineage-23.2 | device |
| `device/oneplus/infiniti-kernel` | android_device_oneplus_infiniti-kernel † | lineage-23.2 | device |
| `device/oneplus/sm8850-common` | android_device_oneplus_sm8850-common | lineage-23.2 | device |
| `vendor/oneplus/infiniti` | proprietary_vendor_oneplus_infiniti | lineage-23.2 | blobs |
| `vendor/oneplus/sm8850-common` | proprietary_vendor_oneplus_sm8850-common | lineage-23.2 | blobs |
| `hardware/oplus` | android_hardware_oplus | lineage-23.2 | HAL/hwbinder |
| `frameworks/av` | android_frameworks_av † | lineage-23.2 | **camera (los-impl av/0001,0002)** |
| `frameworks/base` | android_frameworks_base | lineage-23.2 | **camera (los-impl base/0001)** |
| `frameworks/native` | android_frameworks_native † | lineage-23.2 | **camera (los-impl native/0001)** |
| `vendor/oplus/camera` | vendor_oplus_camera ‡ | dodge A16 @`1c2c269` | **OEM camera blobs + stubs + sepolicy + OppoGallery2** |
| `device/qcom/sepolicy_vndr/sm8850` | android_device_qcom_sepolicy_vndr | lineage-23.2-caf-sm8850 | sepolicy |

† forked into `1vivy` as part of this setup (av/native from LineageOS, infiniti-kernel from
OnePlus-SM8850-Development). The other 8 forks pre-existed.

‡ **`vendor_oplus_camera` is sourced from `../dodge-camera-port/repos/vendor_oplus_camera`**
(the complete, proven dodge camera port — OppoGallery2 + SDK/sepolicy/watermark patches), **not** the
koaaN/A16 fork. `1vivy/vendor_oplus_camera@cam-final` was force-updated to the dodge tip `1c2c269`
(unrelated history to the koaaN branches, which remain on `A16`/`lineage-23.2-camera`). The local clone
keeps a `dodge` remote (→ `github.com/dodge-camera-port/vendor_oplus_camera`) alongside `origin`→`1vivy`,
so dodge updates can be pulled in.

**Bases are clean** (no camera commits) **except `vendor_oplus_camera`**: per the chosen plan, `cam-final`
branches off clean `lineage-23.2` (or each repo's clean equivalent) and the `los-impl/` patches land on
`cam-final` **separately** — so history stays legible and the B-side diff attributes regressions to
specific patches. `vendor_oplus_camera` is the deliberate exception: it carries the dodge camera-port
content directly (it *is* the camera payload, not a clean base).

### Excluded from the set (documented, intentional)

- `kernel/oneplus/sm8850` — the infiniti manifest maps this to **AOSP `kernel/common`**
  (`android16-6.12-lts`, `remote=aosp`, `clone-depth=1`), not a OnePlus repo → no fork, no camera change.
- `kernel/oneplus/sm8850-devicetrees`, `…-modules` — referenced in `sm8850-common/lineage.dependencies`
  but **not synced** by the infiniti manifest (the kleaf `kernel/platform/kernel-6.12` tree is used instead).

## Source of truth

- Stock infiniti manifest: `vivy@10.9.20.67:/srv/android/worktrees/lineage-infiniti`
  (`.repo/manifests/snippets/infiniti.xml` + `oplus-common.xml`, `local_manifests/infiniti.xml`).
- The `lineage-23.2-cam-final` branch was created on each `1vivy` fork from its clean base SHA
  (except `vendor_oplus_camera`, force-set to the dodge-camera-port tip — see ‡ above).
- The snippet is also staged on the build server at `/srv/android/infiniti-camera-port/local_manifests/`
  for install into the lineage-infiniti worktree's `.repo/local_manifests/`.

## Next steps (LOS bring-up → B-side diff)

1. Land `../los-impl/patches/` onto the relevant `cam-final` branches (av/base/native), plus the
   R1/R3/R4/R6 work per `../los-impl/PHASE-D-CORRECTIONS.md`, and push to `1vivy`.
2. Sync an infiniti tree with `local_manifests/infiniti-camera.xml` and build.
3. Replay the OOS baseline conditions on the LOS build and run
   `../tools/observability/campaign/diff_oos_los.py <oos_cond> <los_cond>` →
   first diverging checkpoint = where LOS went wrong.
