// trace_gralloc_p010_chain.js — Part C: the full P010 alloc -> map -> lock chain (SYMMETRIC)
// =============================================================================
// PURPOSE: walk the P010 buffer life on OOS so the LOS diff has a per-stage expected value at
// every node of the gralloc/P010 chain (root-cause libapsfixup Family-I, even where irreducible).
// The chain (OOS-OPEN-ITEMS-AND-DIFF-PLAN.md Part C):
//
//   (1) ALLOCATE  -> who requests the P010 buffer + with what usage/format?
//        AHardwareBuffer_allocate(desc,*) / gralloc4 IAllocator::allocate
//        -> log usage bits + PixelFormat (looking for YCBCR_P010 = 0x36).
//   (2) MAP/LAYOUT -> QtiMapper5::getMetadata(PLANE_LAYOUTS) / GraphicBufferMapper::getPlaneLayouts
//        (mapper.qti.so / libui.so — resolved addrs/method reused from trace_p010_planes.js)
//        -> log per-plane offset/stride/size + the CONTIGUITY test (Cr-Y vs stride*height).
//   (3) LOCK (correlate) -> AHardwareBuffer_lockPlanes: the realized plane data ptrs + (Cb-Y).
//
// THE CONTIGUITY DECISION is the surviving divergence (the others are RULED OUT in the doc's
// matrix: usage-bit identical, mapper blob byte-identical, namespace resolves in sphal both sides).
// OOS forces contiguous/page-aligned chroma (Cr = Y + stride*alignedH); LOS does not, and the
// byte-identical blob (which expects contiguous) then walks off the dmabuf -> libapsfixup repairs.
//
// THE ONE COMPARABLE RECORD per stage/buffer (what diff_oos_los.py reads):
//   [GP010 alloc] usage=0x.. format=0x..(<name>)  width=.. height=..
//   [GP010 layout:<src>] handle=.. planes=N  plane[i] off/stride/w/h/total  >>> contiguous=<Y|N> impliedAlignedH=..
//   [GP010 lock] buf=.. planeCount=N  (Cb-Y)=.. rowStride=.. >>> impliedAlignedH=..
//
// REUSED RESOLUTIONS (from trace_p010_planes.js v2, all confirmed this session):
//   * GraphicBufferMapper::getPlaneLayouts  (libui.so, mangled symbol below)
//   * QtiMapper5::getMetadata               (mapper.qti.so, mangled symbol below; metadata-type val @ a2+8)
//   * AHardwareBuffer_lockPlanes            (libnativewindow.so, out=a4, planeCount@+0, plane[i]@+8+16i)
//   * PlaneLayout field offsets (PL_*), AIMapper_MetadataType PLANE_LAYOUTS=14.
//
// SAFETY / RUNTIME MODEL:
//   * ATTACH ONLY — never spawn. Runs APP-side in com.oplus.camera (libAlgoProcess loaded).
//   * NATIVE-ONLY: NO Java.perform / no OCS Java hot paths (project history: those crash this ART —
//     see trace_p010_planes.js header). All hooks are on gralloc/mapper/libui/libnativewindow exports.
//   * Defensive try/catch on every memory read; throttled + per-handle deduped.
//   * Poll-until-loaded for libAlgoProcess.so (the gate: P010 fires only on real photo/master capture).
//   * SYMMETRIC: identical script + parser OOS (now) and LOS (later) for the D1 P010 diff.
//   * HOST-ONLY AUTHORING: do NOT run from the host harness; another process owns the device.
//
// RUN (on stock, app at preview; take ONE Photo + ONE Master/Pro capture to fire the P010 path):
//   P=$(adb shell 'su -c "pidof com.oplus.camera"' | tr -d '\r')
//   frida -U -p "$P" -l tools/frida/trace_gralloc_p010_chain.js > /tmp/gralloc_p010_chain.txt
// =============================================================================
'use strict';

// ── tunables ────────────────────────────────────────────────────────────────
var MAX_LOG_PER_HOOK = 120;
var DEDUP_PER_HANDLE = true;
var GATE_MOD = 'libAlgoProcess.so';   // poll-gate: co-loads with the real P010 capture path

