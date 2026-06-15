// trace_turbohdr_tag.js — R6 OEM IPE TurboHDR vendor-tag (~0x4d78) presence probe (#6 strlen-null)
// =============================================================================
// PURPOSE: capture, per HDR/master-capture frame, whether the OEM IPE TurboHDR vendor-tag
// (~0x4d78) is PRESENT in the result metadata and whether the consumed struct field
// `field_0x4d88` is NON-NULL at the deref site. This is the symmetric diff oracle for #6:
//
//   STOCK (OOS, this baseline): tag PRESENT  -> parseTurboHdrInfo TAKES the store branch
//                               -> field_0x4d88 NON-NULL -> setProcessOtherParams+140
//                                  does strlen(VALID ptr) -> NO crash.
//   LOS (the diff target):      tag ABSENT   -> parseTurboHdrInfo cbz-SKIPS the store
//                               -> field_0x4d88 == NULL  -> setProcessOtherParams+140
//                                  does strlen(NULL)      -> SIGSEGV (#6), today masked by
//                                  libapsfixup Family-III wrap_strlen(null)->0.
//
// THE ONE COMPARABLE RECORD per HDR frame (what the diff harness reads):
//   [TURBOHDR] event=<parse|deref> field_0x4d88=<ptr|NULL> tagPresent=<0|1|?> -> verdict=<PRESENT_NONNULL|ABSENT_NULL|...>
//
// THE SITES (RE-anchored; aec-hdrdetect-publish-RE.md / decmetarefzero-upcall-RE.md /
//            libapsfixup-interposition-RE.md §6 / C4-hal-provider.md §57-58,75-81 /
//            DIRTY-NOTES-EXAM.md §323-367; image base 0x100000, file off = Ghidra/device - 0x100000):
//
//   * setProcessOtherParams+140  device(Ghidra) 0x1441ad4  -> FILE OFF 0x1341ad4
//       `ldr x23,[x0,#0x4d88]` (encoding f966c417) then strlen(x23). x0 = the TurboRaw `this`,
//       so we read `this+0x4d88` on ENTER and report whether it is null. THE DEREF SITE.
//
//   * TurboRaw::parseTurboHdrInfo : loads base tag w22=0x4d78, calls getMetadata, and on a
//       non-null result STORES via `str x8,[x20,#0x4d88]` (cbz-skips on null). THE PRODUCER.
//       Stripped: NO numeric offset is published for it in the RE set — see ⚠ MODULE/OFFSET note.
//       We resolve it by EXPORTED SYMBOL only (best-effort); if unresolved we still get the
//       authoritative verdict from the deref site above.
//
// ⚠ MODULE / OFFSET RESOLUTION NOTE (do not fabricate — flagged):
//   The task header says "libAlgoProcess.so", but the deref device addr 0x1441ad4 (file off
//   0x1341ad4 = 19.3 MB) is LARGER than libAlgoProcess.so itself (6,943,624 B = 0x69F388), so
//   it CANNOT live there. libAlgoInterface.so is 42,295,424 B (0x2858000) and DIRTY-NOTES-EXAM
//   §329 places `parseTurboHdrInfo`/`TurboRaw` in **libAlgoInterface**. Therefore the file off
//   0x1341ad4 is attached against **libAlgoInterface.so** (not libAlgoProcess). We still POLL on
//   **libAlgoProcess.so** as the LOAD-GATE (it co-loads on real photo/master capture, the only
//   condition that brings the TurboRaw path in — observe_getmetadata never loaded it on plain
//   video, REQUIREMENTS R6 DARK). If your build differs, flip TURBORAW_MOD below.
//
// SAFETY / RUNTIME MODEL:
//   * ATTACH ONLY — never spawn. Runs APP-side in com.oplus.camera (where libAlgoProcess/OCS live).
//   * Poll-until-loaded for libAlgoProcess.so (loads only on real photo/master/Pro capture,
//     NOT plain preview/video — the condition that previously kept R6 DARK).
//   * All memory reads guarded (try/catch). The deref read is a passive load of this+0x4d88 — it
//     does NOT call strlen and does NOT alter control flow; pure observation.
//   * SYMMETRIC: identical script + parser on OOS (now) and LOS (later) for the #6 diff.
//   * HOST-ONLY AUTHORING: do NOT run from the host harness; another process owns the device.
//
// RUN (on stock, app at preview, take an HDR / Master(Pro) photo):
//   P=$(adb shell 'su -c "pidof com.oplus.camera"' | tr -d '\r')
//   frida -U -p "$P" -l tools/frida/trace_turbohdr_tag.js > /tmp/turbohdr_tag.txt
//   >>> point at an HDR scene, take ONE HDR photo + ONE Master/Pro capture <<<
// =============================================================================
'use strict';

