// enable_ocs_sdk_log.ts  (lead, 2026-06-03 — SDK-OLog equivalent)
// =============================================================================
// Force the OCS camera SDK's OWN loggers to MAX verbosity inside com.oplus.camera,
// so we can READ what the SDK reports about: library load (unit.sdk / .adapter /
// JNI), vendor-tag/capability init (setIsVendorTagConfigInitialize), session
// configure, and the APS HDR decision (Util.isHdrOn). This is the SDK-side analog
// of enable_olog_oemlayer.js (which flipped the native oemlayer log globals).
//
// The SDK is DEOBFUSCATED (/mnt/c/temp/ocssdkfull/sources) — real class/field names
// resolve via Java.use directly. Frida 17 dropped the global `Java` bridge, so this
// MUST be built as a frida-compiled bundle (import frida-java-bridge).
//
// COMPILE (in the project that has frida-java-bridge):
//   cd /home/vivy/op15-work/fridaproj
//   node_modules/.bin/frida-compile enable_ocs_sdk_log.ts -o \
//     /home/vivy/op15-camera-porting/tools/frida/enable_ocs_sdk_log.compiled.js
//   (first: cp /home/vivy/op15-camera-porting/tools/frida/enable_ocs_sdk_log.ts \
//      /home/vivy/op15-work/fridaproj/)
//
// RUN (attach to the APP, AFTER preview is up so the SDK classes are loaded):
//   python3 tools/frida/run_gcvt_once.py $(adb shell pidof com.oplus.camera) \
//     tools/frida/enable_ocs_sdk_log.compiled.js 120
//   (with `adb logcat -b all -v time` capturing in another shell)
//
// CHEAP NATIVE/PROP PATH (try FIRST, no frida — sets the SDK's own gates at process
// start; some loggers read these):
//   adb shell setprop persist.sys.assert.panic 1            # ALog/Logger gate (Logger.sDEBUG; CameraUnitLog.isDebugLogOn one input)
//   adb shell setprop oplus.autotest.camera.debug.forcelog 1 # CameraUnitLog.isDebugLogOn primary gate
//   then am force-stop com.oplus.camera ; relaunch.
//   NOTE: props only take effect at the NEXT cold start (initLog reads them once),
//   and CameraUnitLog.isDebugLogOn() also requires non-MP/trial conditions, so the
//   frida path below is the RELIABLE force. ALog.sEnable is NOT prop-driven at all
//   (only setALogEnable) — frida is required to route SDK logs through the JNI ALog.
// =============================================================================
import Java from 'frida-java-bridge';

function log(m: string) { send('[OCSLOG] ' + m); }

// Resolve a class across all classloaders (the SDK runs in a uses-library loader).
function resolveClass(name: string): any {
  try { return Java.use(name); } catch (e) {}
  let hit: any = null;
  Java.enumerateClassLoaders({
    onMatch: function (loader: any) { if (hit) return; try { hit = (Java as any).ClassFactory.get(loader).use(name); } catch (e) {} },
    onComplete: function () {}
  });
  return hit;
}

// Set a static boolean field if present (best-effort; logs result).
function setBool(cls: any, field: string, val: boolean): string {
  if (cls === null) return field + '=<no-class>';
  try {
    const f = cls[field];
    if (f === undefined) return field + '=<no-field>';
    const before = f.value;
    f.value = val;
    return field + '=' + before + '->' + f.value;
  } catch (e) { return field + '=ERR(' + e + ')'; }
}

