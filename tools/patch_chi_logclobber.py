#!/usr/bin/env python3
"""
Defeat OnePlus's CHI log-mask clobbers (and surface the CamX-core gate) so that camera
verbose logging survives — needed to trace the CamX/CHI snapshot reprocess graph and, in
particular, to read the exact CamX error behind 8K `configure_streams(op_mode=0x80A9)`
returning `-38 / INTERNAL_ERROR` (see docs/rearch/27-8k-provider-watchdog.md), and more
broadly to **CHARACTERIZE** how the Oplus stack plumbs SHDR/HDR settings (interop-tree C5:
let the stack narrate its own graph-selection decisions — observe/record, do not convict).

This is the **host (binary-patch / push)** half of the un-clobber instrument. The **reversible
device half** (overlay the verbose masks + the #3-defeating property + provider restart) is
`tools/observability/enable/10_vendor_camx_chi.sh`. The **frida in-memory** alternative for the
CHI clobbers is `tools/frida/unclobber_camx_logs.js`; the **CamX-core** lever is the separate,
finalized `tools/frida/enable_camx_logging.js` (do NOT edit it — see "CamX-core" below). See
RECIPE.

==========================================================================================
CORRECTED MODEL — there are SEVERAL INDEPENDENT camera log systems, each with its own gate.
The CamX-CORE tag and the CHI tag are DIFFERENT gates; this tool's binary patches address the
CHI tag. The CamX-core gate is NOT a configure-time mask applier — it is a GLOBAL DebugLogInfo.
(Full RE: docs/re-notes/camx-logmask-gate-FINDINGS.md, camx-loginfo-layout-and-groups.md,
camxcore-characterization-v16.1.0.md.)
==========================================================================================

----- CHI tag ("Chi :" — chxextensionmodule / chxusecaseutils / pluginbase) -----
The CHI log system is clobbered at configure time across two libraries. doc-27's "4 stages"
was right that #1/#3 exist — but they live in **libextensionlayer.so**, NOT
com.qti.chi.override.so (that lib only carries #2). Device capture (8k3.log, provider pid 7665)
pinned #1 and #3 to libextensionlayer.so (only that lib carries the
`OverrideChiLogSettingsAtConfigureFile` / `OnPostModifySettings` / `Disable all chi log`
strings — verified by `strings`). These are the VALID, active binary patches in this tool:

  #1 CHI-tag  /odm/lib64/libextensionlayer.so
      fn  : ExtensionLayer::OverrideChiLogSettingsAtConfigureFile()  (exported)
            -> reads the OnePlus override file and FORCES g_enableChxLogs/g_enableChiNodeLogs
               masks low at configure (extensionlayer.cpp:810). Pure void log-override applier
               (no functional tail) -> SAFE to retaa.

  #2 CHI-tag  /vendor/lib64/hw/com.qti.chi.override.so
      fn  : ExtensionModule::ModifyLogSettings()      (exported)
            -> applies chiLogDumpMask/InfoMask/NodeInfoMask/NodeCallstackMask overrides. retaa.

  #3 CHI-tag  /odm/lib64/libextensionlayer.so
      fn  : ExtensionLayer::OnPostModifySettings()    (exported)
            -> "Disable all chi log" (extensionlayer.cpp:1048): ZEROES all g_enableChxLogs /
               g_enableChiNodeLogs masks, THEN makes a functional tail vtable call
               (GetInstance()->vtable[0x18]). Because of that tail, a blanket retaa is RISKY.
            ** PREFERRED neutralization = PROPERTY, no binary patch: the zeroing in block A is
               skipped if ANY of persist.sys.assert.panic / persist.camera.assert.panic /
               persist.vendor.camera.oplus.enableLogging == "true". Set:
                   setprop persist.vendor.camera.oplus.enableLogging true
               (the secondary blocks only zero if persist.sys.log.af/ae/awb=="true" — leave
               them unset). This keeps masks verbose AND preserves the tail. CHI INFO flows with
               just enableLogging=true (the SHDR characterization came out of this). **
            -- retaa is available as an opt-in fallback via --extlayer-aggressive (skips the
               tail too; verify stills/4K still work if you use it).

----- CamX-CORE tag ("CamX :" — camxhal3 / camxsession / camxnode / configure_streams /
       hdr_detected / the 8K -38 reason) -----
THE BIG CORRECTION: the camxoverridesettings.txt log-mask keys are a DECOY for the CamX-core
tag. They populate StaticSettings, which is NOT the live gate. The LIVE CamX-core gate is the
GLOBAL `CamX::g_logInfo` (a 0x90-byte DebugLogInfo) in libcamxcommonutils.so .data @ +0x68010.
Each CAMX_LOG site emits iff `((u64*)g_logInfo)[level_slot] & (1<<group)`, and reaches logcat
only if `g_logInfo+0x80` (enableAsciiLogging) == 1.

  THE REAL CamX-core CLOBBER is **SettingsManagerImpl::OverrideUpdateLogSettings**
  (libcamxsettingsmanager.so, Ghidra 0x115c2c = module-offset 0x15c2c): it builds a
  DebugLogInfo from StaticSettings then `Log::UpdateLogInfo` copies it into g_logInfo. The
  populate-from-StaticSettings block is guarded by `if (bVar4 & bVar6)`:
      bVar4 = (persist.sys.assert.panic | persist.camera.assert.panic |
               persist.vendor.camera.oplus.enableLogging == "true")
      bVar6 = a release/confidential gate (enableConfidentialLog cap + ro.version.confidential +
               ro.build.release_type + oplus.autotest.camera.debug.forcelog + "PRE" in
               ro.build.version.ota)
  On a stock USER build NEITHER holds -> the ELSE branch ZEROES the masks + enableAsciiLogging
  and STILL calls UpdateLogInfo -> g_logInfo pushed to 0 (CamX-core goes silent). (There is also
  a persist.sys.camera.log.scene gate, ids 0xa004..0xa009, that hard-overrides masks from a
  table @ module+0xb6890.)

  *** DECOY — was this tool's old "#4": libcamxsettingsmanager.so
      OverrideLogSettingsAtConfigureFile() (module+0x151c4). It reads the EMPTY
      "OemOverrideLogSettings" OEM provider and writes the NON-GATE StaticSettings+0x28.
      retaa-ing it does NOTHING for CamX-core logging — it is NOT the clobber. It has been
      MOVED to OBSOLETE_PATCH_TABLE and the tool REFUSES to apply it by default. ***

  The CamX `-38` reason from `configure_streams` is a CamX-core ("CamX :") line, so seeing it
  requires the CamX-CORE levers below, NOT this tool's CHI binary patches. The CHI graph/usecase
  detail is under the CHI tag, so #1/#2(/#3-via-prop) are what this tool's patches buy you.

==========================================================================================
THE TWO REAL CamX-CORE LEVERS (neither is "#4"; see also the optional binary-patch target)
==========================================================================================
(a) PREFERRED — runtime frida, no reboot, no G7 self-kill: `tools/frida/enable_camx_logging.js`
    writes g_logInfo directly (logInfoMask/logConfigMask/logCoreCfgMask = 0x1f0fb7b8,
    logVerboseMask = 0x0e010200, +0x80 enableAsciiLogging = 1) and re-asserts on every
    Log::UpdateLogInfo onLeave (configure_streams re-pushes a clobbered DebugLogInfo).
    *** CRITICAL: SENSOR (bit 1) and NCS (bit 23) MUST stay 0 — their SSC/QMI sensor-hub [VERB]
    log SIGSEGVs in vfprintf (SSCQmiConnection::QmiConnect bad %s). The 0x1f0fb7b8 / 0x0e010200
    masks are exactly the crash-free set (SENSOR/NCS/TRACKER excluded). Do NOT edit that file. ***

(b) DURABLE — props, no frida: make `OverrideUpdateLogSettings` take the POPULATE branch by
    setting BOTH guard inputs, then supply TARGETED masks:
      - bVar4: `setprop persist.vendor.camera.oplus.enableLogging true`
      - bVar6: an autotest/confidential input, e.g. `setprop oplus.autotest.camera.debug.forcelog 1`
      - masks: a readable /vendor/etc/camera/camxoverridesettings.txt with logInfoMask=0x1f0fb7b8
        (NOT 0x1FFFFF — SENSOR/NCS must stay excluded) plus logVerboseMask=0x0e010200,
        enableAsciiLogging=TRUE (KSU magic-mount route — see KERNELSU-MOUNT-NOTES.md).
    *** TENSION: oplus.autotest.camera.debug.forcelog satisfies bVar6 BUT may also arm the APS
    alog disk path (G7 self-kill on the marginal HAL). So the durable path should prefer a
    DIFFERENT bVar6 input, OR just use lever (a) (frida g_logInfo, no props) to dodge the
    self-kill entirely. ***

(c) OPTIONAL BINARY-PATCH equivalent of (b) — NOP the clobber guard so the populate branch runs
    UNCONDITIONALLY (no props, no frida). RE'd against /tmp/v16-clobber-verify on V16.1.0:
    inside OverrideUpdateLogSettings the guard is
        15fa0: cmp  w8, #0x1            ; w8 = (bVar4 & bVar6)
        15fa8: b.ne 0x160e4             ; if gate NOT satisfied -> ELSE/zero block (the clobber)
    Falling through (gate satisfied) enters the populate-from-StaticSettings block; both paths
    converge at the single `Log::UpdateLogInfo` call @ module+0x16588. NOP'ing the `b.ne` at
    module-offset 0x15fa8 (write `1f 2003 d5`) forces the populate path always. This is the
    `OverrideUpdateLogSettings_guard` entry in OBSOLETE_PATCH_TABLE — opt-in only via
    --camxcore-guard-experimental, because: (1) it still needs the TARGETED masks supplied
    (0x1f0fb7b8 — an all-on camxoverridesettings.txt would push SENSOR/NCS and re-introduce the
    SSC/QMI crash), and (2) the frida lever (a) is the proven, finalized path. Treat (c) as a
    documented equivalent, not the recommended route.

==========================================================================================
THE PATCH — two techniques
==========================================================================================
(1) CHI clobbers #1/#2/#3 — `retaa` early-return. Each begins with the AArch64 PAC prologue:
    <entry>+0 : paciasp                  (3f 23 03 d5)
    <entry>+4 : sub sp, sp, #0x..        (.. .. .. d1)   <-- overwrite this with `retaa`
We keep `paciasp` and overwrite the 2nd instruction (the `sub sp` stack-alloc) with
`retaa` (ff 0b 5f d6) -> a PAC-correct immediate no-op return BEFORE any mask store executes.
These are log-setting appliers (void / ignored-return), so an early return only preserves
whatever the override file / props already set.

(2) CamX-core guard (OBSOLETE_PATCH_TABLE, opt-in) — `nop` the conditional branch. Instead of
returning early, we leave the function running but force its `if (bVar4 & bVar6)` to take the
POPULATE branch by NOP'ing the guard's `b.ne <else/zero>` (write `1f 20 03 d5`). The function
then builds the DebugLogInfo from StaticSettings and pushes it via UpdateLogInfo as if the gate
were satisfied — so the masks you put in camxoverridesettings.txt survive into g_logInfo.

==========================================================================================
ANCHORS — why this re-derives instead of trusting a fixed offset table
==========================================================================================
Offsets are build-pinned and drift across versions. So each clobber is located by an
**anchor** that survives version bumps; the pinned offset is kept only as a fast cross-check
(`cached`) and a last-resort fallback. To support a new lib/build you add ONE table entry.

  * Exported functions (#1/#2/#3): anchor = the **mangled symbol** -> resolved from .dynsym
    (+.symtab if present) and translated vaddr->file-offset via the PT_LOAD segments. Robust
    on any build that still exports the symbol; no external tools needed (pure-python ELF read).
  * Internal functions (the obsolete DECOY applier; the CamX-core guard): anchor = a **unique
    byte-signature**. For the guard the signature is the `and w8,w27,w8 ; cmp w8,#1` pair
    (LE bytes 68 03 08 0a  1f 05 00 71) — the `bVar4 & bVar6` test — and the byte we NOP is the
    `b.ne` that sits at signature_offset + 0xC. "branch_off_delta" carries that +0xC.

NOTE — V16.1.0 IS 16.0.7.201 (".201" incremental; "16.1" = general OOS-16.1 branding). All
log libs are byte-identical between them, so on this device every anchor resolves to the
cached offset. The anchor machinery is what makes the tool portable to the next build / SoC.

==========================================================================================
USAGE
==========================================================================================
    patch_chi_logclobber.py <lib> [<lib> ...] [--verify] [--extlayer-aggressive]
                            [--camxcore-guard-experimental] [--emit-json] [--recipe]
The lib is auto-routed by basename; pass any/all of:
    libextensionlayer.so          (CHI-tag #1; +#3 only with --extlayer-aggressive)
    com.qti.chi.override.so       (CHI-tag #2)
    libcamxsettingsmanager.so     (no ACTIVE patch — its old "#4" is the DECOY, refused by
                                   default; the CamX-core guard is opt-in, see below)
--verify     report current state + resolved anchors, write nothing.
--emit-json  print {basename:[{name,entry,patch_off,prologue_ok,method}]} to stdout (the
             frida twin tools/frida/unclobber_camx_logs.js can consume this) — implies --verify.
--recipe     print the full companion deploy recipe (props/files/restart) and exit.
--extlayer-aggressive  also retaa's #3 OnPostModifySettings (skips its tail vtable call);
             prefer the persist.vendor.camera.oplus.enableLogging=true property instead.
--camxcore-guard-experimental  enable the OPTIONAL CamX-core binary lever: NOP the
             OverrideUpdateLogSettings `if (bVar4 & bVar6)` guard in libcamxsettingsmanager.so so
             the populate-from-StaticSettings branch always runs. STILL needs TARGETED masks
             (logInfoMask=0x1f0fb7b8) supplied — an all-on file re-introduces the SENSOR/NCS
             SSC/QMI crash. The PROVEN CamX-core path is the frida lever
             tools/frida/enable_camx_logging.js (no props, no reboot, no G7 self-kill).

The DECOY (libcamxsettingsmanager OverrideLogSettingsAtConfigureFile @0x151c4, the old "#4")
is in OBSOLETE_PATCH_TABLE and is NEVER applied — it writes the non-gate StaticSettings+0x28.

See RECIPE (./patch_chi_logclobber.py --recipe) for the props/files that MUST accompany the patch.
"""
import os
import sys
import json
import struct
import subprocess

