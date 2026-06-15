// AUTO-BUILT by build_bundle.sh — bundle 'app'. Do not edit; edit bundle.manifest + sources.
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

// ---- probe: frida/observe_getmetadata.js (IIFE-isolated) ----
(function(){ try {
// observe_getmetadata.js  (2026-06-03 — native, NO Java bridge)
// Hook APSMetadata::getMetadata overloads in libAlgoProcess (in the APP process) to log
// every (tag, rc) the APS decision reads. rc == -2 (0xfffffffe) = tag NOT PRESENT in the
// metadata → the vendor-tag-registration gap. Resolves by EXPORTED SYMBOL (device BuildId
// 82fe443b differs from the Ghidra build, so offsets are invalid — symbols are robust).
// RUN (app, after preview up):
//   python3 tools/frida/run_gcvt_once.py $(adb shell pidof com.oplus.camera) \
//     tools/frida/observe_getmetadata.js 60
// =============================================================================
const MOD = 'libAlgoProcess.so';
// int-tagId overloads: getMetadata(camera_metadata*, int tag, void** out [, size_t* [,..]])
//   args[1] = int tagId
const INT_SYMS = [
  '_ZN7android11APSMetadata11getMetadataEP15camera_metadataiPPv',
  '_ZN7android11APSMetadata11getMetadataEP15camera_metadataiPPvPm',
  '_ZN7android11APSMetadata11getMetadataEP15camera_metadataiPPvPmS5_',
];
// string-key overloads: getMetadata(camera_metadata*, map&, const char* name, ... void** out)
//   args[2] = const char* tag NAME  (resolves com.oplus.* vendor tags by name)
const STR_SYMS = [
  '_ZN7android11APSMetadata11getMetadataEP15camera_metadataRNSt3__13mapINS3_12basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEjNS3_4lessISA_EENS8_INS3_4pairIKSA_jEEEEEEPKcPPv',
  '_ZN7android11APSMetadata11getMetadataEP15camera_metadataRNSt3__13mapINS3_12basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEjNS3_4lessISA_EENS8_INS3_4pairIKSA_jEEEEEEPKcPPvPm',
  '_ZN7android11APSMetadata11getMetadataEP15camera_metadataRNSt3__13mapINS3_12basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEjNS3_4lessISA_EENS8_INS3_4pairIKSA_jEEEEEEPKcPPvPmSN_',
  '_ZN7android11APSMetadata11getMetadataEP15camera_metadataRNSt3__13mapINS3_12basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEjNS3_4lessISA_EENS8_INS3_4pairIKSA_jEEEEEEPKcSK_PPv',
  '_ZN7android11APSMetadata11getMetadataEP15camera_metadataRNSt3__13mapINS3_12basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEjNS3_4lessISA_EENS8_INS3_4pairIKSA_jEEEEEEPKcSK_PPvPm',
];
// frida-17: static Module.*ExportByName removed -> instance method (doc-50)
function gx(lib, sym){ var m = Process.findModuleByName(lib); return m ? m.findExportByName(sym) : null; }
function L(m){ send('[GM] ' + m); }
const seen = {};         // "tag@rc" -> 1  (dedupe sends)
const failTags = {};     // tag/name -> rc  (rc != 0)
let nInt = 0, nStr = 0, nFail = 0;

function getMod() {
  try { const m = Process.findModuleByName(MOD); if (m) return m; } catch(e){}
  try { const arr = Process.enumerateModules(); for (let i=0;i<arr.length;i++) if (arr[i].name.indexOf('libAlgoProcess')>=0) return arr[i]; } catch(e){}
  return null;
}
let M = getMod();
function base() { return M ? M.base : null; }
function resolveSym(sym) {
  try { if (M && M.findExportByName) { const a = M.findExportByName(sym); if (a) return a; } } catch(e){}
  try { if (M && M.getExportByName) { const a = M.getExportByName(sym); if (a) return a; } } catch(e){}
  try { const a = gx(MOD, sym); if (a) return a; } catch(e){}
  return null;
}
function hookInt(sym) {
  const a = resolveSym(sym);
  if (!a) { L('MISS int sym ' + sym.slice(-20)); return; }
  Interceptor.attach(a, {
    onEnter(args){ try { this.tag = args[1].toInt32(); } catch(e){ this.tag = -1; } },
    onLeave(ret){
      nInt++;
      let rc; try { rc = ret.toInt32(); } catch(e){ rc = 0; }
      const t = '0x' + (this.tag >>> 0).toString(16);
      const k = t + '@' + rc;
      if (!seen[k]) { seen[k] = 1;
        if (rc !== 0) { failTags[t] = rc; nFail++; L('INT tag=' + t + ' rc=' + rc + (rc === -2 ? '  [MISSING]' : '')); }
      }
    }
  });
  L('hooked INT ' + a);
}
function hookStr(sym) {
  const a = resolveSym(sym);
  if (!a) { L('MISS str sym ...' + sym.slice(-16)); return; }
  Interceptor.attach(a, {
    onEnter(args){ try { this.key = args[2].readCString(); } catch(e){ this.key = '?'; } },
    onLeave(ret){
      nStr++;
      let rc; try { rc = ret.toInt32(); } catch(e){ rc = 0; }
      const k = this.key + '@' + rc;
      if (!seen[k]) { seen[k] = 1;
        if (rc !== 0) { failTags[this.key] = rc; nFail++; L('NAME "' + this.key + '" rc=' + rc + (rc === -2 ? '  [MISSING]' : '')); }
        else if (/stats_control|aec|hdr|drc|adrc|lux|expos/i.test(this.key)) { L('PRESENT "' + this.key + '" rc=0  [OK]'); }
      }
    }
  });
  L('hooked STR ' + a);
}

let M2 = getMod();
function installAll(){
  INT_SYMS.forEach(hookInt);
  STR_SYMS.forEach(hookStr);
  L('hooks installed (poll); decision burst is at preview-start');
}
if (M2 && M2.base) { L('base ' + M2.base + ' (already loaded)'); installAll(); }
else {
  L('libAlgoProcess not loaded yet — polling (attach-by-name catches launch burst)');
  let tries = 0;
  const t = setInterval(function(){
    tries++;
    const m = getMod();
    if (m && m.base) { clearInterval(t); M = m; L('base ' + m.base + ' (loaded after ' + tries + ' polls)'); installAll(); }
    else if (tries > 100) { clearInterval(t); L('FATAL ' + MOD + ' never loaded'); }
  }, 150);
}
{
  setInterval(function(){
    const fails = Object.keys(failTags).map(function(k){ return k + '(' + failTags[k] + ')'; });
    L('TALLY intCalls=' + nInt + ' strCalls=' + nStr + ' distinctFails=' + fails.length);
    if (fails.length) L('FAILING(rc!=0): ' + fails.join('  '));
  }, 4000);
}

} catch (e) { try { console.log('[bundle] probe frida/observe_getmetadata.js threw: ' + e.message); } catch (_) {} } })();