function enableAll(): boolean {
  // ---- ALog: the native APSClient-alog-jni bridge. The KEY one: when ALog.isEnable()
  //      is true, CameraUnitLog/ApsAdapterLog route EVERY d/i/v/w through ALog (the
  //      SDK's own ring buffer + logcat). Default sEnable=false. ----
  const ALog = resolveClass('com.oplus.ocs.camera.consumer.apsAdapter.ALog');
  let aRes = 'ALog=<no-class>';
  if (ALog !== null) {
    let parts: string[] = [];
    // Prefer the proper setter (also calls the native setEnable); fall back to field.
    try { ALog.setALogEnable(true); parts.push('setALogEnable(true)ok'); } catch (e) { parts.push('setALogEnable ERR ' + e); }
    parts.push(setBool(ALog, 'sEnable', true));
    // Leave encryption OFF so messages land in plaintext logcat (encrypt routes to ring only).
    parts.push(setBool(ALog, 'sLogEncryptEnable', false));
    let jniFailed = '?'; try { jniFailed = '' + ALog.sJNILoadFailed.value; } catch (e) {}
    aRes = 'ALog[' + parts.join(', ') + ', sJNILoadFailed=' + jniFailed + ']';
  }

  // ---- CameraUnitLog: primary SDK logger. Gate = sbLogOn (default true) but
  //      isDebugLogOn() can flip it off; force sbLogOn/sbTraceOn/sbLaoOn=true,
  //      sBlockNonLaoLog=false. Also call initLog(true,true,true) to re-seed the
  //      downstream ApsAdapterLog gates coherently. ----
  const CUL = resolveClass('com.oplus.ocs.camera.common.util.CameraUnitLog');
  let cRes = 'CameraUnitLog=<no-class>';
  if (CUL !== null) {
    let parts: string[] = [];
    parts.push(setBool(CUL, 'sbLogOn', true));
    parts.push(setBool(CUL, 'sbTraceOn', true));
    parts.push(setBool(CUL, 'sbLaoOn', true));
    parts.push(setBool(CUL, 'sBlockNonLaoLog', false));
    try { CUL.initLog(true, true, true); parts.push('initLog(t,t,t)ok'); } catch (e) { parts.push('initLog ERR ' + e); }
    cRes = 'CameraUnitLog[' + parts.join(', ') + ']';
  }

  // ---- ApsAdapterLog: APS-adapter logger (same gate family). CameraUnitLog.initLog
  //      already re-seeds it, but set fields directly too in case initLog wasn't reached. ----
  const AAL = resolveClass('com.oplus.ocs.camera.consumer.apsAdapter.ApsAdapterLog');
  let adRes = 'ApsAdapterLog=<no-class>';
  if (AAL !== null) {
    let parts: string[] = [];
    parts.push(setBool(AAL, 'sbLogOn', true));
    parts.push(setBool(AAL, 'sbTraceOn', true));
    parts.push(setBool(AAL, 'sbLaoOn', true));
    parts.push(setBool(AAL, 'sBlockNonLaoLog', false));
    adRes = 'ApsAdapterLog[' + parts.join(', ') + ']';
  }

  // ---- IPULog: IPU/extension SDK logger. Gate = sbLogOn (default true). ----
  const IPU = resolveClass('com.oplus.ocs.camera.ipusdk.IPULog');
  let iRes = 'IPULog=<no-class>';
  if (IPU !== null) {
    let parts: string[] = [];
    parts.push(setBool(IPU, 'sbLogOn', true));
    parts.push(setBool(IPU, 'sbTraceOn', true));
    parts.push(setBool(IPU, 'sbLaoOn', true));
    iRes = 'IPULog[' + parts.join(', ') + ']';
  }

  // ---- Logger (com.oplus.utils): gate = sDEBUG (prop persist.sys.assert.panic).
  //      Force via setDebug(true). ----
  const LGR = resolveClass('com.oplus.utils.Logger');
  let lRes = 'Logger=<no-class>';
  if (LGR !== null) {
    let parts: string[] = [];
    try { LGR.setDebug(true); parts.push('setDebug(true)ok'); } catch (e) { parts.push('setDebug ERR ' + e); }
    parts.push(setBool(LGR, 'sDEBUG', true));
    lRes = 'Logger[' + parts.join(', ') + ']';
  }

  // Count how many loggers we actually found, to know if we attached too early.
  const found = [ALog, CUL, AAL, IPU, LGR].filter(function (c) { return c !== null; }).length;
  log('SET ' + found + '/5 loggers: ' + aRes + ' | ' + cRes + ' | ' + adRes + ' | ' + iRes + ' | ' + lRes);
  return found > 0;
}

Java.perform(function () {
  if (!(Java as any).available) { log('FATAL: Java runtime not available'); return; }
  log('attached; enabling OCS SDK loggers (attach AFTER preview is up so SDK classes are loaded)');
  let ok = enableAll();
  if (!ok) { log('no SDK loggers resolved yet — will retry'); }

  // Re-assert periodically: the SDK calls CameraUnitLog.initLog(context) during a
  // cold camera open (ExtensionClient/CameraConfigHelper) which can RESET the gates
  // from props. Re-flipping every 1s keeps VERBOSE on across the config window.
  let ticks = 0;
  setInterval(function () {
    ticks++;
    enableAll();
    if (ticks % 10 === 0) log('re-assert t=' + ticks + 's');
  }, 1000);
});
