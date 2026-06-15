/*
 * hook_configure_streams.js — dump the camera3_stream_configuration for the 8K (and 4K) session,
 * to pin WHY the EISv2 node gets 0 output ports (the missing stabilized-video output sink).
 *
 * Target: camera.oemlayer.v2.so  OCamera3Dev::configure_streams(camera3_device const*,
 *         camera3_stream_configuration*)  entry file-offset 0x1786cc (vaddr==offset, exported).
 *
 * camera3_stream_configuration_t:
 *   +0x00 u32  num_streams
 *   +0x08 ptr  camera3_stream_t** streams
 *   +0x10 u32  operation_mode          (8K = 0x80a9)
 *   +0x18 ptr  session_parameters (camera_metadata*)
 * camera3_stream_t (standard HAL3.x; OnePlus internal may extend — we also hexdump):
 *   +0x00 i32  stream_type (0=OUTPUT,1=INPUT,2=BIDIR)
 *   +0x04 u32  width
 *   +0x08 u32  height
 *   +0x0c i32  format (HAL_PIXEL_FORMAT)
 *   +0x10 u32  usage (gralloc)
 *   +0x14 u32  max_buffers
 *   +0x18 ptr  priv
 *   +0x20 u32  data_space
 *   +0x24 i32  rotation
 *
 * Goal: compare the 8K (op_mode 0x80a9) stream set vs a working 4K session — find the
 * video-output stream (7680x4320, OUTPUT, video usage) that the EISv2 output should map to.
 * If it's absent/mis-typed on the 8K config, that's the baseline gap (OCS VideoMode stream setup).
 *
 * Usage (frida 17): adb push to /data/local/tmp; adb root;
 *   frida -U -n vendor.qti.camera.provider-service_64 -l /data/local/tmp/hook_configure_streams.js
 *   then select 8K + start recording (and separately a 4K recording for comparison).
 */
'use strict';

var LIB = 'camera.oemlayer.v2.so';
var ENTRY_OFF = 0x1786cc;

function fmtName(f) {
  var m = { 0x21:'BLOB', 0x22:'IMPL_DEFINED', 0x23:'YCbCr_420_888', 0x24:'RAW16',
            0x25:'RAW_OPAQUE', 0x26:'RAW10', 0x27:'RAW12', 0x20:'Y8', 0x32315659:'YV12',
            0x10f:'P010' };
  return (m[f] || ('0x' + (f>>>0).toString(16)));
}
function styp(t){ return ({0:'OUTPUT',1:'INPUT',2:'BIDIR'}[t]) || ('?'+t); }

function dumpCfg(tag, cfg) {
  if (cfg.isNull()) return false;
  var op = cfg.add(0x10).readU32();
  var n  = cfg.add(0x00).readU32();
  if (n > 64 || n === 0) return false; // not a plausible stream config
  var streams = cfg.add(0x08).readPointer();
  console.log('\n[cfgstreams] ===== ' + tag + ' op_mode=0x' + op.toString(16) +
              ' num_streams=' + n + (op === 0x80a9 ? '   <<< 8K' : ''));
  for (var i = 0; i < n; i++) {
    var s = streams.add(i * Process.pointerSize).readPointer();
    if (s.isNull()) { console.log('[cfgstreams]   S[' + i + '] NULL'); continue; }
    var t = s.add(0x00).readS32();
    var w = s.add(0x04).readU32();
    var h = s.add(0x08).readU32();
    var f = s.add(0x0c).readS32();
    var u = s.add(0x10).readU32();
    var ds = s.add(0x20).readU32();
    console.log('[cfgstreams]   S[' + i + '] ' + styp(t) + ' ' + w + 'x' + h +
                ' fmt=' + fmtName(f) + ' usage=0x' + (u>>>0).toString(16) +
                ' dataspace=0x' + (ds>>>0).toString(16));
    console.log('[cfgstreams]       raw: ' + hexdump(s, { length: 0x30, header:false, ansi:false }).replace(/\n/g,'\n[cfgstreams]       '));
  }
  return true;
}

function hook(base) {
  var addr = base.add(ENTRY_OFF);
  console.log('[cfgstreams] ' + LIB + ' base=' + base + ' hooking configure_streams @ ' + addr);
  Interceptor.attach(addr, {
    onEnter: function (a) {
      // member fn: a[0]=this, a[1]=camera3_device*, a[2]=camera3_stream_configuration*
      // probe a[2] then a[1] (fallback) — pick whichever parses as a stream config.
      try {
        if (!dumpCfg('arg2', a[2])) dumpCfg('arg1', a[1]);
      } catch (e) { console.log('[cfgstreams] err: ' + e); }
    }
  });
}

(function main() {
  var m = Process.findModuleByName(LIB);
  if (m) { hook(m.base); return; }
  console.log('[cfgstreams] ' + LIB + ' not loaded — waiting for dlopen...');
  ['android_dlopen_ext', 'dlopen'].forEach(function (sym) {
    var p = Module.getGlobalExportByName(sym); // frida-17: static Module.*ExportByName removed -> instance method (doc-50)
    if (!p) return;
    Interceptor.attach(p, {
      onEnter: function (x) { this.p = x[0].isNull() ? '' : x[0].readCString(); },
      onLeave: function () {
        if (this.p && this.p.indexOf('oemlayer.v2') !== -1) {
          var mm = Process.findModuleByName(LIB);
          if (mm) hook(mm.base);
        }
      }
    });
  });
})();
