#!/usr/bin/env bash
# r3-gralloc/30_run_r3.sh — HOST orchestrator (adb + frida) for the symmetric OOS/LOS gralloc A/B.
# Drives one capture cycle while recording: verbose CamX/CHI logs, the alloc+camxformat frida trace,
# the lock+blob frida trace, a /proc/maps namespace snapshot, and the decisive camxformat probe.
# Run IDENTICALLY on the stock OOS unit and the LOS build (both permissive). Then: parse_r3.py.
#
# Prereqs: adb device connected + rooted (KernelSU su), frida-server running on device, host `frida` CLI.
# Usage:   tools/observability/r3-gralloc/30_run_r3.sh <tag>          # tag e.g. oos | los | los-enforcing
set -u
TAG="${1:?usage: 30_run_r3.sh <tag>  (e.g. oos | los | los-enforcing)}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OBS="$(cd "$HERE/.." && pwd)"
REPO="$(cd "$OBS/../.." && pwd)"
PKG=com.oplus.camera
STAMP="$(date +%Y%m%d-%H%M%S)"
DST="$REPO/reference/r3/${TAG}"
mkdir -p "$DST"
echo "== r3 capture tag=$TAG -> $DST =="
adb shell 'getprop ro.build.version.oplusrom; getprop ro.lineage.build.version; getenforce' | tee "$DST/build.txt"

# 1) push kits + enable max verbosity (reversible) + the r3 device probe
adb push "$OBS/enable"  /data/local/tmp/obs-enable   >/dev/null
adb push "$HERE"        /data/local/tmp/obs-r3       >/dev/null
# SKIP_ENABLE=1 lets a caller (e.g. full_baseline.sh) skip the re-enable when verbosity is already armed —
# re-running 00_enable_all restarts cameraserver/provider and can kill a foreground camera app mid-flow.
if [ "${SKIP_ENABLE:-0}" = 1 ]; then echo "-- SKIP_ENABLE=1: verbosity assumed already armed --"; else
  echo "-- enabling verbosity (clobber-defeat + logd unthrottle) --"
  adb shell su -c 'sh /data/local/tmp/obs-enable/00_enable_all.sh' >/dev/null 2>&1
fi

# 2) start host-side logcat (all buffers) for the whole run
adb logcat -c 2>/dev/null
adb logcat -b all -v threadtime > "$DST/logcat_${STAMP}.txt" &
LOGPID=$!

# 3) launch the camera, then attach frida (ATTACH, not spawn — spawn kills this ART; project history)
echo "-- launching $PKG --"
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 4
# attach by PID, not name: `frida -U -n com.oplus.camera` does NOT resolve the app process on this
# setup (Enforcing SELinux); `frida -U -p <pid>` does (proven by app_probe_capture.sh). doc-50.
FRIDAPID=""
APID=$(adb shell su -c "pidof $PKG" 2>/dev/null | tr -d '\r' | awk '{print $1}')
if [ -z "$APID" ]; then   # cold start not up yet — nudge via the UI driver if present, then re-resolve
  adb shell "su -c 'DRIVE_NAVONLY=1 DRIVE_NO_CLOSE=1 sh /data/local/tmp/obs-capture/ui/drive_cycle.sh photo'" >/dev/null 2>&1
  sleep 3; APID=$(adb shell su -c "pidof $PKG" 2>/dev/null | tr -d '\r' | awk '{print $1}')
fi
echo "-- attaching frida (alloc+camxformat + lock+blob) to pid $APID --"
[ -z "$APID" ] && echo "   !! $PKG not running — frida attach will be skipped"
if [ -n "$APID" ]; then
  frida -U -p "$APID" \
    -l "$HERE/20_trace_alloc_camxformat.js" \
    -l "$REPO/tools/frida/trace_p010_planes.js" \
    -o "$DST/frida_${STAMP}.log" --runtime=v8 &
  FRIDAPID=$!
fi
sleep 3

cat <<EOF

  ┌──────────────────────────────────────────────────────────────────────────┐
  │ MANUAL CAPTURE STEPS (keep order — gives a negative control + the target): │
  │   1) NEGATIVE CONTROL: take ONE ordinary non-HDR Photo that SAVES a JPEG.  │
  │   2) TARGET: take ONE Master/Pro or Night (P010/turbo-HDR) capture.        │
  │  Watch the frida log fill; then press ENTER here to snapshot + pull.       │
  └──────────────────────────────────────────────────────────────────────────┘
EOF
read -r _

# 4) namespace snapshot + the decisive camxformat probe (while app still alive)
echo "-- /proc/<pid>/maps namespace snapshot + camxformat probe --"
adb shell "su -c 'for P in \$(pgrep -f $PKG); do echo == pid \$P ==; grep -E \"camxexternalformat|grallocutils|gralloccore|mapper.qti|libgralloc.qti\" /proc/\$P/maps; done'" > "$DST/maps_${STAMP}.txt" 2>&1
adb shell su -c 'sh /data/local/tmp/obs-r3/10_camxformat_probe.sh' >/dev/null 2>&1
adb pull /data/local/tmp/obs_r3_camxformat.txt "$DST/" >/dev/null 2>&1
adb pull /data/local/tmp/obs_camx_chi.txt "$DST/" >/dev/null 2>&1
# pull any fresh CamX offline logs + tombstones
adb shell 'ls -t /data/vendor/camera/*.log 2>/dev/null | head -3' | tr -d '\r' | while read -r f; do [ -n "$f" ] && adb pull "$f" "$DST/" >/dev/null 2>&1; done

# 5) stop captures
sleep 1; kill "$FRIDAPID" 2>/dev/null; kill "$LOGPID" 2>/dev/null
echo ""
echo "== done. artifacts in $DST =="
echo "   key files: frida_${STAMP}.log (R3|ALLOC / R3|DLOPEN / [PLANE_LAYOUTS] / [BLOB ...]) , obs_r3_camxformat.txt , maps_${STAMP}.txt"
echo "   then run BOTH sides through: python3 $HERE/parse_r3.py $REPO/reference/r3/oos $REPO/reference/r3/los"
