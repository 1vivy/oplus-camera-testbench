<!-- STATUS: SUPPORTED — on-device frida-verified (LOS v2.1) + static RE (R7+R8, 2026-06-24). Gate REJECTED (config byte-identical OOS↔LOS). ROOT (R8): LOS loads the WRONG preview lib — the in-APK libApsFaceBeautyPreviewJni.so (no FBInitFlag guard, no _use_lib fallback) instead of the guarded libApsFaceBeautyPreviewProductJni.so, because OplusFaceBeautyPreview.<clinit> probes /product/lib64 but LOS installs the Product lib in /system_ext/lib64. Partition-path/lib-load variant (E1/E4), not a race. See "## R8 UPWARD TRACE". -->
# Face-beauty preview crash: all-zero `FaceBeautyParams` and the `getFbAlgoLibFlag` build-path gate

> Grounds **S9** (`../interop-tree/symptoms/S9-facebeauty.md`). The face-retouch preview crash is a
> consumer-side null-deref in a **byte-identical** OEM blob (`lib2DSlender.so`), driven by an
> **un-built** params struct: the `libAlgoInterface` OEM param-BUILD path is never invoked on LOS, so
> `FaceBeautyParams` reaches `adjustParam+836` all-zero and derefs null once a face is detected.
> Same shape as **R1** (per-frame native build-step that must fire but doesn't on LOS) and **R6**
> (un-published OEM input → consumer derefs null → SIGSEGV).
>
> Date: 2026-06-24 · Device: LOS v2.1 (infiniti, CPH2747), frida-17.15.3 on-device, SELinux permissive.
> Method: device capture (not Ghidra) — frida hooks on the live `com.oplus.camera` preview process.
> Evidence: `reference/campaign/_los-v21-notes/facebeauty-crash-finding.md` (+ `facebeauty-tombstone_06.txt`,
> `facebeauty-adjustParam-live.log`). STAR REF = OOS golden `reference/_golden-oos-V16.1.0/campaign/beauty/`.

## Pipeline (face-beauty PREVIEW — distinct from APS/libAlgoProcess/R1)
`OplusCamera` Java `OplusFaceBeautyPreview`/`OplusFaceBeautyPreviewHelper.setPreviewParams(key,val)`
→ JNI `Java_com_oplus_camera_facebeauty_OplusFaceBeautyPreview_process` (`libApsFaceBeautyPreviewJni.so`;
**OOS uses `libApsFaceBeautyPreviewProductJni.so` from `/product`**)
→ `APSPreviewProcess::process/setParameters(previewProcessParam_t*)`
→ `libFaceBeautyJni.so`
→ `lib2DSlender.so`: `Slender2D_process` → `VideoBeautyEditionOne::process(...)+2084` →
  `adjustParam(BsData*, op_param_data_t*, FaceBeautyParams*, FuncEnableFlag*)+836`  ← **SIGSEGV null**.
Per-face param BUILD lives in `libAlgoInterface.so`.

## Crash site (verified)
- `lib2DSlender.so` BuildId `8470e82c5ae6240fd0f86724844a3cd1133e8b49` (dump300 md5 `6b77ca1c2f8b8cc0e0d96911e8da47bf`),
  **byte-identical OOS↔LOS** → SITE not root. `adjustParam` @ file `0x109278` (+836 = `0x1095bc`);
  `VideoBeautyEditionOne::process` @ `0x10fbfc` (`+0x110420`); `Slender2D_process` @ `+0x1154c4`.
- 6+ tombstones (tombstone_01..13), all `com.oplus.camera`/PreviewGLThread/SIGSEGV-null at `adjustParam+836`.

## Verified on-device (frida traces, runs 0–6)
1. **`FaceBeautyParams` arrives all-zero.** Hook `adjustParam` onEnter: arg2 (`FaceBeautyParams*`) is a
   valid pointer to a fully zero-filled struct, every frame — 1492 frames on a **real face** through the
   crash; `op_param_data_t` (arg1) and the upstream `previewProcessParam_t` are populated. Only the
   beauty-params struct is unbuilt.
2. **Java pushes the preset.** `setPreviewParams`: `preview_face_beauty_enable=1`, `preview_beauty_type=1`,
   `preview_Whitening_value=30` (Classic), shape values 0 — the preset VALUES exist at the Java/JNI
   boundary (`libApsFaceBeautyPreviewJni` `arg0 allZero=false`).
3. **The build path is BYPASSED.** With 242 `libAlgoInterface` export hooks armed, on a real face
   through the crash the param builders fired **0×**: `android::getAlgoMetaData(face_beauty_meta_t*, AlgoProcessData*)`
   (`_ZN7android18getAlgoMetaData_V1E…` / `_ZN7android15getAlgoMetaData…`), `updateParamByRatio`
   (`UpdateParamsDecratorBy{PortraitMode,VideoMode,FaceCoveredV1}`), `parseCpuParams3rd(json_object*)`,
   `adjustMakeUp`/`adjustLipPink`. Only the APPLY path ran: `Slender2D_process` → `VideoBeautyEditionOne::process`
   → `adjustParam` (917×, all-zero).
4. **Gate + producer are FACE/CAPTURE-gated** (not preview-init): on the idle ceiling (no face) the gate
   `_Z19getFbAlgoLibFlagRefPcPi11log_level_t` and `getAlgoMetaData(face_beauty_meta_t)` do not fire even
   across a preset toggle — so the LOS-vs-OOS return/fire diff requires one face-aim (R1-style hook).
5. Beauty **model/asset files load OK** on LOS: `/odm/etc/camera/fb_model/*.bin`, `pfb_bin/Pre*Binary.bin`
   all `open fd=…`. QNN/HTP relative-open fails (`./libQnnHtpV81.so`, `./libarc_htp_driver_skel.so`) are
   **benign** (DSP-skel libs exist at `/odm/lib/rfsa/adsp/`; CPU stubs `libQnnHtp`/`libQnnHtpV81Stub`/
   `libarcsoft_qnnhtp` are loaded in-proc).

## Key symbols (`libAlgoInterface.so`, LOS v2.1)
- Gate: `_Z19getFbAlgoLibFlagRefPcPi11log_level_t` @ `0x7156698b2c` (base-relative varies).
- Beauty-meta producer: `_ZN7android18getAlgoMetaData_V1EPNS_18face_beauty_meta_tEPNS_15AlgoProcessDataE`
  @ `0x71565ddb4c` and `_ZN7android15getAlgoMetaDataEPNS_18face_beauty_meta_tEPNS_15AlgoProcessDataE` @ `0x715658af18`.
  (`face_beauty_meta_t` is the libAlgoInterface analog of the all-zero `FaceBeautyParams` lib2DSlender consumes.)

## STAR REF — OOS golden runs this clean
`reference/_golden-oos-V16.1.0/campaign/beauty/run*/ab/logcat_all.txt`: **zero** `Fatal signal`/`SIGSEGV`.
OOS completes the handshake whose OUTPUT LOS lacks: `facebeauty_debug [getFbAlgoLibFlag] E` (fires) →
`Slender2D_init FACEBEAUTY VERSION vp_12.0.0.40` (`numOfFileInDir num:104`) → `faceBeautyPreview_init
versionID:7 featureFlag:4194472` → `faceBeautyPreview_init_use_lib handel=0x…` → `FBinit success`;
`dumpsys_camera_post.txt` publishes `com.oplus.facebeauty.level (0x81140123) int32[1]`. The gate's
RETURN value and the per-frame `updateParamByRatio` prints are NOT emitted at the golden's default
logmask — the LOS↔OOS diff must come from a frida hook, not static grep.

## Root candidates (ranked — the facilitation input `getFbAlgoLibFlag` reads)
1. **`getFbAlgoLibFlag` gate / algo-lib-select contract (PRIME).** Flag selects build-vs-skip; if LOS
   returns the skip branch the libAlgoInterface build chain is bypassed → all-zero params. Check: hook the
   gate LOS-vs-OOS; trace the config/prop/RUS/asset it reads.
2. **Asset/model-dir + version contract.** OOS logs `numOfFileInDir num:104` + `Slender2D_init vp_12.0.0.40`;
   a short/absent dir or version mismatch flips the gate. Check `numOfFileInDir` count + `Slender2D_init` success on LOS.
3. **Init handshake** (`faceBeautyPreview_init` → `init_use_lib` → `FBinit success`, `featureFlag:4194472`):
   degraded handle/flag, or `setPreviewParams` landing before init completes.
4. **Lib-load / namespace / variant (E1/E4-class):** OOS `libApsFaceBeautyPreviewProductJni.so` (`/product`)
   vs LOS `libApsFaceBeautyPreviewJni.so` (in-APK) — confirm the variant + BuildIDs + load namespace.
5. **Vendor-tag / preset relay (R5/R6-class):** `0x81140123 facebeauty.level` publish + `preview_*` key relay.

## Precedent + fix framing
Model on **R1** (`decmetarefzero-upcall-RE.md` / REQUIREMENTS R1): `getFbAlgoLibFlag` is the beauty path's
`isInc` — the gate that decides whether the per-frame build fires. RE the gate's read-input, prove
fire-on-OOS / skip-on-LOS via hook, attribute the root to that **environment/facilitation input** (never
the byte-identical blob). Structural twins: **R6** (un-published tag → null deref) and **R5** (publish
contract). Candidate requirement → **R8** ("the face-beauty algo-lib-select input must be set so the
libAlgoInterface beauty-meta build runs"), owned by `../facilitation/F3-toggles-config.md` (if config/
prop/tag) or `F1`/`F4` (if lib-load/namespace). **NOT** a lib2DSlender null-guard (masks, not fixes).

## Next (decisive)
One face-aim with `getFbAlgoLibFlagRef` + `getAlgoMetaData(face_beauty_meta_t)` hooked, LOS vs an OOS
device: capture the gate return + whether the producer fires + (if it fires) whether its config input is
zero. That pins candidate 1 vs 4, and the exact facilitation input to restore.

---

## R7 STATIC RE — the gate decoded in BOTH libs (2026-06-24)

> Method: static disassembly on `aosp-builder`. Tooling baseline: system `objdump` 2.34 is **x86_64-only**
> (`can't disassemble for architecture UNKNOWN`); use the LineageOS prebuilt
> `/srv/android/worktrees/lineage-infiniti/prebuilts/clang/host/linux-x86/clang-r574158/bin/llvm-objdump`
> (+ `llvm-readelf`) for aarch64. ghidra-mcp not available in this env.
> Targets: OOS dump300 `odm/lib64/libAlgoInterface.so` (BuildID md5 `f76a88188a00589db385183c025443fb`)
> **and** the actual preview lib `my_product/lib64/libApsFaceBeautyPreviewProductJni.so`
> (BuildID `17efbc5b0256e9702e2c75abaf1e9854038de276`). VMA == file offset (image base 0).

### CORRECTION to the pipeline above
The live PREVIEW face-beauty path (the crash path) is **entirely inside
`libApsFaceBeautyPreviewProductJni.so`** — it does NOT link or call `libAlgoInterface.so` (no `NEEDED`).
That lib exports its OWN `faceBeautyLoadlib`, `getFbAlgoLibFlag`, `faceBeautyPreview_init/process/...`,
`BeautyParamsParse::*`, `ParamAdjust::adjust*` and dlopens `/odm/lib64/lib2DSlender.so` directly. The
`libAlgoInterface.so` `getFbAlgoLibFlag`/`faceBeautyLoadlib`/`getAlgoMetaData(face_beauty_meta_t)` symbols
are a SEPARATE (APS/capture) engine path — and on OOS they dlopen libs that **don't even exist in the
dump** (`libarcsoft_beautyshot.so`/`libVDEyeEnhance.so`/`libFaceBeautyCap.so` absent in dump300 odm/lib64),
so that path is not the live preview crash path. **This is why the doc's frida run with 242
`libAlgoInterface` hooks saw nothing fire — it hooked the wrong lib.** Re-aim hooks at
`libApsFaceBeautyPreviewProductJni.so`.

### Gate `getFbAlgoLibFlag(char* path, int* outFlag)` — decoded (both libs, identical logic)
- libAlgoInterface: `_Z16getFbAlgoLibFlagPcPi` @ file `0xfa368c`; Ref variant `_Z19getFbAlgoLibFlagRefPcPi11log_level_t` @ `0x1071b2c`.
- preview JNI: `_Z16getFbAlgoLibFlagPcPi` @ file `0x6ccc8`.
- Body: `json_object_from_file(path)` → if NULL: log `"json file open parse failed!!!"`, **return -1** (outFlag
  untouched). Else `json_object_object_get_ex(obj, "facebeauty_algo_lib_flag", &v)` → if missing: log
  `"json_object 'facebeauty_algo_lib_flag' is null !!!"`, **return -1**. Else `*outFlag =
  json_object_get_int(v)`; `json_object_put`; **return 0**. Log tag `facebeauty_debug`, marker
  `[getFbAlgoLibFlag] E`/`X` (== the OOS golden log line). Source: `fbJsonParse.cpp` (v1) / preview JNI.
- **INPUT READ = a single int field `facebeauty_algo_lib_flag` from a JSON file.** No prop, no
  `__system_property_get`, no init-global, no dir-count. Path is the caller's arg0.

### Caller `faceBeautyLoadlib()` — the build-vs-skip branch (preview JNI @ `0x4c094`)
- Builds path via snprintf `"%s%s"` of `"/odm"` + `"/etc/camera/fb_default"` = **`/odm/etc/camera/fb_default`**.
- **Default flag = 7** (`mov w8,#0x7; str w8,[sp,#0x4]`) set BEFORE the gate. The gate OVERWRITES it only on
  success. ⇒ a MISSING/unparseable file leaves flag=7 (all bits set → lib STILL loads). Skip happens only
  if the file is PRESENT, PARSES, and yields a flag with the gating bit clear.
- Branch (preview JNI): `ldrb w8,[sp,#0x4]; tbnz w8,#0x2 → load` else **return 0 with NO lib loaded**. i.e.
  **bit 2 (value & 4)** gates `android_load_sphal_library("/odm/lib64/lib2DSlender.so")` + dlsym
  `Slender2D_init/process/destory/getZoomScale/Reset` into the global fn-ptr table.
- libAlgoInterface `faceBeautyLoadlib` @ `0xf612bc` (called from `faceBeautyRegisterV0`): same default-7 +
  `tbnz #0/#1/#2` — bit0→`dlopen /odm/lib64/libarcsoft_beautyshot.so` (+VENUS_IMAGE_* dlsyms),
  bit1→`libVDEyeEnhance.so`, bit2→`libFaceBeautyCap.so`. (All three absent in dump300 → dead on OOS too.)

### THE OOS↔LOS DIFF — gate input is BYTE-IDENTICAL → gate is NOT the root
`/odm/etc/camera/fb_default` (96801 B, md5 **`b115655a4598218d9bf019ec9835aee8`**) is byte-identical across:
OOS dump300, LOS proprietary blob (`vendor/oneplus/infiniti/proprietary/odm/etc/camera/fb_default`), and
the LOS built image (`out/.../infiniti/odm/etc/camera/fb_default`). All three contain
**`"facebeauty_algo_lib_flag": 4`** (bit 2 set) ⇒ the gate returns 0 + flag=4 on BOTH ⇒ both select
"load lib2DSlender". lib2DSlender.so is byte-identical (md5 `6b77ca1c...`) and present in `/odm/lib64`
(default sphal path) on both. The Product JNI lib is the SAME source on LOS (BuildID identical, only
size/md5 differ from strip/symbols). ⇒ **The gate, its config input, the selected bit, and the loaded
blob are ALL correct & matching on LOS. The all-zero `FaceBeautyParams` is NOT caused by the gate
selecting skip.**

### Where the all-zero actually originates (relocated root)
The param BUILD is `BeautyParamsParse::getFacebeautyParam` → `convertBeautyParam(file_data_t*,
FaceBeautyParamSet_t*)` → `getAdjustParams(json_object*, char*)` (reads JSON `commonMode`→`default_params`
per feature; log `"%s params not exist, use commonMode params"`) → `ParamAdjustFactory::adjustParameters(
FaceBeautyParam*, FaceInfoAnalyse*, FaceBeautyConfigParam_t*)` → per-feature `ParamAdjust::adjust*`. lib
init runs ASYNC on `loadFBInitThread` (`Slender2D_init`, `FBInitFlag`, logs `FBinit success` /
`FBInitFlag is %d, FBinit failed!` / `wait for init finish!`). The all-zero struct => either the
param-build never ran for the crashing frames (face-gated producer not invoked) or `setPreviewParams` /
`process` raced ahead of `loadFBInitThread` completing (`FBinit failed`/init-not-finished) so the apply
path runs against the un-filled struct. Both are runtime-state, not a static config gate.

### Decisive next probe (re-aimed)
Hook **`libApsFaceBeautyPreviewProductJni.so`** (NOT libAlgoInterface), LOS vs OOS, on a real face:
`getFbAlgoLibFlag` (confirm returns 0, flag=4), `faceBeautyLoadlib` (confirm bit2 → sphal load succeeds),
`Slender2D_init` (confirm `FBinit success` vs `failed`), `BeautyParamsParse::getFacebeautyParam` /
`getAdjustParams` / `ParamAdjustFactory::adjustParameters` (confirm they FIRE and write non-zero), and
the `FBInitFlag`/`wait for init finish` log. The skip is in the build/init sequencing inside THIS lib —
candidate (3) "init handshake" is now PRIME; candidate (1) "gate" is REJECTED by the byte-identical config.

### Proposed R8 (revised)
Not a config/prop ship (config already correct & identical). Root is the build/init path in the preview
JNI lib. R8 = "the preview face-beauty param-build (`getFacebeautyParam`/`adjustParameters`) must run with
`FBinit` completed before the `Slender2D_process` apply path consumes `FaceBeautyParams`." Owner: F1/F4
(lib-load/init sequencing) — verify `loadFBInitThread`/`android_load_sphal_library` succeeds on LOS and
that `process` waits for `FBInitFlag`. NOT a lib2DSlender null-guard (masks, not fixes).

---

## R8 UPWARD TRACE — the variant DIVERGENCE: LOS loads the wrong (in-APK) preview lib (2026-06-24)

> Method: static disassembly + ELF/dex on `aosp-builder` (llvm-objdump/llvm-readelf r574158; baksmali.jar;
> dexdump). Tracing UPWARD from R7's relocated root (the all-zero `FaceBeautyParams` originates in the
> preview JNI lib, not the gate). **Result: it is a code/packaging DIVERGENCE, not a race present in both.**
> LOS loads a DIFFERENT, simpler preview lib than OOS, and that lib lacks the init-state guard OOS uses to
> avoid running the lib2DSlender apply path before its params/init are ready.

