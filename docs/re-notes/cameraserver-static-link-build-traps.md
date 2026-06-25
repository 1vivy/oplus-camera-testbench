<!-- STATUS: VERIFIED — on-device + build-host observation, 2026-06-25 (r4-fix session). Device CPH2747/
     OP611FL1, LOS v2.2; builder /srv/android/worktrees/lineage-infiniti. Evidence cited inline. -->
# cameraserver static-link + build/deploy traps (load-bearing for ALL frameworks/av camera work)

Three facts discovered while landing the R4 op_mode fix. Each invalidates a previously-assumed
verification path for framework-resident requirements (R1/R2/R3/R4) — read before trusting any
"compiles / mka exit 0 / .so-overlay verified" claim in the older docs.

## 1. `libcameraservice` is STATICALLY LINKED into `/system/bin/cameraserver` on this build
- **Evidence:** the R4 override (`ff7a3713a`) executes from, and its log format string lives in,
  `/system/bin/cameraserver` — **not** `/system/lib64/libcameraservice.so`. On-device: `grep -ac
  "overrode operating mode 0x" /system/bin/cameraserver` = **1**; the same grep over **every**
  mapped `libcamera*.so` (incl. `libcameraservice.so`) = **0**. `/proc/<cameraserver>/maps` shows the
  `r-xp` override code mapped from the binary. `Camera3Device::configureStreamsLocked` (`0x2f40b4`) is
  compiled into the binary's `.text`.
- **Implication:** every frameworks/av camera fix (R1 release upcall, R2 av/0001 CameraServiceExt, R3
  libgui/SF EDR, R4 Depth-2 hooks) lands in the **BINARY**, and `libcameraservice.so` is a near-inert
  passenger. **Overlaying / bind-mounting `libcameraservice.so` does NOTHING** — the device keeps
  executing the static copy in the binary. (F2 notes the same for `surfaceflinger` — libgui/SF are
  statically linked into `/system/bin/surfaceflinger`, so R3 is two-binary, not a `.so` swap.)
- **Correct verify path:** rebuild the **binary** (`mka cameraserver` / the relevant `/system/bin/*`),
  overlay `/system/bin/<bin>` via `adb remount` (chcon `…_exec` context), restart the service, then
  confirm at the **binary level** (`strings`/`nm`/disasm of `/proc/<pid>/root/system/bin/<bin>`, or a
  frida hook), never by checking the `.so`.

## 2. The build server's ccache serves STALE objects for edited sources
- **Evidence:** after editing `Camera3Device.cpp` + `rm`-ing the `.o`, `mka` (build_rc=0) produced a
  byte-identical `.so`/binary lacking the change — twice. Cause = ccache `compiler_check=content` +
  aggressive `sloppiness=file_stat_matches,time_macros,…` (see `/srv/android/AGENT.md` ccache section).
  soong also strips `CCACHE_RECACHE`/`CCACHE_DISABLE` from the compile action env, so those don't help.
  **Only a fresh empty `CCACHE_DIR`** (e.g. `export CCACHE_DIR=/tmp/cc_fresh`) forced a real recompile.
- **Implication:** `build_rc=0` / "mka libcameraservice exit 0" does **NOT** mean the source change is in
  the artifact. This is the most likely reason R4 (and possibly R2/R3) were "compiles, flash-to-confirm"
  but **never actually confirmed** — a confirm step would have caught it.
- **Mitigation:** for any verified change, build with a fresh `CCACHE_DIR` (or `ccache -C`), then prove
  the change is in the binary (grep a marker string / disasm the changed instruction). Note LTO: `.o`
  files are LLVM **bitcode**, so `strings`/`objdump -d`/`nm` on the `.o` are meaningless — check the
  linked `.so`/binary.

## 3. `adb remount` works on LOS (broken only on OOS)
- AVB is disabled (orange state) on the LOS flash → `adb remount` mounts overlayfs for
  /system,/system_ext,/vendor and is writable. It is broken **only on OOS** (locked AVB/dm-verity).
  KernelSU Hybrid Mount (`KERNELSU-MOUNT-NOTES.md`) is reserved for OOS or reboot-persistent modules.
  (Also corrected in `/srv/android/AGENT.md`.) Binaries must be exec'd from a system mount, not `/data`
  (init AVC `execute_no_trans`/`nosuid_transition` denies exec from `/data` under enforcing).

## Worked example — the R4 op_mode fix (this session)
R4 `getExtensionOperatingMode`'s **trailing `int` arg is the FALLBACK op_mode** (returned when the OEM
override vendor-tag is absent — which it always is on LOS, the alias table was dropped in R2), **not a
camera id**. The v2.2 wiring passed `atoi(mId)` (camId) there, so the function echoed the camera id and
clobbered `mOperatingMode` (8K cam2→`0x2`, selfie cam1→`0x1`; rear cam0 spared by the `>0` guard) →
configure `Unsupported set of inputs/outputs` → no preview. Fix (`frameworks/av` `a536f0a481`): pass
`mOperatingMode` as the trailing default + only honor a real vendor-range override (`extMode >= 0x8000`).
Built into the **cameraserver binary** (per #1), deployed via `adb remount` (per #3), confirmed with a
fresh `CCACHE_DIR` build + binary disasm (per #2). On-device: `getExtensionOperatingMode` receives
`0x80a9`, no override; CamX runs `m_operationMode IS 0x80a9`; **8K records a 7680×4320 `.mp4`**.

## Cross-links
- `oem-ext-depth2-lifecycle-RE.md` (R4 lifecycle/dispatch — WIRED→FIXED), `symptoms/S8-8k.md`,
  `REQUIREMENTS.md` R4, `los-impl/IMPLEMENTATION-PLAN.md` R4, `infiniti-camera-port/ITERATION-LOG.md`.
