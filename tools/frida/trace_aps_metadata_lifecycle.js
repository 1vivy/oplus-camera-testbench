// trace_aps_metadata_lifecycle.js — APS metadata LIFECYCLE ordering probe (sub-contract (b))
// =============================================================================
// PURPOSE: capture, per preview/capture frame, the EXACT metadata lifetime invariant stock holds —
// the ordering the port's libapsfixup shim must NOT break:
//
//     incref (isInc=true)  ->  copyMetadata(src,dst)  ->  decref (isInc=false)  ->  release@0
//                                                                                 (decMetaRefZeroToRemove)
//
// B4 EXTENSION (2026-06-14, inc side): the prior probe caught the RELEASE upcall (isInc=false) +
// the decZero@0 release; this adds the INCREF side — all setMetaImageRef(Object,String,Z) overloads
// are hooked, the isInc DIRECTION (the Z arg) is read, a running inc-dec `balance` counter is kept,
// and metaBufferMap.size() is sampled each event (else the balance is the proxy). One comparable
// record per ref event: [JAVA setMetaImageRef] dir=<INC|dec> balance=<n> mapSize=<n>. STOCK target:
// balance ~= 0 + map bounded ~2-4. LOS diff target: inc >> dec, balance + map climb toward 20
// (pool exhaust) = the clean #1/#4 diff. Release-upcall hooks below are UNCHANGED.
//
// WHY THIS MATTERS: stock is CLEAN on burst (D2: #4 copyMetadata UAF=False x9, 0 tombstones, the
// source camera_metadata survives to DeferJob::startCapture->copyMetadata; the per-preview decref
// JNI upcall fires so metaBufferMap stays bounded ~2-4). This probe records that clean ORDERING +
// CADENCE so a port A/B can prove the shim preserves it. libapsfixup itself does NOT touch this
// lifecycle (libapsfixup-interposition-RE.md: its only metadata symbol is a copyMetadata UAF
// null-guard, NOT part of the refcount ordering) — so any divergence is upstream, and this probe
// is the lifetime oracle that localizes it.
//
// THE LIFECYCLE SITES (RE-anchored; do not fabricate):
//   NATIVE (libAlgoProcess.so, file off = Ghidra addr - 0x100000; image base 0; attach = base.add(off)):
//     * APSMetadata::copyMetadata(camera_metadata const*)        file 0x292960 (Ghidra 0x392960)
//         the #4 UAF site (copyMetadata+60 = +0x3c). arg0=src camera_metadata*, ret=dst (heap copy / null).
//     * ApsCallbackMetaRefInc::preProcess                        file 0x31f680 (Ghidra 0x41f680)
//         the SINGLE native site that builds the {image,pipelienName,isInc} params for BOTH inc AND
//         dec (there is ONE ApsCallbackMetaRefInc class — no separate ...MetaRefDec). It fires once
//         per ref event; the isInc DIRECTION is read on the Java side (setMetaImageRef's Z arg).
//     * ApsCallbackMetaRefInc::callbackToCamUnit                 file 0x31fa1c (Ghidra 0x41fa1c)
//         THE UPCALL: (**(this+8))(JNIAction=2, this+0x18 params, this+0x30 out) -> camera-unit JNI
//         -> Java APSClient$MetaImageRefCounter.decMetaRefZeroToRemove(JII)V (gated isInc==false).
//         This is the per-preview RELEASE signal (decmetarefzero-upcall-RE.md).
//   JAVA (com.oplus.ocs.camera.consumer.apsAdapter.APSClient$MetaImageRefCounter):
//     * setMetaImageRef(Object,String,Z) : Z   = INCREF (the boolean Z IS isInc). per submitted frame.
//     * decMetaRefZeroToRemove(J,I,I) : V       = DECREF + Image.close() when the ref hits 0.
//         For PREVIEW this is a PURE native JNI upcall (0 Java callers in preview path; doc-44 U6);
//         Java callers exist only for video/flush. metaBufferMap holds the per-image int[6] refs.
//
// SAFETY / RUNTIME MODEL:
//   * ATTACH ONLY — never spawn. Runs APP-side in com.oplus.camera (the APS consumer process).
//   * Native hooks are LOW-FREQUENCY per-frame markers (copyMetadata + the ref callback), filtered +
//     throttled. The Java hooks (setMetaImageRef / decMetaRefZeroToRemove) are the documented
//     "frida-Java OK" decisive sites (rearch/44 DECISIVE on-device test). metaBufferMap.size() read
//     is reflective + try/guarded.
//   * Poll-until-loaded for libAlgoProcess.so (attach-by-name catches the launch burst).
//   * HOST-ONLY AUTHORING: do NOT run from the host harness; another process owns the device.
//
// RUN (on an UNFROZEN / working build, app already at preview):
//   adb root && adb shell setenforce 0
//   frida -U -n com.oplus.camera -l tools/frida/trace_aps_metadata_lifecycle.js > /tmp/aps_meta_lifecycle.txt
//   >>> let preview run a few seconds; take ONE Photo + ONE back-to-back burst <<<
// =============================================================================
'use strict';

