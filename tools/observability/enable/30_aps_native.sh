#!/system/bin/sh
# tools/observability/enable/30_aps_native.sh
# APS / libAlgoProcess (the native computational-photo engine on /odm) verbosity.
# REVERSIBLE: setprop only. Single-block (KernelSU).
# Run: su -c 'sh /data/local/tmp/obs-enable/30_aps_native.sh'
#
# *** WARNING — THE alog LEVER IS SELF-DEFEATING ON A MARGINAL HAL ***
# Setting `oplus.autotest.camera.debug.forcelog=true` + `persist.sys.camera.lao.enable=true` makes
# libAlgoProcess write plaintext traces to /data/vendor/cam_alog/, BUT the deferred-job disk I/O adds
# latency that trips the camera2 device-error timeout -> ERROR_CAMERA_DEVICE (onError code 4/3) ~0.3s
# after open -> "camera app will kill self" (doc-43). So the alog is OFF by default here.
# For the AEC/preview/metadata path, use the frida NATIVE hooks instead (no disk I/O, no self-kill):
#   ../frida/probe_aec_getparam.js      (camAECGetParam output struct — does hdr_detected get exported?)
#   ../frida/probe_aec_hdrdetect.js     (HDRDetectProcess +0x48 gate, per-frame)
#   ../frida/observe_getmetadata.js     (APSMetadata::getMetadata rc per vendor tag — the rc=-2 family)
#   ../frida/trace_p010_planes.js       (gralloc plane layout / camApsBufferLockPlanes)
#   ../frida/probe_basictone.js         (BasicTone buffer layout)
OUT=/data/local/tmp/obs_aps_native.txt
: > "$OUT"
echo "== APS / libAlgoProcess verbosity ==" >>"$OUT"

# 1) the SAFE selector (already debug,pre,mp on stock; confirm + show)
echo "aps.private.log.enable(before)=$(getprop persist.sys.camera.private.log.enable)" >>"$OUT"
setprop persist.sys.camera.private.log.enable debug,pre,mp
echo "aps.private.log.enable(after)=$(getprop persist.sys.camera.private.log.enable)" >>"$OUT"

# 2) explicitly REPORT (do not enable) the self-killing alog lever so it's discoverable but not armed
echo "alog lever (NOT enabled — self-kills marginal HAL): forcelog=$(getprop oplus.autotest.camera.debug.forcelog) lao=$(getprop persist.sys.camera.lao.enable)" >>"$OUT"
echo "  -> to arm anyway (only on a STABLE HAL): setprop oplus.autotest.camera.debug.forcelog true; setprop persist.sys.camera.lao.enable true; out=/data/vendor/cam_alog/" >>"$OUT"

# 3) OEM-layer OLog globals are best flipped live via frida (camera.oemlayer.v2.so), see ../frida/enable_olog_oemlayer.js
echo "OEM OLog globals: frida ../frida/enable_olog_oemlayer.js (flips OLog::g_enableLog* in camera.oemlayer.v2.so)" >>"$OUT"

# 4) confirm the real /odm libAlgoProcess build hash via cameraserver's namespace (offsets are build-pinned)
PROV=$(pgrep -f camera.provider | head -1)
if [ -n "$PROV" ]; then
  echo "-- libAlgoProcess in provider ns (pid $PROV) --" >>"$OUT"
  ls -l /proc/"$PROV"/root/odm/lib64/libAlgoProcess.so 2>>"$OUT" >>"$OUT"
fi
echo DONE >>"$OUT"; echo "WROTE $OUT"
