// trace_edr_invocation.js — capture the STOCK EDR-invocation contract (D4/G6 expected-behaviour point).
// =============================================================================
// FP-DECODE FIX (2026-06-14, R3/B2): the float args previously printed garbage
// (ratio=-1e10) because args[n].readFloat() reinterprets an INTEGER-arg-register
// NativePointer — but on aarch64 the AAPCS64 float/double params arrive in the SIMD
// registers v0..v7 (d0..d7), NOT in the x0..x7 integer regs that Frida's `args[]`
// array maps. The fix reads the FLOAT args from this.context.d0..d7 (Frida exposes
// the SIMD regs as context.d0.. on arm64) and reinterprets the low 32 bits as a
// 32-bit float:  setEdrSdrRatio(sc, float[d0], bool) -> ratio = d0;
//                setExtendedRangeBrightness(sc, float[d0], float[d1]) -> d0,d1.
// The OplusEdrViewTransform dump is UNCHANGED — its 16 floats are read from a MEMORY
// pointer (the 2nd arg ptr, +0x1C transform[16]) via readFloat over the 64-byte blob,
// which was already correct (memory, not a register). Only the register-arg decode moved.
// =============================================================================
// On STOCK OOS the OnePlus EDR tonemap is driven by the OEM libgui write side
// (SurfaceComposerClient::Transaction::setEdr*) fed by the Java surface
// com.oplus.view.OplusEdrUtils. This probe records BOTH levels:
//   (1) NATIVE libgui.so — the layer_state_t write ABI recovered in doc-49
//       (rearch/49-libgui-edr-abi-re.md): the setEdr* family + the
//       OplusEdrViewTransform (0x5C/92-byte) struct that carries the 4x4
//       tonemap matrix (transform[16]).
//   (2) JAVA OplusEdrUtils — the invocation contract feeding the native side
//       (getBlastSurfaceControl/getSurfaceControl/setEdrSdrRatio/setEdrFlags/
//       setEdrAnimDuration), the D4 §(a) Java entry points called by
//       PreviewHDRControl.A()/B().
//
// WHY STOCK ONLY: on LOS the OplusEdrUtils stub is a no-op
// (getBlastSurfaceControl()->null, setEdr*->false, per E1-stubs.md §(e)/(f))
// so NOTHING here fires — this captures the working contract to port against.
//
// OFFSETS ARE BUILD-PINNED to OOS .201 (V16.1.0 = 16.0.7.201, aarch64). doc-49
// offsets are image_base 0x100000, so we attach at base.add(off - 0x100000).
// p_vaddr==p_offset for this ELF, so file offset == vaddr. Native attach prefers
// the mangled exported SurfaceComposerClient::Transaction::setEdr* symbols
// (doc-49 §"Recovered method signatures"); offset-attach is the fallback.
//
// ⚠️ ALWAYS ATTACH, NEVER SPAWN. Attach to a LIVE com.oplus.camera. All memory
//    reads are guarded (try/catch); if libgui is not yet loaded we poll.
// =============================================================================
'use strict';

var LIB = 'libgui.so';
var IMAGE_BASE = 0x100000; // doc-49 offsets are image_base 0x100000; subtract for module-relative.

// OplusEdrViewTransform (92 bytes / 0x5C) — doc-49 §"OplusEdrViewTransform struct":
//   +0x00 int32 field0   +0x04 int32 field1   +0x08 int32 field2
//   +0x0C Rect region (4x int32: left,top,right,bottom)
//   +0x1C float transform[16] (64-byte blob = the 4x4 EDR tonemap/gainmap matrix)
var EVT_SIZE = 0x5C;

