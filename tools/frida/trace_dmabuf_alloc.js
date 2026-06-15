// trace_dmabuf_alloc.js — provider-side: decode dma_heap_allocation_data.len per camera buffer alloc
// =============================================================================
// PURPOSE: the camera's P010/processing buffers are allocated PROVIDER-side via DMA_HEAP_IOCTL_ALLOC on
// /dev/dma_heap/system (validated: 267 allocs/configure; they BYPASS the gralloc allocator service). The
// dma_heap is FORMAT-BLIND — it just hands back `len` contiguous bytes; all geometry (stride, chroma_offset,
// the 1472 row-align, pitch) is layered on TOP by the mapper/CamX-format-utils. So the single most diagnostic
// field is the REQUESTED `len`: at OOS↔LOS A/B, if `len` already differs the wrong alignment is encoded
// UPSTREAM of gralloc (the CamX/OEM geometry config); if `len` matches but the realized impliedAlignedH
// (trace_gralloc_p010_chain) diverges, the break is in the metadata/read contract. This is the earliest place
// the wrong number can appear — strace shows the ioctl name but NOT the struct, so we decode it here.
//
// struct dma_heap_allocation_data { __u64 len; __u32 fd; __u32 fd_flags; __u64 heap_flags; }  (sizeof 24)
// DMA_HEAP_IOCTL_ALLOC = _IOWR('H'(0x48), 0, sizeof=0x18) = 0xC0184800
//
// THE COMPARABLE RECORD (parse_allocchain reads): one per DISTINCT requested size (deduped by len):
//   [DMABUF] len=N (0x..) heap=/dev/dma_heap/<name> heap_flags=0x.. fd=M  x<count>
//
// SAFETY: ATTACH-ONLY to the provider (persistent daemon — attach once, then cold-launch the camera so the
// configure_streams allocations fire). NATIVE-only. Defensive try/catch; deduped by len + throttled.
// HOST-ONLY AUTHORING. SYMMETRIC: same script + parser OOS (golden) and LOS (the diff).
//
// RUN (on stock):
//   P=$(adb shell 'su -c "pidof vendor.qti.camera.provider-service_64"' | tr -d '\r')
//   frida -U -p "$P" -l tools/frida/trace_dmabuf_alloc.js > /tmp/dmabuf.txt
//   >>> then COLD-LAUNCH the camera (force-stop + open) to fire configure_streams allocations <<<
// =============================================================================
'use strict';

var DMA_HEAP_IOCTL_ALLOC = 0xc0184800;
var MAX_LOG = 400;

function ts() { return '[' + (Date.now() % 1000000) + ']'; }

// resolve the heap path from the heap fd (arg0 of the ioctl) via readlink(/proc/self/fd/<fd>)
var _readlink = null;
(function () {
  try {
    var libc = Process.getModuleByName('libc.so');
    var p = libc.findExportByName('readlink');
    if (p) _readlink = new NativeFunction(p, 'int', ['pointer', 'pointer', 'int']);
  } catch (e) {}
})();
function heapName(fd) {
  if (_readlink === null || fd == null || fd < 0) return 'fd' + fd;
  try {
    var pathStr = Memory.allocUtf8String('/proc/self/fd/' + fd);
    var out = Memory.alloc(256);
    var n = _readlink(pathStr, out, 255);
    if (n > 0) { out.add(n).writeU8(0); return out.readUtf8String(); }
  } catch (e) {}
  return 'fd' + fd;
}

// dedup by requested len (the distinct buffer sizes per configure are what matter), with a count
var byLen = {};   // len-hex -> { count, heap, hflags, fd }
var logged = 0;

(function () {
  var ioctl = null;
  try { ioctl = Process.getModuleByName('libc.so').findExportByName('ioctl'); } catch (e) {}
  if (!ioctl) { console.log('[hook] ioctl NOT found (libc not mapped?)'); return; }
  Interceptor.attach(ioctl, {
    onEnter: function (a) {
      this.skip = true;
      var req; try { req = a[1].toInt32() >>> 0; } catch (e) { return; }
      if (req !== DMA_HEAP_IOCTL_ALLOC) return;
      this.skip = false;
      this.heapfd = (function () { try { return a[0].toInt32(); } catch (e) { return -1; } })();
      this.arg = a[2];
      try { this.len = this.arg.readU64(); } catch (e) { this.len = null; }
      try { this.hflags = this.arg.add(0x10).readU64(); } catch (e) { this.hflags = null; }
    },
    onLeave: function (ret) {
      if (this.skip) return;
      if (ret.toInt32() !== 0) return;            // only successful allocs
      var fd = null; try { fd = this.arg.add(8).readU32(); } catch (e) {}
      var lenHex = this.len ? '0x' + this.len.toString(16) : '?';
      var rec = byLen[lenHex];
      if (rec) { rec.count++; return; }           // already reported this size — just tally
      if (logged >= MAX_LOG) return;
      logged++;
      var heap = heapName(this.heapfd);
      rec = byLen[lenHex] = { count: 1, heap: heap, hflags: this.hflags, fd: fd, len: this.len };
      console.log(ts() + ' [DMABUF] len=' + (this.len ? this.len.toString() : '?') + ' (' + lenHex + ')' +
                  ' heap=' + heap + ' heap_flags=0x' + (this.hflags ? this.hflags.toString(16) : '?') +
                  ' fd=' + (fd === null ? '?' : fd) + '  <first of this size>');
    }
  });
  console.log('[hook] DMA_HEAP_IOCTL_ALLOC (ioctl req=0x' + DMA_HEAP_IOCTL_ALLOC.toString(16) + ') @ ' + ioctl);
  console.log(ts() + ' trace_dmabuf_alloc.js armed (provider-side). COLD-LAUNCH the camera to fire configure allocations.');
})();

// periodic roll-up: the distinct sizes + their counts (the per-configure allocation-size denominator)
(function () {
  setInterval(function () {
    var keys = Object.keys(byLen); if (!keys.length) return;
    keys.sort(function (x, y) { return byLen[y].count - byLen[x].count; });
    var line = ts() + ' [DMABUF rollup] ' + keys.length + ' distinct sizes:';
    for (var i = 0; i < keys.length && i < 24; i++) { var r = byLen[keys[i]];
      line += '\n    ' + (r.len ? r.len.toString() : '?') + ' (' + keys[i] + ') x' + r.count + '  heap=' + r.heap; }
    console.log(line);
  }, 4000);
})();
