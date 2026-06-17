#!/usr/bin/env bash
set +e

STAMP="${1:-$(date +%Y%m%d-%H%M%S)}"
OUT="reference/campaign/video8k/direct-${STAMP}"
R4="reference/r4/los-direct-${STAMP}"
mkdir -p "$OUT" "$OUT/frida" "$OUT/app_probes" "$OUT/server_probes" "$OUT/provider_probes" "$R4"
printf '%s\n' "/home/vivy/oplus-final/$OUT" > .omo/evidence/v15-camera-build/todo7-video8k-direct-latest.txt
exec > >(tee "$OUT/host_run.log") 2>&1

echo "== Todo7 direct video8k/r4 capture @ $STAMP =="
echo "OUT=$OUT"
echo "R4=$R4"

FRIDA_PIDS=""
LOGPID=""
TAILPG=""
ADB_UID="$(adb shell id -u 2>/dev/null | tr -d '\r')"

device_sh() {
  if [ "$ADB_UID" = 0 ]; then
    adb shell "$1"
  else
    adb shell su -c "$1"
  fi
}

cleanup() {
  rc=$?
  echo "== cleanup rc=$rc =="
  for p in $FRIDA_PIDS; do kill "$p" 2>/dev/null || true; done
  [ -n "$LOGPID" ] && kill "$LOGPID" 2>/dev/null || true
  [ -n "$TAILPG" ] && kill -TERM -"$TAILPG" 2>/dev/null || true
  adb shell am force-stop com.oplus.camera >/dev/null 2>&1 || true
  sleep 1
  ps -eo pid=,args= | awk '/adb logcat|frida -U|run_condition|app_probe_capture|validate_modes|drive_cycle|obs-capture|tail -n \+1 -F/ && $0 !~ /awk|ps -eo|todo7_direct_capture/ {print}' > "$OUT/process_cleanup_postcheck.txt" || true
  echo "cleanup_postcheck_lines=$(wc -l < "$OUT/process_cleanup_postcheck.txt" 2>/dev/null || echo 0)"
}
trap cleanup EXIT

attach_pid() {
  local pid="$1" script="$2" dest="$3"
  if [ -z "$pid" ]; then echo "skip_attach $script: missing pid" | tee -a "$OUT/attach.log"; return; fi
  if [ ! -f "$script" ]; then echo "skip_attach $script: missing file" | tee -a "$OUT/attach.log"; return; fi
  echo "attach pid=$pid script=$script dest=$dest" | tee -a "$OUT/attach.log"
  frida -U -p "$pid" -l "$script" -o "$dest" --runtime=v8 > "${dest}.stdout" 2> "${dest}.stderr" &
  FRIDA_PIDS="$FRIDA_PIDS $!"
}

raw_shutter() {
  device_sh 'D=/dev/input/event7; sendevent $D 3 47 0; sendevent $D 3 57 88; sendevent $D 3 55 0; sendevent $D 3 48 120; sendevent $D 3 49 120; sendevent $D 3 53 10176; sendevent $D 3 54 36176; sendevent $D 1 330 1; sendevent $D 1 325 1; sendevent $D 0 0 0; sleep 0.1; sendevent $D 3 47 0; sendevent $D 3 57 4294967295; sendevent $D 1 330 0; sendevent $D 1 325 0; sendevent $D 0 0 0' >/dev/null 2>&1
}

{
  echo "-- host time --"; date -Is
  echo "-- adb state --"; adb get-state 2>&1
  echo "-- device id --"; adb shell id 2>&1
  echo "-- build --"; adb shell 'getprop ro.build.version.oplusrom; getprop ro.lineage.build.version; getprop ro.build.fingerprint; getenforce' 2>&1
  echo "-- pre process scan --"; ps -eo pid=,args= | awk '/adb logcat|frida -U|run_condition|app_probe_capture|validate_modes|drive_cycle|obs-capture/ && $0 !~ /awk|ps -eo|todo7_direct_capture/ {print}' || true
} | tee "$OUT/preflight.txt"

adb shell rm -rf /data/local/tmp/obs-capture /data/local/tmp/obs-r4 >/dev/null 2>&1 || true
adb push tools/observability/capture/. /data/local/tmp/obs-capture/ > "$OUT/adb_push_capture.txt" 2>&1
adb push tools/observability/r4-oem-transact/. /data/local/tmp/obs-r4/ > "$OUT/adb_push_r4.txt" 2>&1
echo "enable_all_skipped=1 reason=no persist.* writes" | tee "$OUT/enable_all_skipped.txt"

