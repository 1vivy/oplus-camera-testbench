// AUTO-BUILT by build_bundle.sh — bundle 'server'. Do not edit; edit bundle.manifest + sources.
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

// ---- probe: observability/r4-oem-transact/20_trace_ext_transact.js (IIFE-isolated) ----
(function(){ try {
/*
 * r4-oem-transact/20_trace_ext_transact.js — symmetric OOS/LOS trace of the media.camera OEM layer.
 * doc-48 / logging-gap G5. Frida 17.
 *
 * Auto-detects the attached process:
 *   - SERVER (cameraserver, has libcsextimpl.so): hooks the 6 CameraServiceExtImpl call sites.
 *       On LOS the lib is absent -> reports "ABSENT" (that is the A/B tell).
 *   - CLIENT (com.oplus.camera, Java available): hooks BinderProxy.transact for codes 10000-10022
 *       on media.camera, logs the code name + reply status. Runs on BOTH builds; on LOS the codes
 *       return UNKNOWN_TRANSACTION while the SDK believes the channel is live.
 *
 * Usage (frida 17; `adb shell setenforce 0` first):
 *   frida -U -n cameraserver       -l 20_trace_ext_transact.js   # OOS server depth
 *   frida -U -n com.oplus.camera   -l 20_trace_ext_transact.js   # client depth (both builds)
 *
 * Symbols are build-pinned to stock 16.0.7.201 libcsextimpl.so (demangled in doc-48). Re-verify with
 * `llvm-nm -D libcsextimpl.so` if the blob changes.
 */
'use strict';

var TXN = {
  10000:'FIRST_CALL', 10001:'ADD_AUTH_RESULT', 10002:'SET_DEATH_RECIPIENT', 10003:'SET_PACKAGE_NAME',
  10004:'CLIENT_IS_AUTHED', 10005:'SET_CLIENT_INFO', 10006:'SET_CALL_INFO', 10007:'SET_RIO_CLIENT_INFO',
  10008:'SET_TORCH_INTENSITY', 10009:'DISCONNECT_CLIENTS', 10010:'SET_OMOJI_JSON', 10011:'CONNECT_STATUS',
  10012:'OPEN_AON', 10013:'CLOSE_AON', 10014:'PRE_OPEN_CAMERA', 10015:'SEND_OPLUS_EXT_CAM_CMD',
  10016:'SET_IS_CAMERA_UNIT_SESSION', 10017:'READ_OPLUS_HAL_MEMORY', 10018:'READ_OPLUS_CAMERA_SERVER_MEMORY',
  10019:'REGISTER_CAMERA_DEVICE_CALLBACK', 10020:'UNREGISTER_CAMERA_DEVICE_CALLBACK',
  10021:'SET_SATELLITE_CALL_STATE', 10022:'SET_DEATH_RECIPIENT_FOR_NAME'
};
function txnName(c){ return TXN[c] || ('OEM_'+c); }

// CameraServiceExtImpl exports (mangled), 16.0.7.201 libcsextimpl.so — doc-48 evidence index.
var EXT = {
  onTransact:                  '_ZN7android20CameraServiceExtImpl10onTransactEjRKNS_6ParcelEPS1_j',
  getExtensionOperatingMode:   '_ZN7android20CameraServiceExtImpl25getExtensionOperatingModeERKNS_14CameraMetadataEmi',
  beforeConfigureStreamsLocked:'_ZN7android20CameraServiceExtImpl28beforeConfigureStreamsLockedERKNS_14CameraMetadataEmNS_7String8ERNS_7camera39StreamSetEi',
  processPreview:              '_ZN7android20CameraServiceExtImpl14processPreviewEPKNS_7camera320camera_stream_bufferEmRKNS1_15InFlightRequestE',
  beforeMetadataSendToApp:     '_ZN7android20CameraServiceExtImpl23beforeMetadataSendToAppEPNS_13CaptureResultEjRNS_7camera319CaptureOutputStatesE',
  addRemovePackageName:        '_ZN7android20CameraServiceExtImpl20addRemovePackageNameERKNS_14CameraMetadataEmb'
};

function findLib(name){
  try { var m = Process.findModuleByName(name); if (m) return m; } catch(e){}
  return null;
}
function exp(lib, sym){
  // frida 17 REMOVED the static Module.getExportByName(lib,sym)/findExportByName — they THROW
  // "is not a function", so the old try/catch silently returned null and armed ZERO hooks on a lib
  // whose symbols were perfectly resolvable (the .300 "all false" — NOT symbol drift; doc-50).
  // Must use the module-INSTANCE method.
  try { var m = Process.findModuleByName(lib); if (!m) return null;
        var p = m.findExportByName(sym); if (p) return p; } catch(e){}
  return null;
}

// rate-limit the high-frequency preview hooks so the log stays readable
var pvCount = 0, mdCount = 0;

function hookServer(){
  var lib = 'libcsextimpl.so';
  console.log('[r4][server] libcsextimpl.so @ ' + findLib(lib).base + ' — OEM layer PRESENT');

  var pOT = exp(lib, EXT.onTransact);
  if (pOT) Interceptor.attach(pOT, {
    onEnter: function(a){ this.code = a[1].toInt32(); },
    onLeave: function(r){ console.log('[r4][server] onTransact code=' + this.code + ' (' + txnName(this.code) + ') ret=' + r.toInt32()); }
  });

  var pOM = exp(lib, EXT.getExtensionOperatingMode);
  if (pOM) Interceptor.attach(pOM, {
    onEnter: function(a){ this.m = a[2].toUInt32 ? a[2].toUInt32() : a[2].toInt32(); },
    onLeave: function(r){
      var om = r.toInt32() >>> 0;
      console.log('[r4][server] getExtensionOperatingMode arg_m=0x' + this.m.toString(16) + ' -> opmode=0x' + om.toString(16) + (om===0x80a9 ? '  <<< 8K' : ''));
    }
  });

  var pBC = exp(lib, EXT.beforeConfigureStreamsLocked);
  if (pBC) Interceptor.attach(pBC, {
    onEnter: function(a){
      var m = (a[2].toUInt32 ? a[2].toUInt32() : a[2].toInt32()) >>> 0;
      this.ss = a[4];                       // StreamSet& — correlate with hook_configure_streams.js
      console.log('[r4][server] beforeConfigureStreamsLocked arg_m=0x' + m.toString(16) +
                  ' StreamSet@' + this.ss + (m===0x80a9 ? '  <<< 8K op_mode' : ''));
    },
    onLeave: function(){ console.log('[r4][server] beforeConfigureStreamsLocked done (StreamSet may be mutated — diff vs configure_streams dump)'); }
  });

  var pPP = exp(lib, EXT.processPreview);
  if (pPP) Interceptor.attach(pPP, { onEnter: function(){ if ((pvCount++ % 30) === 0) console.log('[r4][server] processPreview x' + pvCount); } });

  var pMD = exp(lib, EXT.beforeMetadataSendToApp);
  if (pMD) Interceptor.attach(pMD, { onEnter: function(){ if ((mdCount++ % 30) === 0) console.log('[r4][server] beforeMetadataSendToApp x' + mdCount); } });

  var pAR = exp(lib, EXT.addRemovePackageName);
  if (pAR) Interceptor.attach(pAR, {
    onEnter: function(a){ this.add = a[3].toInt32(); },
    onLeave: function(){ console.log('[r4][server] addRemovePackageName add=' + this.add + ' (identity stamp into metadata)'); }
  });

  console.log('[r4][server] hooks armed: onTransact=' + !!pOT + ' opmode=' + !!pOM +
              ' beforeConfigure=' + !!pBC + ' processPreview=' + !!pPP +
              ' beforeMeta=' + !!pMD + ' addRemovePkg=' + !!pAR);
}

function hookClient(){
  Java.perform(function(){
    var BinderProxy = Java.use('android.os.BinderProxy');
    BinderProxy.transact.implementation = function(code, data, reply, flags){
      var ret = this.transact(code, data, reply, flags);
      if (code >= 10000 && code <= 10022){
        var status = '';
        try {
          // peek reply exception code without consuming (best-effort)
          status = ' ret=' + ret;
        } catch(e){}
        console.log('[r4][client] transact ' + code + ' (' + txnName(code) + ')' + status +
                    (ret ? '' : '  <<< returned false / likely UNKNOWN_TRANSACTION (LOS silent-drop)'));
      }
      return ret;
    };
    console.log('[r4][client] BinderProxy.transact hooked — watching OEM codes 10000-10022 on media.camera');
  });
}

(function main(){
  if (findLib('libcsextimpl.so')){
    hookServer();
  } else if (typeof Java !== 'undefined' && Java.available){
    // could be cameraserver-without-lib (LOS) OR the app; report the LOS server case explicitly
    try {
      var isCs = Process.enumerateModules().some(function(m){ return m.name.indexOf('libcameraservice') >= 0; });
      if (isCs){ console.log('[r4][server] libcsextimpl.so ABSENT in cameraserver — stock AOSP (expect LOS). No OEM hooks to arm.'); }
    } catch(e){}
    hookClient();
  } else {
    console.log('[r4] no libcsextimpl and no Java — wrong process? attach to cameraserver or com.oplus.camera.');
  }
})();

} catch (e) { try { console.log('[bundle] probe observability/r4-oem-transact/20_trace_ext_transact.js threw: ' + e.message); } catch (_) {} } })();

