// unclobber_camx_logs.js — FRIDA in-memory twin of tools/patch_chi_logclobber.py.
// Defeats OnePlus's CHI log-mask clobbers (#1/#2, and #3 with INCLUDE_3) by writing `retaa`
// over the 2nd instruction of each clobber's PAC prologue IN RAM — so the camxoverridesettings.txt
// CHI verbose masks survive and the stack narrates its own SHDR graph-selection decisions (interop-tree C5:
// CHARACTERIZE the plumbing — observe/record, do not convict). NO /vendor /odm write; reverts on
// provider restart. Pick this over the push path when frida is light enough for the marginal HAL
// (this script is I/O-light: it patches ONCE at attach, no continuous hooks — survives like dump_camxsettings).
//
// SCOPE: this defeats the CHI tag ("Chi :") only — same as patch_chi_logclobber.py. The CamX-CORE tag
// ("CamX :" / the configure_streams -38 reason) is a DIFFERENT gate (the global CamX::g_logInfo) and is
// NOT addressed here. For CamX-core use tools/frida/enable_camx_logging.js (preferred, crash-free).
//
// ANCHORS (mirror patch_chi_logclobber.py PATCH_TABLE exactly — one source of truth, re-derived at runtime):
//   #1 libextensionlayer.so      ExtensionLayer::OverrideChiLogSettingsAtConfigureFile  (exported symbol)
//   #2 com.qti.chi.override.so   ExtensionModule::ModifyLogSettings                     (exported symbol)
//   #3 libextensionlayer.so      ExtensionLayer::OnPostModifySettings (exported; functional tail -> opt-in only)
// NOT a target — the old "#4" libcamxsettingsmanager.so OverrideLogSettingsAtConfigureFile (@0x151c4) is a
//   DECOY: it writes the non-gate StaticSettings+0x28 from the empty OEM provider, so retaa-ing it does
//   NOTHING for either the CamX-core OR the CHI gate. The real CamX-core clobber is OverrideUpdateLogSettings
//   (g_logInfo); use tools/frida/enable_camx_logging.js. (Matches patch_chi_logclobber.py OBSOLETE_PATCH_TABLE.)
//
// TIMING: the clobbers run at CONFIGURE (camera open). Attach to the provider BEFORE opening the camera so
// the prologues are retaa'd before configure executes. Modules load at provider start; the script polls until
// all are present, patches each once, then you open the camera.
//
// COMPANION (REQUIRED for logs to actually appear — this script only stops the ZEROING):
//   run  tools/observability/enable/10_vendor_camx_chi.sh  first (overlays the verbose masks +
//   setprop persist.vendor.camera.oplus.enableLogging true (defeats #3) + restarts the provider).
//   Full recipe:  python3 tools/patch_chi_logclobber.py --recipe
//
// USAGE (attach, never spawn):
//   killall vendor.qti.camera.provider-service_64   # let it respawn clean
//   PID=$(adb shell pgrep -f camera.provider | head -1)
//   frida -U -p $PID -l unclobber_camx_logs.js      # then open the camera on the daytime HDR scene
//   (works under Enforcing via KernelSU; same injection path as dump_camxsettings.js)

const PACIASP = [0x3f, 0x23, 0x03, 0xd5];
const RETAA   = [0xff, 0x0b, 0x5f, 0xd6];
// Set true to ALSO retaa #3 OnPostModifySettings (skips its tail vtable call). PREFER the property
// (persist.vendor.camera.oplus.enableLogging=true, set by enable/10_vendor_camx_chi.sh) which preserves the tail.
const INCLUDE_3 = false;

