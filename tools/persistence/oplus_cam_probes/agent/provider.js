// AUTO-BUILT by build_bundle.sh — bundle 'provider'. Do not edit; edit bundle.manifest + sources.
// _anchor.js (OTA-resilient resolver; installs globalThis.Anchor):
/*
 * tools/frida/_anchor.js — OTA-resilient symbol/offset resolver for the camera probes.
 * doc-50. The point: stop hardcoding Ghidra offsets that die on every point release (the r4 .201->.300
 * silent break). A probe declares a target; resolve() walks a ladder of increasingly-durable methods and
 * logs WHICH one hit, so a miss is loud, never silent.
 *
 * Resolve ladder (first hit wins):
 *   1) export        Module.getExportByName            — durable if the symbol is exported (dynsym)
 *   2) symtab        parse the on-device .so .symtab    — catches LOCAL symbols release builds keep but hide
 *   3) pattern       Memory.scanSync(prologue/sig)      — survives minor rebuilds
 *   4) cached        symbols/<lib>-<buildid>.json       — last resort, BuildID-gated + prologue-checked
 *   (5) string-xref / host Ghidra re-anchor             — escalation when 1-4 miss (see resolveString TODO)
 *
 * Cache + BuildID: every .so has a GNU BuildID; it is the per-module OTA signal and the cache key. A cache
 * keyed on a *different* BuildID is ignored (that is exactly what would have caught the r4 .201 pin).
 *
 * Usage in a probe:
 *   var A = require('./_anchor.js');                 // or paste/concatenate when bundled
 *   var p = A.resolve({ lib:'libAlgoProcess.so', name:'HDRDetectProcess',
 *                       export:'_ZN...HDRDetectProcessEv',         // try 1
 *                       symtab:'_ZN...HDRDetectProcessEv',         // try 2 (usually same mangled name)
 *                       pattern:'3f 23 03 d5 fd 7b bc a9',         // try 3 (prologue)
 *                       fallback:{ buildid:'82fe443b', off:0x0b4d8c } }); // try 4
 *   if (p) Interceptor.attach(p, { ... });
 */
'use strict';

var CACHE_DIR = '/data/local/tmp/probe-symbols';

// ---- ELF helpers (read the on-device file; .symtab/.note may not be mapped into memory) ----------
function readFile(path) {
  try { var f = new File(path, 'rb'); var b = f.readBytes(); f.close(); return new Uint8Array(b); }
  catch (e) { return null; }
}
function u16(b,o){ return b[o] | (b[o+1]<<8); }
function u32(b,o){ return (b[o] | (b[o+1]<<8) | (b[o+2]<<16) | (b[o+3]<<24)) >>> 0; }
function u64(b,o){ return u32(b,o) + u32(b,o+4) * 4294967296; } // ELF64 little-endian, addrs fit in double

// Parse ELF64 section headers -> {name: {off,size,entsize,link}}. aarch64 libs are always ELF64 LE here.
function sections(b) {
  if (!b || b[0]!==0x7f || b[1]!==0x45) return null;        // \x7fELF
  var e_shoff = u64(b, 0x28), e_shentsize = u16(b, 0x3a), e_shnum = u16(b, 0x3c), e_shstrndx = u16(b, 0x3e);
  var strhdr = e_shoff + e_shstrndx * e_shentsize;
  var stroff = u64(b, strhdr + 0x18);
  var out = {};
  for (var i = 0; i < e_shnum; i++) {
    var sh = e_shoff + i * e_shentsize;
    var nameoff = u32(b, sh), name = '';
    for (var p = stroff + nameoff; b[p]; p++) name += String.fromCharCode(b[p]);
    out[name] = { off: u64(b, sh+0x18), size: u64(b, sh+0x20), link: u32(b, sh+0x28), entsize: u64(b, sh+0x38) };
  }
  return out;
}