// ---- probe: frida/trace_preview_delivery.js (IIFE-isolated) ----
(function(){ try {
// Trace OCS preview delivery chain to localize the freeze.
// Hypothesis: the getOplusHardwareBuffer bridge creates an independent strong-ref
// GraphicBuffer holder that the app never close()s (CloseGuard flood). The preview
// ImageReader pool exhausts after ~maxImages frames -> acquire returns null ->
// APSPreviewManager + GLThread starve -> freeze. The HAL keeps producing.
//
// Attach POST-freeze: if creations are 0/window the delivery STOPPED (exhaustion);
// if creations continue but no render, the freeze is downstream of delivery.
'use strict';

let getOplus = 0, hbClose = 0, imgClose = 0, acqOk = 0, acqNull = 0, onAvail = 0;

function hookJava() {
  Java.perform(function () {
    // --- ImageReader acquire (exhaustion = null returns) ---
    try {
      const IR = Java.use('android.media.ImageReader');
      ['acquireNextImage', 'acquireLatestImage'].forEach(function (m) {
        if (IR[m]) {
          IR[m].overload().implementation = function () {
            const r = this[m]();
            if (r === null) acqNull++; else acqOk++;
            return r;
          };
        }
      });
    } catch (e) { console.log('IR hook err ' + e); }

    // --- Image.close (recycle back to pool) ---
    try {
      const Img = Java.use('android.media.Image');
      Img.close.implementation = function () { imgClose++; return this.close(); };
    } catch (e) { console.log('Image.close err ' + e); }

    // --- HardwareBuffer.close (the free the app supposedly never calls) ---
    try {
      const HB = Java.use('android.hardware.HardwareBuffer');
      HB.close.implementation = function () { hbClose++; return this.close(); };
    } catch (e) { console.log('HB.close err ' + e); }

    // --- the Oplus bridge: find any getOplusHardwareBuffer method on Image/SurfaceImage ---
    ['android.media.ImageReader$SurfaceImage', 'android.media.Image'].forEach(function (cn) {
      try {
        const C = Java.use(cn);
        Object.getOwnPropertyNames(C).forEach(function (mn) {
          if (mn.toLowerCase().indexOf('oplushardwarebuffer') >= 0) {
            try {
              C[mn].overloads.forEach(function (ov) {
                ov.implementation = function () { getOplus++; return ov.apply(this, arguments); };
              });
              console.log('hooked ' + cn + '.' + mn);
            } catch (e2) { console.log('ov err ' + mn + ' ' + e2); }
          }
        });
      } catch (e) {}
    });
    console.log('[*] java hooks installed');
  });
}

// Report every 1s
setInterval(function () {
  console.log(JSON.stringify({
    t: Date.now ? 0 : 0, // placeholder
    getOplus: getOplus, hbClose: hbClose, imgClose: imgClose,
    acqOk: acqOk, acqNull: acqNull, onAvail: onAvail
  }));
  // reset per-window so we see RATE, not cumulative
  getOplus = 0; hbClose = 0; imgClose = 0; acqOk = 0; acqNull = 0; onAvail = 0;
}, 1000);

hookJava();

} catch (e) { try { console.log('[bundle] probe frida/trace_preview_delivery.js threw: ' + e.message); } catch (_) {} } })();

