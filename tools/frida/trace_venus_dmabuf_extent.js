// trace_venus_dmabuf_extent.js — backing dma-buf EXTENT + neighbor for the P010_VENUS fusion buffer
// =============================================================================
// Settles the "dmabuf len" discriminator for the 1280x960 (and 960x1280) P010_VENUS OUTPUT buffer that
// BasicTone/ArcSoft over-read on LOS. For the target buffer it reports, via Process.findRangeByAddress on
// the locked luma VA: the backing dma-buf {base,size,prot,file}, whether size == the exact contiguous
// P010 size (byteStride * ceil(1.5*H)) or padded, and CRUCIALLY what is mapped IMMEDIATELY AFTER the
// buffer end — a readable neighbor vs a PROT_NONE guard page.
//
// FINDING (OOS 16.0.7.201 live, 2026-06-17): 1280x960 buffer size = 0x384000 (EXACT, no pad) — IDENTICAL
// to the LOS tombstone_36 buffer. But the page AFTER the end is a MAPPED rw- /dmabuf:AHardwareBuffer
// neighbor on OOS, vs a PROT_NONE guard page on LOS. ⇒ the dmabuf len is NOT the divergence; OOS's
// non-crash for the tail fencepost is partly heap-placement luck. The real overshoot (garbage sliceHeight)
// is a metadata-population failure (getPlaneLayout never fires on LOS), not an allocation-size difference.
//
// RUN: attach to com.oplus.camera, one Master/Pro P010 capture. NATIVE; stable export (offset-independent).
// =============================================================================
'use strict';
function gx(s){ try{ if(Module.findGlobalExportByName) return Module.findGlobalExportByName(s);}catch(e){}
               try{ return Module.findExportByName(null,s);}catch(e){} return null; }
var describe=gx('AHardwareBuffer_describe'); var scratch=Memory.alloc(64);
function descOf(b){ if(!describe||!b||b.isNull())return null;
  try{ new NativeFunction(describe,'void',['pointer','pointer'])(b,scratch);
       return {w:scratch.readU32(),h:scratch.add(4).readU32(),fmt:scratch.add(0xc).readU32()>>>0,stride:scratch.add(0x18).readU32()}; }catch(e){return null;} }
function rng(p){ try{ return Process.findRangeByAddress(p); }catch(e){ return null; } }
function expectBytes(d){ return (d.stride*2) * Math.ceil(d.h*1.5); }  // P010 = 2B/px, luma H + chroma H/2
var lp=gx('AHardwareBuffer_lockPlanes'); var seen={};
if(lp){ Interceptor.attach(lp,{
  onEnter:function(a){ this.d=descOf(a[0]); this.out=a[4]; },
  onLeave:function(){ var d=this.d; if(!d||!this.out||this.out.isNull())return;
    if((d.fmt>>>0)===0x7fa30c0a && ((d.w===1280&&d.h===960)||(d.w===960&&d.h===1280))){
      var key=d.w+'x'+d.h; if(seen[key]>=2)return; seen[key]=(seen[key]||0)+1;
      try{ var luma=this.out.add(8).readPointer(); var r=rng(luma);
        if(!r){ console.log('[ext] '+key+' luma '+luma+' NO RANGE'); return; }
        var exp=expectBytes(d), end=r.base.add(r.size), after=rng(end), lumaOff=luma.sub(r.base).toInt32();
        console.log('[ext] '+key+' P010_VENUS stridePx='+d.stride+
          ' | dmabuf base='+r.base+' size=0x'+r.size.toString(16)+' prot='+r.protection+' (lumaOff=0x'+lumaOff.toString(16)+')'+
          ' | exact=0x'+exp.toString(16)+' -> '+(r.size===exp?'EXACT (no pad)':(r.size>exp?'PADDED +0x'+(r.size-exp).toString(16):'SMALLER?'))+
          ' | AFTER end='+end+': '+(after? ('MAPPED size=0x'+after.size.toString(16)+' prot='+after.protection+(after.file?(' '+after.file.path):'')+' -> tail over-read BENIGN here')
                                          : 'UNMAPPED (guard page) -> tail over-read FAULTS here')+
          (r.file?(' | file='+r.file.path):''));
      }catch(e){ console.log('[ext] err '+e); } } } });
  console.log('[ext] armed on lockPlanes @ '+lp+' — capture once; watch the 1280x960 P010_VENUS line.');
} else console.log('[ext] AHardwareBuffer_lockPlanes NOT found');
