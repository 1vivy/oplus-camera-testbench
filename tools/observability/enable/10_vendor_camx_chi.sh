#!/system/bin/sh
# tools/observability/enable/10_vendor_camx_chi.sh
# Vendor CHI verbosity lever + a CamX-CORE pointer. REVERSIBLE: bind-mount overlay + setprop only.
# Revert: umount /vendor/etc/camera ; setprop persist.vendor.camera.oplus.enableLogging "" ; reboot.
# Single-block (KernelSU). Run: su -c 'sh /data/local/tmp/obs-enable/10_vendor_camx_chi.sh'
#
# *** READ FIRST — THE TWO VENDOR LOG SYSTEMS ARE INDEPENDENT, WITH DIFFERENT GATES (RE'd v16.1.0) ***
#   The camxoverridesettings.txt log-MASK keys below (logInfoMask / logVerboseMask / logCoreCfgMask / ...)
#   are a DECOY for the CamX-CORE tag ("CamX :" — camxhal3/camxsession/camxnode/configure_streams/
#   hdr_detected/the 8K -38 reason). Those keys only populate StaticSettings; they are NOT the live gate.
#   The LIVE CamX-CORE gate is the global CamX::g_logInfo (0x90-byte DebugLogInfo) in
#   libcamxcommonutils.so .data; on a stock USER build SettingsManagerImpl::OverrideUpdateLogSettings
#   takes its ELSE branch and ZEROES g_logInfo (masks + enableAsciiLogging) — so the overlay alone
#   leaves CamX-core SILENT. See FINDINGS below and docs/re-notes/camx-logmask-gate-FINDINGS.md.
#
#   What this overlay + props DO cover is the CHI tag ("Chi :" — chxextensionmodule/chxusecaseutils/
#   pluginbase; ConfigureHDRInformation / GetSHDRAutoExposureUsecase). The CHI side is a SEPARATE log
#   system: enableLogging=true defeats CHI clobber #3 (OnPostModifySettings "Disable all chi log") and
#   CHI INFO then flows. For FULL CHI mask survival also retaa #1/#2 via the host patcher
#   (python3 tools/patch_chi_logclobber.py ...; libextensionlayer OverrideChiLogSettingsAtConfigureFile
#   @0x4000c, com.qti.chi.override ExtensionModule::ModifyLogSettings @0x4ab6f8) then push to /odm.
#
#   To actually light up CamX-CORE, choose ONE lever (this script does NEITHER — it only points):
#     (a) PREFERRED, no props, crash-free, no reboot: frida ../frida/enable_camx_logging.js — writes
#         g_logInfo directly (INFO=0x1f0fb7b8, VERB=0x0e010200, +0x80=1) + re-asserts on Log::UpdateLogInfo.
#         CRITICAL: SENSOR(bit1)+NCS(bit23) stay 0 — their SSC/QMI [VERB] log SIGSEGVs in vfprintf.
#     (b) DURABLE, no frida: the populate branch needs BOTH bVar4 AND bVar6:
#           bVar4 = setprop persist.vendor.camera.oplus.enableLogging true
#           bVar6 = e.g. setprop oplus.autotest.camera.debug.forcelog 1
#         PLUS TARGETED masks (logInfoMask=0x1f0fb7b8 — SENSOR/NCS EXCLUDED, NOT 0x1FFFFF) in a readable
#         camxoverridesettings.txt via the KSU magic-mount route.
#         *** TENSION — DO NOT BLINDLY SET forcelog: oplus.autotest.camera.debug.forcelog satisfies bVar6
#         but ALSO arms the APS alog disk path (the G7 SELF-KILL, see 30_aps_native.sh). Prefer lever (a),
#         or pick a different bVar6 input. forcelog is NOT set by this script. ***

OUT=/data/local/tmp/obs_camx_chi.txt
SRC=/vendor/etc/camera
WORK=/data/local/tmp/camcfg_overlay
: > "$OUT"
echo "== vendor CamX-CORE pointer + CHI verbosity ==" >>"$OUT"

