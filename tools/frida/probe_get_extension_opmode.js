/*
 * tools/frida/probe_get_extension_opmode.js — TIER-2 8K -38 probe (doc-35/48/50).
 * CameraServiceExtImpl::getExtensionOperatingMode(CameraMetadata const&, unsigned long, int) returns the OEM
 * operating mode for the session; the 8K HDR session is expected to resolve to op_mode 0x80a9. If stock
 * shapes the op_mode here and LOS never calls the hook, the 8K pipeline op_mode is wrong upstream of EISv2.
 * Correlate the return with the beforeConfigureStreamsLocked StreamSet dump (hook_before_configure_streams).
 *
 * Server-side: attach to cameraserver. Resolves by EXPORTED symbol (16.0.8.300 libcsextimpl @0x8875c).
 * Run standalone: frida -U -n cameraserver -l tools/frida/_anchor.js -l this.js
 */
'use strict';
(function(){
  var SPEC = {
    lib: 'libcsextimpl.so', name: 'CameraServiceExtImpl::getExtensionOperatingMode',
    export: '_ZN7android20CameraServiceExtImpl25getExtensionOperatingModeERKNS_14CameraMetadataEmi',
    symtab: '_ZN7android20CameraServiceExtImpl25getExtensionOperatingModeERKNS_14CameraMetadataEmi',
    fallback: { buildid: '039e6cf79c44d9196443375356cda290', off: 0x8875c }
  };
  function resolve(spec){
    if (typeof Anchor !== 'undefined' && Anchor.resolve) return Anchor.resolve(spec);
    var m = Process.findModuleByName(spec.lib); if (!m) return null;
    try { var p = m.findExportByName(spec.export); if (p) { console.log('[EXT_OPMODE] resolved via export(standalone) @ ' + p); return p; } } catch(e){}
    return null;
  }

  var p = resolve(SPEC);
  if (!p) { console.log('[EXT_OPMODE] MISS — libcsextimpl absent or symbol unresolved'); return; }

  var n = 0;
  Interceptor.attach(p, {
    onEnter: function(a){ this.argMode = (a[2].toUInt32 ? a[2].toUInt32() : a[2].toInt32()) >>> 0; },
    onLeave: function(r){
      var om = r.toInt32() >>> 0; n++;
      console.log('[EXT_OPMODE] #' + n + ' arg_mode=0x' + this.argMode.toString(16) + ' -> return op_mode=0x' + om.toString(16) + (om === 0x80a9 ? '  <<< 8K' : ''));
    }
  });
  console.log('[EXT_OPMODE] armed @ ' + p);
})();
