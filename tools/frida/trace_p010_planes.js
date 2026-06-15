// trace_p010_planes.js — PROBE B (team gralloc-p010-divergence, task #2)  v2
// =============================================================================
// REFRAMED after the lead's early native result + the apsfixup/getPlaneLayout RE:
//
//  * The libui/QTI mapper LOCK reports the CORRECT, HEIGHT-ALIGNED Cb offset
//    (lead: 1920x1440 -> Cb-Y = stride*1472, i.e. Y height-aligned 1440->1472, 32-row).
//    Probe A proved libui transcribes offsetInBytes literally; so the lock side is fine.
//
//  * The BLOB computes its OWN plane layout in APSGrallocUtils::getPlaneLayout:
//        *Cb = luma_base + PlaneLayout.offsetInBytes + component.offsetInBits/8
//    (file 0x12127c, Ghidra 0x22127c — RE'd this session; SAME formula as libui).
//    It reads metadata type 0xf via the held mapper's vtable+0x48. The documented
//    failure is a GARBAGE chroma = align_up(luma, 4GB) (lo32 tiny) that apsfixup repairs.
//
//  THE DECISIVE COMPARISON (what this script captures, per P010 buffer):
//   (A) what the LOCK reports  -> libui getPlaneLayouts / lockPlanes / lockYCbCr:
//       aligned Cb offset + the actual vs aligned height.
//   (B) what the BLOB computes -> APSGrallocUtils::getPlaneLayout: luma_base(in),
//       Cb(out), Cr(out), and Cb-luma. Plus camApsBufferLockPlanes' final descriptor.
//   => If (B)'s Cb-luma == (A)'s aligned offset (stride*1472)  -> blob is correct, look
//      elsewhere. If (B)'s Cb is GARBAGE (align_up 4GB / tiny-lo) or == stride*ACTUAL
//      (unaligned 1440)  -> THAT is the divergence, and we see whether it's a bad
//      luma_base, a bad metadata offsetInBytes, or a getPlaneLayout-fail fallback.
//
// The fix locus this distinguishes: a per-stream GEOMETRY/height param (described height
// passed to the blob / metadata), NOT a mapper or libui port (Probe A already cleared libui).
//
// SAFETY: NATIVE-ONLY (Interceptor.attach on mapper/libui/libnativewindow + libAlgoProcess
// native fns). NO Java.perform / no OCS Java hot paths (project history: those crash this ART).
// Throttled + per-handle deduped. RUN: see .omc/research/probe-b-runguide.md
// =============================================================================
'use strict';

// ── tunables ────────────────────────────────────────────────────────────────
var MAX_LOG_PER_HOOK = 80;
var DEDUP_PER_HANDLE = true;
var HOOK_P010_CROSSCHECK = true; // p010LSB2MSBNeon entry (POST-apsfixup-repair x-check)

// PlaneLayout (aidl::...::common::PlaneLayout) field offsets (Probe A confirmed)
var PL_OFFSET_IN_BYTES = 0x18, PL_SAMPLE_INCR_BITS = 0x20, PL_STRIDE_IN_BYTES = 0x28,
    PL_WIDTH_SAMPLES = 0x30, PL_HEIGHT_SAMPLES = 0x38, PL_TOTAL_SIZE = 0x40, PL_SIZEOF = 0x58;

// libAlgoProcess file offsets (image base 0; frida module.base+off). Ghidra-verified this session.
var OFF_GET_PLANE_LAYOUT = 0x12127c; // APSGrallocUtils::getPlaneLayout(this,buf,lumaBase,&Cb,&Cr)
var OFF_LOCK_PLANES_DESC = 0x1c96f8; // camApsBufferLockPlanes(buf) -> ApsBufferDesc*
var OFF_P010_NEON = 0x4fc094;        // APSFormatConverterNeon::p010LSB2MSBNeon(dst,src,...)

function ts() { return '[' + (Date.now() % 1000000) + ']'; }
function hx(p) { return p ? p.toString() : 'null'; }
function rd64(p, off) { try { return p.add(off).readU64(); } catch (e) { return null; } }

