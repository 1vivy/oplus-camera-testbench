// trace_gralloc_iallocator.js — alloc-chain probe: the gralloc HAL allocate (allocator-service side)
// =============================================================================
// PURPOSE: capture the GOLDEN (stock) HAL-level allocation descriptor + realized buffer geometry, BELOW the
// mapper API that the app-side trace_gralloc_p010_chain.js sees. That app-side probe can only best-effort the
// IAllocator call (the descriptor is HAL-encoded and not statically decodable from the app). This probe runs
// IN the allocator service (vendor.qti.hardware.display.allocator-service) and hooks the QTI allocator's own
//   gralloc::BufferManager::AllocateBuffer(BufferDescriptor const&, native_handle const**, uint32_t, bool)
// so the REQUESTED descriptor (format/usage/width/height) and the REALIZED private_handle_t (aligned dims /
// stride / size) are both visible — the per-format alloc denominator the LOS A/B diffs.
//
// Symbol (libgralloccore.so export, confirmed on device V16.1.0):
//   _ZN7gralloc13BufferManager14AllocateBufferERKNS_16BufferDescriptorEPPK13native_handlejb
//
// !! FINDING (V16.1.0, validated): a full camera cold-launch + capture fires NEITHER BufferManager::
//    AllocateBuffer NOR Allocator::AllocateMem NOR any AIDL service-allocate in this service. The camera's
//    P010/processing buffers BYPASS the gralloc allocator service — CamX allocates them PROVIDER-side via
//    ION/dmabuf directly. So this probe captures GRAPHICS/surface buffers (display, app output), NOT the
//    camera alloc chain. For the HAL-level CAMERA alloc, hook the PROVIDER's ION/dmabuf path (CSLBufferManager
//    / dmabuf ioctl) or use the provider strace lane (P1.3). Kept for the graphics-buffer denominator.
//
// THE COMPARABLE RECORD (parse_allocchain reads):
//   [IALLOC req] desc=.. <plausible fmt/usage/dims scanned from BufferDescriptor>
//   [IALLOC out] handle=.. numFds=.. numInts=.. <int32 words: fmt/width/height/stride/size flagged>
//
// SAFETY: ATTACH-ONLY (the service is a persistent daemon — attach once, hold). NATIVE-only. Defensive
// try/catch; throttled + deduped. SYMMETRIC: same script + parser OOS (golden) and LOS (diff).
// HOST-ONLY AUTHORING: do NOT run from the host harness.
//
// RUN (on stock):
//   A=$(adb shell 'su -c "pidof vendor.qti.hardware.display.allocator-service"' | tr -d '\r')
//   frida -U -p "$A" -l tools/frida/_anchor.js -l tools/frida/trace_gralloc_iallocator.js > /tmp/iallocator.txt
//   >>> then drive a real capture (any mode) to allocate camera buffers <<<
// =============================================================================
'use strict';

// ── tunables ────────────────────────────────────────────────────────────────
var MAX_LOG = 200;
var DEDUP = true;
var DESC_WORDS = 24;     // BufferDescriptor scan window (int32 words)
var HANDLE_WORDS = 28;   // private_handle_t scan window (int32 words after the native_handle header)

var ALLOC_LIB = 'libgralloccore.so';
var ALLOC_SYM = '_ZN7gralloc13BufferManager14AllocateBufferERKNS_16BufferDescriptorEPPK13native_handlejb';

// AIDL graphics PixelFormat values of interest (same table as trace_gralloc_p010_chain.js)
var PIXFMT = { 0x36: 'YCBCR_P010', 0x23: 'YCbCr_420_888', 0x21: 'BLOB', 0x100: 'IMPLEMENTATION_DEFINED',
               0x1: 'RGBA_8888', 0x25: 'RAW10', 0x20: 'RAW16', 0x32315659: 'YV12', 0x9: 'Y8' };
function fmtName(f) { return PIXFMT[f] !== undefined ? PIXFMT[f] : 'fmt_0x' + (f >>> 0).toString(16); }

function ts() { return '[' + (Date.now() % 1000000) + ']'; }
function hx(p) { return p ? p.toString() : 'null'; }
function i32(p, o) { try { return p.add(o).readS32(); } catch (e) { return null; } }
function u32(p, o) { try { return p.add(o).readU32(); } catch (e) { return null; } }
function u64(p, o) { try { return p.add(o).readU64(); } catch (e) { return null; } }
function readable(v) { try { return !!v && !v.isNull() && Process.findRangeByAddress(v) !== null; } catch (e) { return false; } }