PACIASP = bytes([0x3f, 0x23, 0x03, 0xd5])           # paciasp
RETAA = bytes([0xff, 0x0b, 0x5f, 0xd6])             # retaa
NOP = bytes([0x1f, 0x20, 0x03, 0xd5])               # nop

# ------------------------------------------------------------------------------------------
# Companion deploy recipe — the props/files that MUST be set alongside the binary patch for
# the un-clobber to actually emit logs. The binary patch only stops the masks being ZEROED;
# the verbose masks themselves still have to be supplied, and #3 is property-defeated.
# ------------------------------------------------------------------------------------------
RECIPE = r"""
====================  UN-CLOBBER DEPLOY RECIPE (props / files / restart)  ====================
There are TWO INDEPENDENT log systems with TWO different gates. Treat them separately:

============================  CHI tag ("Chi :")  =============================================
Clobbered by #1/#2 (binary) and #3 (property). This tool's binary patches address the CHI tag.

  REVERSIBLE device half (no partition write — bind-mount overlay + props + restart):
      tools/observability/enable/10_vendor_camx_chi.sh
    which:
      - overlays /vendor/etc/camera/camxoverridesettings.txt (bind-mount) with the CHI masks
        (chiLogInfoMask / chiLogVerboseMask / chiLogConfigMask / chiLogDumpMask /
         chiNodeLogInfoMask / chiNodeLogVerboseMask) and the CamX-core masks (see below).
      - setprop persist.vendor.camera.oplus.enableLogging true   # defeats CHI clobber #3 (keeps its tail)
      - setprop persist.logd.log.load.on 0                       # stop logd flow-controlling verbose lines
      - killall vendor.qti.camera.provider-service_64 cameraserver  # reload HAL so the override is re-read

  THIS host half — defeat the CHI binary clobbers #1/#2 (NOT property-defeatable). Pick ONE:

   (A) frida IN-MEMORY (reversible, no /vendor /odm write; prefer when frida is light enough):
        tools/frida/unclobber_camx_logs.js   (attaches to the provider, retaa's #1/#2 in RAM)

   (B) PUSH patched blobs (lead-only diagnostic — do NOT commit these blobs to the tree):
        python3 tools/patch_chi_logclobber.py com.qti.chi.override.so libextensionlayer.so
        # back up originals first, then:
        adb push <patched com.qti.chi.override.so>   /vendor/lib64/hw/com.qti.chi.override.so
        adb push <patched libextensionlayer.so>      /odm/lib64/libextensionlayer.so
        # each: restorecon <path> ; chmod 644 <path>
        killall vendor.qti.camera.provider-service_64 cameraserver
      Revert: restore the backed-up originals (or reboot if pushed to a tmpfs/overlay), umount the
      camxoverridesettings overlay, clear the props.

==========================  CamX-CORE tag ("CamX :")  =======================================
DIFFERENT gate: the global g_logInfo (libcamxcommonutils.so +0x68010), clobbered by
SettingsManagerImpl::OverrideUpdateLogSettings. The old "#4" (OverrideLogSettingsAtConfigureFile
@0x151c4) is a DECOY — do NOT push a retaa'd libcamxsettingsmanager.so for the CamX-core tag;
it changes nothing. Use ONE of the two real levers:

   (a) PREFERRED — frida, no props, no reboot, no G7 self-kill:
        tools/frida/enable_camx_logging.js
        # writes g_logInfo (info=0x1f0fb7b8 verb=0x0e010200 ascii=1) + re-asserts on UpdateLogInfo.
        # SENSOR(bit1)/NCS(bit23) stay 0 — those VERB lines SIGSEGV the SSC/QMI path.
        P=$(adb shell 'su -c "pidof vendor.qti.camera.provider-service_64"' | tr -d '\r')
        frida -U -p "$P" -l tools/frida/enable_camx_logging.js

   (b) DURABLE — props + TARGETED masks (no frida):
        setprop persist.vendor.camera.oplus.enableLogging true   # bVar4
        setprop oplus.autotest.camera.debug.forcelog 1           # bVar6  ⚠ see TENSION below
        # + a readable camxoverridesettings.txt (KSU magic-mount, see KERNELSU-MOUNT-NOTES.md):
        #     enableAsciiLogging=TRUE  logInfoMask=0x1f0fb7b8  logVerboseMask=0x0e010200
        #     logConfigMask=0x1f0fb7b8  logCoreCfgMask=0x1f0fb7b8
        #   *** Do NOT use 0x1FFFFF / all-on — that sets SENSOR(1)+NCS(23) and the SSC/QMI VERBOSE
        #       path SIGSEGVs the provider. The 0x1f0fb7b8 / 0x0e010200 set is the crash-free one. ***
        # ⚠ TENSION: oplus.autotest.camera.debug.forcelog satisfies bVar6 but may ALSO arm the APS
        #   alog disk path (G7 self-kill). Prefer a different bVar6 input, or just use lever (a).

   (c) OPTIONAL binary equivalent of (b) — NOP the OverrideUpdateLogSettings guard so the
       populate branch always runs (no props), then push the patched lib:
        python3 tools/patch_chi_logclobber.py --camxcore-guard-experimental libcamxsettingsmanager.so
        adb push <patched libcamxsettingsmanager.so> /vendor/lib64/libcamxsettingsmanager.so
        # restorecon + chmod 644 + killall provider/cameraserver as above.
        # STILL needs the TARGETED 0x1f0fb7b8 masks in camxoverridesettings.txt (same crash caveat).

Order: run the device half (10_vendor_camx_chi.sh) for masks+prop+restart, THEN (A)/(B) for the
CHI tag, and (a)/(b)/(c) for the CamX-core tag, then reproduce the scene. The frida levers and the
overlay are fully reversible; pushed blobs are reversible by restoring the originals you backed up.
=============================================================================================
"""

