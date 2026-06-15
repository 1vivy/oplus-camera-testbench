<!-- Parent: ../observability/AGENTS.md -->

# oplus_cam_probes — camera bringup facilitation module (doc-50)

A KernelSU module that is the **facilitation layer for camera bringup**, with two facets:

1. **HOOKS** — boot-persistent frida injection of the **opt-in** probe set (`service.sh`, late_start), so
   instrumentation needs no host `frida -U` in the loop. Survives reboot + OTA. (Built to the anchoring
   strategy in `docs/rearch/50`.)
2. **PATCHES** — systemless **binary-patch overlay**: context-preserving **bind mounts** of validated
   vendor/odm blobs (`post-fs-data.sh` → `lib/mount_patches.sh`), applied before the camera HAL dlopen()s
   them. **Replace-existing-only** (can't create a new partition path), context-preserved, disable-gated,
   **inert** until `patches/manifest` lists entries.

Both facets are INERT until configured and **fail-open** (never block boot). The module ships **no
`system/` tree and does no whole-partition overlay** — structurally immune to the 2026-06-13 `/vendor`
overlay bootloop class (KERNELSU-MOUNT-NOTES).

## Patches facet — how to wire a blob (safely)
1. Drop the replacement under `patches/<target-rel>` (e.g. `patches/vendor/lib64/libAlgoProcess.so`).
2. Add a manifest line: `/vendor/lib64/libAlgoProcess.so  vendor/lib64/libAlgoProcess.so  auto`.
3. `install.sh` (or push `patches/` + `manifest`), reboot, check `/data/local/tmp/probe-logs/patches.log`
   for `BOUND …`. Emergency disable without removing the module: `touch
   /data/local/tmp/oplus_cam_probes.no_patches` (or `disable_patches` in the module dir) + reboot.
- **Rules enforced by the engine** (validated on-device 2026-06-14): replace-existing-only (a new target
  path is REFUSED), SELinux context copied from the target, `/mnt/vendor/persist` refused, ELF-for-`.so`
  sanity. A per-file `/vendor/lib64` replace is allowed; a whole-`/vendor` overlay is not what this does.
- **Validate every blob off the daily driver first.** A bad bind in `post-fs-data` can bootloop; recovery
  is `rm -rf /data/adb/modules/oplus_cam_probes` (or the `.no_patches` sentinel) + reboot.

## Design / KSU-guideline compliance
- **/data-only. Mounts NOTHING.** No `system/` tree, no `/vendor` overlay, no `camxoverridesettings.txt` —
  so it is structurally immune to the bootloop class from the KERNELSU-MOUNT-NOTES incident (2026-06-13).
- **`service.sh` is a KernelSU `late_start` service** (forked, non-blocking) — correct place for the poll
  loop; never `post-fs-data.sh` (that blocks boot).
- **Fail-safe:** any missing piece (no `frida-inject`, no config) → log to `injector.log` + `exit 0`. The
  module never blocks or crashes boot. Without `bin/frida-inject` it is simply INERT.
- **OTA survival:** lives in `/data/adb/modules`, which KernelSU re-applies across OTA.

## Layout
```
oplus_cam_probes/
├── module.prop            # KSU module manifest (dual-facet description)
│  # --- HOOKS facet ---
├── service.sh             # late_start injector: settle, then poll-inject per probes.conf
├── config/probes.conf     # OPT-IN target→bundle→mode map (what attaches at boot)
├── bundle.manifest        # which probe scripts compose each agent bundle
├── agent/*.js             # AUTO-BUILT bundles (_anchor.js + IIFE-wrapped probes) — build_bundle.sh
├── bin/frida-inject        # aarch64 injector — external binary; add to make the HOOKS facet LIVE
│  # --- PATCHES facet ---
├── post-fs-data.sh        # early hook: apply binary-patch overlays before HAL loads blobs
├── lib/mount_patches.sh   # context-preserving bind-mount engine (replace-existing-only, gated)
└── patches/
    ├── manifest           # <target_abs> <source_rel> [ctx|auto] — INERT when empty
    └── <blobs>            # replacement vendor/odm .so files, mirrored by relative path
```

## Injection model
`service.sh` waits for `sys.boot_completed` + a 25s settle, then loops over `probes.conf`:
- `mode=resident` (daemons: `cameraserver`): inject once when the pid appears.
- `mode=app` (`com.oplus.camera`): re-inject on every fresh app pid (poll-based spawn-gate).
Each inject is `frida-inject -p <pid> -s agent/<bundle>.js` kept attached so `console.log` streams to
`/data/local/tmp/probe-logs/<target>.log`. The `_anchor.js` symbol cache lives in
`/data/local/tmp/probe-symbols/`.

## The one external dependency: frida-inject
`frida-inject` is the on-device headless injector. It is **not** bundled (external binary; fetching it is
gated on explicit approval). To make the module LIVE:
1. Obtain `frida-inject` for **aarch64** matching the device `frida-server` version
   (currently **17.12.0** — `frida/frida` GitHub release asset `frida-inject-17.12.0-android-arm64.xz`).
2. `xz -d`, then place at `oplus_cam_probes/bin/frida-inject` and re-run `install.sh` (or push directly to
   `/data/adb/modules/oplus_cam_probes/bin/frida-inject`, `chmod 0755`).
3. Reboot. Check `/data/adb/modules/oplus_cam_probes/injector.log` and `/data/local/tmp/probe-logs/`.

App-side note: the device already runs `ksufrida` (Zygisk gadget) + `magisk-frida` (frida-server); this
module deliberately uses its own `frida-inject` path rather than ksufrida's opaque WebUI config, so daemon
and app injection share one mechanism.

## Build / install / uninstall
```sh
tools/persistence/build_bundle.sh                 # rebuild agent/*.js from sources + manifest
tools/persistence/install.sh                      # build + install to /data/adb/modules (activates on reboot)
adb shell su -c 'rm -rf /data/adb/modules/oplus_cam_probes' && adb reboot   # uninstall
```
Verify after boot: `adb shell su -c 'cat /data/adb/modules/oplus_cam_probes/injector.log'`.
