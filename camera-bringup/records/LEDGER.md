# Camera Bring-Up Ledger (isolated from interop/main-resolution tree)

> Goal (user): get `com.oplus.camera` to **open** and **snap a photo without crashing** on
> LOS 23.2 / infiniti (OnePlus 15), v1.3 flashed. This is **bring-up**, not processing/quality.
> Method: iterative **root-fix-first** → build on `aosp-builder` (`vivy@10.9.20.67`) → push via
> `adb remount` overlay → record. Workarounds/downstream only if a root fix is infeasible.
> Protocol (infiniti-camera-port/ITERATION-LOG.md): every pushed binary traces to a source edit
> built from the cam-final tree. No hand-edited blobs.

Device: `3C15AT003ZB00000` · LOS `23.2-20260615-UNOFFICIAL-infiniti` (Android 16) · `adb root` OK.
Build server tree: `/srv/android/worktrees/lineage-infiniti` (T=).

---

## Iter 0 — Baseline: camera crashes on open

**Action:** clean launch `am start -W -n com.oplus.camera/.Camera`.
**Result:** FATAL — process dies, activity force-finished, bounces to launcher. Relaunch loop.

**Root cause (pinned):**
```
FATAL EXCEPTION: camera.io
java.lang.SecurityException: Not allowed to bind to service
  com.oneplus.gallery/...predecode.OplusPreTileDecodeService
W ActivityManager: Permission Denial: ... requires oppo.permission.OPPO_COMPONENT_SAFE
```
- Gallery's `OplusPreTileDecodeService` (a thumbnail predecode optimization the camera binds
  on the `camera.io` thread) enforces `oppo.permission.OPPO_COMPONENT_SAFE`.
- That permission is **declared by NO installed package** (orphan) ⇒ bind always denied ⇒
  uncaught SecurityException ⇒ camera process dies.
- Camera only `uses-permission` the **new** `oplus.permission.OPLUS_COMPONENT_SAFE`; gallery
  enforces the **legacy** `oppo.*` name → vintage split, and neither name is defined.
- Non-fatal noise (caught, ignore): `ClassNotFoundException: android.view.SurfaceExtImpl`
  (a `preloadClassForDlOpen` optimization), `SecurityException` binding
  `com.nearme.statistics.rom` (analytics; not found).

**Why it's a bring-up gap (in-tree):** the port already carries the intended fix —
`vendor_oplus_camera/patches-gallery/0001-manifest-Get-rid-of-oplus-permissions.patch` strips
the `android:permission` gates from gallery components (incl. `OplusPreTileDecodeService`). But
ITERATION-LOG transform #6 **disabled the whole OppoGallery2 apktool patch set** (the font/smali
patches rejected on .201 obfuscation), so the manifest perm-strip never landed. Camera got the
equivalent strip via transform #21 (`blob_fixup_opluscamera_strip_oem_perms`); gallery did not.

**Root fix chosen:** mirror the camera's `strip_oem_perms` onto the gallery apk in
`vendor/oplus/camera/extract-files.py` (generic regex strip of `android:permission="<oem>"`),
rebuild `OppoGallery2`, push via remount. Same build/sign flow as the (working) camera apk →
signature parity preserved. Logs: `camera-bringup/logs/launch_attempt1_full.txt`.

