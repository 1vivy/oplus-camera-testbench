<!-- Parent: ../AGENTS.md -->

# tools/observability

**One place to turn on every camera subsystem's debug verbosity, see where logging is dark,
and attribute a downstream symptom to its true root subsystem.**

> **New here? Read [`TEST-PLAN.md`](TEST-PLAN.md) first** — it maps each open symptom to the exact
> test that resolves it, in ROI order, with the baseline-on-stock run sequence. This README is the
> *layout*; TEST-PLAN is *what to run and why*.

This folder exists because the project's instrumentation is *lever-rich but consolidation-poor*:
the /vendor + oplus-cam blobs (CamX, CHI, oemlayer, APS) are heavily tooled but the levers are
scattered across `../*.sh` + `../frida/*` and several are **clobbered at default**, while the
**LOS-replaced /system layer** (frameworks/av cameraserver, frameworks/base HardwareBuffer/
ImageReader/Surface, SurfaceFlinger/EDR) is **genuinely dark** — no setprop, no override, no
frida hook touches it today. Since the /vendor blobs are byte-identical OOS↔LOS, that /system
layer is where our remaining unknowns actually live.

## The core insight (read this first)
> A **byte-identical blob that behaves differently on LOS vs OOS is NEVER itself the divergence**
> — the divergence is in its *environment*. That environment spans two layers:
> **/system** (frameworks/av metadata lifetime, oplus-fwk stubs, framework JNI, display HAL caps,
> sepolicy) and **/vendor-config** (`camxoverridesettings.txt`, session state). The blob is the
> *crash/stall site*, not the *root*. `tables/attribution-matrix.md` tags every known symptom by
> which of those layers actually diverges.

## Layout
| Path | What it does |
|------|--------------|
| `enable/00_enable_all.sh` | Master: max-verbosity every instrumentable subsystem in one run; prints PASS/DARK per subsystem |
| `enable/10_vendor_camx_chi.sh` | CamX/CHI/OEM: clobber-defeat property + overlay masks (wraps `enable_verbose.sh` + `patch_chi_logclobber.py`) |
| `enable/20_system_framework.sh` | **The /system dark-zone probe** — tries every AOSP-standard lever, reports what yields signal |
| `enable/30_aps_native.sh` | APS/libAlgoProcess selectors + the alog **self-kill warning**; points to safe frida native hooks |
| `TEST-PLAN.md` | **The orienting map** — open symptom → decisive test → tool → ROI rank + coverage matrix + baseline sequence. Read first. |
| `capture/ab_capture.sh` | Identical open→preview→capture→close cycle on OOS **or** LOS, artifacts auto-tagged by build; takes a `[mode]` to delegate stimulus to the UI driver |
| `capture/parse_ab.py` | **A/B verdict** — reads an OOS dir + LOS dir, prints the attribution-matrix tells (hdr rc, copyMetadata UAF, fusion graph, EDR caps, 8K −38…) automatically |
| `capture/ui/` | Deterministic **mode-aware UI driver** (photo/burst/video/video8k/night/switch) — identical stimulus both builds; reaches #4/#8 the old single-photo cycle could not |
| `capture/AB-RUNBOOK.md` | The symmetric OOS↔LOS paired-capture procedure + what to diff per subsystem |
| `strace/` | **Syscall env-failure A/B** — surfaces the cheap fixes (missing config = ENOENT #2, sepolicy denial = EACCES #5) the verbose logs can't express (`10_` device probe + `30_` orchestrator + `parse_strace.py`) |
| `debug/` | **AOSP runtime debugging** — `debuggerd -b` live freeze unwind (#1, non-fatal) + `simpleperf` G7-safe APS profile + `parse_tombstone.py` crash attribution (#4/#6) |
| `tables/lever-index.md` | Per-subsystem lever table: WORKS / CLOBBERED / DARK + exact mechanism + how to enable |
| `tables/attribution-matrix.md` | Symptom → proximate site → attributed root → **true divergence layer** → comparability → missing artifact |
| `tables/logging-gap-register.md` | Dark-spot map: where we're blind, why, and the bridge option |
| `r3-gralloc/` | **OOS baseline v3 capture kit** — settles the doc-42 §2.5 CamxFormatUtil-namespace root for the libapsfixup/getStub-flip family (decisive `10_` probe + `20_` alloc/dlopen frida + `30_` orchestrator + `parse_r3.py`) |
| `r4-oem-transact/` | **OOS baseline v3 capture kit** — the `media.camera` OEM-transaction layer (doc-48 / gap G5): symmetric `libcsextimpl`/`CameraServiceExtImpl` capture — Depth-1 binder codes 10000–10022 + Depth-2 internal hooks (incl. the 8K `beforeConfigureStreamsLocked` StreamSet test); `10_` presence probe + `20_` dual-mode frida + `30_` orchestrator + `parse_r4.py` |

## Quickstart (rooted OP15, frida-server up)
```sh
# push and run the master enabler (reversible — no partition writes)
adb push tools/observability/enable /data/local/tmp/obs-enable
adb shell su -c 'sh /data/local/tmp/obs-enable/00_enable_all.sh'
adb pull /data/local/tmp/obs_enable_summary.txt   # per-subsystem PASS/DARK

# answer "is /system instrumentable without a build?" then capture a cycle
adb shell su -c 'sh /data/local/tmp/obs-enable/20_system_framework.sh'
adb shell su -c 'sh /data/local/tmp/obs-capture/ab_capture.sh'   # see capture/
```

## The pivotal decision this folder resolves
`20_system_framework.sh` is built to answer the one fact that decides the whole /system strategy:

```
            ┌─ AOSP levers yield signal? ─┐
   run 20 → │                             │
            YES                           NO
            │                             │
   ship runtime levers          /system is zero-visibility-until-flash
   (log.tag.* / atrace /        → follow capture/AB-RUNBOOK.md §"Debug-image recipe"
    perfetto / dumpsys)           (build eng frameworks/av + frameworks/base, ALOGV unstripped)
```

## Conventions (inherited from ../AGENTS.md)
- Device scripts are `#!/system/bin/sh`, **single-block** (KernelSU drops post-first `su -c` lines),
  **READ-ONLY / reversible** — they never write `persist` or a real partition; verbosity is via
  bind-mount overlay + `setprop` (revert by `umount` + reboot).
- Outputs land in `/data/local/tmp/obs_*`; pull them into `../../reference/` for diffing.
- Re-verify binary offsets against the build hash before trusting `patch_chi_logclobber.py` (see its header).
