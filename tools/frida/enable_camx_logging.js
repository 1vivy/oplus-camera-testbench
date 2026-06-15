// enable_camx_logging.js — CRASH-FREE targeted CamX-core logging for OnePlus OOS V16.1.0 (=16.0.7.201, aarch64)
//
// The live CAMX_LOG gate is the GLOBAL CamX::g_logInfo (a 0x90-byte DebugLogInfo) in
// libcamxcommonutils.so .data @ module+0x68010 — NOT StaticSettings+0x28 (that is a decoy the
// override file / configure-apply write to). Every CAMX_LOG site gates on
//   ((u64*)g_logInfo)[ level_index ]  &  group_bitmask  != 0
// and CamX::Log::LogSystem emits to logcat only if g_logInfo+0x80 (enableAsciiLogging) == 1.
// On a STOCK USER build, SettingsManagerImpl::OverrideUpdateLogSettings takes a release clobber
// branch (needs persist.vendor.camera.oplus.enableLogging=="true" AND a confidential/PRE gate),
// ZEROES every mask, pushes them via Log::UpdateLogInfo, and latches g_logInfoUpdated=1.
// So we force g_logInfo open directly + re-assert after every UpdateLogInfo (it re-zeroes at each
// stream-configure). RE'd + proven live on V16.1.0. See docs/re-notes/camx-logmask-gate-FINDINGS.md.
//
// ⚠️ THE CRASHER (why we DON'T enable all groups): the SENSOR group (bit 1) and NCS group (bit 23)
//    drive the SSC/QMI sensor-hub callbacks (camxncssscconnection.cpp / camxncsservice.cpp). Their
//    [ VERB] lines fire continuously and a buggy %s arg in SSCQmiConnection::QmiConnect()::$_0
//    SIGSEGVs in vfprintf <- FPrintF <- LogSystem. NEVER enable VERBOSE for bit 1 or bit 23.
//    This script keeps SENSOR(1), NCS(23) and TRACKER(2) at 0 in every level mask.
//
// g_logInfo (DebugLogInfo) layout — each slot is a per-CamxLogGroup bitmask (bit i = group i),
// slot offset = level_index*8 (recovered from Log::LogSystem gate + Log::UpdateLogInfo copy):
//   +0x00 logConfigMask  (L0)   +0x20 logInfoMask  (L4)   +0x30 logPerfInfoMask (L6)   +0x60 logDumpMask    (L12)
//   +0x10 logWarningMask (L2)   +0x28 logVerboseMask(L5)  +0x50 logEntryExitMask(L10)  +0x68 logCoreCfgMask (L13)
//   +0x80 enableAsciiLogging(u32, 1=>logcat)              +0x88 storedmark(u32)
//
// Verified live V16.1.0 (provider pid 26925): SUSTAINED >30s open+shutter+dwell on HDR scene,
//   F DEBUG=0 (no crash), 57 I CamX + 41 V CamX lines, hdr_detected/HDRMode/configure_streams captured.

'use strict';

var LIB = 'libcamxcommonutils.so';
var G_LOGINFO         = 0x68010; // CamX::g_logInfo (.data)
var G_LOGINFO_UPDATED = 0x687c0; // CamX::g_logInfoUpdated (.bss)
var UPDATELOGINFO_BODY = 0x47800; // CamX::Log::UpdateLogInfo real body (re-assert hook target)

// CamxLogGroup bit indices (full enum recovered from Log::GroupToString)
var G = {
  STATS_AFD:0, SENSOR:1, TRACKER:2, ISP:3, PPROC:4, MEMMGR:5, POWER:6, HAL:7,
  JPEG:8, STATS:9, CSL:10, APP:11, UTILS:12, SYNC:13, MEMSPY:14, FORMAT:15,
  CORE:16, HWL:17, CHI:18, DRQ:19, FD:20, IQMod:21, LRME_CVP:22, NCS:23,
  META:24, STATS_AEC:25, STATS_AWB:26, STATS_AF:27, SW_PROC:28, HIST:29, BPS:30, DD_FWK:31
};
function bits() { var m = 0; for (var i = 0; i < arguments.length; i++) m |= (1 << arguments[i]); return m >>> 0; }

// INFO / CONFIG / CORECFG groups — broad camera-core, SENSOR(1)+NCS(23)+TRACKER(2) EXCLUDED.
var INFO_MASK = bits(
  G.CORE, G.HAL, G.CHI, G.HWL, G.UTILS, G.SYNC, G.CSL, G.META,
  G.STATS, G.STATS_AEC, G.STATS_AWB, G.STATS_AF,
  G.PPROC, G.ISP, G.JPEG, G.FORMAT, G.MEMMGR, G.SW_PROC, G.DRQ
); // = 0x1f0fb7b8
// VERBOSE — STATS-family + CORE ONLY (hdr_detected / exposure / HDRMode detail). NEVER add SENSOR/NCS.
var VERB_MASK = bits(G.STATS, G.STATS_AEC, G.STATS_AWB, G.STATS_AF, G.CORE); // = 0x0e010200

function applyMasks(base) {
  var g = base.add(G_LOGINFO);
  g.add(0x00).writeU64(uint64(INFO_MASK)); // logConfigMask
  g.add(0x20).writeU64(uint64(INFO_MASK)); // logInfoMask
  g.add(0x68).writeU64(uint64(INFO_MASK)); // logCoreCfgMask (CORE_CFG init lines)
  g.add(0x28).writeU64(uint64(VERB_MASK)); // logVerboseMask (STATS-family + CORE only)
  // leave +0x10 warning / +0x30 perf / +0x50 entryexit / +0x60 dump at default
  g.add(0x80).writeU32(1);                 // enableAsciiLogging -> logcat ON
  base.add(G_LOGINFO_UPDATED).writeU32(1); // close the (g_logInfoUpdated==0) re-init path
}

var hooked = false;
function run() {
  var m = Process.findModuleByName(LIB);
  if (!m) return false;
  applyMasks(m.base);
  if (!hooked) {
    try {
      // CamX re-pushes a (clobbered) DebugLogInfo into g_logInfo at every stream-configure; re-assert.
      Interceptor.attach(m.base.add(UPDATELOGINFO_BODY), { onLeave: function () { applyMasks(m.base); } });
      hooked = true;
      console.log('★ targeted CamX logging ON (info=0x' + INFO_MASK.toString(16) +
        ' verb=0x' + VERB_MASK.toString(16) + ' ascii=1) — SENSOR/NCS excluded — UpdateLogInfo re-assert @' +
        m.base.add(UPDATELOGINFO_BODY) + '. Open the camera now.');
    } catch (e) {
      console.log('UpdateLogInfo hook failed: ' + e + ' (one-shot write applied; may re-zero on configure)');
    }
  }
  return true;
}
if (!run()) { console.log('libcamxcommonutils not loaded; polling…'); var t = setInterval(function () { if (run()) clearInterval(t); }, 400); }

// Run (keep frida attached so the re-assert hook survives configure_streams):
//   P=$(adb shell 'su -c "pidof vendor.qti.camera.provider-service_64"' | tr -d '\r')
//   frida -U -p "$P" -l tools/frida/enable_camx_logging.js
// Widen/narrow via INFO_MASK / VERB_MASK using the G map. NEVER add G.SENSOR or G.NCS to VERB_MASK.
