<!-- STATUS: VERIFIED — evidence-anchored (Ghidra/device capture); no inference-surgery needed (doc-50 method). -->
# `libapsfixup.so` interposition map (the F4 piece) — what it rewrites, and which transforms are reproducible-upstream vs irreducible-consumer-side

> Grounds doc-42's shim inventory with the **binary's own debug-info source** (not a blind blob RE): the
> port's `libapsfixup.so` ships **unstripped, with `debug_info`**, so every wrapper symbol + log string is
> ground truth, cross-checked against the in-tree `vendor/oplus/camera-sm8850/apsfixup/apsfixup.cpp` it was
> built from. This pins the **exact set of interposed symbols and their transforms**, and answers the one
> question the post-processing contract turns on: **does libapsfixup touch the APS metadata *lifecycle*
> (incref → copyMetadata → decref → release@0)?** — **NO, except for one defensive `copyMetadata` null-guard
> that does not participate in the refcount ordering.**
>
> Date: 2026-06-14 · Pairs with: `decmetarefzero-upcall-RE.md` (the metadata RELEASE upcall),
> `rearch/42-retiring-libapsfixup-the-oos-way.md` (the standing retirement plan), `interop-tree/data/D2-hal-fill-aps.md`
> (#4 copyMetadata UAF site), and the stock P010 contract capture
> `reference/campaign/p010/app_probes/trace_p010_planes.log`.

## Binaries

| artifact | path | BuildID | notes |
|---|---|---|---|
| **PORT** `libapsfixup.so` | `/home/vivy/android/lineage/out/target/product/infiniti/odm/lib64/libapsfixup.so` (+ `symbols/` copy, `out/soong/.intermediates/vendor/oplus/camera-sm8850/apsfixup/libapsfixup/.../libapsfixup.so`) | md5 `18a8b45eeeb924cfe20e4777bdaded5f` | **67,480 B, AArch64, NOT stripped, has `debug_info`.** Built from in-tree `vendor/oplus/camera-sm8850/apsfixup/apsfixup.cpp` (SPDX Apache-2.0). |
| host (interposed) `libAlgoProcess.so` | `/home/vivy/op15-work/dump201_full/odm/lib64/libAlgoProcess.so` | md5 `82fe443b408f8ed027558b0d4ffb1500` | in ghidra project `oos-baseline-v3`, image_base `0x100000` (Ghidra addr − `0x100000` = file off). **Stock has NO libapsfixup** — it is a PORT addition; the port copy is the one above. |
| host (interposed) `libAlgoInterface.so` | (sibling `/odm/lib64`) | md5 `ce6e40ca2e987fcc6da26930d84b0b2f` | byte-identical OOS↔LOS. |

**Methodology note:** because the PORT binary carries its own symbols + `debug_info` and was compiled from a
committed first-party source, this RE did NOT import-and-decompile it blind. The interposed-symbol list and
each transform are read directly from the binary's `.symtab` / `strings -a` AND verified line-for-line against
`apsfixup.cpp`. The libAlgoProcess-side offsets (`copyMetadata` body, the GOT slots) were independently
re-confirmed in ghidra (oos-baseline-v3) — see below. No offsets were fabricated.

## How it interposes (mechanism, one paragraph)

`libapsfixup.so` is `patchelf --add-needed`'d onto `libAlgoProcess.so` and exposed in `public.libraries.txt`
(doc-46 Tier-2 `ffb638b`). At load (`__attribute__((constructor)) apsfixup_init`) it walks `dl_iterate_phdr`
to find the load bias of `libAlgoProcess.so` / `libAlgoInterface.so`, then performs **GOT/PLT `R_AARCH64_JUMP_SLOT`
redirects** via `got_redirect()` (mprotect the RELRO page RW → overwrite the slot's data pointer → mprotect RO;
**no code patch, no execmem**). Both blobs are BIND_NOW with the slots inside `PT_GNU_RELRO`, so the
mprotect dance is required. A detached `poller` thread retries every 25 ms for ~10 min so late-`dlopen`'d
targets (`libAlgoInterface`, the ARC engines) are caught. It is **camera-process-scoped** (lives only in
`com.oplus.camera`, interposing only these two blobs' GOTs) — it does not touch the global system mapper/gralloc.

## The interposed symbols (each @offset, the transform, lifecycle reach)

All six wrapper functions confirmed present in the binary `.symtab`
(`wrap_p010`, `wrap_arc`, `wrap_arc_tfrsn`, `wrap_copymeta`, `wrap_strlen`, `wrap_ogltone`, plus `wrap_dlsym`,
`repair_struct`, `aps_repair_structs`). Offsets are **runtime/file** (image-base 0); Ghidra listing addr = file + `0x100000`.

| # | interposed symbol | hook (GOT/PLT slot) | wrapper | transform | touches metadata lifecycle? |
|---|---|---|---|---|---|
| 1 | `APSFormatConverterNeon::p010LSB2MSBNeon` (libAlgoProcess, body vaddr `0x4fc094`) | `P010_GOT_OFF` = **`0x689ba8`** (libAlgoProcess) | `wrap_p010` | recomputes the P010 LSB→MSB **conversion length `w5`** from the *actual* mapped source span: `w5 = (2/3·avail)/w4` so `w4·w5·1.5 == buffer` (prevents the ~1 GB walk off the 36 MB dmabuf). | **NO** — buffer-geometry only. |
| 2 | `ARC_Turbo_RAW_Process` (ArcSoft, resolved via `dlsym` in libAlgoInterface) | `DLSYM_GOT_OFF` = **`0x1bb67c8`** (libAlgoInterface) → `wrap_dlsym` hands back `wrap_arc` | `wrap_arc` → `aps_repair_structs` → `repair_struct` | repairs up to 3 ArcSoft I/O structs: scans `+0x00..+0x78` for a valid-luma / garbage-chroma pair, rewrites **chroma plane ptr = `luma + page_align(2/3·avail)`** and (at the `+0x40` plane) **chroma pitch[1]@+0x64 = Y pitch[0]@+0x60** (was 0). | **NO** — buffer-geometry only (chroma plane VA + pitch). |
| 3 | `ARC_TFRSN_Process` (ArcSoft super-night, dlsym'd) | same `DLSYM_GOT_OFF` `0x1bb67c8` → `wrap_dlsym` hands back `wrap_arc_tfrsn` | `wrap_arc_tfrsn` → `aps_repair_structs` | identical chroma-ptr/pitch repair as #2, for the super-night engine's input structs. | **NO** — buffer-geometry only. |
| 4 | `OGLBasicToneProcess` (libBasicTonePhoto.so `@0x53984`) | `ALGOPROC_DLSYM_GOT_OFF` = **`0x686c88`** (libAlgoProcess dlsym) → `wrap_algoproc_dlsym` | `wrap_ogltone` | **INERT skeleton (NEEDS-PROBE).** Intended: if BasicTone's `Image->field_0x38` pixel-buffer VA is mapped-but-NOT-writable (failed `AHardwareBuffer_lock`), return early to skip the `saveOutImg` in-place store (the JPEG is already saved). **Does not fire as written** — `OGLBasicToneProcess` is not a by-name `dlsym` string in libAlgoProcess, so the name-match never hits. Behaviourally a no-op. | **NO** — buffer-writability only; and inert anyway. |
| 5 | `android::APSMetadata::copyMetadata(camera_metadata const*)` (libAlgoProcess, body `0x292960`) | `COPYMETA_GOT_OFF` = **`0x686ee8`** (libAlgoProcess JUMP_SLOT) | `wrap_copymeta` | **UAF null-guard.** Before calling the real copy, strips the AArch64 TBI tag and checks the source is mapped (`/proc/self/maps`) AND has a sane `camera_metadata` header (`entry_count`@+0x0c ≤ 1M, `data_capacity`@+0x18 ≤ 64 MB). On a freed/unmapped/insane source → **returns null** (exactly what the real `copyMetadata` returns for an empty source, so every caller already handles it). No-op on a live pointer. | **ADJACENT, not participatory** — see §"metadata reach" below. |
| 6 | `strlen@LIBC` (TurboRaw path only) | `STRLEN_GOT_OFF` = **`0x1bb6888`** (libAlgoInterface JUMP_SLOT) | `wrap_strlen` | **null-guard.** `strlen(null) → 0` so `TurboRaw::setProcessOtherParams` proceeds with a zero-length "other params" string instead of SIGSEGV when the unpublished OEM IPE TurboHDR tag leaves `field_0x4d88` null. | **NO** — vendor-tag-publishing symptom. |

`wrap_dlsym` (libAlgoInterface dlsym, hook #2/#3 vector) and `wrap_algoproc_dlsym` (libAlgoProcess dlsym, #4
vector) are not transforms themselves — they are the symbol-resolution interception points that swap the real
ARC / BasicTone entry for the trampolines.

## Does libapsfixup reach the metadata *lifecycle*? (the contract-critical question)

**NO.** This is decisive and verifiable two ways:

1. **String/symbol scan of the binary is empty for every lifecycle token.** `strings -a libapsfixup.so | grep -iE
   'metaObjRef|MetaImageRef|decMetaRef|setMetaImage|RefInc|callbackToCamUnit|isInc'` → **0 matches.** libapsfixup
   knows nothing about `ApsCallbackMetaRefInc`, `metaObjRef`, `g_KeyCb_isInc`, the `callbackToCamUnit` upcall,
   `setMetaImageRef`, `decMetaRefZeroToRemove`, or `metaBufferMap`. It does not interpose, read, or rewrite any
   part of the incref / decref / release-at-zero ordering.

2. **The ONE metadata symbol it touches — `copyMetadata` (#5) — is a defensive null-return, not a lifecycle
   participant.** `wrap_copymeta` does not refcount, does not signal release, does not call the JNI bridge, and
   does not alter the *value* copied on the success path (it tail-calls the real `copyMetadata` unchanged for any
   live source). It only **converts a use-after-free read into a null return** on an already-freed source. So it
   sits *adjacent* to the metadata path (a crash-safety net over the #4 UAF site) but is **not part of the
   lifetime invariant** that sub-contract (b) must preserve. The incref→copyMetadata→decref→release@0 ordering is
   owned entirely by libAlgoProcess (`ApsCallbackMetaRefInc`) + the Java `APSClient$MetaImageRefCounter`, with
   **zero libapsfixup involvement**.

**Implication for the post-processing contract:** the port's shim cannot be the cause of a *broken* metadata
lifetime — it does not move within that lifetime. If the port diverges from stock's clean burst (copyMetadata
UAF=False, 0 tombstones), the divergence is upstream (result-metadata lifetime C3/C4) or in the release-gate
(C6/D3), **not** in anything libapsfixup rewrites. The `copyMetadata` guard is a *consequence-masker* for that
upstream divergence, not its source.

## ghidra cross-check (libAlgoProcess, oos-baseline-v3) — offsets independently confirmed

- `_ZN7android11APSMetadata12copyMetadataEPK15camera_metadata` @ Ghidra **`0x00392960`** → file **`0x292960`** —
  matches apsfixup's `COPYMETA_FUNC_OFF = 0x292960` and D2's "body 0x292960". The `+60` UAF deref cited by D2 /
  `D2-hal-fill-aps.md` (`APSMetadata::copyMetadata+60`) is `0x292960 + 0x3c`.
- The metadata-lifecycle anchors libapsfixup does NOT touch, re-confirmed present in libAlgoProcess (so the
  separation is real, not a missing-symbol artifact): `ApsCallbackMetaRefInc::preProcess` @ Ghidra `0x41f680`
  (file `0x31f680`), `::callbackToCamUnit` @ `0x41fa1c` (file `0x31fa1c`); globals `g_KeyCb_image` @ `0xab8138`,
  `g_KeyCb_pipelienName` @ `0xab8150`, `g_KeyCb_isInc` @ `0xab8180`; OLog `metaObjRef` debug strings @ Ghidra
  `0x18c984` / `0x1a813e` (file `0x8c984` / `0xa813e`), `release metaBuffer` @ `0x193431` (file `0x93431`). All
  live in libAlgoProcess, none in libapsfixup.

## Reproducible-upstream vs irreducible-consumer-side — per-symbol verdict

The decisive frame (doc-03 vocabulary, doc-42 §2.5): a transform is **reproducible by fixing the contract
upstream** if the *repaired value* is one a correct upstream producer would have handed over directly (the patch
becomes dead code once the buffer is "born correct" / the tag is published). It is **irreducible consumer-side**
if no clean upstream lever produces that value and the consumer must defend itself.

| # | interposed transform | repaired value | upstream-reproducible? | verdict |
|---|---|---|---|---|
| 1 | `wrap_p010` conversion length | `w5` derived from actual mapped span | **Conditional.** If the P010 buffer were born contiguous (Cb = Y + stride·H), the blob's own `w5` would already be correct and this patch is dead code. But doc-42/rearch-14's EXHAUSTIVE VERDICT found **no facilitation lever** for LOS-vs-OOS P010 contiguity (byte-identical mapper, same NULL `IMapper@4.0::getService`, same Gralloc5 lock, OOS still contiguous). | **IRREDUCIBLE-until-rearch/14-root** (Family I). Same defect as #2/#3. Keep as the rearch/14-blessed consumer-side defense. |
| 2 | `wrap_arc` chroma ptr + pitch | `chroma = luma + page_align(2/3·avail)`, `pitch[1] = pitch[0]` | Same as #1 — these are **three reads of one defect** (the P010 plane layout is non-contiguous where the byte-identical blob expects contiguous). A born-correct buffer retires all three. No such lever found. | **IRREDUCIBLE-until-rearch/14-root** (Family I). |
| 3 | `wrap_arc_tfrsn` chroma ptr + pitch | same chroma/pitch repair, super-night | same as #2. | **IRREDUCIBLE-until-rearch/14-root** (Family I). |
| 4 | `wrap_ogltone` writability skip | (inert) | N/A — never fires. The intended root (a writable CPU VA from a working `AHardwareBuffer_lock`) is the same Gralloc5/mapper@4 family as #1–#3. | **INERT** — not load-bearing today; if ever activated, same Family I class. |
| 5 | `wrap_copymeta` UAF null-guard | null on freed source | **REPRODUCIBLE upstream.** doc-42 Family II: the result `camera_metadata` must **outlive the deferred quick-jpeg job**. Fix at the camera provider / OCS deferred-job result-ref-hold so the source survives to `DeferJob::startCapture`→`copyMetadata`. Once it does, the source is never freed-early and the guard is dead code. **Stock confirms this is achievable** — D2 OBSERVED #4 `copyMetadata UAF=False` ×9 (stock holds the result-ref contract end-to-end). | **REPRODUCIBLE / RETIREABLE** (Family II). Drop the GOT guard after the provider retains the metadata. |
| 6 | `wrap_strlen` null-guard | 0 on null | **REPRODUCIBLE upstream.** doc-42 Family III: publish the OEM IPE TurboHDR vendor tag (~`0x4d78`) in per-frame result metadata from the provider / CamX OEM node; then `parseTurboHdrInfo` stores it, `field_0x4d88` is non-null, and `strlen` gets a valid pointer. Sibling of the `hdr_detected rc=-2` / AEC-stats publishing root. | **REPRODUCIBLE / RETIREABLE** (Family III). Drop the GOT guard after the tag is published. |

### Net verdict

- **Three transforms are REPRODUCIBLE by fixing the contract upstream (retireable):** #5 `copyMetadata`
  (provider/OCS result-metadata lifetime, Family II — and **stock proves the lifetime can be held**), #6 `strlen`
  (provider/CamX TurboHDR vendor-tag publish, Family III). These are genuine missing-Oplus-plumb gaps; move them
  to the provider and drop the GOT guards.
- **Three+one transforms are IRREDUCIBLE consumer-side defenses (not retireable at a clean plumbing layer):**
  #1 `wrap_p010`, #2 `wrap_arc`, #3 `wrap_arc_tfrsn` (the P010/chroma geometry repair, Family I) — per rearch/14's
  exhaustive verdict, OOS and LOS hit the *same* NULL `IMapper@4.0::getService` + *same* Gralloc5 lock on
  *byte-identical* mapper binaries and OOS *still* gets contiguous P010, so the divergence is a consumer-side ABI
  lock-math mismatch with **no facilitation lever found**. #4 `wrap_ogltone` is an inert skeleton of the same
  family. Keep these as the accepted defense until/unless the open rearch/14 lock-math root is solved.
- **None of the six touches the metadata refcount lifecycle** (incref/copyMetadata-value/decref/release@0). The
  only metadata symbol interposed (`copyMetadata`, #5) is a UAF null-guard adjacent to the lifetime, not a
  participant in it — so libapsfixup cannot break sub-contract (b)'s lifetime invariant, and removing it (after
  the Family II provider fix) leaves the lifecycle ordering exactly as stock holds it.

## v1.4 baseline supersession (2026-06-16)

The symbol inventory and "metadata reach is adjacent, not participatory" verdict still stand. What changes with
the v1.4 LOS/OOS baseline is the retirement ranking:

- Normal photo capture now works and saved JPEGs are not overexposed, so `libapsfixup` is not the preview EDR
  fix and should not be used as a broad OOS-to-LOS API translation layer.
- The P010 lane has moved past the old gralloc/plane-layout suspicion. The current failure is later, in
  `libBasicTonePhoto.so` `BasicTone_OGL::saveOutImg()`. That makes wrapper #4's area (BasicTone output
  writability/GL contract) closer to the observed crash than wrappers #1-#3, but the shipped wrapper is inert and
  should not be "activated" as the first fix. Fix the upstream BasicTone buffer contract instead.
- Wrappers #5 and #6 remain retireable upstream guards (`copyMetadata` lifetime and TurboHDR string publish).
  They are not evidence that the still-photo path is currently broken in v1.4.

Practical v1.4 rule: drop `libapsfixup` only after normal photo and P010/Pro replay both pass without the
BasicTone crash. Do not keep it for the preview-overexposure symptom; that belongs to the EDR/SF path.

## Pairing with the stock P010 contract (`trace_p010_planes.log`)

The captured stock contract — `camApsBufferLockPlanes` returning **planeCount=1 / rowStride=5120 /
pixStride=0**, with `descriptor(ret)=0x0` "BEFORE the p010/ARC apsfixup repair" — is the **input** the P010/chroma
repairs (#1–#3) sit on. On stock there is no libapsfixup, so that single-plane 5120-stride descriptor is consumed
as-is (and stock's burst is clean: D2 #4 UAF=False ×9). libapsfixup interposes exactly at this boundary on the
PORT: `wrap_arc`/`wrap_arc_tfrsn`/`wrap_p010` engage only when the chroma plane is the garbage signature
(valid-luma immediately followed by a tiny-low garbage chroma), repairing the chroma VA/pitch and the conversion
length before the ArcSoft/NEON code walks the buffer. The pairing confirms the repairs are **buffer-geometry
fixes at the lock/descriptor boundary**, entirely disjoint from the metadata refcount lifecycle the
`decmetarefzero-upcall-RE.md` upcall owns. **The single-plane planeCount=1/rowStride=5120 stock reading is the
geometry contract; the metadata-lifecycle contract is a separate axis libapsfixup never crosses.**

## Caveats / gaps (explicit)

- The PORT binary is from the LOS build tree, not a device pull — but it is the committed first-party
  `cc_library_shared` that ships to `/odm/lib64` (extract-files `.add_needed`), so it IS the port's libapsfixup.
  BuildID `18a8b45e…`. Its source `apsfixup.cpp` is in-tree and the binary `.symtab`/strings match it line-for-line.
- libapsfixup's struct-field anchors (`+0x40 luma / +0x48 chroma / +0x60 pitch[0] / +0x64 pitch[1]`) are HIGH
  confidence (cross-checked by koaaN/OP15InfinityX independent re-derivation) but the **chroma-pitch** correction
  (#2/#3 cosmetic color) is the one device-specific hardcode; a wrong anchor = cosmetic green chroma, NOT a crash
  (the crash-fix is offset-agnostic, garbage-signature scanned). Not material to the lifecycle verdict.
- The libAlgoProcess GOT-slot *offsets* themselves (`0x689ba8`, `0x686ee8`, `0x686c88`, `0x1bb67c8`, `0x1bb6888`)
  are taken from apsfixup.cpp's `readelf -r`-derived constants; the `copyMetadata` *body* offset `0x292960` was
  independently re-confirmed in ghidra this session. The GOT-slot offsets were not separately re-`readelf`'d here
  (they are HIGH-confidence static in the source and not load-bearing for the metadata-lifecycle question).