# ------------------------------------------------------------------------------------------
# basename -> list of clobber functions. Each carries an ANCHOR (how to locate it on ANY build)
# plus `cached` (the V16.1.0/.201 offset, used as a cross-check + last-resort fallback).
#   anchor.type == "symbol" : resolve `sym` (mangled) from .dynsym/.symtab -> vaddr -> file off.
#   anchor.type == "pattern": find unique `sig` bytes (exact, then sub_sp-word-masked); the file
#                             offset IS the entry. `strings` = string-xref hints for manual/objdump
#                             re-derivation if the signature drifts.
# "patch"  : "retaa" (default) overwrites entry+4 (`sub sp,#imm`) with `retaa` (early-return),
#            verified against the paciasp prologue. "nop_branch" overwrites a conditional `b.cond`
#            (located at sig_offset + anchor["branch_off_delta"]) with `nop`, leaving the function
#            running — used to force the CamX-core guard's populate branch.
# "aggressive": patched only with --extlayer-aggressive (functional tail; prefer the property).
# "experimental_camxcore": patched only with --camxcore-guard-experimental.
#
# NOTE: libcamxsettingsmanager.so has NO active patch here. Its CamX-CORE tag is gated by the
# global g_logInfo, not by a configure-time applier; see OBSOLETE_PATCH_TABLE for the DECOY (the
# old "#4", never applied) and the opt-in CamX-core guard. The two real CamX-core levers are the
# frida lever tools/frida/enable_camx_logging.js and the durable prop path (see RECIPE/docstring).
# ------------------------------------------------------------------------------------------
PATCH_TABLE = {
    "libextensionlayer.so": [
        {"name": "ExtensionLayer::OverrideChiLogSettingsAtConfigureFile",
         "anchor": {"type": "symbol", "sym": "_ZN14ExtensionLayer37OverrideChiLogSettingsAtConfigureFileEv"},
         "cached": 0x4000c},
        {"name": "ExtensionLayer::OnPostModifySettings", "aggressive": True,
         "anchor": {"type": "symbol", "sym": "_ZN14ExtensionLayer20OnPostModifySettingsEv"},
         "cached": 0x41a18,
         "note": "functional tail vtable call after the zeroing — prefer "
                 "setprop persist.vendor.camera.oplus.enableLogging true over retaa"},
    ],
    "com.qti.chi.override.so": [
        {"name": "ExtensionModule::ModifyLogSettings",
         "anchor": {"type": "symbol", "sym": "_ZN15ExtensionModule17ModifyLogSettingsEv"},
         "cached": 0x4ab6f8},
    ],
    # libcamxsettingsmanager.so intentionally absent — see OBSOLETE_PATCH_TABLE below.
}

