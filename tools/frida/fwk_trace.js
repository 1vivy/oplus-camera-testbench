/*
 * fwk_trace.js — capture the OPlus-framework API surface the camera app uses,
 * to build accurate stubs. Attach to com.oplus.camera (or cameraserver for native).
 * Logs: (1) framework classes loaded from a non-app classloader,
 *       (2) reflective Class.forName / Method.invoke into com.oplus/android framework,
 *       (3) ServiceManager.getService/checkService names.
 * Run:  frida -H 127.0.0.1:27043 -n com.oplus.camera -l fwk_trace.js   (or --spawn)
 * Collect stdout to a file; exercise the camera; the unique set = the stub surface.
 */
'use strict';
const seenCls = new Set(), seenRefl = new Set(), seenSvc = new Set();
function isFwk(n){
  if(!n) return false;
  // OPlus framework / android extensions, but NOT the app's own packages or pure AOSP-app code
  if(n.startsWith('com.oplus.camera.')) return false;          // app's own
  return n.startsWith('com.oplus.') || n.startsWith('com.oppo.') ||
         n.startsWith('android.') && n.indexOf('oplus')>=0 ||
         n.startsWith('com.android.internal.oplus') || n.startsWith('oplus.');
}
Java.perform(function(){
  // 1) classloader.loadClass — flag classes resolved by a parent/boot loader (framework)
  try {
    const CL = Java.use('java.lang.ClassLoader');
    CL.loadClass.overload('java.lang.String').implementation = function(n){
      const r = this.loadClass(n);
      try { if(isFwk(n) && !seenCls.has(n)){ seenCls.add(n);
        send({t:'CLASS', name:n, loader:this.$className}); } } catch(e){}
      return r;
    };
  } catch(e){ send({t:'ERR', m:'loadClass hook: '+e}); }

  // 2) reflection: Class.forName + Method.invoke
  try {
    const C = Java.use('java.lang.Class');
    C.forName.overload('java.lang.String').implementation = function(n){
      if(isFwk(n) && !seenRefl.has('C:'+n)){ seenRefl.add('C:'+n); send({t:'FORNAME', name:n}); }
      return this.forName(n);
    };
    C.forName.overload('java.lang.String','boolean','java.lang.ClassLoader').implementation = function(n,a,b){
      if(isFwk(n) && !seenRefl.has('C:'+n)){ seenRefl.add('C:'+n); send({t:'FORNAME', name:n}); }
      return this.forName(n,a,b);
    };
    const M = Java.use('java.lang.reflect.Method');
    M.invoke.implementation = function(obj, args){
      try { const dc = this.getDeclaringClass().getName();
        if(isFwk(dc)){ const key=dc+'#'+this.getName();
          if(!seenRefl.has(key)){ seenRefl.add(key); send({t:'INVOKE', cls:dc, method:this.getName()}); } }
      } catch(e){}
      return this.invoke(obj, args);
    };
  } catch(e){ send({t:'ERR', m:'reflection hook: '+e}); }

  // 3) ServiceManager.getService / checkService
  try {
    const SM = Java.use('android.os.ServiceManager');
    ['getService','checkService','getServiceOrThrow','waitForService'].forEach(function(fn){
      if(SM[fn]){ try { SM[fn].overload('java.lang.String').implementation = function(s){
        if(!seenSvc.has(s)){ seenSvc.add(s); send({t:'SERVICE', name:s}); }
        return this[fn](s);
      }; } catch(e){} }
    });
  } catch(e){ send({t:'ERR', m:'SM hook: '+e}); }

  send({t:'READY', msg:'fwk_trace armed — exercise the camera now'});
});
