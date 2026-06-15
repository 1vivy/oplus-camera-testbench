<!-- Parent: ../AGENTS.md -->

# tools/observability/debug — AOSP runtime debugging (non-fatal)

The capture harness *collected* crash artifacts but never *read* them, and had no way to inspect a
**live** stuck process. This kit adds the two standard AOSP debugging moves that fit this port:

| Tool | What it answers | Why it's the right tool here |
|------|-----------------|------------------------------|
| `debuggerd -b <pid>` | where every thread is parked **right now**, no crash | The freeze (#1) leaves no tombstone — the preview thread is *blocked*, not dead. This unwinds it live. |
| `simpleperf record` | the hot path in provider/APS | The APS alog self-kills the marginal HAL on disk-I/O latency (G7); simpleperf samples with ~no latency — the safe substitute. |
| `parse_tombstone.py` | one-line attribution of a crash | Matches the two known signatures (#4 copyMetadata UAF, #6 strlen-null TurboHDR) instead of reading 500 lines. |

## Files
| File | Role |
|------|------|
| `10_runtime_debug.sh` | Device — `debuggerd -b` live backtraces of cameraserver+provider, app ANR dump, optional `simpleperf` sample. READ-ONLY, single-block (KernelSU). Run **during** the symptom. |
| `parse_tombstone.py` | Host — distil a tombstone (or a dir of them) to signal + crashing frame + known-signature verdict. stdlib only. |

## Use
```sh
# during a FROZEN preview (run the camera, see it stall, THEN):
adb push tools/observability/debug /data/local/tmp/obs-debug
adb shell su -c 'sh /data/local/tmp/obs-debug/10_runtime_debug.sh 8'
adb pull /data/local/tmp/obs_debug ./reference/debug/los-freeze
# read where the threads are parked:
#   bt_<provider>.txt  -> is APS holding frame 1 in libAlgoProcess (the decMetaRefZeroToRemove stall)?
#   app_anr.txt        -> is onImageAvailable/GLThread waiting?
# symbolicate any crash:
tools/observability/debug/parse_tombstone.py reference/debug/los-freeze
# CPU profile (open perf_top.txt, or on host: simpleperf report -i perf.data):
```

## Notes
- `debuggerd -b` needs the target's debuggerd to be reachable; on a locked-down build run as root
  (KernelSU `su`). It is **read-only** — it will not crash a working camera, so it's safe to run on
  the stock OOS unit too (capture the *working* backtrace as the baseline to diff the freeze against — gap G4).
- `simpleperf` is absent on some `user` builds; the script skips cleanly and says so.
- Full symbolication (line numbers) needs unstripped libs / `llvm-symbolizer`; this parser stops at
  module+offset, which is the form the gAPSOps/ELF tooling already consumes.
