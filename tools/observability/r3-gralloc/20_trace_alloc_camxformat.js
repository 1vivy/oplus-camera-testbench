// r3-gralloc/20_trace_alloc_camxformat.js
// =============================================================================
// r3 ADD-ON to ../../frida/trace_p010_planes.js. That script captures the LOCK side (A) + the
// BLOB compute (B). THIS adds the two things r3 needs to settle doc-42 §2.5:
//   (E) the ALLOCATE side  — usage / format / W×H / stride the P010 buffer is BORN with.
//   (F) the CamxFormatUtil link — does com.oplus.camera's libgrallocutils actually dlopen the vendor
//       authority libcamxexternalformatutils.so IN THIS PROCESS, or get NULL (-> "Failed to link" fallback)?
// (F) is the decisive in-app namespace check. Load BOTH scripts together; records key by handle ptr so
// alloc params (E) join to lock params (A) and blob params (B) in parse_r3.py.
//
// SAFETY: NATIVE-ONLY (Interceptor on libdl/libnativewindow/libui exports). NO Java.perform (this ART
// crashes on OCS Java hot paths — project history). Throttled + deduped. Tag lines start "R3|" for parse.
// RUN: frida -U -n com.oplus.camera -l 20_trace_alloc_camxformat.js -l ../../frida/trace_p010_planes.js
// =============================================================================
'use strict';

var MAX_LOG_PER_HOOK = 120;
function ts() { return '[' + (Date.now() % 1000000) + ']'; }
function hx(p) { return p ? p.toString() : 'null'; }
var counts = {}, seen = {};
function gate(hook, key) {
  counts[hook] = (counts[hook] || 0) + 1;
  if (counts[hook] > MAX_LOG_PER_HOOK) return false;
  if (key) { var sk = hook + '|' + key; if (seen[sk]) return false; seen[sk] = true; }
  return true;
}
function findExport(mods, exactOrSub, isSub) {
  mods = Array.isArray(mods) ? mods : [mods];
  for (var i = 0; i < mods.length; i++) {
    var m = null; try { m = Process.findModuleByName(mods[i]); } catch (e) {}
    if (!m) continue;
    if (!isSub) { try { var e = m.findExportByName(exactOrSub); if (e) return { addr: e, mod: m.name }; } catch (x) {} }
    else { var ex; try { ex = m.enumerateExports(); } catch (x2) { ex = []; }
      for (var j = 0; j < ex.length; j++) if (ex[j].name.indexOf(exactOrSub) !== -1) return { addr: ex[j].address, mod: m.name, name: ex[j].name }; }
  }
  if (!isSub) { try { var g = Module.getGlobalExportByName(exactOrSub); if (g) return { addr: g, mod: '?' }; } catch (x3) {} }
  return null;
}

// ── decoders ────────────────────────────────────────────────────────────────
var FMT = { 0x22: 'IMPL_DEFINED', 0x23: 'YCbCr_420_888', 0x25: 'RAW10', 0x20: 'RAW16', 0x24: 'RAW_OPAQUE',
            0x21: 'BLOB', 0x36: 'YCBCR_P010', 0x1: 'RGBA_8888', 0x2b: 'RGBA_1010102' };
function fmtName(f) { return (FMT[f] || ('0x' + (f >>> 0).toString(16))); }
// flag known gralloc usage bits + isolate the VENDOR ranges (bit28-31, bit48-63) where an OEM-private
// bit would live — that vendor range is the column the OOS↔LOS A/B must compare.
function usageDecode(uLo, uHi) {
  var n = [];
  if (uLo & 0x100) n.push('HW_TEXTURE'); if (uLo & 0x200) n.push('HW_RENDER');
  if (uLo & 0x800) n.push('HW_COMPOSER'); if (uLo & 0x1000) n.push('HW_FB');
  if (uLo & 0x4000) n.push('PROTECTED'); if (uLo & 0x10000) n.push('HW_VIDEO_ENC');
  if (uLo & 0x20000) n.push('HW_CAMERA_WRITE'); if (uLo & 0x40000) n.push('HW_CAMERA_READ');
  if ((uLo & 0x60000) === 0x60000) n.push('HW_CAMERA_ZSL');
  var vlo = (uLo >>> 28) & 0xf;                 // bits 28..31  (first vendor nibble)
  if (vlo) n.push('VENDOR_lo28=0x' + vlo.toString(16));
  if (uHi) n.push('VENDOR_hi(bits48-63)=0x' + (uHi >>> 0).toString(16)); // any high bit = vendor/QTI private
  return n.join(',') || '(none)';
}

console.log(ts() + ' R3| 20_trace_alloc_camxformat.js arming (native-only). pid=' + Process.id);

