// track_gralloc_handle.js — follow ONE gralloc handle through the whole APS pipeline and BLARE where the
// P010 geometry first goes garbage. libAlgoProcess is a pure CONSUMER (camApsBufferDesc/getImageBufferDesc
// fire 0× per-capture); the descriptor is built by the APS HELPERS below. This probe hooks the gralloc
// primitive + every plane/image builder + the converters, keyed by the buffer's LUMA VA, so the exact stage
// scanline/chroma turns garbage is visible. See docs/re-notes/p010-dmabuf-environment-RE.md (APS pipeline model).
//
// STATUS: AUTHORED 2026-06-17 from .300 static RE — NOT YET VALIDATED ON-DEVICE (OOS unit dropped USB before
//   the golden-baseline run). On first device run, VERIFY: (1) every by-name hook resolves+fires, (2) the
//   ApsBufferPlanes/Image offsets match this build (re-pin if not), (3) the target-size filter catches the
//   fusion buffer. Treat the first OOS run as the golden baseline (all stages should read VALID).
// USAGE: attach to com.oplus.camera, one Master/Pro P010 capture. By-name hooks (offset-independent, .201-safe).
// On the WORKING OOS unit EVERY stage should read VALID geometry (golden baseline). On the LOS port, the first
// stage printing "<<<<< GARBAGE" is the producer of the malformation.
//
// ApsBufferPlanes: +0x00 fmt(lo32) +0x08 height +0x10 planeCount +0x18 lumaVA +0x24 stride +0x28 scanline
//                  +0x48 chromaVA +0x54 chromaStride +0x78 CrVA.   Image: +0x00 w +0x04 h +0x1c fmt(9=P010)
//                  +0x28 stride +0x2c sliceHeight +0x38 dataPtr.
// =============================================================================
'use strict';
var MODS = ['libAlgoProcess.so', 'libAlgoInterface.so'];
function mlist(){ return MODS.map(function(n){return Process.findModuleByName(n);}).filter(Boolean); }
function findSym(name){ var ms=mlist(); for(var i=0;i<ms.length;i++){ var a=ms[i].findExportByName(name); if(a) return {addr:a,mod:ms[i].name}; } return null; }
function isTarget(h,stride){ // the 1280x960 / 960x1280 P010 fusion buffer (and its rotations)
  return (h>=950&&h<=970) || (h>=1270&&h<=1290) || (h>=3060&&h<=3140); }
function key(luma){ try{ return '0x'+luma.and(ptr('0xffffff')).toString(16); }catch(e){ return '?'; } }

function readAps(p){
  try{
    var fmt=p.readU32()>>>0, h=p.add(8).readU32(), luma=p.add(0x18).readPointer(),
        stride=p.add(0x24).readU32(), scan=p.add(0x28).readU32(), chroma=p.add(0x48).readPointer();
    var coff=(!luma.isNull()&&!chroma.isNull())? chroma.sub(luma).toInt32(): -1;
    var dscan=(stride>0&&coff>0)? Math.round(coff/stride): -1;
    // garbage = scanline out of [h-1, 8h], or chroma offset not ~ stride*scanline (and not contiguous stride*h)
    var bad = !(scan>=h-1 && scan<=h*8)
           || (coff>0 && Math.abs(coff - stride*scan) > stride && Math.abs(coff - stride*h) > stride)
           || (coff<=0);
    return {fmt:fmt,h:h,luma:luma,stride:stride,scan:scan,chroma:chroma,coff:coff,dscan:dscan,bad:bad};
  }catch(e){ return null; }
}
function show(stage,a){
  if(!a) return;
  if(!isTarget(a.h,a.stride)) return;
  console.log('[trk]['+key(a.luma)+'] '+stage+'  fmt=0x'+a.fmt.toString(16)+' h='+a.h+' stride='+a.stride+
    ' scanline='+a.scan+' chromaOff=0x'+(a.coff>>>0).toString(16)+' (derivedScan='+a.dscan+')'+
    (a.bad? '   <<<<< GARBAGE GEOMETRY (producer is at/above this stage)':'   ok'));
}
function readImg(p){ try{ return {w:p.readU32(),h:p.add(4).readU32(),fmt:p.add(0x1c).readU32()>>>0,
  stride:p.add(0x28).readU32(),sliceH:p.add(0x2c).readU32(),data:p.add(0x38).readPointer()}; }catch(e){return null;} }

