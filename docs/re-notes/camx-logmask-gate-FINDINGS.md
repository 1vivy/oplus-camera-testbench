<!-- STATUS: VERIFIED — evidence-anchored (Ghidra/device capture); no inference-surgery needed (doc-50 method). -->
# CamX log-mask "lost between file-read and the log gate" — ROOT CAUSE (OOS V16.1.0, aarch64)

## TL;DR
The CAMX_LOG gate is the GLOBAL `CamX::g_logInfo` (a 0x90-byte DebugLogInfo) in
**libcamxcommonutils.so .data @ +0x68010** — NOT StaticSettings+0x28.
On a stock/user build OnePlus's `OverrideUpdateLogSettings` takes a release-build "else"
branch that ZEROES the info/verbose/config masks and enableAsciiLogging, then pushes them
into g_logInfo via Log::UpdateLogInfo. camxoverridesettings.txt is ignored by this path.

## Libs / addresses (Ghidra image base 0x100000 for settingsmanager)
- libcamxsettingsmanager.so (md5 ca57937e..)
  - OverrideSettingsFile::Initialize           file+0xe8b0   (parser — works fine)
  - OverrideLogSettingsAtConfigureFile          file+0x151c4  (OEM "OemOverrideLogSettings" path)
  - SettingsManagerImpl::OverrideUpdateLogSettings  file+0x115c2c entry; calls UpdateLogInfo @ file+0x16588
- libcamxcommonutils.so (BuildId 3ab5e2a16fd36036cf1b1f37524e33f0)
  - g_logInfo (DebugLogInfo, 0x90B) .data @ +0x68010   <-- THE GATE
  - g_logInfoStored .bss +0x687a4 ; g_logInfoUpdated .bss +0x687c0
  - Log::UpdateLogInfo(DebugLogInfo*,int) thunk +0x282d0 ; REAL body +0x47800
  - Log::LogSystem(...) thunk +0x28300 ; REAL body +0x47fd0

## g_logInfo layout (u64 mask slots + flags)
+0x00,+0x08 = error/warning masks (default 0xFFFFFFFF, always on)
+0x10..+0x60 = info/verbose/config/coreCfg/entryExit/dump/perf masks
+0x68 = group-0x10000 (CORE) info/verb gate mask
+0x80 (u32) = enableAsciiLogging  (1 => __android_log_write to logcat)
+0x84 (u32) = offline/binary flag
+0x88 (u32) = stored marker

## Q1 PARSER (Initialize) — NOT the failure
Reads 3 dirs, fgets lines, strips all whitespace, splits on '='.
key: if starts 0x/0X -> strtoul(key,0,0) as hash; else GetSettingsStringHashValue(key).
Stores hash->valueString in a Hashmap. ReadSettingUINT/INT/UINT64 do strtoul/strtol(value,0,0).
`logInfoMask=0x1FFFFF` parses correctly. Comment char ';'. No format issue.

## Q2 GetIntegerConfiguration/GetBooleanListConfiguration — different source
The OnePlus apply path reads "OemOverrideLogSettings"/"OemCamxSettings" providers,
NOT the camxoverridesettings.txt store. Each field write guarded by `if (ret==0)` so an
absent OEM key leaves the field unchanged. Not the txt store at all.

## Q3 APPLY (OverrideLogSettingsAtConfigureFile) — OEM bitlist, guarded
GetBooleanListConfiguration("OemOverrideLogSettings","logInfoMask",...) -> bitlist OR -> this+0x28.
Writes only when OEM provider returns success. On stock OEM provider empty => no change.

## Q4 THE REAL GATE + clobber (OverrideUpdateLogSettings, oplus...cpp)
Builds DebugLogInfo from StaticSettings, then Log::UpdateLogInfo(&dli,1) copies into g_logInfo.
Populate-from-StaticSettings block guarded by `if (bVar4 & bVar6)`:
  bVar4 = (persist.sys.assert.panic=="true") || (persist.camera.assert.panic=="true")
          || (persist.vendor.camera.oplus.enableLogging=="true")
  bVar6 = release/confidential gate (enableConfidentialLog cap + ro.version.confidential +
          ro.build.release_type + oplus.autotest.camera.debug.forcelog + "PRE" in ro.build.version.ota)
On stock user build none of bVar4's props are "true" => ELSE branch: masks/d8/d0/e8/...=0,
enableAsciiLogging kept from StaticSettings(+0x58) but that's 0 default; local_70=1;
THEN STILL calls UpdateLogInfo => g_logInfo masks pushed to 0, enableAsciiLogging 0.
Also a persist.sys.camera.log.scene gate (ids 0xa004..0xa009) hard-overrides masks from table @0xb6890.

## LIVE PROOF (provider pid 20284)
Before: g_logInfo +0x10..+0x68 = 0, +0x80=0, g_logInfoUpdated=1, storedmark=1  (clobbered, pushed).
Fix: frida write g_logInfo masks(+0x00..+0x78)=0xFFFFFFFF, +0x80=1  =>
  CamX [ INFO]/[ VERB] lines immediately appear in logcat (43 CamX lines/6s).
StaticSettings+0x28 writes never mattered because LogSystem reads g_logInfo, not StaticSettings.

## CONCRETE FIX
frida-write in libcamxcommonutils.so: for o in 0x00..0x78 step 8: (base+0x68010+o).writeU64(0xFFFFFFFF);
(base+0x68010+0x80).writeU32(1);  // enableAsciiLogging -> logcat
Must be applied AFTER OverrideUpdateLogSettings runs (post stream-configure) or re-applied,
since UpdateLogInfo overwrites g_logInfo. Optional durable: set persist.vendor.camera.oplus.enableLogging=true
(makes bVar4 true so StaticSettings masks get honored) — but that still needs the masks themselves set.
