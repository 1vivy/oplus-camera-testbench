// probe_aec_hdrdetect.js — confirm the AEC hdr_detected rc=-2 gate (doc 45).
//
// libaecCustom.so is byte-identical stock<->LOS-build (md5 f8fb639d, BuildID d0204b3e),
// so these Ghidra offsets are valid on-device. device addr = Ghidra addr - 0x100000.
//
// HDRDetectProcess (FUN_001b4d8c) early-returns when *(*aecCtx + 0x48) == 0 (HDR-detect master
// enable). When gated off, HDRTriggerFlagDetection (FUN_001ed7e4) is never reached, so the
// hdr_detected flag (aecOut+0xfc) is never produced -> CamX has nothing to publish -> app reads rc=-2.
//
// Usage: attach to the camera provider process DURING preview-start (the decision burst is one-shot;
// late attach = 0 calls). `adb shell setenforce 0` first. Set FORCE=true to test the coherent lever
// (force the detector ON for the normal preview) — see doc 45 for interpretation.
// OTA-resilient: -l tools/frida/_anchor.js first (standalone), or run via the bundled agent (globalThis.Anchor).

const FORCE = false;

const LIB = 'libaecCustom.so';
const OFF_HDRDETECT = 0x0b4d8c;   // HDRDetectProcess: gate *(*ctx+0x48)==0
const OFF_TRIGGER   = 0x0ed7e4;   // HDRTriggerFlagDetection: writes hdr_detected at aecOut+0xfc

// Anchor specs (doc-50). Both targets are LOCAL (FUN_) funcs — not exported, no mangled name recorded in
// Ghidra notes, no prologue signature documented — so only the offset fallback rung applies. The blob is
// byte-identical OOS<->LOS. BuildID pinned to device (.300/V16.1.0) value read via readelf (authoritative).
const SPEC_HDRDETECT = { lib: LIB, name: 'HDRDetectProcess',
  fallback: { buildid: 'd0204b3e6a969b87e90361af5127dce86e07953a', off: OFF_HDRDETECT } };
const SPEC_TRIGGER   = { lib: LIB, name: 'HDRTriggerFlagDetection',
  fallback: { buildid: 'd0204b3e6a969b87e90361af5127dce86e07953a', off: OFF_TRIGGER } };

function anchorResolve(spec) {
  if (typeof Anchor !== 'undefined' && Anchor.resolve) return Anchor.resolve(spec);
  // standalone fallback (no _anchor.js loaded): frida-17 instance export, else the declared offset.
  const m = Process.findModuleByName(spec.lib); if (!m) return null;
  if (spec.export) { try { const p = m.findExportByName(spec.export); if (p) return p; } catch (e) {} }
  if (spec.fallback && spec.fallback.off != null) { try { return m.base.add(spec.fallback.off); } catch (e) {} }
  return null;
}

function hook() {
  const m = Process.findModuleByName(LIB);
  if (!m) return false;
  const pDetect = anchorResolve(SPEC_HDRDETECT);
  const pTrigger = anchorResolve(SPEC_TRIGGER);
  if (!pDetect || !pTrigger) return false;
  console.log('[aec] libaecCustom.so @ ' + m.base);

  Interceptor.attach(pDetect, {
    onEnter(a) {
      try {
        const ctx = a[1];                       // param_2 = per-frame AEC ctx
        const tuning = ctx.readPointer();       // *param_2 = active tuning struct
        const en = tuning.add(0x48).readU32();  // HDR-detect master enable
        const bgsat = tuning.add(0xd0).readU32();
        console.log(`[HDRDetect] enable(+0x48)=${en} bgsat(+0xd0)=${bgsat}`);
        if (FORCE && en === 0) {
          tuning.add(0x48).writeU32(1);
          console.log('[HDRDetect] FORCED +0x48 = 1');
        }
        this.ctx = ctx;
      } catch (e) { console.log('[HDRDetect] read err ' + e); }
    }
  });

  Interceptor.attach(pTrigger, {
    onLeave() {
      // aecOut = param_2 of HDRTriggerFlagDetection == the same per-frame ctx's output region.
      // Re-read on the next HDRDetect entry instead; here just mark that the producer ran.
      console.log('[HDRTrigger] ran (hdr_detected computed this frame)');
    }
  });
  return true;
}

if (!hook()) {
  console.log('[aec] waiting for libaecCustom.so ...');
  const iv = setInterval(() => { if (hook()) clearInterval(iv); }, 200);
}
