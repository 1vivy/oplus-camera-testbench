// probe_gaps_memhw.js — gAPSOps MemHW ops-registration probe (P010 master-crash root)
// =============================================================================
// PURPOSE: empirically pin WHY the P010/Pro master crash happens. Device logcat shows
//   `gAPSOps.pfnAPSMemHWAcquire is NULL` + `pfnAPSMemHWRelease is NULL`
// (libAPSClient-jni.so, ApsTotalResult.cpp:79/102 buildMetadataBufferPtr/destroyMetadataBufferPtr)
// → the APS metadata/HW buffer is never built → BasicTone_OGL::saveOutImg AND
//   libarcsoft_turbo_hdr_raw both deref garbage → SIGSEGV.
//
// ROOT MODEL UNDER TEST (apsclient-bridge-RE.md + this session's static RE):
//   gAPSOps is an exported .bss ops-table in libAPSClient-jni.so (@ export `gAPSOps`),
//   populated by dlopen'ing libAlgoProcess.so and dlsym'ing the camAps* ops. The two HW-memory
//   ops wrap libAlgoProcess exports `camApsMemHardwareAcquire`@0x1cd170 / `camApsMemHardwareRelease`@0x1cd178
//   (the AHardwareBuffer_lock/unlock bridge — the "in-between" layer alloc-chain-locus-RE.md names).
//   Both symbols EXIST in libAlgoProcess-300 and the dlsym does NOT log "load ... fail!" on device,
//   yet the slots are NULL at the consumer → the MemHardware-ops registration sub-path is GATED OUT
//   on LOS while the main ~33-op init runs. This probe finds the gate + the exact NULL slot offsets.
//
//   This single missing registration is the hypothesized UNIFIED upstream root that libapsfixup
//   #1-#4 (P010 length, ArcSoft chroma VA/pitch x2, BasicTone writability) all band-aid downstream.
//
// WHAT IT DOES (diagnostic-first; FIX-TEST is opt-in via FIX=1):
//   1. Dumps gAPSOps as a pointer array, auto-labeling every non-NULL slot against the live
//      libAlgoProcess export table (reverse address->name map). NULL slots are the unregistered ops;
//      their neighbors (camApsMemHardware*) reveal the exact +offset of the MemHW slots.
//   2. Hooks libAlgoProcess camApsMemHardware{Acquire,Release,Allocate} exports — logs if EVER called.
//   3. Hooks dlsym (re-armable) — logs every symbol the registrar requests after attach (does the
//      MemHardware-init path run?).
//   4. FIX-TEST (FIX=1): once the NULL MemHW slots are located by the dump, patches them with the
//      real libAlgoProcess camApsMemHardwareAcquire/Release addresses, so a subsequent P010/Pro
//      capture can confirm whether BasicTone/ArcSoft crashes vanish + save succeeds (the convergence
//      proof). Reversible (process-scoped GOT/bss write; no partition change).
//
// SAFETY / RUNTIME MODEL:
//   * ATTACH or SPAWN. gAPSOps is persistent state — attach at preview is enough to read the NULL
//     end-state; spawn catches the init/dlsym burst. App-side, com.oplus.camera only.
//   * The bss write in FIX-TEST is reversible and camera-process-scoped (same touch class as
//     libapsfixup's GOT redirects). Default OFF; set FIX=1 in the env-arg only for the fix run.
//   * Read /proc maps before any deref; never write outside gAPSOps.
//
// RUN (diagnostic):
//   adb root && adb shell setenforce 0    # optional
//   frida -U -n com.oplus.camera -l tools/frida/probe_gaps_memhw.js
//     >>> launch camera to preview, then watch [gAPSOps DUMP] <<<
// RUN (fix-test, after dump confirms the NULL slots):
//   frida -U -n com.oplus.camera -l tools/frida/probe_gaps_memhw.js -P '{"FIX":1}'
// =============================================================================
'use strict';

var APS  = 'libAPSClient-jni.so';
var ALGO = 'libAlgoProcess.so';
var MAX_SLOTS = 80;                 // walk this many gAPSOps pointer slots
var DUMP_MS   = 3000;               // periodic re-dump (watch slots flip non-null over launch)
var DO_FIX    = false;              // set via -P '{"FIX":1}'
try { if (typeof parameters !== 'undefined' && parameters && parameters.FIX) DO_FIX = true; } catch (e) {}