// ---- probe: frida/trace_edr_invocation.js (IIFE-isolated) ----
(function(){ try {
// trace_edr_invocation.js — capture the STOCK EDR-invocation contract (D4/G6 expected-behaviour point).
// =============================================================================
// FP-DECODE FIX (2026-06-14, R3/B2): the float args previously printed garbage
// (ratio=-1e10) because args[n].readFloat() reinterprets an INTEGER-arg-register
// NativePointer — but on aarch64 the AAPCS64 float/double params arrive in the SIMD
// registers v0..v7 (d0..d7), NOT in the x0..x7 integer regs that Frida's `args[]`
// array maps. The fix reads the FLOAT args from this.context.d0..d7 (Frida exposes
// the SIMD regs as context.d0.. on arm64) and reinterprets the low 32 bits as a
// 32-bit float:  setEdrSdrRatio(sc, float[d0], bool) -> ratio = d0;
//                setExtendedRangeBrightness(sc, float[d0], float[d1]) -> d0,d1.
// The OplusEdrViewTransform dump is UNCHANGED — its 16 floats are read from a MEMORY
// pointer (the 2nd arg ptr, +0x1C transform[16]) via readFloat over the 64-byte blob,
// which was already correct (memory, not a register). Only the register-arg decode moved.
// =============================================================================
// On STOCK OOS the OnePlus EDR tonemap is driven by the OEM libgui write side
// (SurfaceComposerClient::Transaction::setEdr*) fed by the Java surface
// com.oplus.view.OplusEdrUtils. This probe records BOTH levels:
//   (1) NATIVE libgui.so — the layer_state_t write ABI recovered in doc-49
//       (rearch/49-libgui-edr-abi-re.md): the setEdr* family + the
//       OplusEdrViewTransform (0x5C/92-byte) struct that carries the 4x4
//       tonemap matrix (transform[16]).
//   (2) JAVA OplusEdrUtils — the invocation contract feeding the native side
//       (getBlastSurfaceControl/getSurfaceControl/setEdrSdrRatio/setEdrFlags/
//       setEdrAnimDuration), the D4 §(a) Java entry points called by
//       PreviewHDRControl.A()/B().
//
// WHY STOCK ONLY: on LOS the OplusEdrUtils stub is a no-op
// (getBlastSurfaceControl()->null, setEdr*->false, per E1-stubs.md §(e)/(f))
// so NOTHING here fires — this captures the working contract to port against.
//
// OFFSETS ARE BUILD-PINNED to OOS .201 (V16.1.0 = 16.0.7.201, aarch64). doc-49
// offsets are image_base 0x100000, so we attach at base.add(off - 0x100000).
// p_vaddr==p_offset for this ELF, so file offset == vaddr. Native attach prefers
// the mangled exported SurfaceComposerClient::Transaction::setEdr* symbols
// (doc-49 §"Recovered method signatures"); offset-attach is the fallback.
//
// ⚠️ ALWAYS ATTACH, NEVER SPAWN. Attach to a LIVE com.oplus.camera. All memory
//    reads are guarded (try/catch); if libgui is not yet loaded we poll.
// =============================================================================
'use strict';

var LIB = 'libgui.so';
var IMAGE_BASE = 0x100000; // doc-49 offsets are image_base 0x100000; subtract for module-relative.

// OTA-resilient resolver (doc-50). Bundled: globalThis.Anchor; standalone: -l tools/frida/_anchor.js first.
// Each setEdr* target has a recorded mangled symbol (export + symtab rungs, durable) AND a doc-49 offset
// (module-relative = off - IMAGE_BASE) used as the fallback. BuildID pinned to device (.300/V16.1.0) value
// read via readelf (authoritative).
var GUI_BID = '2d90a5b3f5be5b74cc33c4a6d0d029b6';
function anchorResolve(spec) {
  if (typeof Anchor !== 'undefined' && Anchor.resolve) return Anchor.resolve(spec);
  // standalone fallback (no _anchor.js loaded): frida-17 instance export, else the declared offset.
  var m = Process.findModuleByName(spec.lib); if (!m) return null;
  if (spec.export) { try { var p = m.findExportByName(spec.export); if (p) return p; } catch (e) {} }
  if (spec.fallback && spec.fallback.off != null) { try { return m.base.add(spec.fallback.off); } catch (e) {} }
  return null;
}

// OplusEdrViewTransform (92 bytes / 0x5C) — doc-49 §"OplusEdrViewTransform struct":
//   +0x00 int32 field0   +0x04 int32 field1   +0x08 int32 field2
//   +0x0C Rect region (4x int32: left,top,right,bottom)
//   +0x1C float transform[16] (64-byte blob = the 4x4 EDR tonemap/gainmap matrix)
var EVT_SIZE = 0x5C;

// doc-49 §"Recovered method signatures" — offset (image_base 0x100000) + mangled
// SurfaceComposerClient::Transaction:: symbol. We attach the named ones the task
// asked for; the symbol is tried first, offset second.
var NATIVE_HOOKS = [
  {
    name: 'setEdrViewTransform',
    off: 0x27fd48,
    // setEdrViewTransform(const sp<SurfaceControl>&, OplusEdrViewTransform&&, int slot)
    sym: '_ZN7android21SurfaceComposerClient11Transaction19setEdrViewTransformERKNS_2spINS_14SurfaceControlEEEONS_20OplusEdrViewTransformEi',
    kind: 'viewTransform'
  },
  {
    name: 'setEdrSdrRatio',
    off: 0x280278,
    // setEdrSdrRatio(const sp<SurfaceControl>&, float ratio, bool)
    sym: '_ZN7android21SurfaceComposerClient11Transaction14setEdrSdrRatioERKNS_2spINS_14SurfaceControlEEEfb',
    kind: 'ratio'
  },
  {
    name: 'setExtendedRangeBrightness',
    off: 0x1db130,
    // STD AOSP: setExtendedRangeBrightness(const sp<SurfaceControl>&, float currentRatio, float desiredRatio)
    sym: '_ZN7android21SurfaceComposerClient11Transaction26setExtendedRangeBrightnessERKNS_2spINS_14SurfaceControlEEEff',
    kind: 'ratio2'
  },
  {
    name: 'setEdrMetadata',
    off: 0x27ffb8,
    // setEdrMetadata(const sp<SurfaceControl>&, std::vector<uint8_t>&&, int slot)
    sym: '_ZN7android21SurfaceComposerClient11Transaction14setEdrMetadataERKNS_2spINS_14SurfaceControlEEEONSt3__16vectorIhNS6_9allocatorIhEEEEi',
    kind: 'metadata'
  },
  {
    name: 'setEdrFlags',
    off: 0x27fbbc,
    // setEdrFlags(const sp<SurfaceControl>&, int)
    sym: '_ZN7android21SurfaceComposerClient11Transaction11setEdrFlagsERKNS_2spINS_14SurfaceControlEEEi',
    kind: 'flags'
  },
  {
    name: 'setEDREffectFlag',
    off: 0x280a30,
    // setEDREffectFlag(const sp<SurfaceControl>&, bool)
    sym: '_ZN7android21SurfaceComposerClient11Transaction16setEDREffectFlagERKNS_2spINS_14SurfaceControlEEEb',
    kind: 'effectFlag'
  }
];

function hexptr(p) { return p ? p.toString() : 'null'; }

// Read the OplusEdrViewTransform (0x5C) at a pointer and pretty-print field0/1/2,
// the Rect, and the 16-float tonemap matrix. Fully guarded — a bad ptr must not crash.
function dumpViewTransform(p) {
  if (!p || p.isNull()) { console.log('[EDR]       OplusEdrViewTransform: <null ptr>'); return; }
  try {
    var f0 = p.add(0x00).readS32();
    var f1 = p.add(0x04).readS32();
    var f2 = p.add(0x08).readS32();
    var l = p.add(0x0c).readS32();
    var t = p.add(0x10).readS32();
    var r = p.add(0x14).readS32();
    var b = p.add(0x18).readS32();
    console.log('[EDR]       OplusEdrViewTransform @' + hexptr(p) +
                ' field0=' + f0 + ' field1=' + f1 + ' field2=' + f2 +
                ' region=[' + l + ',' + t + ',' + r + ',' + b + ']');
    var m = [];
    for (var i = 0; i < 16; i++) {
      try { m.push(p.add(0x1c + i * 4).readFloat().toFixed(4)); }
      catch (e) { m.push('?'); }
    }
    // 4x4 tonemap matrix, one row per line (4 floats each).
    for (var row = 0; row < 4; row++) {
      console.log('[EDR]         transform[' + row + ']: ' +
                  m.slice(row * 4, row * 4 + 4).join('  '));
    }
  } catch (e) {
    console.log('[EDR]       OplusEdrViewTransform read err: ' + e +
                ' raw=' + safeHex(p, EVT_SIZE));
  }
}

function safeHex(p, len) {
  try { return hexdump(p, { length: len, header: false, ansi: false }).replace(/\n/g, ' | '); }
  catch (e) { return '<unreadable>'; }
}

// Build the onEnter handler for a given native hook kind.
//   NOTE (FP-DECODE FIX): the SurfaceControl& integer args still come from a[] (x0..x7),
//   but the FLOAT args (ratio / currentRatio / desiredRatio) are read from this.context
//   SIMD regs d0..d7 — see fpFromContext() below. The bool/int/slot args stay on a[].
function makeOnEnter(h) {
  return function (a) {
    try {
      // All are Transaction members: a[0]=this(Transaction*), a[1]=const sp<SurfaceControl>&.
      var sc = a[1];
      var ctx = this.context;   // InvocationContext.context exposes the aarch64 reg file (d0..d7 SIMD)
      var line = '[EDR] native ' + h.name + ' sc=' + hexptr(sc);
      switch (h.kind) {
        case 'viewTransform':
          // (sc, OplusEdrViewTransform&& [a2], int slot [a3])
          line += ' slot=' + a[3].toInt32();
          console.log(line);
          dumpViewTransform(a[2]);   // 16 floats read from MEMORY (the a2 ptr) — already correct
          break;
        case 'ratio':
          // (sc, float ratio, bool [a2]) — the FLOAT is in d0 (1st FP arg), NOT a[2].
          // a[2] here is the first INTEGER-class arg after sc = the bool.
          line += ' ratio=' + fpFromContext(ctx, 0) + ' bool=' + (a[2].toInt32() & 1);
          console.log(line);
          break;
        case 'ratio2':
          // STD: (sc, float currentRatio, float desiredRatio) — both FLOATS are FP args d0,d1.
          line += ' currentRatio=' + fpFromContext(ctx, 0) + ' desiredRatio=' + fpFromContext(ctx, 1);
          console.log(line);
          break;
        case 'metadata':
          // (sc, std::vector<uint8_t>&& [a2], int slot [a3])
          line += ' slot=' + a[3].toInt32() + ' vec@' + hexptr(a[2]);
          console.log(line);
          break;
        case 'flags':
          // (sc, int [a2])
          line += ' flags=' + a[2].toInt32();
          console.log(line);
          break;
        case 'effectFlag':
          // (sc, bool [a2])
          line += ' effect=' + (a[2].toInt32() & 1);
          console.log(line);
          break;
        default:
          console.log(line);
      }
    } catch (e) {
      console.log('[EDR] native ' + h.name + ' arg-read err: ' + e);
    }
  };
}

// FP-DECODE FIX: read the Nth float argument from the aarch64 SIMD register file.
// On AAPCS64 float/double params land in v0..v7 (d0..d7), separate from the x0..x7
// integer regs that Frida's args[] maps — so reading args[n].readFloat() decoded an
// integer pointer (the -1e10 garbage). Frida exposes the SIMD regs on the
// InvocationContext as context.d0..d7 (a NativePointer-like holding the 64-bit value).
// A C++ `float` param occupies the LOW 32 bits of dN; we materialize those 8 bytes and
// reinterpret the low word as a 32-bit IEEE-754 float. Fully guarded.
function fpFromContext(ctx, n) {
  try {
    var reg = ctx['d' + n];                  // Frida arm64: context.d0..d7, a NativePointer (64-bit d-reg value)
    if (reg === undefined || reg === null) return '(no d' + n + ' reg)';
    // Stash the 64-bit d-register value into scratch memory, read its low 32 bits as a float.
    var scratch = Memory.alloc(8);
    scratch.writePointer(ptr(reg.toString()));        // d-reg holds the 64-bit value; low word = the C++ float
    return scratch.readFloat().toFixed(4);
  } catch (e) {
    try { return '(d' + n + ' bits=' + String(ctx['d' + n]) + ')'; }
    catch (e2) { return '?'; }
  }
}

function resolveNative(m, h) {
  // Route through Anchor: export (mangled sym) -> symtab (same) -> pattern(none) -> fallback offset.
  // The fallback off is module-relative (doc-49 image_base 0x100000 -> off - IMAGE_BASE).
  var spec = {
    lib: LIB, name: 'SurfaceComposerClient::Transaction::' + h.name,
    export: h.sym,
    symtab: h.sym,
    fallback: { buildid: GUI_BID, off: h.off - IMAGE_BASE }
  };
  var addr = anchorResolve(spec);
  if (!addr) return null;
  // Anchor already logs WHICH rung hit ([anchor] HIT ... via export/symtab/fallback); record a coarse tag here.
  return { addr: addr, via: (typeof Anchor !== 'undefined' && Anchor.resolve) ? 'anchor' : 'standalone' };
}

var nativeHooked = false;
function hookNative() {
  var m = Process.findModuleByName(LIB);
  if (!m) return false;
  if (nativeHooked) return true;
  console.log('[EDR] ' + LIB + ' base=' + m.base + ' — installing native EDR hooks (doc-49 ABI)');
  NATIVE_HOOKS.forEach(function (h) {
    var r = resolveNative(m, h);
    if (!r || !r.addr) { console.log('[EDR]   MISS ' + h.name + ' (no symbol + no offset)'); return; }
    try {
      Interceptor.attach(r.addr, { onEnter: makeOnEnter(h) });
      console.log('[EDR]   hooked ' + h.name + ' @' + r.addr + ' via ' + r.via);
    } catch (e) {
      console.log('[EDR]   FAIL ' + h.name + ' @' + r.addr + ' via ' + r.via + ': ' + e);
    }
  });
  nativeHooked = true;
  return true;
}

// ── JAVA side: com.oplus.view.OplusEdrUtils — the invocation contract feeding native ──
// Hook all overloads of each named method, log entry args + return. On LOS these
// are no-ops (return null/false) so they "fire" but show the stub; on STOCK they
// drive the native setEdr* path above.
var JAVA_METHODS = [
  'getBlastSurfaceControl',
  'getSurfaceControl',
  'setEdrSdrRatio',
  'setEdrFlags',
  'setEdrAnimDuration',
  'setEdrViewTransform'  // hooked if present (per task: "any setEdrViewTransform if present")
];

function argsToStr(args) {
  var out = [];
  for (var i = 0; i < args.length; i++) {
    try { out.push(args[i] === null ? 'null' : String(args[i])); }
    catch (e) { out.push('<arg' + i + '?>'); }
  }
  return out.join(', ');
}

function hookJavaMethod(cls, mName) {
  try {
    var m = cls[mName];
    if (!m) { console.log('[EDR] java OplusEdrUtils.' + mName + ' <absent>'); return; }
    if (!m.overloads || m.overloads.length === 0) {
      console.log('[EDR] java OplusEdrUtils.' + mName + ' <no overloads>');
      return;
    }
    m.overloads.forEach(function (ov, idx) {
      try {
        ov.implementation = function () {
          var ret;
          var argStr = argsToStr(arguments);
          try {
            ret = ov.apply(this, arguments);
          } catch (e) {
            console.log('[EDR] java OplusEdrUtils.' + mName + '#' + idx +
                        '(' + argStr + ') THREW ' + e);
            throw e;
          }
          console.log('[EDR] java OplusEdrUtils.' + mName + '#' + idx +
                      '(' + argStr + ') -> ' + (ret === null ? 'null' : String(ret)));
          return ret;
        };
        console.log('[EDR]   hooked java OplusEdrUtils.' + mName + '#' + idx);
      } catch (e) {
        console.log('[EDR]   FAIL hook java OplusEdrUtils.' + mName + '#' + idx + ': ' + e);
      }
    });
  } catch (e) {
    console.log('[EDR] java OplusEdrUtils.' + mName + ' hook err: ' + e);
  }
}

function hookJava() {
  if (typeof Java === 'undefined' || !Java.available) {
    console.log('[EDR] Java runtime not available — skipping Java-side hooks');
    return;
  }
  Java.perform(function () {
    var cls = null;
    try {
      cls = Java.use('com.oplus.view.OplusEdrUtils');
    } catch (e) {
      console.log('[EDR] com.oplus.view.OplusEdrUtils not resolvable from this classloader: ' + e);
      return;
    }
    console.log('[EDR] java OplusEdrUtils resolved — hooking invocation contract');
    JAVA_METHODS.forEach(function (mName) { hookJavaMethod(cls, mName); });
  });
}

// ── bootstrap ──
function start() {
  hookJava();
  if (!hookNative()) {
    console.log('[EDR] ' + LIB + ' not loaded yet — polling for native EDR ABI…');
    var t = setInterval(function () { if (hookNative()) clearInterval(t); }, 400);
  }
  console.log('[EDR] armed — exercise the STOCK camera on an HDR scene now ' +
              '(on LOS the OplusEdrUtils stub is a no-op, so nothing fires).');
}
start();

// Run (ALWAYS attach, NEVER spawn — offsets pinned to OOS .201 / V16.1.0):
//   P=$(adb shell 'su -c "pidof com.oplus.camera"' | tr -d '\r')
//   frida -U -p "$P" -l tools/frida/trace_edr_invocation.js

} catch (e) { try { console.log('[bundle] probe frida/trace_edr_invocation.js threw: ' + e.message); } catch (_) {} } })();

