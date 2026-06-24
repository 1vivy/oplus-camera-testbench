<!-- STATUS: VERIFIED (static, no-device) — OOS↔LOS-v2.0 framework-binary discovery sweep, 2026-06-24.
     Tool: tools/observability/campaign/static_sweep.py (self-test PASS, positive-control PASS).
     This AUGMENTS docs/facilitation/F2-system-framework.md (R1–R7) and OOS-OPEN-ITEMS-AND-DIFF-PLAN.md;
     it does not supersede them. DISCOVER + PIN only — no source patched this round (per user decision). -->
# Static non-treble plumbing sweep — OOS golden ↔ LOS v2.0 (2026-06-24)

## What this is
A systematic, repeatable generalization of how the v2.0 `formatIsYuv`/P010_VENUS root was found: instead of
hand-disassembling one OOS binary by luck, `static_sweep.py` harvests the framework symbols the OEM camera
blobs actually import (their UND contract points), then diffs the OOS golden copy against the LOS-built copy
of each, flagging the divergence CLASS on **semantic, cross-compiler-stable** signals only
(`MISSING-SYMBOL` / `CASE-SET-DELTA` / `CALL-TARGET-DELTA`; structural codegen is INFO-only).

- **Substrate (no flash):** OOS `/srv/android/dumps/extracted/dump300_full` ↔ LOS
  `/srv/android/worktrees/lineage-infiniti/out/target/product/infiniti` (the v2.0 build).
- **Scope (user-decided):** the 7 camera-path framework libs; worklist = UND imports of
  `libAlgoProcess`, `libAlgoInterface`, `libcsextimpl`, `libarcsoft_turbo_hdr_grf/raw`,
  `libarcsoft_high_dynamic_range_couple`.
- **Tool validation:** self-test OOS↔OOS = **PASS** (0 non-MATCH over 129+2103 fns); reconstruction proof
  (extracts exactly `0x7FA30C0A` from OOS `lockPlanes`); positive control OOS↔`out_eng` (pre-v2.0) =
  re-discovers the `lockPlanes` `CASE-SET-DELTA {0x7FA30C0A}` `[VENDOR-FORMAT]`. Evidence:
  `.../scratchpad/{selftest.txt,sweep.txt,sweep.json}` (sweep raw = 101 rows).

## Per-lib result
| lib | OOS fns | LOS fns | reportable | reading |
|---|---|---|---|---|
| **libnativewindow** | 129 | 129 | **0** | v2.0 `formatIsYuv` fix landed — the v1.x root lib is now clean (live regression control) |
| libcsextimpl | 2103 | 2103 | **0** | byte-identical (R2 gap is *wiring*, not the blob — confirmed) |
| libcamera2ndk | 284 | 281 | 0 | clean |
| libui | 750 | 742 | 1 | `GraphicBuffer::from` `CASE-SET-DELTA {0x0}` — trivial null-check codegen (benign) |
| **libcameraservice** | 7248 | 7216 | **4** | **R2**: `CameraServiceExt` factory STUBBED on LOS |
| **libgui** | 3113 | 2762 | **62** | OEM symbol family absent on LOS — **R3 EDR ABI** + gainmap + display/UX |
| **libandroid_runtime** | 4218 | 4194 | **34** | the JNI side of the same OEM family (EDR/SF-listener/touch) |

## Pinned port-candidate ledger (ranked by plumbing + OOS-exactness + camera-relevance)

> `divergence`: missing | stubbed | differs.  `donor`: a reference that carries an OOS-faithful port, else
> *author-new*.  Each accepted port's acceptance gate = re-run `static_sweep.py` → MATCH vs OOS golden.

### TIER 1 — camera control plumbing, OOS-faithful donor exists
- **SS1 (= R2) — CameraServiceExt factory not wired.** lib `libcameraservice`; plane control; partition
  `/system`; divergence **stubbed**; conviction **CONVICTED** (static corroboration of F2/R2).
  Evidence: `CameraServiceExtFactory::getInstance()` calls `VirtualDeviceCameraIdMapper::getActualCameraId`
  on OOS but only `~ICameraServiceExt` on LOS (stub); ext ctor skips `pthread_mutex_init` on LOS;
  `CameraProviderManager::getCameraCharacteristics` invokes the factory on OOS, not on LOS (and the two
  builds use *different* `getCameraCharacteristicsLocked` signatures — OOS older, LOS newer w/
  `CameraCompatibilityInfo`). **Donor: op15ix `frameworks_av`** (`services/camera/libcameraservice/ext/{ICameraServiceExt.cpp,include/CameraServiceExtFactory.h}`,
  commit `b890522c0e`). **Port note:** reconcile the `getCameraCharacteristics(Locked)` signature against
  our newer LOS base before wiring — the hook site moved.