// builders/consumers that take an ApsBufferPlanes at a known arg index
var HOOKS = [
  // stage label, mangled symbol, apsArgIdx, when ('leave' for builders that FILL it, 'enter' for consumers)
  ['1.getLockPlanes(params)', '_ZN7android16APSBufferManager13getLockPlanesEPvR15ApsBufferPlanesjiRKNSt3__16vectorI18params_key_value_tNS4_9allocatorIS6_EEEE', 1, 'leave'],
  ['2.getBufferPlanes',       '_ZN7android16APSBufferManager15getBufferPlanesEPvP15ApsBufferPlanes', 1, 'leave'],
  ['4.rotateMirror(src)',     '_ZN18APSFormatConverter12rotateMirrorER15ApsBufferPlanesS1_ib', 0, 'enter'],
];
HOOKS.forEach(function(h){
  var s=findSym(h[1]); if(!s){ console.log('[trk] NOT found: '+h[0]); return; }
  Interceptor.attach(s.addr, h[3]==='enter'
    ? { onEnter:function(a){ show(h[0]+' @'+s.mod, readAps(a[h[2]])); } }
    : { onEnter:function(a){ this.p=a[h[2]]; }, onLeave:function(){ show(h[0]+' @'+s.mod, readAps(this.p)); } });
  console.log('[trk] hooked '+h[0]+' @'+s.addr+' ('+s.mod+')');
});

// prepareImage: ApsBufferPlanes(in) -> Image(out); shows the scanline->sliceHeight transfer
(function(){
  var s=findSym('_ZN7android19APSRefFrameSelector12prepareImageEP15ApsBufferPlanesP8ImageRefPvi');
  if(!s){ console.log('[trk] NOT found: prepareImage'); return; }
  Interceptor.attach(s.addr, { onEnter:function(a){ this.in=a[0]; this.out=a[1]; show('3.prepareImage(IN aps)', readAps(a[0])); },
    onLeave:function(){ var im=readImg(this.out); if(im && isTarget(im.h,im.stride))
      console.log('[trk] 3.prepareImage(OUT img) w='+im.w+' h='+im.h+' stride='+im.stride+' sliceHeight='+im.sliceH+' fmt=0x'+im.fmt.toString(16)+
        (!(im.sliceH>=im.h-1 && im.sliceH<=im.h*8)? '   <<<<< GARBAGE sliceHeight':'   ok')); } });
  console.log('[trk] hooked 3.prepareImage @'+s.addr+' ('+s.mod+')');
})();

// p010LSB2MSBNeon(dst,src,w,h,rowStride,colStride) — the conversion walk length (the wrap_p010 target)
(function(){
  var s=findSym('_ZN22APSFormatConverterNeon15p010LSB2MSBNeonEPtS0_jjjj');
  if(!s){ console.log('[trk] NOT found: p010LSB2MSBNeon'); return; }
  Interceptor.attach(s.addr, { onEnter:function(a){ var w=a[2].toInt32(), h=a[3].toInt32(), rs=a[4].toInt32(), cs=a[5].toInt32();
    if(isTarget(h,rs)) console.log('[trk] 5.p010LSB2MSBNeon CONSUME w='+w+' h='+h+' rowStride='+rs+' colStride='+cs+
      '  walk=w*h*3='+(w*h*3)+(h>8192||rs>0x100000?'   <<<<< GARBAGE dims -> overrun':'   ok')); } });
  console.log('[trk] hooked 5.p010LSB2MSBNeon @'+s.addr+' ('+s.mod+')');
})();

// gralloc TRUTH: AHardwareBuffer_lockPlanes (NDK) — what gralloc actually reports for the handle
(function(){
  var lp; try{ lp=Module.findGlobalExportByName('AHardwareBuffer_lockPlanes'); }catch(e){}
  var desc; try{ desc=Module.findGlobalExportByName('AHardwareBuffer_describe'); }catch(e){}
  if(!lp){ console.log('[trk] lockPlanes NA'); return; }
  var scr=Memory.alloc(64);
  Interceptor.attach(lp,{ onEnter:function(a){ this.buf=a[0]; this.out=a[4]; },
    onLeave:function(){ try{ if(!desc)return; new NativeFunction(desc,'void',['pointer','pointer'])(this.buf,scr);
      var w=scr.readU32(),h=scr.add(4).readU32(),fmt=scr.add(0xc).readU32()>>>0,st=scr.add(0x18).readU32();
      if(!isTarget(h,st*2)) return;
      var p0=this.out.add(8).readPointer(), rs0=this.out.add(8+12).readU32()>>>0, p1=this.out.add(24).readPointer();
      var coff=(!p0.isNull()&&!p1.isNull())?p1.sub(p0).toInt32():-1;
      console.log('[trk]['+key(p0)+'] 0.gralloc lockPlanes(truth) '+w+'x'+h+' fmt=0x'+fmt.toString(16)+' rowStride='+rs0+
        ' chromaOff=0x'+(coff>>>0).toString(16)+' (derivedScan='+(rs0>0?Math.round(coff/rs0):-1)+')   [gralloc baseline]');
    }catch(e){} } });
  console.log('[trk] hooked 0.gralloc lockPlanes(truth)');
})();

console.log('[trk] ===== armed. Capture once. Read top->bottom: the FIRST stage marked GARBAGE is the producer. =====');