// ── garbage / buffer VA classifiers (mirror apsfixup is_buf/is_garbage) ─────────
//   buffer VA  : hi32 in [0x60,0x7f] AND lo32 >= 0x100000 (real page offset)
//   garbage VA : hi32 in [0x60,0x7f] AND lo32 <  0x100000 (align_up(luma,4GB) etc.)
function vaHiLo(v) { try { return [parseInt(v.shr(32).toString()), v.and(ptr('0xffffffff'))]; } catch (e) { return null; } }
function isBuf(v) { var t = vaHiLo(v); return !!t && t[0] >= 0x60 && t[0] <= 0x7f && t[1].compare(ptr('0x100000')) >= 0; }
function isGarbage(v) { var t = vaHiLo(v); return !!t && t[0] >= 0x60 && t[0] <= 0x7f && t[1].compare(ptr('0x100000')) < 0; }
function isAlignUp4G(luma, chroma) { // chroma == align_up(luma, 4GB): hi=luma.hi+1, lo tiny
  try { if (!isBuf(luma)) return false; if (!chroma.shr(32).equals(luma.shr(32).add(1))) return false;
        return chroma.and(ptr('0xffffffff')).compare(ptr('0x100000')) < 0; } catch (e) { return false; }
}
function readable(v) { try { return !!v && !v.isNull() && Process.findRangeByAddress(v) !== null; } catch (e) { return false; } }
function i32(p, o) { try { return p.add(o).readS32(); } catch (e) { return null; } }

// throttle bookkeeping
var counts = {}, seen = {};
function gate(hook, key) {
  counts[hook] = (counts[hook] || 0) + 1;
  if (counts[hook] > MAX_LOG_PER_HOOK) return false;
  if (DEDUP_PER_HANDLE && key) { var sk = hook + '|' + key; if (seen[sk]) return false; seen[sk] = true; }
  return true;
}

function findExport(modNames, exactOrSubstr, isSubstr) {
  var mods = Array.isArray(modNames) ? modNames : [modNames];
  for (var i = 0; i < mods.length; i++) {
    var m = null; try { m = Process.findModuleByName(mods[i]); } catch (e) {}
    if (!m) continue;
    if (!isSubstr) { try { var e = m.findExportByName(exactOrSubstr); if (e) return { addr: e, mod: m.name }; } catch (e2) {} }
    else { var exps; try { exps = m.enumerateExports(); } catch (e3) { exps = []; }
      for (var j = 0; j < exps.length; j++) if (exps[j].name.indexOf(exactOrSubstr) !== -1) return { addr: exps[j].address, mod: m.name, name: exps[j].name }; }
  }
  if (!isSubstr) { try { var g = Module.getGlobalExportByName(exactOrSubstr); if (g) return { addr: g, mod: '?' }; } catch (e4) {} }
  return null;
}

// region scanner (from op_planelayout_probe.js) — flags luma/chroma pairs + stride ints
function dumpRegion(label, p, words) {
  if (!readable(p)) return;
  console.log('    ' + label + ' @' + hx(p) + ':');
  for (var i = 0; i < words; i++) {
    var v; try { v = p.add(i * 8).readPointer(); } catch (e) { break; }
    var off = i * 8, nxt = null; try { nxt = p.add(off + 8).readPointer(); } catch (e2) {}
    if (isBuf(v) && nxt && isAlignUp4G(v, nxt)) {
      var so = i32(p, off + 0x10), so2 = i32(p, off + 0x14);
      console.log('      +0x' + off.toString(16) + ' luma=' + hx(v) + '  +0x' + (off + 8).toString(16) +
                  ' chroma=' + hx(nxt) + '   <<<<< REAL BUG: chroma=align_up(luma,4GB) [next ints: ' + so + ',' + so2 + ']');
    } else if (isBuf(v) && nxt && isGarbage(nxt)) {
      console.log('      +0x' + off.toString(16) + ' luma=' + hx(v) + '  +0x' + (off + 8).toString(16) + ' chroma=' + hx(nxt) + '   <<<<< chroma garbage');
    } else if (isBuf(v) && nxt && isBuf(nxt)) {
      console.log('      +0x' + off.toString(16) + ' luma=' + hx(v) + '  +0x' + (off + 8).toString(16) + ' chroma=' + hx(nxt) +
                  '   (both buf; delta=' + nxt.sub(v).toString() + ')');
    } else if (isBuf(v)) {
      console.log('      +0x' + off.toString(16) + ' = ' + hx(v) + '   (buf ptr)');
    } else if (isGarbage(v)) {
      console.log('      +0x' + off.toString(16) + ' = ' + hx(v) + '   <<<<< GARBAGE ptr (ptr-band hi, tiny lo)');
    } else {
      var a = i32(p, off), b = i32(p, off + 4);
      if (a !== null && ((a >= 64 && a <= 30000) || (b >= 64 && b <= 30000)))
        console.log('      +0x' + off.toString(16) + ' int32 = ' + a + ' , ' + b + '   (stride/scanline/height?)');
    }
  }
}

