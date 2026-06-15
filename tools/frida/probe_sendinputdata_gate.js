/*
 * tools/frida/probe_sendinputdata_gate.js — TIER-1 freeze Gate-B probe (doc-44 UPDATE 5-7 / doc-47 / 50).
 * APSPreviewManager::sendInputData(AlgoPreviewProcessData*, ModeConfig*) gates the per-frame release path on
 * AlgoPreviewProcessData->InitParamters[+0x378][0] == 1. If that gate is ever false / the pointer is null,
 * the input buffer is never returned → feeds the previewManagerRoutine starvation (probe_aps_preview_routine).
 *
 * Resolves by EXPORTED symbol (16.0.8.300 libAlgoProcess.so @0x1b534c; arg1 = AlgoPreviewProcessData*).
 * Self-sufficient (Anchor when bundled, else frida-17 instance API).
 * Run standalone: frida -U -p <pid> -l tools/frida/_anchor.js -l this.js
 */
'use strict';
(function(){
  var SPEC = {
    lib: 'libAlgoProcess.so', name: 'APSPreviewManager::sendInputData',
    export: '_ZN17APSPreviewManager13sendInputDataEPN7android22AlgoPreviewProcessDataEP10ModeConfig',
    symtab: '_ZN17APSPreviewManager13sendInputDataEPN7android22AlgoPreviewProcessDataEP10ModeConfig',
    fallback: { buildid: '2217d555bacb9e8f9c2a81a609ca9f47', off: 0x1b534c }
  };
  var OFF_INITPARAMS = 0x378;   // AlgoPreviewProcessData -> InitParamters pointer (doc-44)

  function resolve(spec){
    if (typeof Anchor !== 'undefined' && Anchor.resolve) return Anchor.resolve(spec);
    var m = Process.findModuleByName(spec.lib); if (!m) return null;
    try { var p = m.findExportByName(spec.export); if (p) { console.log('[SENDINPUT] resolved via export(standalone) @ ' + p); return p; } } catch(e){}
    return null;
  }

  var p = resolve(SPEC);
  if (!p) { console.log('[SENDINPUT] MISS — symbol unresolved (wrong process?)'); return; }

  var calls = 0, gateOpen = 0, gateClosed = 0, gateNull = 0;
  Interceptor.attach(p, {
    onEnter: function(a){
      calls++;
      try {
        var data = a[1];                                   // AlgoPreviewProcessData*
        var ip = data.add(OFF_INITPARAMS).readPointer();   // InitParamters*
        if (ip.isNull()) { gateNull++; if (gateNull <= 5) console.log('[SENDINPUT] call#' + calls + ' InitParamters(+0x378)=NULL — gate cannot pass'); return; }
        var g = ip.readU32();                              // InitParamters[0]
        if (g === 1) { gateOpen++; if (gateOpen <= 3) console.log('[SENDINPUT] call#' + calls + ' InitParamters[0]=1 (gate OPEN)'); }
        else { gateClosed++; console.log('[SENDINPUT] call#' + calls + ' InitParamters[0]=' + g + ' (gate CLOSED — release-callback skipped; starvation cause)'); }
      } catch(e){ console.log('[SENDINPUT] read err: ' + e.message); }
    }
  });

  setInterval(function(){ if (calls) console.log('[SENDINPUT] TALLY calls=' + calls + ' open=' + gateOpen + ' closed=' + gateClosed + ' null=' + gateNull); }, 3000);
  console.log('[SENDINPUT] armed @ ' + p);
})();
