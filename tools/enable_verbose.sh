#!/system/bin/sh
# Enable max stock camera verbosity (REVERSIBLE, no partition writes). Run as root.
# Revert: umount /vendor/etc/camera ; setprop persist.logd.log.load.on 1 ; restart provider+server.
#
# *** SCOPE (RE'd v16.1.0) — THIS SCRIPT ONLY LIGHTS THE CHI SIDE ***
#   The camxoverridesettings.txt log-MASK keys below are a DECOY for the CamX-CORE tag ("CamX :"): they
#   set StaticSettings, NOT the live gate. The live CamX-core gate is the global CamX::g_logInfo, which
#   OverrideUpdateLogSettings ZEROES on a stock USER build — so the overlay alone leaves CamX-core SILENT.
#   What enableLogging=true (set below) + the overlay DO cover is the SEPARATE CHI tag ("Chi :").
#   To light CamX-core, use frida tools/frida/enable_camx_logging.js (preferred, crash-free) or the
#   durable bVar4+bVar6 prop path with TARGETED masks. The full per-layer model + the forcelog<->APS
#   G7-self-kill tension live in tools/observability/enable/10_vendor_camx_chi.sh + 00_enable_all.sh.
OUT=/data/local/tmp/enable_verbose.txt
: > "$OUT"
SRC=/vendor/etc/camera
WORK=/data/local/tmp/camcfg_overlay

echo "=== current /vendor/etc/camera contents ===" >>"$OUT"
ls -la "$SRC" 2>>"$OUT" >>"$OUT"

# 1) Build an overlay copy of the dir, add our override file, bind-mount it over the dir.
mountpoint -q "$SRC" 2>/dev/null && { umount "$SRC" 2>/dev/null; echo "unmounted prior overlay" >>"$OUT"; }
rm -rf "$WORK"; mkdir -p "$WORK"
cp -a "$SRC"/. "$WORK"/ 2>>"$OUT"
cat > "$WORK/camxoverridesettings.txt" <<'EOF'
# CamX-CORE keys = DECOY (StaticSettings only; live gate is g_logInfo via frida/durable path). Masks are
# the TARGETED set with SENSOR(bit1)+NCS(bit23) EXCLUDED — never widen to 0x1FFFFF (SSC/QMI [VERB] SIGSEGV).
enableAsciiLogging=TRUE
overrideLogLevels=1
logInfoMask=0x1f0fb7b8
logVerboseMask=0x0e010200
# CHI keys = the real lever for "Chi :" (with enableLogging=true below).
chiLogInfoMask=0xFFFFFFFFFFFFFFFF
chiLogVerboseMask=0xFFFFFFFFFFFFFFFF
chiLogConfigMask=0xFFFFFFFFFFFFFFFF
chiLogDumpMask=0xFFFFFFFFFFFFFFFF
chiNodeLogInfoMask=0xFFFFFFFFFFFFFFFF
chiNodeLogVerboseMask=0xFFFFFFFFFFFFFFFF
EOF
chmod 644 "$WORK"/* 2>/dev/null
# preserve SELinux context of the dir on the bind source
chcon -R u:object_r:vendor_configs_file:s0 "$WORK" 2>>"$OUT" || \
  restorecon -R "$WORK" 2>>"$OUT" || echo "chcon/restorecon skipped" >>"$OUT"
mount -o bind "$WORK" "$SRC" 2>>"$OUT" && echo "overlay bind-mounted on $SRC" >>"$OUT"
echo "-- override file now visible --" >>"$OUT"
ls -lZ "$SRC/camxoverridesettings.txt" 2>>"$OUT" >>"$OUT"

# 2) CHI lever: enableLogging=true defeats CHI clobber #3 so the "Chi :" tag flows. (Reversible:
#    revert with setprop persist.vendor.camera.oplus.enableLogging "" + restart provider+server.)
#    CamX-core ("CamX :") still needs frida tools/frida/enable_camx_logging.js or the durable bVar4+bVar6
#    path — this prop alone (bVar4) does NOT light CamX-core.
setprop persist.vendor.camera.oplus.enableLogging true
echo "oplus.enableLogging=$(getprop persist.vendor.camera.oplus.enableLogging)" >>"$OUT"

# 3) lift logd throttle
setprop persist.logd.log.load.on 0
echo "logd.load.on=$(getprop persist.logd.log.load.on)" >>"$OUT"

# 4) confirm APS private-log selector (already debug,pre,mp) — alog disk path stays DISARMED (G7 self-kill)
echo "aps.private.log=$(getprop persist.sys.camera.private.log.enable)" >>"$OUT"

# 5) clear old node-graph dumps so we get fresh per-mode ones
rm -f /data/vendor/camera/graph_desc_*.txt 2>/dev/null

# 6) reload HAL so override settings are re-read at init
killall vendor.qti.camera.provider-service_64 2>>"$OUT"
killall cameraserver 2>>"$OUT"
sleep 3
echo "provider pid: $(pgrep -f camera.provider)" >>"$OUT"
echo "cameraserver pid: $(pgrep -f cameraserver)" >>"$OUT"
echo DONE >>"$OUT"; echo WROTE