### THE TWO LIBS ARE DIFFERENT BINARIES (not strip-variants)
| | OOS-loaded `libApsFaceBeautyPreviewProductJni.so` | LOS-loaded in-APK `libApsFaceBeautyPreviewJni.so` |
|---|---|---|
| BuildID | `17efbc5b0256e9702e2c75abaf1e9854038de276` | `f2454a3410ea6c7a0e921989494e23e31100496d` |
| size | 680016 (dump300) / 781505 (LOS img copy) | 505536 |
| NDK ident | `r25b` | `r22` |
| dyn FUNC syms | 1207 | 792 |
| async init thread `loadFBInitThread` | **YES** (`0x49a7c`, 1088B; spawned via `pthread_create` @ `0x4a780`) | **ABSENT** (0 `pthread_create` in whole lib) |
| `*_use_lib` dual-engine variants (`faceBeautyPreview_{process,init,…}_use_lib`) | **YES** (libFaceBeautyJni fallback engine) | **ABSENT** |
| `FBInitFlag` global + "FBinit success/failed/wait for init finish" strings | **YES** | **ABSENT** (only shared string: `arc handle uninit finish`) |
| loads `/odm/lib64/lib2DSlender.so` (sphal) + `Slender2D_*` dlsyms | YES | YES (same crash blob) |
| param BUILD on apply path (`updateOriginParam`→`adjustParameters`→`ProcessFactory::process`→Slender2D_process) | YES | YES (structurally identical; `adjustParameters`/`getFacebeautyParam` differ only in reg-alloc) |