const TARGETS = [
  { lib: 'libextensionlayer.so',      name: '#1 OverrideChiLogSettingsAtConfigureFile',
    type: 'symbol', sym: '_ZN14ExtensionLayer37OverrideChiLogSettingsAtConfigureFileEv' },
  { lib: 'com.qti.chi.override.so',   name: '#2 ExtensionModule::ModifyLogSettings',
    type: 'symbol', sym: '_ZN15ExtensionModule17ModifyLogSettingsEv' },
  // (old "#4" libcamxsettingsmanager OverrideLogSettingsAtConfigureFile @0x151c4 intentionally OMITTED —
  //  it is the DECOY; retaa here changes nothing. See header + patch_chi_logclobber.py OBSOLETE_PATCH_TABLE.)
  { lib: 'libextensionlayer.so',      name: '#3 OnPostModifySettings', aggressive: true,
    type: 'symbol', sym: '_ZN14ExtensionLayer20OnPostModifySettingsEv' },
];

function bytesEq(arr, addr) {
  const u = new Uint8Array(addr.readByteArray(arr.length));
  for (let i = 0; i < arr.length; i++) if (u[i] !== arr[i]) return false;
  return true;
}
function isSubSpImm(addr) {              // (w & 0xFF0003FF) == 0xD10003FF  -> `sub sp, sp, #imm`
  const w = addr.readU32();
  return ((w & 0xFF0003FF) >>> 0) === 0xD10003FF;
}

function resolve(t, m) {
  if (t.type === 'symbol') return m.findExportByName(t.sym);   // null if not exported on this build
  // pattern: try the VERIFIED cached offset first (byte-identical build), then a RANGE-SAFE scan.
  // Scanning m.base..m.size whole throws an access violation — the module's virtual size spans
  // unmapped pages; only the r-x ranges are safe to scan.
  if (t.cached) { try { const a = m.base.add(t.cached); if (bytesEq(PACIASP, a)) return a; } catch (e) {} }
  let hits = [];
  try {
    m.enumerateRanges('r-x').forEach(function (r) {
      try { Memory.scanSync(r.base, r.size, t.sig).forEach(function (h) { hits.push(h); }); } catch (e) {}
    });
  } catch (e) {}
  if (hits.length === 1) return hits[0].address;
  console.log('  ✗ ' + t.name + ': signature matched ' + hits.length + ' r-x sites (need 1) — re-derive the anchor');
  return null;
}

function patchOne(t) {
  const m = Process.findModuleByName(t.lib);
  if (!m) return false;                                        // module not loaded yet -> caller polls
  const entry = resolve(t, m);
  if (!entry) { console.log('  … ' + t.name + ' (' + t.lib + '): unresolved (anchor)'); return true; }
  if (!bytesEq(PACIASP, entry)) {
    console.log('  ✗ ABORT ' + t.name + ' @' + entry + ': entry not paciasp — wrong build/anchor, NOT patching');
    return true;
  }
  const tgt = entry.add(4);
  if (bytesEq(RETAA, tgt)) { console.log('  = already retaa — ' + t.name + ' @' + entry); return true; }
  if (!isSubSpImm(tgt)) {
    console.log('  ✗ ' + t.name + ' @' + entry + ': 2nd insn not `sub sp,#imm` — drift, NOT patching');
    return true;
  }
  Memory.patchCode(tgt, 4, function (code) { code.writeByteArray(RETAA); });
  console.log('  ★ PATCHED ' + t.name + ' @' + entry + '  (retaa @' + tgt + ', ' + t.lib + ')');
  return true;
}

function run() {
  let allPresent = true;
  for (const t of TARGETS) {
    if (t.aggressive && !INCLUDE_3) { continue; }
    if (Process.findModuleByName(t.lib) === null) { allPresent = false; continue; }
    patchOne(t);
  }
  return allPresent;
}

console.log('[unclobber] retaa-ing CamX/CHI log clobbers in-memory (INCLUDE_3=' + INCLUDE_3 + ')…');
if (INCLUDE_3) console.log('[unclobber] NOTE: INCLUDE_3 skips OnPostModifySettings tail — verify 4K/stills still work');
if (!run()) {
  console.log('[unclobber] some libs not loaded yet; polling (start/open the provider)…');
  const t = setInterval(function () { if (run()) { clearInterval(t); console.log('[unclobber] all targets resolved.'); } }, 400);
} else {
  console.log('[unclobber] done — open the camera on the HDR scene; masks now survive configure.');
}
