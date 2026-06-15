/*
 * r4-oem-transact/20_trace_ext_transact.js — symmetric OOS/LOS trace of the media.camera OEM layer.
 * doc-48 / logging-gap G5. Frida 17.
 *
 * Auto-detects the attached process:
 *   - SERVER (cameraserver, has libcsextimpl.so): hooks the 6 CameraServiceExtImpl call sites.
 *       On LOS the lib is absent -> reports "ABSENT" (that is the A/B tell).
 *   - CLIENT (com.oplus.camera, Java available): hooks BinderProxy.transact for codes 10000-10022
 *       on media.camera, logs the code name + reply status. Runs on BOTH builds; on LOS the codes
 *       return UNKNOWN_TRANSACTION while the SDK believes the channel is live.
 *
 * Usage (frida 17; `adb shell setenforce 0` first):
 *   frida -U -n cameraserver       -l 20_trace_ext_transact.js   # OOS server depth
 *   frida -U -n com.oplus.camera   -l 20_trace_ext_transact.js   # client depth (both builds)
 *
 * Symbols are build-pinned to stock 16.0.7.201 libcsextimpl.so (demangled in doc-48). Re-verify with
 * `llvm-nm -D libcsextimpl.so` if the blob changes.
 */
'use strict';

var TXN = {
  10000:'FIRST_CALL', 10001:'ADD_AUTH_RESULT', 10002:'SET_DEATH_RECIPIENT', 10003:'SET_PACKAGE_NAME',
  10004:'CLIENT_IS_AUTHED', 10005:'SET_CLIENT_INFO', 10006:'SET_CALL_INFO', 10007:'SET_RIO_CLIENT_INFO',
  10008:'SET_TORCH_INTENSITY', 10009:'DISCONNECT_CLIENTS', 10010:'SET_OMOJI_JSON', 10011:'CONNECT_STATUS',
  10012:'OPEN_AON', 10013:'CLOSE_AON', 10014:'PRE_OPEN_CAMERA', 10015:'SEND_OPLUS_EXT_CAM_CMD',
  10016:'SET_IS_CAMERA_UNIT_SESSION', 10017:'READ_OPLUS_HAL_MEMORY', 10018:'READ_OPLUS_CAMERA_SERVER_MEMORY',
  10019:'REGISTER_CAMERA_DEVICE_CALLBACK', 10020:'UNREGISTER_CAMERA_DEVICE_CALLBACK',
  10021:'SET_SATELLITE_CALL_STATE', 10022:'SET_DEATH_RECIPIENT_FOR_NAME'
};
function txnName(c){ return TXN[c] || ('OEM_'+c); }

// CameraServiceExtImpl exports (mangled), 16.0.7.201 libcsextimpl.so — doc-48 evidence index.
var EXT = {
  onTransact:                  '_ZN7android20CameraServiceExtImpl10onTransactEjRKNS_6ParcelEPS1_j',
  getExtensionOperatingMode:   '_ZN7android20CameraServiceExtImpl25getExtensionOperatingModeERKNS_14CameraMetadataEmi',
  beforeConfigureStreamsLocked:'_ZN7android20CameraServiceExtImpl28beforeConfigureStreamsLockedERKNS_14CameraMetadataEmNS_7String8ERNS_7camera39StreamSetEi',
  processPreview:              '_ZN7android20CameraServiceExtImpl14processPreviewEPKNS_7camera320camera_stream_bufferEmRKNS1_15InFlightRequestE',
  beforeMetadataSendToApp:     '_ZN7android20CameraServiceExtImpl23beforeMetadataSendToAppEPNS_13CaptureResultEjRNS_7camera319CaptureOutputStatesE',
  addRemovePackageName:        '_ZN7android20CameraServiceExtImpl20addRemovePackageNameERKNS_14CameraMetadataEmb'
};

function findLib(name){
  try { var m = Process.findModuleByName(name); if (m) return m; } catch(e){}
  return null;
}
function exp(lib, sym){
  // frida 17 REMOVED the static Module.getExportByName(lib,sym)/findExportByName — they THROW
  // "is not a function", so the old try/catch silently returned null and armed ZERO hooks on a lib
  // whose symbols were perfectly resolvable (the .300 "all false" — NOT symbol drift; doc-50).
  // Must use the module-INSTANCE method.
  try { var m = Process.findModuleByName(lib); if (!m) return null;
        var p = m.findExportByName(sym); if (p) return p; } catch(e){}
  return null;
}

// rate-limit the high-frequency preview hooks so the log stays readable
var pvCount = 0, mdCount = 0;