// ── tunables ────────────────────────────────────────────────────────────────
var MAX_LOG_PER_HOOK = 200;     // per-hook cap (preview ref events are frequent)
var TALLY_MS = 4000;            // periodic cadence/ordering tally
var MOD = 'libAlgoProcess.so';

// ── libAlgoProcess file offsets (image base 0; attach = module.base + off) ──────────────────
// Ghidra (oos-baseline-v3, BuildID 82fe443b...) addr - 0x100000 = file off, RE-verified this session.
var OFF_COPYMETA       = 0x292960;  // APSMetadata::copyMetadata(camera_metadata const*)  (Ghidra 0x392960)
var OFF_METAREF_PRE    = 0x31f680;  // ApsCallbackMetaRefInc::preProcess                  (Ghidra 0x41f680)
var OFF_METAREF_UPCALL = 0x31fa1c;  // ApsCallbackMetaRefInc::callbackToCamUnit (the upcall, Ghidra 0x41fa1c)

// ── Java target (decmetarefzero-upcall-RE.md / D3 / rearch-44) ──────────────────────────────
var JAVA_REFCOUNTER = 'com.oplus.ocs.camera.consumer.apsAdapter.APSClient$MetaImageRefCounter';

// ── helpers ─────────────────────────────────────────────────────────────────
function ts() { return '[' + (Date.now() % 1000000) + ']'; }
function hx(p) { try { return p ? p.toString() : 'null'; } catch (e) { return '?'; } }

// throttle bookkeeping + ordering tally
var counts = {};
function gate(hook) {
  counts[hook] = (counts[hook] || 0) + 1;
  return counts[hook] <= MAX_LOG_PER_HOOK;
}
// lifecycle event tally — proves the ORDERING/cadence per run
//   B4 EXTENSION (inc side): incDir/decDir count setMetaImageRef(Z) by direction; `balance` is the
//   running inc-dec on the Java refcount path; mapSizeLast samples metaBufferMap.size() when reachable.
//   STOCK expect: balance ~ 0 + bounded, mapSize ~2-4. LOS diff target: inc>>dec, balance + map climb -> 20.
var tally = { incref: 0, copyMeta: 0, copyMetaNull: 0, refPre: 0, upcall: 0, decZero: 0,
              incDir: 0, decDir: 0, balance: 0, mapSizeLast: -1, mapSizeMax: -1 };
function noteMapSize(sz) {
  if (typeof sz === 'number' && sz >= 0) {
    tally.mapSizeLast = sz;
    if (sz > tally.mapSizeMax) tally.mapSizeMax = sz;
  }
}

// ── module resolution (attach-by-name, poll for the launch burst) ───────────────────────────
function getMod() {
  try { var m = Process.findModuleByName(MOD); if (m) return m; } catch (e) {}
  try { var arr = Process.enumerateModules();
    for (var i = 0; i < arr.length; i++) if (arr[i].name.indexOf('libAlgoProcess') >= 0) return arr[i];
  } catch (e2) {}
  return null;
}