The OOS ProductJni that LOS *builds* (`out/.../system_ext/lib64/…ProductJni.so`) has `.text` md5 `bf0b7ed3…`
**byte-identical** to the OOS dump300 ProductJni → same source compile. It is just never loaded (see below).

### Q1 — The apply-vs-init guard: OOS HAS it, LOS in-APK does NOT (decisive)
The guard is in the **JNI process wrapper**, `Java_..._OplusFaceBeautyPreview_process`, NOT in native
`faceBeautyPreview_process`.

**OOS (`0x4b020`):** routes the apply path on `FBInitFlag` (global `0xc3254`, written by the async init):
```
4b020 adrp x8, 0xc3000
4b024 ldr  w8, [x8, #0x254]   ; FBInitFlag
4b028 cbz  w8, 0x4b044        ; init NOT done → take fallback
4b030 bl   faceBeautyPreview_process          ; init DONE → lib2DSlender (Slender2D) apply path
4b034 b    0x4b04c
4b044 bl   faceBeautyPreview_process_use_lib   ; pre-init → DIFFERENT engine (libFaceBeautyJni), never touches lib2DSlender adjustParam
```
`FBInitFlag` is written 0→1 by the async `loadFBInitThread` (`str w,[…,#0x254]` @ `0x49d24/0x49d44/0x4a020/
0x4a4c4/0x4a8dc/0x4b7e8`) after it sets up its own EGL context (`eglMakeCurrent`) and calls
`faceBeautyPreview_init`/`_use_lib` (which run `faceBeautyLoadlib`→sphal `lib2DSlender`→`Slender2D_init`).
The "FBInitFlag is %d, wait for init finish!" log (`0x4b14c`) is emitted in this same wrapper. ⇒ **OOS
structurally cannot run the lib2DSlender `adjustParam` apply path until its async init has completed**; until
then it uses the `_use_lib` engine.

