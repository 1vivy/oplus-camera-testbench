// trace_p010_output_format.js — the DECISIVE OOS test for the P010 photo-save crash root
// =============================================================================
// ROOT (see docs/re-notes/p010-venus-output-format-RE.md): on LOS the SAT/fusion OUTPUT buffer is
// allocated as HAL_PIXEL_FORMAT_YCbCr_420_P010_VENUS (0x7FA30C0A) while INPUT buffers are linear P010
// (0x36). The byte-identical APS blob fills geometry for linear 0x36 but leaves the Venus descriptor's
// scanline/chroma unset → BasicTone/ArcSoft walk off the end → crash.
//
// THE ONE MISSING FACT this probe settles: what format the *OOS* (stock) fusion-OUTPUT buffer is
// allocated with. `AHardwareBuffer_describe(buf,&desc)` is byte-identical OOS↔LOS and reports the
// allocated format faithfully — so it is the perfect discriminator:
//   * OOS output = 0x36 (linear)      → LOS wrongly resolves Venus → FIX = force output stream linear P010.
//   * OOS output = 0x7FA30C0A (Venus) → OOS Venus buffer carries PLANE_LAYOUTS metadata; LOS doesn't
//                                       → FIX = supply gralloc PLANE_LAYOUTS / flip the useMetadata flag.
//
// QTI vendor format enum (0x7FA3xxxx): 0x7FA30C09=TP10_UBWC, 0x7FA30C0A=P010_VENUS, 0x36=linear P010,
// 0x23=YCbCr_420_888 (preview).
//
// RUN (OOS stock unit OR LOS, for A/B):
//   frida -U -f com.oplus.camera -l tools/frida/trace_p010_output_format.js   (then ONE Master/Pro capture)
// or attach: frida -U -n com.oplus.camera -l tools/frida/trace_p010_output_format.js
// NATIVE-only. AHardwareBuffer_Desc layout: {u32 width,height,layers,format; u64 usage; u32 stride,rfu0,rfu1}.
// =============================================================================
'use strict';
function gx(s){ try{ if(Module.findGlobalExportByName) return Module.findGlobalExportByName(s); }catch(e){}
               try{ return Module.findExportByName(null,s); }catch(e){} return null; }
function u32(p,o){ try{ return p.add(o).readU32()>>>0; }catch(e){ return -1; } }
function u64(p,o){ try{ return p.add(o).readU64(); }catch(e){ return 0; } }
function fmtName(f){ return ({0x36:'LINEAR-P010',0x7fa30c0a:'P010_VENUS',0x7fa30c09:'TP10_UBWC',
                             0x23:'YCbCr_420_888',0x11:'YV12-ish'})[f>>>0] || ('0x'+(f>>>0).toString(16)); }

var seen = {};
var p = gx('AHardwareBuffer_describe');
if (!p) { console.log('[fmt] AHardwareBuffer_describe NOT found'); }
else {
  Interceptor.attach(p, {
    onEnter: function (a) { this.o = a[1]; },
    onLeave: function () {
      var w=u32(this.o,0), h=u32(this.o,4), lay=u32(this.o,8), fmt=u32(this.o,0xc),
          us=u64(this.o,0x10), st=u32(this.o,0x18);
      // capture-size YUV buffers (skip tiny/preview noise); dedup by (WxH|fmt)
      if (w < 640 || h < 480 || h > 4400) return;
      var key = w+'x'+h+'|'+(fmt>>>0).toString(16);
      if (seen[key]) { seen[key]++; return; } seen[key] = 1;
      var role = (fmt>>>0)===0x36 ? '  <== LINEAR (input contract)' :
                 ((fmt>>>0)===0x7fa30c0a ? '  <== VENUS (the crashing OUTPUT on LOS — needs geometry)' :
                 ((fmt>>>0)>0x7fa30000 ? '  <== QTI-VENDOR (inspect)' : ''));
      console.log('[fmt] ' + w + 'x' + h + ' layers=' + lay +
                  ' format=0x' + (fmt>>>0).toString(16) + ' (' + fmtName(fmt) + ')' +
                  ' usage=0x' + us.toString(16) + ' stride=' + st + role);
    }
  });
  console.log('[fmt] hooked AHardwareBuffer_describe @ ' + p + ' — take ONE Master/Pro P010 capture.');
  console.log('[fmt] DECISIVE: is the 1280x960-class OUTPUT format 0x36 (linear) or 0x7FA30C0A (Venus)?');
}

// periodic recap (counts per distinct WxH|format)
setInterval(function () {
  var ks = Object.keys(seen); if (!ks.length) return;
  console.log('[fmt][recap] ' + ks.map(function(k){ return k+'×'+seen[k]; }).join('  '));
}, 6000);