// ---- probe: frida/probe_aps_preview_routine.js (IIFE-isolated) ----
(function(){ try {
/*
 * tools/frida/probe_aps_preview_routine.js — TIER-1 freeze Gate-B probe (doc-44/47/50).
 * APSPreviewManager::previewManagerRoutine is the preview worker loop; it parks on cond(this+0x17c) when
 * command-count(this+0x150) == 0. Frame 1 renders, but if the input Image is never returned the count
 * stays 0 and the routine starves → the preview freeze. This probe samples that state over time.
 *
 * Resolves by EXPORTED symbol (verified on 16.0.8.300, libAlgoProcess.so BuildID 2217d555…, @0x1aa694).
 * Self-sufficient: uses globalThis.Anchor when bundled (persistence agent), else the frida-17 instance API.
 * Run standalone: frida -U -p <provider-or-app-pid> -l tools/frida/_anchor.js -l this.js
 */
'use strict';
(function(){
  var LIB = 'libAlgoProcess.so';
  var SPEC = {
    lib: LIB, name: 'APSPreviewManager::previewManagerRoutine',
    export: '_ZN17APSPreviewManager21previewManagerRoutineEPv',
    symtab: '_ZN17APSPreviewManager21previewManagerRoutineEPv',
    fallback: { buildid: '2217d555bacb9e8f9c2a81a609ca9f47', off: 0x1aa694 }
  };
  // field offsets within APSPreviewManager (doc-44; re-verify if the struct layout drifts)
  var OFF_COUNT = 0x150, OFF_COND = 0x17c, OFF_QUEUE = 0x40;

  function resolve(spec){
    if (typeof Anchor !== 'undefined' && Anchor.resolve) return Anchor.resolve(spec);
    var m = Process.findModuleByName(spec.lib); if (!m) return null;
    try { var p = m.findExportByName(spec.export); if (p) { console.log('[APS_ROUTINE] resolved via export(standalone) @ ' + p); return p; } } catch(e){}
    return null;
  }

  var p = resolve(SPEC);
  if (!p) { console.log('[APS_ROUTINE] MISS — ' + LIB + ' not mapped here or symbol unresolved (wrong process?)'); return; }

  var gThis = null, samples = 0, lastCount = -1, starveRun = 0;
  Interceptor.attach(p, { onEnter: function(a){ gThis = a[0]; console.log('[APS_ROUTINE] entered this=' + gThis); } });

  // sample the command-count over time so starvation (count stuck at 0 after frame 1) is visible
  setInterval(function(){
    if (!gThis) return;
    try {
      var count = gThis.add(OFF_COUNT).readU32();
      var queue = gThis.add(OFF_QUEUE).readPointer();
      if (count !== lastCount) {
        console.log('[APS_ROUTINE] count@+0x150=' + count + ' queue@+0x40=' + queue);
        lastCount = count;
      }
      if (count === 0) { starveRun++; if (starveRun === 6) console.log('[APS_ROUTINE] *** STARVATION: count==0 for ~3s (cond@+0x17c parked) — Gate-B freeze signature ***'); }
      else starveRun = 0;
      samples++;
    } catch(e){ console.log('[APS_ROUTINE] sample err: ' + e.message); }
  }, 500);

  console.log('[APS_ROUTINE] armed @ ' + p + ' (sampling count@+0x150 every 500ms)');
})();

} catch (e) { try { console.log('[bundle] probe frida/probe_aps_preview_routine.js threw: ' + e.message); } catch (_) {} } })();

