// neuter_oemlayer_healthmon.js — keep the camera provider ALIVE for instrumentation by
// suppressing OemLayer::OsUtils::RaiseSignalAbort (the HealthMonitor's 'ncsUnreleased N' SIGABRT).
// INSTRUMENTATION ONLY — masks the abort so we can read logs; NOT a fix for the NCS/sensor-hub root.
// Backtrace target: camera.oemlayer.v2.so OemLayer::OsUtils::RaiseSignalAbort(char const*) @ +0x3b67ec
'use strict';
var MOD = 'camera.oemlayer.v2.so';
var MANGLED = '_ZN8OemLayer7OsUtils16RaiseSignalAbortEPKc';
// THIS build (v1.3): tombstone RaiseSignalAbort+192 @ pc 0x3b68ac -> entry 0x3b68ac-0xc0 = 0x3b67ec.
// (defang_healthmonitor.js's 0x3b676c is an older build; fn moved +0x80.) Not exported -> use offset.
var OFF_FUNC = 0x3b67ec;
var done = false;
function arm(){
  var m = Process.findModuleByName(MOD); if(!m) return false;
  var addr = null;
  try { addr = Module.findExportByName(MOD, MANGLED); } catch(e){}
  if(!addr){ addr = m.base.add(OFF_FUNC); console.log('[neuter] using offset 0x'+OFF_FUNC.toString(16)+' @ '+addr); }
  Interceptor.replace(addr, new NativeCallback(function(msgPtr){
    var s=''; try{ s = msgPtr.isNull()?'':msgPtr.readUtf8String(); }catch(e){}
    console.log('[NEUTER] OemLayer RaiseSignalAbort SUPPRESSED: "' + s + '"');
  }, 'void', ['pointer']));
  console.log('[*] neutered OemLayer::RaiseSignalAbort @ ' + addr + ' (base '+m.base+')');
  done = true; return true;
}
if(!arm()){ var t=setInterval(function(){ if(arm()) clearInterval(t); }, 200); }
console.log('[*] neuter_oemlayer_healthmon loaded');