# ------------------------------------------------------------------------------------------
# OBSOLETE / OPT-IN entries for libcamxsettingsmanager.so. NEVER applied by default.
#   "OverrideLogSettingsAtConfigureFile" — the old "#4". It is a DECOY: it writes the non-gate
#       StaticSettings+0x28 from the EMPTY "OemOverrideLogSettings" provider, so retaa-ing it does
#       NOTHING for the CamX-core ("CamX :") tag. Refused by the tool with an explanatory message.
#   "OverrideUpdateLogSettings_guard" — the REAL CamX-core clobber's `if (bVar4 & bVar6)` guard.
#       Opt-in via --camxcore-guard-experimental: NOP the guard's `b.ne <else/zero>` so the
#       populate-from-StaticSettings branch always runs. STILL needs TARGETED masks (0x1f0fb7b8)
#       supplied; the PROVEN path is the frida lever tools/frida/enable_camx_logging.js.
# ------------------------------------------------------------------------------------------
OBSOLETE_PATCH_TABLE = {
    "libcamxsettingsmanager.so": [
        {"name": "OverrideLogSettingsAtConfigureFile",
         "decoy": True,
         "anchor": {"type": "pattern",
                    "sig": "3f2303d5ffc301d1fd7b03a9f85f04a9",   # paciasp; sub sp,#0x70; stp x29/x30; stp x24/x23
                    "sub_sp_word": 1,
                    "strings": ["m_pStaticSettings->logInfoMask is Ox%lx, override to 0x%lx",
                                "m_pStaticSettings->logVerboseMask is Ox%lx, override to 0x%lx"]},
         "cached": 0x151c4,
         "note": "DECOY — writes non-gate StaticSettings+0x28 from the empty OEM provider; "
                 "retaa here does NOTHING for the CamX-core tag. The tool refuses to apply it."},
        {"name": "SettingsManagerImpl::OverrideUpdateLogSettings (bVar4&bVar6 guard)",
         "experimental_camxcore": True,
         "patch": "nop_branch",
         "anchor": {"type": "pattern",
                    # `and w8,w27,w8 ; cmp w8,#0x1` — the (bVar4 & bVar6) test. Unique in the lib.
                    # LE bytes: and=68 03 08 0a, cmp w8,#1=1f 05 00 71.
                    "sig": "6803080a1f050071",
                    "branch_off_delta": 0xC,        # sig+0xC = the `b.ne <else/zero>` to NOP
                    "expect_branch_word": 0x540009e1},  # b.ne 0x160e4 on V16.1.0 (cross-check only)
         "cached": 0x15fa8,   # the b.ne instruction (module-offset); function entry @ 0x15c2c
         "note": "REAL CamX-core clobber guard. NOP the b.ne so the populate branch always runs. "
                 "STILL needs TARGETED 0x1f0fb7b8 masks in camxoverridesettings.txt. "
                 "Prefer tools/frida/enable_camx_logging.js (proven, no props, no G7 self-kill)."},
    ],
}


