#!/system/bin/sh
# tools/observability/debug/10_runtime_debug.sh
# AOSP runtime debugging the capture harness was missing: a NON-FATAL live unwind of the camera
# natives + an optional CPU sample. Two things the verbose logs can't give you:
#   1) debuggerd -b <pid> : dump every thread's backtrace WITHOUT killing the process — this is how you
#      see WHERE the preview thread is parked during the freeze (#1), live, no tombstone needed.
#   2) simpleperf record   : sample the provider/APS hot path — the non-intrusive substitute for the APS
#      alog, which self-kills the marginal HAL on disk-I/O latency (gap G7). simpleperf adds ~no latency.
# READ-ONLY (unwind + sample only; never restarts a partition bin). Single-block (KernelSU).
# Run DURING a frozen/active preview: su -c 'sh /data/local/tmp/obs-debug/10_runtime_debug.sh [seconds]'
WIN="${1:-8}"
OUT=/data/local/tmp/obs_debug
mkdir -p "$OUT"
SUM="$OUT/summary.txt"
: > "$SUM"
echo "== runtime debug (win=${WIN}s) @ $(date 2>/dev/null) ==" >>"$SUM"

CSPID=$(pgrep -f cameraserver | head -1)
PRPID=$(pgrep -f camera.provider | head -1)
APID=$(pgrep -f com.oplus.camera | head -1)
echo "cameraserver=$CSPID provider=$PRPID app=$APID" >>"$SUM"

# 1) live backtraces — the freeze-state snapshot. debuggerd -b is read-only and does NOT crash the target.
for P in "$CSPID" "$PRPID"; do
  [ -z "$P" ] && continue
  echo "-- debuggerd -b $P --" >>"$SUM"
  debuggerd -b "$P" > "$OUT/bt_$P.txt" 2>>"$SUM" && echo "  wrote bt_$P.txt" >>"$SUM" || echo "  debuggerd unavailable for $P" >>"$SUM"
done
# the app's Java/native threads (freeze: GLThread / onImageAvailable parked) via SIGQUIT -> /data/anr
[ -n "$APID" ] && { kill -3 "$APID" 2>/dev/null; sleep 1; cp -f /data/anr/traces.txt "$OUT/app_anr.txt" 2>/dev/null; echo "app ANR -> app_anr.txt" >>"$SUM"; }

# 2) CPU sample of the camera natives (G7-safe). Prefer pid-targeted; skip cleanly if absent.
SP=$(command -v simpleperf 2>/dev/null); [ -x /system/bin/simpleperf ] && SP=/system/bin/simpleperf
if [ -n "$SP" ] && [ -n "$PRPID" ]; then
  echo "-- simpleperf record provider+server ${WIN}s --" >>"$SUM"
  PIDS="$PRPID"; [ -n "$CSPID" ] && PIDS="$PRPID,$CSPID"
  "$SP" record -p "$PIDS" -g -f 1000 -o "$OUT/perf.data" --duration "$WIN" 2>>"$SUM" && \
    "$SP" report -i "$OUT/perf.data" -n --sort symbol 2>/dev/null | head -40 > "$OUT/perf_top.txt" && \
    echo "  wrote perf.data + perf_top.txt" >>"$SUM"
else
  echo "simpleperf absent or no provider pid — skipped CPU sample" >>"$SUM"
fi

# 3) collect any fresh crash artifacts for the host symbolicator
ls -t /data/tombstones/* 2>/dev/null | head -2 | while read t; do cp -f "$t" "$OUT/"; done
echo "DONE" >>"$SUM"; echo "WROTE $OUT (pull; symbolicate tombstones with parse_tombstone.py)"