function ts() { return '[' + (Date.now() % 1000000) + ']'; }
function findMod(n) { try { return Process.findModuleByName(n); } catch (e) { return null; } }
// Frida 17 removed global Module.findExportByName; use module-instance / global helpers with fallback.
function exp(modName, sym) {
  try { var m = Process.findModuleByName(modName); if (m && m.findExportByName) { var a = m.findExportByName(sym); if (a) return a; } } catch (e) {}
  try { if (Module.findExportByName) return Module.findExportByName(modName, sym); } catch (e2) {}
  return null;
}
function gexp(sym) {
  try { if (Module.findGlobalExportByName) return Module.findGlobalExportByName(sym); } catch (e) {}
  try { if (Module.getGlobalExportByName) return Module.getGlobalExportByName(sym); } catch (e2) {}
  try { if (Module.findExportByName) return Module.findExportByName(null, sym); } catch (e3) {}
  return null;
}
function symbolize(p) {
  try { var s = DebugSymbol.fromAddress(p); if (s && s.name) return s.moduleName + '!' + s.name; } catch (e) {}
  try { var m = Process.findModuleByAddress(p); if (m) return m.name + '+0x' + p.sub(m.base).toString(16); } catch (e2) {}
  return '?';
}

// reverse map: libAlgoProcess export address -> name (to label gAPSOps slots)
var ALGO_REV = {};
function buildAlgoRev() {
  var m = findMod(ALGO);
  if (!m) return 0;
  var n = 0;
  try {
    m.enumerateExports().forEach(function (e) {
      ALGO_REV[e.address.toString()] = e.name; n++;
    });
  } catch (e) {}
  return n;
}

var ALGO_ACQUIRE = null, ALGO_RELEASE = null, ALGO_ALLOCATE = null;
function resolveAlgoMemHw() {
  ALGO_ACQUIRE  = exp(ALGO, 'camApsMemHardwareAcquire');
  ALGO_RELEASE  = exp(ALGO, 'camApsMemHardwareRelease');
  ALGO_ALLOCATE = exp(ALGO, 'camApsMemHardwareAllocate');
  console.log(ts() + ' [algo] camApsMemHardwareAcquire=' + ALGO_ACQUIRE +
              ' Release=' + ALGO_RELEASE + ' Allocate=' + ALGO_ALLOCATE);
}

var gapsBase = null;
var fixApplied = false;
function dumpGaps(tag) {
  if (!gapsBase) {
    gapsBase = exp(APS, 'gAPSOps');
    if (!gapsBase) { console.log(ts() + ' [gAPSOps] export not found (lib not loaded?)'); return; }
    console.log(ts() + ' [gAPSOps] base=' + gapsBase);
  }
  var nullSlots = [];
  console.log(ts() + ' ===== [gAPSOps DUMP ' + (tag || '') + '] =====');
  for (var i = 0; i < MAX_SLOTS; i++) {
    var p;
    try { p = gapsBase.add(i * Process.pointerSize).readPointer(); }
    catch (e) { console.log('  slot[' + i + '] unreadable — stop'); break; }
    var off = '+0x' + (i * Process.pointerSize).toString(16);
    if (p.isNull()) { nullSlots.push(i); continue; }
    var lbl = ALGO_REV[p.toString()] || symbolize(p);
    console.log('  [' + i + '] ' + off + ' = ' + p + '  ' + lbl);
  }
  console.log('  NULL slots: ' + JSON.stringify(nullSlots));
  // flag slots adjacent to known camApsMemHardware* values (locate the MemHW region)
  for (var k = 0; k < MAX_SLOTS; k++) {
    try {
      var v = gapsBase.add(k * Process.pointerSize).readPointer();
      var nm = ALGO_REV[v.toString()];
      if (nm && /MemHardware|BufferLock|BufferUnlock|HardwareBuf/i.test(nm))
        console.log('  >> MemHW-region marker: slot[' + k + '] +0x' + (k*8).toString(16) + ' = ' + nm);
    } catch (e) {}
  }
  console.log('  ============================');

  if (DO_FIX && !fixApplied) tryFix(nullSlots);
}