**LOS in-APK (`0x337a4`):** NO guard. After three JNI string conversions it does, unconditionally:
```
33848 bl faceBeautyPreview_process   ; → ProcessFactory::process (0x36b34: br [[x0]+0x10] = Slender2D_process)
```
Confirmed: 0 init-flag reads / 0 cbz-cbnz guards in the LOS JNI process wrapper; no `FBInitFlag` global; no
`_use_lib` alternate. **LOS calls the lib2DSlender apply path on every frame from frame 0, with no
init-completion gate and no fallback engine.** And LOS `Java_..._init` (`0x334ac`) inits **synchronously**
(one direct `bl faceBeautyPreview_init`, no thread), so the lib's own design assumes init is finished before
process — it has no in-lib protection if that assumption is violated.

### Q2 — Does the param-BUILD run on the apply path? YES in BOTH (so "missing build" is NOT the root)
In both libs the per-frame build is in-line in native `faceBeautyPreview_process`:
`ParamAdjustFactory::updateOriginParam` → `ParamAdjustFactory::adjustParameters` → `ProcessFactory::process`
→ `Slender2D_process` (OOS @ `0x4ebf0/0x4ec08/0x4ef04`; LOS @ `0x35e70/0x35e88/0x360ec`). The file-default
build (`getParamFromFile`→`BeautyParamsParse::getFacebeautyParam`→`printBeautyParam`) is identical and runs
at init in both. ⇒ R7's "the build never runs on the apply path" is **rejected for the in-APK lib too**; the
build call is present. The all-zero therefore comes from the apply path running while the engine/init/EGL
state behind `ProcessFactory`/`Slender2D` is not yet ready — exactly the window OOS's `FBInitFlag`+`_use_lib`
guard covers and the in-APK lib does not.