// ── tunables ────────────────────────────────────────────────────────────────
var MAX_LOG_PER_HOOK = 200;
var TALLY_MS = 4000;
var GATE_MOD = 'libAlgoProcess.so';     // poll-gate: co-loads on real photo/master capture
var TURBORAW_MOD = 'libAlgoInterface.so'; // module that actually hosts TurboRaw (see ⚠ note)

// ── TurboRaw struct field + the deref-site file offset ──────────────────────────────────────
var FIELD_OFF        = 0x4d88;     // TurboRaw::field_0x4d88 (the "other params" string ptr; null on LOS)
var TAG_HASH         = 0x4d78;     // the OEM IPE TurboHDR vendor-tag base (~0x4d78), for context only
var OFF_SETPROCESS_DEREF = 0x1341ad4; // setProcessOtherParams+140, device 0x1441ad4 - 0x100000 (libAlgoInterface)

// parseTurboHdrInfo: stripped, no numeric offset in the RE set — symbol-resolve only (best-effort).
var SYM_PARSE_CANDIDATES = [
  '_ZN8TurboRaw17parseTurboHdrInfoEv',
  '_ZN8TurboRaw17parseTurboHdrInfoEP15camera_metadata',
];

// ── helpers ─────────────────────────────────────────────────────────────────
// frida-17: static Module.*ExportByName removed -> instance method (doc-50)
function gx(lib, sym){ var m = Process.findModuleByName(lib); return m ? m.findExportByName(sym) : null; }
function ts() { return '[' + (Date.now() % 1000000) + ']'; }
function hx(p) { try { return p ? p.toString() : 'null'; } catch (e) { return '?'; } }
function isNull(p) { try { return !p || p.isNull(); } catch (e) { return true; } }

var counts = {};
function gate(hook) { counts[hook] = (counts[hook] || 0) + 1; return counts[hook] <= MAX_LOG_PER_HOOK; }

var tally = { parseSeen: 0, parseStored: 0, parseSkipped: 0, deref: 0, derefNull: 0, derefNonNull: 0 };

function findMod(name) {
  try { var m = Process.findModuleByName(name); if (m) return m; } catch (e) {}
  try { var arr = Process.enumerateModules();
    for (var i = 0; i < arr.length; i++) if (arr[i].name.indexOf(name.replace('.so', '')) >= 0) return arr[i];
  } catch (e2) {}
  return null;
}

// =============================================================================
// (1) THE DEREF SITE — setProcessOtherParams+140 (the authoritative verdict)
//     x0 = TurboRaw this; the next insn loads this+0x4d88 then strlen()s it.
//     We read this+0x4d88 passively on ENTER and report null vs non-null = the #6 verdict.
// =============================================================================
function armDerefHook(turboMod) {
  var addr;
  try { addr = turboMod.base.add(OFF_SETPROCESS_DEREF); }
  catch (e) { console.log('[hook] (deref) bad offset: ' + e); return; }
  try {
    Interceptor.attach(addr, {
      onEnter: function (a) {
        tally.deref++;
        var self = a[0];
        var field = null;
        try { field = self.add(FIELD_OFF).readPointer(); } catch (e2) {}
        var nul = isNull(field);
        if (nul) tally.derefNull++; else tally.derefNonNull++;
        if (!gate('setProcessOtherParams.deref')) return;
        // best-effort: peek the first bytes of the "other params" string when non-null
        var preview = '';
        if (!nul) { try { preview = ' str~"' + (field.readCString() || '').slice(0, 24) + '"'; } catch (e3) {} }
        console.log(ts() + ' [TURBOHDR] event=deref this=' + hx(self) +
                    ' field_0x4d88=' + (nul ? 'NULL' : hx(field)) + preview +
                    ' -> verdict=' + (nul ? 'ABSENT_NULL (LOS-signature: strlen(null)->SIGSEGV #6, masked by apsfixup)' :
                                            'PRESENT_NONNULL (STOCK-signature: tag published, strlen ok)'));
      }
    });
    console.log('[hook] (deref) setProcessOtherParams+140 @ ' + addr +
                ' (' + turboMod.name + ' +0x' + OFF_SETPROCESS_DEREF.toString(16) + ', reads this+0x' + FIELD_OFF.toString(16) + ')');
  } catch (e) {
    console.log('[hook] (deref) attach FAIL @ ' + addr + ': ' + e);
  }
}