# 1) overlay camxoverridesettings.txt. NOTE: the CamX-CORE log-MASK keys here are a DECOY (they set
#    StaticSettings, not the live g_logInfo gate). The CHI* keys + the props below are what drive the
#    CHI ("Chi :") tag. Kept wide so a durable CamX-core run (lever (b)) has masks staged if both
#    bVar4+bVar6 are later armed — but the masks shown are the TARGETED CamX-core set (SENSOR/NCS off).
mountpoint -q "$SRC" 2>/dev/null && { umount "$SRC" 2>/dev/null; echo "unmounted prior overlay" >>"$OUT"; }
rm -rf "$WORK"; mkdir -p "$WORK"
cp -a "$SRC"/. "$WORK"/ 2>>"$OUT"
cat > "$WORK/camxoverridesettings.txt" <<'EOF'
# CamX-CORE keys (DECOY for the live gate — these set StaticSettings only; the live gate is g_logInfo,
# driven by frida ../frida/enable_camx_logging.js, or by the durable bVar4+bVar6 prop path). The mask
# values here are the TARGETED CamX-core set with SENSOR(bit1)+NCS(bit23) EXCLUDED (0x1f0fb7b8), NOT
# 0x1FFFFF — the SSC/QMI sensor-hub [VERB] log SIGSEGVs in vfprintf, so never widen these to all-ones.
enableAsciiLogging=TRUE
overrideLogLevels=1
logInfoMask=0x1f0fb7b8
logVerboseMask=0x0e010200
logEntryExitMask=0xFFFFFFFF
logConfigMask=0xFFFFFFFF
logCoreCfgMask=0xFFFFFFFF
logDumpMask=0xFFFFFFFF
traceGroupsEnable=0xFFFFFFFFFFFFFFFF
# CHI keys — the SEPARATE "Chi :" log system; these + enableLogging=true (set below) are the real lever.
chiLogInfoMask=0xFFFFFFFFFFFFFFFF
chiLogVerboseMask=0xFFFFFFFFFFFFFFFF
chiLogConfigMask=0xFFFFFFFFFFFFFFFF
chiLogDumpMask=0xFFFFFFFFFFFFFFFF
chiNodeLogInfoMask=0xFFFFFFFFFFFFFFFF
chiNodeLogVerboseMask=0xFFFFFFFFFFFFFFFF
EOF
chmod 644 "$WORK"/* 2>/dev/null
chcon -R u:object_r:vendor_configs_file:s0 "$WORK" 2>>"$OUT" || restorecon -R "$WORK" 2>>"$OUT" || echo "chcon skipped" >>"$OUT"
mount -o bind "$WORK" "$SRC" 2>>"$OUT" && echo "overlay bind-mounted on $SRC" >>"$OUT"
ls -lZ "$SRC/camxoverridesettings.txt" 2>>"$OUT" >>"$OUT"

# 2) CHI lever: enableLogging=true defeats CHI clobber #3 (OnPostModifySettings "Disable all chi log").
#    This is the property that makes the "Chi :" tag flow (CHI INFO needs only this — the SHDR/HDR
#    characterization was captured from here). It ALSO satisfies bVar4 of the durable CamX-core path,
#    but bVar4 ALONE does not light up CamX-core (bVar6 + g_logInfo are still needed — see header).
setprop persist.vendor.camera.oplus.enableLogging true
echo "oplus.enableLogging=$(getprop persist.vendor.camera.oplus.enableLogging)" >>"$OUT"

# 3) lift logd throttle so verbose lines are not flow-controlled away
setprop persist.logd.log.load.on 0
echo "logd.load.on=$(getprop persist.logd.log.load.on)" >>"$OUT"

# 4) NOTE on the binary retaa (host+push, NOT done by this device script):
#    CHI MASK SURVIVAL — retaa #1/#2 to keep the full CHI mask: libextensionlayer
#      OverrideChiLogSettingsAtConfigureFile @0x4000c and com.qti.chi.override
#      ExtensionModule::ModifyLogSettings @0x4ab6f8:
#        python3 tools/patch_chi_logclobber.py ...    # then adb push to /odm
#    CamX-CORE ("CamX :" / the -38 reason) is NOT a patch_chi_logclobber.py target. Its real clobber is
#    SettingsManagerImpl::OverrideUpdateLogSettings (libcamxsettingsmanager Ghidra 0x115c2c = module-offset 0x15c2c) ->
#    Log::UpdateLogInfo (libcamxcommonutils body+0x47800) zeroing g_logInfo. DECOY WARNING: the patcher's
#    old "#4" OverrideLogSettingsAtConfigureFile @0x151c4 reads the empty OemOverrideLogSettings provider
#    and writes the DECOY StaticSettings+0x28 — retaa-ing it does NOTHING for the CamX-core gate.
#    To light CamX-core use frida ../frida/enable_camx_logging.js (preferred) or the bVar4+bVar6 durable
#    prop path with TARGETED masks (header lever (b)). forcelog tension applies — see header / 30_aps_native.sh.
echo "CamX-CORE g_logInfo NOT touched here — use ../frida/enable_camx_logging.js (preferred) or bVar4+bVar6 durable path" >>"$OUT"
echo "CHI full-mask survival needs host retaa #1/#2 via patch_chi_logclobber.py (the DECOY #4 does nothing for CamX-core)" >>"$OUT"

# 5) fresh node-graph dumps + reload HAL so override is re-read
rm -f /data/vendor/camera/graph_desc_*.txt 2>/dev/null
killall vendor.qti.camera.provider-service_64 2>>"$OUT"
killall cameraserver 2>>"$OUT"
sleep 3
echo "provider pid: $(pgrep -f camera.provider)" >>"$OUT"
echo "cameraserver pid: $(pgrep -f cameraserver)" >>"$OUT"
echo DONE >>"$OUT"; echo "WROTE $OUT"
