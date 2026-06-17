// probe_getoplushwbuffer.js — prove the getOplusHardwareBuffer APS bridge link (Task #8).
//
// PURPOSE: confirm whether the OCS/APS SDK reflectively selects
//   ImageReader$SurfaceImage.getOplusHardwareBuffer()  vs  falling back to getHardwareBuffer().
// This is the CAUSAL-LINK layer. The SUCCESS-CRITERION layer (does the garbage
// ApsBufferPlanes plane ptr 0x7400000000 go away) is op_planelayout_probe.js — run BOTH.
//
//   adb root && adb shell setenforce 0
//   frida -U -n com.oplus.camera -l tools/frida/probe_getoplushwbuffer.js > /tmp/probe_hwbuf.txt
//   >>> open Master (or Pro) mode, take ONE capture (JPG and/or RAW) <<<
//
// EXPECTED:
//   BEFORE the framework fix is deployed (running LOS 20260604 build, no bridge):
//     [getMethod] name=getOplusHardwareBuffer  -> NoSuchMethodException / null
//     [fallback ] nativeGetHardwareBuffer invoked        <- SDK took the generic path
//     (then op_planelayout_probe.js shows plane ptr = 0x74_0000_0000 garbage -> rotateMirror/
//      BasicTone/P010 SEGV tombstone)
//   AFTER the fix is deployed:
//     [BRIDGE  ] SurfaceImage.getOplusHardwareBuffer() invoked -> HardwareBuffer@...
//     (no getMethod NoSuchMethod; op_planelayout_probe.js shows a real non-round gralloc VA
//      0x73xx_xxxx_x000, sane height; no tombstone; JPG/RAW saved)
//
// NOTE on ART safety: these are LOW-FREQUENCY hooks (per-capture / per-stream-config, NOT the
// per-frame fillDecisionResult path that crashes this ART). Filtered + minimal work. Safe.
'use strict';

function ts(){ return '[' + (Date.now() % 100000) + ']'; }

Java.perform(function () {
  // ---- 1. reflective lookup: does the SDK ASK for getOplusHardwareBuffer? ----
  // Hook java.lang.Class.getMethod + getDeclaredMethod, filtered to the one name.
  try {
    var Clazz = Java.use('java.lang.Class');
    ['getMethod', 'getDeclaredMethod'].forEach(function (mName) {
      var ovl = Clazz[mName].overload('java.lang.String', '[Ljava.lang.Class;');
      ovl.implementation = function (name, params) {
        if (name === 'getOplusHardwareBuffer') {
          var owner = '?'; try { owner = this.getName(); } catch (e) {}
          try {
            var m = ovl.call(this, name, params);
            console.log(ts() + ' [getMethod] ' + owner + '.' + name + ' -> FOUND (bridge present)');
            return m;
          } catch (e) {
            console.log(ts() + ' [getMethod] ' + owner + '.' + name +
                        ' -> NoSuchMethod (BRIDGE ABSENT, SDK will fall back)');
            throw e;
          }
        }
        return ovl.call(this, name, params);
      };
    });
    console.log(ts() + ' hooked Class.getMethod/getDeclaredMethod (filtered: getOplusHardwareBuffer)');
  } catch (e) { console.log('reflect-hook err: ' + e); }

  // ---- 2. the bridge method itself (only exists AFTER the fix) ----
  try {
    var SI = Java.use('android.media.ImageReader$SurfaceImage');
    var bridgeOv = SI.getOplusHardwareBuffer.overload();
    bridgeOv.implementation = function () {
      var hb = bridgeOv.call(this);
      console.log(ts() + ' [BRIDGE ] SurfaceImage.getOplusHardwareBuffer() -> ' + hb);
      return hb;
    };
    console.log(ts() + ' hooked SurfaceImage.getOplusHardwareBuffer (bridge IS present in this build)');
  } catch (e) {
    console.log(ts() + ' SurfaceImage.getOplusHardwareBuffer NOT in this build (pre-fix) — expected before deploy');
  }

  // ---- 3. the fallback path (always present) — fires when the bridge is absent ----
  try {
    var SI2 = Java.use('android.media.ImageReader$SurfaceImage');
    var fallbackOv = SI2.getHardwareBuffer.overload();
    fallbackOv.implementation = function () {
      var hb = fallbackOv.call(this);
      console.log(ts() + ' [fallback] SurfaceImage.getHardwareBuffer() -> ' + hb);
      return hb;
    };
  } catch (e) { console.log('fallback-hook err: ' + e); }
});
