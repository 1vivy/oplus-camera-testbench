#!/system/bin/sh
# tools/observability/enable/00_enable_all.sh
# Master: bring every INSTRUMENTABLE camera-stack LOG SYSTEM to max verbosity, then print a per-LAYER
# map of WHICH LEVER each one needs — because the stack has SEVERAL INDEPENDENT log systems, each with
# its own gate (RE'd + proven live v16.1.0; see docs/re-notes/camx-*).
# This script auto-runs ONLY the safe, reversible, property/overlay levers. It does NOT auto-run the
# frida levers (CamX-core g_logInfo, OEM OLog) or the host binary retaa — those are ANNOUNCED + pointed
# at, not executed, so a reader sees the complete picture without tripping a crash/self-kill.
# REVERSIBLE (overlay + setprop only). Single-block (KernelSU).
# Run: su -c 'sh /data/local/tmp/obs-enable/00_enable_all.sh'
DIR=$(dirname "$0")
SUM=/data/local/tmp/obs_enable_summary.txt
: > "$SUM"
echo "=== observability master enable @ $(date 2>/dev/null) ===" >>"$SUM"

# ---------------------------------------------------------------------------------------------------
# AUTO-RUN: the safe reversible enablers (each writes its own /data/local/tmp/obs_*.txt)
#   10 = vendor CHI props+overlay (CamX-core is only POINTED at, not enabled — needs frida/durable path)
#   30 = APS native safe selector (alog disk path stays DISARMED — G7 self-kill)
#   20 = /system framework AOSP log.tag.* (stock-side works)
# ---------------------------------------------------------------------------------------------------
sh "$DIR/10_vendor_camx_chi.sh"   >>"$SUM" 2>&1
sh "$DIR/30_aps_native.sh"        >>"$SUM" 2>&1
sh "$DIR/20_system_framework.sh"  >>"$SUM" 2>&1

echo "" >>"$SUM"
echo "=== FULL-STACK LOG MODEL — INDEPENDENT SYSTEMS, ONE LEVER EACH (v16.1.0) ===" >>"$SUM"
echo "Each layer below is a SEPARATE log system with its OWN gate. Enabling one does NOT enable another." >>"$SUM"
echo "" >>"$SUM"

echo "[1] CamX-CORE  (\"CamX :\" — camxhal3/camxsession/camxnode/configure_streams/hdr_detected/8K -38 reason)" >>"$SUM"
echo "    GATE   : global CamX::g_logInfo (0x90B DebugLogInfo) in libcamxcommonutils.so .data." >>"$SUM"
echo "    STATUS : DARK on stock USER — OverrideUpdateLogSettings ELSE branch ZEROES g_logInfo." >>"$SUM"
echo "    LEVER  : (a) PREFERRED frida ../frida/enable_camx_logging.js  (no props, no reboot, crash-free;" >>"$SUM"
echo "                 SENSOR bit1 + NCS bit23 MUST stay 0 or SSC/QMI [VERB] SIGSEGVs in vfprintf)." >>"$SUM"
echo "             (b) DURABLE: bVar4 (persist.vendor.camera.oplus.enableLogging=true, set by 10) AND" >>"$SUM"
echo "                 bVar6 (e.g. oplus.autotest.camera.debug.forcelog=1) + TARGETED masks 0x1f0fb7b8." >>"$SUM"
echo "    *** NOT auto-armed here. forcelog<->APS-alog G7 self-kill TENSION: prefer (a) frida. ***" >>"$SUM"
echo "" >>"$SUM"

echo "[2] CHI        (\"Chi :\" — chxextensionmodule/chxusecaseutils/pluginbase; SHDR AE usecase, HDR info)" >>"$SUM"
echo "    GATE   : CHI log system, separate from CamX-core." >>"$SUM"
echo "    STATUS : PASS for CHI INFO — enableLogging=$(getprop persist.vendor.camera.oplus.enableLogging) (set by 10, defeats #3)." >>"$SUM"
echo "    LEVER  : full CHI mask survival -> host retaa #1/#2 (python3 tools/patch_chi_logclobber.py ...; push /odm)." >>"$SUM"
echo "" >>"$SUM"

echo "[3] OEM oemlayer OLog  (/odm camera.oemlayer.v2.so)" >>"$SUM"
echo "    GATE   : OLog::g_enableLog* globals." >>"$SUM"
echo "    STATUS : FRIDA-ONLY — no setprop lever flips the globals." >>"$SUM"
echo "    LEVER  : frida ../frida/enable_olog_oemlayer.js  (NOT auto-run here)." >>"$SUM"
echo "" >>"$SUM"

echo "[4] /system framework  (CameraService/Camera3-Device/Camera2-JNI)" >>"$SUM"
echo "    GATE   : AOSP log.tag.*  STATUS : PASS (stock-side works) — set by 20_system_framework.sh." >>"$SUM"
echo "    VERIFY : adb logcat -b all -s CameraService:V Camera3-Device:V Camera2-JNI:V Surface:V" >>"$SUM"
echo "" >>"$SUM"

echo "[5] APS native  (libAlgoProcess /odm)" >>"$SUM"
echo "    GATE   : private.log selector (safe) + alog disk path (DANGEROUS)." >>"$SUM"
echo "    STATUS : private.log=$(getprop persist.sys.camera.private.log.enable) (safe, set by 30)." >>"$SUM"
echo "    *** G7 SELF-KILL: do NOT arm persist.sys.camera.lao.enable / the /data/vendor/cam_alog disk path —" >>"$SUM"
echo "        disk I/O trips ERROR_CAMERA_DEVICE on the marginal HAL. NOTE forcelog also arms this path. ***" >>"$SUM"
echo "    LEVER  : for AEC/metadata use frida native hooks (../frida/probe_*.js), no disk I/O." >>"$SUM"
echo "" >>"$SUM"

echo "(adjunct) gralloc/mapper : FRIDA-ONLY ../frida/trace_p010_planes.js (no setprop lever)." >>"$SUM"
echo "(adjunct) app/OCS SDK    : FRIDA ../frida/enable_ocs_sdk_log.js + fwk_trace.js." >>"$SUM"
echo "(adjunct) SurfaceFlinger/EDR/display : read-only dumpsys (caps in obs_system_framework.txt)." >>"$SUM"
echo "" >>"$SUM"
echo "Pull: adb pull /data/local/tmp/obs_camx_chi.txt /data/local/tmp/obs_aps_native.txt /data/local/tmp/obs_system_framework.txt" >>"$SUM"
echo "Then reproduce the bug and capture per capture/AB-RUNBOOK.md" >>"$SUM"
echo DONE >>"$SUM"; echo "WROTE $SUM"
