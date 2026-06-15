<!-- STATUS: MIXED — inference-surgery applied 2026-06-14 (doc-50 method). Verified body =
     on-artifact OBSERVATIONS only (blob reads, Ghidra offsets, on-device probes, byte-identity
     checks, log lines). All root ATTRIBUTIONS, retirement-path recommendations, "leading mechanism"
     hypotheses, and forward probes moved to "Inferences & Open" below.
     Guard: a measured failure SITE is never a verified ROOT. -->

# rearch/42 — Retiring libapsfixup: the OOS way (standing plan)

Date: 2026-06-10. A standing plan for replacing the `libapsfixup` binary interposer with handling at
the layers OOS uses, so the shim can shrink and eventually drop. Maps each shimmed family → real root
→ target layer → concrete file/HAL → RE anchor → effort/risk → verification. Supersedes nothing;
companion to rearch/14,16,19,20,23,28,33 (the gralloc/geometry background) and the in-tree
`vendor/oplus/camera-sm8850/apsfixup/{apsfixup.cpp,docs/PORTING.md}`.

---

## 0. Framing — "like OOS" means presenting the same contract, not catching the same crash

OOS does not "handle" these failures — they never occur, because the OnePlus/OOS gralloc + mapper +
camera-provider stack presents the OPlus camera blobs (`libAlgoProcess.so` BuildID
`82fe443b…`, `libAlgoInterface.so` BuildID `ce6e40ca…`, ArcSoft libs — all byte-identical to OOS)
exactly the buffer/metadata/vendor-tag contract they were built against. On LOS A16 three contracts
diverge, the blobs read garbage/null, and `libapsfixup` patches the symptoms in-process.

"Do it like OOS" = make the **LOS** stack present those three contracts. That moves the work OUT of a
camera-only binary interposer and INTO the layers that own each contract.

---

## 1. The shim inventory (what we're retiring)

`libapsfixup.so` is `patchelf --add-needed`'d onto `libAlgoProcess.so` and installs GOT/PLT redirects
inside the blobs. Families (offsets are runtime/file, image-base 0; subtract 0x100000 from Ghidra
listing addrs):

| Family | Hook (GOT/PLT) | Symbol | Root contract |
|---|---|---|---|
| **P010 layout** | `P010_GOT_OFF 0x689ba8` (libAlgoProcess) | `APSFormatConverterNeon::p010LSB2MSBNeon` (vaddr 0x4fc094) | gralloc/mapper |
| **ARC chroma repair** | `dlsym 0x1bb67c8` (libAlgoInterface) → `wrap_arc` | `ARC_Turbo_RAW_Process` | gralloc/mapper |
| **Super-night repair** | dlsym → `wrap_arc_tfrsn` | `ARC_TFRSN_Process` | gralloc/mapper |
| **BasicTone (Family A, inert skeleton)** | `dlsym 0x686c88` (libAlgoProcess) | `OGLBasicToneProcess` (in libBasicTonePhoto.so @0x53984) | gralloc/mapper (AHardwareBuffer_lock) |
| **copyMetadata UAF** | `COPYMETA_GOT_OFF 0x686ee8` (libAlgoProcess) | `android::APSMetadata::copyMetadata` (body 0x292960) | metadata lifetime |
| **strlen null-guard** | `STRLEN_GOT_OFF 0x1bb6888` (libAlgoInterface) | `strlen@LIBC` (only the TurboRaw path matters) | vendor-tag publishing |

ArcSoft output-struct anchor (used by the chroma/super-night repairs): `+0x40` luma / `+0x48` chroma
/ `+0x60` pitch[0] / `+0x64` pitch[1] — HIGH confidence (independently re-derived by koaaN/OP15InfinityX).

These collapse into **THREE** contract gaps. ~⅔ of the shim (the first four rows) is ONE root.

---

## VERIFIED — on-artifact observations

### 2. Family I — Gralloc / mapper (P010 · ARC · super-night · BasicTone)

#### Byte-identity and path observations (measured)

- **`IMapper@4.0::getService(getStub=false)` returns NULL on BOTH stock OOS and LOS.** Both run the
  identical Gralloc5/AIMapper in-process path (`mapper.qti.so` via `AIMapper_loadIMapper`, no
  getService, no hwservicemanager — stock has `hwservicemanager.disabled=true` too, user-verified on
  a live CPH2749). (Verified on-device.)
