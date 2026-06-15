# KernelSU mount/dev-loop note

For OP15/Oplus camera bringup, the preferred `adb remount`-like workflow is:

```text
KernelSU + Hybrid Mount Lite + magisk-frida
```

## Recommendation

Use **Hybrid Mount Lite** as the dev-oriented KernelSU metamodule.

- Repo/module: `Hybrid-Mount/meta-hybrid_mount`
- Flavor: **Lite**
- Why Lite: keeps WebUI + CLI + OverlayFS + Magic Mount, without the extra Kasumi LKM/hide/spoof surface from Full.

Use **magisk-frida** for the persistent `frida-server` side:

- Repo: `ViRb3/magisk-frida`
- Supports KernelSU despite the name.

## Why Hybrid Lite

Hybrid Lite is closer to a development `adb remount` loop than plain `meta-overlayfs` because it supports per-module/per-path policy:

- `overlay` for directory/config trees.
- `magic` for direct bind-mount-style replacement of individual files, especially `.so` blobs.
- WebUI in KernelSU Manager.
- CLI: `hybrid-mount ...`.

Example policy shape:

```toml
[rules.oplus_cam_dev]
default_mode = "overlay"

[rules.oplus_cam_dev.paths]
"vendor/lib64/libAlgoProcess.so" = "magic"
"odm/lib64/camera.oemlayer.v2.so" = "magic"
"vendor/etc/camera" = "overlay"
"system_ext/etc/permissions" = "overlay"
```

## Suggested dev module

Create one reusable module:

```text
/data/adb/modules/oplus_cam_dev/
├── module.prop
├── system/
│   ├── vendor/
│   │   ├── lib64/
│   │   └── etc/camera/
│   ├── odm/
│   │   └── lib64/
│   └── system_ext/
│       └── etc/permissions/
└── post-mount.sh
```

`module.prop`:

```ini
id=oplus_cam_dev
name=Oplus Camera Dev Overlay
version=1
versionCode=1
author=vivy
description=Temporary camera bringup overlay
```

## Verification commands

```sh
adb shell su -c 'hybrid-mount daemon status'
adb shell su -c 'hybrid-mount api modules-list'
adb shell su -c 'hybrid-mount api mount-stats'
```

## Fallbacks

- If Hybrid Lite is unstable on the device, fall back to `meta-overlayfs`.
- If rules become stable and you want minimal runtime surface, consider Hybrid Nano.
- For one-off runtime tests only, a direct bind mount can still be used:

```sh
adb push foo.so /data/local/tmp/foo.so
adb shell su -c 'mount -o bind /data/local/tmp/foo.so /vendor/lib64/foo.so'
```

## Guardrails

- This is systemless; it is not literal physical `adb remount`.
- Do not write real partitions for camera bringup experiments.
- Never touch or overwrite `/mnt/vendor/persist`.
- Prefer `magic` for exact blob swaps and `overlay` for config/permission directory trees.

## ⚠️ Incident / hard lessons (2026-06-13 — bootloop)

A naked KSU module `oplus_cam_dev` shipping `system/vendor/etc/camera/camxoverridesettings.txt`
**bootlooped the device**. Hybrid Mount's `run/daemon_state.json` showed `overlay_modules:[oplus_cam_dev]`,
`active_mounts:["vendor"]`, `overlayfs_mounts:1` then `daemon.alive:false` — i.e. it overlaid the **whole
`/vendor` partition** to create a *new* path, and boot never completed. Recovered by `rm -rf
/data/adb/modules/oplus_cam_dev` + reboot (the daemon_state.json is an OUTPUT snapshot, regenerated at boot —
the harmful mount can't recur once the module is gone).

**Rules learned (this device, V16.1.0, Hybrid Mount metamodule):**
1. **Do NOT overlay `/vendor`** via a module — it bootloops here. (`/odm` is safe; the working OP13-OCVM mod
   overlays `/odm` + replaces existing `/vendor/lib64` files, never a new `/vendor` path.)
2. **Do NOT create a brand-new path** in a system partition via overlay; only **replace existing** files/dirs
   (model strictly on OP13-OCVM: MMT-Extended, `PARTOVER=true PARTITIONS="/odm …"`, explicit per-path SELinux
   contexts in `customize.sh set_permissions()` AND re-asserted in `service.sh`).
3. **Do NOT ship a `camxoverridesettings.txt`** in a boot-time module — the boot-time camera/vendor HAL init
   chokes on it (max masks + `enableAsciiLogging` at boot). OP13-OCVM tunes via `persist.prop`/`system.prop` + lib
   swaps, never an override file.
4. For the **CamX-core `enableAsciiLogging` unlock**: the **naked-overlay** route is off the table, but the
   override-file IS viable via a **scoped `magic` mount** (see ✅ Correct method below) — or via the **runtime
   frida struct-write** (no reboot), per `reference/captures/g4-working-preview-1/FINDINGS.md`.
5. Hybrid Mount IS installed (`/data/adb/{hybrid-mount,metamodule}`, `modules/hybrid_mount`) even though the
   `hybrid-mount` CLI isn't on `$PATH` — use its overlay/magic rule policy, don't drop naked `system/` modules.