// =============================================================================
// NATIVE side — copyMetadata + the MetaRefInc ref callback + the release upcall
// =============================================================================
function armNativeHooks(m) {
  // (1) APSMetadata::copyMetadata(src) -> dst : the COPY event (and the #4 UAF site).
  Interceptor.attach(m.base.add(OFF_COPYMETA), {
    onEnter: function (a) { this.src = a[1]; },   // x1 = camera_metadata const* src (x0 = this/APSMetadata)
    onLeave: function (ret) {
      tally.copyMeta++;
      var nullRet = (!ret || ret.isNull());
      if (nullRet) tally.copyMetaNull++;
      if (!gate('copyMetadata')) return;
      console.log(ts() + ' [NATIVE copyMetadata] src=' + hx(this.src) + ' dst=' + hx(ret) +
                  (nullRet ? '  <<< NULL (freed/insane source — UAF guard or empty)' : ''));
    }
  });
  console.log('[hook] (N) APSMetadata::copyMetadata @ ' + m.base.add(OFF_COPYMETA) + ' (' + MOD + ' +0x' + OFF_COPYMETA.toString(16) + ')');

  // (2) ApsCallbackMetaRefInc::preProcess : the single native site that builds the {image,
  //     pipelienName, isInc} params for BOTH inc and dec. A per-ref-event marker. We log the
  //     callback_data image/pipelineName source fields (*x2 + 0x28 image, *x2 + 0x480 pipeName);
  //     the isInc DIRECTION is authoritatively read on the Java side below.
  Interceptor.attach(m.base.add(OFF_METAREF_PRE), {
    onEnter: function (a) {
      tally.refPre++;
      if (!gate('MetaRefInc.preProcess')) return;
      var img = 'null', cdata = null;
      try { cdata = a[2].readPointer(); } catch (e) {}          // x2 = &vector<callback_data_t>; *x2 = callback_data_t*
      try { if (cdata) img = hx(cdata.add(0x28).readPointer()); } catch (e2) {}  // callback_data + 0x28 = image obj
      console.log(ts() + ' [NATIVE MetaRefInc.preProcess] cdata=' + hx(cdata) + ' image=' + img +
                  '  (builds {image,pipelienName,isInc} params; isInc dir -> Java setMetaImageRef Z arg)');
    }
  });
  console.log('[hook] (N) ApsCallbackMetaRefInc::preProcess @ ' + m.base.add(OFF_METAREF_PRE) + ' (+0x' + OFF_METAREF_PRE.toString(16) + ')');

  // (3) ApsCallbackMetaRefInc::callbackToCamUnit : THE UPCALL (JNIAction=2) -> camera-unit JNI ->
  //     Java decMetaRefZeroToRemove. The per-preview RELEASE signal. Fires on the pipeline-result
  //     thread (NOT previewManagerRoutine). On a working preview this cadence ~ the consumed-frame rate.
  Interceptor.attach(m.base.add(OFF_METAREF_UPCALL), {
    onEnter: function () {
      tally.upcall++;
      if (!gate('MetaRefInc.callbackToCamUnit')) return;
      var th = '?'; try { th = Process.getCurrentThreadId(); } catch (e) {}
      console.log(ts() + ' [NATIVE MetaRefInc.callbackToCamUnit] >> UPCALL JNIAction=2 (RELEASE signal) tid=' + th);
    }
  });
  console.log('[hook] (N) ApsCallbackMetaRefInc::callbackToCamUnit @ ' + m.base.add(OFF_METAREF_UPCALL) + ' (+0x' + OFF_METAREF_UPCALL.toString(16) + ')');
}