device_sh 'pidof frida-server >/dev/null || (nohup frida-server >/dev/null 2>&1 &)' >/dev/null 2>&1 || true
sleep 1

device_sh 'sh /data/local/tmp/obs-r4/10_ext_presence.sh' > "$OUT/r4_presence_pre_stdout.txt" 2>&1 || true
adb pull /data/local/tmp/obs_r4_presence.txt "$OUT/r4_presence_pre.txt" >/dev/null 2>&1 || true
CS=$(adb shell pidof cameraserver 2>/dev/null | tr -d '\r' | awk '{print $1}')
PROV=$(adb shell 'pgrep -f "^/vendor/bin/hw/vendor\.qti\.camera\.provider-service_64$" | head -1' 2>/dev/null | tr -d '\r')
echo "cameraserver_pid=$CS" | tee "$OUT/pids.txt"
echo "provider_pid=$PROV" | tee -a "$OUT/pids.txt"
if [ -n "$CS" ]; then device_sh "cat /proc/$CS/maps" 2>/dev/null | grep -iE 'csextimpl|cameraservice' > "$OUT/cameraserver_maps_pre.txt" || true; fi
adb shell dumpsys media.camera > "$OUT/dumpsys_camera_pre.txt" 2>/dev/null || true

adb logcat -c >/dev/null 2>&1 || true
adb logcat -b all -v threadtime > "$OUT/logcat_all.txt" &
LOGPID=$!
echo "logcat_pid=$LOGPID" | tee -a "$OUT/pids.txt"
setsid bash -c "tail -n +1 -F '$OUT/logcat_all.txt' | grep --line-buffered -iE 'CameraServiceExt|UNKNOWN_TRANSACTION|OplusCameraManager|sendextcamcmd|EISV2|configure_streams|csextimpl|beforeConfigure|EXT_OPMODE|BCSL|\\[r4\\]|8K|-38|F DEBUG|CameraService|Camera3-Device'" > "$OUT/live_filtered_logcat.txt" 2>&1 &
TAILPG=$!
echo "tail_filter_pgid=$TAILPG" | tee -a "$OUT/pids.txt"

attach_pid "$CS" tools/observability/r4-oem-transact/20_trace_ext_transact.js "$OUT/server_probes/r4_ext_server.log"
attach_pid "$CS" tools/frida/hook_before_configure_streams.js "$OUT/server_probes/hook_before_configure_streams.log"
attach_pid "$CS" tools/frida/probe_get_extension_opmode.js "$OUT/server_probes/probe_get_extension_opmode.log"
attach_pid "$PROV" tools/frida/hook_configure_streams.js "$OUT/provider_probes/hook_configure_streams.log"
attach_pid "$PROV" tools/frida/hook_eisv2_ports.js "$OUT/provider_probes/hook_eisv2_ports.log"
attach_pid "$PROV" tools/frida/trace_dmabuf_alloc.js "$OUT/provider_probes/trace_dmabuf_alloc.log"
sleep 4

adb shell rm -f /data/local/tmp/obs_ui_action.log /data/local/tmp/obs_ui.xml >/dev/null 2>&1 || true
echo "== drive nav-only video8k =="
device_sh 'DRIVE_NAVONLY=1 DRIVE_NO_CLOSE=1 AE_LOCK=0 sh /data/local/tmp/obs-capture/ui/drive_cycle.sh video8k' > "$OUT/drive_video8k_nav_stdout.txt" 2> "$OUT/drive_video8k_nav_stderr.txt"
NAV_RC=$?
echo "nav_rc=$NAV_RC" | tee "$OUT/nav_rc.txt"
adb pull /data/local/tmp/obs_ui_action.log "$OUT/ui_action.log" >/dev/null 2>&1 || true
adb pull /data/local/tmp/obs_ui.xml "$OUT/ui_after_nav.xml" >/dev/null 2>&1 || true
adb shell dumpsys window 2>/dev/null | grep -m1 mCurrentFocus | tr -d '\r' > "$OUT/focus_after_nav.txt" || true
APID=$(device_sh 'pidof com.oplus.camera' 2>/dev/null | tr -d '\r' | awk '{print $1}')
echo "app_pid=$APID" | tee -a "$OUT/pids.txt"

