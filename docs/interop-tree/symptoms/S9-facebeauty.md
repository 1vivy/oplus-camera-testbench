<!-- Parent: ../INDEX.md -->
---
id: S9
symptom: "Face-retouch (face-beauty preview) SIGSEGV-null — lib2DSlender adjustParam+836 derefs an all-zero FaceBeautyParams when a face is detected"
path_nodes: []   # NEW pipeline (face-beauty preview), distinct from APS/libAlgoProcess; C/D/E nodes TBD — see facebeauty-preview-algolibflag-RE.md
decisive_probe: "frida on libApsFaceBeautyPreviewJni.so (the in-APK lib actually loaded — NOT libAlgoInterface): getFacebeautyParam/adjustParameters + Slender2D_init/FBInitFlag — does param-build+FBinit complete before the apply path consumes FaceBeautyParams?"
characterization: CHARACTERIZED      # on-device verified: FaceBeautyParams arrives all-zero at lib2DSlender adjustParam
conviction: PINNED                   # ROOT = lib-variant/partition-path: OCS-SDK <clinit> probes /product/lib64/...ProductJni.so (ABSENT on LOS — built to /system_ext/lib64) → loads in-APK ...Jni.so which OMITS OOS's FBInit guard → apply runs pre-init → all-zero FaceBeautyParams. Fix = place ProductJni at the probed path.
updated: 2026-06-24
---

# S9 — Face-retouch preview crash (all-zero FaceBeautyParams)

**SITE (blob-identical, NOT the root):** crash at `/odm/lib64/lib2DSlender.so`
`adjustParam(BsData*, op_param_data_t*, FaceBeautyParams*, FuncEnableFlag*)+836` — SIGSEGV
`SEGV_MAPERR` read @0x0 on thread **PreviewGLThread**, when face-retouch is ON and **a face is
detected**. `lib2DSlender.so` is **byte-identical OOS↔LOS** (BuildId `8470e82c5ae6240fd0f86724844a3cd1133e8b49`,
dump300 md5 `6b77ca1c2f8b8cc0e0d96911e8da47bf`) and OOS runs the same path crash-free → per the trunk
axiom (`../SCHEMA.md`) this is the crash SITE, never the root.

**PIPELINE (face-beauty preview — a NEW path, separate from APS/libAlgoProcess/R1):**
`OplusCamera (Java OplusFaceBeautyPreview/Helper.setPreviewParams)` → `libApsFaceBeautyPreviewJni.so`
(OOS: `libApsFaceBeautyPreviewProductJni.so` from `/product`) → `libFaceBeautyJni.so` →
`lib2DSlender.so` (`Slender2D_process` → `VideoBeautyEditionOne::process` → `adjustParam`). The
per-face param build lives in `libAlgoInterface.so`.

**PATH (crash-site → root):**
- **SITE** `lib2DSlender adjustParam+836` derefs a sub-field of `FaceBeautyParams*` (arg2) that is null
  because the **whole struct is delivered all-zero** (frida-verified: 1492 frames on a real face, every
  one `FaceBeautyParams allZero=true`, through the crash; `op_param_data_t` and the upstream
  `previewProcessParam_t` carry data — only the beauty-params struct is unbuilt).
- **PROXIMATE (gate)** `getFbAlgoLibFlagRef(char*, int*, log_level_t)` (`libAlgoInterface.so`) — the
  algo-lib selector that decides whether the OEM param-BUILD chain runs. On a face, the build chain
  (`libAlgoInterface` `android::getAlgoMetaData(face_beauty_meta_t*, AlgoProcessData*)`,
  `updateParamByRatio`, `parseCpuParams3rd`, `adjustMakeUp`) **never fires** on LOS (frida: 242 hooks
  armed, 0 fires through the crash) → the apply path runs on a zeroed struct.
- **ROOT (facilitation contract — the input the gate reads)** the config/asset/prop/vendor-tag that
  makes `getFbAlgoLibFlag` select the build branch is the suspected divergence; **ranked candidates** in
  `../../re-notes/facebeauty-preview-algolibflag-RE.md`. This is the **R1 pattern** (a per-frame
  native build-step that must fire but doesn't on LOS, leaving a consumer with un-populated state →
  crash) and the **R6 structural twin** (un-published input → consumer derefs null → SIGSEGV).

**STAR REF — OOS runs this clean:** `reference/_golden-oos-V16.1.0/campaign/beauty/` has **zero**
`SIGSEGV`. OOS completes the init handshake the LOS path is missing the *output* of:
`[getFbAlgoLibFlag] E` (fires) → `Slender2D_init FACEBEAUTY VERSION vp_12.0.0.40` (`numOfFileInDir num:104`)
→ `faceBeautyPreview_init featureFlag:4194472` → `faceBeautyPreview_init_use_lib handel=0x…` → `FBinit
success`, and publishes `com.oplus.facebeauty.level 0x81140123`.

**Decisive probe → verdict:** frida-hook `getFbAlgoLibFlagRef` (return value/branch) +
`android::getAlgoMetaData(face_beauty_meta_t*,AlgoProcessData*)` (fires? config non-zero?) on a detected
face, **LOS vs OOS** (R1-style — the return value is NOT emitted at default logmask, so static golden
grep cannot give it). If the gate returns the skip-build branch / the producer never fires on LOS but
does on OOS → root = the facilitation input the gate reads (config/asset/lib-variant/tag). The
`libApsFaceBeautyPreviewProductJni`(OOS,/product) vs `libApsFaceBeautyPreviewJni`(LOS,in-APK) **variant
divergence** is a parallel candidate (E1/E4-class lib-load contract).