// GNU BuildID from the file (.note.gnu.build-id). Returns hex string or null.
function buildId(path) {
  var b = readFile(path); if (!b) return null;
  var s = sections(b); if (!s || !s['.note.gnu.build-id']) return null;
  var n = s['.note.gnu.build-id'], o = n.off;
  var namesz = u32(b,o), descsz = u32(b,o+4); // type at o+8
  var descoff = o + 12 + ((namesz + 3) & ~3);
  var hex = '';
  for (var i = 0; i < descsz; i++) { var h = b[descoff+i].toString(16); hex += (h.length<2?'0':'')+h; }
  return hex;
}

// Resolve a (mangled) symbol name from .symtab -> absolute address (module.base + st_value), or null.
function fromSymtab(mod, sym) {
  var b = readFile(mod.path); if (!b) return null;
  var s = sections(b); if (!s || !s['.symtab'] || !s['.strtab']) return null;
  var st = s['.symtab'], strt = s['.strtab'], ent = st.entsize || 24, count = st.size / ent;
  for (var i = 0; i < count; i++) {
    var e = st.off + i * ent, nameoff = u32(b, e);
    if (!nameoff) continue;
    var name = '';
    for (var p = strt.off + nameoff; b[p]; p++) name += String.fromCharCode(b[p]);
    if (name === sym) {
      var val = u64(b, e + 8);                              // st_value (ELF64: name4 info1 other1 shndx2 value8 size8)
      if (val) return mod.base.add(val);
    }
  }
  return null;
}

function scanPattern(mod, pattern) {
  try {
    var hits = Memory.scanSync(mod.base, mod.size, pattern);
    if (hits.length === 1) return hits[0].address;
    if (hits.length > 1) { log('pattern ambiguous (' + hits.length + ' hits) for ' + mod.name); }
  } catch (e) {}
  return null;
}

// ---- cache (on-device JSON, BuildID-gated) -------------------------------------------------------
function cachePath(lib, bid) { return CACHE_DIR + '/' + lib + '-' + (bid || 'nobuildid') + '.json'; }
function loadCache(lib, bid) {
  var b = readFile(cachePath(lib, bid)); if (!b) return {};
  try { var s=''; for (var i=0;i<b.length;i++) s+=String.fromCharCode(b[i]); return JSON.parse(s) || {}; }
  catch (e) { return {}; }
}
function storeCache(lib, bid, map) {
  // CACHE_DIR must pre-exist (the probe runner mkdirs it). Write, flush, close.
  try {
    var f = new File(cachePath(lib, bid), 'w');
    f.write(JSON.stringify(map));
    if (typeof f.flush === 'function') f.flush();
    f.close();
  } catch (e) { log('cache write failed (' + cachePath(lib, bid) + '): ' + e.message); }
}

function log(m){ console.log('[anchor] ' + m); }

// ---- the ladder ----------------------------------------------------------------------------------
function resolve(spec) {
  var mod = Process.findModuleByName(spec.lib);
  if (!mod) { log('MISS ' + spec.name + ': module ' + spec.lib + ' not mapped'); return null; }
  var bid = buildId(mod.path);
  var cache = loadCache(spec.lib, bid);

  // 1) export — MUST use the frida-17 module-INSTANCE method. The legacy static
  // Module.getExportByName(lib,sym)/findExportByName were REMOVED in frida 17 and THROW
  // "is not a function" — which, wrapped in try/catch, silently returns null (this is the real
  // cause of the r4 "hooks all false" on .300, NOT symbol drift; doc-50). Never use the static form.
  if (spec.export) {
    try { var pe = mod.getExportByName(spec.export); if (pe) return hit(spec, mod, bid, cache, pe, 'export'); } catch (e) {}
    try { var pf = mod.findExportByName(spec.export); if (pf) return hit(spec, mod, bid, cache, pf, 'export'); } catch (e) {}
  }
  // 2) symtab
  if (spec.symtab) {
    var ps = fromSymtab(mod, spec.symtab); if (ps) return hit(spec, mod, bid, cache, ps, 'symtab');
  }
  // 3) pattern
  if (spec.pattern) {
    var pp = scanPattern(mod, spec.pattern); if (pp) return hit(spec, mod, bid, cache, pp, 'pattern');
  }
  // 4) cached offset — trusted only if the cached entry was for THIS BuildID
  if (cache[spec.name] && cache[spec.name].off != null) {
    return hitAddr(spec, mod.base.add(cache[spec.name].off), 'cache(' + (bid||'?').slice(0,8) + ')');
  }
  // 4b) declared fallback offset — trusted only if its pinned BuildID matches the live one
  if (spec.fallback && spec.fallback.off != null) {
    if (!spec.fallback.buildid || spec.fallback.buildid === bid) {
      return hitAddr(spec, mod.base.add(spec.fallback.off), 'fallback');
    }
    log('REFUSE stale fallback for ' + spec.name + ': pinned buildid=' + spec.fallback.buildid +
        ' != live=' + (bid||'?') + ' (OTA drift — needs re-anchor)');
  }
  // 5) escalation
  log('MISS ' + spec.name + ' in ' + spec.lib + ' (buildid=' + (bid||'?') + ') — needs string-xref / host Ghidra re-anchor (doc-50 B2)');
  return null;
}