// decode a std::vector<PlaneLayout>* + print height-alignment verdict
function dumpPlaneLayouts(tag, key, vecPtr) {
  if (!vecPtr || vecPtr.isNull()) return;
  var begin, end; try { begin = vecPtr.readPointer(); end = vecPtr.add(8).readPointer(); } catch (e) { return; }
  if (!begin || begin.isNull() || !end || end.isNull()) return;
  var span = end.sub(begin).toInt32(); if (span <= 0 || span > PL_SIZEOF * 8) return;
  var n = Math.floor(span / PL_SIZEOF); if (n < 1) return;
  if (!gate(tag, key)) return;
  var planes = [];
  for (var i = 0; i < n; i++) {
    var p = begin.add(i * PL_SIZEOF);
    planes.push({ off: rd64(p, PL_OFFSET_IN_BYTES), stride: rd64(p, PL_STRIDE_IN_BYTES),
                  w: rd64(p, PL_WIDTH_SAMPLES), h: rd64(p, PL_HEIGHT_SAMPLES), total: rd64(p, PL_TOTAL_SIZE) });
  }
  var line = ts() + ' [PLANE_LAYOUTS:' + tag + '] handle=' + key + ' planes=' + n;
  for (var k = 0; k < planes.length; k++) { var pl = planes[k];
    line += '\n    plane[' + k + '] off=' + (pl.off ? pl.off.toString() : '?') + ' stride=' + (pl.stride ? pl.stride.toString() : '?') +
            ' w=' + (pl.w ? pl.w.toString() : '?') + ' h=' + (pl.h ? pl.h.toString() : '?') + ' total=' + (pl.total ? pl.total.toString() : '?'); }
  if (planes.length >= 2 && planes[0].stride && planes[0].h && planes[1].off !== null) {
    var stride = planes[0].stride.toNumber(), actualH = planes[0].h.toNumber(), chromaOff = planes[1].off.toNumber();
    var contigActual = stride * actualH;             // naive (unaligned) contiguous offset
    var alignedH = stride ? Math.round(chromaOff / stride) : 0; // implied aligned height
    var gap = chromaOff - contigActual;
    line += '\n    >>> chromaOffset=' + chromaOff + '  stride=' + stride + '  actualH=' + actualH +
            '  => impliedAlignedH=' + alignedH + (alignedH > actualH ? ' (HEIGHT-ALIGN PADDING +' + (alignedH - actualH) + ' rows; gap=' + gap + ' B)' :
            (gap === 0 ? ' (contiguous, no padding)' : ' (gap=' + gap + ' B)'));
  }
  console.log(line);
}

// =============================================================================
// (A) WHAT THE LOCK REPORTS — ground truth (aligned Cb)
// =============================================================================
(function () {
  var EXACT = '_ZN7android19GraphicBufferMapper15getPlaneLayoutsEPK13native_handlePNSt3__16vectorIN4aidl7android8hardware8graphics6common11PlaneLayoutENS4_9allocatorISB_EEEE';
  var r = findExport(['libui.so'], EXACT, false) || findExport(['libui.so'], 'GraphicBufferMapper15getPlaneLayoutsEPK13native_handleP', true);
  if (!r) { console.log('[hook] getPlaneLayouts(out*) NOT found'); return; }
  Interceptor.attach(r.addr, { onEnter: function (a) { this.h = a[1]; this.out = a[2]; },
    onLeave: function () { dumpPlaneLayouts('GBM.getPlaneLayouts', hx(this.h), this.out); } });
  console.log('[hook] (A) GraphicBufferMapper::getPlaneLayouts @ ' + r.addr + ' (' + r.mod + ')');
})();