// doc-49 §"Recovered method signatures" — offset (image_base 0x100000) + mangled
// SurfaceComposerClient::Transaction:: symbol. We attach the named ones the task
// asked for; the symbol is tried first, offset second.
var NATIVE_HOOKS = [
  {
    name: 'setEdrViewTransform',
    off: 0x27fd48,
    // setEdrViewTransform(const sp<SurfaceControl>&, OplusEdrViewTransform&&, int slot)
    sym: '_ZN7android21SurfaceComposerClient11Transaction19setEdrViewTransformERKNS_2spINS_14SurfaceControlEEEONS_20OplusEdrViewTransformEi',
    kind: 'viewTransform'
  },
  {
    name: 'setEdrSdrRatio',
    off: 0x280278,
    // setEdrSdrRatio(const sp<SurfaceControl>&, float ratio, bool)
    sym: '_ZN7android21SurfaceComposerClient11Transaction14setEdrSdrRatioERKNS_2spINS_14SurfaceControlEEEfb',
    kind: 'ratio'
  },
  {
    name: 'setExtendedRangeBrightness',
    off: 0x1db130,
    // STD AOSP: setExtendedRangeBrightness(const sp<SurfaceControl>&, float currentRatio, float desiredRatio)
    sym: '_ZN7android21SurfaceComposerClient11Transaction26setExtendedRangeBrightnessERKNS_2spINS_14SurfaceControlEEEff',
    kind: 'ratio2'
  },
  {
    name: 'setEdrMetadata',
    off: 0x27ffb8,
    // setEdrMetadata(const sp<SurfaceControl>&, std::vector<uint8_t>&&, int slot)
    sym: '_ZN7android21SurfaceComposerClient11Transaction14setEdrMetadataERKNS_2spINS_14SurfaceControlEEEONSt3__16vectorIhNS6_9allocatorIhEEEEi',
    kind: 'metadata'
  },
  {
    name: 'setEdrFlags',
    off: 0x27fbbc,
    // setEdrFlags(const sp<SurfaceControl>&, int)
    sym: '_ZN7android21SurfaceComposerClient11Transaction11setEdrFlagsERKNS_2spINS_14SurfaceControlEEEi',
    kind: 'flags'
  },
  {
    name: 'setEDREffectFlag',
    off: 0x280a30,
    // setEDREffectFlag(const sp<SurfaceControl>&, bool)
    sym: '_ZN7android21SurfaceComposerClient11Transaction16setEDREffectFlagERKNS_2spINS_14SurfaceControlEEEb',
    kind: 'effectFlag'
  }
];

// frida-17: static Module.*ExportByName removed -> instance method (doc-50)
function gx(lib, sym){ var m = Process.findModuleByName(lib); return m ? m.findExportByName(sym) : null; }
function hexptr(p) { return p ? p.toString() : 'null'; }

// Read the OplusEdrViewTransform (0x5C) at a pointer and pretty-print field0/1/2,
// the Rect, and the 16-float tonemap matrix. Fully guarded — a bad ptr must not crash.
function dumpViewTransform(p) {
  if (!p || p.isNull()) { console.log('[EDR]       OplusEdrViewTransform: <null ptr>'); return; }
  try {
    var f0 = p.add(0x00).readS32();
    var f1 = p.add(0x04).readS32();
    var f2 = p.add(0x08).readS32();
    var l = p.add(0x0c).readS32();
    var t = p.add(0x10).readS32();
    var r = p.add(0x14).readS32();
    var b = p.add(0x18).readS32();
    console.log('[EDR]       OplusEdrViewTransform @' + hexptr(p) +
                ' field0=' + f0 + ' field1=' + f1 + ' field2=' + f2 +
                ' region=[' + l + ',' + t + ',' + r + ',' + b + ']');
    var m = [];
    for (var i = 0; i < 16; i++) {
      try { m.push(p.add(0x1c + i * 4).readFloat().toFixed(4)); }
      catch (e) { m.push('?'); }
    }
    // 4x4 tonemap matrix, one row per line (4 floats each).
    for (var row = 0; row < 4; row++) {
      console.log('[EDR]         transform[' + row + ']: ' +
                  m.slice(row * 4, row * 4 + 4).join('  '));
    }
  } catch (e) {
    console.log('[EDR]       OplusEdrViewTransform read err: ' + e +
                ' raw=' + safeHex(p, EVT_SIZE));
  }
}

function safeHex(p, len) {
  try { return hexdump(p, { length: len, header: false, ansi: false }).replace(/\n/g, ' | '); }
  catch (e) { return '<unreadable>'; }
}

