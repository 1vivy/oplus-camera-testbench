// enable_ascii_logging.js — flip CamX enableAsciiLogging=1 + raise log masks, LIVE & SAFE (no reboot).
// Routes CamX-CORE logs (camxsession/camxnode/hdr_detected/ProcessCaptureResult/the 8K -38 reason) to logcat,
// which props alone cannot do (enableAsciiLogging is override-file-only). Pure DATA writes into the POD
// StaticSettings struct getSettings() returns — NO code is called (unlike WriteCamxSettingsToFile-by-offset).
//
// Offsets pinned from libcamxsettingsmanager.so V16.1.0 (=16.0.7.201) OverrideLogSettingsAtConfigureFile;
// confirmed live (write/readback/restore) on the running provider. enableAsciiLogging=+0x58 (u32),
// traceGroupsEnable=+0x54 (u32), masks 0x08..0x40 (u64). x19/arg0 == the StaticSettings POD (single-deref).
//
// Run (provider must be up; open the camera AFTER attach so the session logs are ASCII-routed):
//   frida -U -p $(pidof vendor.qti.camera.provider-service_64) -l enable_ascii_logging.js
//
// Tuning: VERBOSE mask defaults OFF (logVerboseMask=0) to avoid drowning logcat on the first pass — INFO/
// CoreCfg/EntryExit is enough for hdr_detected / configure / fusion / the -38 reason. Set WANT_VERBOSE=true to flood.
const SM = 'libcamxsettingsmanager.so';
const WANT_VERBOSE = false;
const OFF = {                          // StaticSettings (POD) field offsets — BUILD-PINNED (V16.1.0/16.0.7.201)
  logConfigMask:    [0x08, 8], logCoreCfgMask:  [0x10, 8], logDumpMask:       [0x18, 8],
  logEntryExitMask: [0x20, 8], logInfoMask:     [0x28, 8], logPerfInfoMask:   [0x30, 8],
  logVerboseMask:   [0x38, 8], logWarningMask:  [0x40, 8],
  traceGroupsEnable:[0x54, 4], enableAsciiLogging:[0x58, 4],
};

function getSettings(m){
  const gi = m.findExportByName('_ZN4CamX15SettingsManager11GetInstanceEv'); if(!gi) return null;
  const inst = new NativeFunction(gi,'pointer',[])(); if(inst.isNull()) return null;
  const vt = inst.readPointer();
  const s = new NativeFunction(vt.add(0x10).readPointer(),'pointer',['pointer'])(inst); // getSettings()
  return s.isNull() ? null : s;
}

function run(){
  const m = Process.findModuleByName(SM); if(!m){ return false; }
  const s = getSettings(m); if(!s){ console.log('settings not ready (open camera once)'); return false; }

  // ---- SANITY GUARD (must pass BEFORE any write; catches build-drift / wrong object) ----
  if(!s.readPointer().isNull()){ console.log('✗ ABORT: settings[0]!=0 — not the POD StaticSettings, offsets invalid'); return true; }
  const tg = s.add(0x54).readU32(), al = s.add(0x58).readU32();
  if(tg>1 || al>1){ console.log('✗ ABORT: +0x54='+tg+' +0x58='+al+' out of {0,1} — offsets do not match this build'); return true; }
  const orig = s.add(0x58).readU32();
  s.add(0x58).writeU32(0xA5); const probe = s.add(0x58).readU32(); s.add(0x58).writeU32(orig);
  if(probe!==0xA5){ console.log('✗ ABORT: +0x58 not writable/sticky'); return true; }
  console.log('✓ guard passed (settings='+s+', enableAsciiLogging was '+al+', traceGroupsEnable '+tg+')');

  // ---- COMMIT ----
  s.add(OFF.enableAsciiLogging[0]).writeU32(1);
  s.add(OFF.traceGroupsEnable[0]).writeU32(1);
  const hi = uint64('0xffffffffffffffff');
  ['logInfoMask','logWarningMask','logPerfInfoMask','logEntryExitMask','logConfigMask','logCoreCfgMask','logDumpMask']
    .forEach(function(n){ s.add(OFF[n][0]).writeU64(hi); });
  s.add(OFF.logVerboseMask[0]).writeU64(WANT_VERBOSE ? hi : uint64(0));

  console.log('★ enableAsciiLogging='+s.add(0x58).readU32()+
              ' logInfoMask=0x'+s.add(0x28).readU64().toString(16)+
              ' logVerboseMask=0x'+s.add(0x38).readU64().toString(16)+
              ' traceGroupsEnable='+s.add(0x54).readU32()+' — open the camera now.');
  return true;
}
if(!run()){ console.log('polling for settings (open the camera)...'); const t=setInterval(function(){ if(run()) clearInterval(t); }, 500); }