# ------------------------------------------------------------------------------------------
# Minimal pure-python ELF64 (little-endian / aarch64) reader: PT_LOAD segments + symbol tables.
# ------------------------------------------------------------------------------------------
def _u16(b, o): return struct.unpack_from("<H", b, o)[0]
def _u32(b, o): return struct.unpack_from("<I", b, o)[0]
def _u64(b, o): return struct.unpack_from("<Q", b, o)[0]


def _is_elf64(b):
    return len(b) > 64 and b[:4] == b"\x7fELF" and b[4] == 2 and b[5] == 1  # ELFCLASS64, little-endian


def elf_load_segments(b):
    """[(p_offset, p_vaddr, p_filesz), ...] for PT_LOAD."""
    e_phoff = _u64(b, 32); e_phentsize = _u16(b, 54); e_phnum = _u16(b, 56)
    segs = []
    for i in range(e_phnum):
        o = e_phoff + i * e_phentsize
        if _u32(b, o) == 1:  # PT_LOAD
            segs.append((_u64(b, o + 8), _u64(b, o + 16), _u64(b, o + 32)))
    return segs


def vaddr_to_off(segs, vaddr):
    for p_off, p_va, p_fsz in segs:
        if p_va <= vaddr < p_va + p_fsz:
            return p_off + (vaddr - p_va)
    return None