// Build the onEnter handler for a given native hook kind.
//   NOTE (FP-DECODE FIX): the SurfaceControl& integer args still come from a[] (x0..x7),
//   but the FLOAT args (ratio / currentRatio / desiredRatio) are read from this.context
//   SIMD regs d0..d7 — see fpFromContext() below. The bool/int/slot args stay on a[].
function makeOnEnter(h) {
  return function (a) {
    try {
      // All are Transaction members: a[0]=this(Transaction*), a[1]=const sp<SurfaceControl>&.
      var sc = a[1];
      var ctx = this.context;   // InvocationContext.context exposes the aarch64 reg file (d0..d7 SIMD)
      var line = '[EDR] native ' + h.name + ' sc=' + hexptr(sc);
      switch (h.kind) {
        case 'viewTransform':
          // (sc, OplusEdrViewTransform&& [a2], int slot [a3])
          line += ' slot=' + a[3].toInt32();
          console.log(line);
          dumpViewTransform(a[2]);   // 16 floats read from MEMORY (the a2 ptr) — already correct
          break;
        case 'ratio':
          // (sc, float ratio, bool [a2]) — the FLOAT is in d0 (1st FP arg), NOT a[2].
          // a[2] here is the first INTEGER-class arg after sc = the bool.
          line += ' ratio=' + fpFromContext(ctx, 0) + ' bool=' + (a[2].toInt32() & 1);
          console.log(line);
          break;
        case 'ratio2':
          // STD: (sc, float currentRatio, float desiredRatio) — both FLOATS are FP args d0,d1.
          line += ' currentRatio=' + fpFromContext(ctx, 0) + ' desiredRatio=' + fpFromContext(ctx, 1);
          console.log(line);
          break;
        case 'metadata':
          // (sc, std::vector<uint8_t>&& [a2], int slot [a3])
          line += ' slot=' + a[3].toInt32() + ' vec@' + hexptr(a[2]);
          console.log(line);
          break;
        case 'flags':
          // (sc, int [a2])
          line += ' flags=' + a[2].toInt32();
          console.log(line);
          break;
        case 'effectFlag':
          // (sc, bool [a2])
          line += ' effect=' + (a[2].toInt32() & 1);
          console.log(line);
          break;
        default:
          console.log(line);
      }
    } catch (e) {
      console.log('[EDR] native ' + h.name + ' arg-read err: ' + e);
    }
  };
}

// FP-DECODE FIX: read the Nth float argument from the aarch64 SIMD register file.
// On AAPCS64 float/double params land in v0..v7 (d0..d7), separate from the x0..x7
// integer regs that Frida's args[] maps — so reading args[n].readFloat() decoded an
// integer pointer (the -1e10 garbage). Frida exposes the SIMD regs on the
// InvocationContext as context.d0..d7 (a NativePointer-like holding the 64-bit value).
// A C++ `float` param occupies the LOW 32 bits of dN; we materialize those 8 bytes and
// reinterpret the low word as a 32-bit IEEE-754 float. Fully guarded.
function fpFromContext(ctx, n) {
  try {
    var reg = ctx['d' + n];                  // Frida arm64: context.d0..d7, a NativePointer (64-bit d-reg value)
    if (reg === undefined || reg === null) return '(no d' + n + ' reg)';
    // Stash the 64-bit d-register value into scratch memory, read its low 32 bits as a float.
    var scratch = Memory.alloc(8);
    scratch.writePointer(ptr(reg.toString()));        // d-reg holds the 64-bit value; low word = the C++ float
    return scratch.readFloat().toFixed(4);
  } catch (e) {
    try { return '(d' + n + ' bits=' + String(ctx['d' + n]) + ')'; }
    catch (e2) { return '?'; }
  }
}

function resolveNative(m, h) {
  // 1) Prefer the mangled exported symbol (robust across image-base changes).
  try {
    var byName = (m.findExportByName && m.findExportByName(h.sym)) ||
                 gx(LIB, h.sym);
    if (byName) return { addr: byName, via: 'symbol' };
  } catch (e) {}
  // 2) Fall back to doc-49 offset-attach (image_base 0x100000 -> module-relative).
  try {
    return { addr: m.base.add(h.off - IMAGE_BASE), via: 'offset(0x' + h.off.toString(16) + '-imgbase)' };
  } catch (e) {
    return null;
  }
}