function hookServer(){
  var lib = 'libcsextimpl.so';
  console.log('[r4][server] libcsextimpl.so @ ' + findLib(lib).base + ' — OEM layer PRESENT');

  var pOT = exp(lib, EXT.onTransact);
  if (pOT) Interceptor.attach(pOT, {
    onEnter: function(a){ this.code = a[1].toInt32(); },
    onLeave: function(r){ console.log('[r4][server] onTransact code=' + this.code + ' (' + txnName(this.code) + ') ret=' + r.toInt32()); }
  });

  var pOM = exp(lib, EXT.getExtensionOperatingMode);
  if (pOM) Interceptor.attach(pOM, {
    onEnter: function(a){ this.m = a[2].toUInt32 ? a[2].toUInt32() : a[2].toInt32(); },
    onLeave: function(r){
      var om = r.toInt32() >>> 0;
      console.log('[r4][server] getExtensionOperatingMode arg_m=0x' + this.m.toString(16) + ' -> opmode=0x' + om.toString(16) + (om===0x80a9 ? '  <<< 8K' : ''));
    }
  });

  var pBC = exp(lib, EXT.beforeConfigureStreamsLocked);
  if (pBC) Interceptor.attach(pBC, {
    onEnter: function(a){
      var m = (a[2].toUInt32 ? a[2].toUInt32() : a[2].toInt32()) >>> 0;
      this.ss = a[4];                       // StreamSet& — correlate with hook_configure_streams.js
      console.log('[r4][server] beforeConfigureStreamsLocked arg_m=0x' + m.toString(16) +
                  ' StreamSet@' + this.ss + (m===0x80a9 ? '  <<< 8K op_mode' : ''));
    },
    onLeave: function(){ console.log('[r4][server] beforeConfigureStreamsLocked done (StreamSet may be mutated — diff vs configure_streams dump)'); }
  });

  var pPP = exp(lib, EXT.processPreview);
  if (pPP) Interceptor.attach(pPP, { onEnter: function(){ if ((pvCount++ % 30) === 0) console.log('[r4][server] processPreview x' + pvCount); } });

  var pMD = exp(lib, EXT.beforeMetadataSendToApp);
  if (pMD) Interceptor.attach(pMD, { onEnter: function(){ if ((mdCount++ % 30) === 0) console.log('[r4][server] beforeMetadataSendToApp x' + mdCount); } });

  var pAR = exp(lib, EXT.addRemovePackageName);
  if (pAR) Interceptor.attach(pAR, {
    onEnter: function(a){ this.add = a[3].toInt32(); },
    onLeave: function(){ console.log('[r4][server] addRemovePackageName add=' + this.add + ' (identity stamp into metadata)'); }
  });

  console.log('[r4][server] hooks armed: onTransact=' + !!pOT + ' opmode=' + !!pOM +
              ' beforeConfigure=' + !!pBC + ' processPreview=' + !!pPP +
              ' beforeMeta=' + !!pMD + ' addRemovePkg=' + !!pAR);
}

function hookClient(){
  Java.perform(function(){
    var BinderProxy = Java.use('android.os.BinderProxy');
    BinderProxy.transact.implementation = function(code, data, reply, flags){
      var ret = this.transact(code, data, reply, flags);
      if (code >= 10000 && code <= 10022){
        var status = '';
        try {
          // peek reply exception code without consuming (best-effort)
          status = ' ret=' + ret;
        } catch(e){}
        console.log('[r4][client] transact ' + code + ' (' + txnName(code) + ')' + status +
                    (ret ? '' : '  <<< returned false / likely UNKNOWN_TRANSACTION (LOS silent-drop)'));
      }
      return ret;
    };
    console.log('[r4][client] BinderProxy.transact hooked — watching OEM codes 10000-10022 on media.camera');
  });
}

(function main(){
  if (findLib('libcsextimpl.so')){
    hookServer();
  } else if (typeof Java !== 'undefined' && Java.available){
    // could be cameraserver-without-lib (LOS) OR the app; report the LOS server case explicitly
    try {
      var isCs = Process.enumerateModules().some(function(m){ return m.name.indexOf('libcameraservice') >= 0; });
      if (isCs){ console.log('[r4][server] libcsextimpl.so ABSENT in cameraserver — stock AOSP (expect LOS). No OEM hooks to arm.'); }
    } catch(e){}
    hookClient();
  } else {
    console.log('[r4] no libcsextimpl and no Java — wrong process? attach to cameraserver or com.oplus.camera.');
  }
})();