### Q3 — VARIANT DIFF: they are DIVERGENT source, and LOS loads the wrong one
Not the same source. The OOS lib is the full async/dual-engine "Product" build (r25b); the in-APK lib is an
older, smaller, synchronous single-engine build (r22) shipped inside `OplusCamera.apk`
(`lib/arm64-v8a/libApsFaceBeautyPreviewJni.so`). The LOS image DOES contain the byte-identical Product lib
at `/system_ext/lib64/libApsFaceBeautyPreviewProductJni.so` — but it is never loaded.

### Q4 — One level up (Java/SDK): the loadLibrary path-probe bug picks the in-APK lib
`com.oplus.camera.facebeauty.OplusFaceBeautyPreview.<clinit>` (in `com.oplus.camera.unit.sdk.jar`, NOT the
APK — APK only type-references it) selects the lib by **file-existence probe**:
```
if isFileExist("/product/lib64/libApsFaceBeautyPreviewProductJni.so") → loadLibrary("ApsFaceBeautyPreviewProductJni")
elif isFileExist("/system_ext/lib64/libApsFaceBeautyPreviewJni.qti.so") → loadLibrary("ApsFaceBeautyPreviewJni.qti")   // (.trustonic on non-qcom)
else → loadLibrary("ApsFaceBeautyPreviewJni")   // the in-APK plain lib
```
The probe checks **`/product/lib64/`**, but LOS installs the Product lib in **`/system_ext/lib64/`** (and no
`.qti`/`.trustonic` exist) ⇒ all probes miss ⇒ fall-through to `loadLibrary("ApsFaceBeautyPreviewJni")` =
the in-APK lib. On OOS the Product lib *is* at `/product/lib64/` (`/my_product` mounts as `/product`) ⇒ OOS
loads the Product lib. **This path-namespace mismatch (`/product` on OOS vs `/system_ext` on LOS) is the
upstream cause that flips the variant.** The APK ordering layer (`qb/f`) gates native `process` only on a
per-frame `FrameInfo.mbApsAlgoInitFinish` boolean (set by upstream producer `wc/l`), and the helper
(`OplusFaceBeautyPreviewHelper`) is a pass-through with no init-wait — so all the in-lib init protection that
exists on OOS (FBInitFlag + `_use_lib`) is simply absent on the loaded LOS lib, and the only remaining
guard is that one upstream boolean.