### TIER 2 — camera/HDR data plumbing, author-new (no reference donor)
- **SS2 (= R3) — OEM EDR ABI missing.** lib `libgui` (+ `libandroid_runtime` JNI side); plane data/display;
  divergence **missing** (13 symbols enumerated): `OplusEdrViewTransform::{read,write}FromParcel`,
  `SurfaceComposerClient::Transaction::{setEdrViewTransform,setEdrAuxImage,setEdrGainmapInfo}`,
  `OplusEdrState::{read,write}`, `OplusEdrMetadata::dump`. donor **author-new** (dodge & realahnet
  `frameworks_native` carry NONE; only doc-49 host RE). conviction CONVICTED-missing.
  **DECISION DEFERRED:** v2.0 already ships the SDR-preview prop workaround (R2) as the OOS-baseline-aligned
  interim for #3 over-exposure. Port the full EDR ABI only if the flash shows the prop workaround
  insufficient. Heavy ABI; do not author pre-flash.
- **SS3 (NEW) — UltraHDR gainmap ABI missing.** lib `libgui`/`libandroid_runtime`; plane data; divergence
  **missing**: `OplusSkGainmapInfo::{read,write}FromParcel,dump` + `setEdrGainmapInfo`. donor **author-new**.
  **NOT in R1–R7 — a genuinely new lead.** conviction OPEN. **Next step (RE):** confirm it is on the HDR
  *photo* save / UltraHDR-gainmap path (vs a parcel type only) before ranking for port. Pairs with SS2.

### TIER 3 — low camera-relevance / likely benign (record, do not port)
- **SS4** `OplusBitmapInfo` parcel type (missing) — supporting parcelable for SS2/SS3; ports with them if at all.
- **SS5** `setBackgroundBlurRadius` / `OplusBlurParams` — `setBackgroundBlurRadius` is **standard AOSP**
  (present in dodge & realahnet, 9 files each); only the `OplusBlurParams` wrapper is OEM. Likely benign
  signature-mangling delta. De-prioritized.
- **SS6** libui `GraphicBuffer::from` `CASE-SET-DELTA {0x0}` — benign codegen.

### TIER 4 — display/UX plane, OUT of camera scope (cam-consumed = 0) — recorded only
`OplusSurfaceflingerEventListener` (21 syms, IOplus/Bn/Bp + onTransact), the `android::oplus::` frame-rate
control family (FRTC / OGFR / UPS / GppFrc / FStabHint / StFrameRate / FrameStabilization), `OplusTrace`
(13), `oplus_layer_state_t` (7), `setOplusResampleTouch` (touch), `register_android_os_Oplus{Manager,AssertTip}`,
`oplusex::{CriticalLogEx,DebugAssertTip}Proxy`. Real non-treble OEM gaps, but none on the camera path — a
separate "display-plane sweep" if those subsystems ever matter.

## The two named candidates (verified this round)
- **C1 — `oplu` MP4 metadata atom** (dodge `frameworks_av 45b355f4`). **OOS-aligned: confirmed** — OOS
  `libstagefright.so` carries the `OplusUserData` key string; dodge writes exactly that key
  (`kKeyOplusUserData`) into an `oplu` udta atom (HDR/lens params in the video container). Absent from all
  our trees + op15ix + realahnet. **Verdict: worthwhile, v2.1.** Video metadata-preservation, not
  capture-blocking → below the photo-save plumbing. Low risk (unknown udta atoms are ignored by players).
  Pre-port: confirm the OOS HAL actually *sets* the key during record + a stock `.mp4` carries the atom
  (deferred to flash).
- **C2 — AHardwareBuffer base fix** (dodge `frameworks_base 936aaf43`). **Already in our tree**
  (`infiniti …/android_frameworks_base d9d128f180`). Orthogonal to `formatIsYuv` (Java/ImageReader
  GraphicBuffer-holder layer vs native plane-lock). The sweep surfaced **no** ImageReader/HardwareBuffer
  native divergence → consistent with it being correctly in place. **Verdict: keep / verify-only.** Java-side
  (framework.jar) parity is beyond this native sweep → confirm at flash (low risk, already shipped).

## Runtime-deferral (the static→runtime fall-through)
- `libnativewindow` MATCH = the v2.0 fix is in; no residual static action.
- `libcsextimpl` present + byte-identical but **UNWIRED** — the wiring divergence surfaces on the *consumer*
  (`libcameraservice`, SS1), which the sweep caught; nothing further static.
- Any symbol that MATCHES statically but sits on a known-symptom node path is **STATIC-CLEAN, not parity** —
  route to the runtime tier (`tools/observability/campaign/diff_oos_los.py` + the symmetric frida probes)
  at the v2.0 LOS bringup/flash.

