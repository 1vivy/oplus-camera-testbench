// trace_arcsoft_io.js — alloc-chain probe: the ArcSoft I/O struct contract (the consumer side)
// =============================================================================
// PURPOSE: capture the GOLDEN (stock) values of the exact ArcSoft I/O struct fields that libapsfixup
// repairs on the PORT, so the later LOS A/B shows precisely where the consumer-side P010/format chroma
// malforms. This is the layer trace_p010_planes.js / trace_gralloc_p010_chain.js do NOT cover: the
// undocumented contract between libAlgoInterface's dlsym'd ArcSoft engines and the plane geometry.
//
// The contract (from docs/re-notes/libapsfixup-interposition-RE.md §caveats, HIGH-confidence anchors,
// cross-derived by koaaN/OP15InfinityX): each ArcSoft I/O struct carries
//     +0x40  luma plane VA        +0x48  chroma plane VA
//     +0x60  pitch[0] (Y stride)  +0x64  pitch[1] (Cb stride)
// libapsfixup's wrap_arc/wrap_arc_tfrsn scan +0x00..+0x78 for a valid-luma / garbage-chroma pair and
// rewrite chroma = luma + page_align(2/3*avail) and pitch[1] = pitch[0] (was 0). On STOCK the buffer is
// born contiguous, so we expect: chroma is a valid VA contiguous-after-luma, and pitch[1] == pitch[0].
// THAT is the golden denominator. On LOS the same read yields garbage chroma / pitch[1]==0 → Family-I.
//
// Engines: libapsfixup NAMES ARC_Turbo_RAW_Process / ARC_TFRSN_Process, but the engine that actually fires
// varies by mode/format — so this probe AUTO-DISCOVERS and hooks every libarcsoft_*.so `*Process` export and
// logs only calls carrying a real I/O struct (a +0x40 buffer VA). VALIDATED on stock V16.1.0: a HDR Photo fires
//   ARC_HDR_PreProcess (libarcsoft_high_dynamic_range_couple.so), I/O struct at arg2, GOLDEN:
//   luma/chroma contiguous (chroma-luma = stride*H, e.g. 0x258000 = 2560*960), pitch0==pitch1==2560.
//   On LOS the same struct is the Family-I break: chroma garbage / pitch1=0.
// Plus camApsBufferLockPlanes (libAlgoProcess @ file 0x1c96f8) — the descriptor that FEEDS the structs
//   (stock returns descriptor=0x0, the documented single-plane contract).
//
// THE COMPARABLE RECORD (what parse_allocchain reads), one per ArcSoft struct per call:
//   [ARCIO <engine> arg<i>] base=.. luma=.. chroma=.. (chroma-luma)=.. pitch0=.. pitch1=.. >>> <verdict>
//   [ARCIO desc] camApsBufferLockPlanes -> descriptor=.. planeCount=.. rowStride=..
//
// SAFETY / RUNTIME MODEL (identical discipline to the sibling P010 probes):
//   * ATTACH-ONLY, NATIVE-ONLY (no Java.perform — that ART crashes; see trace_p010_planes.js header).
//   * Defensive try/catch on every read; throttled + per-key deduped.
//   * Poll-until-loaded for the ArcSoft engines (they dlopen only on a real TurboRAW/super-night capture).
//   * SYMMETRIC: same script + parser OOS (now, golden) and LOS (later, the diff).
//   * HOST-ONLY AUTHORING: do NOT run from the host harness; another process owns the device.
//
// RUN (on stock, app at preview; take a real HDR Photo / Master-RAW / Night capture to fire ArcSoft):
//   P=$(adb shell 'su -c "pidof com.oplus.camera"' | tr -d '\r')
//   frida -U -p "$P" -l tools/frida/_anchor.js -l tools/frida/trace_arcsoft_io.js > /tmp/arcsoft_io.txt
// =============================================================================
'use strict';

// ── tunables ────────────────────────────────────────────────────────────────
var MAX_LOG_PER_HOOK = 120;
var DEDUP_PER_KEY = true;
var MAX_ARG_SCAN = 6;                 // scan a[0..5] for I/O-struct pointers

// ArcSoft I/O struct field anchors (libapsfixup-interposition-RE.md; runtime offsets within the struct)
var IO_LUMA = 0x40, IO_CHROMA = 0x48, IO_PITCH0 = 0x60, IO_PITCH1 = 0x64;
var IO_SCAN_LO = 0x00, IO_SCAN_HI = 0x78;   // libapsfixup scans this window for the luma/chroma pair

// ArcSoft fusion entries carry the I/O struct. libapsfixup names ARC_Turbo_RAW_Process / ARC_TFRSN_Process,
// but the engine that actually fires varies by mode/format (turbo_raw, turbo_hdr_raw, high_dynamic_range_couple,
// super-night, smart_denoise). So DISCOVER: hook every libarcsoft_*.so export whose name carries 'Process' and
// log only the calls that pass a real I/O struct (a +0x40 luma) — the struct-scan + dedup filter the noise.
var ARC_FN_RE = /Process/;