**Implementation:** `vendor/oplus/camera/extract-files.py` — added `blob_fixup_oppogallery_unpack`
(apktool `d -s`, skip smali → sidesteps the #6 smali rejects) + a `OppoGallery2.apk` blob_fixup
entry reusing `blob_fixup_opluscamera_strip_oem_perms`. Applied via `gallery_strip.sh`
(43 OEM `android:permission` gates removed, predecode services ungated, 0 OEM gates left),
`m OppoGallery2` (re-signed platform/testkey = b4addb29, signature parity), pushed to
`/system_ext/priv-app/OppoGallery2/`, reboot. Backups: `overlays/OppoGallery2.ondevice-v1.3-orig.apk`.

**Result (Iter 1):** predecode SecurityException **GONE**. Camera now reaches the camera
subsystem (CameraService binds, Camera3 stream config starts). Verified gallery re-scanned:
predecode service ungated, version/signature intact. → advanced to next crash layer.

---

## Iter 1 → 2 — Camera UI crash: missing OEM blur class

**Result of Iter 1 launch:** two new crashes (logs: `logs/launch_iter1_full.txt`):
1. **Camera (main, the blocker):** `java.lang.NoClassDefFoundError: com.oplus.graphics.OplusBlurParam`
   at `BlurBackgroundImpl` → `ShutterButton.onAttachedToWindow`. OEM cross-window-blur class
   absent from every framework jar (the port ships a hand-made `oplus-fwk` *stub* boot jar, not
   OOS's full `oplus-framework.jar`).
2. **Gallery (predecode proc):** `SecurityException: RECEIVER_EXPORTED/NOT_EXPORTED must be
   specified` at `ActionReceiver.kt:63` (Android-14 receiver-flag change). Exactly what the
   also-disabled `patches-gallery/0003-ActionReceiver-Inject-RECEIVER_NOT_EXPORTED` fixes.
   Separate process; deferred (does not block camera open). **TODO Iter ≥3.**

**Root fix (camera blocker):** `oplus-fwk` is built from source at `hardware/oplus/oplus-fwk/`
and already has a `com/oplus/graphics/` stub package. Added `OplusBlurParam.java` (no-op stub:
`setBlurType/​setBlurRadius/​setMaterialParams/​setSmoothCornerType/​setSmoothCornerWeight`) and
added the typed `ViewRootManager.setBlurParams(OplusBlurParam)` overload (the existing stub only
had `(Object)`; camera bytecode calls the typed sig exactly). Deps `ViewRootManager`,
`OplusPathAdapter.addSmoothRoundRect` already present. oplus-fwk is a **boot jar** → rebuild jar
+ boot-image extension (`boot-oplus-fwk.{art,oat,vdex}`), push both, reboot.

**Result (Iter 2):** **CAMERA OPENS** — `topResumedActivity=com.oplus.camera/.Camera`, full UI
renders (mode selector, shutter, zoom 0.6–7, EV, thumbnail), **live preview streams** (real frames,
`PreviewProcessor afterSessionConfigure`, cameraserver `OutputUtils frame N still=0` ~30fps).
OplusBlurParam crash gone. Artifacts: `overlays/oplus-fwk.jar` + `boot-oplus-fwk.*`
(backups `*.ondevice-orig.*`). Source: `hardware/oplus/oplus-fwk/src/com/oplus/graphics/OplusBlurParam.java`
+ `com/oplus/view/ViewRootManager.java` (typed overload).

---

## Iter 3 — Gallery ActionReceiver crash fixed; capture gated

**Gallery RECEIVER_EXPORTED fix:** single-dex baksmali/smali surgery on classes11.dex
`ActionReceiver.a()` — inject `or 0x4` (RECEIVER_NOT_EXPORTED) into the flags reg before
`registerReceiver(...,int)` (re-anchored patches-gallery/0003 to the 300 apk). Script
`tools/gallery_actionreceiver.sh`; `m OppoGallery2` re-sign; pushed. **Gallery crash GONE**
(no more GLooper FATAL / "Photos keeps stopping").

**libapsfixup P010 crash (processing-domain, isolated):** tombstone showed the camera's
`ImageProcessThr` SIGSEGV in `/odm/lib64/libapsfixup.so` `build_id_matches()` ← `try_install()`
← `poller()` — the P010 fix shim (DT_NEEDED into libAlgoProcess) crashes in its build-id poller,
intermittently killing the camera. Per the "bring-up not processing" steer, **isolated** it: built a
no-op aarch64 stub `libapsfixup.so` (SONAME match, no INIT/poller; interposition is runtime
GOT-patching so libAlgoProcess needs no symbols from it), pushed to `/odm/lib64/` (orig backed up
`libapsfixup.ondevice-orig.so`). Camera stable, no more libapsfixup tombstone. **The real
libapsfixup P010 crash is a separate main-resolution issue.**

**APS capture dirs:** `/data/system/camera_rus` (cameraserver) + `/data/vendor/camera_rus`
(camera) created manually — the `init.camera_process.rc` blob_fixup adding them (present in
extract-files.py + dodge) did NOT land on flashed v1.3 (its regex anchor didn't match the 300
file). Dirs persist in /data across reboot. **TODO durable:** fix the init.rc regex anchor.

### BLOCKER — capture cannot be triggered: camera ignores touches on its controls

After a shutter press the UI shows a "capturing" glow but **no still capture ever issues**
(cameraserver only ever logs preview `still=0`; capture worker threads — `CaptureImageThread`,
`ApsCaptureYuvThread`, `ImageProcessThread` — sit **idle in Native**, never dispatched). Root of
the trigger failure, isolated exhaustively:
- The shutter (and **every** camera control — flash, switch-camera, settings) does **not respond**
  to `adb input tap` **nor** to raw `sendevent` kernel touches (`/dev/input/event7` touchpanel,
  16× coord scale, valid MT-B contact confirmed via `getevent`).
- The **same** `input tap` and raw `sendevent` **do** work on the launcher (open the Phone app)
  and on system dialogs (dismissed the gallery crash dialog). So input injection is fine.
- Camera window is focused, `inputConfig=0x0`, full touchable region, `responsive=true`. No
  untrusted overlay obscures it. Nav bar touch region `[0,2604][1272,2772]` is below the shutter
  (y=2261). Screen confirmed ON.
- ⇒ The camera's **own view hierarchy consumes/ignores touches on its controls** — a real
  touch-handling bug (raw `sendevent` == physical-equivalent on this panel, so a physical tap
  would likely fail too). Likely an OEM view/gesture/Surface framework gap (cf. the caught
  `ClassNotFoundException: android.view.SurfaceExtImpl` at startup; the oplus-fwk stub family).
- Secondary: `com.oplus.aiunit` is **not installed** (`AIUnit-SDK ScanClient onServiceConnectFailed: 704`
  every ~1.5s); session is somewhat unstable ("Tap to show preview" recovery tip appears, camera
  client disconnects on screen-off).

Logs: `logs/launch_iter1_full.txt`, ANR `records/anr_capture_hang.txt`, tombstone analysis in-session.
Tools: `tools/rawtap.sh` (raw touch), `tools/gallery_*.sh`. Crash dialogs suppressed via
`settings global hide_error_dialogs 1`.

### Iter 5 — SHUTTER AUTOMATED + CAPTURE NO LONGER CRASHES; save blocked at OEM metadata (processing boundary)

**Touch wall resolved (it was synthetic-input, as suspected):** a **physical tap fires the shutter**
(`still=1`) where `adb input tap`/`sendevent` did not. The differentiator = **`ABS_MT_TOUCH_MAJOR`**
(real contact size). `tools/rawtap2.sh` (full MT-B finger contact: SLOT, TRACKING_ID, TOOL_TYPE,
TOUCH_MAJOR/MINOR, X, Y, BTN_TOUCH, BTN_TOOL_FINGER) **fires the shutter from automation** → `still=1`.
Also: the camera's **mode-strip swipes already worked** via `input swipe` (the test framework
`tools/observability/capture/ui/drive_cycle.sh` navigates fine) — only the shutter button needed
real contact-size. The framework's `dismiss_overlays()` (AIUnit `btn_privacy_confirm` consent +
permission dialogs) + foreground-verify is the right launch harness.

**Capture-crash root = SELinux on APS storage.** With `setenforce 0` (permissive, user-authorized
diagnostic), the still capture **no longer crashes** — camera (10343) AND HAL provider (10329) both
survive. The CHI SIGABRT (Iter "blocker") was caused by:
```
avc: denied { open } /data/system/camera_rus/jobSize/deferjob_size.txt
  scontext=u:r:opluscamera_app:s0  tcontext=u:object_r:system_data_file:s0
```
APSFileStorage (camera app, domain `opluscamera_app`) can't write `/data/system/camera_rus`
(`system_data_file`) under enforcing → defer-job storage fails → bad/empty metadata → CHI
RecoveryThread → abort. In permissive the write succeeds (`.../jobSize/deferjob_size.txt` created).
**Proper fix (replaces permissive): sepolicy `allow opluscamera_app <camera_rus type>:dir/file
{create write add_name ...}` + a file_contexts type for `/data/system/camera_rus` + the
init.camera_process.rc mkdir (already in extract-files.py — fix its regex anchor so it lands).**