def elf_symbols(b):
    """{name: st_value} from .dynsym and .symtab (first definition wins)."""
    e_shoff = _u64(b, 40); e_shentsize = _u16(b, 58); e_shnum = _u16(b, 60)
    out = {}
    for i in range(e_shnum):
        o = e_shoff + i * e_shentsize
        sh_type = _u32(b, o + 4)
        if sh_type not in (2, 11):  # SHT_SYMTAB, SHT_DYNSYM
            continue
        sh_offset = _u64(b, o + 24); sh_size = _u64(b, o + 32)
        sh_link = _u32(b, o + 40); sh_entsize = _u64(b, o + 56) or 24
        so = e_shoff + sh_link * e_shentsize           # linked strtab section header
        str_off = _u64(b, so + 24)
        n = sh_size // sh_entsize
        for k in range(n):
            ent = sh_offset + k * sh_entsize
            st_name = _u32(b, ent + 0); st_value = _u64(b, ent + 8)
            if st_name == 0 or st_value == 0:
                continue
            end = b.index(0, str_off + st_name)
            name = b[str_off + st_name:end].decode("latin1")
            out.setdefault(name, st_value)
    return out


def _find_all(b, needle, limit=4):
    out, start = [], 0
    while len(out) < limit + 1:
        i = b.find(needle, start)
        if i < 0:
            break
        out.append(i); start = i + 1
    return out


def _masked_scan(b, sig, mask_word_idx):
    """Find sig with the 4-byte word at mask_word_idx wildcarded. Returns unique offset or None."""
    n = len(sig)
    lo, hi = mask_word_idx * 4, mask_word_idx * 4 + 4
    pre, post = sig[:lo], sig[hi:]
    hits, start = [], 0
    while len(hits) < 3:
        i = b.find(pre, start)
        if i < 0:
            break
        if (not post) or b[i + hi:i + hi + len(post)] == post:
            hits.append(i)
        start = i + 1
    return hits[0] if len(hits) == 1 else None


def _string_xref_rederive(path, b, anchor):
    """Best-effort: re-derive an internal clobber entry from its string xrefs via llvm-objdump.
    Find the paciasp that starts the function which references one of the override-mask strings."""
    objdump = next((t for t in ("llvm-objdump", "objdump")
                    if subprocess.run(["bash", "-lc", "command -v " + t],
                                      capture_output=True).returncode == 0), None)
    if not objdump:
        print("    (string-xref fallback unavailable: no llvm-objdump/objdump on PATH — "
              "re-derive 0x%lx manually from the override-mask string xrefs)")
        return None
    segs = elf_load_segments(b)
    # vaddr of the first hint string present in the file
    str_va = None
    for s in anchor.get("strings", []):
        off = b.find(s.encode("latin1"))
        if off >= 0:
            for p_off, p_va, p_fsz in segs:
                if p_off <= off < p_off + p_fsz:
                    str_va = p_va + (off - p_off); break
        if str_va is not None:
            break
    if str_va is None:
        return None
    try:
        dis = subprocess.run([objdump, "-d", "--no-show-raw-insn", path],
                             capture_output=True, text=True, timeout=180).stdout
    except Exception:
        return None
    # find an instruction whose decoded comment/operand mentions the string vaddr (adrp+add land it),
    # then walk backwards to the nearest `paciasp`. objdump annotates the literal as `0x<va>`.
    needle = "%x" % str_va
    addr = None
    for line in dis.splitlines():
        ls = line.strip()
        if needle in ls and ":" in ls:
            try:
                addr = int(ls.split(":")[0], 16)
            except ValueError:
                continue
            break
    if addr is None:
        return None
    off = vaddr_to_off(segs, addr)
    if off is None:
        return None
    # scan backward for paciasp (function start)
    j = off
    while j >= 0:
        if b[j:j + 4] == PACIASP:
            return j
        j -= 4
    return None


