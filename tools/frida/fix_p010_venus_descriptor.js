// fix_p010_venus_descriptor.js — VALIDATED single-point fix for the P010 photo-save crash
// =============================================================================
// Completes the incomplete Venus-P010 OUTPUT descriptor at the APS converter boundary, so BasicTone /
// ArcSoft / the APS rotate all receive a born-correct contiguous P010 descriptor. This is the clean
// replacement for libapsfixup: ONE geometry completion vs FOUR consumer-side GOT patches.
// See docs/re-notes/p010-venus-output-format-RE.md.
//
// ROOT: the fusion OUTPUT buffer is HAL_PIXEL_FORMAT_YCbCr_420_P010_VENUS (0x7FA30C0A); the APS describe
// path leaves its ApsBufferPlanes scanline(+0x28)/chroma(+0x48)/format(+0x0) UNSET (luma+stride+height ARE
// set). The buffer is contiguous (chroma = luma + stride·height), so the missing fields are derivable.
//
// VALIDATED ON-DEVICE (CPH2747 LOS, 2026-06-17): fired 12× over 4 captures → camera process stayed ALIVE,
// 4 JPEGs saved, ZERO com.oplus.camera/BasicTone/ArcSoft tombstones (the prior baseline crashed every shot).
//
// NOTE: this is a DIAGNOSTIC/validation overlay AND the reference implementation for the durable shim. The
// preferred durable fix is upstream — force the output stream to linear P010 (0x36) at allocation (decide via
// trace_p010_output_format.js). Use this shim only if the allocation-time fix isn't reachable in-tree.
//
// libAlgoInterface .300 (BuildId f76a8818). Frida runtime addr = module.base + bare VMA.
// ApsBufferPlanes: +0x00 fmt(low32) +0x08 height +0x18 luma VA +0x24 stride +0x28 scanline +0x48 chroma VA
//                  +0x54 chroma stride +0x78 Cr VA.
//
// RUN: frida -U -f com.oplus.camera -l tools/frida/fix_p010_venus_descriptor.js  (then Master/Pro capture)
// =============================================================================
'use strict';
var MOD = 'libAlgoInterface.so';
// converters + ArcSoft prep that READ the ApsBufferPlanes (and the Aps arg index for each)
var HOOKS = [
  { n:'initImage',           vma:0xdd6c80,  aps:1 },
  { n:'prepareImage',        vma:0x195c2ac, aps:0 },
  { n:'V2::prepareImage',    vma:0x1acc494, aps:1 },
  { n:'ArcSoft.PrepareImage',vma:0xf3ab30,  aps:0 },
];
var VENUS_P010 = 0x7fa30c0a, LINEAR_P010 = 0x36;

function u32(p,o){ try{ return p.add(o).readU32()>>>0; }catch(e){ return -1; } }
function completeDescriptor(p){
  if (!p || p.isNull()) return false;
  try {
    var fmt = u32(p,0)>>>0, h = u32(p,0x08), stride = u32(p,0x24), scan = u32(p,0x28);
    // BAD signature: Venus format, OR scanline out of the sane [h, 8h] band (uninitialized).
    if (fmt !== VENUS_P010 && scan >= h && scan <= h*8) return false;
    if (!(h > 0 && h < 8192 && stride > 0)) return false;
    var luma = p.add(0x18).readPointer();
    if (luma.isNull()) return false;
    var chroma = luma.add(stride * h);               // contiguous P010 (verified vs good buffer)
    p.add(0x00).writeU32(LINEAR_P010);               // format -> linear P010 (the handled enum)
    p.add(0x28).writeU32(h);                         // scanline = height (Venus==linear at 32-aligned H)
    p.add(0x48).writePointer(chroma);                // chroma plane VA
    p.add(0x54).writeU32(stride);                    // chroma stride
    try { p.add(0x78).writePointer(chroma.add(2)); } catch(e) {}  // Cr VA (interleaved UV)
    return true;
  } catch (e) { return false; }
}

var armed = false, fixes = 0;
var iv = setInterval(function () {
  if (armed) return;
  var m = Process.findModuleByName(MOD); if (!m) return;
  armed = true;
  console.log('[p010fix] ' + MOD + ' base=' + m.base);
  HOOKS.forEach(function (hh) {
    try {
      Interceptor.attach(m.base.add(hh.vma), {
        onEnter: function (a) {
          if (completeDescriptor(a[hh.aps])) {
            fixes++;
            if (fixes <= 16) console.log('[p010fix] completed Venus->linear descriptor @ ' + hh.n + ' (#' + fixes + ')');
          }
        }
      });
      console.log('[p010fix] hooked ' + hh.n + ' @ ' + m.base.add(hh.vma));
    } catch (e) { console.log('[p010fix] hook ' + hh.n + ' FAIL ' + e); }
  });
  console.log('[p010fix] armed — capture should now save with NO BasicTone/ArcSoft tombstone.');
}, 80);
