// op_force_align_300.js — .300 (BuildId 2217d555) re-pin of the libapsfixup author's op_force_align.js.
// CONFIRM + (interim) FIX the P010 soft/green/crash root: APS reads `com.oplus.aps.platform.output.alignment`
// and on a miss falls to a 0/0 default → align_up(luma,0) = 4GB-garbage chroma → BasicTone/ArcSoft walk off.
//
// .300 RE (this session): the reader is `QcomHardJpegHelper::C2()` (`_ZN18QcomHardJpegHelperC2Ev`), entry
// file-VMA 0x6147a4 (Ghidra 0x7147a4). It calls `getJsonMetadata("…output.alignment")` (string @0x851bb),
// gates on `cmp #0x2` (0x6148d0); HIT → `str w9,[x19,#0x14]` (mOutputAlignmentStride) / `str w8,[x19,#0x18]`
// (mOutputAlignmentScanline); MISS → `stp wzr,wzr,[x19,#0x14]` (0x6149cc) = the 0/0 BUG default. x19 = `this`
// = a0. We hook the ctor and overwrite [this+0x14]/[this+0x18] with non-zero alignment so align_up() behaves.
//
// ⚠️ CAVEAT: a .300 consumer-trace flagged these fields as possibly NOT read on this build (the live driver may
// be the sibling `platform.alignment`+0x10 / a global). The author's fix works on op15ix BuildId 627697fe; on
// .300 VERIFY on-device that forcing these clears the crash. The ROBUST ship interim is libapsfixup
// (apsfixup.cpp, ALREADY .300-pinned: P010_FUNC_OFF 0x4fc25c / GOT 0x689ba8 / DLSYM_GOT 0x1bb67c8) — it patches
// the CONSUMERS regardless of the alignment source. Use this script to CALIBRATE STRIDE_ALIGN/SCANLINE_ALIGN.
//
//   adb shell setenforce 0
//   frida -U -n com.oplus.camera -l op_force_align_300.js
//   >>> take ONE Auto photo; if no 4GB crash + photo sharp/correct → root confirmed + value found <<<
// For the 1280x960 P010 fusion buffer (stride 2560B = 256·10, H 960 = 32·30) 256/32 should be exactly correct.
'use strict';
var STRIDE_ALIGN   = 256;   // [this+0x14] mOutputAlignmentStride   (calibrate: 1→64→256→512→4096)
var SCANLINE_ALIGN = 32;    // [this+0x18] mOutputAlignmentScanline
var SYM = '_ZN18QcomHardJpegHelperC2Ev';   // .300 alignment-reader (QcomHardJpegHelper ctor)
var OFF = 0x6147a4;          // fallback: file-VMA of the ctor entry in .300 libAlgoProcess (2217d555)
var logged = 0;

function resolve(m){
  var a = m.findExportByName(SYM);          // preferred: by name (offset-independent)
  if (a) { console.log('[force-align] resolved '+SYM+' @ '+a); return a; }
  console.log('[force-align] '+SYM+' not exported; using base+0x'+OFF.toString(16)+' (re-verify BuildId 2217d555)');
  return m.base.add(OFF);
}
function arm(){
  var m = Process.findModuleByName('libAlgoProcess.so'); if (!m) return false;
  var bid=''; try{ bid = (m.path||''); }catch(e){}
  Interceptor.attach(resolve(m), {
    onEnter: function (a) { this.obj = a[0]; },
    onLeave: function () {
      try {
        var o = this.obj; if (!o || o.isNull()) return;
        var oldS = o.add(0x14).readU32(), oldL = o.add(0x18).readU32();
        o.add(0x14).writeU32(STRIDE_ALIGN);
        o.add(0x18).writeU32(SCANLINE_ALIGN);
        if (logged < 4) { logged++;
          console.log('[force-align] this='+o+'  was {stride='+oldS+', scanline='+oldL+'}'+
            '  -> {stride='+STRIDE_ALIGN+', scanline='+SCANLINE_ALIGN+'}'+
            ((oldS===0 && oldL===0) ? '   <<< was the 0/0 BUG default' : '')); }
      } catch (e) { console.log('[force-align] err '+e); }
    }
  });
  console.log('[*] op_force_align_300 armed (.300 2217d555) — forcing stride='+STRIDE_ALIGN+' scanline='+SCANLINE_ALIGN+'. Take ONE Auto photo.');
  return true;
}
var poll = setInterval(function(){ if (arm()) clearInterval(poll); }, 150);
console.log('[*] op_force_align_300 loaded (self-arming).');