## Broadened sweep — clues for the still-open issues (2026-06-24, second pass)
Extended to the `surfaceflinger` binary + 11 media/graphics libs (`libstagefright, libhwui, libbinder,
libcamera_metadata, libmediandk, libgralloctypes, libandroid, libsensor, libpowermanager, libimage_io,
libultrahdr`), to throw static light on the harvested open items. Evidence:
`.../scratchpad/sweep_broad.{txt,json}`. Method note: a `MISSING-SYMBOL absent on LOS` on a `@plt` import is
linkage-independent (OOS calls it, LOS has no provider) and trustworthy; the SF binary's OOS:3648 vs
LOS:1433 fn-count gap is mostly OOS being less-stripped, so non-`@plt` MISSING there is read with care.

- **G10 / R3 READ-side EDR ABI — FOUND + ENUMERATED (the clue for R3/#3).** The OOS `surfaceflinger` binary
  carries an entire OEM EDR *listen/read* surface absent on LOS, the counterpart to the SS2 libgui *write*
  side: `gui::IEdrLayerInfoListener` (`Bn`/`Bp`/`asInterface`/`onTransact`), `gui::EdrLayerInfo::{read,write}FromParcel`,
  `BpSurfaceComposer::{add,remove}EdrLayerInfoListener`, `OplusEdrMetadata::dump`, `oplus_layer_state_t::diff`.
  **So R3 is now a COMPLETE map: WRITE (libgui `Transaction::setEdrViewTransform`) + READ/NOTIFY (SF
  `IEdrLayerInfoListener` + `EdrLayerInfo` parcel).**
- **HOW TO HANDLE R3 (the actionable insight):** the same binary shows the EDR path is NOT a single plumb
  like `formatIsYuv` — it is a **subsystem**: libgui write ABI **+** SF read/listener ABI **+** an OEM
  display stack (`OplusDisplayColorManagerFactory`, `OplusVrrInfo/LayerInfo/HistogramInfo`, and AIDL clients
  to `vendor.oplus.hardware.{displaycolorfeature,displaypanelfeature,cwb,MixLut3D,gameopt}`), **all absent on
  LOS**. Porting only the libgui write side cannot work end-to-end. This statically **justifies the v2.0
  decision** to ship the SDR-preview prop workaround for #3 and defer the EDR ABI — and scopes the real cost
  if it is ever taken: a multi-component libgui+SF+display-HAL port, not a one-symbol fix.
- **SS3 gainmap — RESOLVED (re-homed, not a new port).** `libimage_io` has **43 LOS-only** AOSP UltraHDR
  `Xmp/IsoGainMapMetadata{Reader,Writer,Decoder}` symbols (OOS *stripped* them); `libultrahdr` has 0 oplus
  syms; no `/system` lib imports `OplusSkGainmapInfo`. ⇒ OOS does **not** use the AOSP UltraHDR JPEG gainmap
  path; `OplusSkGainmapInfo`/`setEdrGainmapInfo` are part of the **EDR display** family (fold into R3), not a
  photo-save gap. The LOS-only AOSP gainmap code is a benign extra — leave it.
- **C1 (oplu) — gap confirmed at binary level.** OOS `libstagefright.so` has the `OplusUserData` key string;
  LOS has **0**. Port path unchanged (dodge `45b355f4`, v2.1).
- **R1 / R5 / R6 — confirmed NOT statically diffable** (dex-only Java receiver / CamX session-state config /
  runtime-DARK tag). The broadened sweep cannot inform them; they remain flash-gated runtime A/B items
  (route to `diff_oos_los.py` + frida at bringup). Recording this rules them out of further static effort.
- **Out-of-camera-scope OEM surface (documented, not for porting):** a large OEM SurfaceFlinger/display
  subsystem (VRR, color-manager, CWB, MixLut3D, panel-feature, `OplusLooper/Trace/ATMSProxy`) is absent on
  LOS — real non-treble gaps, but display-plane, not camera. A separate sweep if those subsystems ever matter.

## Reproduce
```
cd tools/observability/campaign
OOS=/srv/android/dumps/extracted/dump300_full
LOS=/srv/android/worktrees/lineage-infiniti/out/target/product/infiniti
python3 static_sweep.py --self-oos --oos $OOS --libs libnativewindow --report-all   # gate: PASS
python3 static_sweep.py --oos $OOS --los $LOS \
  --worklist-from odm/lib64/libAlgoProcess.so,odm/lib64/libAlgoInterface.so,system_ext/lib64/libcsextimpl.so,odm/lib64/libarcsoft_turbo_hdr_grf.so,odm/lib64/libarcsoft_turbo_hdr_raw.so,odm/lib64/libarcsoft_high_dynamic_range_couple.so \
  --emit-json sweep.json
```
