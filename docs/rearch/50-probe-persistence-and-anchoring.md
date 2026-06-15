<!-- STATUS: VERIFIED — evidence-anchored RE/capture; no inference-surgery needed (doc-50 method). -->

# 50 — Probe persistence & anchoring across OTAs

**Date:** 2026-06-14   **Device:** CPH2745 / OP611FL1, OOS 16.0.8.300 (oplusrom V16.1.0)
**Trigger:** the r4 OEM-transaction server probe attached to a *present* `libcsextimpl.so` on 16.0.8.300 but
armed **zero** hooks (`onTransact=false … addRemovePkg=false`) — its mangled-symbol exports were pinned to
stock **16.0.7.201**. That is the OTA-fragility problem in one line: the instrumentation silently goes dark
on a point release, and you only find out by reading a log that *looks* successful.

## The two failure axes (keep them separate)

| Axis | What dies on OTA | Today's mechanism | Why it breaks |
|---|---|---|---|
| **A. Launch / runtime persistence** | the *attachment* — probes need a host `frida -U` session per run | host CLI attach, manual | nothing re-attaches after reboot/OTA; needs a laptop in the loop |
| **B. Anchor resilience** | the *target resolution* — offsets/symbols move | 13 probes hardcode Ghidra offsets, 4 mixed, 7 resilient (see catalog below) | OTA rewrites `/system /vendor /odm /product`; addresses, `.data` layout, struct offsets, even dynsym visibility all shift |

A strategy that fixes only one axis is useless: a persistent injector that loads stale offsets just crashes
the HAL on boot; a perfect resolver that needs a host attach still needs a human.

## Anchor-fragility inventory (from the probe catalog, 2026-06-14)

- **RESILIENT (7)** — resolve by name only, survive OTA if the API is unchanged:
  `fwk_trace`, `probe_getoplushwbuffer`, `enable_ocs_sdk_log`, `trace_preview_delivery`,
  `probe_aec_getparam`, `observe_getmetadata`, `r3/20_trace_alloc_camxformat`.
- **MIXED (4)** — symbol-first with offset/GOT fallback:
  `trace_p010_planes`, `enable_olog_oemlayer`, `unclobber_camx_logs` (best — uses `Memory.scanSync`
  signature match), `r4/20_trace_ext_transact` (client resilient / server symbol-pinned).
- **FRAGILE (13)** — hardcoded Ghidra offsets, break every OTA:
  `enable_ascii_logging`, `enable_camx_logging`, `hook_configure_streams`, `probe_aec_hdrdetect`,
  `trace_edr_invocation`, `trace_aps_metadata_lifecycle`, `trace_turbohdr_tag`, `probe_basictone`,
  `read_gloginfo`, `write_gloginfo`, `hook_eisv2_ports`, `dump_camxsettings`, `trace_gralloc_p010_chain`
  (struct offsets).

## Axis B — the anchoring strategy (the crux)

### B0. The OTA-detection primitive: per-lib GNU BuildID
Every `.so` carries a unique `.note.gnu.build-id`. frida can read it
(`Process.findModuleByName(lib).base` → parse the ELF note, or `readelf -n` on the on-device file). The
**BuildID is the cache key**: when a lib's BuildID changes, the binary changed — that is the precise,
per-module OTA signal (far better than `ro.build.version.oplusrom`, which the r4 pin proved is too coarse:
.201 and .300 both report `V16.1.0`). All caching and re-anchor decisions key on `(lib, buildid)`.

### B1. The resolver ladder (`tools/frida/_anchor.js`)
Every probe stops hardcoding offsets and instead declares its targets, resolved at runtime in priority order
— first hit wins, the method used is logged so a silent miss becomes a loud one:

1. **Export by name** — `Module.getExportByName` (mangled or C). Durable when the symbol is exported.
2. **Full symbol table** — parse the on-device `.so` `.symtab` (LOCAL symbols, not just dynsym) for the
   mangled name. Catches functions like the `CameraServiceExtImpl` set that release builds keep but don't
   export. (Carry a stripped-symbol map if `.symtab` is absent.)
3. **String-reference anchoring** — the strongest general technique. Each fragile function references a
   unique literal (`"HDRDetectProcess"`, `"enableAsciiLogging"`, a format string). Scan `.rodata` for the
   string, find the xref, walk to the function entry. **Strings survive recompiles even when offsets move.**
   We already own the tooling shape: ghidra-mcp `batch_string_anchor_report` / `find_undocumented_by_string`.
4. **Byte-pattern / prologue signature** — `Memory.scanSync` for a stable instruction pattern
   (the technique `unclobber_camx_logs.js` already uses). Survives minor rebuilds.
