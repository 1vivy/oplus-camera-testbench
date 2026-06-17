// trace_venus_plane_geometry.js — what plane geometry does the gralloc give the Venus P010 output?
// =============================================================================
// Follow-up to the decisive A/B (trace_p010_output_format.js): BOTH OOS and LOS request the fusion
// OUTPUT as explicit P010_VENUS 0x7FA30C0A (same usage 0x20003). So the crash divergence is NOT the
// format — it is the PLANE GEOMETRY (scanline / chroma offset) the gralloc reports for that Venus
// buffer, which the byte-identical APS blob copies into ApsBufferPlanes. This probe captures it via
// the STABLE NDK export AHardwareBuffer_lockPlanes (offset-independent — safe on .201 and .300).
//
// For the 1280x960 (and 960x1280) P010_VENUS buffer it prints: planeCount, plane[0/1] rowStride and
// data pointers, and the DERIVED scanline = (chromaVA - lumaVA)/rowStride0. A valid Venus P010 buffer
// has scanline == align(height,32) and chroma == luma + rowStride*scanline (contiguous at 32-aligned H).
//   * OOS (UBWC on): expect a VALID scanline (~960) — the reference geometry APS consumes fine.
//   * LOS (UBWC off): run the same probe; if scanline/chroma differ or lockPlanes reports a different
//     layout, the gralloc UBWC config is the lever (the SAME Venus format, different physical layout).
//
// Also hooks AHardwareBuffer_lock (single-plane) in case APS uses it; describe() correlates the buffer.
// RUN: attach to com.oplus.camera, one Master/Pro P010 capture.
// =============================================================================
'use strict';
function gx(s){ try{ if(Module.findGlobalExportByName) return Module.findGlobalExportByName(s); }catch(e){}
               try{ return Module.findExportByName(null,s); }catch(e){} return null; }
function u32(p,o){ try{ return p.add(o).readU32()>>>0; }catch(e){ return -1; } }
function ptr_(p,o){ try{ return p.add(o).readPointer(); }catch(e){ return ptr(0); } }
function fmtName(f){ return ({0x36:'LINEAR_P010',0x7fa30c0a:'P010_VENUS',0x7fa30c09:'TP10_UBWC',
                             0x23:'YCbCr_420_888',0x11:'YV12ish',0x25:'RAW10'})[f>>>0] || ('0x'+(f>>>0).toString(16)); }

var describe = gx('AHardwareBuffer_describe');
var scratch  = Memory.alloc(64);
function descOf(buf){
  if(!describe || !buf || buf.isNull()) return null;
  try{ new NativeFunction(describe,'void',['pointer','pointer'])(buf, scratch);
       return { w:u32(scratch,0), h:u32(scratch,4), fmt:u32(scratch,0xc), stride:u32(scratch,0x18) };
  }catch(e){ return null; }
}
function relevant(d){ return d && d.w>=640 && d.h>=480 && d.h<=4400; }

// AHardwareBuffer_Planes: u32 planeCount @0; planes[4] @8, each {void* data@0, u32 pixelStride@8, u32 rowStride@12} (16B)
function dumpPlanes(d, outPlanes){
  try{
    var pc = u32(outPlanes,0);
    var p0 = ptr_(outPlanes,8),  rs0 = u32(outPlanes,8+12);
    var p1 = ptr_(outPlanes,24), rs1 = u32(outPlanes,24+12);
    var chromaOff = (!p0.isNull() && !p1.isNull()) ? p1.sub(p0).toInt32() : -1;
    var scan = (rs0>0 && chromaOff>0) ? Math.round(chromaOff/rs0) : -1;
    console.log('[geom] '+d.w+'x'+d.h+' '+fmtName(d.fmt)+' planeCount='+pc+
                ' rowStride0='+rs0+' rowStride1='+rs1+' chromaOff='+chromaOff+
                ' => scanline='+scan+(scan>0?(scan===d.h?'  (==H contiguous)':scan===((d.h+31)&~31)?'  (==align32(H))':'  <<< scanline != H/align32 — INSPECT'):'')+
                '  luma='+p0+' chroma='+p1);
  }catch(e){ console.log('[geom] dump err '+e); }
}

var lp = gx('AHardwareBuffer_lockPlanes');
if(lp){ Interceptor.attach(lp, {
  onEnter:function(a){ this.buf=a[0]; this.out=a[4]; this.d=descOf(a[0]); },
  onLeave:function(){ if(relevant(this.d) && (this.d.fmt>>>0)>0x7fa30000 || (relevant(this.d)&&(this.d.fmt>>>0)===0x36))
                        dumpPlanes(this.d, this.out); } });
  console.log('[geom] hooked AHardwareBuffer_lockPlanes @ '+lp);
} else console.log('[geom] AHardwareBuffer_lockPlanes NOT found');

var lk = gx('AHardwareBuffer_lock');
if(lk){ Interceptor.attach(lk, {
  onEnter:function(a){ this.d=descOf(a[0]); },
  onLeave:function(r){ if(relevant(this.d) && ((this.d.fmt>>>0)>0x7fa30000))
      console.log('[geom-lock] '+this.d.w+'x'+this.d.h+' '+fmtName(this.d.fmt)+' stride='+this.d.stride+' (single-plane lock)'); } });
  console.log('[geom] hooked AHardwareBuffer_lock @ '+lk);
}
console.log('[geom] armed — capture once; watch for the 1280x960 / 960x1280 P010_VENUS line.');
