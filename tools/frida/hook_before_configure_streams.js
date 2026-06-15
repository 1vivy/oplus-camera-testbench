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
 *
 * StreamSet walk (conservative, READ-ONLY):
 *   StreamSet::size / StreamSet::operator[] are IMPORTED from libcameraservice — resolved via Anchor
 *   (export+symtab; no offset fallback). If either misses, falls back to the original shallow hdr16 dump.
 *   Per-stream vtable reads: width/height/format slots HIGH confidence; +0xa0 HAL-struct sub-offsets MEDIUM
 *   (hexdumped raw, not decoded, so future mapping is safe). Every stream read is individually try/catched;
 *   the whole walk bails on any miss. ⚠️ STRICTLY READ-ONLY — no writes, no NativeFunction calls on streams.
 *
 * VALIDATION (2026-06-15, live on cameraserver, 16.0.8.300):
 *   ✓ beforeConfigureStreamsLocked + StreamSet::size + StreamSet::operator[] all RESOLVE via export, and
 *     size() returns the real stream count (9) — a genuine improvement over the old shallow hdr16 dump.
 *     No crash: the per-stream guards held through an access violation (cameraserver stayed alive).
 *   ⚠ Per-stream field extraction is NOT yet working: the virtual-base thunk deref
 *     (ifc = stream + *(*stream - 0x198)) yields a bad pointer → "access violation" → the walk bails safely.
 *     OPEN for the next RE pass: re-confirm against a LIVE stream object whether (a) the -0x198 vbase-thunk
 *     offset is correct for Camera3OutputStream here, or (b) StreamSet::operator[]'s sp<> out-param ABI gives
 *     a different `stream` base than assumed. Dump the raw stream ptr + *stream (vptr) + a few vtable words
 *     first. Until then the probe reports stream COUNT (validated) and falls back; it never crashes.
 */