var nativeHooked = false;
function hookNative() {
  var m = Process.findModuleByName(LIB);
  if (!m) return false;
  if (nativeHooked) return true;
  console.log('[EDR] ' + LIB + ' base=' + m.base + ' — installing native EDR hooks (doc-49 ABI)');
  NATIVE_HOOKS.forEach(function (h) {
    var r = resolveNative(m, h);
    if (!r || !r.addr) { console.log('[EDR]   MISS ' + h.name + ' (no symbol + no offset)'); return; }
    try {
      Interceptor.attach(r.addr, { onEnter: makeOnEnter(h) });
      console.log('[EDR]   hooked ' + h.name + ' @' + r.addr + ' via ' + r.via);
    } catch (e) {
      console.log('[EDR]   FAIL ' + h.name + ' @' + r.addr + ' via ' + r.via + ': ' + e);
    }
  });
  nativeHooked = true;
  return true;
}

// ── JAVA side: com.oplus.view.OplusEdrUtils — the invocation contract feeding native ──
// Hook all overloads of each named method, log entry args + return. On LOS these
// are no-ops (return null/false) so they "fire" but show the stub; on STOCK they
// drive the native setEdr* path above.
var JAVA_METHODS = [
  'getBlastSurfaceControl',
  'getSurfaceControl',
  'setEdrSdrRatio',
  'setEdrFlags',
  'setEdrAnimDuration',
  'setEdrViewTransform'  // hooked if present (per task: "any setEdrViewTransform if present")
];

function argsToStr(args) {
  var out = [];
  for (var i = 0; i < args.length; i++) {
    try { out.push(args[i] === null ? 'null' : String(args[i])); }
    catch (e) { out.push('<arg' + i + '?>'); }
  }
  return out.join(', ');
}

function hookJavaMethod(cls, mName) {
  try {
    var m = cls[mName];
    if (!m) { console.log('[EDR] java OplusEdrUtils.' + mName + ' <absent>'); return; }
    if (!m.overloads || m.overloads.length === 0) {
      console.log('[EDR] java OplusEdrUtils.' + mName + ' <no overloads>');
      return;
    }
    m.overloads.forEach(function (ov, idx) {
      try {
        ov.implementation = function () {
          var ret;
          var argStr = argsToStr(arguments);
          try {
            ret = ov.apply(this, arguments);
          } catch (e) {
            console.log('[EDR] java OplusEdrUtils.' + mName + '#' + idx +
                        '(' + argStr + ') THREW ' + e);
            throw e;
          }
          console.log('[EDR] java OplusEdrUtils.' + mName + '#' + idx +
                      '(' + argStr + ') -> ' + (ret === null ? 'null' : String(ret)));
          return ret;
        };
        console.log('[EDR]   hooked java OplusEdrUtils.' + mName + '#' + idx);
      } catch (e) {
        console.log('[EDR]   FAIL hook java OplusEdrUtils.' + mName + '#' + idx + ': ' + e);
      }
    });
  } catch (e) {
    console.log('[EDR] java OplusEdrUtils.' + mName + ' hook err: ' + e);
  }
}

function hookJava() {
  if (typeof Java === 'undefined' || !Java.available) {
    console.log('[EDR] Java runtime not available — skipping Java-side hooks');
    return;
  }
  Java.perform(function () {
    var cls = null;
    try {
      cls = Java.use('com.oplus.view.OplusEdrUtils');
    } catch (e) {
      console.log('[EDR] com.oplus.view.OplusEdrUtils not resolvable from this classloader: ' + e);
      return;
    }
    console.log('[EDR] java OplusEdrUtils resolved — hooking invocation contract');
    JAVA_METHODS.forEach(function (mName) { hookJavaMethod(cls, mName); });
  });
}

// ── bootstrap ──
function start() {
  hookJava();
  if (!hookNative()) {
    console.log('[EDR] ' + LIB + ' not loaded yet — polling for native EDR ABI…');
    var t = setInterval(function () { if (hookNative()) clearInterval(t); }, 400);
  }
  console.log('[EDR] armed — exercise the STOCK camera on an HDR scene now ' +
              '(on LOS the OplusEdrUtils stub is a no-op, so nothing fires).');
}
start();

// Run (ALWAYS attach, NEVER spawn — offsets pinned to OOS .201 / V16.1.0):
//   P=$(adb shell 'su -c "pidof com.oplus.camera"' | tr -d '\r')
//   frida -U -p "$P" -l tools/frida/trace_edr_invocation.js
