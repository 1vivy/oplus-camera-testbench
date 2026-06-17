// trace_gralloc_alloc_request.js — REQUESTED vs RESOLVED buffer format (the runtime lever for P010/8K)
// =============================================================================
// Pairs with trace_p010_output_format.js. That probe shows the RESOLVED format (AHardwareBuffer_describe,
// = 0x7FA30C0A Venus on LOS). THIS probe shows the REQUESTED format/usage at allocation — so the A/B is
// end-to-end: REQUEST -> (SnapAlloc resolution) -> RESOLVED -> consumer.
//
// DECISION (compare OOS vs LOS for the fusion-output ~1280x960 10-bit buffer):
//   * LOS requests IMPL_DEFINED (0x22) -> SnapAlloc resolves Venus 0x7FA30C0A; OOS requests explicit linear
//     P010 (0x36)  => FIX = request explicit linear for the output (or match OOS's usage bits).
//   * Both request the same -> the divergence is the SnapAlloc resolution (a gralloc prop/usage bit).
//
// Formats: 0x22=IMPL_DEFINED, 0x36=linear P010, 0x7FA30C0A=P010_VENUS, 0x7FA30C09=TP10_UBWC, 0x23=YCbCr_420_888.
// Hooks (whichever the APS/CamX path uses): AHardwareBuffer_allocate (libnativewindow),
// GraphicBufferAllocator::allocate (libui), and AHardwareBuffer_describe (correlate RESOLVED).
//
// RUN (OOS and LOS for A/B): frida -U -f com.oplus.camera -l <this>  (then one Master/Pro capture)
// =============================================================================
'use strict';
function gx(s){ try{ if(Module.findGlobalExportByName) return Module.findGlobalExportByName(s); }catch(e){}
               try{ return Module.findExportByName(null,s); }catch(e){} return null; }
function u32(p,o){ try{ return p.add(o).readU32()>>>0; }catch(e){ return -1; } }
function u64(p,o){ try{ return p.add(o).readU64().toString(16); }catch(e){ return '?'; } }
function fmtName(f){ return ({0x22:'IMPL_DEFINED',0x36:'LINEAR_P010',0x7fa30c0a:'P010_VENUS',
                             0x7fa30c09:'TP10_UBWC',0x23:'YCbCr_420_888',0x21:'BLOB'})[f>>>0]
                            || ('0x'+(f>>>0).toString(16)); }
function isFmt(v){ return [0x22,0x23,0x36,0x21,0x24,0x25,0x26,0x27].indexOf(v>>>0)>=0 || (v>>>0)>0x7fa30000; }
function isDim(v){ return v>=64 && v<=8192; }
function relevant(w,h){ return w>=640 && h>=480 && h<=4400; }  // capture/fusion-size, skip preview noise

// (1) NDK allocate — AHardwareBuffer_Desc{u32 w,h,layers,format; u64 usage; u32 stride,...}
(function(){
  var p = gx('AHardwareBuffer_allocate'); if (!p) { console.log('[req] AHardwareBuffer_allocate not found'); return; }
  Interceptor.attach(p, { onEnter:function(a){ this.d=a[0]; },
    onLeave:function(){ try{
      var w=u32(this.d,0),h=u32(this.d,4),f=u32(this.d,0xc),us=u64(this.d,0x10);
      if(relevant(w,h)) console.log('[req AHB_allocate] '+w+'x'+h+' REQUEST format=0x'+(f>>>0).toString(16)+
        ' ('+fmtName(f)+') usage=0x'+us+(f>>>0===0x22?'  <<< IMPL_DEFINED (SnapAlloc will resolve)':''));
    }catch(e){} } });
  console.log('[req] hooked AHardwareBuffer_allocate @ '+p);
})();

// (2) libui GraphicBufferAllocator::allocate (member fn; arg order varies by build — dump candidate slots,
//     pick the format/dim/usage by value). Enumerate the symbol by substring.
(function(){
  var m = Process.findModuleByName('libui.so'); if (!m) { console.log('[req] libui not loaded'); return; }
  var hit=null; try{ m.enumerateExports().forEach(function(e){
    if(!hit && e.name.indexOf('GraphicBufferAllocator')>=0 && e.name.indexOf('allocate')>=0
       && e.name.indexOf('Helper')<0) hit=e; }); }catch(e){}
  if(!hit){ console.log('[req] GraphicBufferAllocator::allocate export not found'); return; }
  Interceptor.attach(hit.address, { onEnter:function(a){
    // scan x1..x6 for (width,height,format,usage)
    var vals=[]; for(var i=1;i<=6;i++){ try{ vals.push(a[i].toUInt32?a[i].toUInt32():parseInt(a[i].toString())>>>0);}catch(e){ vals.push(-1);} }
    var w=vals.find(isDim), fmt=vals.find(isFmt);
    if(w && relevant(w, vals[1]||w)) console.log('[req GBA::allocate] REQUEST format='+(fmt!=null?'0x'+(fmt>>>0).toString(16)+' ('+fmtName(fmt)+')':'?')+
      ' raw[x1..x6]=['+vals.map(function(v){return '0x'+(v>>>0).toString(16);}).join(',')+']');
  } });
  console.log('[req] hooked '+hit.name.substr(0,48)+' @ '+hit.address);
})();

// (3) correlate RESOLVED (describe) — dedup
(function(){
  var p = gx('AHardwareBuffer_describe'); if (!p) return; var seen={};
  Interceptor.attach(p, { onEnter:function(a){ this.o=a[1]; },
    onLeave:function(){ var w=u32(this.o,0),h=u32(this.o,4),f=u32(this.o,0xc),us=u64(this.o,0x10);
      if(!relevant(w,h)) return; var k=w+'x'+h+'|'+(f>>>0).toString(16); if(seen[k])return; seen[k]=1;
      console.log('[resolved describe] '+w+'x'+h+' format=0x'+(f>>>0).toString(16)+' ('+fmtName(f)+') usage=0x'+us+
        ((f>>>0)===0x7fa30c0a?'  <<< VENUS (the crashing output)':((f>>>0)===0x36?'  <<< LINEAR (input)':''))); }});
  console.log('[req] hooked AHardwareBuffer_describe (resolved correlate) @ '+p);
})();
console.log('[req] armed — A/B this OOS vs LOS: compare REQUEST format vs RESOLVED for the ~1280x960 10-bit OUTPUT.');