**Save still blocked — at the OEM metadata pipeline (= main-resolution / interop-tree domain):**
The HAL delivers a still result but with **`com.oplus(0x8117)=0`** vendor tags (zero OnePlus OEM
metadata; `flash.snapshot.use.nonzsl` tag "does not exist"). The OnePlus capture-save/encode path
needs that OEM metadata → with it empty: `OCAM_DeferJobController: not in defer scene!` /
`aps no defer job`, `rename temp file size: 0`, no JPEG saved (no HAL blob; OEM path encodes
app-side from YUV+OEM-meta). Also `AIUnit authorize 802 permission=false` (OEM client-identity gate).
⇒ **Bring-up has reached the processing boundary**: camera opens, previews, shutter fires, capture
survives — but producing a SAVED JPEG requires the OEM vendor-tag/metadata + libAlgoProcess/CHI
pipeline, which is the interop-tree / main-resolution work, not bring-up.

**State left on device:** SELinux **permissive** (temporary — needs sepolicy fix); AIUnit installed
(/data, OOS-parity test); oplus-fwk = OplusBlurParam+OplusCfgFilePolicy (boots clean); gallery
perm-strip+ActionReceiver; libapsfixup stubbed; camera_rus dirs created; rawtap2 shutter automation.

### Iter 6 — verbose-log RE of the save-blocker (OEM metadata pipeline)

Enabled the full log stack (`tools/observability/enable/00_enable_all.sh` = CHI + APS + framework +
camxoverridesettings overlay + `persist.vendor.camera.oplus.enableLogging=true`; frida-server is up;
CamX-core frida enabler available but its offsets are 201-pinned vs our 300 build — deferred).
Captured a still with CHI verbose → `logs/still_verbose_chi.txt`. Pathway mapped:
shutter → MCC master cam 0 (`activeLogicalMap=0x2`) → feature graph **MCXSuperFG** → OEM node
**`OplusSATOfflineReprocess0_IPE0`** (`opmode 0x8001`, `featuretype 48`, `processingType 2`).

**The divergence (steady-state, EVERY frame — not capture-specific):**
- `chxmulticamerabase.cpp CreateUsecaseRequestObjectInputParam() oemChimetadatas.size: 0` (+ `ClearOldRequests m_oemChimetadatas.size: 0`)
- `opluscamxchinodehwcfgipedummy.cpp:1427 OplusOverrideIPECCMData() ... getRawSRAlgoMetaData ccm is null`
- `chifeature2graphselector CheckStreamTypesInRequest() isJpegSnapshot 0` for all frames (the
  cameraserver `still=1` never becomes a CHI JPEG snapshot) and `custom vendor tag 0`.

⇒ The OnePlus OEM metadata pipeline (**SR-algo metadata → `com.oplus(0x8117)` vendor tags →
`oemChimetadatas`**) is **empty in steady state**. The publisher isn't producing it → the OEM
SAT-offline-reprocess IPE node gets null CCM/SR meta → no valid image → no snapshot → no save.