// ---- probe: frida/hook_before_configure_streams.js (IIFE-isolated) ----
(function(){ try {
/*
 * tools/frida/hook_before_configure_streams.js — TIER-2 8K -38 probe (doc-35/43/48/50).
 * CameraServiceExtImpl::beforeConfigureStreamsLocked(CameraMetadata const&, op_mode, String8, StreamSet&, int)
 * is the OEM Depth-2 hook where stock cameraserver may MUTATE the StreamSet (inject the 7680x4320 video
 * OUTPUT stream the EISv2 node needs). On LOS this call-site is absent. Pairs with hook_configure_streams.js
 * (the provider-side pre-mutation dump) for a before/after diff.
 *
 * Server-side: attach to cameraserver. Resolves by EXPORTED mangled symbol (present on 16.0.8.300 libcsextimpl).
 * args: a0=this, a1=CameraMetadata&, a2=op_mode(ulong), a3=String8, a4=StreamSet&, a5=int.
 * Run standalone: frida -U -n cameraserver -l tools/frida/_anchor.js -l this.js
 *
 * StreamSet walk (conservative, READ-ONLY):
 *   StreamSet::size / StreamSet::operator[] are IMPORTED from libcameraservice — resolved via Anchor
 *   (export+symtab; no offset fallback). If either misses, falls back to the original shallow hdr16 dump.
 *   Per-stream vtable reads: width/height/format slots HIGH confidence; +0xa0 HAL-struct sub-offsets MEDIUM
 *   (hexdumped raw, not decoded, so future mapping is safe). Every stream read is individually try/catched;
 *   the whole walk bails on any miss. ⚠️ STRICTLY READ-ONLY — no writes, no NativeFunction calls on streams.
 *
 * VALIDATION (2026-06-15, live on cameraserver, 16.0.8.300):
 *   ✓ beforeConfigureStreamsLocked + StreamSet::size + StreamSet::operator[] all RESOLVE via export, and
 *     size() returns the real stream count (9) — a genuine improvement over the old shallow hdr16 dump.
 *     No crash: the per-stream guards held through an access violation (cameraserver stayed alive).
 *   ⚠ Per-stream field extraction is NOT yet working: the virtual-base thunk deref
 *     (ifc = stream + *(*stream - 0x198)) yields a bad pointer → "access violation" → the walk bails safely.
 *     OPEN for the next RE pass: re-confirm against a LIVE stream object whether (a) the -0x198 vbase-thunk
 *     offset is correct for Camera3OutputStream here, or (b) StreamSet::operator[]'s sp<> out-param ABI gives
 *     a different `stream` base than assumed. Dump the raw stream ptr + *stream (vptr) + a few vtable words
 *     first. Until then the probe reports stream COUNT (validated) and falls back; it never crashes.
 */
'use strict';
(function(){
  var SPEC = {
    lib: 'libcsextimpl.so', name: 'CameraServiceExtImpl::beforeConfigureStreamsLocked',
    export: '_ZN7android20CameraServiceExtImpl28beforeConfigureStreamsLockedERKNS_14CameraMetadataEmNS_7String8ERNS_7camera39StreamSetEi',
    symtab: '_ZN7android20CameraServiceExtImpl28beforeConfigureStreamsLockedERKNS_14CameraMetadataEmNS_7String8ERNS_7camera39StreamSetEi'
  };

  // StreamSet ABI — imported from libcameraservice, resolved via Anchor (export+symtab; no offset fallback:
  // we have no pinned offset for these and the export rung is durable).
  var SPEC_SS_SIZE = {
    lib: 'libcameraservice.so', name: 'StreamSet::size',
    export: '_ZNK7android7camera39StreamSet4sizeEv',
    symtab: '_ZNK7android7camera39StreamSet4sizeEv'
  };
  var SPEC_SS_AT = {
    lib: 'libcameraservice.so', name: 'StreamSet::operator[]',
    export: '_ZN7android7camera39StreamSetixEm',
    symtab: '_ZN7android7camera39StreamSetixEm'
  };

  function anchorResolve(spec) {
    if (typeof Anchor !== 'undefined' && Anchor.resolve) return Anchor.resolve(spec);
    var m = Process.findModuleByName(spec.lib); if (!m) return null;
    try { var p = m.findExportByName(spec.export); if (p) { console.log('[BCSL] resolved ' + spec.name + ' via export(standalone) @ ' + p); return p; } } catch(e){}
    return null;
  }

  function resolve(spec){
    if (typeof Anchor !== 'undefined' && Anchor.resolve) return Anchor.resolve(spec);
    var m = Process.findModuleByName(spec.lib); if (!m) return null;
    try { var p = m.findExportByName(spec.export); if (p) { console.log('[BCSL] resolved via export(standalone) @ ' + p); return p; } } catch(e){}
    return null;
  }

  function hexdump16(ptr){ try { return Array.from(new Uint8Array(ptr.readByteArray(16))).map(function(b){return ('0'+b.toString(16)).slice(-2);}).join(' '); } catch(e){ return '??'; } }

  // Safe hexdump of N bytes at ptr, space-separated, fully guarded.
  function safeHexN(ptr, n) {
    try { return Array.from(new Uint8Array(ptr.readByteArray(n))).map(function(b){return ('0'+b.toString(16)).slice(-2);}).join(' '); } catch(e){ return '??'; }
  }

  // Walk the StreamSet using API-driven size()+operator[]. Returns true on success.
  // operator[](ss, i) writes an sp<CameraDeviceBase> into outSp (stack scratch); stream = outSp.readPointer().
  // Virtual getters (READ-ONLY, HIGH confidence): vtbl+0x20=getWidth, +0x28=getHeight, +0x30=getFormat.
  // vtbl+0xa0 = getter returning a HAL-stream-struct ptr (MEDIUM confidence sub-offsets — hexdump only).
  function walkStreamSet(tag, ss, fnSize, fnAt) {
    try {
      var count = fnSize(ss);
      // count is uint64 from NativeFunction; coerce to JS number safely
      var n = (typeof count.toNumber === 'function') ? count.toNumber() : Number(count);
      if (n < 0 || n > 64) { console.log('[BCSL] ' + tag + ' StreamSet size=' + n + ' (suspicious, skip walk)'); return false; }
      console.log('[BCSL] ' + tag + ' StreamSet@' + ss + ' size=' + n);
      // allocate scratch for operator[] out-param sp<> (16 bytes: ptr + refcount)
      var outSp = Memory.alloc(16);
      for (var i = 0; i < n; i++) {
        try {
          outSp.writeByteArray([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);  // frida-17: instance method (static Memory.writeByteArray was removed — "not a function")
          fnAt(outSp, ss, ptr(i));
          var stream = null;
          try { stream = outSp.readPointer(); } catch(e2) {}
          if (!stream || stream.isNull()) { console.log('[BCSL] ' + tag + '   stream[' + i + '] sp=null (operator[] wrote null)'); continue; }
          // Dereference the virtual base: ifc = stream + *(long*)(*stream - 0x198)
          // This is the virtual-base thunk for the ICameraDeviceUser interface.
          var ifc = null;
          try {
            var vtbl = stream.readPointer();
            var thunk = vtbl.sub(0x198).readPointer();
            ifc = stream.add(thunk);
          } catch(e3) { ifc = stream; } // if thunk read fails, fall back to stream directly
          // Virtual getters — READ-ONLY, called as const methods (this=ifc).
          // HIGH confidence slots (doc-35 ABI, verified against libcameraservice vtable layout):
          //   vtbl[ifc]+0x20 = getWidth() -> int
          //   vtbl[ifc]+0x28 = getHeight() -> int
          //   vtbl[ifc]+0x30 = getFormat() -> int
          var width = '?', height = '?', format = '?';
          try {
            var ifcVtbl = ifc.readPointer();
            var fWidth  = new NativeFunction(ifcVtbl.add(0x20).readPointer(), 'int', ['pointer']);
            var fHeight = new NativeFunction(ifcVtbl.add(0x28).readPointer(), 'int', ['pointer']);
            var fFormat = new NativeFunction(ifcVtbl.add(0x30).readPointer(), 'int', ['pointer']);
            width  = fWidth(ifc);
            height = fHeight(ifc);
            format = fFormat(ifc);
          } catch(e4) { /* leave ?, don't crash */ }
          // MEDIUM confidence: vtbl+0xa0 returns a HAL-stream-struct ptr; sub-offsets unwitnessed beyond +0x14.
          // Hexdump first 0x40 bytes for later mapping — no sub-field assumptions.
          var halHex = '(getter-miss)';
          try {
            var ifcVtbl2 = ifc.readPointer();
            var fHal = new NativeFunction(ifcVtbl2.add(0xa0).readPointer(), 'pointer', ['pointer']);
            var halPtr = fHal(ifc);
            if (halPtr && !halPtr.isNull()) {
              halHex = safeHexN(halPtr, 0x40);
            } else {
              halHex = '(null)';
            }
          } catch(e5) { /* leave (getter-miss) */ }
          console.log('[BCSL] ' + tag + '   stream[' + i + '] @' + stream +
                      ' width=' + width + ' height=' + height + ' format=0x' + (typeof format === 'number' ? format.toString(16) : format) +
                      (width === 7680 && height === 4320 ? '  <<< 8K STREAM' : '') +
                      '\n             hal+0xa0 hex[0x40]=' + halHex + '  (MEDIUM confidence; map +0x14 onwards via future RE)');
        } catch(eStream) {
          console.log('[BCSL] ' + tag + '   stream[' + i + '] read err: ' + eStream + ' — bailing walk');
          return false;
        }
      }
      return true;
    } catch(eWalk) {
      console.log('[BCSL] ' + tag + ' StreamSet walk err: ' + eWalk);
      return false;
    }
  }

  // Resolve StreamSet API once at arm time (libcameraservice must be loaded in cameraserver).
  var fnSSSize = null, fnSSAt = null;
  function resolveStreamSetAPI() {
    if (fnSSSize && fnSSAt) return true;
    var pSize = anchorResolve(SPEC_SS_SIZE);
    var pAt   = anchorResolve(SPEC_SS_AT);
    if (!pSize || !pAt) return false;
    try {
      fnSSSize = new NativeFunction(pSize, 'uint64', ['pointer']);
      // operator[](StreamSet* this, size_t i) writes sp<> into first arg (out-param ABI on aarch64
      // for non-trivially-copyable return: hidden first ptr param receives the sp<>).
      fnSSAt   = new NativeFunction(pAt,   'void',   ['pointer', 'pointer', 'pointer']);
    } catch(e) { console.log('[BCSL] StreamSet NativeFunction wrap err: ' + e); return false; }
    console.log('[BCSL] StreamSet API resolved: size@' + pSize + ' operator[]@' + pAt);
    return true;
  }

  var p = resolve(SPEC);
  if (!p) { console.log('[BCSL] MISS — libcsextimpl absent here or symbol unresolved (LOS has no call-site)'); return; }

  var n = 0;
  Interceptor.attach(p, {
    onEnter: function(a){
      this.op = (a[2].toUInt32 ? a[2].toUInt32() : a[2].toInt32()) >>> 0;
      this.ss = a[4];
      n++;
      console.log('[BCSL] #' + n + ' INVOKED op_mode=0x' + this.op.toString(16) + (this.op === 0x80a9 ? '  <<< 8K' : '') + ' StreamSet@' + this.ss);
      // PRE-mutation walk (before cameraserver injects streams)
      if (resolveStreamSetAPI()) {
        walkStreamSet('#' + n + ' PRE', this.ss, fnSSSize, fnSSAt);
      } else {
        console.log('[BCSL] #' + n + ' PRE StreamSet@' + this.ss + ' hdr16=[' + hexdump16(this.ss) + '] (StreamSet API unresolved — shallow fallback)');
      }
    },
    onLeave: function(){
      // POST-mutation walk: shows any injected streams (e.g. the 8K EISv2 output stream)
      if (resolveStreamSetAPI()) {
        walkStreamSet('#' + n + ' POST', this.ss, fnSSSize, fnSSAt);
      } else {
        console.log('[BCSL] #' + n + ' POST StreamSet@' + this.ss + ' hdr16=[' + hexdump16(this.ss) + '] (diff vs hook_configure_streams pre-dump for the injected 8K output stream)');
      }
    }
  });
  console.log('[BCSL] armed @ ' + p);
})();

} catch (e) { try { console.log('[bundle] probe frida/hook_before_configure_streams.js threw: ' + e.message); } catch (_) {} } })();

// ---- probe: frida/probe_get_extension_opmode.js (IIFE-isolated) ----
(function(){ try {
/*
 * tools/frida/probe_get_extension_opmode.js — TIER-2 8K -38 probe (doc-35/48/50).
 * CameraServiceExtImpl::getExtensionOperatingMode(CameraMetadata const&, unsigned long, int) returns the OEM
 * operating mode for the session; the 8K HDR session is expected to resolve to op_mode 0x80a9. If stock
 * shapes the op_mode here and LOS never calls the hook, the 8K pipeline op_mode is wrong upstream of EISv2.
 * Correlate the return with the beforeConfigureStreamsLocked StreamSet dump (hook_before_configure_streams).
 *
 * Server-side: attach to cameraserver. Resolves by EXPORTED symbol (16.0.8.300 libcsextimpl @0x8875c).
 * Run standalone: frida -U -n cameraserver -l tools/frida/_anchor.js -l this.js
 */
'use strict';
(function(){
  var SPEC = {
    lib: 'libcsextimpl.so', name: 'CameraServiceExtImpl::getExtensionOperatingMode',
    export: '_ZN7android20CameraServiceExtImpl25getExtensionOperatingModeERKNS_14CameraMetadataEmi',
    symtab: '_ZN7android20CameraServiceExtImpl25getExtensionOperatingModeERKNS_14CameraMetadataEmi',
    fallback: { buildid: '039e6cf79c44d9196443375356cda290', off: 0x8875c }
  };
  function resolve(spec){
    if (typeof Anchor !== 'undefined' && Anchor.resolve) return Anchor.resolve(spec);
    var m = Process.findModuleByName(spec.lib); if (!m) return null;
    try { var p = m.findExportByName(spec.export); if (p) { console.log('[EXT_OPMODE] resolved via export(standalone) @ ' + p); return p; } } catch(e){}
    return null;
  }

  var p = resolve(SPEC);
  if (!p) { console.log('[EXT_OPMODE] MISS — libcsextimpl absent or symbol unresolved'); return; }

  var n = 0;
  Interceptor.attach(p, {
    onEnter: function(a){ this.argMode = (a[2].toUInt32 ? a[2].toUInt32() : a[2].toInt32()) >>> 0; },
    onLeave: function(r){
      var om = r.toInt32() >>> 0; n++;
      console.log('[EXT_OPMODE] #' + n + ' arg_mode=0x' + this.argMode.toString(16) + ' -> return op_mode=0x' + om.toString(16) + (om === 0x80a9 ? '  <<< 8K' : ''));
    }
  });
  console.log('[EXT_OPMODE] armed @ ' + p);
})();

} catch (e) { try { console.log('[bundle] probe frida/probe_get_extension_opmode.js threw: ' + e.message); } catch (_) {} } })();
