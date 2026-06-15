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

const FORCE = false;

const OFF_HDRDETECT = 0x0b4d8c;   // HDRDetectProcess: gate *(*ctx+0x48)==0
const OFF_TRIGGER   = 0x0ed7e4;   // HDRTriggerFlagDetection: writes hdr_detected at aecOut+0xfc

function findBase(name) {
  // Frida 17 removed Module.findBaseAddress static; use Process.findModuleByName.
  try { const m = Process.findModuleByName(name); if (m) return m.base; } catch (e) {}
  try { if (Module.findBaseAddress) return Module.findBaseAddress(name); } catch (e) {}
  return null;
}

function hook() {
  const base = findBase('libaecCustom.so');
  if (!base) return false;
  console.log('[aec] libaecCustom.so @ ' + base);

  Interceptor.attach(base.add(OFF_HDRDETECT), {
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

  Interceptor.attach(base.add(OFF_TRIGGER), {
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