function hit(spec, mod, bid, cache, addr, method) {
  // record the resolved module-relative offset in the per-build cache so future attaches skip the work
  try { cache[spec.name] = { off: addr.sub(mod.base).toInt32(), method: method };
        storeCache(spec.lib, bid, cache); } catch (e) {}
  return hitAddr(spec, addr, method);
}
function hitAddr(spec, addr, method) { log('HIT  ' + spec.name + ' via ' + method + ' @ ' + addr); return addr; }

var API = { resolve: resolve, buildId: buildId, fromSymtab: fromSymtab, CACHE_DIR: CACHE_DIR };
// Dual-mode: CommonJS (require) when available, else a global for the bundled/concatenated frida agent.
if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
if (typeof globalThis !== 'undefined') { globalThis.Anchor = API; }

// ---- probe: frida/enable_camx_logging.js (IIFE-isolated) ----
(function(){ try {
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

} catch (e) { try { console.log('[bundle] probe frida/enable_camx_logging.js threw: ' + e.message); } catch (_) {} } })();

// ---- probe: frida/unclobber_camx_logs.js (IIFE-isolated) ----
(function(){ try {
// unclobber_camx_logs.js — FRIDA in-memory twin of tools/patch_chi_logclobber.py.
// Defeats OnePlus's CHI log-mask clobbers (#1/#2, and #3 with INCLUDE_3) by writing `retaa`
// over the 2nd instruction of each clobber's PAC prologue IN RAM — so the camxoverridesettings.txt
// CHI verbose masks survive and the stack narrates its own SHDR graph-selection decisions (interop-tree C5:
// CHARACTERIZE the plumbing — observe/record, do not convict). NO /vendor /odm write; reverts on
// provider restart. Pick this over the push path when frida is light enough for the marginal HAL
// (this script is I/O-light: it patches ONCE at attach, no continuous hooks — survives like dump_camxsettings).
//
// SCOPE: this defeats the CHI tag ("Chi :") only — same as patch_chi_logclobber.py. The CamX-CORE tag
// ("CamX :" / the configure_streams -38 reason) is a DIFFERENT gate (the global CamX::g_logInfo) and is
// NOT addressed here. For CamX-core use tools/frida/enable_camx_logging.js (preferred, crash-free).
//
// ANCHORS (mirror patch_chi_logclobber.py PATCH_TABLE exactly — one source of truth, re-derived at runtime):
//   #1 libextensionlayer.so      ExtensionLayer::OverrideChiLogSettingsAtConfigureFile  (exported symbol)
//   #2 com.qti.chi.override.so   ExtensionModule::ModifyLogSettings                     (exported symbol)
//   #3 libextensionlayer.so      ExtensionLayer::OnPostModifySettings (exported; functional tail -> opt-in only)
// NOT a target — the old "#4" libcamxsettingsmanager.so OverrideLogSettingsAtConfigureFile (@0x151c4) is a
//   DECOY: it writes the non-gate StaticSettings+0x28 from the empty OEM provider, so retaa-ing it does
//   NOTHING for either the CamX-core OR the CHI gate. The real CamX-core clobber is OverrideUpdateLogSettings
//   (g_logInfo); use tools/frida/enable_camx_logging.js. (Matches patch_chi_logclobber.py OBSOLETE_PATCH_TABLE.)
//
// TIMING: the clobbers run at CONFIGURE (camera open). Attach to the provider BEFORE opening the camera so
// the prologues are retaa'd before configure executes. Modules load at provider start; the script polls until
// all are present, patches each once, then you open the camera.
//
// COMPANION (REQUIRED for logs to actually appear — this script only stops the ZEROING):
//   run  tools/observability/enable/10_vendor_camx_chi.sh  first (overlays the verbose masks +
//   setprop persist.vendor.camera.oplus.enableLogging true (defeats #3) + restarts the provider).
//   Full recipe:  python3 tools/patch_chi_logclobber.py --recipe
//
// USAGE (attach, never spawn):
//   killall vendor.qti.camera.provider-service_64   # let it respawn clean
//   PID=$(adb shell pgrep -f camera.provider | head -1)
//   frida -U -p $PID -l unclobber_camx_logs.js      # then open the camera on the daytime HDR scene
//   (works under Enforcing via KernelSU; same injection path as dump_camxsettings.js)

const PACIASP = [0x3f, 0x23, 0x03, 0xd5];
const RETAA   = [0xff, 0x0b, 0x5f, 0xd6];
// Set true to ALSO retaa #3 OnPostModifySettings (skips its tail vtable call). PREFER the property
// (persist.vendor.camera.oplus.enableLogging=true, set by enable/10_vendor_camx_chi.sh) which preserves the tail.
const INCLUDE_3 = false;

const TARGETS = [
  { lib: 'libextensionlayer.so',      name: '#1 OverrideChiLogSettingsAtConfigureFile',
    type: 'symbol', sym: '_ZN14ExtensionLayer37OverrideChiLogSettingsAtConfigureFileEv' },
  { lib: 'com.qti.chi.override.so',   name: '#2 ExtensionModule::ModifyLogSettings',
    type: 'symbol', sym: '_ZN15ExtensionModule17ModifyLogSettingsEv' },
  // (old "#4" libcamxsettingsmanager OverrideLogSettingsAtConfigureFile @0x151c4 intentionally OMITTED —
  //  it is the DECOY; retaa here changes nothing. See header + patch_chi_logclobber.py OBSOLETE_PATCH_TABLE.)
  { lib: 'libextensionlayer.so',      name: '#3 OnPostModifySettings', aggressive: true,
    type: 'symbol', sym: '_ZN14ExtensionLayer20OnPostModifySettingsEv' },
];

function bytesEq(arr, addr) {
  const u = new Uint8Array(addr.readByteArray(arr.length));
  for (let i = 0; i < arr.length; i++) if (u[i] !== arr[i]) return false;
  return true;
}
function isSubSpImm(addr) {              // (w & 0xFF0003FF) == 0xD10003FF  -> `sub sp, sp, #imm`
  const w = addr.readU32();
  return ((w & 0xFF0003FF) >>> 0) === 0xD10003FF;
}

function resolve(t, m) {
  if (t.type === 'symbol') return m.findExportByName(t.sym);   // null if not exported on this build
  // pattern: try the VERIFIED cached offset first (byte-identical build), then a RANGE-SAFE scan.
  // Scanning m.base..m.size whole throws an access violation — the module's virtual size spans
  // unmapped pages; only the r-x ranges are safe to scan.
  if (t.cached) { try { const a = m.base.add(t.cached); if (bytesEq(PACIASP, a)) return a; } catch (e) {} }
  let hits = [];
  try {
    m.enumerateRanges('r-x').forEach(function (r) {
      try { Memory.scanSync(r.base, r.size, t.sig).forEach(function (h) { hits.push(h); }); } catch (e) {}
    });
  } catch (e) {}
  if (hits.length === 1) return hits[0].address;
  console.log('  ✗ ' + t.name + ': signature matched ' + hits.length + ' r-x sites (need 1) — re-derive the anchor');
  return null;
}

function patchOne(t) {
  const m = Process.findModuleByName(t.lib);
  if (!m) return false;                                        // module not loaded yet -> caller polls
  const entry = resolve(t, m);
  if (!entry) { console.log('  … ' + t.name + ' (' + t.lib + '): unresolved (anchor)'); return true; }
  if (!bytesEq(PACIASP, entry)) {
    console.log('  ✗ ABORT ' + t.name + ' @' + entry + ': entry not paciasp — wrong build/anchor, NOT patching');
    return true;
  }
  const tgt = entry.add(4);
  if (bytesEq(RETAA, tgt)) { console.log('  = already retaa — ' + t.name + ' @' + entry); return true; }
  if (!isSubSpImm(tgt)) {
    console.log('  ✗ ' + t.name + ' @' + entry + ': 2nd insn not `sub sp,#imm` — drift, NOT patching');
    return true;
  }
  Memory.patchCode(tgt, 4, function (code) { code.writeByteArray(RETAA); });
  console.log('  ★ PATCHED ' + t.name + ' @' + entry + '  (retaa @' + tgt + ', ' + t.lib + ')');
  return true;
}

function run() {
  let allPresent = true;
  for (const t of TARGETS) {
    if (t.aggressive && !INCLUDE_3) { continue; }
    if (Process.findModuleByName(t.lib) === null) { allPresent = false; continue; }
    patchOne(t);
  }
  return allPresent;
}

console.log('[unclobber] retaa-ing CamX/CHI log clobbers in-memory (INCLUDE_3=' + INCLUDE_3 + ')…');
if (INCLUDE_3) console.log('[unclobber] NOTE: INCLUDE_3 skips OnPostModifySettings tail — verify 4K/stills still work');
if (!run()) {
  console.log('[unclobber] some libs not loaded yet; polling (start/open the provider)…');
  const t = setInterval(function () { if (run()) { clearInterval(t); console.log('[unclobber] all targets resolved.'); } }, 400);
} else {
  console.log('[unclobber] done — open the camera on the HDR scene; masks now survive configure.');
}

} catch (e) { try { console.log('[bundle] probe frida/unclobber_camx_logs.js threw: ' + e.message); } catch (_) {} } })();