### EXACT UPWARD CAUSAL CHAIN
1. SITE: `lib2DSlender.so adjustParam+836` derefs an all-zero `FaceBeautyParams` (byte-identical blob; R7).
2. CONSUMER: `Slender2D_process` ← `ProcessFactory::process` ← native `faceBeautyPreview_process`, reached
   from the JNI `Java_..._process` wrapper. The wrapper is what decides whether the lib2DSlender apply path
   may run at all.
3. DIVERGENCE: the wrapper that runs on LOS belongs to the **in-APK `libApsFaceBeautyPreviewJni.so`**, which
   has **no `FBInitFlag` guard and no `_use_lib` pre-init fallback** — it calls the lib2DSlender apply path
   unconditionally. The OOS wrapper (Product lib) gates on `FBInitFlag` and diverts to `_use_lib` until the
   async `loadFBInitThread` (EGL + `Slender2D_init`) completes.
4. WHY THE WRONG LIB: `OplusFaceBeautyPreview.<clinit>` probes `/product/lib64/…ProductJni.so`; LOS puts that
   lib in `/system_ext/lib64/`, so the probe misses and the loader falls through to the in-APK lib. OOS has
   it under `/product/lib64` (from `/my_product`) and loads the guarded Product lib.
5. ROOT CLASS: **E1/E4 lib-load / partition-path variant**, NOT a config gate (R7: `fb_default` flag=4
   byte-identical) and NOT a true cross-build race. It is a divergence: OOS and LOS run different preview
   libs because of where the Product lib is installed vs where the SDK looks for it.

