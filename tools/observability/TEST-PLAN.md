<!-- Parent: ../AGENTS.md -->

# Camera-Port Test Plan — the orienting map

**Read this before running anything.** The harness has many levers; this is the one page that says
*which test to run, for which symptom, in what order, and what "done" looks like.* It exists so the
baseline-testing effort tracks the **open attribution-matrix rows**, not the volume of available logs.

The governing rule (from `tables/attribution-matrix.md`): a byte-identical blob is never the root — the
divergence is an **environment input** in /system or /vendor-config. So every test below is an **A/B**:
run it on stock OOS *and* on LOS with **identical stimulus** (`capture/ui/drive_cycle.sh <mode>`), and
the *difference* is the finding. A single-side run is triage, not evidence.

---

## 1. Baseline-on-stock first (do this before touching LOS)

You cannot diff against a baseline you never captured. Three matrix gaps (G3, G4, plus the working-state
freeze baseline) are *LOS-only or NEITHER* purely because **stock was never captured the same way**.
Close them on the stock OOS unit, in this order:

| # | Capture on stock | Tool | Produces | Closes |
|---|------------------|------|----------|--------|
| B1 | StaticSettings dump | `frida/dump_camxsettings.js` | exact OOS `+0x6a28`/`+0x6a18` values → names the override key | **G3** (cheapest high-value probe in the repo) |
| B2 | Full A/B cycle, photo + burst + video8k | `capture/ab_capture.sh <mode>` (+ `00_enable_all.sh` first) | the golden OOS artifact set per mode | **G4**, baseline for #1/#2/#4/#8 |
| B3 | Syscall set, same modes | `strace/30_run_strace.sh oos` | the *passing* openat/ioctl set | baseline for #2/#5 (LOS-only failures pop against it) |
| B4 | Live backtrace of working preview | `debug/10_runtime_debug.sh` | where APS/preview threads sit when it *works* | baseline for the freeze #1 |

Store these under `reference/{ab,strace,debug}/oos…`. They are the denominator for everything in §2.

---

## 2. Open symptoms → the exact test that resolves each (ROI-ordered)

| Rank | Symptom (matrix row) | Status | The decisive test | Tool | "Resolved" = |
|------|----------------------|--------|-------------------|------|--------------|
| 1 | **#2 no-JPEG / hdr_detected rc=-2** | FIX KNOWN, confirm | A/B `dump_camxsettings.js` + `parse_ab.py` hdr row | `frida/dump_camxsettings.js`, `capture/parse_ab.py` | OOS `+0x6a28=1` vs LOS `=0` confirmed → ship `camxoverridesettings.txt` key |
| 2 | **config-presence (is the override file even there on LOS?)** | cheap | strace A/B — `openat(camxoverridesettings.txt)` ENOENT on LOS? | `strace/parse_strace.py` | LOS shows ENOENT on a file OOS opens → copy-one-file fix |
| 3 | **#1 preview freeze (frame-1 stall)** | OPEN | live unwind on a frozen LOS preview vs working baseline (B4) | `debug/10_runtime_debug.sh` + `frida/trace_preview_delivery.js` | the parked frame on LOS identified (`decMetaRefZeroToRemove` upcall path) |
| 4 | **#8 8K `configure_streams(0x80a9)` −38** | OPEN (2 candidates) | drive `video8k` while tracing OEM server hooks + EISv2 ports | `capture/ui/drive_cycle.sh video8k`, `r4-oem-transact/`, `frida/hook_configure_streams.js` | which candidate fires: OEM `beforeConfigureStreamsLocked` vs Gralloc5 usage |
| 5 | **#4 back-to-back copyMetadata UAF** | CONFIRMED /system | drive `burst`, symbolicate the tombstone | `capture/ui/drive_cycle.sh burst`, `debug/parse_tombstone.py` | tombstone matches #4 signature → provider/OCS result ref-hold |
| 6 | **#5 P010 / IMapper@4.0 NULL** | INFERRED, BLOCKED on #1 | strace A/B *enforcing* — EACCES on allocator/mapper for camera proc | `strace/30_run_strace.sh` (enforcing) | LOS-only EACCES → sepolicy `allow` (audit2allow) |
| 7 | **#3 over-exposure / EDR** | CONFIRMED /system | `sf_pre/post` HDR-caps A/B | `capture/ab_capture.sh` + `parse_ab.py` edr row | LOS SF lacks HLG/PQ → stubs-jar / display-HAL fix |
| 8 | **#7 getOplusHardwareBuffer fallback** | CONFIRMED /system, feeds #1 | JNI presence trace | `frida/probe_getoplushwbuffer.js` | confirm `nativeGetOplusHardwareBuffer` absent on LOS |
| 9 | **G2 fusion reprocess graph** | needs declobber | declobbered CHI trace A/B, `parse_ab.py` fusion row | `enable/10` + **all** of `patch_chi_logclobber.py` | OOS fusion nodes present, LOS≈0 |