5. **Cached offset (last resort)** — `symbols/<lib>-<buildid>.json`. Only trusted when the BuildID matches;
   guarded by a prologue-signature check before any call (the `dump_camxsettings.js` crash-guard pattern,
   generalized).

### B2. Per-build cache + auto re-anchor
- `tools/frida/symbols/<lib>-<buildid>.json` stores `{symbol: {addr, method, sig}}` resolved by the ladder.
- On attach, the resolver loads the cache for the live BuildID. **Cache miss (= post-OTA) ⇒ re-anchor pass**
  runs methods 1–4 to regenerate the map, writes it, and the probe proceeds — self-healing, no human.
- Hard cases (no export, no string, no clean pattern) escalate to a **host Ghidra-headless re-anchor** via
  ghidra-mcp: import the new `.so`, resolve by the durable RE features we already document, emit the JSON.
  This is the only step that may need a host; it runs **once per OTA per lib**, not per attach.

### B3. Migration
Convert probes worst-first: the 13 FRAGILE ones get a declarative target block + `_anchor.resolve()`; the
hardcoded offset becomes the method-5 fallback (tagged with its BuildID) instead of the only path. The 4
MIXED ones already have fallbacks — fold them into the same resolver for uniform logging. Start with the
ones we actually run in the full baseline: `dump_camxsettings`, `probe_aec_hdrdetect`, `trace_p010_planes`,
`trace_edr_invocation`, `trace_aps_metadata_lifecycle`, and `r4` server symbols.

## Axis A — the persistence/subprocess strategy

