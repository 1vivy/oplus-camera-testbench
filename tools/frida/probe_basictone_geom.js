// probe_basictone_geom.js — BasicTone P010 Image geometry vs buffer-extent (off-the-end localizer)
// =============================================================================
// The P010 master crash is BasicTone_OGL::processCore/saveOutImg reading PAST the P010 buffer
// (fault 0x78..00000). Golden A/B proved dma len + gralloc geom + APS descriptor all MATCH OOS↔LOS,
// so the wrong field is the layout-calc geometry IN the Image struct (height/alignedH/stride) vs the
// actual mapped buffer — which no existing probe logs. This dumps it + bounds-checks it.
//
// Image struct (from Ghidra processCore @ libBasicTonePhoto .300, param=uint*):
//   +0x00 width  +0x04 height  +0x1c format(9=P010)  +0x28 stride(rowBytes)  +0x2c rows(loop=rows*3/2)
//   +0x38 dataPtr(pixel VA)    +0xA0 hwBufferHandle
// processCore @ base+0x53a34 (this, Image* src=x1, Image* dst=x2, void*, void*); saveOutImg @ base+0x543a0.
// The crash loop walks rows*3/2 lines at stride from dataPtr → needs stride*rows*1.5 bytes mapped.
//
// RUN: spawn-attach (geometry is read onEnter, before the faulting access):
//   frida -U -f com.oplus.camera -l tools/frida/probe_basictone_geom.js   (then drive MASTER/Pro capture)
// =============================================================================
'use strict';
var MOD = 'libBasicTonePhoto.so';
var OFF_PROCESSCORE = 0x53a34;
var OFF_SAVEOUTIMG   = 0x543a0;

function u32(p, o){ try { return p.add(o).readU32(); } catch (e) { return -1; } }
function ptr64(p, o){ try { return p.add(o).readPointer(); } catch (e) { return ptr(0); } }

function dumpImg(tag, p) {
  if (!p || p.isNull()) { console.log('   ' + tag + ' = NULL'); return; }
  var w = u32(p,0x00), h = u32(p,0x04), fmt = u32(p,0x1c), stride = u32(p,0x28), rows = u32(p,0x2c);
  var data = ptr64(p,0x38), hwbuf = ptr64(p,0xA0);
  var totalRows = Math.floor(rows * 3 / 2);          // NV12/P010 luma+chroma row count
  var need = stride * totalRows;                       // bytes the loop touches from dataPtr
  var rng = null; try { rng = Process.findRangeByAddress(data); } catch (e) {}
  var avail = -1, rbase = '?', rsz = '?';
  if (rng) { rbase = rng.base; rsz = rng.size; try { avail = rng.base.add(rng.size).sub(data).toInt32(); } catch (e) {} }
  var flag = (avail >= 0 && need > avail) ? ('  *** OFF-THE-END by ' + (need - avail) + ' B ***') :
             (avail < 0 ? '  (data VA not in a known range — unmapped/foreign)' : '  [fits]');
  console.log('   ' + tag + ' w=' + w + ' h=' + h + ' fmt=' + fmt + ' stride=' + stride +
    ' rows=' + rows + ' totalRows=' + totalRows +
    '  data=' + data + ' hwbuf=' + hwbuf +
    '  need=' + need + ' mappedAvail=' + avail + ' (range ' + rbase + '+' + rsz + ')' + flag);
  // cross-checks: does h (texture height) == rows (buffer height)? does stride match width*2 (P010=2B/px)?
  if (h !== rows) console.log('      ^ NOTE height(0x04)=' + h + ' != rows(0x2c)=' + rows + ' (alignedH divergence candidate)');
  if (stride !== w * 2) console.log('      ^ NOTE stride=' + stride + ' != width*2=' + (w*2) + ' (P010 stride padding ' + (stride - w*2) + ' B)');
}

function hook(name, off, nimg) {
  var m = Process.findModuleByName(MOD); if (!m) return false;
  try {
    Interceptor.attach(m.base.add(off), {
      onEnter: function (a) {
        console.log('[BT ' + name + '] this=' + a[0]);
        dumpImg('src(x1)', a[1]);
        if (nimg > 1) dumpImg('dst(x2)', a[2]);
      }
    });
    console.log('[hook] ' + name + ' @ ' + m.base.add(off) + ' (' + MOD + '+0x' + off.toString(16) + ')');
    return true;
  } catch (e) { console.log('[hook] ' + name + ' FAIL ' + e); return false; }
}

var armed = false;
var iv = setInterval(function () {
  if (armed) return;
  if (!Process.findModuleByName(MOD)) return;
  armed = true;
  console.log('[geom] ' + MOD + ' loaded base=' + Process.findModuleByName(MOD).base);
  hook('processCore', OFF_PROCESSCORE, 2);
  hook('saveOutImg', OFF_SAVEOUTIMG, 1);
}, 80);
console.log('[geom] armed — polling for ' + MOD + ' (loads on the P010/Pro capture)');