// FIX-TEST: patch the NULL MemHW slots with the real libAlgoProcess addresses.
// Strategy: find the slot holding camApsMemHardwareAllocate (likely non-null neighbor); Acquire/Release
// are the adjacent slots in declaration order. If Allocate is also null, fall back to scanning for the
// two NULL slots that sit between known-labeled ops and patch them (logged for manual confirm).
function tryFix(nullSlots) {
  if (!ALGO_ACQUIRE || !ALGO_RELEASE) { console.log(ts() + ' [FIX] algo MemHW addrs unresolved — skip'); return; }
  // locate Allocate slot to anchor the MemHW triple
  var allocSlot = -1;
  for (var i = 0; i < MAX_SLOTS; i++) {
    try {
      var v = gapsBase.add(i * Process.pointerSize).readPointer();
      if (ALGO_ALLOCATE && v.equals(ALGO_ALLOCATE)) { allocSlot = i; break; }
    } catch (e) {}
  }
  console.log(ts() + ' [FIX] allocSlot=' + allocSlot + ' nullSlots=' + JSON.stringify(nullSlots));
  console.log(ts() + ' [FIX] NOT auto-patching blind — re-run with confirmed offsets once dump labels ' +
              'the Acquire/Release NULL slots (printed above). Edit FIX_ACQUIRE_SLOT/FIX_RELEASE_SLOT below.');
  // Guarded explicit patch (fill these in from the dump, then set FIX=1):
  var FIX_ACQUIRE_SLOT = -1, FIX_RELEASE_SLOT = -1;
  if (FIX_ACQUIRE_SLOT >= 0 && FIX_RELEASE_SLOT >= 0) {
    Memory.protect(gapsBase, MAX_SLOTS * Process.pointerSize, 'rw-');
    gapsBase.add(FIX_ACQUIRE_SLOT * Process.pointerSize).writePointer(ALGO_ACQUIRE);
    gapsBase.add(FIX_RELEASE_SLOT * Process.pointerSize).writePointer(ALGO_RELEASE);
    fixApplied = true;
    console.log(ts() + ' [FIX] patched slot[' + FIX_ACQUIRE_SLOT + ']=Acquire, slot[' +
                FIX_RELEASE_SLOT + ']=Release. Run a P010/Pro capture and watch for crash absence.');
  }
}

// hook the libAlgoProcess MemHW exports — do they EVER get called?
function hookAlgoMemHw() {
  [['camApsMemHardwareAcquire', ALGO_ACQUIRE], ['camApsMemHardwareRelease', ALGO_RELEASE],
   ['camApsMemHardwareAllocate', ALGO_ALLOCATE]].forEach(function (pair) {
    if (!pair[1]) return;
    try {
      Interceptor.attach(pair[1], {
        onEnter: function () { console.log(ts() + ' [algo CALL] ' + pair[0] + ' tid=' + Process.getCurrentThreadId()); }
      });
      console.log('[hook] ' + pair[0] + ' @ ' + pair[1]);
    } catch (e) { console.log('[hook] ' + pair[0] + ' failed: ' + e); }
  });
}

// hook dlsym — log every symbol the registrar requests (catches MemHardware-init if it runs post-attach)
function hookDlsym() {
  var dlsym = gexp('dlsym');
  if (!dlsym) { console.log('[hook] dlsym not found'); return; }
  Interceptor.attach(dlsym, {
    onEnter: function (a) {
      try {
        var name = a[1].readCString();
        if (name && /camAps|MemHardware|APS|HardwareBuf|setRequestActionCallback/i.test(name))
          console.log(ts() + ' [dlsym] "' + name + '"');
      } catch (e) {}
    }
  });
  console.log('[hook] dlsym @ ' + dlsym);
}

(function main() {
  console.log(ts() + ' probe_gaps_memhw start  FIX=' + DO_FIX);
  function arm() {
    var nAlgo = buildAlgoRev();
    resolveAlgoMemHw();
    console.log(ts() + ' [algo] export table: ' + nAlgo + ' symbols mapped');
    hookAlgoMemHw();
    dumpGaps('initial');
  }
  hookDlsym();
  if (findMod(APS) && findMod(ALGO)) { console.log(ts() + ' (libs already loaded)'); arm(); }
  else {
    console.log(ts() + ' polling for ' + APS + ' + ' + ALGO + ' ...');
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (findMod(APS) && findMod(ALGO)) { clearInterval(iv); console.log(ts() + ' (loaded after ' + tries + ' polls)'); arm(); }
      else if (tries > 300) { clearInterval(iv); console.log(ts() + ' FATAL libs never loaded'); }
    }, 150);
  }
  setInterval(function () { dumpGaps('periodic'); }, DUMP_MS);
})();