// libAlgoProcess descriptor fn that feeds the ArcSoft structs (Ghidra file offset, image base 0)
var ALGO_LIB = 'libAlgoProcess.so';
var ALGO_BID = '2217d555bacb9e8f9c2a81a609ca9f47';   // device .300/V16.1.0 BuildID (readelf-authoritative)
var OFF_LOCK_PLANES_DESC = 0x1c96f8;                 // camApsBufferLockPlanes(buf) -> ApsBufferDesc*

function ts() { return '[' + (Date.now() % 1000000) + ']'; }
function hx(p) { return p ? p.toString() : 'null'; }
function rdptr(p, off) { try { return p.add(off).readPointer(); } catch (e) { return null; } }
function rdu32(p, off) { try { return p.add(off).readU32(); } catch (e) { return null; } }
function readable(v) { try { return !!v && !v.isNull() && Process.findRangeByAddress(v) !== null; } catch (e) { return false; } }

// ── VA classifiers (mirror trace_p010_planes.js / apsfixup is_buf/is_garbage) ──
//   buffer VA  : hi32 in [0x60,0x7f] AND lo32 >= 0x100000 (real page offset)
//   garbage VA : hi32 in [0x60,0x7f] AND lo32 <  0x100000 (align_up(luma,4GB) / tiny-lo)
function vaHiLo(v) { try { return [parseInt(v.shr(32).toString()), v.and(ptr('0xffffffff'))]; } catch (e) { return null; } }
function isBuf(v) { var t = vaHiLo(v); return !!t && t[0] >= 0x60 && t[0] <= 0x7f && t[1].compare(ptr('0x100000')) >= 0; }
function isGarbage(v) { var t = vaHiLo(v); return !!t && t[0] >= 0x60 && t[0] <= 0x7f && t[1].compare(ptr('0x100000')) < 0; }
function isAlignUp4G(luma, chroma) {
  try { if (!isBuf(luma)) return false; if (!chroma.shr(32).equals(luma.shr(32).add(1))) return false;
        return chroma.and(ptr('0xffffffff')).compare(ptr('0x100000')) < 0; } catch (e) { return false; }
}

// ── throttle + dedup ─────────────────────────────────────────────────────────
var counts = {}, seen = {};
function gate(hook, key) {
  counts[hook] = (counts[hook] || 0) + 1;
  if (counts[hook] > MAX_LOG_PER_HOOK) return false;
  if (DEDUP_PER_KEY && key) { var sk = hook + '|' + key; if (seen[sk]) return false; seen[sk] = true; }
  return true;
}

// OTA-resilient resolver — Anchor global if bundled, else export/offset fallback (same as trace_p010_planes)
function anchorResolve(spec) {
  if (typeof Anchor !== 'undefined' && Anchor.resolve) return Anchor.resolve(spec);
  var m = Process.findModuleByName(spec.lib); if (!m) return null;
  if (spec.export) { try { var p = m.findExportByName(spec.export); if (p) return p; } catch (e) {} }
  if (spec.fallback && spec.fallback.off != null) { try { return m.base.add(spec.fallback.off); } catch (e) {} }
  return null;
}

// ── decode one candidate ArcSoft I/O struct (the golden record) ───────────────
// Returns true if base looked like an I/O struct (valid luma at +0x40) and was logged.
function dumpArcStruct(engine, argIdx, base) {
  if (!readable(base)) return false;
  var luma = rdptr(base, IO_LUMA);
  if (!luma || !isBuf(luma)) return false;                 // +0x40 must be a real buffer VA → it's an I/O struct
  var chroma = rdptr(base, IO_CHROMA);
  var pitch0 = rdu32(base, IO_PITCH0), pitch1 = rdu32(base, IO_PITCH1);
  var key = engine + '|' + hx(luma) + '|' + hx(chroma);
  if (!gate('ARCIO', key)) return true;

  var verdict, delta = '?';
  if (!chroma) { verdict = 'chroma=UNREADABLE'; }
  else if (isAlignUp4G(luma, chroma)) { verdict = 'BROKEN: chroma=align_up(luma,4GB) [LOS Family-I signature]'; }
  else if (isGarbage(chroma)) { verdict = 'BROKEN: chroma garbage (tiny-lo) [LOS Family-I signature]'; }
  else if (isBuf(chroma)) {
    try { delta = chroma.sub(luma).toString(); } catch (e) {}
    // STOCK golden: chroma is a valid VA just after luma (contiguous, page/height-aligned), pitch1==pitch0.
    var pitchOk = (pitch0 !== null && pitch1 !== null && pitch0 === pitch1);
    verdict = 'OK: chroma valid, (chroma-luma)=' + delta + ' B' + (pitchOk ? ', pitch1==pitch0' :
              (pitch1 === 0 ? ', pitch1=0 (LOS-style; expect ==pitch0 on stock)' : ', pitch0!=pitch1'));
  } else { verdict = 'chroma=' + hx(chroma) + ' (unclassified)'; }

  console.log(ts() + ' [ARCIO ' + engine + ' arg' + argIdx + '] base=' + hx(base) +
              ' luma=' + hx(luma) + ' chroma=' + hx(chroma) + ' (chroma-luma)=' + delta +
              ' pitch0=' + (pitch0 === null ? '?' : pitch0) + ' pitch1=' + (pitch1 === null ? '?' : pitch1) +
              '\n    >>> ' + verdict);
  return true;
}

