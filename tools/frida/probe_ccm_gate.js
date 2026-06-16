// probe_ccm_gate.js — read (and optionally force) the ipe.ccm publish gate in camera.qcom.core.so
//
// Convicted root (LEDGER Iter 6): CamX::CAWBStatsProcessor::oplusAWBPublishAlgoProcessOutput publishes
// com.oplus/ipe.ccm only in the AWBAlgoOutputList type==10 case, gated by:
//   s8 = *(float*)(HwInterface::GetInstance() + cameraID*0x24 + 0x14724); fcmp s8,#0.0; b.eq skip
// OOS: gate!=0 -> publishes identity matrix (+0x14728). LOS: gate==0 -> skip -> ipe.ccm null -> no JPEG.
// Offsets (Ghidra image base 0x100000): fn entry vaddr 0xba0e64; gate `ldr s8,[x8]` vaddr 0xba1470.
//
// FORCE=1 -> overwrite the gate float to 1.0 + write an identity 3x3 at +4..+0x24 so the publish runs
// (matches OOS isCCMOverrideEnabled:0 identity publish). Set via env or edit below.
'use strict';
var MOD = 'camera.qcom.core.so';
var OFF_ENTRY = 0xba0e64;   // function entry (x0 = StatsProcessRequestData*, cameraID @ +0x88)
var OFF_GATE  = 0xba1470;   // ldr s8,[x8] ; x8 = hwif + cameraID*0x24 + 0x14724
var FORCE = false;          // <-- set true for the live fix-test
var nEntry = 0, nGate = 0, forced = 0;

function ident(p){ // write identity 3x3 floats at p (9 floats)
  var I=[1,0,0, 0,1,0, 0,0,1];
  for(var i=0;i<9;i++) p.add(i*4).writeFloat(I[i]);
}
function arm(){
  var m = Process.findModuleByName(MOD); if(!m) return false;
  Interceptor.attach(m.base.add(OFF_ENTRY), {
    onEnter: function(a){
      try { var camId = a[0].add(0x88).readU32();
        if(nEntry<6){ nEntry++; console.log('[ENTRY] #'+nEntry+' param1='+a[0]+' cameraID='+camId); }
      } catch(e){}
    }
  });
  Interceptor.attach(m.base.add(OFF_GATE), {
    onEnter: function(){
      try {
        var x8 = this.context.x8;            // = hwif + camId*0x24 + 0x14724 (gate addr)
        var gate = x8.readFloat();
        var mtx=[]; for(var i=1;i<=9;i++) mtx.push(x8.add(i*4).readFloat().toFixed(3));
        if(nGate<10){ nGate++; console.log('[GATE] reach#'+nGate+' addr='+x8+' gate='+gate+' mtx=['+mtx.join(',')+']'); }
        if(FORCE && gate===0.0){ x8.writeFloat(1.0); ident(x8.add(4)); if(forced<4){forced++;console.log('[FORCE] gate->1.0 + identity matrix written');} }
      } catch(e){ if(nGate<3) console.log('[GATE] err '+e); }
    }
  });
  console.log('[*] armed: entry@'+m.base.add(OFF_ENTRY)+' gate@'+m.base.add(OFF_GATE)+' base='+m.base+' FORCE='+FORCE);
  return true;
}
if(!arm()){ var t=setInterval(function(){ if(arm()) clearInterval(t); },300); }
console.log('[*] probe_ccm_gate loaded (reachability proves H1 type==10 entry exists vs H2 absent)');