// ---- probe: frida/probe_sendinputdata_gate.js (IIFE-isolated) ----
(function(){ try {
/*
 * tools/frida/probe_sendinputdata_gate.js — TIER-1 freeze Gate-B probe (doc-44 UPDATE 5-7 / doc-47 / 50).
 * APSPreviewManager::sendInputData(AlgoPreviewProcessData*, ModeConfig*) — checks per-frame input-params holder.
 * arg1 (AlgoPreviewProcessData*) at +0x370 holds a shared_ptr<APSParamsHolder> (the per-frame input-params
 * holder carrying keys doDeinit/is_fluency_sampling/input_buffer_dataspace). Non-null = holder present.
 * The real gating is key/value-driven inside APSParamsHolder — future live trace: get<int> @0x2341d8,
 * get<bool> @0x23fe68 in libAlgoProcess. If the holder is null the input buffer cannot be released →
 * feeds the previewManagerRoutine starvation (probe_aps_preview_routine).
 *
 * Resolves by EXPORTED symbol (16.0.8.300 libAlgoProcess.so @0x1b534c; arg1 = AlgoPreviewProcessData*).
 * Self-sufficient (Anchor when bundled, else frida-17 instance API).
 * Run standalone: frida -U -p <pid> -l tools/frida/_anchor.js -l this.js
 */
'use strict';
(function(){
  var SPEC = {
    lib: 'libAlgoProcess.so', name: 'APSPreviewManager::sendInputData',
    export: '_ZN17APSPreviewManager13sendInputDataEPN7android22AlgoPreviewProcessDataEP10ModeConfig',
    symtab: '_ZN17APSPreviewManager13sendInputDataEPN7android22AlgoPreviewProcessDataEP10ModeConfig',
    fallback: { buildid: '2217d555bacb9e8f9c2a81a609ca9f47', off: 0x1b534c }
  };
  // +0x370 = shared_ptr<APSParamsHolder> in AlgoPreviewProcessData (RE-confirmed; +0x378 is next member,
  // only touched in a dead stack-guard epilogue — NOT the holder, reads NULL on live preview).
  var OFF_PARAMS_HOLDER = 0x370;   // AlgoPreviewProcessData -> shared_ptr<APSParamsHolder> (doc-44 CORRECTED)

  function resolve(spec){
    if (typeof Anchor !== 'undefined' && Anchor.resolve) return Anchor.resolve(spec);
    var m = Process.findModuleByName(spec.lib); if (!m) return null;
    try { var p = m.findExportByName(spec.export); if (p) { console.log('[SENDINPUT] resolved via export(standalone) @ ' + p); return p; } } catch(e){}
    return null;
  }

  var p = resolve(SPEC);
  if (!p) { console.log('[SENDINPUT] MISS — symbol unresolved (wrong process?)'); return; }

  var calls = 0, holderPresent = 0, holderNull = 0;
  Interceptor.attach(p, {
    onEnter: function(a){
      calls++;
      try {
        var data = a[1];                                        // AlgoPreviewProcessData*
        var holder = data.add(OFF_PARAMS_HOLDER).readPointer(); // shared_ptr<APSParamsHolder>.get() (first word)
        if (holder.isNull()) {
          holderNull++;
          if (holderNull <= 5) console.log('[SENDINPUT] call#' + calls + ' APSParamsHolder(+0x370)=NULL — input-params holder absent; buffer release path blocked');
        } else {
          holderPresent++;
          // Gate is key/value-driven inside APSParamsHolder (keys: doDeinit, is_fluency_sampling,
          // input_buffer_dataspace). Hook get<int>@0x2341d8 / get<bool>@0x23fe68 in libAlgoProcess
          // for the actual gate values. Here just confirm holder is present.
          if (holderPresent <= 3) console.log('[SENDINPUT] call#' + calls + ' APSParamsHolder(+0x370)=' + holder + ' (present — key/value gate inside holder)');
        }
      } catch(e){ console.log('[SENDINPUT] read err: ' + e.message); }
    }
  });

  setInterval(function(){ if (calls) console.log('[SENDINPUT] TALLY calls=' + calls + ' holderPresent=' + holderPresent + ' holderNull=' + holderNull); }, 3000);
  console.log('[SENDINPUT] armed @ ' + p);
})();

} catch (e) { try { console.log('[bundle] probe frida/probe_sendinputdata_gate.js threw: ' + e.message); } catch (_) {} } })();