// =============================================================================
// JAVA side — the refcount bookkeeping (incref + decref-at-zero), the isInc direction + map size
// =============================================================================
function armJavaHooks() {
  if (typeof Java === 'undefined' || !Java.available) {
    console.log('[hook] (J) Java VM not available — native-only this run');
    return;
  }
  Java.perform(function () {
    var Ref = null;
    try { Ref = Java.use(JAVA_REFCOUNTER); }
    catch (e) {
      console.log('[hook] (J) ' + JAVA_REFCOUNTER + ' NOT loadable (' + e + ') — class not yet loaded or name differs');
      return;
    }

    // size of metaBufferMap (the bounded-vs-climbing invariant). Read reflectively + guarded.
    function mapSize(self) {
      try {
        var f = self.metaBufferMap;
        if (f) { var v = f.value; if (v && v.size) return v.size(); }
      } catch (e) {}
      return -1;   // field not reachable from this instance — report -1, never throw
    }

    // (J1) setMetaImageRef(Object,String,Z) : Z  = INCREF (Z arg IS isInc).  [B4 INC-SIDE]
    //   We hook ALL overloads, read the isInc direction (the boolean Z arg), maintain a running
    //   inc-dec `balance`, and sample metaBufferMap.size() each event. Emits ONE comparable record
    //   per ref event:  [JAVA setMetaImageRef] dir=<INC|dec> balance=<n> mapSize=<n>
    function onSetMetaImageRef(self, isInc, pipeName, rc) {
      if (isInc) { tally.incref++; tally.incDir++; tally.balance++; }
      else       { tally.decDir++; tally.balance--; }
      var sz = mapSize(self); noteMapSize(sz);
      if (gate('J.setMetaImageRef')) {
        console.log(ts() + ' [JAVA setMetaImageRef] dir=' + (isInc ? 'INC' : 'dec') +
                    ' isInc=' + isInc + ' pipe="' + pipeName + '"' +
                    ' balance=' + tally.balance + ' mapSize=' + sz +
                    (rc !== undefined ? ' rc=' + rc : '') +
                    '   << ' + (isInc ? 'INCREF' : 'dec (non-zero path)') +
                    ' (STOCK: balance~0 bounded; LOS diff: inc>>dec, balance+map climb->20)');
      }
    }
    var hookedPrimary = false;
    try {
      var ovl = Ref.setMetaImageRef.overload('java.lang.Object', 'java.lang.String', 'boolean');
      ovl.implementation = function (image, pipeName, isInc) {
        var rc = ovl.call(this, image, pipeName, isInc);
        onSetMetaImageRef(this, !!isInc, pipeName, rc);
        return rc;
      };
      hookedPrimary = true;
      console.log('[hook] (J) APSClient$MetaImageRefCounter.setMetaImageRef(Object,String,Z) hooked (INC-side, B4)');
    } catch (e) {
      console.log('[hook] (J) setMetaImageRef(Object,String,Z) exact overload absent (' + e + ') — trying all-overloads');
    }
    // ALSO hook every other overload by name (covers build-variant signatures); the last boolean
    // arg, if present, is read as isInc — else treated as an inc event (matches prior behaviour).
    try {
      Ref.setMetaImageRef.overloads.forEach(function (o) {
        // skip re-hooking the exact (Object,String,boolean) overload we already wrapped above
        if (hookedPrimary && o.argumentTypes && o.argumentTypes.length === 3 &&
            o.argumentTypes[2] && o.argumentTypes[2].className === 'boolean') return;
        o.implementation = function () {
          var argc = arguments.length;
          var last = argc ? arguments[argc - 1] : undefined;
          var isInc = (typeof last === 'boolean') ? last : true; // no bool arg -> treat as inc
          var pipeName = (argc >= 2 && typeof arguments[1] === 'string') ? arguments[1] : '?';
          var rc = o.apply(this, arguments);
          onSetMetaImageRef(this, isInc, pipeName, rc);
          return rc;
        };
      });
      console.log('[hook] (J) setMetaImageRef all-overloads hooked (INC-side balance, B4)');
    } catch (e2) {
      if (!hookedPrimary) console.log('[hook] (J) setMetaImageRef hook failed entirely: ' + e2);
    }

    // (J2) decMetaRefZeroToRemove(J,I,I) : V  = DECREF + Image.close() at zero (the RELEASE@0).
    //      For preview this fires ONLY via the native JNI upcall (no Java caller) — so seeing it
    //      here = the (3) callbackToCamUnit upcall landed in Java. The ordering proof.
    try {
      var ovl2 = Ref.decMetaRefZeroToRemove.overload('long', 'int', 'int');
      ovl2.implementation = function (timestamp, type, limit) {
        tally.decZero++;
        var szBefore = mapSize(this); noteMapSize(szBefore);
        if (gate('J.decMetaRefZeroToRemove')) {
          console.log(ts() + ' [JAVA decMetaRefZeroToRemove] ts=' + timestamp + ' type=' + type +
                      ' limit=' + limit + ' balance=' + tally.balance + ' mapSize(before)=' + szBefore +
                      '   << DECREF/RELEASE@0 (native upcall landed)');
        }
        return ovl2.call(this, timestamp, type, limit);
      };
      console.log('[hook] (J) APSClient$MetaImageRefCounter.decMetaRefZeroToRemove(J,I,I) hooked (RELEASE@0)');
    } catch (e) {
      try {
        Ref.decMetaRefZeroToRemove.overloads.forEach(function (o) {
          o.implementation = function () {
            tally.decZero++;
            if (gate('J.decMetaRefZeroToRemove'))
              console.log(ts() + ' [JAVA decMetaRefZeroToRemove/' + arguments.length + 'args] metaBufferMap.size=' + mapSize(this) + '   << DECREF/RELEASE@0');
            return o.apply(this, arguments);
          };
        });
        console.log('[hook] (J) decMetaRefZeroToRemove hooked via all-overloads fallback');
      } catch (e2) { console.log('[hook] (J) decMetaRefZeroToRemove hook failed: ' + e2); }
    }
  });
}

