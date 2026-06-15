#!/system/bin/sh
# tools/observability/strace/10_strace_camera.sh
# Syscall-level visibility on the camera path — the one lever that surfaces ENV failures the log
# masks hide: a MISSING /vendor/etc/camera/*.txt (ROOT-A #2), a sepolicy/AIDL-allocator DENIAL
# (#5 IMapper@4.0 NULL), a failed dlopen of an oplus blob, or an ioctl error on /dev/video*.
# These are openat->ENOENT / openat->EACCES / connect->EACCES / ioctl->errno signatures that no
# camxoverridesettings mask will ever print. strace is the complement to enable/*, not a replacement.
#
# READ-ONLY: attaches to the RUNNING cameraserver + camera-provider, never restarts a partition bin.
# Single-block (KernelSU drops post-first su -c lines). Run:
#   su -c 'sh /data/local/tmp/obs-strace/10_strace_camera.sh [seconds]'
# Then drive ONE identical cycle (use ../capture/ui/drive_cycle.sh) within the window.
#
# PREREQ: a static aarch64 `strace` at /data/local/tmp/strace (toybox has none; user builds lack it).
#         The host orchestrator 30_run_strace.sh pushes it for you.
WIN="${1:-25}"
OUT=/data/local/tmp/obs_strace
mkdir -p "$OUT"
SUM="$OUT/summary.txt"
: > "$SUM"
echo "== camera syscall capture (window=${WIN}s) @ $(date 2>/dev/null) ==" >>"$SUM"

# locate a usable strace (pushed copy preferred; system bin on userdebug as fallback)
STRACE=/data/local/tmp/strace
[ -x "$STRACE" ] || STRACE=$(command -v strace 2>/dev/null)
if [ -z "$STRACE" ] || [ ! -x "$STRACE" ]; then
  echo "FATAL: no strace binary. Push a static aarch64 strace to /data/local/tmp/strace" >>"$SUM"
  echo "       (host: tools/observability/strace/30_run_strace.sh handles this)" >>"$SUM"
  cat "$SUM"; echo "WROTE $SUM"; exit 1
fi
echo "strace=$STRACE" >>"$SUM"

# the two native targets that own the divergence: cameraserver (/system) + provider (/vendor)
CSPID=$(pgrep -f cameraserver | head -1)
PRPID=$(pgrep -f camera.provider | head -1)
echo "cameraserver pid=$CSPID  provider pid=$PRPID" >>"$SUM"

# only the syscalls that carry env-failure signal; -f follows the worker threads that do the real I/O.
# -y decodes fds to paths (so openat shows the actual file), -e trace narrows the volume.
TRACE='openat,open,access,faccessat,stat,statx,connect,ioctl,mmap,read'
# NOTE: background strace DIRECTLY (if/then) so $! is strace's pid. The old `[ -n "$P" ] && strace &`
# form made $! the &&-subshell pid, so kill missed strace and it ran forever (84MB runaway). pkill below
# is the belt-and-suspenders.
SPID1=""; SPID2=""
if [ -n "$CSPID" ]; then "$STRACE" -f -tt -T -y -e "trace=$TRACE" -p "$CSPID" -o "$OUT/cameraserver.strace" & SPID1=$!; fi
if [ -n "$PRPID" ]; then "$STRACE" -f -tt -T -y -e "trace=$TRACE" -p "$PRPID" -o "$OUT/provider.strace" & SPID2=$!; fi

echo ">>> strace attached. DRIVE ONE CYCLE NOW (open->preview->capture->close). Window ${WIN}s..." >>"$SUM"
# bounded by BOTH the window AND a per-file size cap — the provider `-f` firehose hit 84MB once; cap stops
# a run from bloating the repo / wedging the pull. Env STRACE_CAP_MB overrides (default 64).
CAP_MB="${STRACE_CAP_MB:-64}"; i=0
while [ "$i" -lt "$WIN" ]; do
  sleep 1; i=$((i+1))
  for f in "$OUT/cameraserver.strace" "$OUT/provider.strace"; do
    [ -f "$f" ] || continue
    sz=$(( $(stat -c %s "$f" 2>/dev/null || echo 0) / 1048576 ))
    if [ "$sz" -ge "$CAP_MB" ]; then echo "size-cap ${CAP_MB}MB hit on $(basename "$f") (${sz}MB) at ${i}s — stopping early" >>"$SUM"; i="$WIN"; break; fi
  done
done
kill -INT $SPID1 $SPID2 2>/dev/null
sleep 1; kill -9 $SPID1 $SPID2 2>/dev/null
pkill -9 -f "$STRACE" 2>/dev/null; pkill -9 strace 2>/dev/null   # ensure NOTHING survives the window

# on-device first-look: the high-signal failing syscalls (host parse_strace.py does the full job)
echo "" >>"$SUM"
echo "-- ENOENT (missing files; watch for camera/*.txt, *.so, graph_desc) --" >>"$SUM"
grep -hE 'ENOENT' "$OUT"/*.strace 2>/dev/null | grep -iE 'camera|\.so|graph|override|odm|vendor/etc' | sed 's/^/  /' | sort | uniq -c | sort -rn | head -40 >>"$SUM"
echo "-- EACCES / EPERM (sepolicy / AIDL-allocator denials — symptom #5) --" >>"$SUM"
grep -hE 'EACCES|EPERM' "$OUT"/*.strace 2>/dev/null | sed 's/^/  /' | sort | uniq -c | sort -rn | head -30 >>"$SUM"
echo "-- ioctl errors on /dev/video* /dev/v4l* (sensor/IFE path) --" >>"$SUM"
grep -hE 'ioctl' "$OUT"/*.strace 2>/dev/null | grep -iE 'video|v4l|cam' | grep -E '= -1' | sed 's/^/  /' | head -30 >>"$SUM"
echo "DONE" >>"$SUM"; echo "WROTE $OUT (pull the dir; run parse_strace.py for the A/B verdict)"
