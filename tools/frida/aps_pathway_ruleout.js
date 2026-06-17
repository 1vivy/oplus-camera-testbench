// aps_pathway_ruleout.js — hook EVERY APS gralloc-handle pathway; one run shows which are LIVE vs RULED-OUT
// (fire 0×) and dumps geometry at each carrier. Producer-hunt rule-out instrument for the P010 fusion bug.
// See docs/re-notes/aps-pathway-map-RE.md. STATUS: AUTHORED 2026-06-17 from .300 static RE — UNTESTED on-device
// (verify symbol resolution + struct offsets on first run; re-pin if a hook doesn't resolve).
//
// Read the summary: anything "RULED OUT (0x)" is NOT in the P010-fusion path; the first carrier printing GARBAGE
// geometry is at/above the producer. The two HANDOVER channels (string vs lock) at oplus_aps_addFrameBuff are
// the load-bearing boundary — compare OOS golden vs LOS.
// ApsBufferPlanes: +0x00 fmt +0x08 h +0x18 luma +0x24 stride +0x28 scanline +0x48 chroma +0x54 cStride.
// ApsBufferDesc:   +0x08 fmt +0x0c w +0x10 h +0x14 ? (read 0x00..0xA0).  Image: +0x04 h +0x28 stride +0x2c sliceH.
// RUN: attach com.oplus.camera, one Master/Pro P010 capture; watch the [ro][summary].
// =============================================================================
'use strict';
var MODS = ['libAPSClient-jni.so','libAlgoInterface.so','libAlgoProcess.so'];
function find(name){ for(var i=0;i<MODS.length;i++){ var m=Process.findModuleByName(MODS[i]); if(!m)continue;
  var a=m.findExportByName(name); if(a) return {addr:a,mod:MODS[i]}; }
  try{ var g=Module.findGlobalExportByName(name); if(g) return {addr:g,mod:'global'}; }catch(e){} return null; }
function u32(p,o){ try{return p.add(o).readU32()>>>0;}catch(e){return -1;} }
function ptr_(p,o){ try{return p.add(o).readPointer();}catch(e){return ptr(0);} }
function apsGeom(p){ // ApsBufferPlanes
  try{ var fmt=u32(p,0),h=u32(p,8),luma=ptr_(p,0x18),stride=u32(p,0x24),scan=u32(p,0x28),chroma=ptr_(p,0x48);
    var coff=(!luma.isNull()&&!chroma.isNull())?chroma.sub(luma).toInt32():-1;
    var bad=!(scan>=h-1&&scan<=h*8)||(coff>0&&Math.abs(coff-stride*scan)>stride&&Math.abs(coff-stride*h)>stride)||coff<=0;
    return 'fmt=0x'+fmt.toString(16)+' h='+h+' stride='+stride+' scanline='+scan+' chromaOff=0x'+(coff>>>0).toString(16)+(bad?'  <<<<< GARBAGE':'  ok');
  }catch(e){return 'geom-err '+e;} }

var counts={}, geomLog={};
function reg(label, name, group, dumper){
  var s=find(name); if(!s){ counts[label]={n:0,found:false,group:group}; return; }
  counts[label]={n:0,found:true,group:group,mod:s.mod};
  Interceptor.attach(s.addr, { onEnter:function(a){ counts[label].n++; if(dumper && counts[label].n<=3){ try{ dumper(a,this); }catch(e){} } },
    onLeave: dumper&&dumper.onLeave ? function(){ try{dumper.onLeave(this);}catch(e){}} : undefined });
}

// --- HANDOVER (load-bearing) ---
reg('HANDOVER oplus_aps_addFrameBuff','oplus_aps_addFrameBuff','handover', function(a,t){
  console.log('[ro] HANDOVER addFrameBuff fired (dump buffer_input_* via verbose log / refine on first run)'); });