Project already standardizes on **KernelSU + Hybrid Mount Lite + magisk-frida**. Build on that, do **not**
reinvent and do **not** overlay `/vendor` (bootloop incident 2026-06-13 — KSU notes rule #1).

- **frida-server persistence:** magisk-frida already boot-starts `frida-server` from `/data/adb/modules`,
  which **survives OTA** via KSU module OTA-survival (re-applied to the new slot). Keep it.
- **The subprocess = a boot-started spawn-gating injector.** Ship a *data-resident, zero-partition-overlay*
  KSU module `oplus_cam_probes` whose `service.sh` launches an on-device controller that:
  1. uses frida **child-gating** to spawn-gate `com.oplus.camera` and attach the **app-side** agent at
     spawn (catches preview/EDR/P010 setup that fires before a manual attach — the exact window the r3/r4
     auto-drive kept losing);
  2. **resident-attaches** the provider/`cameraserver` agent (those daemons persist);
  3. loads **one bundled agent** (all probe scripts + `_anchor.js`) so a single injection covers the stack;
  4. writes probe output to `/data/local/tmp/probe-logs/` (also OTA-durable).
- **Headless injector options:** `frida-inject` (static, pushed to `/data`) or frida Gadget; the controller
  loop is a small script driven by `frida-server`. No host, no `frida -U`.
- **Safety:** this module ships **no `system/` overlay at all** — it is pure `/data` + a boot script, so it
  cannot hit the `/vendor`-overlay or `camxoverridesettings.txt` bootloop classes. That is why persistence
  is safe here where the dev-overlay module was not.

## Deliverables
1. `tools/frida/_anchor.js` — resolver ladder + BuildID read + cache load/store (**prototype this first;
   validate on the connected 16.0.8.300 unit**).
2. `tools/frida/symbols/<lib>-<buildid>.json` — per-build caches, regenerated on OTA.
3. Re-anchor pass: on-device methods 1–4; host Ghidra-headless (ghidra-mcp) for the hard residue.
4. KSU module `oplus_cam_probes` (`module.prop` + `service.sh` + bundled agent), **/data-only, no overlay**.
5. Migrate the 13 FRAGILE probes to declarative targets, worst/most-used first.

## VALIDATED on 16.0.8.300 (2026-06-14) — and a third axis we didn't expect

Investigating the r4 all-false on the connected unit overturned the stated cause and surfaced a failure that
is **independent of OTA** and was silently corrupting captures right now:

### Axis C — the frida-17 static-API removal (the actual current breakage)
`Module.getExportByName(lib, sym)` and `Module.findExportByName(lib, sym)` — the **static 2-arg** forms —
were **removed in frida 17**. On-device they throw `"Module.getExportByName is not a function"`. Every probe
wraps these in `try/catch`, so the throw became a **silent null** → the hook never armed, on symbols that
were perfectly resolvable. Proven on cameraserver:
```
Module.getExportByName(lib,sym)  [static]   -> THREW "is not a function"
mod.getExportByName(sym)         [instance] -> OK @ 0x7cb24de634
```
- The r4 "build-pinned to 16.0.7.201" comment was **wrong**. The .300 `libcsextimpl.so` (BuildID
  `039e6cf7…`) exports all 6 `CameraServiceExtImpl` symbols with **byte-identical mangled names** to the
  probe's pinned strings. After switching `exp()` to the instance method, the server probe armed
  **all six**: `onTransact=true opmode=true beforeConfigure=true processPreview=true beforeMeta=true
  addRemovePkg=true`.
- **Blast radius:** 7 probes still used the removed static form (`enable_olog_oemlayer`,
  `hook_configure_streams`, `hook_eisv2_ports`, `observe_getmetadata`, `probe_basictone`,
  `trace_edr_invocation`, `trace_turbohdr_tag`) — several of which we *ran* in the full baseline and got
  data **only from their Java hooks** while the native-export hooks were dead. All migrated to the instance
  API / `Module.getGlobalExportByName` (for null-lib global search); both patterns verified on-device.
- **Lesson for the resolver:** `_anchor.js` method-1 MUST use the instance method (it now does). This API
  break, not offset drift, was the dominant near-term failure — fixing it recovered the highest-value
  "fragile" probe with a one-line change and zero re-RE.

### `_anchor.js` validated
- `buildId('/system_ext/lib64/libcsextimpl.so')` = `039e6cf79c44d9196443375356cda290` — exact match to
  `readelf -n`. The BuildID OTA-key primitive works.
- `resolve({export})` → **HIT via export @ base+0x72634**, the correct address, via the instance method.
- Dual-mode load (CommonJS + bundled-agent global) works.
- TODO: the on-device symbol **cache write** (`storeCache`) needs a fix (frida `File` flush) — non-blocking,
  it's a perf cache for the expensive ladder rungs; export resolution needs no cache.

### Attach method: by-PID, not by-name
The r3/r4 kits attached the app with `frida -U -n com.oplus.camera`, which does **not** resolve the app
process under Enforcing SELinux here; `frida -U -p <pid>` does (as `app_probe_capture.sh` always did). Both
kits switched to PID attach. This is orthogonal to anchoring but was the second silent-empty cause.

### Restated priority
1. **Frida-17 instance API everywhere** (done) — biggest immediate, OTA-independent win.
2. **Export-by-name via the resolver** (done for r4) — already OTA-resilient for any lib that exports the
   symbol; covers more than expected since these libs are not as stripped as assumed.
3. **Offset drift** (string-xref / pattern / cache) — still needed for the truly internal, non-exported
   functions (the 13 offset-pinned probes), but it is the *third* priority, not the first.

## Module status (2026-06-14): built + installed, INERT pending frida-inject
`tools/persistence/oplus_cam_probes/` is authored and **installed to `/data/adb/modules/oplus_cam_probes`**
on the 16.0.8.300 unit. /data-only, no mounts (bootloop-immune by construction), `service.sh` late_start,
fail-safe. Agent bundles (`_anchor.js` + IIFE-wrapped probes) build clean and the **server bundle was
validated live** against cameraserver (all 6 hooks arm). It is currently **inert**: the one external
dependency, `frida-inject` (aarch64, matching frida-server **17.12.0**), is not bundled — fetching an
external binary is gated on explicit approval. Drop it at `bin/frida-inject` + reboot to go live.
Device frida stack already present: `magisk-frida` (frida-server 17.12.0) + `ksufrida` (Zygisk gadget).

## Post-reboot validation (2026-06-14) — persistence PROVEN, with two runtime findings
Installed `frida-inject` 17.12.0 (matches frida-server), rebooted. Results:
- **Boot-safe:** device booted normally, no bootloop. KSU ran `service.sh`; `injector.log` shows
  `inject cameraserver (pid 2628)` and `inject com.oplus.camera (pid 8225)` after the settle.
- **cameraserver (resident, native): perfect** — all 6 server hooks armed with **zero host involvement**.
  cameraserver's base re-randomized across the reboot (`0x7cb2…` → `0x7199…`) and resolution still
  succeeded because it's export-by-name — the exact ASLR/OTA address-independence the strategy is for.
- **App native probes: work on a fresh session.** Finding #1: the `com.oplus.camera` process alive at boot
  is a long-idle background instance (single-process app) — injecting it cold means `libAlgoProcess`/Java
  aren't up. Opening the camera spawns a fresh pid the poll-inject catches (validated: pid 16311 injected,
  `observe_getmetadata` then `[GM] hooked INT/STR` once `libAlgoProcess` loaded; EDR native armed). So
  normal use (user opens camera → fresh pid) arms the native set; the boot-idle injection is a harmless
  no-op. (Used the sanctioned `am force-stop` to force a clean fresh launch for the test.)
