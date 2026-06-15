/*
 * tools/frida/probe_aps_preview_routine.js — TIER-1 freeze Gate-B probe (doc-44/47/50).
 * APSPreviewManager::previewManagerRoutine is the preview worker loop; it parks on cond(this+0x17c) when
 * command-count(this+0x150) == 0. Frame 1 renders, but if the input Image is never returned the count
 * stays 0 and the routine starves → the preview freeze. This probe samples that state over time.
 *
 * Resolves by EXPORTED symbol (verified on 16.0.8.300, libAlgoProcess.so BuildID 2217d555…, @0x1aa694).
 * Self-sufficient: uses globalThis.Anchor when bundled (persistence agent), else the frida-17 instance API.
 * Run standalone: frida -U -p <provider-or-app-pid> -l tools/frida/_anchor.js -l this.js
 */
'use strict';
(function(){
  var LIB = 'libAlgoProcess.so';
  var SPEC = {
    lib: LIB, name: 'APSPreviewManager::previewManagerRoutine',
    export: '_ZN17APSPreviewManager21previewManagerRoutineEPv',
    symtab: '_ZN17APSPreviewManager21previewManagerRoutineEPv',
    fallback: { buildid: '2217d555bacb9e8f9c2a81a609ca9f47', off: 0x1aa694 }
  };
  // field offsets within APSPreviewManager (doc-44; re-verify if the struct layout drifts)
  var OFF_COUNT = 0x150, OFF_COND = 0x17c, OFF_QUEUE = 0x40;

  function resolve(spec){
    if (typeof Anchor !== 'undefined' && Anchor.resolve) return Anchor.resolve(spec);
    var m = Process.findModuleByName(spec.lib); if (!m) return null;
    try { var p = m.findExportByName(spec.export); if (p) { console.log('[APS_ROUTINE] resolved via export(standalone) @ ' + p); return p; } } catch(e){}
    return null;
  }

  var p = resolve(SPEC);
  if (!p) { console.log('[APS_ROUTINE] MISS — ' + LIB + ' not mapped here or symbol unresolved (wrong process?)'); return; }

  var gThis = null, samples = 0, lastCount = -1, starveRun = 0;
  Interceptor.attach(p, { onEnter: function(a){ gThis = a[0]; console.log('[APS_ROUTINE] entered this=' + gThis); } });

  // sample the command-count over time so starvation (count stuck at 0 after frame 1) is visible
  setInterval(function(){
    if (!gThis) return;
    try {
      var count = gThis.add(OFF_COUNT).readU32();
      var queue = gThis.add(OFF_QUEUE).readPointer();
      if (count !== lastCount) {
        console.log('[APS_ROUTINE] count@+0x150=' + count + ' queue@+0x40=' + queue);
        lastCount = count;
      }
      if (count === 0) { starveRun++; if (starveRun === 6) console.log('[APS_ROUTINE] *** STARVATION: count==0 for ~3s (cond@+0x17c parked) — Gate-B freeze signature ***'); }
      else starveRun = 0;
      samples++;
    } catch(e){ console.log('[APS_ROUTINE] sample err: ' + e.message); }
  }, 500);

  console.log('[APS_ROUTINE] armed @ ' + p + ' (sampling count@+0x150 every 500ms)');
})();