function hookArc(name, addr, modName) {
  try {
    Interceptor.attach(addr, {
      onEnter: function (a) {
        var hit = false;
        for (var i = 0; i < MAX_ARG_SCAN; i++) {
          var p = null; try { p = a[i]; } catch (e) { continue; }
          if (dumpArcStruct(name, i, p)) hit = true;
        }
        if (!hit && gate('ARCIO.nostruct', name)) {
          console.log(ts() + ' [ARCIO ' + name + '] called but no +0x40-luma I/O struct found in a[0..' +
                      (MAX_ARG_SCAN - 1) + '] (signature/arg-index may differ — widen MAX_ARG_SCAN / re-RE)');
        }
      }
    });
    console.log('[hook] ' + name + ' @ ' + addr + ' (' + (modName || '?') + ')');
    return true;
  } catch (e) { console.log('[hook] ' + name + ' attach FAIL: ' + e); return false; }
}

// discover + hook every *Process export across the loaded libarcsoft_*.so engines (auto-catches whichever
// engine a given mode/format actually uses). Returns the count newly hooked this pass.
var arcHooked = {};
function discoverArc() {
  var n = 0, mods;
  try { mods = Process.enumerateModules(); } catch (e) { return 0; }
  for (var i = 0; i < mods.length; i++) {
    if (mods[i].name.indexOf('arcsoft') < 0) continue;
    var exps; try { exps = mods[i].enumerateExports(); } catch (e2) { continue; }
    for (var j = 0; j < exps.length; j++) {
      var nm = exps[j].name;
      if (!ARC_FN_RE.test(nm)) continue;
      var key = mods[i].name + '!' + nm;
      if (arcHooked[key]) continue;
      if (hookArc(nm, exps[j].address, mods[i].name)) { arcHooked[key] = 1; n++; }
    }
  }
  return n;
}

// ── descriptor that feeds the structs: camApsBufferLockPlanes return ──────────
(function () {
  var addr = anchorResolve({ lib: ALGO_LIB, name: 'camApsBufferLockPlanes',
                             fallback: { buildid: ALGO_BID, off: OFF_LOCK_PLANES_DESC } });
  if (!addr) { console.log('[hook] camApsBufferLockPlanes NOT resolved (libAlgoProcess not loaded yet — armed by poller)'); return; }
  try {
    Interceptor.attach(addr, {
      onEnter: function (a) { this.buf = a[0]; },
      onLeave: function (ret) {
        if (!gate('ARCIO.desc', hx(this.buf))) return;
        var line = ts() + ' [ARCIO desc] camApsBufferLockPlanes(buf=' + hx(this.buf) + ') -> descriptor=' + hx(ret);
        if (readable(ret)) {
          var pc = rdu32(ret, 0x0), rs = rdu32(ret, 0x4);  // best-effort header (ApsBufferDesc: planeCount, rowStride)
          line += ' planeCount=' + (pc === null ? '?' : pc) + ' rowStride=' + (rs === null ? '?' : rs);
        } else { line += ' (NULL/unmapped — stock single-plane descriptor; chroma comes from the layout calc)'; }
        console.log(line);
      }
    });
    console.log('[hook] camApsBufferLockPlanes @ ' + addr + ' (descriptor feed)');
  } catch (e) { console.log('[hook] camApsBufferLockPlanes attach FAIL: ' + e); }
})();

// ── arm — discover + keep discovering ArcSoft *Process entries (they dlopen on the first real fusion capture) ──
(function () {
  var total = discoverArc();
  console.log(ts() + ' trace_arcsoft_io.js armed (NATIVE-only); hooked ' + total + ' ArcSoft *Process entries so far. ' +
              'A real fusion capture (HDR Photo / Night / high-DR scene) dlopens the rest; the poller catches them.');
  var tries = 0;
  var iv = setInterval(function () { tries++; var k = discoverArc();
    if (k > 0) console.log(ts() + ' +' + k + ' ArcSoft *Process entries hooked (poll ' + tries + ')');
    if (tries > 400) clearInterval(iv);
  }, 200);
})();
