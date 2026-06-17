/*
 * hook_eisv2_ports.js — dump EISv2 (sstabrealt) QueryBufferInfo port counts for the 8K -38 root.
 *
 * Targets: com.oplus.node.sstabrealt.so  EISV2NodeQueryBufferInfo(ChiNodeQueryBufferInfo*)
 *   entry file-offset 0x355b4 (vaddr==file-offset; not exported → hook by offset).
 *
 * ChiNodeQueryBufferInfo* (x0 / args[0]) layout (confirmed from disasm @0x355b4):
 *   +0x00 u32  size            (must be >= 0x38)
 *   +0x08 ptr  hChiSession     (NULL -> node returns early w/ result 5)
 *   +0x10 u32  numInputPorts   (w9)
 *   +0x18 ptr  pInputPorts[]   stride 0x68, entry+0x00 = portId(u32), +0x04 = numFmts(u32)
 *   +0x20 u32  numOutputPorts  (w8)
 *   +0x28 ptr  pOutputPorts[]  stride 0x48, entry+0x00 = portId(u32)
 *
 * The node logs "EISv2 is a pure bypass, num inputs should be equal to num outputs" when
 * numOutputPorts(+0x20) != numInputPorts(+0x10) -> that mismatch is the 8K -38 root.
 * This hook prints both counts + the portId of every input/output port, so we can see which
 * port is extra/missing on the 8K OplusOfflineReprocess topology vs stock.
 *
 * Usage (device, as root):
 *   adb push hook_eisv2_ports.js /data/local/tmp/
 *   frida -U -n vendor.qti.camera.provider-service_64 -l /data/local/tmp/hook_eisv2_ports.js
 *     (or: frida -U -f <spawn>; but the provider is already running — attach by name.)
 *   Then select 8K in the camera app and trigger configure (start recording).
 *   Re-run `adb root` after reboot; ensure frida-server is running as root.
 */
'use strict';

var LIB = 'com.oplus.node.sstabrealt.so';
var ENTRY_OFF = 0x355b4;
var INSTRIDE = 0x68;
var OUTSTRIDE = 0x48;

function hook(base) {
  var addr = base.add(ENTRY_OFF);
  console.log('[eisv2] ' + LIB + ' base=' + base + ' hooking EISV2NodeQueryBufferInfo @ ' + addr);
  Interceptor.attach(addr, {
    onEnter: function (args) {
      try {
        var q = args[0];
        if (q.isNull()) { console.log('[eisv2] QueryBufferInfo(NULL)'); return; }
        var size = q.add(0x00).readU32();
        var hSess = q.add(0x08).readPointer();
        var numIn = q.add(0x10).readU32();
        var pIn = q.add(0x18).readPointer();
        var numOut = q.add(0x20).readU32();
        var pOut = q.add(0x28).readPointer();
        var mism = (numIn !== numOut) ? '  *** MISMATCH (-> pure-bypass -> NULL pipeline -> -38) ***' : '';
        console.log('\n[eisv2] ===== QueryBufferInfo: size=' + size + ' hSession=' + hSess +
                    ' numInputPorts=' + numIn + ' numOutputPorts=' + numOut + mism);
        var i, e, pid, nf;
        if (!pIn.isNull() && numIn < 64) {
          for (i = 0; i < numIn; i++) {
            e = pIn.add(i * INSTRIDE);
            pid = e.add(0x00).readU32();
            nf = e.add(0x04).readU32();
            console.log('[eisv2]   IN[' + i + ']  portId=' + pid + ' (0x' + pid.toString(16) + ') numFmts=' + nf);
          }
        }
        if (!pOut.isNull() && numOut < 64) {
          for (i = 0; i < numOut; i++) {
            e = pOut.add(i * OUTSTRIDE);
            pid = e.add(0x00).readU32();
            console.log('[eisv2]   OUT[' + i + '] portId=' + pid + ' (0x' + pid.toString(16) + ')');
          }
        }
        console.log('[eisv2] backtrace:\n' +
          Thread.backtrace(this.context, Backtracer.ACCURATE)
                .slice(0, 6).map(DebugSymbol.fromAddress).join('\n'));
      } catch (err) {
        console.log('[eisv2] read error: ' + err);
      }
    }
  });
}

(function main() {
  var m0 = Process.findModuleByName(LIB);
  var b = m0 ? m0.base : null;
  if (b !== null) { hook(b); return; }
  console.log('[eisv2] ' + LIB + ' not loaded yet — waiting for dlopen (open camera + select 8K)...');
  // Hook dlopen/android_dlopen_ext to catch the lazy load at configure time.
  ['android_dlopen_ext', 'dlopen'].forEach(function (sym) {
    var p = Module.getGlobalExportByName(sym); // frida-17: static Module.*ExportByName removed -> instance method (doc-50)
    if (!p) return;
    Interceptor.attach(p, {
      onEnter: function (a) { this.path = a[0].isNull() ? '' : a[0].readCString(); },
      onLeave: function () {
        if (this.path && this.path.indexOf('sstabrealt') !== -1) {
          var mm = Process.findModuleByName(LIB);
          var bb = mm ? mm.base : null;
          if (bb !== null) hook(bb);
        }
      }
    });
  });
})();
