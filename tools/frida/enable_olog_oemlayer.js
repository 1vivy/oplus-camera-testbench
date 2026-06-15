// enable_olog_oemlayer.js  (worker-2, OLog-enable for vendor-tag diag — 2026-06-03)
// =============================================================================
// NATIVE (no Java). Provider. Flips the oemlayer's OWN log-level globals to 1 so
// camera.oemlayer.v2.so emits its Info/Verbose/Warning/Error diagnostics (vendor-tag
// resolution, DefaultRequestSettings, ConfigureHDRInformation, InitPackageName, ...).
// Re-asserts every 1s so the flags survive a COLD config window. Run via
// run_gcvt_hook.py (re-attach-by-name) so it re-applies across provider respawns.
//
// RUN:
//   python3 tools/frida/run_gcvt_hook.py camera.provider tools/frida/enable_olog_oemlayer.js 60  (run_in_background)
//   then (with adb logcat -b all capturing): am force-stop com.oplus.camera ;
//        mobilerun device start com.oplus.camera ; (preview up) ; mobilerun device tap 635 2420
// =============================================================================

const MOD = 'camera.oemlayer.v2.so';
// global int symbols (the OLog enables)
const SYMS = [
  '_ZN4OLog15g_enableLogInfoE',
  '_ZN4OLog18g_enableLogVerboseE',
  '_ZN4OLog18g_enableLogWarningE',
  '_ZN4OLog16g_enableLogErrorE',
];
// GOT/pointer-slot fallbacks (device = Ghidra−0x100000): each slot HOLDS the address of the int global.
const GOT = { '_ZN4OLog15g_enableLogInfoE': 0x42dfe8, '_ZN4OLog16g_enableLogErrorE': 0x42dff8, '_ZN4OLog18g_enableLogVerboseE': 0x42e0e0 };

// frida-17: static Module.*ExportByName removed -> instance method (doc-50)
function gx(lib, sym){ var m = Process.findModuleByName(lib); return m ? m.findExportByName(sym) : null; }

let resolved = {};   // sym -> NativePointer (address of the int global)
let installed = false;

function baseOf(m) {
  try { const x = Process.findModuleByName(m); if (x) return x.base; } catch (e) {}
  try { if (Module.findBaseAddress) return Module.findBaseAddress(m); } catch (e) {}
  return null;
}

function resolveAll(base) {
  SYMS.forEach(function (s) {
    if (resolved[s]) return;
    // (1) direct export = address of the int global
    try { const e = gx(MOD, s); if (e && !e.isNull()) { resolved[s] = e; return; } } catch (ex) {}
    // (2) GOT slot: read the pointer it holds -> the int global's address
    if (GOT[s] !== undefined) {
      try { const slot = base.add(GOT[s]); const tgt = slot.readPointer(); if (tgt && !tgt.isNull()) { resolved[s] = tgt; } } catch (ex) {}
    }
  });
}

function setAll() {
  let n = 0;
  SYMS.forEach(function (s) {
    const p = resolved[s]; if (!p) return;
    try { p.writeU32(1); n++; } catch (e) {}
  });
  return n;
}

function readback() {
  return SYMS.map(function (s) {
    const p = resolved[s]; if (!p) return s.split('OLog')[1] + '=?';
    let v; try { v = p.readU32(); } catch (e) { v = 'x'; }
    return s.replace(/_ZN4OLog\d+/, '').replace(/E$/, '') + '=' + v;
  }).join(' ');
}

function install() {
  if (installed) return true;
  const base = baseOf(MOD); if (!base) return false;
  resolveAll(base);
  const got = Object.keys(resolved).length;
  if (got === 0) { send('OLog symbols NOT resolved yet @ ' + base + ' (retrying)'); return false; }
  installed = true;
  const n = setAll();
  send('OLOG ENABLED: resolved ' + got + '/' + SYMS.length + ', set ' + n + ' -> 1 @ ' + MOD + ' base ' + base);
  send('  readback: ' + readback());
  // logger module present?
  const lg = baseOf('camera.oemlayer.logger.so');
  send('  camera.oemlayer.logger.so ' + (lg ? ('loaded @ ' + lg) : 'NOT loaded'));
  return true;
}

if (!install()) { const t = setInterval(function(){ if (install()) clearInterval(t); }, 400); }

// Re-assert through the cold-config window (cheap; ensures a respawn/reset can't drop them).
let ticks = 0;
setInterval(function () {
  ticks++;
  resolveAll(baseOf(MOD) || ptr(0));
  const n = setAll();
  if (ticks % 5 === 0) send('OLog re-assert t=' + ticks + 's set=' + n + ' | ' + readback());
}, 1000);