attach_pid "$APID" tools/observability/r4-oem-transact/20_trace_ext_transact.js "$OUT/app_probes/r4_ext_client.log"
attach_pid "$APID" tools/frida/probe_aps_preview_routine.js "$OUT/app_probes/probe_aps_preview_routine.log"
attach_pid "$APID" tools/frida/probe_sendinputdata_gate.js "$OUT/app_probes/probe_sendinputdata_gate.log"
sleep 3

echo "== raw record start ==" | tee "$OUT/raw_record_actions.log"
adb shell dumpsys window 2>/dev/null | grep -m1 mCurrentFocus | tr -d '\r' > "$OUT/focus_before_record.txt" || true
raw_shutter
echo "record_start_sent $(date -Is)" | tee -a "$OUT/raw_record_actions.log"
sleep 7
echo "== raw record stop ==" | tee -a "$OUT/raw_record_actions.log"
raw_shutter
echo "record_stop_sent $(date -Is)" | tee -a "$OUT/raw_record_actions.log"
sleep 4

adb shell uiautomator dump /data/local/tmp/obs_ui_post.xml >/dev/null 2>&1 || true
adb pull /data/local/tmp/obs_ui_post.xml "$OUT/ui_post.xml" >/dev/null 2>&1 || true
adb shell dumpsys window 2>/dev/null | grep -m1 mCurrentFocus | tr -d '\r' > "$OUT/focus_post.txt" || true
adb shell screencap -p /sdcard/_todo7_video8k.png >/dev/null 2>&1 || true
adb pull /sdcard/_todo7_video8k.png "$OUT/scene.png" >/dev/null 2>&1 || true
adb shell rm -f /sdcard/_todo7_video8k.png >/dev/null 2>&1 || true
adb shell dumpsys media.camera > "$OUT/dumpsys_camera_post.txt" 2>/dev/null || true
if [ -n "$CS" ]; then device_sh "cat /proc/$CS/maps" 2>/dev/null | grep -iE 'csextimpl|cameraservice' > "$OUT/cameraserver_maps_post.txt" || true; fi
device_sh 'sh /data/local/tmp/obs-r4/10_ext_presence.sh' > "$OUT/r4_presence_post_stdout.txt" 2>&1 || true
adb pull /data/local/tmp/obs_r4_presence.txt "$OUT/r4_presence_post.txt" >/dev/null 2>&1 || true

for p in $FRIDA_PIDS; do kill "$p" 2>/dev/null || true; done
FRIDA_PIDS=""
sleep 1
[ -n "$LOGPID" ] && kill "$LOGPID" 2>/dev/null || true
LOGPID=""
[ -n "$TAILPG" ] && kill -TERM -"$TAILPG" 2>/dev/null || true
TAILPG=""
sleep 1

grep -iE 'CameraServiceExt|UNKNOWN_TRANSACTION|OplusCameraManager|sendextcamcmd|EISV2|configure_streams|csextimpl|beforeConfigure|EXT_OPMODE|BCSL|\[r4\]|8K|-38|F DEBUG|CameraService|Camera3-Device' "$OUT/logcat_all.txt" > "$OUT/oem_slice.txt" 2>/dev/null || true

cp -f "$OUT/preflight.txt" "$R4/build.txt" 2>/dev/null || true
cp -f "$OUT/r4_presence_post.txt" "$R4/presence.txt" 2>/dev/null || true
cp -f "$OUT/cameraserver_maps_post.txt" "$R4/cameraserver_maps.txt" 2>/dev/null || true
cp -f "$OUT/dumpsys_camera_pre.txt" "$R4/dumpsys_camera_pre.txt" 2>/dev/null || true
cp -f "$OUT/dumpsys_camera_post.txt" "$R4/dumpsys_camera_post.txt" 2>/dev/null || true
cp -f "$OUT/app_probes/r4_ext_client.log" "$R4/ext_client_${STAMP}.log" 2>/dev/null || true
cp -f "$OUT/server_probes/r4_ext_server.log" "$R4/ext_server_${STAMP}.log" 2>/dev/null || true
cp -f "$OUT/logcat_all.txt" "$R4/logcat_${STAMP}.txt" 2>/dev/null || true
cp -f "$OUT/oem_slice.txt" "$R4/oem_slice.txt" 2>/dev/null || true