// =============================================================================
// arm — poll for libAlgoProcess (native), then arm Java (class loads with it)
// =============================================================================
(function main() {
  var m = getMod();
  function arm(mod) {
    console.log(ts() + ' libAlgoProcess.so base=' + mod.base);
    armNativeHooks(mod);
    armJavaHooks();
  }
  if (m && m.base) { console.log(ts() + ' (already loaded)'); arm(m); }
  else {
    console.log(ts() + ' libAlgoProcess.so not loaded yet — polling (attach-by-name catches launch burst)');
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var mm = getMod();
      if (mm && mm.base) { clearInterval(iv); console.log(ts() + ' (loaded after ' + tries + ' polls)'); arm(mm); }
      else if (tries > 200) { clearInterval(iv); console.log(ts() + ' FATAL ' + MOD + ' never loaded'); }
    }, 150);
  }

  // periodic ORDERING/CADENCE tally — the headline result of the run (B4: + inc/dec balance + mapSize)
  setInterval(function () {
    console.log(ts() + ' [TALLY] inc=' + tally.incDir + ' dec=' + tally.decDir +
                ' balance=' + tally.balance + ' mapSize(last=' + tally.mapSizeLast + ' max=' + tally.mapSizeMax + ')' +
                ' | copyMeta=' + tally.copyMeta + ' (null=' + tally.copyMetaNull + ') refPre=' + tally.refPre +
                ' upcall=' + tally.upcall + ' decZero=' + tally.decZero +
                '   << STOCK: balance~0 & mapSize bounded ~2-4 (upcall~decZero tracking inc; releases ~1x/' +
                'consumed frame). LOS diff: inc>>dec, balance + mapSize climb toward MAX_REF_LEN(20) = pool exhaust.');
  }, TALLY_MS);
})();

// =============================================================================
// USAGE
// -----------------------------------------------------------------------------
//   ATTACH (never spawn), app already at preview, on an UNFROZEN/working build:
//     adb root && adb shell setenforce 0
//     frida -U -n com.oplus.camera -l tools/frida/trace_aps_metadata_lifecycle.js > /tmp/aps_meta_lifecycle.txt
//     >>> let preview run a few seconds; take ONE Photo + ONE back-to-back burst <<<
//
//   READ THE RESULT — the per-frame lifecycle ORDERING (sub-contract (b)):
//     incref (setMetaImageRef isInc=true)
//       -> copyMetadata(src,dst)        [non-null dst on stock; src survives = clean lifetime]
//       -> MetaRefInc.preProcess + callbackToCamUnit (JNIAction=2 UPCALL)
//       -> decMetaRefZeroToRemove       [Java RELEASE@0; metaBufferMap.size bounded ~2-4]
//
//   STOCK (clean) signature:  upcall count ~ decZero count, both tracking incref; copyMeta null=0;
//     metaBufferMap.size stays low/bounded. (D2: #4 UAF=False x9; the lifetime invariant holds.)
//   PORT-BROKEN A/B (for comparison): incref keeps firing while upcall/decZero STOP after frame ~1,
//     metaBufferMap.size climbs one/frame toward 20, previewManagerRoutine parks (the freeze) — or a
//     non-null->freed copyMeta src (the #4 UAF). Either divergence localizes the broken lifetime;
//     libapsfixup does NOT touch this path, so the root is upstream (C3/C4 lifetime or C6/D3 release).
//
//   DO NOT RUN FROM THE HOST HARNESS — another process owns the device. Authoring/`node --check` only.
// =============================================================================