var counts = {}, seen = {};
function gate(hook, key) {
  counts[hook] = (counts[hook] || 0) + 1;
  if (counts[hook] > MAX_LOG) return false;
  if (DEDUP && key) { var sk = hook + '|' + key; if (seen[sk]) return false; seen[sk] = true; }
  return true;
}
function plausibleDim(v) { return v !== null && v >= 16 && v <= 16384; }   // a width/height/stride
function plausibleFmt(v) { return v !== null && ((v > 0 && v <= 0x200) || PIXFMT[v] !== undefined); }

function anchorResolve(spec) {
  if (typeof Anchor !== 'undefined' && Anchor.resolve) return Anchor.resolve(spec);
  var m = Process.findModuleByName(spec.lib); if (!m) return null;
  if (spec.export) { try { var p = m.findExportByName(spec.export); if (p) return p; } catch (e) {} }
  return null;
}

// scan a BufferDescriptor for the requested fmt/usage/dims (no fragile hardcoded offset — value-plausibility,
// the same discipline as trace_p010_planes' region scanner). A QTI BufferDescriptor leads with a std::string
// name_, so the int fields float; we surface the plausible candidates + a labeled int32 dump.
function dumpDescriptor(desc) {
  if (!readable(desc)) return;
  var dims = [], usages = [], fmts = [], raw = [];
  for (var i = 0; i < DESC_WORDS; i++) {
    var w = i32(desc, i * 4); raw.push((w === null ? '?' : ('0x' + (w >>> 0).toString(16))));
    if (plausibleDim(w)) dims.push('+0x' + (i * 4).toString(16) + '=' + w);
    if (plausibleFmt(w)) fmts.push('+0x' + (i * 4).toString(16) + '=0x' + (w >>> 0).toString(16) + '(' + fmtName(w) + ')');
  }
  for (var j = 0; j + 1 < DESC_WORDS; j++) {  // 64-bit usage bitmask: high bits set, not a small int
    var u = u64(desc, j * 4); if (u && u.compare(ptr('0x100')) > 0 && u.compare(ptr('0xffffffffff')) < 0) usages.push('+0x' + (j * 4).toString(16) + '=0x' + u.toString(16));
  }
  console.log(ts() + ' [IALLOC req] desc=' + hx(desc) +
              '\n    fmt?  ' + (fmts.slice(0, 6).join('  ') || '(none plausible)') +
              '\n    dims? ' + (dims.slice(0, 8).join('  ') || '(none)') +
              '\n    usage?' + (usages.slice(0, 4).join('  ') || '(none)') +
              '\n    raw[0x00..0x' + ((DESC_WORDS - 1) * 4).toString(16) + ']: ' + raw.join(' '));
}

// dump the realized private_handle_t (native_handle_t header + QTI fields) as labeled int32 words
function dumpHandle(h) {
  if (!readable(h)) return;
  var version = i32(h, 0), numFds = i32(h, 4), numInts = i32(h, 8);
  // QTI private_handle_t fields live after the fds+ints region: data starts at +0xc, fds occupy numFds*4,
  // then ints. Rather than hardcode, dump a labeled int32 window so width/height/stride/size are diffable.
  var words = [];
  for (var i = 0; i < HANDLE_WORDS; i++) {
    var w = i32(h, i * 4);
    var tag = '';
    if (plausibleFmt(w) && PIXFMT[w] !== undefined) tag = '(' + fmtName(w) + ')';
    words.push('+0x' + (i * 4).toString(16) + '=' + (w === null ? '?' : w) + tag);
  }
  console.log(ts() + ' [IALLOC out] handle=' + hx(h) + ' version=' + version + ' numFds=' + numFds + ' numInts=' + numInts +
              '\n    int32[]: ' + words.join(' '));
}

(function () {
  var addr = anchorResolve({ lib: ALLOC_LIB, name: 'BufferManager::AllocateBuffer', export: ALLOC_SYM });
  if (!addr) { console.log('[hook] BufferManager::AllocateBuffer NOT resolved (' + ALLOC_LIB + ' not loaded / symbol drift)'); return; }
  Interceptor.attach(addr, {
    onEnter: function (a) { this.desc = a[1]; this.out = a[2]; if (gate('IALLOC.req', null)) dumpDescriptor(this.desc); },
    onLeave: function (ret) {
      try {
        if (!this.out || this.out.isNull()) return;
        var h = this.out.readPointer();
        if (gate('IALLOC.out', hx(h))) dumpHandle(h);
      } catch (e) {}
    }
  });
  console.log('[hook] BufferManager::AllocateBuffer @ ' + addr + ' (' + ALLOC_LIB + ')');
  console.log(ts() + ' trace_gralloc_iallocator.js armed (allocator-service side). Drive a capture to allocate buffers.');
})();