- **rearch/14 verdict:** same Gralloc5/AIMapper, **byte-identical** `mapper.qti.so` + allocator,
  same 36 MB dmabuf — yet OOS returns **contiguous** P010 (`Cb−Y = stride×height`), LOS returns
  **non-contiguous**. The divergence is **consumer-side**: `libAlgoProcess`'s `lockPlanes` path
  computes a different `Cb` offset than OOS's lock did, on the **same** buffer (allocation is
  identical). rearch/14 found **NO clean facilitation lever** — no V1 to provide, no allocation
  flag, no UBWC toggle, and `graphics.common` V5/V7 relink was tried and refuted (non-causal).
  (Measured / RE'd.)
- **The whole chain is zero-OEM on OOS (Ghidra scan):** `libui.so` 0/0, `libnativewindow.so` 0/0,
  `mapper.qti.so` / `gralloc.default.so` / `libgrallocutils.so` 0/0 oplus syms/strings. Unlike
  libgui (full of `OplusEdr*`), there is **no OnePlus gralloc fork**. (Verified via `strings -a` on
  blobs this session.)
- **OOS `libui.so` carries the AOSP error `"Unexpected error %d from valid getStandardMetadata call"`**
  — the fallback that fires when `getStandardMetadata(PLANE_LAYOUTS)` fails. (String-found in blob.)
- **`vendor.gralloc.enable_snapalloc=1` on the LIVE LOS build** (verified on-device, works despite
  the freeze) + `snapalloc-impl.so` loaded by the allocator service → LOS uses snapalloc, same as
  OOS. All 8 alignment JSONs + the enable-script (md5 b8d7c88f) + CamX format-util + mapper.qti.so
  byte-identical. The 32-row align (1440→1472) is BY DESIGN (`camera_alignments.json`
  `scanline_align:64`). (Probe A2/C measured on-device.)
- **`APSGrallocUtils::getPlaneLayout` reads PLANE_LAYOUTS through the SAME in-process v5 AIMapper
  libui uses (`AIMapper_loadIMapper`), same `Cb = lumaBase + offsetInBytes` formula, NO height
  recompute.** So the blob reads the SAME aligned offset libui reports. (Probe D, RE'd.)
- **`getStub`-flip @0x21e5b4:** the read is via the v5 AIMapper, not the V4 getService handle
  (which is NULL on BOTH OOS+LOS). (Probe D, RE'd — confirmed REFUTED as non-causal.)
- **CORRECTED (byte-verified + RE) — the two `getStub` call sites:**
  - `0x21e5b4` `APSGrallocUtils::initialize` — **has** a Gralloc5/AIMapper fallback ("using V5");
    flipping its `getStub` changes nothing → **REFUTED, deliberately left UNPATCHED**.
  - `0x603a88` `hwJpegRegisterImpl` — HW-JPEG / turbo-RAW-HDR codec registration. It has **no V5
    fallback** → NULL mapper → ArcSoft `ARC_Turbo_HDR_Process` writes an unmapped buffer →
    **FATAL SIGSEGV**. This caller **is patched and SHIPPED**: `mov w1,wzr`→`mov w1,#1`
    (bytes `21008052`), byte-verified in the committed fork blob
    `vendor/oneplus/infiniti/proprietary/odm/lib64/libAlgoProcess.so` (stock md5 `15a7b9c0` →
    ours `c4c4630a`) + the built image. (Byte-verified this session.)
  - **`hwJpegRegisterImpl` is invoked indirectly (callback via `hwJpegRegister`, zero direct `bl`)**,
    so whether the flip is load-bearing for the main capture path or only HW-JPEG/turbo-RAW-HDR
    needs a runtime trace, not static analysis. (Static RE finding.)
- **Permissive defeats access-denial:** the super-night/BasicTone P010 OOB occurred **under
  permissive** (v16/v17 capture-working era), where the camera process is **not** denied the
  allocator — yet the layout is still non-contiguous. (Per the standing directive, camera repros run
  `setenforce 0`; observed on-device.)
- **`mapper.qti.so` DT_NEEDED `libgrallocutils.so`** (+`libgralloccore.so`) — the P010
  plane-layout decode runs in every buffer-locking process including `com.oplus.camera`.
  `libgrallocutils.so` carries **31–33 `CamxFormatUtil`/`camxexternal` strings** including
  `"Failed to link CamxFormatUtil…"` / `"Unable to get IS_UBWC from snap"`. (Verified via `strings -a`
  on the blob this session.) Both `libcamxexternalformatutils.so` **and** `camera_alignments.json`
  are present in the LOS build (`out/.../vendor/{lib64,etc/display}/`) yet are **absent from every
  app-visible `public.libraries.txt`** (ours + OOS). (Grep-verified.)

#### NET on-artifact exhaustive verdict (Family I)
There is **no OOS-vs-LOS gralloc allocation/path divergence**: the P010 buffer is allocated
identically (snapalloc, 32-row aligned), and every reader (libui, the blob's v5 AIMapper) reads the
same aligned `offsetInBytes`. So apsfixup's P010/chroma repair is **NOT** compensating for a
measurable OOS↔LOS contiguity difference at the allocation/mapping layer. The `align_up(luma,4GB)`
garbage is the **FAILURE signature** of `getPlaneLayout` returning −1 (per-call `getStandardMetadata`
error / mapper unbound). The last runtime-gated thread (whether the blob's `getStandardMetadata(PLANE_LAYOUTS)`
for `com.oplus.camera` on LOS actually fails) is RUNTIME-GATED — the v19 freeze wedges
preview+capture so the P010 lock never fires; `tools/frida/trace_p010_planes.js` is staged to
classify it on an unfrozen build. (Status as of 2026-06-12.)

### 3. Family II — copyMetadata UAF (metadata lifetime)

- The OEM deferred quick-jpeg pipeline runs slower than the per-frame metadata/ImageReader window.
  The shim interposes `copyMetadata` (GOT `0x686ee8`) and returns null on an unmapped/insane source
  (every caller already handles the empty/null return). (From shim source / apsfixup.cpp.)
- Every caller already handles the empty/null return. (Code-read.)

### 4. Family III — strlen null → vendor-tag publishing

- `TurboRaw::parseTurboHdrInfo` cbz-skips its store because the **OEM IPE TurboHDR vendor metadata
  tag** (~`0x4d78`) is never published into per-frame result metadata on LOS → `field_0x4d88` stays
  null → `setProcessOtherParams` calls `strlen(null)` → SIGSEGV. The shim null-guards `strlen`
  (GOT `0x1bb6888`). (From shim source / RE.)
- This is the **same family** as the long-documented `hdr_detected rc=-2` / `stats_control`
  metadata-starvation root (see memory `root-aec-stats-hdr-detected-missing`): an OEM vendor tag the
  provider must publish but LOS doesn't. (Cross-reference observation.)

### 5. Anchors & references

- Blobs: `libAlgoProcess.so` BuildID `82fe443b408f8ed027558b0d4ffb1500`; `libAlgoInterface.so`
  BuildID `ce6e40ca2e987fcc6da26930d84b0b2f`. Offsets: image-base 0 (Ghidra base 0x100000 → subtract).
- Gralloc lever: `APSGrallocUtils::initialize` Ghidra `0x21e5b4` / file `0x11e5b4`, PLT `0x6713a8`,
  GOT `0x686c08`. Offline getStub (separate/redundant): `0x603a88`/`0x603a98`.
- Hooks: P010 GOT `0x689ba8`; copyMetadata GOT `0x686ee8` (body `0x292960`); strlen GOT `0x1bb6888`;
  dlsym `0x1bb67c8` (interface) / `0x686c88` (process). ArcSoft struct `+0x40/+0x48/+0x60/+0x64`.
- Docs: rearch/14 (gralloc contiguity), 16 (aosp trace), 19 (spkal01/dodge shim), 20 (gralloc
  master), 23 (struct anchor), 28 (native capture SEGV), 33 (gralloc/HardwareBuffer lifetime). Shim
  source: `vendor/oplus/camera-sm8850/apsfixup/{apsfixup.cpp,docs/PORTING.md}`. Frida:
  `apsfixup/docs/frida/op_chroma_repair.js`.
- Memory: `root-aec-stats-hdr-detected-missing` (Family III's sibling), the mapper@4/getStub unified
  root, and the geometry-family notes.

---

## Inferences & Open (UNVERIFIED — heavy-check)

> Per the interop-tree trunk axiom, a measured failure SITE is never a verified ROOT. The items
> below are root attributions, retirement-path recommendations, facilitation hypotheses, and forward
> probes — NOT verified until an OOS↔LOS A/B proves the propagation-contract break. The
> observations above are real; these conclusions from them are not.

### Family I attribution and retirement path (all inferences)

- **ATTRIBUTION (unproven): "the 'OOS way' to retire Family I is a sepolicy/namespace fix or an
  allocation-input fix."** The exhaustive RE shows no OEM gralloc fork exists to port; but the
  *exact* runtime mechanism (why LOS's lock-math produces a different `Cb` offset for a
  byte-identically-allocated buffer) remains unobserved. Rearch/14's conclusion is that no
  facilitation lever has been found — but this is an absence-of-evidence finding, not proof of
  irreducibility.
- **REFUTED (sepolicy access-denial sub-hypothesis):** permissive-mode observations defeat the
  access-denial framing — the OOB occurred under `setenforce 0`, so
  `getStandardMetadata(PLANE_LAYOUTS)` is not failing on SELinux access. The
  `"Unexpected error %d"` fallback is likely NOT the firing path in permissive. (Refuted, but
  alternative mechanisms still open.)
- **LEADING MECHANISM HYPOTHESIS (unproven): in-app `libgrallocutils` → `libcamxexternalformatutils`
  CamxFormatUtil namespace link failure.** If `com.oplus.camera`'s linker namespace can't reach the
  vendor `libcamxexternalformatutils.so`, the dlopen fails → "Failed to link CamxFormatUtil" →
  generic P010 fallback → wrong UV offset / chroma stride. Fits: byte-identical blob (namespace, not
  code) · permissive-immune (linker ≠ SELinux) · OP13+OP15-common. **UNPROVEN causal gate (the one
  runtime check):** whether the app namespace *actually* fails this dlopen. `mapper.qti.so` enters
  apps via a vendor/sphal namespace that often carries vendor search paths — the link may succeed,
  which would refute this and send to alt (allocation inputs). Decisive one-liner during capture:
  `adb logcat | grep -iE "Failed to link CamxFormatUtil|Unable to get IS_UBWC from snap"` in
  `com.oplus.camera`.
- **CANDIDATE FACILITATION FIX (only if the probe fires):** expose `libcamxexternalformatutils.so`
  (+ ensure `camera_alignments.json` reachable) to the `com.oplus.camera` namespace — a
  `public.libraries.txt` entry / namespace link / `ld.config` parity. The exact OOS reachability
  path (vendor/sphal namespace search-paths vs an explicit grant) must be pinned before authoring.
- **LEADING MECHANISM ALT (allocation inputs, unproven):** on AOSP LOS the OEM-private gralloc
  **usage bit** is never set on the P010 buffer → the QTI allocator computes a generic
  (non-contiguous) layout → APS strides OOB. OP13 and OP15 — different SoC, same OOS16 generation
  — need the **same** shim ⇒ root is not SoC, not blob, not sepolicy; it's the one shared variable.
  But: static RE of `/system` camera-buffer surfaces (libgui, libcameraservice, libandroid_runtime,
  libui) shows zero usage/GRALLOC/P010/UBWC code — the EDR layer (doc-49) writes `layer_state`,
  NOT usage — so this usage-bit knob at the /system layer is **refuted at every surface examined**.
  If the usage bit is the root, it is set by the **camera/HAL allocation path**, a different site.
- **DECISIVE PROBE (r3 gralloc A/B):** hook the full P010 lifecycle correlated by buffer-handle id
  — `allocate` (usage, format, W×H, stride, plane offsets) → `importBuffer` → `lock`/`getPlaneLayouts`/
  `getStandardMetadata` (return code + plane offsets + contiguity). Run identically on stock OOS and
  LOS, both permissive (plus LOS enforcing pass to isolate sepolicy), with a negative control
  (working non-HDR buffer beside the SEGV P010). The diff lands in exactly one column
  {usage flags · allocator instance · mapper generation · returned layout} = the root.
  Extends `tools/frida/trace_p010_planes.js`. (Not yet run.)
- **CORRECTION to hwservicemanager framing (line 52 of original):** OOS A16 still ships
  `system/bin/hwservicemanager` (symlink present). "A16 removed hwservicemanager" is imprecise.
  (Verified this session; flagged here as a model correction, not a retirement finding.)
- **HONEST STATUS:** Family I recommendation is cosmetic/consolidating, not eliminating. The
  cleanest improvement available: keep the P010/chroma repair as the (rearch/14-blessed)
  consumer-side fix, narrow its window back to `[0x70,0x7f]`, and — IF a frida probe ever confirms
  the `0x21e5b4` getStub-flip yields contiguous `lockYCbCr` — collapse the per-algo repairs into
  that single lever. **Do not promise Family I retirement; promise Families II & III.**

### Family II attribution and retirement (inferences)

- **ATTRIBUTION (unproven): "the root is metadata-lifetime — the request `camera_metadata` can be
  freed/unmapped before `DeferJob::startCapture` synchronously calls `APSMetadata::copyMetadata`."**
  Plausible from the shim's behavior (deref of a freed header → SIGSEGV), but the exact freed-header
  deref has not been observed in a live LOS session.
- **CANDIDATE HOME (unproven):** fix at the **camera provider's result delivery** (CameraDevice
  session result lifetime / the OCS deferred-job handoff): keep the result `camera_metadata` alive
  for the deferred-capture window instead of freeing it on the fast per-frame cadence. Homes: camera
  provider (`hardware/qcom/camera*`), or the OCS deferred-job layer holding a ref to the metadata.
- **VERIFICATION PLAN (forward):** Disable the `copyMetadata` hook; run back-to-back captures (the
  repro); confirm no SIGSEGV in `DeferJob::startCapture` once the provider retains the metadata.

### Family III attribution and retirement (inferences)

- **ATTRIBUTION (unproven): "the root is the OEM IPE TurboHDR vendor metadata tag (~`0x4d78`) not
  published into per-frame result metadata on LOS."** Same family as the AEC `hdr_detected`
  metadata-starvation pattern. The site (strlen(null) SIGSEGV) is verified; the root (provider
  doesn't publish the tag) is an attribution.
- **CANDIDATE HOME (unproven):** fix where the tag is produced — the **camera provider / CamX OEM
  metadata node** that should write the TurboHDR tag into per-frame result metadata. Once published,
  `parseTurboHdrInfo` stores it and `strlen` gets a valid pointer.
- **VERIFICATION PLAN (forward):** `tools/frida/observe_getmetadata.js`-style probe: confirm the
  TurboHDR tag is present in result metadata after the provider change; disable the `strlen` hook;
  confirm no `strlen(null)` SIGSEGV.

### Recommended retirement order (inferred, not verified)

- **Retireable (genuine provider-side plumbing gaps — inferred):**
  1. **Family II** — provider/OCS metadata lifetime; drop the `copyMetadata` hook.
  2. **Family III** — provider/CamX OEM TurboHDR tag publish; drop the `strlen` hook.
- **Family I (gralloc/P010) — likely NOT cleanly retireable (rearch/14):** it's a consumer-side
  ABI lock-math divergence on byte-identical mapper binaries with no facilitation lever found.
  Options, none confirmed "like OOS":
  - best-effort consolidation: IF a frida probe confirms the `0x21e5b4` getStub-flip yields
    contiguous `lockYCbCr`, collapse the per-algo P010/ARC/BasicTone repairs into that one in-blob
    lever (still a workaround, not OOS parity). Otherwise keep the repair as the rearch/14-blessed
    consumer-side fix.
  - true elimination requires SOLVING the open rearch/14 question — why LOS's `lockPlanes` computes
    a different `Cb` offset than OOS on the same buffer (lives in `libui` `GraphicBufferMapper`/
    Gralloc5 lock + `graphics.common` math) — which rearch/14's evidence suggests has no lever.
- Interim policy: keep the apsfixup window NARROW (`[0x70,0x7f]`, the v16 form). Remove a hook only
  after its target-layer fix is verified on-device.

### One-line summary (corrected framing, inferred)

`libapsfixup` = three LOS-vs-OOS gaps collapsed into one camera-scoped interposer, but they are NOT
equally retireable. **Families II (deferred-metadata lifetime) & III (OEM TurboHDR vendor-tag) are
inferred provider-side plumbing gaps** — move them to the camera provider/CamX (same
"missing-Oplus-plumb" pattern as `getOplusHardwareBuffer`/`OplusEdrUtils`) and drop those hooks.
**Family I (P010 gralloc contiguity) is NOT a proven clean plumbing gap**: per rearch/14, OOS hits
the same NULL `IMapper@4.0::getService` + same Gralloc5 lock on byte-identical mapper binaries and
*still* gets contiguous P010 — a consumer-side ABI lock-math divergence with no facilitation lever
found. The "getStub-flip = OOS way" idea is REFUTED for the baseline. Promise Families II & III;
treat Family I as accepted-until-the-rearch/14-lock-question-is-solved.
