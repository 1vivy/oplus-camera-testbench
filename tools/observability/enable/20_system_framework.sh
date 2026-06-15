#!/system/bin/sh
# tools/observability/enable/20_system_framework.sh
# THE /system DARK-ZONE PROBE. frameworks/av (cameraserver/libcameraservice), frameworks/base
# (ImageReader/HardwareBuffer/Surface), SurfaceFlinger/EDR and the display HAL ship PURE AOSP on
# LOS — no oplus instrumentation, no setprop/override/frida lever exists for them today.
# This script tries EVERY AOSP-standard lever and reports which yields signal, answering:
#   "is the /system camera/display layer instrumentable WITHOUT a frameworks/av source build?"
# REVERSIBLE: only sets log.tag.* (revert by reboot) and reads dumpsys/atrace. No partition writes.
# Single-block (KernelSU). Run: su -c 'sh /data/local/tmp/obs-enable/20_system_framework.sh'
OUT=/data/local/tmp/obs_system_framework.txt
: > "$OUT"
echo "== /system framework dark-zone probe ==" >>"$OUT"

# 1) AOSP log.tag VERBOSE levers for the camera framework (frameworks/av + camera2 JNI)
for T in CameraService Camera2ClientBase Camera3-Device Camera2-JNI CameraProviderManager \
         CameraDeviceClient CameraFlashlight CameraMetadata ICameraService BufferQueueProducer \
         ImageReader_JNI Surface HardwareBuffer SurfaceControl; do
  setprop log.tag."$T" VERBOSE
done
echo "set log.tag.* VERBOSE for camera/buffer framework tags" >>"$OUT"
setprop persist.logd.log.load.on 0

# 2) does the AOSP cameraserver respond to `cmd camera` / dumpsys? (capability probe)
echo "-- cmd camera help --" >>"$OUT"
cmd media.camera help 2>>"$OUT" >>"$OUT" || cmd camera help 2>>"$OUT" >>"$OUT" || echo "(no cmd camera)" >>"$OUT"

# 3) SurfaceFlinger / display HDR caps (the over-exposure / EDR co-factor — is HLG/PQ advertised?)
echo "-- SurfaceFlinger HDR caps --" >>"$OUT"
dumpsys SurfaceFlinger 2>/dev/null | grep -iA4 'hdrCapabilities\|HDR types\|DesiredHdr\|hdr_uniform' >>"$OUT" || echo "(no hdrCapabilities line)" >>"$OUT"
echo "-- SurfaceFlinger layer/composition (preview layer present?) --" >>"$OUT"
dumpsys SurfaceFlinger 2>/dev/null | grep -i 'com.oplus.camera\|SurfaceView\|BLAST' | head -20 >>"$OUT"

# 4) atrace categories actually available on this build (camera/gfx/sf/hal)
echo "-- atrace categories --" >>"$OUT"
atrace --list_categories 2>>"$OUT" | grep -iE 'camera|gfx|sf|hal|view|bionic|binder' >>"$OUT" || echo "(atrace unavailable)" >>"$OUT"

# 5) is perfetto present for a structured camera+gfx trace? (record the command, don't auto-run a long trace)
echo "-- perfetto availability --" >>"$OUT"
which perfetto 2>>"$OUT" >>"$OUT" && echo "perfetto OK: run -> perfetto -t 10s -b 32mb -o /data/misc/perfetto-traces/cam.pftrace camera gfx sf hal view binder" >>"$OUT" || echo "(perfetto absent)" >>"$OUT"

# 6) ServiceManager visibility of the camera/display services (declared vs registered)
echo "-- lshal camera/display --" >>"$OUT"
lshal 2>/dev/null | grep -iE 'camera|displaycolor|composer|mapper|allocator' >>"$OUT" || echo "(lshal unavailable)" >>"$OUT"

# 7) VERDICT helper: after this, run a camera cycle and check whether VERBOSE lines actually appear:
#      adb logcat -b all -s CameraService:V Camera3-Device:V Camera2-JNI:V Surface:V
#    If they DO -> AOSP runtime levers bridge the /system gap (ship them).
#    If SILENT  -> /system is zero-visibility-until-flash -> capture/AB-RUNBOOK.md "Debug-image recipe".
echo "" >>"$OUT"
echo "NEXT: capture one camera cycle, then:" >>"$OUT"
echo "  adb logcat -b all -s CameraService:V Camera3-Device:V Camera2-JNI:V Surface:V ImageReader_JNI:V" >>"$OUT"
echo "  -> lines present = runtime-lever path; silent = debug-image recipe (AB-RUNBOOK §recipe)" >>"$OUT"
echo DONE >>"$OUT"; echo "WROTE $OUT"