// PlaneLayout (aidl::...::common::PlaneLayout) field offsets (Probe A confirmed; same as trace_p010_planes)
var PL_OFFSET_IN_BYTES = 0x18, PL_SAMPLE_INCR_BITS = 0x20, PL_STRIDE_IN_BYTES = 0x28,
    PL_WIDTH_SAMPLES = 0x30, PL_HEIGHT_SAMPLES = 0x38, PL_TOTAL_SIZE = 0x40, PL_SIZEOF = 0x58;

// AHardwareBuffer_Desc layout (NDK, stable ABI): u32 width; u32 height; u32 layers; u32 format;
//   u64 usage; u32 stride; u32 rfu0; u64 rfu1;   (format @ +0x0c, usage @ +0x10)
var AHBDESC_WIDTH = 0x00, AHBDESC_HEIGHT = 0x04, AHBDESC_FORMAT = 0x0c, AHBDESC_USAGE = 0x10;

// AIDL graphics PixelFormat values of interest (android::PixelFormat / AHARDWAREBUFFER_FORMAT)
var PIXFMT = {
  0x36: 'YCBCR_P010',           // the target
  0x23: 'YCbCr_420_888',
  0x21: 'BLOB',
  0x100: 'IMPLEMENTATION_DEFINED',
  0x1: 'RGBA_8888',
  0x25: 'RAW10',
  0x20: 'RAW16'
};
function fmtName(f) { return PIXFMT[f] !== undefined ? PIXFMT[f] : 'fmt_0x' + (f >>> 0).toString(16); }

var META_PLANE_LAYOUTS = 14;     // AIMapper_StandardMetadataType::PLANE_LAYOUTS

function ts() { return '[' + (Date.now() % 1000000) + ']'; }
function hx(p) { return p ? p.toString() : 'null'; }
function rd64(p, off) { try { return p.add(off).readU64(); } catch (e) { return null; } }
function readable(v) { try { return !!v && !v.isNull() && Process.findRangeByAddress(v) !== null; } catch (e) { return false; } }

// throttle + dedup
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

// decode a std::vector<PlaneLayout>* and print the contiguity verdict (the C-stage checkpoint)
function dumpPlaneLayouts(tag, key, vecPtr) {
  if (!vecPtr || vecPtr.isNull()) return;
  var begin, end; try { begin = vecPtr.readPointer(); end = vecPtr.add(8).readPointer(); } catch (e) { return; }
  if (!begin || begin.isNull() || !end || end.isNull()) return;
  var span; try { span = end.sub(begin).toInt32(); } catch (e2) { return; }
  if (span <= 0 || span > PL_SIZEOF * 8) return;
  var n = Math.floor(span / PL_SIZEOF); if (n < 1) return;
  if (!gate(tag, key)) return;
  var planes = [];
  for (var i = 0; i < n; i++) {
    var p = begin.add(i * PL_SIZEOF);
    planes.push({ off: rd64(p, PL_OFFSET_IN_BYTES), stride: rd64(p, PL_STRIDE_IN_BYTES),
                  w: rd64(p, PL_WIDTH_SAMPLES), h: rd64(p, PL_HEIGHT_SAMPLES), total: rd64(p, PL_TOTAL_SIZE) });
  }
  var line = ts() + ' [GP010 layout:' + tag + '] handle=' + key + ' planes=' + n;
  for (var k = 0; k < planes.length; k++) { var pl = planes[k];
    line += '\n    plane[' + k + '] off=' + (pl.off ? pl.off.toString() : '?') + ' stride=' + (pl.stride ? pl.stride.toString() : '?') +
            ' w=' + (pl.w ? pl.w.toString() : '?') + ' h=' + (pl.h ? pl.h.toString() : '?') + ' total=' + (pl.total ? pl.total.toString() : '?'); }
  // CONTIGUITY TEST: chroma offset vs stride*actualH. OOS = page/height-aligned padding (contiguous one-alloc);
  // the implied aligned height tells us OOS's alignment (e.g. 1440 -> 1472, 32-row).
  if (planes.length >= 2 && planes[0].stride && planes[0].h && planes[1].off !== null) {
    var stride = planes[0].stride.toNumber(), actualH = planes[0].h.toNumber(), chromaOff = planes[1].off.toNumber();
    var contigActual = stride * actualH;
    var alignedH = stride ? Math.round(chromaOff / stride) : 0;
    var gap = chromaOff - contigActual;
    var contiguous = (chromaOff >= contigActual && gap >= 0 && gap < stride * 64); // within a sane alignment pad
    line += '\n    >>> contiguous=' + (contiguous ? 'Y' : 'N') + ' chromaOffset=' + chromaOff +
            ' stride=' + stride + ' actualH=' + actualH + ' impliedAlignedH=' + alignedH +
            (alignedH > actualH ? ' (HEIGHT-ALIGN PADDING +' + (alignedH - actualH) + ' rows; gap=' + gap + ' B)' :
             (gap === 0 ? ' (contiguous, no padding)' : ' (gap=' + gap + ' B)')) +
            '  [OOS expect Y/aligned; LOS diff = N/unaligned -> apsfixup Family-I repair]';
  }
  console.log(line);
}

