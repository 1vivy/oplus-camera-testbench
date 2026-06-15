<!-- STATUS: VERIFIED — evidence-anchored (Ghidra/device capture); no inference-surgery needed (doc-50 method). -->
# CamX g_logInfo (DebugLogInfo) layout, CamxLogGroup enum, and the crash-free mask set

**Target:** OnePlus OOS V16.1.0 (=16.0.7.201), aarch64. **Lib:** `/vendor/lib64/libcamxcommonutils.so`
(BuildId `3ab5e2a16fd36036cf1b1f37524e33f0`). Local copy `/tmp/uc/libcamxcommonutils.so`.
Ghidra image base 0x100000 (runtime/module-relative addr = Ghidra addr − 0x100000).

## The gate (recap — see camx-logmask-gate-FINDINGS.md for the full chain)

Per-call CAMX_LOG decision, in `CamX::Log::LogSystem` (libcamxcommonutils.so, real body module+0x47fd0):

```
emit if ( ((u64*)g_logInfo)[ level_index ]  &  group_bitmask ) != 0
logcat output additionally requires  *(u32*)(g_logInfo + 0x80) (enableAsciiLogging) == 1
```

- `g_logInfo` = `CamX::g_logInfo`, .data @ **module+0x68010**, 0x90 bytes (a `DebugLogInfo`).
- `level_index` is a small int; the per-level mask slot is at byte offset `level_index*8`.
- `group_bitmask` = the CamxLogGroup value (a single power-of-2 bit) passed at the call site.
- Each mask slot is a **per-group bitmask: bit i set ⇒ that group enabled at that level.**
- Writer: `CamX::Log::UpdateLogInfo` (module+0x282d0 thunk → real body **module+0x47800**) does a 1:1
  slot copy `DebugLogInfo[off] → g_logInfo[off]`, then latches `g_logInfoUpdated` (.bss module+0x687c0)
  and `g_logInfo+0x88` (storedmark) = 1.

## g_logInfo / DebugLogInfo slot → level/mask map (verified)

Verified two ways: (a) gate byte indices used at known-level call sites in settingsmanager
(`g_logInfo[0x22]`=INFO, `[0x2a]`=VERBOSE, `[0x6a]`=CoreCfg → slots 0x20/0x28/0x68); and
(b) the StaticSettings→DebugLogInfo populate asm in `SettingsManagerImpl::OverrideUpdateLogSettings`.

| level_idx | g_logInfo slot | mask name        | StaticSettings src |
|-----------|----------------|------------------|--------------------|
| 0         | +0x00          | logConfigMask    | SS+0x08            |
| 2         | +0x10          | logWarningMask   | SS+0x40            |
| 4         | +0x20          | **logInfoMask**  | SS+0x28            |
| 5         | +0x28          | **logVerboseMask** | SS+0x38          |
| 6         | +0x30          | logPerfInfoMask  | SS+0x30            |
| 10        | +0x50          | logEntryExitMask | SS+0x20            |
| 12        | +0x60          | logDumpMask      | SS+0x18            |
| 13        | +0x68          | logCoreCfgMask   | SS+0x10            |
| —         | +0x80 (u32)    | enableAsciiLogging (1=>logcat) | SS+0x58 |
| —         | +0x88 (u32)    | storedmark / valid = 1 | —            |

(StaticSettings ground-truth offsets: 0x08 logConfig, 0x10 logCoreCfg, 0x18 logDump,
0x20 logEntryExit, 0x28 logInfo, 0x30 logPerfInfo, 0x38 logVerbose, 0x40 logWarning,
0x54 traceGroupsEnable, 0x58 enableAsciiLogging.)

## CamxLogGroup enum (bit index → name) — recovered from `CamX::Log::GroupToString` (module+0x479a0)

```
0  STATS_AFD     8  JPEG      16 CORE      24 META         32 QSAT
1  SENSOR  ⚠     9  STATS     17 HWL       25 STATS_AEC    33 PSM
2  TRACKER       10 CSL       18 CHI       26 STATS_AWB    34 STATSNN
3  ISP           11 APP       19 DRQ       27 STATS_AF     36 OFE
4  PPROC         12 UTILS     20 FD        28 SW_PROC      38 ITOF
5  MEMMGR        13 SYNC      21 IQMod     29 HIST         39 PERF
6  POWER         14 MEMSPY    22 LRME/CVP  30 BPS          40 STATS_PARSE
7  HAL           15 FORMAT    23 NCS  ⚠    31 DD_FWK       41 CROP / 42 IS
```

## ⚠ The crasher and which bits to keep 0

- **SENSOR = bit 1 (0x2)** and **NCS = bit 23 (0x800000)** drive the SSC/QMI sensor-hub callbacks
  (`camxncssscconnection.cpp`, `camxncsservice.cpp`, `camxncssessionconnection.cpp`). Their `[ VERB]`
  lines fire continuously; a buggy `%s` arg in `SSCQmiConnection::QmiConnect()::$_0` SIGSEGVs in
  `vfprintf ← CamX::OsUtils::FPrintF ← CamX::Log::LogSystem`. **Never enable VERBOSE for bit 1 or 23.**
- TRACKER (bit 2) kept 0 too (adjacent sensor/focus chatter, no characterization value).

## Crash-free targeted mask set (PROVEN live, V16.1.0)

```
logInfoMask  (+0x20) = logConfigMask(+0x00) = logCoreCfgMask(+0x68) = 0x1f0fb7b8
logVerboseMask (+0x28)                                              = 0x0e010200
enableAsciiLogging (+0x80) = 1 ;  g_logInfoUpdated (module+0x687c0) = 1
```

- INFO mask 0x1f0fb7b8 = CORE,HAL,CHI,HWL,UTILS,SYNC,CSL,META,STATS,STATS_AEC,STATS_AWB,STATS_AF,
  PPROC,ISP,JPEG,FORMAT,MEMMGR,SW_PROC,DRQ. (SENSOR/NCS/TRACKER cleared.)
- VERBOSE mask 0x0e010200 = STATS,STATS_AEC,STATS_AWB,STATS_AF,CORE only — gives hdr_detected /
  exposure / HDRMode VERBOSE detail without touching the SSC/QMI path.
- Re-assert after every `Log::UpdateLogInfo` (configure_streams re-pushes a clobbered DebugLogInfo).

Productionized: `tools/frida/enable_camx_logging.js`.

### Verification

Fresh provider (pid 26925), full open + 2× shutter + dwell on daytime HDR scene, 40s `logcat -b all`:
provider pid stable for >30s (**no crash**), `F DEBUG`/`Fatal signal` = 0, 57 `I CamX` + 41 `V CamX`,
NCS/SENSOR lines = 1 (single benign init line; recurring SSC verbose crasher never fired).
Clean capture: `reference/captures/camxcore-clean/camxcore-clean-20260613-135910.log`.

## Bisect note

Earlier all-slots = 0xFFFFFFFF write crashed within ~1s (SENSOR+NCS verbose). The fix was group
selection, not level: clearing bit 1 + bit 23 in logVerboseMask is sufficient. INFO-only (verb=0)
is also crash-free and was the first confirmed config.