def resolve_entry(path, b, fn):
    """Return (target_offset, method_str) using the anchor; cross-check/fallback to cached.

    For retaa patches the returned offset is the FUNCTION ENTRY (paciasp); patch_one writes at
    entry+4. For nop_branch patches the anchor's `sig` locates the `and;cmp` test and the returned
    offset is the BRANCH itself (sig_offset + branch_off_delta) — the byte patch_one will NOP.
    `cached` is always the SAME thing the function returns (entry for retaa, branch for nop_branch),
    so the DRIFT cross-check stays apples-to-apples.
    """
    a = fn["anchor"]; cached = fn.get("cached")
    delta = a.get("branch_off_delta", 0)   # nonzero => nop_branch: target = sig_offset + delta
    entry = None; method = None
    if a["type"] == "symbol":
        if _is_elf64(b):
            va = elf_symbols(b).get(a["sym"])
            if va is not None:
                off = vaddr_to_off(elf_load_segments(b), va)
                if off is not None:
                    entry, method = off, "symbol(%s)" % a["sym"]
    elif a["type"] == "pattern":
        sig = bytes.fromhex(a["sig"])
        hits = _find_all(b, sig)
        if len(hits) == 1:
            entry, method = hits[0] + delta, "sig-exact"
        elif delta == 0:
            masked = _masked_scan(b, sig, a.get("sub_sp_word", 1))
            if masked is not None:
                entry, method = masked, "sig-masked(sub_sp)"
            else:
                xr = _string_xref_rederive(path, b, a)
                if xr is not None:
                    entry, method = xr, "string-xref"
    if entry is None:
        if cached is not None:
            return cached, "CACHED-FALLBACK(anchor-failed)"
        return None, "UNRESOLVED"
    if cached is not None and entry != cached:
        method += "  [DRIFT: cached 0x%x != resolved 0x%x — using resolved]" % (cached, entry)
    return entry, method


def patch_one(path, verify, aggressive, camxcore_guard=False, collect=None):
    base = os.path.basename(path)
    funcs = PATCH_TABLE.get(base)
    if funcs is None:
        obsolete = OBSOLETE_PATCH_TABLE.get(base)
        if obsolete is None:
            print(f"SKIP {base}: no patch table entry (expected one of: "
                  f"{', '.join(list(PATCH_TABLE) + list(OBSOLETE_PATCH_TABLE))})")
            return False
        # libcamxsettingsmanager.so: no ACTIVE patch. Only the opt-in CamX-core guard applies.
        funcs = obsolete
    b = bytearray(open(path, "rb").read())
    changed = False
    print(f"== {base} ==")
    for fn in funcs:
        tag = fn["name"]
        if fn.get("decoy"):
            print(f"  REFUSE {tag} (DECOY — writes the non-gate StaticSettings+0x28 from the empty "
                  f"OEM provider; does NOTHING for the CamX-core 'CamX :' tag). Use the frida lever "
                  f"tools/frida/enable_camx_logging.js or the durable prop path (see --recipe).")
            continue
        if fn.get("experimental_camxcore") and not camxcore_guard:
            print(f"  SKIP {tag} (experimental; pass --camxcore-guard-experimental). PROVEN "
                  f"alternative: tools/frida/enable_camx_logging.js (no props, no G7 self-kill).")
            continue
        if fn.get("aggressive") and not aggressive:
            print(f"  SKIP {tag} (aggressive-only; pass --extlayer-aggressive or use the "
                  f"persist.vendor.camera.oplus.enableLogging=true property instead)")
            continue
        if fn.get("patch") == "nop_branch":
            if not _patch_nop_branch(b, path, fn, tag, verify, collect):
                return False
            changed = changed or (not verify)
            continue
        # default technique: retaa early-return at entry+4
        entry, method = resolve_entry(path, b, fn)
        if entry is None:
            print(f"  ABORT {tag}: anchor unresolved and no cached offset.")
            return False
        patch_off = entry + 4
        ent = bytes(b[entry:entry + 4]); cur = bytes(b[patch_off:patch_off + 4])
        print(f"  {tag}: entry@0x{entry:x} via {method}")
        print(f"      entry={ent.hex()} (expect paciasp 3f2303d5)  target@0x{patch_off:x}={cur.hex()}")
        prologue_ok = (ent == PACIASP) and is_sub_sp_imm(cur)
        if collect is not None:
            collect.append({"name": tag, "entry": entry, "patch_off": patch_off,
                            "prologue_ok": prologue_ok, "method": method,
                            "patched": cur == RETAA})
        if ent != PACIASP:
            print(f"  ABORT {tag}: entry is not paciasp — wrong file/offset/version (anchor drift).")
            return False
        if cur == RETAA:
            print(f"  already patched (retaa) — {tag}")
            continue
        if not is_sub_sp_imm(cur):
            print(f"  WARN {tag}: 2nd insn {cur.hex()} is not `sub sp,sp,#imm`; "
                  f"version drift? Re-derive before patching.")
            return False
        if verify:
            print(f"  unpatched (verify-only) — {tag}")
            continue
        b[patch_off:patch_off + 4] = RETAA
        changed = True
        print(f"  PATCHED {tag}: wrote retaa at 0x{patch_off:x}")
    if changed and not verify:
        open(path, "wb").write(b)
        print(f"  wrote {path}")
    return True