(function () {
  var EXACT = '_ZN7android8gralloc418decodePlaneLayoutsERKNS_8hardware8hidl_vecIhEEPNSt3__16vectorIN4aidl7android8hardware8graphics6common11PlaneLayoutENS6_9allocatorISD_EEEE';
  var r = findExport(['libgralloctypes.so'], EXACT, false) || findExport(['libgralloctypes.so'], 'gralloc418decodePlaneLayoutsE', true);
  if (!r) { console.log('[hook] decodePlaneLayouts NOT found (ok if Gralloc5-only path)'); return; }
  Interceptor.attach(r.addr, { onEnter: function (a) { this.out = a[1]; },
    onLeave: function () { dumpPlaneLayouts('gralloc4.decode', 'enc', this.out); } });
  console.log('[hook] (A) gralloc4::decodePlaneLayouts @ ' + r.addr + ' (' + r.mod + ')');
})();

// AHardwareBuffer_lockPlanes(buf,usage,fence,rect,Planes* out)  out=a4. Planes: u32 planeCount; plane[i]@+8+16i={data;pixStride;rowStride}.
(function () {
  var r = findExport(['libnativewindow.so'], 'AHardwareBuffer_lockPlanes', false);
  if (!r) { console.log('[hook] AHardwareBuffer_lockPlanes NOT found'); return; }
  Interceptor.attach(r.addr, { onEnter: function (a) { this.buf = a[0]; this.out = a[4]; },
    onLeave: function (ret) {
      if (!gate('AHB.lockPlanes', hx(this.buf))) return;
      var line = ts() + ' [lockPlanes] buf=' + hx(this.buf) + ' rc=' + ret.toInt32();
      try { var pc = this.out.readU32(); line += ' planeCount=' + pc; var datas = [], rs0 = null;
        for (var i = 0; i < Math.min(pc, 3); i++) { var base = this.out.add(8 + i * 16); var d = base.readPointer(); var rs = base.add(12).readU32();
          datas.push(d); if (i === 0) rs0 = rs;
          line += '\n    plane[' + i + '] data=' + hx(d) + ' pixStride=' + base.add(8).readU32() + ' rowStride=' + rs; }
        if (datas.length >= 2) line += '\n    >>> (Cb-Y)=' + datas[1].sub(datas[0]).toString() + ' B ; rowStride[0]=' + rs0 +
          '  => impliedAlignedH=' + (rs0 ? Math.round(datas[1].sub(datas[0]).toNumber() / rs0) : '?') + ' (compare to actualH from PLANE_LAYOUTS)';
      } catch (e) { line += ' <out read err: ' + e + '>'; }
      console.log(line); } });
  console.log('[hook] (A) AHardwareBuffer_lockPlanes @ ' + r.addr + ' (' + r.mod + ')');
})();