// =============================================================================
// (1) ALLOCATE — usage bits + PixelFormat (looking for YCBCR_P010)
// =============================================================================
// (1a) AHardwareBuffer_allocate(const AHardwareBuffer_Desc* desc, AHardwareBuffer** out)
(function () {
  var r = findExport(['libnativewindow.so'], 'AHardwareBuffer_allocate', false);
  if (!r) { console.log('[hook] (1a) AHardwareBuffer_allocate NOT found'); return; }
  Interceptor.attach(r.addr, {
    onEnter: function (a) { this.desc = a[0]; },
    onLeave: function (ret) {
      if (!this.desc || this.desc.isNull()) return;
      var fmt = null, usage = null, w = null, h = null;
      try { fmt = this.desc.add(AHBDESC_FORMAT).readU32(); } catch (e) {}
      try { usage = this.desc.add(AHBDESC_USAGE).readU64(); } catch (e) {}
      try { w = this.desc.add(AHBDESC_WIDTH).readU32(); } catch (e) {}
      try { h = this.desc.add(AHBDESC_HEIGHT).readU32(); } catch (e) {}
      var isP010 = (fmt === 0x36);
      if (!gate('AHB.allocate', (fmt) + '|' + (usage ? usage.toString() : '?') + '|' + w + 'x' + h)) return;
      console.log(ts() + ' [GP010 alloc] via=AHardwareBuffer_allocate rc=' + ret.toInt32() +
                  ' format=0x' + (fmt >>> 0).toString(16) + '(' + fmtName(fmt) + ')' +
                  ' usage=0x' + (usage ? usage.toString(16) : '?') +
                  ' width=' + w + ' height=' + h +
                  (isP010 ? '   <<<<< YCBCR_P010 ALLOCATE (the chain target)' : ''));
    }
  });
  console.log('[hook] (1a) AHardwareBuffer_allocate @ ' + r.addr + ' (' + r.mod + ')');
})();

// (1b) gralloc4 IAllocator::allocate — try the QTI/AIDL allocator entry by substring. The descriptor
//      encoding differs across HAL versions, so we log the raw call + try to surface a P010 format int
//      from the first few args (best-effort); the AHB path above is the primary, named, stable signal.
(function () {
  var cands = [
    { mods: ['android.hardware.graphics.allocator-V1-ndk_platform.so', 'libgralloctypes.so', 'vendor.qti.hardware.display.allocator-service'], sub: 'IAllocator', isSub: true },
    { mods: ['gralloc.qti.so', 'mapper.qti.so'], sub: 'allocate', isSub: true }
  ];
  var r = null;
  for (var i = 0; i < cands.length && !r; i++) r = findExport(cands[i].mods, cands[i].sub, cands[i].isSub);
  if (!r) { console.log('[hook] (1b) IAllocator::allocate NOT found (ok — AHardwareBuffer_allocate is the primary alloc signal)'); return; }
  try {
    Interceptor.attach(r.addr, {
      onEnter: function (a) {
        if (!gate('IAllocator.allocate', hx(a[1]))) return;
        // descriptor is HAL-encoded; we cannot statically guarantee the format field position across
        // versions, so we log the call site + descriptor ptr only (NOT a fabricated format read).
        console.log(ts() + ' [GP010 alloc] via=' + (r.name || 'IAllocator::allocate') + ' descriptor=' + hx(a[1]) +
                    ' count=' + (function () { try { return a[2].toInt32(); } catch (e) { return '?'; } })() +
                    '   (format not statically decoded for this HAL encoding — see AHB.allocate for fmt/usage)');
      }
    });
    console.log('[hook] (1b) IAllocator::allocate @ ' + r.addr + ' (' + r.mod + (r.name ? ', ' + r.name : '') + ')');
  } catch (e) { console.log('[hook] (1b) IAllocator::allocate attach FAIL: ' + e); }
})();