**Rule of thumb:** ranks 1–2 are *cheap config fixes* (file/sepolicy) — exhaust them before the
*expensive* /system rows (3–9), which may need an eng debug image (AB-RUNBOOK §"Debug-image recipe").
Ranks 1, 2, 5, 7 are decision-ready **today** with these tools; 3, 4, 6 need the B-series baselines first.

---

## 3. Coverage matrix — test-type × subsystem (where we can/can't see)

`✓` = covered by a tool in this repo · `~` = partial/conditional · `✗` = still dark.

| Subsystem \ Test type | logcat/dumpsys | atrace/perfetto | frida hook | **strace** | **debuggerd/simpleperf** | UI-mode reach |
|-----------------------|:--------------:|:---------------:|:----------:|:----------:|:------------------------:|:-------------:|
| CamX/CHI (/vendor)    | ✓ (`enable/10`) | ~ | ✓ | ✓ (cfg opens) | ✓ | ✓ |
| APS/libAlgoProcess (/odm) | ~ (self-kill G7) | ✗ | ✓ (`probe_aec_*`) | ✓ | **✓ (simpleperf = G7-safe)** | ✓ |
| OEM ext layer (/odm,/system) | ~ | ✗ | ✓ (`r4`) | ✓ (.so presence) | ✓ | ✓ |
| frameworks/av (/system) | ~ (`enable/20` probe) | ~ | ✗ (no oplus code) | ✓ (the dark-zone win) | **✓ (live unwind = freeze)** | ✓ |
| frameworks/base JNI (/system) | ~ | ✗ | ~ (Java only) | ✓ | ✓ | ✓ |
| gralloc/mapper (/vendor) | ✗ | ✗ | ✓ (`trace_p010`) | **✓ (EACCES = #5)** | ~ | n/a |
| SurfaceFlinger/EDR (/system) | ✓ (dumpsys only) | ~ | ✗ | ~ | ✗ | n/a |

**What this pass added** (previously all `✗` in their columns): the **strace** column (env-failure
visibility — the cheapest fixes live here), the **debuggerd/simpleperf** column (live freeze unwind +
G7-safe APS profiling), and **UI-mode reach** (the old harness could only do one photo cycle → it could
not reach #4/#8 at all).

---

## 4. Still missing after this pass (next candidates, not built)

Logged so coverage isn't *silently* overstated:
- **perfetto camera+gfx trace automation** — `enable/20` records the *command* but nothing captures/parses
  a `.pftrace`. A `perfetto/` kit would give frame-timeline visibility on the freeze that ANR dumps approximate.
- **Full tombstone symbolication** — `parse_tombstone.py` stops at module+offset; wiring `llvm-symbolizer`
  + unstripped libs would give line numbers.
- **Automated determinism check** — no tool yet runs a mode N× and flags non-deterministic captures
  (a flaky A/B is worse than none). Cheap to add as a loop around `ab_capture.sh` + variance check in `parse_ab.py`.
- **eng /system debug image** — the real bridge for G1/#3/#7 if `enable/20` proves runtime levers are
  silent. Out of scope for device-side tooling; tracked in AB-RUNBOOK §"Debug-image recipe".

---

## 5. One-glance run order
```sh
# stock OOS unit — baselines (§1):
adb shell su -c 'sh /data/local/tmp/obs-enable/00_enable_all.sh'
frida -U -n com.oplus.camera -l tools/observability/../frida/dump_camxsettings.js   # B1/G3
tools/observability/capture/ab_capture.sh photo   # then burst, video8k (B2)
tools/observability/strace/30_run_strace.sh oos   # B3
# LOS build — same modes, then verdicts:
tools/observability/capture/ab_capture.sh photo   # (burst, video8k…)
tools/observability/capture/parse_ab.py    reference/ab/oos-photo  reference/ab/los-photo
tools/observability/strace/parse_strace.py reference/strace/oos    reference/strace/los
# any 'live'/'DIVERGES' row -> open its dedicated kit (column 4 of §2).
```
