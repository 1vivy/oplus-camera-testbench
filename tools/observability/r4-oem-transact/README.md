<!-- Parent: ../AGENTS.md -->

# r4-oem-transact — OOS baseline v3 capture (the `media.camera` OEM-transaction layer)

**Purpose.** Settle logging-gap **G5** and doc-48 with a symmetric OOS↔LOS capture of the OnePlus OEM
cameraserver layer (`libcsextimpl.so` / `CameraServiceExtImpl`). The OCS SDK `transact()`s 22 private
OEM codes (10000–10022) on the `media.camera` binder; on OOS the OnePlus-modified cameraserver answers
them and also calls `CameraServiceExtImpl` at internal hook sites, on LOS the stock cameraserver
silently drops them (`UNKNOWN_TRANSACTION`) and the lib is absent. This kit captures **both depths on
both builds** so the divergence is observed, not inferred.

> Run on the OOS reference unit AND the LOS build, both **permissive** (`setenforce 0`). Then `parse_r4.py`.

## The two depths (doc-48)
- **Depth-1 — binder `onTransact` ABI.** SDK `OplusCameraManager` proxy → `BinderProxy.transact(100xx)`
  on `media.camera`. OOS: serviced by `CameraServiceExtImpl::onTransact`. LOS: `UNKNOWN_TRANSACTION`,
  but `getService("media.camera") != null` so the SDK believes the channel is live.
- **Depth-2 — internal call-site hooks.** `beforeConfigureStreamsLocked(…, StreamSet&, …)`,
  `getExtensionOperatingMode`, `processPreview`, `beforeMetadataSendToApp`, `addRemovePackageName` —
  called from inside cameraserver on OOS; **never invoked on LOS** (stock has 0 call sites).

## The decision matrix (which column diverges = the root)
| Column (captured per session) | OOS | LOS | If they DIVERGE → |
|-------------------------------|-----|-----|-------------------|
| `libcsextimpl.so` mapped in `cameraserver`? (`/proc/pid/maps`) | expect yes | **expect no** | confirms the whole OEM layer is absent (the doc-48 gap) |
| client `transact(100xx)` reply status (com.oplus.camera) | OK | **UNKNOWN_TRANSACTION / false** | Depth-1 silent-drop confirmed (G5) |
| `CameraServiceExtImpl::onTransact` fires for each code? | expect yes | **n/a (absent)** | maps which codes are load-bearing |
| `getExtensionOperatingMode` return for the 8K session | op_mode (0x80a9?) | **n/a** | does the ext shape op_mode 0x80a9 (doc-35 §A) |
| `beforeConfigureStreamsLocked` invoked + StreamSet mutated for 8K? | expect yes | **n/a** | **the 8K hypothesis** — if stock mutates the StreamSet here and LOS can't, this is the upstream cause of the EISv2 2-in/0-out −38 |
| `processPreview` / `beforeMetadataSendToApp` per preview frame | expect yes | **n/a** | Gate-B (freeze) + exposure co-factor — does stock massage preview/result here |
| `addRemovePackageName` stamps identity into metadata | expect yes | **n/a** | the OOS-native first-party tag we replaced with the SDK self-stamp (`62009bf`) |

**8K correlation:** run the existing `../../frida/hook_configure_streams.js` (oemlayer `configure_streams`
stream dump) and `../../frida/hook_eisv2_ports.js` alongside the server probe — if the 7680×4320 video
OUTPUT stream the EISv2 port needs is present after `beforeConfigureStreamsLocked` on OOS but absent on
LOS, the missing Depth-2 hook is implicated (doc-48 §8K; subordinate to doc-35's traced EISv2 symptom).

## Files
| File | Side | What |
|------|------|------|
| `10_ext_presence.sh` | device (both) | read-only: is `libcsextimpl` mapped in cameraserver? `lshal` sendextcamcmd/displaycolorfeature; `dumpsys media.camera`; build+enforce tag |
| `20_trace_ext_transact.js` | frida (both) | auto-detects process: **client** (`com.oplus.camera`) → `BinderProxy.transact` codes 10000–10022 + reply; **server** (`cameraserver`, OOS only) → the 6 `CameraServiceExtImpl` hooks |
| `30_run_r4.sh` | host | orchestrator: build-tag, push, enable verbosity, attach both frida probes, capture cycle, dumpsys/maps, → `reference/r4/<tag>/` |
| `parse_r4.py` | host | diff OOS vs LOS: txn-code reply table, ExtImpl invocation presence, 8K op_mode/StreamSet |

## Run
```sh
adb shell setenforce 0
tools/observability/r4-oem-transact/30_run_r4.sh oos     # on the stock unit
tools/observability/r4-oem-transact/30_run_r4.sh los     # on the LOS build
tools/observability/r4-oem-transact/parse_r4.py reference/r4/oos reference/r4/los
```

## Outcome → action
- **Depth-1 only diverges (codes dropped, no Depth-2 effect on capture):** confirms G5 but stays off the
  JPEG path (PROBE-R1c). Port dodge's `onTransact` delegation + re-add `libcsextimpl` for zoom/auth only.
- **`beforeConfigureStreamsLocked` mutates the 8K StreamSet on OOS:** the 8K fix needs the Depth-2 call
  site, not just the onTransact hook (doc-48 §port-recipe step 3). High-value.
- **`processPreview`/`beforeMetadataSendToApp` load-bearing for delivery:** ties the OEM layer to Gate-B;
  reconcile with the doc-47 `probe_aec_hdrdetect.js` result (run that FIRST).

## Conventions
Device scripts: `#!/system/bin/sh`, single-block, read-only/reversible, output `/data/local/tmp/obs_r4_*`.
Frida 17 (`Process.findModuleByName`). Mangled `CameraServiceExtImpl` symbols are build-pinned to stock
`16.0.7.201` `libcsextimpl.so` — re-verify with `llvm-nm -D` if the blob changes. See doc-48.
