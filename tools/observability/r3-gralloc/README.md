<!-- Parent: ../AGENTS.md -->

# r3-gralloc — OOS baseline v3 capture (the CamxFormatUtil namespace test)

**Purpose.** Settle the leading Family-I mechanism (doc-42 §2.5) with a symmetric, handle-correlated
OOS↔LOS capture of the **full P010 buffer lifecycle**, run **both permissive**. It answers one question:

> Does `com.oplus.camera` (the app process where APS locks the buffer) fail to reach the vendor camera
> plane-layout authority `libcamxexternalformatutils.so`, so `libgrallocutils` takes its
> **"Failed to link CamxFormatUtil"** fallback → wrong P010 layout → the OOB the shim + getStub-flip treat?

If yes → the fix is a **namespace exposure** (public.libraries / `ld.config` parity, the `ffb638b` lever
class) that retires libapsfixup **and** the getStub-flip at the source. If no → redirect to a non-usage
allocation input (doc-42 §2.5 alt-(ii)).

## Verified substrate (doc-42 §2.5, this is what the capture confirms/refutes at runtime)
- `mapper.qti.so` →DT_NEEDED→ `libgrallocutils.so` → decode runs **in-app**.
- `libgrallocutils.so` carries 31–33 `CamxFormatUtil` strings + the `"Failed to link CamxFormatUtil"` /
  `"Unable to get IS_UBWC from snap"` fallback; it dlopens `vendor/lib64/libcamxexternalformatutils.so`.
- That authority lib + `camera_alignments.json` are **in the LOS build** but **not in any app-visible
  `public.libraries.txt`**.
- **Unproven gate:** whether the app namespace actually fails the dlopen (mapper.qti's vendor/sphal
  namespace may already carry vendor search paths). ← *this capture settles it.*

## The decision matrix (which column diverges = the root)
| Column (captured per P010 handle) | OOS | LOS | If they DIVERGE → |
|-----------------------------------|-----|-----|-------------------|
| `libcamxexternalformatutils` mapped in `com.oplus.camera`? (`/proc/pid/maps`) | expect yes | **expect no** | **namespace root** → expose lib (fix = public.libraries) |
| `"Failed to link CamxFormatUtil"` fires in app? (logcat) | expect no | **expect yes** | confirms namespace root |
| allocation **usage flags** (AHardwareBuffer/GraphicBufferAllocator) | — | — | alloc-input root (alt-ii) — but §2.5 predicts these **MATCH** |
| allocation **format / W×H / returned stride** | — | — | non-usage alloc input (alt-ii) |
| **returned plane layout** (getPlaneLayouts / lockYCbCr Cb-offset) | contiguous | non-contig? | consumer/decode divergence |
| blob `getPlaneLayout` Cb (garbage vs aligned) | aligned | garbage? | the symptom the shim repairs |

§2.5 prediction: **usage MATCHES**; the divergence lands in the *CamxFormatUtil-mapped/fallback* rows
(namespace) — not usage.

## Files
| File | Side | What |
|------|------|------|
| `10_camxformat_probe.sh` | device (read-only) | **decisive, frida-free**: is `libcamxexternalformatutils` mapped in `com.oplus.camera`? + logcat fallback-string fire-count + vendor-process positive control |
| `20_trace_alloc_camxformat.js` | frida (native-only) | **allocate side** (usage/format/W×H/stride) + **dlopen(libcamxexternalformatutils) success/null** + CamxFormatUtil symbol resolution, handle-keyed |
| `30_run_r3.sh` | host (adb+frida) | orchestrator: verbosity → logcat+frida (this + `../../frida/trace_p010_planes.js`) → negative-control + P010 capture → device probe → pull, build-tagged |
| `parse_r3.py` | host (stdlib) | join alloc↔lock by handle + camxformat status → print the divergence-column verdict |

## Run (identically on the stock OOS unit AND the LOS build — both permissive)
```sh
adb shell setenforce 0                  # project directive: permissive for camera tests
tools/observability/r3-gralloc/30_run_r3.sh "oos"   # on the stock device
# …reflash/switch device…
tools/observability/r3-gralloc/30_run_r3.sh "los"   # on the LOS build
python3 tools/observability/r3-gralloc/parse_r3.py reference/r3/oos reference/r3/los
```
The cheapest decisive signal needs no frida — just `10_camxformat_probe.sh` after a capture:
`libcamxexternalformatutils` absent from `com.oplus.camera`'s maps + the fallback string firing = mechanism proven.

## Controls (so it can't be hand-waved on a 4th attempt)
- **Symmetric + permissive-matched:** same scripts both sides; also do one LOS **enforcing** pass to isolate sepolicy.
- **Negative control:** capture a *working* non-HDR JPEG beside the SEGV P010 — proves "wrong layout" is specific to the failing path.
- **Positive control:** the vendor allocator/cameraserver process SHOULD map `libcamxexternalformatutils` (it does the alloc); `10_` checks it.
- **Handle correlation:** every record is keyed by buffer-handle so alloc params join to lock params (no cross-buffer mixups).