{
  echo "out=/home/vivy/oplus-final/$OUT"
  echo "r4=/home/vivy/oplus-final/$R4"
  echo "nav_rc=$NAV_RC"
  echo "focus_after_nav=$(cat "$OUT/focus_after_nav.txt" 2>/dev/null)"
  echo "focus_before_record=$(cat "$OUT/focus_before_record.txt" 2>/dev/null)"
  echo "focus_post=$(cat "$OUT/focus_post.txt" 2>/dev/null)"
  echo "scene_bytes=$(stat -c %s "$OUT/scene.png" 2>/dev/null || echo 0)"
  echo "libcsextimpl_presence=$(grep -m1 'RESULT:' "$OUT/r4_presence_post.txt" 2>/dev/null || true)"
  echo "maps_csextimpl_hits=$(grep -ic csextimpl "$OUT/cameraserver_maps_post.txt" 2>/dev/null || echo 0)"
  echo "server_r4_lines=$(wc -l < "$OUT/server_probes/r4_ext_server.log" 2>/dev/null || echo 0)"
  echo "client_r4_lines=$(wc -l < "$OUT/app_probes/r4_ext_client.log" 2>/dev/null || echo 0)"
  echo "before_config_lines=$(wc -l < "$OUT/server_probes/hook_before_configure_streams.log" 2>/dev/null || echo 0)"
  echo "opmode_lines=$(wc -l < "$OUT/server_probes/probe_get_extension_opmode.log" 2>/dev/null || echo 0)"
  echo "cfgstreams_lines=$(wc -l < "$OUT/provider_probes/hook_configure_streams.log" 2>/dev/null || echo 0)"
  echo "eisv2_lines=$(wc -l < "$OUT/provider_probes/hook_eisv2_ports.log" 2>/dev/null || echo 0)"
  echo "aps_routine_lines=$(wc -l < "$OUT/app_probes/probe_aps_preview_routine.log" 2>/dev/null || echo 0)"
  echo "sendinput_lines=$(wc -l < "$OUT/app_probes/probe_sendinputdata_gate.log" 2>/dev/null || echo 0)"
  echo "oem_slice_lines=$(wc -l < "$OUT/oem_slice.txt" 2>/dev/null || echo 0)"
  echo "ensure8k_hits=$(grep -c 'ensure 8K' "$OUT/ui_action.log" 2>/dev/null || echo 0)"
  echo "r4_client_txn_hits=$(grep -c '\[r4\]\[client\] transact' "$OUT/app_probes/r4_ext_client.log" 2>/dev/null || echo 0)"
  echo "r4_server_hook_hits=$(grep -c '\[r4\]\[server\]' "$OUT/server_probes/r4_ext_server.log" 2>/dev/null || echo 0)"
  echo "bcsl_hits=$(grep -c '\[BCSL\]' "$OUT/server_probes/hook_before_configure_streams.log" 2>/dev/null || echo 0)"
  echo "ext_opmode_hits=$(grep -c '\[EXT_OPMODE\]' "$OUT/server_probes/probe_get_extension_opmode.log" 2>/dev/null || echo 0)"
  echo "cfgstream_hits=$(grep -c '\[cfgstreams\]' "$OUT/provider_probes/hook_configure_streams.log" 2>/dev/null || echo 0)"
  echo "eisv2_hits=$(grep -c '\[eisv2\]' "$OUT/provider_probes/hook_eisv2_ports.log" 2>/dev/null || echo 0)"
  echo "sendinput_hits=$(grep -c '\[SENDINPUT\]' "$OUT/app_probes/probe_sendinputdata_gate.log" 2>/dev/null || echo 0)"
  echo "apsroutine_hits=$(grep -c '\[APS_ROUTINE\]' "$OUT/app_probes/probe_aps_preview_routine.log" 2>/dev/null || echo 0)"
} | tee "$OUT/summary.txt"

adb shell am force-stop com.oplus.camera >/dev/null 2>&1 || true
ps -eo pid=,args= | awk '/adb logcat|frida -U|run_condition|app_probe_capture|validate_modes|drive_cycle|obs-capture|tail -n \+1 -F/ && $0 !~ /awk|ps -eo|todo7_direct_capture/ {print}' > "$OUT/process_cleanup_explicit.txt" || true
echo "explicit_cleanup_lines=$(wc -l < "$OUT/process_cleanup_explicit.txt" 2>/dev/null || echo 0)"
echo "== done =="