(function () {
  var EXACT = '_ZN7android19GraphicBufferMapper9lockYCbCrEPK13native_handlejRKNS_4RectEP13android_ycbcr';
  var r = findExport(['libui.so'], EXACT, false) || findExport(['libui.so'], 'GraphicBufferMapper9lockYCbCrEPK13native_handlej', true);
  if (!r) { console.log('[hook] GBM::lockYCbCr NOT found (ok if consumer uses lockPlanes)'); return; }
  Interceptor.attach(r.addr, { onEnter: function (a) { this.h = a[1]; this.out = a[4]; },
    onLeave: function (ret) {
      if (!gate('GBM.lockYCbCr', hx(this.h))) return;
      var line = ts() + ' [lockYCbCr] handle=' + hx(this.h) + ' rc=' + ret.toInt32();
      try { var y = this.out.readPointer(), cb = this.out.add(8).readPointer(), cr = this.out.add(16).readPointer();
        var ys = this.out.add(24).readU64(), cs = this.out.add(32).readU64(), step = this.out.add(40).readU32();
        line += '\n    y=' + hx(y) + ' cb=' + hx(cb) + ' cr=' + hx(cr) + ' ystride=' + ys.toString() + ' cstride=' + cs.toString() + ' chroma_step=' + step;
        if (y && cb && !y.isNull() && !cb.isNull()) line += '\n    >>> (cb-y)=' + cb.sub(y).toString() + ' B ; ystride=' + ys.toString() +
          '  => impliedAlignedH=' + (ys.toNumber() ? Math.round(cb.sub(y).toNumber() / ys.toNumber()) : '?');
      } catch (e) { line += ' <out read err: ' + e + '>'; }
      console.log(line); } });
  console.log('[hook] (A) GraphicBufferMapper::lockYCbCr @ ' + r.addr + ' (' + r.mod + ')');
})();

// =============================================================================
// (B) WHAT THE BLOB COMPUTES — the decisive producer
// =============================================================================
// B1. APSGrallocUtils::getPlaneLayout(this, buf, lumaBase, &Cb, &Cr)  [file 0x12127c]
//     Body: *Cb = lumaBase + PlaneLayout.offsetInBytes + component.offsetInBits/8 ; same for Cr.
//     x0=this, x1=buf, x2=lumaBase(IN), x3=&Cb(OUT), x4=&Cr(OUT). Returns 0 ok / -1 fail.
function hookGetPlaneLayout() {
  var m = Process.findModuleByName('libAlgoProcess.so'); if (!m) return false;
  Interceptor.attach(m.base.add(OFF_GET_PLANE_LAYOUT), {
    onEnter: function (a) { this.buf = a[1]; this.lumaBase = a[2]; this.cbOut = a[3]; this.crOut = a[4]; },
    onLeave: function (ret) {
      if (!gate('APSGrallocUtils::getPlaneLayout', hx(this.buf) + '|' + hx(this.lumaBase))) return;
      var cb = null, cr = null;
      try { cb = this.cbOut.readPointer(); } catch (e) {}
      try { cr = this.crOut.readPointer(); } catch (e) {}
      var line = ts() + ' [BLOB getPlaneLayout] ret=' + ret.toInt32() + (ret.toInt32() < 0 ? ' (FAIL!)' : '') +
                 ' buf=' + hx(this.buf) + '\n    lumaBase(in)=' + hx(this.lumaBase) + '  Cb(out)=' + hx(cb) + '  Cr(out)=' + hx(cr);
      if (cb && this.lumaBase && !cb.isNull() && !this.lumaBase.isNull()) {
        var verdict = isGarbage(cb) ? 'GARBAGE chroma (ptr-band hi, tiny lo)' :
                      (isAlignUp4G(this.lumaBase, cb) ? 'GARBAGE chroma == align_up(luma,4GB)' : 'in-buffer');
        line += '\n    >>> Cb-lumaBase=' + cb.sub(this.lumaBase).toString() + ' B   [' + verdict + ']' +
                '  (compare to (A) lock aligned offset stride*alignedH; if equal -> blob correct, garbage is elsewhere)';
      }
      console.log(line);
    }
  });
  console.log('[hook] (B) APSGrallocUtils::getPlaneLayout @ ' + m.base.add(OFF_GET_PLANE_LAYOUT) + ' (libAlgoProcess +0x' + OFF_GET_PLANE_LAYOUT.toString(16) + ')');
  return true;
}

