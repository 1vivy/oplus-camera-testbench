<!-- Parent: ../AGENTS.md -->

# tools/observability/strace — syscall-level env-failure A/B

**Why this kit exists:** every other lever in `../` reads *what the camera logs say*. strace reads
*what the kernel actually refused*. When a byte-identical blob behaves differently OOS↔LOS, the
divergence is an **environment input** — and the cheapest, most decisive class of those inputs shows
up as a failing syscall the verbose logs never print:

| Syscall signature | Attribution-matrix row | Fix class |
|-------------------|------------------------|-----------|
| `openat("…/camera/camxoverridesettings.txt") = -1 ENOENT` | #2 (no-JPEG / hdr_detected rc=-2) | **copy one file** — cheapest fix in the matrix |
| `connect`/`openat` allocator/mapper `= -1 EACCES` | #5 (IMapper@4.0 NULL, P010) | add sepolicy `allow` |
| `openat("…/lib64/libcsextimpl.so") = -1 ENOENT` | G5 (OEM binder layer absent) | ship the blob / stub |
| `ioctl(/dev/video*) = -1 E…` | sensor/IFE bring-up below CamX | vendor/kernel |

This is the missing complement to `../enable/*`: enablers turn logging *up*, strace shows the
failures logging can't express. Run it once on stock to learn the **passing** syscall set, then on
LOS — anything that fails on LOS but passed on OOS is a port regression with a concrete fix.

## Files
| File | Role |
|------|------|
| `10_strace_camera.sh` | Device probe — attaches strace to `cameraserver` + `camera-provider` for a window, on-device first-look summary. READ-ONLY (attach only; never restarts a partition bin). Single-block (KernelSU). |
| `30_run_strace.sh` | Host orchestrator — pushes the strace binary + kit, drives the symmetric capture, pulls to `reference/strace/<tag>`. |
| `parse_strace.py` | Host A/B verdict — ranks failing syscalls of interest, classifies each to its matrix row, and prints the **LOS-only failures** (the regressions). |

## Prerequisite — a static aarch64 `strace`
Toybox ships none and `user` builds lack it. Supply one on the host and point the orchestrator at it:
```sh
export STRACE_BIN=/path/to/static-aarch64-strace      # or drop it at strace/strace.aarch64
```
Source used: `strace-arm64` (v6.7, static) from
[github.com/Zackptg5/Cross-Compiled-Binaries-Android](https://github.com/Zackptg5/Cross-Compiled-Binaries-Android)
(`strace/strace-arm64`). Kept at `strace.aarch64` here but **git-ignored** — binaries stay out of the
tree, same rule as the patched diagnostic blobs. Verified ptrace-attaches to cameraserver under
enforcing SELinux via KernelSU `su` (no `setenforce 0` needed just to attach).

## Run (symmetric — both sides)
```sh
# stock OOS unit:
tools/observability/strace/30_run_strace.sh oos 25
# LOS build:
tools/observability/strace/30_run_strace.sh los 25
# verdict:
tools/observability/strace/parse_strace.py reference/strace/oos reference/strace/los
```
Drive an **identical** cycle inside the window — use `../capture/ui/drive_cycle.sh <mode>` so the
syscall sets are comparable. Pair the mode to the symptom you're chasing (e.g. `video8k` for the −38).

## Caveats
- strace adds latency. On the **marginal LOS HAL** the slowdown can itself trip `ERROR_CAMERA_DEVICE`
  (same failure class as the APS alog, gap G7) — if the camera dies *only* under strace, narrow
  `-e trace=` (drop `read`/`mmap`) or shorten the window. The failure-to-open still records before the kill.
- `setenforce 0` while capturing if you want to see the *intended* opens without the denial masking
  them; capture **again enforcing** to confirm which opens sepolicy actually blocks (#5).
- Attaches to the **running** PIDs — launch nothing as root that restarts cameraserver mid-capture.