// ---- probe: frida/hook_configure_streams.js (IIFE-isolated) ----
(function(){ try {
/*
 * hook_configure_streams.js — dump the camera3_stream_configuration for the 8K (and 4K) session,
 * to pin WHY the EISv2 node gets 0 output ports (the missing stabilized-video output sink).
 *
 * Target: camera.oemlayer.v2.so  OCamera3Dev::configure_streams(camera3_device const*,
 *         camera3_stream_configuration*)  entry file-offset 0x1786cc (vaddr==offset, exported).
 *
 * camera3_stream_configuration_t:
 *   +0x00 u32  num_streams
 *   +0x08 ptr  camera3_stream_t** streams
 *   +0x10 u32  operation_mode          (8K = 0x80a9)
 *   +0x18 ptr  session_parameters (camera_metadata*)
 * camera3_stream_t (standard HAL3.x; OnePlus internal may extend — we also hexdump):
 *   +0x00 i32  stream_type (0=OUTPUT,1=INPUT,2=BIDIR)
 *   +0x04 u32  width
 *   +0x08 u32  height
 *   +0x0c i32  format (HAL_PIXEL_FORMAT)
 *   +0x10 u32  usage (gralloc)
 *   +0x14 u32  max_buffers
 *   +0x18 ptr  priv
 *   +0x20 u32  data_space
 *   +0x24 i32  rotation
 *
 * Goal: compare the 8K (op_mode 0x80a9) stream set vs a working 4K session — find the
 * video-output stream (7680x4320, OUTPUT, video usage) that the EISv2 output should map to.
 * If it's absent/mis-typed on the 8K config, that's the baseline gap (OCS VideoMode stream setup).
 *
 * Usage (frida 17): adb push to /data/local/tmp; adb root;
 *   frida -U -n vendor.qti.camera.provider-service_64 -l /data/local/tmp/hook_configure_streams.js
 *   then select 8K + start recording (and separately a 4K recording for comparison).
 */
'use strict';

var LIB = 'camera.oemlayer.v2.so';
var ENTRY_OFF = 0x1786cc;

function fmtName(f) {
  var m = { 0x21:'BLOB', 0x22:'IMPL_DEFINED', 0x23:'YCbCr_420_888', 0x24:'RAW16',
            0x25:'RAW_OPAQUE', 0x26:'RAW10', 0x27:'RAW12', 0x20:'Y8', 0x32315659:'YV12',
            0x10f:'P010' };
  return (m[f] || ('0x' + (f>>>0).toString(16)));
}
function styp(t){ return ({0:'OUTPUT',1:'INPUT',2:'BIDIR'}[t]) || ('?'+t); }

function dumpCfg(tag, cfg) {
  if (cfg.isNull()) return false;
  var op = cfg.add(0x10).readU32();
  var n  = cfg.add(0x00).readU32();
  if (n > 64 || n === 0) return false; // not a plausible stream config
  var streams = cfg.add(0x08).readPointer();
  console.log('\n[cfgstreams] ===== ' + tag + ' op_mode=0x' + op.toString(16) +
              ' num_streams=' + n + (op === 0x80a9 ? '   <<< 8K' : ''));
  for (var i = 0; i < n; i++) {
    var s = streams.add(i * Process.pointerSize).readPointer();
    if (s.isNull()) { console.log('[cfgstreams]   S[' + i + '] NULL'); continue; }
    var t = s.add(0x00).readS32();
    var w = s.add(0x04).readU32();
    var h = s.add(0x08).readU32();
    var f = s.add(0x0c).readS32();
    var u = s.add(0x10).readU32();
    var ds = s.add(0x20).readU32();
    console.log('[cfgstreams]   S[' + i + '] ' + styp(t) + ' ' + w + 'x' + h +
                ' fmt=' + fmtName(f) + ' usage=0x' + (u>>>0).toString(16) +
                ' dataspace=0x' + (ds>>>0).toString(16));
    console.log('[cfgstreams]       raw: ' + hexdump(s, { length: 0x30, header:false, ansi:false }).replace(/\n/g,'\n[cfgstreams]       '));
  }
  return true;
}

function hook(base) {
  var addr = base.add(ENTRY_OFF);
  console.log('[cfgstreams] ' + LIB + ' base=' + base + ' hooking configure_streams @ ' + addr);
  Interceptor.attach(addr, {
    onEnter: function (a) {
      // member fn: a[0]=this, a[1]=camera3_device*, a[2]=camera3_stream_configuration*
      // probe a[2] then a[1] (fallback) — pick whichever parses as a stream config.
      try {
        if (!dumpCfg('arg2', a[2])) dumpCfg('arg1', a[1]);
      } catch (e) { console.log('[cfgstreams] err: ' + e); }
    }
  });
}

(function main() {
  var m = Process.findModuleByName(LIB);
  if (m) { hook(m.base); return; }
  console.log('[cfgstreams] ' + LIB + ' not loaded — waiting for dlopen...');
  ['android_dlopen_ext', 'dlopen'].forEach(function (sym) {
    var p = Module.getGlobalExportByName(sym); // frida-17: static Module.*ExportByName removed -> instance method (doc-50)
    if (!p) return;
    Interceptor.attach(p, {
      onEnter: function (x) { this.p = x[0].isNull() ? '' : x[0].readCString(); },
      onLeave: function () {
        if (this.p && this.p.indexOf('oemlayer.v2') !== -1) {
          var mm = Process.findModuleByName(LIB);
          if (mm) hook(mm.base);
        }
      }
    });
  });
})();

} catch (e) { try { console.log('[bundle] probe frida/hook_configure_streams.js threw: ' + e.message); } catch (_) {} } })();
