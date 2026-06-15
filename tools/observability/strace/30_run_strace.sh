#!/usr/bin/env bash
# strace/30_run_strace.sh — HOST orchestrator for the symmetric OOS/LOS camera syscall A/B.
# Pushes a static aarch64 strace + this kit, attaches to cameraserver + provider, prompts you to drive
# ONE identical cycle, pulls the traces into reference/strace/<tag>. Then: parse_strace.py.
# Run IDENTICALLY on the stock OOS unit and the LOS build.
#
# Prereqs: adb + rooted (KernelSU su), and a static aarch64 strace on the HOST.
#   Set STRACE_BIN=/path/to/strace, or drop one at tools/observability/strace/strace.aarch64
#   (build: NDK `make` of strace, or grab a prebuilt static aarch64 binary; not shipped in this repo).
# Usage:   tools/observability/strace/30_run_strace.sh <tag> [seconds]   # tag e.g. oos | los
set -u
TAG="${1:?usage: 30_run_strace.sh <tag> [seconds]  (e.g. oos | los)}"
WIN="${2:-25}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
DST="$REPO/reference/strace/${TAG}"
mkdir -p "$DST"

STRACE_BIN="${STRACE_BIN:-$HERE/strace.aarch64}"
if [ ! -f "$STRACE_BIN" ]; then
  echo "ERROR: no host strace binary. Set STRACE_BIN=/path/to/static-aarch64-strace" >&2
  echo "       or place it at $HERE/strace.aarch64" >&2
  exit 1
fi

echo "== strace capture tag=$TAG win=${WIN}s -> $DST =="
adb shell 'getprop ro.build.version.oplusrom; getprop ro.lineage.build.version; getenforce' | tee "$DST/build.txt"

adb push "$STRACE_BIN" /data/local/tmp/strace >/dev/null
adb shell chmod 755 /data/local/tmp/strace
adb push "$HERE" /data/local/tmp/obs-strace >/dev/null

# run the device probe in the background; it sleeps WIN seconds for you to drive the cycle
( adb shell su -c "sh /data/local/tmp/obs-strace/10_strace_camera.sh $WIN" ) &
DPID=$!
sleep 2
cat <<EOF

  >>> strace is attaching. Within ${WIN}s, drive ONE identical cycle. Easiest:
        adb shell su -c 'sh /data/local/tmp/obs-capture/ui/drive_cycle.sh photo'
      (push ../capture/ui first, or open->preview->shutter->close by hand — keep it identical OOS vs LOS)
EOF
wait "$DPID"

adb pull /data/local/tmp/obs_strace "$DST/" >/dev/null 2>&1
# flatten the pulled subdir
[ -d "$DST/obs_strace" ] && mv "$DST"/obs_strace/* "$DST"/ 2>/dev/null && rmdir "$DST/obs_strace" 2>/dev/null
echo "== strace done. artifacts in $DST =="
echo "   next: tools/observability/strace/parse_strace.py reference/strace/oos reference/strace/los"