// =============================================================================
// (2) THE PRODUCER — TurboRaw::parseTurboHdrInfo (symbol-resolve only; flags if unresolved).
//     On LEAVE we read this(x0)+0x4d88 to see whether the store branch was taken (tag present).
// =============================================================================
function armParseHook(turboMod) {
  var found = null;
  for (var i = 0; i < SYM_PARSE_CANDIDATES.length && !found; i++) {
    var sym = SYM_PARSE_CANDIDATES[i];
    try { var a = turboMod.findExportByName ? turboMod.findExportByName(sym) : null;
          if (!a) a = gx(turboMod.name, sym);
          if (a) found = { addr: a, sym: sym }; } catch (e) {}
  }
  if (!found) {
    console.log('[hook] (parse) TurboRaw::parseTurboHdrInfo UNRESOLVED — stripped, no numeric offset in RE set ' +
                '(FLAGGED, not fabricated). Verdict still comes from the deref site (1).');
    return;
  }
  try {
    Interceptor.attach(found.addr, {
      onEnter: function (a) { this.self = a[0]; },
      onLeave: function () {
        tally.parseSeen++;
        var field = null;
        try { field = this.self.add(FIELD_OFF).readPointer(); } catch (e) {}
        var nul = isNull(field);
        if (nul) tally.parseSkipped++; else tally.parseStored++;
        if (!gate('parseTurboHdrInfo')) return;
        console.log(ts() + ' [TURBOHDR] event=parse this=' + hx(this.self) +
                    ' field_0x4d88=' + (nul ? 'NULL' : hx(field)) +
                    ' tagPresent=' + (nul ? '0' : '1') +
                    ' -> verdict=' + (nul ? 'ABSENT_NULL (cbz-skipped store; tag ~0x' + TAG_HASH.toString(16) + ' unpublished)' :
                                            'PRESENT_NONNULL (store branch taken; tag ~0x' + TAG_HASH.toString(16) + ' published)'));
      }
    });
    console.log('[hook] (parse) TurboRaw::parseTurboHdrInfo @ ' + found.addr + ' via symbol ' + found.sym);
  } catch (e) {
    console.log('[hook] (parse) attach FAIL: ' + e);
  }
}

// =============================================================================
// arm — poll for libAlgoProcess (the load-gate), then hook the TurboRaw module
// =============================================================================
function arm() {
  var turboMod = findMod(TURBORAW_MOD);
  if (!turboMod) {
    console.log('[hook] ' + TURBORAW_MOD + ' not present yet — deref+parse hooks deferred to next poll');
    return false;
  }
  console.log(ts() + ' ' + turboMod.name + ' base=' + turboMod.base);
  armDerefHook(turboMod);
  armParseHook(turboMod);
  return true;
}

(function main() {
  var gateMod = findMod(GATE_MOD);
  var armed = false;
  function tryArm(tag) {
    if (armed) return;
    if (arm()) { armed = true; console.log(ts() + ' (armed' + (tag ? ' ' + tag : '') + ')'); }
  }
  if (gateMod && gateMod.base) { console.log(ts() + ' ' + GATE_MOD + ' already loaded'); tryArm('already-loaded'); }
  else {
    console.log(ts() + ' ' + GATE_MOD + ' not loaded yet — polling (real photo/master capture loads it; ' +
                'plain video does NOT — the condition that kept R6 DARK)');
  }
  if (!armed) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var g = findMod(GATE_MOD);
      if (g && g.base) { tryArm('after ' + tries + ' polls'); if (armed) clearInterval(iv); }
      else if (tries > 400) { clearInterval(iv); console.log(ts() + ' FATAL ' + GATE_MOD + ' never loaded (no real capture this run?)'); }
    }, 150);
  }

  // periodic tally — the headline #6 result (PRESENT_NONNULL on stock; the LOS arm flips to ABSENT_NULL)
  setInterval(function () {
    console.log(ts() + ' [TALLY] parse(seen=' + tally.parseSeen + ' stored=' + tally.parseStored +
                ' skipped=' + tally.parseSkipped + ') deref(n=' + tally.deref +
                ' nonNull=' + tally.derefNonNull + ' NULL=' + tally.derefNull + ')' +
                '   << STOCK expect: deref nonNull>0 & NULL=0 (tag ~0x' + TAG_HASH.toString(16) +
                ' published, field_0x' + FIELD_OFF.toString(16) + ' set). LOS diff target = NULL>0 (#6).');
  }, TALLY_MS);
})();

// =============================================================================
// USAGE
// -----------------------------------------------------------------------------
//   ATTACH (never spawn), app at preview, on stock OOS:
//     P=$(adb shell 'su -c "pidof com.oplus.camera"' | tr -d '\r')
//     frida -U -p "$P" -l tools/frida/trace_turbohdr_tag.js > /tmp/turbohdr_tag.txt
//     >>> point at an HDR scene; take ONE HDR photo + ONE Master/Pro capture (loads libAlgoProcess) <<<
//
//   READ THE RESULT — the ONE comparable record per HDR frame:
//     [TURBOHDR] event=<parse|deref> field_0x4d88=<ptr|NULL> -> verdict=<PRESENT_NONNULL|ABSENT_NULL>
//   STOCK (this baseline) expected: PRESENT_NONNULL (tag ~0x4d78 published, field_0x4d88 set,
//     strlen gets a valid ptr -> no SIGSEGV). The diff target for LOS = ABSENT_NULL (#6 strlen-null,
//     masked today by libapsfixup Family-III wrap_strlen).
//
//   DO NOT RUN FROM THE HOST HARNESS — another process owns the device. Authoring/`node --check` only.
// =============================================================================
