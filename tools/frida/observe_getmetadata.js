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