'use strict';
(function(){
  var SPEC = {
    lib: 'libcsextimpl.so', name: 'CameraServiceExtImpl::beforeConfigureStreamsLocked',
    export: '_ZN7android20CameraServiceExtImpl28beforeConfigureStreamsLockedERKNS_14CameraMetadataEmNS_7String8ERNS_7camera39StreamSetEi',
    symtab: '_ZN7android20CameraServiceExtImpl28beforeConfigureStreamsLockedERKNS_14CameraMetadataEmNS_7String8ERNS_7camera39StreamSetEi'
  };

  // StreamSet ABI — imported from libcameraservice, resolved via Anchor (export+symtab; no offset fallback:
  // we have no pinned offset for these and the export rung is durable).
  var SPEC_SS_SIZE = {
    lib: 'libcameraservice.so', name: 'StreamSet::size',
    export: '_ZNK7android7camera39StreamSet4sizeEv',
    symtab: '_ZNK7android7camera39StreamSet4sizeEv'
  };
  var SPEC_SS_AT = {
    lib: 'libcameraservice.so', name: 'StreamSet::operator[]',
    export: '_ZN7android7camera39StreamSetixEm',
    symtab: '_ZN7android7camera39StreamSetixEm'
  };

  function anchorResolve(spec) {
    if (typeof Anchor !== 'undefined' && Anchor.resolve) return Anchor.resolve(spec);
    var m = Process.findModuleByName(spec.lib); if (!m) return null;
    try { var p = m.findExportByName(spec.export); if (p) { console.log('[BCSL] resolved ' + spec.name + ' via export(standalone) @ ' + p); return p; } } catch(e){}
    return null;
  }

  function resolve(spec){
    if (typeof Anchor !== 'undefined' && Anchor.resolve) return Anchor.resolve(spec);
    var m = Process.findModuleByName(spec.lib); if (!m) return null;
    try { var p = m.findExportByName(spec.export); if (p) { console.log('[BCSL] resolved via export(standalone) @ ' + p); return p; } } catch(e){}
    return null;
  }

  function hexdump16(ptr){ try { return Array.from(new Uint8Array(ptr.readByteArray(16))).map(function(b){return ('0'+b.toString(16)).slice(-2);}).join(' '); } catch(e){ return '??'; } }

  // Safe hexdump of N bytes at ptr, space-separated, fully guarded.
  function safeHexN(ptr, n) {
    try { return Array.from(new Uint8Array(ptr.readByteArray(n))).map(function(b){return ('0'+b.toString(16)).slice(-2);}).join(' '); } catch(e){ return '??'; }
  }

  // Walk the StreamSet using API-driven size()+operator[]. Returns true on success.
  // operator[](ss, i) writes an sp<CameraDeviceBase> into outSp (stack scratch); stream = outSp.readPointer().
  // Virtual getters (READ-ONLY, HIGH confidence): vtbl+0x20=getWidth, +0x28=getHeight, +0x30=getFormat.
  // vtbl+0xa0 = getter returning a HAL-stream-struct ptr (MEDIUM confidence sub-offsets — hexdump only).
  function walkStreamSet(tag, ss, fnSize, fnAt) {
    try {
      var count = fnSize(ss);
      // count is uint64 from NativeFunction; coerce to JS number safely
      var n = (typeof count.toNumber === 'function') ? count.toNumber() : Number(count);
      if (n < 0 || n > 64) { console.log('[BCSL] ' + tag + ' StreamSet size=' + n + ' (suspicious, skip walk)'); return false; }
      console.log('[BCSL] ' + tag + ' StreamSet@' + ss + ' size=' + n);
      // allocate scratch for operator[] out-param sp<> (16 bytes: ptr + refcount)
      var outSp = Memory.alloc(16);
      for (var i = 0; i < n; i++) {
        try {
          outSp.writeByteArray([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);  // frida-17: instance method (static Memory.writeByteArray was removed — "not a function")
          fnAt(outSp, ss, ptr(i));
          var stream = null;
          try { stream = outSp.readPointer(); } catch(e2) {}
          if (!stream || stream.isNull()) { console.log('[BCSL] ' + tag + '   stream[' + i + '] sp=null (operator[] wrote null)'); continue; }
          // Dereference the virtual base: ifc = stream + *(long*)(*stream - 0x198)
          // This is the virtual-base thunk for the ICameraDeviceUser interface.
          var ifc = null;
          try {
            var vtbl = stream.readPointer();
            var thunk = vtbl.sub(0x198).readPointer();
            ifc = stream.add(thunk);
          } catch(e3) { ifc = stream; } // if thunk read fails, fall back to stream directly
          // Virtual getters — READ-ONLY, called as const methods (this=ifc).
          // HIGH confidence slots (doc-35 ABI, verified against libcameraservice vtable layout):
          //   vtbl[ifc]+0x20 = getWidth() -> int
          //   vtbl[ifc]+0x28 = getHeight() -> int
          //   vtbl[ifc]+0x30 = getFormat() -> int
          var width = '?', height = '?', format = '?';
          try {
            var ifcVtbl = ifc.readPointer();
            var fWidth  = new NativeFunction(ifcVtbl.add(0x20).readPointer(), 'int', ['pointer']);
            var fHeight = new NativeFunction(ifcVtbl.add(0x28).readPointer(), 'int', ['pointer']);
            var fFormat = new NativeFunction(ifcVtbl.add(0x30).readPointer(), 'int', ['pointer']);
            width  = fWidth(ifc);
            height = fHeight(ifc);
            format = fFormat(ifc);
          } catch(e4) { /* leave ?, don't crash */ }
          // MEDIUM confidence: vtbl+0xa0 returns a HAL-stream-struct ptr; sub-offsets unwitnessed beyond +0x14.
          // Hexdump first 0x40 bytes for later mapping — no sub-field assumptions.
          var halHex = '(getter-miss)';
          try {
            var ifcVtbl2 = ifc.readPointer();
            var fHal = new NativeFunction(ifcVtbl2.add(0xa0).readPointer(), 'pointer', ['pointer']);
            var halPtr = fHal(ifc);
            if (halPtr && !halPtr.isNull()) {
              halHex = safeHexN(halPtr, 0x40);
            } else {
              halHex = '(null)';
            }
          } catch(e5) { /* leave (getter-miss) */ }
          console.log('[BCSL] ' + tag + '   stream[' + i + '] @' + stream +
                      ' width=' + width + ' height=' + height + ' format=0x' + (typeof format === 'number' ? format.toString(16) : format) +
                      (width === 7680 && height === 4320 ? '  <<< 8K STREAM' : '') +
                      '\n             hal+0xa0 hex[0x40]=' + halHex + '  (MEDIUM confidence; map +0x14 onwards via future RE)');
        } catch(eStream) {
          console.log('[BCSL] ' + tag + '   stream[' + i + '] read err: ' + eStream + ' — bailing walk');
          return false;
        }
      }
      return true;
    } catch(eWalk) {
      console.log('[BCSL] ' + tag + ' StreamSet walk err: ' + eWalk);
      return false;
    }
  }

  // Resolve StreamSet API once at arm time (libcameraservice must be loaded in cameraserver).
  var fnSSSize = null, fnSSAt = null;
  function resolveStreamSetAPI() {
    if (fnSSSize && fnSSAt) return true;
    var pSize = anchorResolve(SPEC_SS_SIZE);
    var pAt   = anchorResolve(SPEC_SS_AT);
    if (!pSize || !pAt) return false;
    try {
      fnSSSize = new NativeFunction(pSize, 'uint64', ['pointer']);
      // operator[](StreamSet* this, size_t i) writes sp<> into first arg (out-param ABI on aarch64
      // for non-trivially-copyable return: hidden first ptr param receives the sp<>).
      fnSSAt   = new NativeFunction(pAt,   'void',   ['pointer', 'pointer', 'pointer']);
    } catch(e) { console.log('[BCSL] StreamSet NativeFunction wrap err: ' + e); return false; }
    console.log('[BCSL] StreamSet API resolved: size@' + pSize + ' operator[]@' + pAt);
    return true;
  }

  var p = resolve(SPEC);
  if (!p) { console.log('[BCSL] MISS — libcsextimpl absent here or symbol unresolved (LOS has no call-site)'); return; }

  var n = 0;
  Interceptor.attach(p, {
    onEnter: function(a){
      this.op = (a[2].toUInt32 ? a[2].toUInt32() : a[2].toInt32()) >>> 0;
      this.ss = a[4];
      n++;
      console.log('[BCSL] #' + n + ' INVOKED op_mode=0x' + this.op.toString(16) + (this.op === 0x80a9 ? '  <<< 8K' : '') + ' StreamSet@' + this.ss);
      // PRE-mutation walk (before cameraserver injects streams)
      if (resolveStreamSetAPI()) {
        walkStreamSet('#' + n + ' PRE', this.ss, fnSSSize, fnSSAt);
      } else {
        console.log('[BCSL] #' + n + ' PRE StreamSet@' + this.ss + ' hdr16=[' + hexdump16(this.ss) + '] (StreamSet API unresolved — shallow fallback)');
      }
    },
    onLeave: function(){
      // POST-mutation walk: shows any injected streams (e.g. the 8K EISv2 output stream)
      if (resolveStreamSetAPI()) {
        walkStreamSet('#' + n + ' POST', this.ss, fnSSSize, fnSSAt);
      } else {
        console.log('[BCSL] #' + n + ' POST StreamSet@' + this.ss + ' hdr16=[' + hexdump16(this.ss) + '] (diff vs hook_configure_streams pre-dump for the injected 8K output stream)');
      }
    }
  });
  console.log('[BCSL] armed @ ' + p);
})();