// B2. camApsBufferLockPlanes(buf) -> ApsBufferDesc*  [file 0x1c96f8]. Returns the filled descriptor;
//     plane ptrs land ~ret+0x28. Dump x0(in) + the descriptor; the region scanner flags the luma/chroma pair.
function hookLockPlanesDesc() {
  var m = Process.findModuleByName('libAlgoProcess.so'); if (!m) return false;
  Interceptor.attach(m.base.add(OFF_LOCK_PLANES_DESC), {
    onEnter: function (a) { this.x0 = a[0]; },
    onLeave: function (ret) {
      if (!gate('camApsBufferLockPlanes', hx(this.x0))) return;
      console.log(ts() + ' [BLOB camApsBufferLockPlanes] in(x0)=' + hx(this.x0) + ' descriptor(ret)=' + hx(ret));
      dumpRegion('x0', this.x0, 12);
      dumpRegion('DESC(ret)', ret, 24);
      console.log('      ^ luma/chroma pair = the ApsBufferPlanes the algo consumes, BEFORE the p010/ARC apsfixup repair.');
    }
  });
  console.log('[hook] (B) camApsBufferLockPlanes @ ' + m.base.add(OFF_LOCK_PLANES_DESC) + ' (libAlgoProcess +0x' + OFF_LOCK_PLANES_DESC.toString(16) + ')');
  return true;
}

function armBlobHooks() { var ok = true; if (!hookGetPlaneLayout()) ok = false; if (!hookLockPlanesDesc()) ok = false;
  if (HOOK_P010_CROSSCHECK && ok) hookP010(); return ok; }
function hookP010() {
  var m = Process.findModuleByName('libAlgoProcess.so'); if (!m) return false;
  Interceptor.attach(m.base.add(OFF_P010_NEON), { onEnter: function (a) {
    if (!gate('p010LSB2MSBNeon', null)) return;
    console.log(ts() + ' [p010LSB2MSBNeon] dst=' + hx(a[0]) + ' src=' + hx(a[1]) + ' a2=' + hx(a[2]) + ' a3=' + hx(a[3]) +
                ' a4=' + hx(a[4]) + ' a5=' + hx(a[5]) + '  (POST-apsfixup-repair; cross-check)'); } });
  console.log('[hook] (B-xcheck) p010LSB2MSBNeon @ ' + m.base.add(OFF_P010_NEON));
  return true;
}
if (!armBlobHooks()) { console.log('[hook] waiting for libAlgoProcess.so to load…');
  var iv = setInterval(function () { if (armBlobHooks()) clearInterval(iv); }, 400); }

// =============================================================================
// (D) attribution — QtiMapper5::getMetadata: who asks for which standard metadata?
//     a2 = AIMapper_MetadataType{const char* name; int64 value}. Log WIDTH(2)/HEIGHT(3)/
//     PLANE_LAYOUTS(14)/CROP-or-vendor(15)/5 + caller module, so we see the blob's metadata reads.
// =============================================================================
(function () {
  var EXACT = '_ZN7stablec6vendor3qti8hardware7display7mapper510QtiMapper511getMetadataEPK13native_handle21AIMapper_MetadataTypePvm';
  var r = findExport(['mapper.qti.so'], EXACT, false) || findExport(['mapper.qti.so'], 'QtiMapper511getMetadataE', true);
  if (!r) { console.log('[hook] QtiMapper5::getMetadata NOT found'); return; }
  var WANT = { 2: 'WIDTH', 3: 'HEIGHT', 5: 'PIXEL_FORMAT_REQUESTED', 14: 'PLANE_LAYOUTS', 15: 'CROP/vendor' };
  Interceptor.attach(r.addr, { onEnter: function (a) {
    var val = null; try { val = a[2].add(8).readS64().toNumber(); } catch (e) { return; }
    if (!(val in WANT)) return;
    var callerMod = '?'; try { var cm = Process.findModuleByAddress(this.returnAddress); if (cm) callerMod = cm.name; } catch (e) {}
    if (!gate('getMetadata', callerMod + '|' + val + '|' + hx(a[0]))) return;
    console.log(ts() + ' [getMetadata ' + WANT[val] + '(' + val + ')] handle=' + hx(a[0]) + ' caller=' + callerMod + ' ra=' + hx(this.returnAddress)); } });
  console.log('[hook] (D) QtiMapper5::getMetadata @ ' + r.addr + ' (' + r.mod + ', metadata attribution)');
})();

console.log(ts() + ' trace_p010_planes.js v2 armed — NEED A REAL P010 CAPTURE to fire the blob hooks.' +
            '\n   Take ONE Photo capture, then ONE Master/Pro capture (JPG+RAW). NATIVE-only hooks.');