// =============================================================================
// (F) THE DECISIVE CHECK — dlopen of the vendor camera-format authority, IN THIS (app) PROCESS.
// =============================================================================
['android_dlopen_ext', 'dlopen', '__loader_android_dlopen_ext', '__loader_dlopen'].forEach(function (fn) {
  var r = findExport(['libdl.so', 'ld-android.so'], fn, false);
  if (!r) return;
  Interceptor.attach(r.addr, {
    onEnter: function (a) { this.path = null; try { this.path = a[0].readCString(); } catch (e) {} },
    onLeave: function (ret) {
      if (!this.path || this.path.indexOf('camxexternalformat') === -1 && this.path.indexOf('camximageformat') === -1
          && this.path.indexOf('grallocutils') === -1) return;
      var caller = '?'; try { var cm = Process.findModuleByAddress(this.returnAddress); if (cm) caller = cm.name; } catch (e) {}
      var ok = ret && !ret.isNull();
      console.log(ts() + ' R3|DLOPEN proc=' + Process.id + ' fn=' + fn + ' path=' + this.path +
                  ' ret=' + hx(ret) + ' -> ' + (ok ? 'OK (authority reachable in-app)' :
                  'NULL  <<<<< FAILED — app namespace cannot reach it (CamxFormatUtil fallback path)') +
                  ' caller=' + caller);
    }
  });
  console.log(ts() + ' R3| (F) hooked ' + fn + ' @ ' + r.addr + ' (' + r.mod + ')');
});
// CamxFormatUtil symbol resolution snapshot (is the authority's API present in THIS process now?)
(function () {
  var syms = ['CamxFormatUtil_GetPlaneAlignment', 'CamxFormatUtil_GetPlaneCount', 'CamxFormatUtil_GetUBWCInfo'];
  syms.forEach(function (s) {
    var found = null; try { found = Module.getGlobalExportByName(s); } catch (e) {}
    console.log(ts() + ' R3|SYM ' + s + ' in-process=' + (found ? hx(found) + ' (RESOLVED)' : 'absent (not loaded here)'));
  });
})();

// =============================================================================
// (E) THE ALLOCATE SIDE — what usage/format/dims the P010 buffer is born with.
// =============================================================================
// E1. AHardwareBuffer_allocate(const AHardwareBuffer_Desc* desc, AHardwareBuffer** out)
//     Desc: w@0,h@4,layers@8,format@0xC,usage@0x10(u64),stride@0x18(out).  Clean C export.
(function () {
  var r = findExport(['libnativewindow.so'], 'AHardwareBuffer_allocate', false);
  if (!r) { console.log(ts() + ' R3| (E1) AHardwareBuffer_allocate NOT found'); return; }
  Interceptor.attach(r.addr, {
    onEnter: function (a) { this.d = a[0]; this.out = a[1]; },
    onLeave: function (ret) {
      try {
        var d = this.d; var w = d.readU32(), h = d.add(4).readU32(), lay = d.add(8).readU32(), f = d.add(0xc).readU32();
        var uLo = d.add(0x10).readU32(), uHi = d.add(0x14).readU32(), stride = d.add(0x18).readU32();
        if (f !== 0x36 && f !== 0x22 && f !== 0x23) return;   // P010 / impl-defined / 420 only (camera)
        if (!gate('AHB.allocate', w + 'x' + h + ':' + f + ':' + uLo)) return;
        var ahb = null; try { ahb = this.out.readPointer(); } catch (e) {}
        console.log(ts() + ' R3|ALLOC AHB rc=' + ret.toInt32() + ' ' + w + 'x' + h + ' layers=' + lay +
                    ' fmt=' + fmtName(f) + ' stride=' + stride + ' usage=0x' + (uHi >>> 0).toString(16) +
                    (uLo >>> 0).toString(16).padStart(8, '0') + ' [' + usageDecode(uLo, uHi) + '] AHB=' + hx(ahb));
      } catch (e) {}
    }
  });
  console.log(ts() + ' R3| (E1) AHardwareBuffer_allocate @ ' + r.addr);
})();

// E2. GraphicBufferAllocator::allocate(...) — the camera/HAL path. Signature varies by version, so hook
//     by substring + read the leading integer args defensively (w,h,format,layerCount,usage).
(function () {
  var r = findExport(['libui.so'], 'GraphicBufferAllocator8allocate', true);
  if (!r) { console.log(ts() + ' R3| (E2) GraphicBufferAllocator::allocate NOT found'); return; }
  Interceptor.attach(r.addr, {
    onEnter: function (a) {
      // common layout: (this, w, h, PixelFormat, layerCount, usage, handle*, stride*, requestorName)
      this.w = a[1].toInt32() >>> 0; this.h = a[2].toInt32() >>> 0; this.f = a[3].toInt32() >>> 0;
      this.u = a[5]; this.hOut = a[6]; this.sOut = a[7];
    },
    onLeave: function (ret) {
      try {
        if (this.f !== 0x36 && this.f !== 0x22 && this.f !== 0x23) return;
        if (!gate('GBA.allocate', this.w + 'x' + this.h + ':' + this.f)) return;
        var uLo = this.u.toInt32() >>> 0, uHi = this.u.shr(32).toInt32() >>> 0;
        var hv = null, sv = null; try { hv = this.hOut.readPointer(); } catch (e) {} try { sv = this.sOut.readU32(); } catch (e2) {}
        console.log(ts() + ' R3|ALLOC GBA rc=' + (ret ? ret.toInt32() : '?') + ' ' + this.w + 'x' + this.h +
                    ' fmt=' + fmtName(this.f) + ' stride=' + sv + ' usage=0x' + uHi.toString(16) + uLo.toString(16).padStart(8, '0') +
                    ' [' + usageDecode(uLo, uHi) + '] handle=' + hx(hv) + '   <<< join key (handle) to LOCK/BLOB records');
      } catch (e) {}
    }
  });
  console.log(ts() + ' R3| (E2) GraphicBufferAllocator::allocate @ ' + r.addr + (r.name ? ' (' + r.name + ')' : ''));
})();

console.log(ts() + ' R3| armed. Take: (1) a WORKING non-HDR Photo (negative control), then (2) the P010/Master capture.');