reg('LOCK camApsBufferLockPlanes','camApsBufferLockPlanes','handover', function(a,t){ t.outp=a[1]; }, );
(function(){ var s=find('camApsBufferLockPlanes'); if(s){ Interceptor.attach(s.addr,{ onEnter:function(a){this.o=a[1];},
  onLeave:function(){ if(this.o&&!this.o.isNull()) console.log('[ro] LOCK channel ApsBufferPlanes: '+apsGeom(this.o)); } }); } })();

// --- (B) read-side (the live geometry) ---
reg('B1 getImageBufferDesc','_ZN7android18getImageBufferDescEPNS_15AlgoProcessDataER13ApsBufferDesci','read', function(a,t){
  var d=a[1]; console.log('[ro] B1 getImageBufferDesc OUT: descFmt@8=0x'+u32(d,8).toString(16)+' w@c='+u32(d,0xc)+' h@10='+u32(d,0x10)+' f@14='+u32(d,0x14)+' f@28='+u32(d,0x28)); });
reg('B2 updateToRealBufSize','_ZN7android19updateToRealBufSizeEPNS_15AlgoProcessDataER13ApsBufferDesc','read');
reg('B3 getMetaData(ruleout)','getMetaData','ruleout');

// --- (A) import / rule-out ---
reg('A4 camApsBufferFromWindow(preview?)','camApsBufferFromWindow','ruleout');
reg('A6 camApsAllocION(refpool?)','camApsAllocION','candidate');
reg('A5 camApsMemHardwareAllocate','camApsMemHardwareAllocate','candidate');

// --- (D) hand-off ---
reg('D1 APSRefFrameSelector::prepareImage(->ArcSoft)','_ZN7android19APSRefFrameSelector12prepareImageEP15ApsBufferPlanesP8ImageRefPvi','handoff', function(a,t){
  console.log('[ro] D1 prepareImage IN aps: '+apsGeom(a[0])); });
reg('D3 camApsBufferToWindow(preview-out?)','camApsBufferToWindow','ruleout');
// D2 BasicTone prepareImage — substring match in libAlgoInterface (mangling varies); try both
['_ZN7android11APSAlgoBase12prepareImageEP15ApsBufferPlanesP5Imagei','_ZN7android14APSAlgoBase_V212prepareImageEP15ApsBufferPlanesP5Imagei'].forEach(function(n){
  var s=find(n); if(s){ counts['D2 APSAlgoBase::prepareImage(->BasicTone)']={n:0,found:true,group:'handoff',mod:s.mod};
    Interceptor.attach(s.addr,{ onEnter:function(a){ counts['D2 APSAlgoBase::prepareImage(->BasicTone)'].n++; this.img=a[1]; },
      onLeave:function(){ var im=this.img; if(im&&!im.isNull()){ var h=u32(im,4),st=u32(im,0x28),sl=u32(im,0x2c);
        console.log('[ro] D2 BasicTone Image OUT: h='+h+' stride='+st+' sliceHeight='+sl+(!(sl>=h-1&&sl<=h*8)?'  <<<<< GARBAGE sliceHeight':'  ok')); } } }); } });

// --- (D4) offlinecamera import (high priority) ---
reg('D4 OfflineCameraClient::importBuffer','_ZN6vendor3qti8hardware6camera13offlinecamera14implementation19OfflineCameraClient12importBufferEP13native_handle','import');

console.log('[ro] armed — capture once, then read [ro][summary] below.');
setInterval(function(){
  var live=[],dead=[],missing=[];
  Object.keys(counts).forEach(function(k){ var c=counts[k];
    if(!c.found){ missing.push(k); } else if(c.n>0){ live.push(k+' ['+c.group+'] ×'+c.n+(c.mod?' @'+c.mod:'')); } else { dead.push(k+' ['+c.group+']'); } });
  console.log('\n[ro][summary] ===== pathway rule-out =====');
  console.log('[ro][LIVE]      '+(live.join('\n[ro][LIVE]      ')||'(none yet)'));
  console.log('[ro][RULED-OUT] '+(dead.join(' | ')||'(none)'));
  if(missing.length) console.log('[ro][NOT-FOUND] '+missing.join(' | ')+'   (symbol unresolved — re-pin)');
}, 8000);
