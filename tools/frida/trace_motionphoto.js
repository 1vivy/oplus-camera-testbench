// trace_motionphoto.js — observe the STOCK motion-photo / HEIF metadata contract.
// =============================================================================
// The motion-photo + HEIF still path runs through two OEM Java carriers named in
// E1-stubs.md (the stub classes on LOS, the real implementations on STOCK):
//   (1) com.oplus.inner.hardware.camera2.impl.CameraMetadataNativeWrapper
//       — the motion-photo / SuperEIS metadata bridge (E1 §(a)). On LOS this is a
//       no-op stub; on STOCK it carries the per-frame metadata that tags a still
//       as a motion-photo and feeds the HEIF writer.
//   (2) com.oplus.media.OplusHeifWriter
//       — the HEIF container writer (E1 §(e) "dirty-only" cam-app class; pairs
//       with the OplusCameraManager JNI symbol nativtSendToProcessHeif via lib
//       HeifWinBufExchg-jni). Carries the primary image + EXIF + the embedded
//       motion-photo video into the .heic/.jpg container.
//
// This probe hooks EVERY method of both classes reflectively (iterate
// getDeclaredMethods + .overloads) and logs args/return, so we capture the real
// method surface WITHOUT hardcoding signatures we cannot confirm statically (the
// exact OplusHeifWriter method set — start/addImage/addExifData/stop — is not
// enumerated in any doc; it must be confirmed from this live trace in Phase 1b).
//
// WHY STOCK ONLY: on LOS these are no-op stubs (E1 §(f)) so the calls show the
// stub behaviour; STOCK shows the working motion-photo metadata contract.
//
// ⚠️ ALWAYS ATTACH, NEVER SPAWN. Attach to a LIVE com.oplus.camera. Each class is
//    independently guarded (try/catch) — a class may be absent in some configs.
// =============================================================================
'use strict';

var TARGET_CLASSES = [
  'com.oplus.inner.hardware.camera2.impl.CameraMetadataNativeWrapper',
  'com.oplus.media.OplusHeifWriter'
];

function argsToStr(args) {
  var out = [];
  for (var i = 0; i < args.length; i++) {
    try { out.push(args[i] === null ? 'null' : String(args[i])); }
    catch (e) { out.push('<arg' + i + '?>'); }
  }
  return out.join(', ');
}

// Hook every overload of a single method by name. Used both for the reflectively
// discovered instance/static methods and (separately) for constructors.
function hookMethod(cls, clsName, mName) {
  var m;
  try { m = cls[mName]; } catch (e) { return; }
  if (!m || !m.overloads || m.overloads.length === 0) return;
  m.overloads.forEach(function (ov, idx) {
    try {
      ov.implementation = function () {
        var argStr = argsToStr(arguments);
        var ret;
        try {
          ret = ov.apply(this, arguments);
        } catch (e) {
          console.log('[MP] ' + clsName + '.' + mName + '#' + idx +
                      '(' + argStr + ') THREW ' + e);
          throw e;
        }
        console.log('[MP] ' + clsName + '.' + mName + '#' + idx +
                    '(' + argStr + ') -> ' + (ret === null ? 'null' : String(ret)));
        return ret;
      };
    } catch (e) {
      console.log('[MP]   FAIL hook ' + clsName + '.' + mName + '#' + idx + ': ' + e);
    }
  });
  console.log('[MP]   hooked ' + clsName + '.' + mName +
              ' (' + m.overloads.length + ' overload(s))');
}

// Hook every constructor overload of a class (OplusHeifWriter ctor takes the
// output target + dimensions + quality; signature confirmed at runtime).
function hookConstructors(cls, clsName) {
  try {
    var ctor = cls.$init;
    if (!ctor || !ctor.overloads || ctor.overloads.length === 0) {
      console.log('[MP]   ' + clsName + ' <no ctor overloads visible>');
      return;
    }
    ctor.overloads.forEach(function (ov, idx) {
      try {
        ov.implementation = function () {
          var argStr = argsToStr(arguments);
          console.log('[MP] ' + clsName + '.<init>#' + idx + '(' + argStr + ')');
          return ov.apply(this, arguments);
        };
      } catch (e) {
        console.log('[MP]   FAIL hook ' + clsName + '.<init>#' + idx + ': ' + e);
      }
    });
    console.log('[MP]   hooked ' + clsName + '.<init> (' + ctor.overloads.length + ' overload(s))');
  } catch (e) {
    console.log('[MP]   ctor hook err ' + clsName + ': ' + e);
  }
}

// Reflectively enumerate every declared method name, then hook all overloads.
function enumerateAndHook(cls, clsName) {
  var names = {};
  try {
    var jcls = cls.class;                       // java.lang.Class
    var methods = jcls.getDeclaredMethods();    // Method[]
    for (var i = 0; i < methods.length; i++) {
      try { names[methods[i].getName()] = 1; } catch (e) {}
    }
  } catch (e) {
    console.log('[MP]   getDeclaredMethods err ' + clsName + ': ' + e);
  }
  var list = Object.keys(names);
  if (list.length === 0) {
    console.log('[MP]   ' + clsName + ' — no declared methods discovered (stub may be empty)');
  } else {
    console.log('[MP]   ' + clsName + ' — ' + list.length + ' method name(s): ' + list.join(', '));
  }
  list.forEach(function (mName) { hookMethod(cls, clsName, mName); });
}

function hookClass(clsName) {
  var cls;
  try {
    cls = Java.use(clsName);
  } catch (e) {
    console.log('[MP] class ABSENT / unresolvable: ' + clsName + ' (' + e + ')');
    return;
  }
  console.log('[MP] resolved ' + clsName + ' — hooking ctor + all methods');
  hookConstructors(cls, clsName);
  enumerateAndHook(cls, clsName);
}

function start() {
  if (typeof Java === 'undefined' || !Java.available) {
    console.log('[MP] FATAL: Java runtime not available');
    return;
  }
  Java.perform(function () {
    TARGET_CLASSES.forEach(function (c) {
      try { hookClass(c); } catch (e) { console.log('[MP] hookClass err ' + c + ': ' + e); }
    });
    console.log('[MP] armed — capture a motion-photo / HEIF still on the STOCK camera now ' +
                '(on LOS these are no-op stub classes).');
  });
}
start();

// Run (ALWAYS attach, NEVER spawn):
//   P=$(adb shell 'su -c "pidof com.oplus.camera"' | tr -d '\r')
//   frida -U -p "$P" -l tools/frida/trace_motionphoto.js