- **Finding #2 — frida-inject lacks the Java bridge.** `trace_preview_delivery` throws
  `"Java is not defined"` under `frida-inject` (the host `frida` CLI loads the Java bridge; frida-inject's
  embedded runtime does not). **Native probes persist; Java-side probes do not arm under frida-inject.**
  The bundle's per-probe IIFE/try-catch isolates this — native probes in the same bundle still arm.
  **Path for Java-side persistence:** route Java probes through the already-installed `ksufrida` Zygisk
  **gadget** (full runtime w/ Java bridge in the app) and keep frida-inject for native daemon+app probes.
  Tracked as the next persistence increment; native coverage (r4 OEM txns, APS getMetadata, EDR ABI) is the
  high-value set and is live now.

### Finding #2 — ksufrida script-mode REJECTED (2026-06-15); app-Java stays on the host-frida path
An app-Java boot-residency facet via the ksufrida Zygisk gadget was built and **removed** after exhaustive
on-device disproof. ksufrida **injects** a gadget (`frida-agent`, 9 map segments) into a fresh
`com.oplus.camera` spawn, but it **does not execute a file-based frida `script`-mode config** — tested with
the bundled `libsecmon.so` (alias, real copy, and direct `libsecmon.config.so` script-mode) AND a freshly
downloaded **stock `frida-gadget-17.12.0-android-arm64`** (md5 differs from `libsecmon`, so not a custom-build
artifact): every variant injects `frida-agent` but runs nothing, across 4 reboots and 3 independent observers
(app-cache `File` write, `android.util.Log`, and a Java-free `__android_log_print` to logcat). Not SELinux
(the script is `u:object_r:system_file:s0`, world-readable, zero avc denials) and not listen-mode either (no
socket on 27042). **Conclusion: ksufrida's injection honors only listen/connect, not file-based `script` — its
companion controls config delivery and ignores `<lib>.config.so` script.** So **app-Java probes run via the
host-`frida` capture path** (`app_probe_capture.sh` — `trace_preview_delivery` arms with the Java bridge there,
proven in the golden baseline), not a boot-resident hook. The facet + its `bin/frida-gadget.so` were removed;
`post-fs-data.sh` is back to the patch-overlay facet only. Native daemon/app probes remain on `frida-inject`.

## The module is a two-facet facilitation layer (2026-06-14)
Per the bringup intent, `oplus_cam_probes` facilitates **hooks AND binary-patch overlays** — one module,
two facets, both INERT-until-configured and fail-open:
- **HOOKS** (`service.sh`, late_start) — boot-persistent frida injection. **Default = facilitation-only
  (empty `probes.conf` resident set), decided 2026-06-15.** The module *facilitates* injection (frida-inject
  + built bundles) but does NOT auto-run a probe set at boot: injecting the heavy `app` bundle (preview-hot-
  path / EDR / per-frame hooks) resident (a) instruments the daily-driver camera continuously and (b)
  DOUBLE-instruments during a host-frida capture — which stalled a freeze-gateb capture and froze the preview.
  Step-through proved no single probe freezes alone; the aggregate-at-boot + capture overlap does. Captures
  attach probes on-demand via host frida (proven by the golden full-baseline). Opt into a resident set only
  for a bench session (never during a capture), and keep it light — see `probes.conf`.
- **PATCHES** (`post-fs-data.sh` → `lib/mount_patches.sh`) — systemless **bind-mount** replacement of
  validated vendor/odm blobs before HAL load. **Engine validated on-device** (synthetic `/data` target):
  `BOUND` replaces content, SELinux context copied from the target, the **replace-existing-only guard
  REFUSES a new path** (the anti-bootloop invariant), and `umount` cleanly reverts. Empty manifest = inert.
  No `system/` tree, no whole-partition overlay → immune to the 2026-06-13 bootloop class by construction.
  Patches are wired one blob at a time, validated off the daily driver, with a `.no_patches` kill-sentinel.

## Open questions for the user
- App-Java boot-residency via ksufrida: **CLOSED — rejected** (Finding #2). Java probes run via the
  host-`frida` capture path; no boot-resident Java hook.
- Persistence scope: **all** probes resident at boot (heavier, always-on) vs. an **opt-in** set (lighter)?
- Re-anchor autonomy: allow the on-device pass to run unattended on OTA, or gate every re-anchor on review?
- Do we flash the `oplus_cam_probes` module on this unit now, or keep it lead-only until bench-tested?
