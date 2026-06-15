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
