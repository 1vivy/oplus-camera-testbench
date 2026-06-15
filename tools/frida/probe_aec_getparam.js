// probe_aec_getparam.js — split-probe for the AEC hdr_detected PUBLISH gap (doc 45 CORRECTION).
//
// libaecCustom COMPUTES + EXPORTS hdr_detected unconditionally (processExt writes output+4 = aecOut+0xfc
// every frame). camAECGetParam is the bridge the CamX AEC node calls to retrieve AEC outputs (by a
// param-type ID) and then publish select fields as com.qti.stats_control.* vendor tags. hdr_detected
// (rc=-2 at the app) is dropped somewhere in the node's publish, while drc_gain (same section) publishes.
//
// This probe answers: WHICH param-types does the CamX node request from the algo on LOS, and how often?
//   - If a "frame-info / stats-control / HDR" param-type is REQUESTED (present in the tally) -> the algo
//     hands the data over and the node DROPS it downstream (CamX-side publish gate, candidate 1/2).
//   - If that param-type is NEVER requested on LOS -> the node doesn't even ask for the HDR-detect output
//     in non-HDR mode (the request itself is HDR-mode-gated). Either way the discriminator is LOS-vs-stock
//     param-type set: run this on BOTH and diff the tallies.
//
// camAECGetParam is EXPORTED -> resolve by name (no offset needed). Frida-17: Process.findModuleByName +
// instance findExportByName. Attach-by-PID to the provider, setenforce 0.
//   frida -U -p <provider_pid> -l probe_aec_getparam.js
//
// Signature (QCom AEC NCS): int camAECGetParam(void* handle, int paramType, void* in, void* out).
// We log paramType (arg1) tallies; best-effort hexdump of out (arg3) for a chosen param-type via DUMP_TYPE.

const LIB = 'libaecCustom.so';
const DUMP_TYPE = -1;   // set to a specific paramType int to hexdump its `out` buffer; -1 = tally only.
const DUMP_LEN  = 0x80;

function modOf(m){ try{ return Process.findModuleByName(m); }catch(e){ return null; } }
function expOf(mod,sym){ try{ const m=Process.findModuleByName(mod); if(m){ const e=m.findExportByName(sym); if(e) return e; } }catch(e){} return null; }

const tally = {};
let total = 0;

function install(){
  const ep = expOf(LIB,'camAECGetParam');
  if(!ep){ return false; }
  Interceptor.attach(ep, {
    onEnter(a){
      total++;
      let pt; try{ pt = a[1].toInt32(); }catch(e){ pt = 'x'; }
      tally[pt] = (tally[pt]||0)+1;
      this.pt = pt; this.out = a[3];
    },
    onLeave(r){
      if(DUMP_TYPE !== -1 && this.pt === DUMP_TYPE){
        try{ console.log('[GetParam type='+this.pt+' rc='+r.toInt32()+'] out='+this.out+'\n'+hexdump(this.out, {length:DUMP_LEN, ansi:false})); }
        catch(e){ console.log('[GetParam dump err] '+e); }
      }
    }
  });
  console.log('hooked camAECGetParam @ '+ep+' (lib '+LIB+'). DUMP_TYPE='+DUMP_TYPE);
  return true;
}

if(!install()){
  console.log(LIB+' not mapped yet; polling...');
  const t=setInterval(function(){ if(install()){ clearInterval(t); console.log('HOOKED'); } }, 300);
}
// periodic tally: the param-type set the CamX node requests from the AEC algo on this build.
setInterval(function(){
  const keys = Object.keys(tally).sort(function(x,y){ return tally[y]-tally[x]; });
  let s = 'AEC GetParam tally (total='+total+'): ';
  for(const k of keys.slice(0,24)) s += k+':'+tally[k]+' ';
  console.log(s);
}, 3000);