**Competing hypotheses (interop-tree; A/B vs OOS needed to pin — don't over-attribute):**
- H1 — OEM SR-algo/stats publisher (libAlgoProcess SR engine / OEM AEC-stats) not producing the
  SR-algo metadata/CCM → `getRawSRAlgoMetaData` null.
- H2 — OEM client-identity/auth gate (`AIUnit authorize 802 permission=false`; cf. memory
  [[scandoc-oem-identity-gate]]) gates the OEM-metadata publish.
- H3 — the **libapsfixup stub** removed part of the OEM algo path (it's the P010/algo interposer +
  the dodge `copy_metadata` issue lived near `DeferJob::startCapture`). Test: re-pin libapsfixup to
  300 (instead of stub) and re-check whether SR meta appears. (was inert/stubbed for the crash.)
- H4 — snapshot stream/pipeline never engaged (`isJpegSnapshot` stays 0) — a separate
  snapshot-stream-config path from the metadata gap.

**NEXT (main-resolution / interop-tree, multi-session):** A/B the still pathway vs OOS reference
(`reference/`) — where OEM produces `oemChimetadatas`/SR-meta/`0x8117` — to pin the true divergence
layer; this feeds `docs/interop-tree/` (NOT bring-up). The CamX-core frida enabler must be re-pinned
to the 300 `libcamxcommonutils.so` first for node-level (`configure_streams`/hdr) visibility.

### Iter 6 A/B RESULT — divergence pinned to `oemChimetadatas` injection (vs OOS-300)

Diffed `reference/ab/oos-photo-v16.0.8.300/logcat_all.txt` (OOS, **same 300 build**) vs LOS capture:

| marker | OOS-300 (works) | LOS (broken) |
|--------|-----------------|--------------|
| `oemChimetadatas.size` / `m_oemChimetadatas.size` | **1** | **0** (every frame) |
| reprocess node | `OplusSAT**Fusion**OfflineReprocess0_IPE0` | `OplusSATOfflineReprocess0_IPE0` (no fusion) |
| `apsFeatureType` | **50** | **48** |
| `getRawSRAlgoMetaData` CCM | present (no error) | **null** (every frame) |
| opmode | 0x8001 | 0x8001 (same) |
| `0x8117` / "tag does not exist" | 0 / 0 | 0 / 0 (vendor-tag-reg hypothesis H-weakened) |

**Causal chain (interop-tree symptom→site→divergence):** no saved JPEG ← OEM SAT reprocess can't
build image (null SR-CCM) ← SAT-**Fusion** path never selected (featuretype 48 not 50) ← **the OEM
metadata blob is not attached to the usecase request (`oemChimetadatas.size 0` vs OOS 1)** at
`chxmulticamerabase.cpp:6131 CreateUsecaseRequestObjectInputParam()`. The Fusion-path + featuretype
+ null-CCM are all DOWNSTREAM of the empty `oemChimetadatas`.

**TRUE divergence to pursue:** who populates `oemChimetadatas` (size 1) on OOS — the camera app's
OEM-metadata path (OCS SDK / vendor-tag set) or an OEM HAL component — and why it's empty on LOS
(same apk). Candidate couplings: the OEM client-identity/auth gate (`AIUnit 802 permission=false`,
[[scandoc-oem-identity-gate]]); the OCS SDK extension pathway; whether libapsfixup (stubbed) feeds
the SR meta. This is **interop-tree / main-resolution** work — out of the bring-up scope (which is
DONE: opens, previews, shutter fires, capture survives, no crash).

### Iter 7 — ROOT PINNED: OCS-auth identity via the Oplus SurfaceFlinger/libgui extension (absent on LOS)

User steer: "the identity issue is more in APS/OCS." A/B confirmed it precisely (OOS-300 vs LOS):

| auth/identity marker | OOS-300 (works) | LOS (broken) |
|----------------------|-----------------|--------------|
| `CameraUnitClient handleAuthenticate isAuthed` | **true** | absent |
| `AIUnit-ClientManager onAuthed ... status` | **true** | **false** |
| `OplusSurfaceComposerClient notifyAuthInfo permBits` | **0x80000000** | absent |
| `OplusClientRecorder addOcsAuthInfo` (in surfaceflinger pid) | present | absent |
| `customVendorTag` (CHI) | **120** (3533×) | **0** (always) |

**ROOT:** LOS ships **AOSP SurfaceFlinger + libgui** — `strings /system/lib64/libgui.so` and
`/system/bin/surfaceflinger` contain **none** of `OplusSurfaceComposerClient` / `notifyAuthInfo` /
`OplusClientRecorder` / `addOcsAuthInfo`. The OnePlus camera registers its **OCS (OnePlus Camera
SDK) client identity** through that Oplus SF/libgui extension (`OplusSurfaceComposerClient::
notifyAuthInfo` → SF `OplusClientRecorder::addOcsAuthInfo`, `permBits=0x80000000`). Without it the
camera never authenticates as an OCS OEM client → `isAuthed`≠true → `customVendorTag` never set
(stays 0) → no OEM metadata (`oemChimetadatas 0`) → null SR-CCM → SAT-Fusion path never selected →
no saved photo. The earlier AIUnit `status=false` + OplusCfgFilePolicy are **downstream/secondary**
of this identity gate.

**FIX (interop-tree / main-resolution; batch into los-impl — R3-adjacent libgui/SF ABI):**
provide the Oplus OCS-auth extension on LOS — either ship OnePlus libgui+SF blobs (heavy/Treble) or
author `OplusSurfaceComposerClient::notifyAuthInfo` (libgui WRITE) + `OplusClientRecorder::
addOcsAuthInfo` (SF READ) into the LOS graphics stack (the R3 libgui/SF pattern). This is the #1
save-blocker root; the automated A/B campaign (raw_shutter now wired) will surface the remaining
batch (AEC hdr_detected rc=-2, EDR/SF caps, metadata lifetime, etc. per AB-RUNBOOK).

### Iter 8 — OCS-auth ABI RE result + ATTRIBUTION CORRECTION (interop-tree discipline)

RE agent (Ghidra on OOS-300 `surfaceflinger`/`libgui`, jadx on OCS SDK) → `docs/re-notes/ocs-auth-abi-RE.md`.
**It corrected my Iter-7 over-attribution** (exactly the multi-path trap the user warned of):

- `OplusSurfaceComposerClient::notifyAuthInfo` is **NOT native libgui** — it's **Java in
  `oplus-framework.jar`** (`com.oplus.display.OplusSurfaceComposerClient`). So shipping OOS libgui
  fixes nothing. (libgui strings being absent on LOS was a red herring — it was never in libgui.)
- **Verified ABI:** Java `notifyAuthInfo(uid,pid,permBits,pkg)` → SF binder **code 24001 (0x5dc1)**
  `OPLUS_NOTIFY_AUTH_INFO` (needs `com.oplus.permission.safe.MEDIA`) → SF `OplusClientRecorder::
  addOcsAuthInfo` → `mOcsAuthInfoMap[pkg] = OcsAuthInfo{uid,pid,pkg,permBits}`. `checkOcsPermission
  (proc,req) = (req & ~stored.permBits)==0` (superset test; missing key⇒false).
- **permBits are per-EDR-TYPE grants** (0x80000000=EDR type1, 0x40000000=type2, …); the camera grants
  **0x80000000**. **The consumer is the SF EDR-composition gate** (`OplusEdr_checkOcsPermissionGate`
  @0x3f43ac) — co-dependent with the EDR read-side ([[edr-sf-readside]] / R3).

**⇒ CORRECTION:** the SF OCS-auth (24001) gates **OEM EDR/HDR composition (R3 / over-exposure)**, NOT
(directly) the **no-JPEG save**. My Iter-7 chain "OCS-auth → customVendorTag → no-JPEG" is **NOT
convicted** — I over-correlated two pathways that both fire on OOS but are likely independent. There
are **TWO auth sinks**: (a) **cameraserver** codes 10001–10027 via `OplusCameraManager`/libcsextimpl
([[scandoc-oem-identity-gate]]) — the camera-metadata/OCS-SDK identity; (b) **SurfaceFlinger** 24001
— the EDR gate. `customVendorTag 120`/`oemChimetadatas` most likely flows through sink (a), NOT (b).

**Batch items now (los-impl):**
- **EDR/R3 (RE-complete):** restore SF OCS-auth — Leg1 Java `OplusSurfaceComposerClient`+trigger,
  Leg2 SF `OplusClientRecorder`+onTransact 24001+`checkOcsPermission`, gate OEM EDR composition;
  co-port with the EDR read-side. (Fixes over-exposure, not the save.)
- **NO-JPEG root (still UNCONVICTED):** pin the camera-metadata-auth pathway — why `customVendorTag 0`
  on LOS (OCS-SDK `CameraUnitClient.handleAuthenticate isAuthed` absent; cameraserver 10001-27 ladder;
  the unit-config/`checkAuthenticationPermission` gate). Agent rec: **Frida-hook the OOS camera at
  session-open** to capture the actual `notifyAuthInfo`/auth caller + the `customVendorTag` producer.

### Iter 9 — Frida A/B (LOS) REFUTES the Java/SDK hypothesis → locus is NATIVE vendor-tag ingestion

Live Frida (Java hooks, com.oplus.camera; agent `ocs-frida-live`, logs `camera-bringup/logs/ocs-frida/`)
— **the LOS OCS-SDK Java auth + vendor-tag path is HEALTHY and matches OOS:**
- `CameraUnitImpl.isAuthedClient` ⇒ **true** (== OOS); `handleAuthenticate` ⇒ authed-sync (== OOS).
- `JsonParser.parseVendorTagInfo` / `getVendorTagMap` ⇒ **17 entries (non-empty)**; `getModeOperationModeMap` ⇒ 22.
- The app **sets 58 distinct `com.oplus.*` CaptureRequest vendor tags** (caller.package.name, camera.mode=photo_mode, sat/zoom/hdr/asd…).
- **`OplusCfgFilePolicy` stub NOT implicated** — `getCfgFileList`/`getCfgTopPriorityFile` never called on the
  auth/config/vendor-tag path. (So the stub is safe to keep; it only addresses the AIUnit `NoClassDefFoundError`.)

**⇒ The app/SDK side is correct.** `customVendorTag` is a **CHI-native** field (`chifeature2graphselector.cpp`)
derived native-side from the request metadata, NOT written by the app under that name. On LOS, CHI/cameraserver
**fails to ingest the app's OEM vendor tags** → reads `customVendorTag 0`. Convicted locus: the **vendor-tag
DESCRIPTOR / tag-ID registration handshake** (`get-vendor-tags` / `VendorTagDescriptor`) between app and
cameraserver/CHI — a tag-ID mismatch or missing OEM-section registration makes CHI read the OEM tags as absent.
Corroborated by the earlier `VendorTagDescriptor: lookupTag: Tag 'flash.snapshot.use.nonzsl' does not exist`.
(Frida-server note: the agent pushed a matching `frida-server-17.9.11` arm64 + ran it as a daemon; the prior
one wasn't fully functional.) Static agent `vtag-static-re` still running — its Q4 covers this descriptor/reg path.

### Iter 10 — static RE + doc-47 convergence: ALL easy roots REFUTED; no-save is OEM-reprocess-output

Static RE agent `vtag-static-re` → `docs/re-notes/customvendortag-producer-RE.md`. Converges with the
repo's AUTHORITATIVE `docs/rearch/47-root-cause-correction-two-gates.md`:
- `customVendorTag` is a **CHI-native scene-dependent decision code** (`ChiFeature2GraphSelectorOEM::
  GetCustomVendorTagFromCaptureIntent` in `com.qti.feature2.gs.sm8850.so` @0x108970; 120=HDRmode-on+
  non-snapshot path, base=0). OOS photo-hdr ALSO emits 0; LOS emits 120 in other modes. **NOT the root**
  — matches repo REFUTED-LOG **R-06 / doc-47** ("don't re-chase GCVT=0").
- **`OplusCfgFilePolicy` stub CONFIRMED CORRECT/SAFE:** OCS SDK uses a hardcoded `/odm/etc/camera/config/
  camera_unit_config` (plain `new File`), zero refs to OplusCfgFilePolicy; empty return is faithful (OOS
  returns empty w/o a cust partition). It ONLY addresses the AIUnit `NoClassDefFoundError`. Keep as-is.
- Vendor-tag descriptor registered identically (`com.oplus` section 567==567 on both).

**doc-47 (authoritative, supersedes 39/40/44/45):** capture/fusion is ALIVE, **not** gated by
`hdr_detected`; two independent gates — Gate A (AEC hdr_detected → over-exposure, NOT capture-block),
Gate B (preview-frame starvation = freeze). On my LOS v1.3 state: the offline fusion graph DOES run
(`MultiCameraReprocessRealtime`/`MCXSuperFG`) AND preview is NOT frozen (Gate B resolved by bring-up).
⇒ my **no-SAVE is NEITHER documented gate** — it's downstream at the **OEM reprocess OUTPUT**:
`getRawSRAlgoMetaData ccm is null` → `OplusSATOfflineReprocess` yields no image → `rename temp size 0`
/ `aps no defer job` / `not in defer scene` → no JPEG.

**Convicted target for next phase (deep OEM-algo / main-resolution):**
1. the **SR-algo / CCM metadata producer** feeding `OplusOverrideIPECCMData` (null on LOS) — and whether
   my **`libapsfixup` stub** (P010/APS interposer, neutered due to its build-id `poller` SIGSEGV) starves
   it. Test path: FIX the libapsfixup poller crash (vs stub) so the real P010/SR interposition runs, then
   re-check `getRawSRAlgoMetaData`. (libapsfixup = the [[gralloc-ruled-out-reframe]] P010 locus.)
2. the **`oemChimetadatas` producer** at `chxmulticamerabase.cpp:6131` (the more direct CHI target per
   the static agent), and the **APS defer-job/save** path (`not in defer scene` / `rename temp 0`).
Both are interop-tree / main-resolution work. The bring-up (open/preview/shutter/no-crash) is DONE.

**Lesson (user-flagged, now doubly proven):** the Oplus stack is multi-path; downstream symptoms
(customVendorTag, oemChimetadatas, OCS auth, vendor tags) do NOT cleanly map to one upstream root —
chased 5 refuted hypotheses before converging with the repo's own doc-47/REFUTED-LOG. RE artifacts:
`docs/re-notes/{ocs-auth-abi,customvendortag-producer}-RE.md`, `camera-bringup/logs/ocs-frida/`.

### Automation enabler landed
`tools/observability/capture/ui/drive_cycle.sh` `shutter()` now calls a new **`raw_shutter()`**
(full MT-B finger contact incl. `ABS_MT_TOUCH_MAJOR` + `BTN_TOOL_FINGER`, 16× coord scale) →
the A/B campaign (`campaign.sh`/`run_condition.sh` → `diff_oos_los.py`) can now drive REAL LOS
captures (was blocked: `input tap` is dead on the LOS shutter). This is the "automate the effort
all the way through" enabler; OOS baselines already exist under `reference/campaign/` + `reference/ab/`.

---

## Iter 4 — AIUnit investigation (user-directed)

**Finding:** `com.oplus.aiunit` (AIUnit, 86 MB priv-app) and `com.aiunit.aon` (AONService) are
**shipped by OOS** (`dump300: my_stock/priv-app/AIUnit`, `my_product/app/AONService` + vendor AON
HALs) but **omitted by the port** (neither dodge nor infiniti ship them — only config/queries refs).
Camera `queriesPackages` lists both; the camera's `AIUnit-SDK ScanClient` binds
`com.oplus.aiunit.core.AIUnitService` (action `oplus.intent.action.AIUNIT_SERVICE`, exported, **no
perm gate** → bindable once present), failing `onServiceConnectFailed: 704` every ~1.5s.

**Test:** `pm install`ed OOS AIUnit.apk (`overlays/AIUnit.oos300.apk`, /data). It **crashes on
startup**: `NoClassDefFoundError: com.oplus.cust.OplusCfgFilePolicy` (← `ClassNotFoundException`) in
`BaseOSLoadStrategy.listFilesFromOS` — **another missing OEM framework class** (OnePlus "cust"
customization file-policy; same class-gap family as OplusBlurParam / SurfaceExtImpl).

**Scope to fully enable AIUnit (deep — AI/processing-adjacent subsystem):**
1. add `com.oplus.cust.OplusCfgFilePolicy` (+ likely more cust classes) to `oplus-fwk` (cheap,
   established pattern — high value, used port-wide);
2. AI-unit **config files** (OOS `my_product`/cust paths) — not on device;
3. the **AON vendor HAL** (`vendor.{qti,oplus}.hardware.camera.aon-*`, `AONService`);
4. priv-app install + privapp-permissions allowlist (AIUnit requests many privileged/OEM perms).

**Assessment:** The camera's ScanClient failure is **background** (separate thread; main thread is
NOT blocked on it — UI renders, preview streams). dodge (proven-working capture reference) ships
**no** AIUnit. So AIUnit is **OOS-parity / AI-scene-feature** work, deep, and does **not** appear to
gate *basic* photo capture. The actual capture blocker remains the **touch-controls-don't-respond**
issue (Iter 3). Recommend: treat AIUnit as a separate parity track; prioritise the touch blocker
to reach a capture. `OplusCfgFilePolicy → oplus-fwk` is a cheap, high-value next step regardless.

### Iter 4 outcome — OplusCfgFilePolicy LANDED; AIUnit RULED OUT as touch blocker

Added `com.oplus.cust.OplusCfgFilePolicy` to `oplus-fwk` (faithful stub from OOS API:
`getCarrierId(int)`, `getCfgFileList(String,String,int)`, `getCfgLevelList(String,int)`,
`getCfgTopPriorityFile(String,String,int)`, `DEFAULT_SLOT=-2` → empty/null). Rebuilt oplus-fwk
jar + boot-image extension, pushed (backup `overlays/revert_goodboot/`), **rebooted clean — NO
bootloop**. Source mirrored to `infiniti-camera-port/repos/android_hardware_oplus/oplus-fwk/src/`.

Result: AIUnit's `NoClassDefFoundError` is **gone**; AIUnit runs and **the camera connects**
(`AIUnit-AIClient: reset AIClient[com.oplus.camera...]`). But it tears down with err **802** (was
704) — AIUnit has **no AI units** (configs/models absent → that's the deep part), so the scan
capability is empty. **No AIUnit crash/ANR dialog present.** Yet **touch is STILL dead** → AIUnit
(crash/prompt) is **not** the touch blocker.

### Touch blocker — fully characterized (the wall)

NO touch reaches the camera's views — confirmed both **control buttons** (shutter/flash/switch/menu)
AND **preview tap-to-focus** are ignored (zero app-side touch/focus/capture logs). Meanwhile the
camera window is focused (`mCurrentFocus=Camera`), `inputConfig=0x0`, full touchable region,
input channel `responsive=true` (so the app IS draining the input queue — no ANR), and **both
`adb input tap` and raw `sendevent` work on every other app** (opened the dialer, dismissed
dialogs). ⇒ the camera's **own view hierarchy swallows touches in dispatch without acting** — a real
touch-dispatch bug, independent of AIUnit / gallery / libapsfixup / screen-state. Needs camera-apk
touch-dispatch RE (decompile `com.oplus.camera.Camera` + root-view onInterceptTouchEvent), or a
physical-tap confirmation. NOTE: device also exhibits **screen-sleep churn** (enters
`.setting.ScreenOffActivity` despite stayon+USB) that intermittently disconnects the camera —
a secondary confound to clean up.

---

## Iter 5 — Save-blocker localized to PROVIDER process; alignment & namespace axes pruned

Two background RE legs landed (`apsfixup-poller-fix`, `oemmeta-sr-re`) + a holistic
"general-alignment" sweep (user-directed). Net: the save blocker is **not** the shim, **not** the
oplus namespace, **not** page size — it is **provider-side OEM metadata production**.

### libapsfixup poller crash — ROOT-FIXED from source (no longer stubbed)
`apsfixup.cpp` had **two** bugs (Ghidra-anchored on the on-device `be891b97` build): (1) `build_id_matches`
deref'd the module base with **no mapped-ness guard** → SIGSEGV on a torn/unmapped base; (2) `module_base()`
read `/proc/self/maps` non-atomically, torn under the 25 ms poller racing the linker's `mmap`. **Fix (v3):**
guard the deref, switch base discovery to `dl_iterate_phdr` (atomic load-bias), and **bound the PT_NOTE walk
to the note's own VMA** (`range_of(p)`) — libAlgoProcess's `.note.gnu.build-id` sits at `p_vaddr 0x9c0030`
in a *later* LOAD segment, so the old base-segment clamp skipped it → false BuildId mismatch → hook never
installed. Rebuilt `m libapsfixup` (exit 0), pushed `libapsfixup.fixed.so` (md5 `69537637`). **Poller SIGSEGV
RESOLVED**; real GOT hooks (`p010`, `dlsym`) install cleanly; camera survives. RE: `docs/re-notes/libapsfixup-poller-fix-RE.md`.

### DECISIVE: the shim is NOT the no-save cause — it's a different PROCESS
With the real lib fully active, `getRawSRAlgoMetaData ccm is null` (~20×/capture) and the 0-byte/no-JPEG **persist
unchanged**. Process boundary nails it:
- `libapsfixup` loads only into **`com.oplus.camera`** (app, pid 7379) — fixes app-side P010 geometry.
- `ccm is null` is emitted by `OplusOverrideIPECCMData`/`getRawSRAlgoMetaData` (CHI IPE node `com.qti.hwcfg.ipe.so`,
  pipeline `OplusSATOfflineReprocess0_IPE0`) inside the **provider** `vendor.qti.camera.provider-service_64`
  (pid 6603). Chain: ccm-null → SR/IPE reprocess fails → CHI `RecoveryThread`→`DumpSystemEvent` **SIGABRT**
  (tombstones 08/09/10, `com.qti.chi.override.so`) → provider abort → **no JPEG.** Independent of the app/shim.

### "General alignment issue?" (user) — pruned across the interop-tree
- **4KiB↔16KiB page size — RULED OUT.** LOS uses the **OOS-prebuilt kernel** (user) ⇒ identical page size; OOS
  camera blobs are `p_align` `0x4000`/`0x10000` (16K/64K), consistent. No kernel-layer mismatch.
- **Oplus linker namespace — RULED OUT for camera.** `system_ext/oplusex/ld.config.oplus.txt` augments the app
  *default* namespace, but `public.libraries-oplusex.txt` = **just `libbinder.so`**, and the `oplusex` paths/loader
  serve `liboplusext{property,network,stability,bootmode,…}.so` (oplus system-ext libs loaded by `init`). **No
  camera/algo/arcsoft/camx lib lives under any `oplusex` path.** Camera libs are in `/vendor`
  (`libcamxexternalformatutils`) + `/odm` (`libAlgoProcess`/`libAlgoInterface`/`camera.oemlayer.v2`), reached via
  **sphal / `same_process_hal`** — matching E4's verdict (byte-identical OOS↔LOS, dodge-proven). Confirmed: oplus
  namespace does NOT touch the camera stack.
- **libapsfixup stub starving the save — RULED OUT** (above; process boundary + real-lib-active retest).

### Two distinct loci (separated by the process boundary)
- **Locus 1 — app (`com.oplus.camera`): P010 geometry.** Root = the port's HAL doesn't emit vendor tag
  `com.oplus.aps.platform.output.alignment` → `libAlgoProcess+0x5c76f4` falls to the `0/0` default
  (`stp wzr,wzr,[x19,#0x14]`) → `align_up(luma,0)` = 4GB-garbage chroma. `libapsfixup` band-aids the *effect*;
  emitting that tag upstream **retires the shim** (og-author `op_force_align.js` calibration note). NOT the save blocker.
- **Locus 2 — provider (`vendor.qti.camera.provider-service_64`): SR-CCM not published.** `com.oplus/ipe.ccm`
  null → reprocess fails → no JPEG. The ACTUAL save blocker. Producer chain (RE `oemchimetadatas-sr-producer-RE.md`):
  libAlgoProcess SR result (`ccmData[]` + `com.oplus.custom.ccm.sync.result`) → `camera.oemlayer.v2`/`camera.qcom.core`
  (`oplusAWBPublishAlgoProcessOutput`) → publishes `com.oplus/ipe.ccm` → IPE node consumes. Empty ⇒ the OEM/APS
  reprocess result isn't produced/attached **provider-side**.
- **Possible single upstream root (not yet convicted):** the reprocess **request geometry/metadata** flowing
  app→provider (interop-tree **C5** stream config / **D2** HAL-fill; the dma-`len` discriminator). Would explain both
  loci across the boundary — but it is NOT page-size, NOT oplus-namespace, NOT the shim.

**NEXT:** provider-side probe of Locus 2 (the goal = save) — does `camera.oemlayer.v2`/`libAlgoInterface` run + emit
the SR-CCM in `vendor.qti.camera.provider-service_64`, and what publishes (or fails to publish) `com.oplus/ipe.ccm`.
Locus 1 (emit `output.alignment`) is the separate, batchable **shim-retirement** lever.

---

## Iter 6 — Save root PINPOINTED via 4-axis parallel converge + live OOS/LOS A/B

User-directed parallel axis-tracing (4 agents) + live CHI/CamX-verbose captures converged the no-save to a
single byte-range in one function.

### Axes (all eliminated except the SR-CCM publish)
- **customVendorTag (axis1): downstream readout, NOT root.** R-06 upheld. Beauty counterexample: LOS beauty
  reaches `customVendorTag 120` + `oemChimetadatas.size 1` + fusion graph, yet `ccm is null` STILL fires ⇒ the
  SR-CCM gate is INDEPENDENT of the fusion/oemChimetadatas path.
- **SAT topology (axis2): CLOSED.** LOS opens logical cam 4 / 3 physical, builds+runs MCXSuperFG (InternalLinks 870),
  libmvgfusion loads — identical to OOS. Not a divergence.
- **app HDR capture-intent (axis4): app correct.** Regular-photo `tag 0` = provider-side AEC `hdr_detected` never
  asserting (doc-47 Gate A, a separate over-exposure thread) — NOT the save blocker.
- **oplus namespace / page size: eliminated** (libbinder/liboplusext only; OOS-prebuilt kernel).

### THE ROOT (live-proven, OOS golden vs LOS A/B of the AWB publisher)
`camera.qcom.core.so` → `opluscamxcawbstatsprocessor.cpp` → `oplusAWBPublishAlgoProcessOutput()` (provider-side
OEM AWB stats node). Lit via `tools/frida/enable_camx_logging.js` (g_logInfo @ +0x68010, STATS_AWB group; offsets
re-confirmed on .300 via exported `_ZN4CamX9g_logInfoE`).
- LOS COMPUTES a valid CCM: `CCMLocalList.face_ccm:(1.57,-0.39,-0.18,...)` logged at lines 616/620/652. So the
  engine is NOT the problem (refutes "engine not producing").
- **OOS reaches line 692 (the `com.oplus/ipe.ccm` publish); LOS STOPS at 652 — never reaches 692.** Distinct
  cawbstatsprocessor lines: OOS `322 352 538 557 576 616 620 652 692`; LOS `…652` (no 692). ⇒ tag never written.
- Consumer: OOS `opluscamxchinodehwcfgipedummy.cpp:1402` (success, isCCMOverrideEnabled:0, identity CCM, tag PRESENT);
  LOS `:1427 getRawSRAlgoMetaData ccm is null` (tag ABSENT) → IPE reprocess fails → CHI RecoveryThread SIGABRT → no JPEG.
- **Tag IS registered on LOS** (`QueryVendorTagLocation com.oplus/ipe.ccm location 0x81140082`, == golden) — not a
  registration gap. OOS needs only the tag PRESENT (even identity); it does not need a real OEM override.
- **Red-herrings REFUTED (identical on both OOS+LOS):** `EnableOplusSyncMode:0`, `SyncConfidence:0.0`,
  `PopulateColorSensorFrontData/FlickerSensorFrontData EFailed`, `isCCMOverrideEnabled:0`.
- `camera.qcom.core.so` is byte-identical OOS↔LOS (md5 `4480876f`) ⇒ axiom: the **652→692 branch is gated by an
  INPUT** (a metadata tag/state read) present on OOS, absent on LOS. That input is the fix target.

**GATE DECODED (Ghidra, instruction-level):** the `com.oplus/ipe.ccm` publish (line 692) lives ONLY in the
`AWBAlgoOutputList` `type==10` (0x0a) case of `oplusAWBPublishAlgoProcessOutput`. It is gated by a single test:
```
s8 = *(float*)( CamX::HwInterface::GetInstance() + cameraID*0x24 + 0x14724 )   // per-camera "IPE-CCM valid" flag
fcmp s8, #0.0 ; b.eq <skip publish>     (gate site Ghidra 0xca1474 / vaddr ~0xba1474)
```
On HIT it publishes the 9 floats at `+0x14728` (an IDENTITY matrix on OOS) as `com.oplus/ipe.ccm` with
`isCCMOverrideEnabled:0`. OOS: flag!=0 → publishes identity → IPE node OK. LOS: flag==0 → skip → tag absent →
`ccm is null` → no JPEG. **It is NOT gated on the computed CCM (valid on both), NOR on localColorEnable/localAWBEnable/
isCCMOverrideEnabled (all refuted).** The published matrix is a SEPARATE HwInterface datum, not the 652-computed CCM.
camera.qcom.core.so byte-identical ⇒ the flag at `HwInterface+0x14724` is written by an UPSTREAM stage (AWB algo-input /
HwInterface config, producer chain libAlgoProcess→camera.oemlayer.v2→AWB) that the LOS port fails to populate.

**FIX CANDIDATES:** (a) **port shim / live test** — force the gate float to 1.0 + write identity at `+0x14728` so the
existing identity-publish path runs (== OOS `isCCMOverrideEnabled:0`); (b) **clean root fix** — find + restore whatever
writes `HwInterface+cameraID*0x24+0x14724` on OOS.

## Iter 7 — CORRECTION: the SR-CCM gate is DOWNSTREAM of Fusion-pipeline selection (not independent)

**Self-correction of Iter 6:** Iter 6 called the SR-CCM gate "INDEPENDENT of the fusion path," citing a "LOS beauty
counterexample (customVendorTag 120 + oemChimetadatas 1 yet ccm null)." That capture
(`reference/_golden-oos-V16.1.0/campaign/beauty`) is actually **OOS** (mislabeled by axis-1): it is 100% Fusion, reaches
publish (692×6), and **never** hits ccm-null (1427×0). So it is an OOS *success*, NOT a LOS failure — the counterexample
is void. Corrected, the correlation is clean: **Fusion ⟺ ipe.ccm published ⟺ (no ccm-null).**

**Log A/B (counts):**
- OOS oracle (oos-photo): Fusion 3615, nonFusion 0, ccm-null 0 → saves.
- LOS **regular photo** (live `/tmp/los_camx.log`): nonFusion **305228**, Fusion 0, **ccm-null 248 every frame**, customVendorTag **0** (740×) → no save.
- LOS **other modes** (r3: portrait/masterraw/scandoc/motionphoto/p010/filter): Fusion **~20000**, nonFusion 0, ccm-null **0–4 (warmup only)** → IPE-CCM publishes.

**Corrected root chain (regular photo):** LOS regular photo gets `customVendorTag 0` → `multicameraplugin CustomPipelineSelect`
picks the **non-Fusion** `OplusSATOfflineReprocess` → the Fusion sub-graph's IPE-CCM initializer (which sets
`HwInterface+camID*0x24+0x14724 = 1` + identity matrix) **never runs** → `ipe.ccm` never published → `getRawSRAlgoMetaData
ccm is null` every frame → reprocess SIGABRT → **no JPEG**. OOS regular photo gets `customVendorTag 120` → Fusion → flag
set → publish → JPEG. So "why is OOS's flag !=0" = **OOS regular photo runs SAT-Fusion; LOS regular photo runs non-Fusion.**
The `+0x14724` writer is part of the Fusion sub-graph (NOT in camera.qcom.core.so — agent searched exhaustively; the OFE
sibling `+0x14670` IS written there via `SetOFECCMData`/`OverrideOFECCMMetadata` and works on LOS).

**OPEN / UNCONFIRMED:** (1) **DCIM is EMPTY — no JPEG has saved in ANY mode yet** (r3 Fusion captures were probe runs, not
save tests). Decisive live test: does a LOS Fusion mode (e.g. Portrait) actually SAVE? If yes ⇒ regular-photo's non-Fusion
selection is the whole break + the camera CAN save. If no ⇒ a further downstream break exists past the CCM. (2) The next
upstream question: **why does LOS regular photo get `customVendorTag 0` (non-Fusion)** while OOS gets 120 — i.e. the
`GetCustomVendorTagFromCaptureIntent` inputs (cameraHDRMode/numHDRExposure/captureIntent) — reconcile vs doc-47/R-06.

---