// =============================================================================
// (2) MAP / LAYOUT — getPlaneLayouts (libui) + QtiMapper5::getMetadata (mapper.qti)
// =============================================================================
// (2a) GraphicBufferMapper::getPlaneLayouts(handle, out*) — out=a2 (reused from trace_p010_planes)
(function () {
  var EXACT = '_ZN7android19GraphicBufferMapper15getPlaneLayoutsEPK13native_handlePNSt3__16vectorIN4aidl7android8hardware8graphics6common11PlaneLayoutENS4_9allocatorISB_EEEE';
  var r = findExport(['libui.so'], EXACT, false) || findExport(['libui.so'], 'GraphicBufferMapper15getPlaneLayoutsEPK13native_handleP', true);
  if (!r) { console.log('[hook] (2a) getPlaneLayouts NOT found'); return; }
  Interceptor.attach(r.addr, { onEnter: function (a) { this.h = a[1]; this.out = a[2]; },
    onLeave: function () { dumpPlaneLayouts('GBM.getPlaneLayouts', hx(this.h), this.out); } });
  console.log('[hook] (2a) GraphicBufferMapper::getPlaneLayouts @ ' + r.addr + ' (' + r.mod + ')');
})();

// (2b) QtiMapper5::getMetadata(handle, AIMapper_MetadataType{name,value}, out, size) — when the asked
//      metadata is PLANE_LAYOUTS(14) the out is the std::vector<PlaneLayout> we decode; else just attribute.
(function () {
  var EXACT = '_ZN7stablec6vendor3qti8hardware7display7mapper510QtiMapper511getMetadataEPK13native_handle21AIMapper_MetadataTypePvm';
  var r = findExport(['mapper.qti.so'], EXACT, false) || findExport(['mapper.qti.so'], 'QtiMapper511getMetadataE', true);
  if (!r) { console.log('[hook] (2b) QtiMapper5::getMetadata NOT found'); return; }
  var WANT = { 2: 'WIDTH', 3: 'HEIGHT', 5: 'PIXEL_FORMAT_REQUESTED', 14: 'PLANE_LAYOUTS', 15: 'CROP/vendor' };
  // Arg indexing REUSED VERBATIM from trace_p010_planes.js (proven on-device): handle=a[0],
  // the metadata-type value is read at a[2].add(8) (the AIMapper_MetadataType.value field), and
  // the out buffer (Pv, 4th param) = a[3] — the std::vector<PlaneLayout> we decode for PLANE_LAYOUTS.
  Interceptor.attach(r.addr, {
    onEnter: function (a) {
      this.h = a[0]; this.out = a[3]; this.val = null;
      try { this.val = a[2].add(8).readS64().toNumber(); } catch (e) {}
    },
    onLeave: function () {
      if (this.val === null || !(this.val in WANT)) return;
      var callerMod = '?'; try { var cm = Process.findModuleByAddress(this.returnAddress); if (cm) callerMod = cm.name; } catch (e) {}
      if (!gate('QtiMapper5.getMetadata', callerMod + '|' + this.val + '|' + hx(this.h))) return;
      console.log(ts() + ' [GP010 meta ' + WANT[this.val] + '(' + this.val + ')] handle=' + hx(this.h) +
                  ' caller=' + callerMod);
      if (this.val === META_PLANE_LAYOUTS) dumpPlaneLayouts('QtiMapper5.getMetadata', hx(this.h), this.out);
    }
  });
  console.log('[hook] (2b) QtiMapper5::getMetadata @ ' + r.addr + ' (' + r.mod + ', PLANE_LAYOUTS decode + attribution)');
})();