### SHARPENED R8 (the precise fix)
**Make LOS load the guarded Product preview lib instead of the in-APK fallback.** Either:
 (a) install/symlink `libApsFaceBeautyPreviewProductJni.so` at the probed path
     **`/product/lib64/libApsFaceBeautyPreviewProductJni.so`** (it already builds, byte-identical to OOS, at
     `/system_ext/lib64/`) so `OplusFaceBeautyPreview.<clinit>`'s first probe hits and `loadLibrary(
     "ApsFaceBeautyPreviewProductJni")` resolves; OR
 (b) if `/product/lib64` placement is not viable on LOS's partition layout, provide a `.qti.so` at the
     `/system_ext/lib64/libApsFaceBeautyPreviewJni.qti.so` probe path, or patch the `<clinit>` probe to look
     in `/system_ext/lib64/` for the Product lib.
Owner: **F1/F4** (lib-load / partition-path facilitation), grounds S9. Expected effect: LOS then runs the
async-init + `FBInitFlag`/`_use_lib`-guarded path (same as the OOS golden: `FBinit success` →
`Slender2D_init vp_12.0.0.40` → guarded apply), so the lib2DSlender apply path no longer runs against an
un-built/un-inited `FaceBeautyParams`. **NOT** a lib2DSlender null-guard (masks, not fixes).
Verification: confirm on-device that `OplusCamera` maps `…ProductJni.so` (not the in-APK `…Jni.so`) and that
`FBinit success` / `wait for init finish` log lines appear (they are only present in the Product lib).

### NEGATIVE / TOOL NOTES (no real failures)
- Several `strings|grep` / existence-probe commands returned exit 1 on **zero matches** — these are the
  load-bearing negatives (LOS in-APK has NO FBInit strings; `/product/lib64/…ProductJni.so` does NOT exist
  on the LOS build). Not tool failures.
- The dump300 ProductJni (680016B) and LOS-image ProductJni (781505B) differ in file size but have
  byte-identical `.text`+`.rodata` (offsets/sizes match; `.text` md5 `bf0b7ed3…`) — same code, the size
  delta is non-code (symbol/debug) sections; the BuildID matches.
