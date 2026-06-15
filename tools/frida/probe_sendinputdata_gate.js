/*
 * tools/frida/probe_sendinputdata_gate.js — TIER-1 freeze Gate-B probe (doc-44 UPDATE 5-7 / doc-47 / 50).
 * APSPreviewManager::sendInputData(AlgoPreviewProcessData*, ModeConfig*) — checks per-frame input-params holder.
 * arg1 (AlgoPreviewProcessData*) at +0x370 holds a shared_ptr<APSParamsHolder> (the per-frame input-params
 * holder carrying keys doDeinit/is_fluency_sampling/input_buffer_dataspace). Non-null = holder present.
 * The real gating is key/value-driven inside APSParamsHolder — future live trace: get<int> @0x2341d8,
 * get<bool> @0x23fe68 in libAlgoProcess. If the holder is null the input buffer cannot be released →
 * feeds the previewManagerRoutine starvation (probe_aps_preview_routine).
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
  // +0x370 = shared_ptr<APSParamsHolder> in AlgoPreviewProcessData (RE-confirmed; +0x378 is next member,
  // only touched in a dead stack-guard epilogue — NOT the holder, reads NULL on live preview).
  var OFF_PARAMS_HOLDER = 0x370;   // AlgoPreviewProcessData -> shared_ptr<APSParamsHolder> (doc-44 CORRECTED)

  function resolve(spec){
    if (typeof Anchor !== 'undefined' && Anchor.resolve) return Anchor.resolve(spec);
    var m = Process.findModuleByName(spec.lib); if (!m) return null;
    try { var p = m.findExportByName(spec.export); if (p) { console.log('[SENDINPUT] resolved via export(standalone) @ ' + p); return p; } } catch(e){}
    return null;
  }

  var p = resolve(SPEC);
  if (!p) { console.log('[SENDINPUT] MISS — symbol unresolved (wrong process?)'); return; }

  var calls = 0, holderPresent = 0, holderNull = 0;
  Interceptor.attach(p, {
    onEnter: function(a){
      calls++;
      try {
        var data = a[1];                                        // AlgoPreviewProcessData*
        var holder = data.add(OFF_PARAMS_HOLDER).readPointer(); // shared_ptr<APSParamsHolder>.get() (first word)
        if (holder.isNull()) {
          holderNull++;
          if (holderNull <= 5) console.log('[SENDINPUT] call#' + calls + ' APSParamsHolder(+0x370)=NULL — input-params holder absent; buffer release path blocked');
        } else {
          holderPresent++;
          // Gate is key/value-driven inside APSParamsHolder (keys: doDeinit, is_fluency_sampling,
          // input_buffer_dataspace). Hook get<int>@0x2341d8 / get<bool>@0x23fe68 in libAlgoProcess
          // for the actual gate values. Here just confirm holder is present.
          if (holderPresent <= 3) console.log('[SENDINPUT] call#' + calls + ' APSParamsHolder(+0x370)=' + holder + ' (present — key/value gate inside holder)');
        }
      } catch(e){ console.log('[SENDINPUT] read err: ' + e.message); }
    }
  });

  setInterval(function(){ if (calls) console.log('[SENDINPUT] TALLY calls=' + calls + ' holderPresent=' + holderPresent + ' holderNull=' + holderNull); }, 3000);
  console.log('[SENDINPUT] armed @ ' + p);
})();
