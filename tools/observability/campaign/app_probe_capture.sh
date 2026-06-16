#!/usr/bin/env bash
# campaign/app_probe_capture.sh — APP-side frida co-attach capture for ONE condition.
# Provider-side probes attach cleanly in run_condition.sh (the provider persists). APP-side probes
# (trace_edr_invocation / trace_motionphoto / probe_getoplushwbuffer / trace_preview_delivery) need the
# FRESH app pid each launch, so this: navigates to the mode with the shutter SUPPRESSED (DRIVE_NAVONLY),
# attaches frida to com.oplus.camera, then fires the shutter so the probe sees the full preview→capture
# invocation (e.g. the libgui setEdr* / OplusEdrUtils EDR contract on the daytime HDR scene).
#
# Usage: tools/observability/campaign/app_probe_capture.sh <condition>   # reads conditions/<condition>.env
# Prereqs: adb + rooted (KernelSU) + frida-server + frida on PATH. READ-ONLY w.r.t. partitions.
set -u
COND="${1:?usage: app_probe_capture.sh <condition>}"
HERE="$(cd "$(dirname "$0")" && pwd)"; OBS="$(cd "$HERE/.." && pwd)"; REPO="$(cd "$OBS/../.." && pwd)"
ENVF="$HERE/conditions/${COND}.env"; [ -f "$ENVF" ] || { echo "no condition: $ENVF"; exit 1; }
ADB_UID=$(adb shell id -u 2>/dev/null | tr -d '\r')
adb_as_root() {
  if [ "$ADB_UID" = 0 ]; then
    adb shell "$1"
  else
    adb shell su -c "$1"
  fi
}
MODE=photo; SESSION=""; AE_LOCK=0; REPEAT_N=1; NOTE=""; EXTRA_PROBES=""
# shellcheck disable=SC1090
. "$ENVF"
command -v frida >/dev/null 2>&1 || { echo "frida not on PATH"; exit 1; }
DST="$REPO/reference/campaign/${COND}/app_probes"; mkdir -p "$DST"
DEV_UI=/data/local/tmp/obs-capture/ui
SHUTTER_XY="635 2261"   # verified shutter_button center (V16.1.0)

# app-side probes only
APP_PROBES=""
for p in $EXTRA_PROBES; do
  case "$p" in trace_edr_invocation|trace_motionphoto|probe_getoplushwbuffer|trace_preview_delivery|trace_p010_planes|trace_aps_metadata_lifecycle|trace_turbohdr_tag|trace_gralloc_p010_chain|probe_aps_preview_routine|probe_sendinputdata_gate|trace_arcsoft_io) APP_PROBES="$APP_PROBES $p";; esac
done
[ -z "$APP_PROBES" ] && { echo "condition '$COND' declares no APP-side probes — nothing to do."; exit 0; }

adb shell rm -rf /data/local/tmp/obs-capture >/dev/null 2>&1
adb push "$OBS/capture" /data/local/tmp/obs-capture >/dev/null 2>&1
adb_as_root "chmod -R 755 /data/local/tmp/obs-capture" >/dev/null 2>&1
adb_as_root "pidof frida-server >/dev/null || (nohup frida-server >/dev/null 2>&1 &)" 2>/dev/null; sleep 1

for probe in $APP_PROBES; do
  s="$REPO/tools/frida/$probe.js"; [ -f "$s" ] || { echo "  missing $s"; continue; }
  echo "== app probe '$probe' on mode=$MODE =="
  adb shell logcat -c 2>/dev/null
  # 1) navigate to the mode, leave app OPEN, shutter SUPPRESSED
  adb_as_root "DRIVE_NAVONLY=1 DRIVE_NO_CLOSE=1 AE_LOCK=$AE_LOCK sh $DEV_UI/drive_cycle.sh $MODE" >/dev/null 2>&1
  APID=$(adb_as_root 'pidof com.oplus.camera' 2>/dev/null | tr -d '\r' | awk '{print $1}')
  [ -z "$APID" ] && { echo "  app not running after nav — skip $probe"; continue; }
  # 2) attach the probe to the live app, let hooks install
  frida -U -p "$APID" -l "$s" >"$DST/${probe}.log" 2>&1 &
  FP=$!; sleep 3
  # 2b) preview-setup probes (EDR / preview-delivery) fire at preview (RE)configure — which already
  #     happened before attach. Force a reconfigure so the hooked calls re-emit: switch camera front<->back.
  case "$probe" in
    trace_edr_invocation|trace_preview_delivery|trace_gralloc_p010_chain)
      adb shell input tap 1062 2261 >/dev/null 2>&1; sleep 4   # -> front (reconfigure preview → re-alloc/re-emit)
      adb shell input tap 1062 2261 >/dev/null 2>&1; sleep 4 ;; # -> back (HDR preview; setEdr*/gralloc alloc re-fire)
    trace_arcsoft_io)
      # WARM-UP capture: the ArcSoft fusion engine dlopens on the first real capture; trace_arcsoft_io's poller
      # then hooks it. Fire one throwaway capture so the MEASURED shutter below sees the hooked engine fire.
      adb shell input tap $SHUTTER_XY >/dev/null 2>&1; sleep 7 ;;
  esac
  # 3) fire the shutter so the probe sees the capture-path invocation; dwell
  adb shell input tap $SHUTTER_XY >/dev/null 2>&1; sleep 6
  # 4) logcat + teardown
  adb shell logcat -d -b all > "$DST/${probe}_logcat.txt" 2>/dev/null
  kill "$FP" 2>/dev/null
  adb shell am force-stop com.oplus.camera >/dev/null 2>&1; sleep 1
  lines=$(grep -c . "$DST/${probe}.log" 2>/dev/null || echo 0)
  echo "  wrote $DST/${probe}.log ($lines lines) + ${probe}_logcat.txt"
done
echo "== app_probe_capture '$COND' done -> $DST =="
