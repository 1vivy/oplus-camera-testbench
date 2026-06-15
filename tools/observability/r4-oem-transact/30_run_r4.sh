#!/usr/bin/env bash
# r4-oem-transact/30_run_r4.sh — HOST orchestrator for the symmetric OOS/LOS media.camera OEM-layer A/B.
# Captures: ext-presence probe, client transact(100xx) trace, server CameraServiceExtImpl trace (OOS),
# verbose logcat, dumpsys camera pre/post, cameraserver /proc/maps. doc-48 / gap G5.
# Run IDENTICALLY on the stock OOS unit and the LOS build (both permissive). Then: parse_r4.py.
#
# Prereqs: adb + rooted (KernelSU su), frida-server on device, host `frida` CLI. `adb shell setenforce 0`.
# Usage:   tools/observability/r4-oem-transact/30_run_r4.sh <tag>     # tag e.g. oos | los | los-enforcing
set -u
TAG="${1:?usage: 30_run_r4.sh <tag>  (e.g. oos | los)}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OBS="$(cd "$HERE/.." && pwd)"
REPO="$(cd "$OBS/../.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
DST="$REPO/reference/r4/${TAG}"
mkdir -p "$DST"
echo "== r4 OEM-transaction capture tag=$TAG -> $DST =="
adb shell 'getprop ro.build.version.oplusrom; getprop ro.lineage.build.version; getenforce' | tee "$DST/build.txt"

# 1) push enabler + this kit; max verbosity (reversible); run the presence probe
adb push "$OBS/enable" /data/local/tmp/obs-enable >/dev/null
adb push "$HERE"       /data/local/tmp/obs-r4     >/dev/null
# SKIP_ENABLE=1 (e.g. from full_baseline.sh) skips the re-enable: 00_enable_all restarts cameraserver/provider
# which kills a pre-launched foreground camera app before the client (com.oplus.camera) frida attach.
if [ "${SKIP_ENABLE:-0}" = 1 ]; then echo "-- SKIP_ENABLE=1: verbosity assumed already armed --"; else
  adb shell su -c 'sh /data/local/tmp/obs-enable/00_enable_all.sh' >/dev/null 2>&1 || true
fi
adb shell su -c 'sh /data/local/tmp/obs-r4/10_ext_presence.sh'  >/dev/null 2>&1 || true
adb pull /data/local/tmp/obs_r4_presence.txt "$DST/presence.txt" 2>/dev/null

# 2) cameraserver /proc/maps snapshot (the cheap libcsextimpl present/absent A/B)
CSPID=$(adb shell pidof cameraserver | tr -d '\r')
if [ -n "$CSPID" ]; then adb shell su -c "cat /proc/$CSPID/maps" 2>/dev/null | grep -iE 'csextimpl|cameraservice' > "$DST/cameraserver_maps.txt"; fi

# 3) logcat (all buffers) + dumpsys camera pre
adb logcat -c 2>/dev/null
adb logcat -b all -v threadtime > "$DST/logcat_${STAMP}.txt" &
LOGPID=$!
adb shell dumpsys media.camera > "$DST/dumpsys_camera_pre.txt" 2>/dev/null

# 4) frida: server depth (cameraserver — OOS arms hooks; LOS reports ABSENT) + client depth (the app)
# server attaches by name (daemon resolves fine); CLIENT must attach by PID — `frida -n com.oplus.camera`
# does not resolve the app under Enforcing SELinux here, `-p <pid>` does (app_probe_capture.sh). doc-50.
echo "-- attaching frida server (cameraserver, by name) --"
frida -U -n cameraserver     -l "$HERE/20_trace_ext_transact.js" -o "$DST/ext_server_${STAMP}.log" --runtime=v8 &
SRVPID=$!
CLIPID=""
APID=$(adb shell su -c "pidof com.oplus.camera" 2>/dev/null | tr -d '\r' | awk '{print $1}')
echo "-- attaching frida client (com.oplus.camera) by pid $APID --"
[ -z "$APID" ] && echo "   !! com.oplus.camera not running — client depth will be skipped (pre-launch the app)"
if [ -n "$APID" ]; then
  frida -U -p "$APID" -l "$HERE/20_trace_ext_transact.js" -o "$DST/ext_client_${STAMP}.log" --runtime=v8 &
  CLIPID=$!
fi

cat <<EOF

  >>> Now drive ONE identical cycle on the device:
      open camera -> let preview settle -> switch to VIDEO 8K -> record 3s -> stop ->
      switch to PHOTO -> capture 1 -> close.
      (For the 8K StreamSet question also run, in a 2nd shell:
         frida -U -n vendor.qti.camera.provider-service_64 -l ../../frida/hook_configure_streams.js)
  >>> Press ENTER here when the cycle is done.
EOF
read _

# 5) teardown + post artifacts
kill "$SRVPID" "$CLIPID" 2>/dev/null
adb shell dumpsys media.camera > "$DST/dumpsys_camera_post.txt" 2>/dev/null
sleep 1; kill "$LOGPID" 2>/dev/null
# slice the OEM/ext lines out of logcat for quick diffing
grep -iE 'CameraServiceExt|UNKNOWN_TRANSACTION|OplusCameraManager|sendextcamcmd|EISV2|configure_streams|r4\]' "$DST/logcat_${STAMP}.txt" > "$DST/oem_slice.txt" 2>/dev/null || true

echo "== r4 done. artifacts in $DST =="
echo "   next: tools/observability/r4-oem-transact/parse_r4.py reference/r4/oos reference/r4/los"
