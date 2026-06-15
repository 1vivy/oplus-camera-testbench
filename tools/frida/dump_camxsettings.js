// dump_camxsettings.js — dump ALL CamX StaticSettings (name=value) + read the HDR-lever offsets,
// to NAME StaticSettings +0x6a28/+0x6a18 (the proven publish+fusion levers, doc 45 FORCE-TEST RESULT).
//
// WriteCamxSettingsToFile(this) writes every setting as name=value to
//   <GetCoreDumpDirectoryPath()>/camxsettingsdump.txt   (typically /data/vendor/camera/camxsettingsdump.txt).
// It is NOT exported -> call by offset. SettingsManager::GetInstance IS exported -> gives `this`.
// Run on a clean-boot LOS (and on a stock unit) AND diff the two dumps: the HDR/SHDR/MFHDR settings that
// differ 1(stock)/0(LOS) are the +0x6a28/+0x6a18 levers by name = the camxoverridesettings.txt keys to ship.
// We ALSO read the struct values at the known HDR offsets so you can correlate offset<->name directly.
//
// libcamxsettingsmanager.so: image base 0x100000 in Ghidra -> runtime addr = Ghidra - 0x100000.
//   WriteCamxSettingsToFile  Ghidra 0x113168 -> runtime +0x13168   (NOT exported; call by offset)
//   SettingsManager::GetInstance  exported _ZN4CamX15SettingsManager11GetInstanceEv (vtbl+0x10 -> getSettings)
// Known name->offset (from UpdateOemSettings decompile, shared StaticSettings struct):
//   enable3expSHDRSnapshot +0x1e0 | selectedDCGMode +0x6a2c | setHDRMode +0x6a40
//   ★ LEVERS (base-CamX, name TBD via the dump): +0x6a28 (SHDR-auto-exp usecase gate), +0x6a18 (HDR-mode-info gate)
//
// Frida-17: Process.findModuleByName + instance findExportByName. Attach-by-PID to the provider; setenforce 0.
//   frida -U -p <provider_pid> -l dump_camxsettings.js
// Then: adb pull /data/vendor/camera/camxsettingsdump.txt

const SM = 'libcamxsettingsmanager.so';
// CamX::SettingsManagerImpl::WriteCamxSettingsToFile — NOT exported (not in .dynsym), so called by offset.
// Offset is BUILD-PINNED; re-derive per build in Ghidra (symbol is in the binary; image base 0x100000 →
// runtime = Ghidra - 0x100000). Verified offsets:
//   16.0.7.201                                          : +0x13168
//   V16.1.0  build-id 1e7abaf1521db441ffc3e9dd70cd8c77  : +0x13168 (UNCHANGED; confirmed 2026-06-13)
const OFF_WRITE = 0x13168;
// First 16 prologue bytes (paciasp + frame push) at OFF_WRITE on the verified builds above. The script
// SELF-CHECKS these before calling — a wrong-build offset must NEVER be invoked (would crash the provider).
const SIG_HEX = '3f2303d5fd7bbca9fc5f01a9f65702a9';
// To NAME a struct offset: set SENTINEL_OFF to it (e.g. 0x6a18) — the dump line whose value==SENTINEL_VAL
// is that offset by name. Leave null to just dump. SENTINEL_VAL>1 so it can't collide with a bool default.
const SENTINEL_OFF = null;   // e.g. 0x6a18 to name the +0x6a18 lever
const SENTINEL_VAL = 0x6a;
const HDR_OFFS = { '+0x1e0 enable3expSHDRSnapshot':0x1e0, '+0x6a18 LEVER(hdrModeInfo)':0x6a18,
                   '+0x6a28 LEVER(shdrAutoExp)':0x6a28, '+0x6a2c selectedDCGMode':0x6a2c,
                   '+0x6a40 setHDRMode':0x6a40, '+0x6544 (was already 1)':0x6544 };

function getSettings(m){
  try{
    const gi=m.findExportByName('_ZN4CamX15SettingsManager11GetInstanceEv'); if(!gi) return null;
    const inst=new NativeFunction(gi,'pointer',[])(); if(inst.isNull()) return null;
    const vt=inst.readPointer();
    const s=new NativeFunction(vt.add(0x10).readPointer(),'pointer',['pointer'])(inst); // getSettings()
    return { inst:inst, settings:s.isNull()?null:s };
  }catch(e){ console.log('getSettings err '+e); return null; }
}

function run(){
  const m=Process.findModuleByName(SM); if(!m){ return false; }
  const g=getSettings(m); if(!g){ console.log('no settings yet'); return false; }
  // 1. read the HDR-lever offsets directly (correlate offset<->value on THIS boot)
  let line='[HDR offsets] ';
  for(const k in HDR_OFFS){ try{ line += k+'='+g.settings.add(HDR_OFFS[k]).readU32()+'  '; }catch(e){ line+=k+'=ERR '; } }
  console.log(line);
  // 1b. SENTINEL mode: write a unique value to an offset, then the dump line whose value==SENTINEL_VAL
  //     IS that offset by NAME (definitive offset<->name, no blob RE). Default off.
  if(SENTINEL_OFF !== null){
    try{ g.settings.add(SENTINEL_OFF).writeU32(SENTINEL_VAL);
         console.log('★ SENTINEL wrote '+SENTINEL_VAL+' to settings+0x'+SENTINEL_OFF.toString(16)+
                     ' -> in the dump, the `name (hash) = '+SENTINEL_VAL+'` line names that offset.'+
                     ' (if it clamps to 1, the previously-0 HDR setting now =1 is the one.)'); }
    catch(e){ console.log('sentinel write err '+e); }
  }
  // 2. dump ALL settings name=value — ONLY if the bytes at OFF_WRITE match the known prologue.
  //    Offset is build-pinned and the fn is NOT exported; a wrong-build call would crash the provider.
  //    The dump is by-NAME so it is build-independent OUTPUT once we've safely entered the right function.
  try{
    const got=Array.from(new Uint8Array(m.base.add(OFF_WRITE).readByteArray(16)))
                 .map(function(b){return ('0'+(b&0xff).toString(16)).slice(-2);}).join('');
    if(got!==SIG_HEX){
      console.log('✗ ABORT dump: bytes @ +0x'+OFF_WRITE.toString(16)+' = '+got+' != expected '+SIG_HEX+
                  ' — OFF_WRITE is NOT valid for this build. Re-derive in Ghidra; do NOT call (crash risk).');
    }else{
      const wf=new NativeFunction(m.base.add(OFF_WRITE),'void',['pointer']);
      wf(g.inst);
      console.log('★ sig OK -> WriteCamxSettingsToFile called -> /data/vendor/camera/camxsettingsdump.txt'+
                  ' (also check the coredump dir). adb pull it, then diff stock vs LOS BY NAME.');
    }
  }catch(e){ console.log('WriteCamxSettingsToFile call err '+e+
                ' — fallback: set camxoverridesettings enableCameraCoreDumpText=TRUE and re-open camera.'); }
  return true;
}

if(!run()){
  console.log(SM+' / settings not ready; polling (open the camera)...');
  const t=setInterval(function(){ if(run()){ clearInterval(t); } }, 500);
}