// =============================================================================
// (3) LOCK (correlate) — AHardwareBuffer_lockPlanes: realized plane ptrs + (Cb-Y) cross-check
// =============================================================================
(function () {
  var r = findExport(['libnativewindow.so'], 'AHardwareBuffer_lockPlanes', false);
  if (!r) { console.log('[hook] (3) AHardwareBuffer_lockPlanes NOT found'); return; }
  Interceptor.attach(r.addr, { onEnter: function (a) { this.buf = a[0]; this.out = a[4]; },
    onLeave: function (ret) {
      if (!gate('AHB.lockPlanes', hx(this.buf))) return;
      var line = ts() + ' [GP010 lock] buf=' + hx(this.buf) + ' rc=' + ret.toInt32();
      try {
        var pc = this.out.readU32(); line += ' planeCount=' + pc;
        var datas = [], rs0 = null;
        for (var i = 0; i < Math.min(pc, 3); i++) {
          var base = this.out.add(8 + i * 16);
          var d = base.readPointer(); var rs = base.add(12).readU32();
          datas.push(d); if (i === 0) rs0 = rs;
          line += '\n    plane[' + i + '] data=' + hx(d) + ' pixStride=' + base.add(8).readU32() + ' rowStride=' + rs;
        }
        if (datas.length >= 2) {
          var cbY = datas[1].sub(datas[0]);
          line += '\n    >>> (Cb-Y)=' + cbY.toString() + ' B ; rowStride[0]=' + rs0 +
                  ' => impliedAlignedH=' + (rs0 ? Math.round(cbY.toNumber() / rs0) : '?') +
                  '  (correlate to (2) layout contiguity; OOS contiguous one-alloc, LOS the divergence)';
        }
      } catch (e) { line += ' <out read err: ' + e + '>'; }
      console.log(line);
    } });
  console.log('[hook] (3) AHardwareBuffer_lockPlanes @ ' + r.addr + ' (' + r.mod + ')');
})();

// =============================================================================
// arm — poll-gate on libAlgoProcess (P010 fires only on real photo/master capture)
// =============================================================================
function gateLoaded() {
  try { var m = Process.findModuleByName(GATE_MOD); if (m && m.base) return true; } catch (e) {}
  try { var arr = Process.enumerateModules();
    for (var i = 0; i < arr.length; i++) if (arr[i].name.indexOf('libAlgoProcess') >= 0) return true; } catch (e2) {}
  return false;
}
(function () {
  if (gateLoaded()) { console.log(ts() + ' ' + GATE_MOD + ' already loaded — P010 hooks live'); }
  else {
    console.log(ts() + ' ' + GATE_MOD + ' not loaded yet — gralloc hooks are armed now; capture loads the gate.');
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (gateLoaded()) { clearInterval(iv); console.log(ts() + ' ' + GATE_MOD + ' loaded (after ' + tries + ' polls) — P010 path active'); }
      else if (tries > 400) { clearInterval(iv); console.log(ts() + ' NOTE ' + GATE_MOD + ' never loaded (no real capture this run?) — gralloc hooks still armed'); }
    }, 150);
  }
  console.log(ts() + ' trace_gralloc_p010_chain.js armed (NATIVE-only). NEED a REAL P010 capture: ' +
              'take ONE Photo + ONE Master/Pro capture to fire alloc/layout/lock for YCBCR_P010.');
})();

// =============================================================================
// USAGE
// -----------------------------------------------------------------------------
//   ATTACH (never spawn), app at preview, on stock OOS:
//     P=$(adb shell 'su -c "pidof com.oplus.camera"' | tr -d '\r')
//     frida -U -p "$P" -l tools/frida/trace_gralloc_p010_chain.js > /tmp/gralloc_p010_chain.txt
//     >>> take ONE Photo + ONE Master/Pro capture (loads libAlgoProcess + fires the P010 chain) <<<
//
//   READ THE RESULT — the per-stage comparable records (OOS = the diff oracle):
//     [GP010 alloc]  format=0x36(YCBCR_P010) usage=0x.. width/height   << alloc-input (usage-bit rule-out)
//     [GP010 layout] planes=N plane[i] off/stride/h  >>> contiguous=Y impliedAlignedH=..   << THE survivor checkpoint
//     [GP010 lock]   (Cb-Y)=.. rowStride=.. impliedAlignedH=..   << realized; correlate to layout
//   OOS expected: contiguous=Y (chroma = Y + stride*alignedH, height/page-aligned). The LOS diff target =
//     contiguous=N / unaligned -> the byte-identical blob walks off the dmabuf -> libapsfixup Family-I repair.
//
//   DO NOT RUN FROM THE HOST HARNESS — another process owns the device. Authoring/`node --check` only.
// =============================================================================
