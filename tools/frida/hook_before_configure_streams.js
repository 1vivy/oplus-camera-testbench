/*
 * tools/frida/hook_before_configure_streams.js — TIER-2 8K -38 probe (doc-35/43/48/50).
 * CameraServiceExtImpl::beforeConfigureStreamsLocked(CameraMetadata const&, op_mode, String8, StreamSet&, int)
 * is the OEM Depth-2 hook where stock cameraserver may MUTATE the StreamSet (inject the 7680x4320 video
 * OUTPUT stream the EISv2 node needs). On LOS this call-site is absent. Pairs with hook_configure_streams.js
 * (the provider-side pre-mutation dump) for a before/after diff.
 *
 * Server-side: attach to cameraserver. Resolves by EXPORTED mangled symbol (present on 16.0.8.300 libcsextimpl).
 * args: a0=this, a1=CameraMetadata&, a2=op_mode(ulong), a3=String8, a4=StreamSet&, a5=int.
 * Run standalone: frida -U -n cameraserver -l tools/frida/_anchor.js -l this.js
 */
'use strict';
(function(){
  var SPEC = {
    lib: 'libcsextimpl.so', name: 'CameraServiceExtImpl::beforeConfigureStreamsLocked',
    export: '_ZN7android20CameraServiceExtImpl28beforeConfigureStreamsLockedERKNS_14CameraMetadataEmNS_7String8ERNS_7camera39StreamSetEi',
    symtab: '_ZN7android20CameraServiceExtImpl28beforeConfigureStreamsLockedERKNS_14CameraMetadataEmNS_7String8ERNS_7camera39StreamSetEi'
  };
  function resolve(spec){
    if (typeof Anchor !== 'undefined' && Anchor.resolve) return Anchor.resolve(spec);
    var m = Process.findModuleByName(spec.lib); if (!m) return null;
    try { var p = m.findExportByName(spec.export); if (p) { console.log('[BCSL] resolved via export(standalone) @ ' + p); return p; } } catch(e){}
    return null;
  }
  function hexdump16(ptr){ try { return Array.from(new Uint8Array(ptr.readByteArray(16))).map(function(b){return ('0'+b.toString(16)).slice(-2);}).join(' '); } catch(e){ return '??'; } }

  var p = resolve(SPEC);
  if (!p) { console.log('[BCSL] MISS — libcsextimpl absent here or symbol unresolved (LOS has no call-site)'); return; }

  var n = 0;
  Interceptor.attach(p, {
    onEnter: function(a){
      this.op = (a[2].toUInt32 ? a[2].toUInt32() : a[2].toInt32()) >>> 0;
      this.ss = a[4];
      n++;
      console.log('[BCSL] #' + n + ' INVOKED op_mode=0x' + this.op.toString(16) + (this.op === 0x80a9 ? '  <<< 8K' : '') + ' StreamSet@' + this.ss);
    },
    onLeave: function(){
      // post-mutation StreamSet snapshot. Full StreamSet walk needs the ABI (follow-up); for now log the
      // header bytes + any embedded pointer-to-vector so a before/after diff vs hook_configure_streams is possible.
      console.log('[BCSL] #' + n + ' POST StreamSet@' + this.ss + ' hdr16=[' + hexdump16(this.ss) + '] (diff vs hook_configure_streams pre-dump for the injected 8K output stream)');
    }
  });
  console.log('[BCSL] armed @ ' + p);
})();
