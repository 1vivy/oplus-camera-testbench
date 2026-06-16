'use strict';

function out(m) { send('[OCSLOG] ' + m); }

function resolveClass(name) {
  try {
    return Java.use(name);
  } catch (e) {}

  var hit = null;
  Java.enumerateClassLoaders({
    onMatch: function (loader) {
      if (hit) return;
      try {
        hit = Java.ClassFactory.get(loader).use(name);
      } catch (e) {}
    },
    onComplete: function () {}
  });
  return hit;
}

function setBool(cls, field, val) {
  if (cls === null) return field + '=<no-class>';
  try {
    var f = cls[field];
    if (f === undefined) return field + '=<no-field>';
    var before = f.value;
    f.value = val;
    return field + '=' + before + '->' + f.value;
  } catch (e) {
    return field + '=ERR(' + e + ')';
  }
}

function enableAll() {
  var ALog = resolveClass('com.oplus.ocs.camera.consumer.apsAdapter.ALog');
  var aRes = 'ALog=<no-class>';
  if (ALog !== null) {
    var aParts = [];
    try {
      ALog.setALogEnable(true);
      aParts.push('setALogEnable(true)ok');
    } catch (e) {
      aParts.push('setALogEnable ERR ' + e);
    }
    aParts.push(setBool(ALog, 'sEnable', true));
    aParts.push(setBool(ALog, 'sLogEncryptEnable', false));
    var jniFailed = '?';
    try { jniFailed = '' + ALog.sJNILoadFailed.value; } catch (e) {}
    aRes = 'ALog[' + aParts.join(', ') + ', sJNILoadFailed=' + jniFailed + ']';
  }

  var CUL = resolveClass('com.oplus.ocs.camera.common.util.CameraUnitLog');
  var cRes = 'CameraUnitLog=<no-class>';
  if (CUL !== null) {
    var cParts = [];
    cParts.push(setBool(CUL, 'sbLogOn', true));
    cParts.push(setBool(CUL, 'sbTraceOn', true));
    cParts.push(setBool(CUL, 'sbLaoOn', true));
    cParts.push(setBool(CUL, 'sBlockNonLaoLog', false));
    try {
      CUL.initLog(true, true, true);
      cParts.push('initLog(t,t,t)ok');
    } catch (e) {
      cParts.push('initLog ERR ' + e);
    }
    cRes = 'CameraUnitLog[' + cParts.join(', ') + ']';
  }

  var AAL = resolveClass('com.oplus.ocs.camera.consumer.apsAdapter.ApsAdapterLog');
  var adRes = 'ApsAdapterLog=<no-class>';
  if (AAL !== null) {
    var adParts = [];
    adParts.push(setBool(AAL, 'sbLogOn', true));
    adParts.push(setBool(AAL, 'sbTraceOn', true));
    adParts.push(setBool(AAL, 'sbLaoOn', true));
    adParts.push(setBool(AAL, 'sBlockNonLaoLog', false));
    adRes = 'ApsAdapterLog[' + adParts.join(', ') + ']';
  }

  var IPU = resolveClass('com.oplus.ocs.camera.ipusdk.IPULog');
  var iRes = 'IPULog=<no-class>';
  if (IPU !== null) {
    var iParts = [];
    iParts.push(setBool(IPU, 'sbLogOn', true));
    iParts.push(setBool(IPU, 'sbTraceOn', true));
    iParts.push(setBool(IPU, 'sbLaoOn', true));
    iRes = 'IPULog[' + iParts.join(', ') + ']';
  }

  var LGR = resolveClass('com.oplus.utils.Logger');
  var lRes = 'Logger=<no-class>';
  if (LGR !== null) {
    var lParts = [];
    try {
      LGR.setDebug(true);
      lParts.push('setDebug(true)ok');
    } catch (e) {
      lParts.push('setDebug ERR ' + e);
    }
    lParts.push(setBool(LGR, 'sDEBUG', true));
    lRes = 'Logger[' + lParts.join(', ') + ']';
  }

  var found = [ALog, CUL, AAL, IPU, LGR].filter(function (c) { return c !== null; }).length;
  out('SET ' + found + '/5 loggers: ' + aRes + ' | ' + cRes + ' | ' + adRes + ' | ' + iRes + ' | ' + lRes);
  return found > 0;
}

function main() {
  Java.perform(function () {
    if (!Java.available) {
      out('FATAL: Java runtime not available');
      return;
    }
    out('attached; enabling OCS SDK loggers');
    var ok = enableAll();
    if (!ok) out('no SDK loggers resolved yet; retrying');

    var ticks = 0;
    setInterval(function () {
      ticks++;
      enableAll();
      if (ticks % 10 === 0) out('re-assert t=' + ticks + 's');
    }, 1000);
  });
}

main();