**STATUS:** characterization CHARACTERIZED / conviction SUPPORTED — on-device verified that the
beauty-meta build path is not invoked and `FaceBeautyParams` is all-zero on a real face (crash
reproduced ×6+ tombstones; `reference/campaign/_los-v21-notes/facebeauty-crash-finding.md`). Root
PINNING needs the one OOS↔LOS gate/producer frida diff above. Candidate root → **R8** (propose in
`../REQUIREMENTS.md` once the gate's read-input is RE-confirmed). DO NOT add a null-guard in
lib2DSlender (that would mask, not fix — the OEM build path must run).

**STATIC-RE CORRECTION (2026-06-24, R7 appendix in `../../re-notes/facebeauty-preview-algolibflag-RE.md`):**
The **gate is REJECTED as root.** `getFbAlgoLibFlag` reads `"facebeauty_algo_lib_flag"` (=**4**, bit2 →
load lib2DSlender) from `/odm/etc/camera/fb_default`, which is **byte-identical OOS↔LOS** (md5
`b115655a4598218d9bf019ec9835aee8`); lib2DSlender + the gate code are identical too. Also corrected: the
beauty build code is **not** in `libAlgoInterface.so` (the earlier 242-hook frida run hooked the wrong
lib and saw 0 fires for that reason) — it lives in the **preview JNI lib** (`libApsFaceBeautyPreview*Jni.so`),
which carries its own `getFbAlgoLibFlag`/`BeautyParamsParse::getFacebeautyParam→adjustParameters` and
dlopens lib2DSlender directly. **Relocated root:** all-zero `FaceBeautyParams` ⇒ the apply path
(`Slender2D_process`) runs **before** the async param-build + `Slender2D_init` (`loadFBInitThread`, gated
by `FBInitFlag`; logs `FBinit success`/`failed`/`wait for init finish!`) completes — a **runtime
sequencing/race inside the preview-JNI lib**, not a static config gate. **Revised R8** = "the preview
face-beauty param-build + `FBinit` must complete before `Slender2D_process` consumes `FaceBeautyParams`"
(owner F1/F4, lib-load/init sequencing — NOT a prop/file ship; config already correct). **Open
parallel:** OOS ships `libApsFaceBeautyPreviewProductJni.so` from `/product`; LOS loads in-APK
`libApsFaceBeautyPreviewJni.so` — confirm same code/BuildID or the variant is the race's cause.
**Corrected decisive probe:** frida on `libApsFaceBeautyPreviewJni.so` (the loaded lib) — `getFacebeautyParam`/
`adjustParameters` (fire? write non-zero?) + `Slender2D_init`/`FBInitFlag` (is `FBinit success` reached
before apply?).

**ROOT PINNED (2026-06-24 — runtime trace + R8 upward static RE + on-device verify):** a **lib-variant /
partition-path divergence**, NOT a race and NOT the gate. (1) Runtime (frida, solo): the build SUCCEEDS —
`ParamAdjustFactory::adjustParameters` outputs a **populated** `FaceBeautyParam` (config + face present),
yet `lib2DSlender adjustParam` gets an **all-zero `FaceBeautyParams`**. (2) Static RE (R8 appendix): LOS
loads the **in-APK `libApsFaceBeautyPreviewJni.so`** (BuildID `f2454a34`, NDK r22) which calls
`faceBeautyPreview_process` **unconditionally — no `FBInitFlag` guard, no `_use_lib` fallback** (it lacks
the async `loadFBInitThread`/`Slender2D_init` machinery entirely); OOS loads
`libApsFaceBeautyPreviewProductJni.so` (BuildID `17efbc5b`, NDK r25b) which **diverts to a different engine
until `FBInitFlag` is set**, so OOS never runs the lib2DSlender apply before init. (3) WHY the wrong lib:
`OplusFaceBeautyPreview.<clinit>` (in `com.oplus.camera.unit.sdk.jar`) selects the lib by a **file-existence
probe of `/product/lib64/libApsFaceBeautyPreviewProductJni.so`** — **on-device-verified ABSENT on LOS** (the
LOS build installs that lib to **`/system_ext/lib64/`** instead; its `.text` is byte-identical to OOS, just
never loaded) → probe misses → fall-through `loadLibrary("ApsFaceBeautyPreviewJni")` = the unguarded in-APK
lib. ROOT CLASS = **E1/E4 lib-load / partition-path variant** (owner F1/F4).
**FIX (R8, final):** make LOS load the guarded Product lib — install/symlink the already-built
`libApsFaceBeautyPreviewProductJni.so` at the probed `/product/lib64/` path (or add `/system_ext/lib64` to
the `<clinit>` probe). Verify: `OplusCamera` maps `…ProductJni.so` and `FBinit success`/`wait for init
finish` appear (strings exist only in the Product lib). NOT a lib2DSlender null-guard. Detail:
`../../re-notes/facebeauty-preview-algolibflag-RE.md` "## R8 UPWARD TRACE".