def _patch_nop_branch(b, path, fn, tag, verify, collect):
    """NOP a conditional branch (the CamX-core OverrideUpdateLogSettings guard). The anchor's `sig`
    locates the `and;cmp` test; resolve_entry returns the branch offset (sig + branch_off_delta).
    Verify the byte really decodes to a B.cond before patching. Returns True on success/skip."""
    branch_off, method = resolve_entry(path, b, fn)
    if branch_off is None:
        print(f"  ABORT {tag}: guard anchor unresolved and no cached offset.")
        return False
    cur = bytes(b[branch_off:branch_off + 4])
    expect = fn["anchor"].get("expect_branch_word")
    print(f"  {tag}: branch@0x{branch_off:x} via {method}")
    print(f"      target@0x{branch_off:x}={cur.hex()} (expect a B.cond; cached b.ne word "
          f"{('0x%08x' % expect) if expect is not None else 'n/a'})")
    is_branch = is_b_cond(cur)
    if collect is not None:
        collect.append({"name": tag, "entry": branch_off, "patch_off": branch_off,
                        "prologue_ok": is_branch, "method": method, "patched": cur == NOP})
    if cur == NOP:
        print(f"  already patched (nop) — {tag}")
        return True
    if not is_branch:
        print(f"  ABORT {tag}: target {cur.hex()} is not a B.cond — wrong offset/version "
              f"(guard drift). Re-derive the b.ne after the (bVar4 & bVar6) `and;cmp`.")
        return False
    if expect is not None and int.from_bytes(cur, "little") != expect:
        # The branch DISPLACEMENT is build-pinned (else-block moves); only the opcode/cond matters.
        print(f"  note {tag}: B.cond word 0x{int.from_bytes(cur,'little'):08x} != cached "
              f"0x{expect:08x} (displacement drift — still a valid B.cond, proceeding).")
    if verify:
        print(f"  unpatched (verify-only) — {tag}")
        return True
    b[branch_off:branch_off + 4] = NOP
    print(f"  PATCHED {tag}: wrote nop at 0x{branch_off:x} (guard now always takes the "
          f"populate-from-StaticSettings branch)")
    return True


def is_sub_sp_imm(four):
    """True iff `four` (LE) decodes to `sub sp, sp, #imm{, lsl}` — the stack-alloc 2nd insn of
    every PAC prologue here (frame size varies). (w & 0xFF0003FF) == 0xD10003FF."""
    return (int.from_bytes(four, "little") & 0xFF0003FF) == 0xD10003FF


def is_b_cond(four):
    """True iff `four` (LE) decodes to an AArch64 `B.cond label` (incl. b.ne/b.eq). Encoding:
    bits[31:24]==0x54 and bit4==0. The 19-bit signed imm (displacement) is build-pinned and
    irrelevant — we only need to confirm it is a conditional branch before NOP'ing it."""
    w = int.from_bytes(four, "little")
    return ((w >> 24) & 0xFF) == 0x54 and (w & 0x10) == 0


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    verify = "--verify" in sys.argv
    aggressive = "--extlayer-aggressive" in sys.argv
    camxcore_guard = "--camxcore-guard-experimental" in sys.argv
    emit_json = "--emit-json" in sys.argv
    if "--recipe" in sys.argv:
        print(RECIPE)
        sys.exit(0)
    if not args:
        print(__doc__)
        sys.exit(2)
    if emit_json:
        verify = True  # never write when emitting
    ok = True
    blob = {}
    for p in args:
        collect = [] if emit_json else None
        ok = patch_one(p, verify, aggressive, camxcore_guard=camxcore_guard, collect=collect) and ok
        if emit_json:
            blob[os.path.basename(p)] = collect
    if emit_json:
        print("\n----- JSON (for tools/frida/unclobber_camx_logs.js) -----")
        print(json.dumps(blob, indent=2))
    if not (verify or emit_json):
        print("\nNEXT: deploy recipe ->  python3 %s --recipe" % os.path.basename(sys.argv[0]))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
