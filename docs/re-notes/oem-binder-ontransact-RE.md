<!-- STATUS: VERIFIED — evidence-anchored (Ghidra/device capture); no inference-surgery needed (doc-50 method). -->
# OEM `media.camera` onTransact receiver + Depth-2 hooks (Ghidra-recovered, OOS `.201`)

> The static proof of the av/0001 "CameraServiceExt" layer E2 calls CONVICTED-not-applied.
> Confirms doc-48's two-depth model directly from the stock blob: the binder `onTransact`
> Depth-1 dispatch (10001..) AND the 6 internal Depth-2 hooks (configure / op-mode / preview /
> result-metadata) that neither dodge nor our port implement.
>
> Date: 2026-06-13 · Binary: `dump201_full/system_ext/lib64/libcsextimpl.so`
> (full path `/home/vivy/op15-work/dump201_full/system_ext/lib64/libcsextimpl.so`)
> **FOUND in the stock dump under /system_ext/lib64** — the receiver is a /system_ext component,
> present on baseline; it is *absent from our LOS build* (dropped `d654641`, E2), not from the dump.
> AArch64 PIE, stripped of .symtab but **C++ names retained in .dynsym** (demangled below).
> BuildID md5 `4b6bc39077262e8aa8bbdbc013bda310`, md5(file) `d773133f369d8abf6515dfcaeb6fb208`,
> 1,491,032 B. · Ghidra image_base **0x100000** (file offset = Ghidra addr − 0x100000).
> · Tool: ghidra-mcp (project `oos-baseline-v3`).

## TL;DR — AGREE with doc-48
Both depths are real and live in this one blob. **Depth-1**: `CameraServiceExtImpl::onTransact`
@ Ghidra `0x1726f0` is a single big `switch(code)` over `0x2711..0x2728` (10001..10024) — it
covers and slightly *exceeds* doc-48's SDK-visible 10001..10022 range (the SDK stub only declares
up to 10022; the receiver handles 10023/10024 too). **Depth-2**: all 4 named hooks plus the 2
lifecycle hooks doc-48 lists exist as real method bodies in the base `android::CameraServiceExtImpl`
class (the SoC subclasses `_sm8850`, `_qcom`, `_mtk`, … only add size/zoom/FOV helpers; the
behavioral hooks are in the base). The class is multi-SoC (40 `_GLOBAL__sub_I_*.cpp` ctors incl.
`_sm8850.cpp`); op15 = `sm8850`. **doc-48's mechanism map is confirmed at the binary.**

## Depth-1 — `onTransact` dispatch @ 0x1726f0 (file off 0x16f6f0)
`_ZN7android20CameraServiceExtImpl10onTransactEjRKNS_6ParcelEPS1_j` — `switch(param_2)` with
`case 0x2711:` … `case 0x2728:` (24 codes), `default: uVar11 = 0xffffffda` (= `-38`,
`UNKNOWN_TRANSACTION` → matches the live "G5 OEM binder dropped=2" verdict: on LOS there is no
receiver at all, so cameraserver's own AOSP `onTransact` returns this for every 100xx code).
Code arithmetic (each verified): `OPLUS_CAMERA_FIRST_CALL_TRANSACTION = 10000`, so
`0x2711 = 10001`, `0x2726 = 10022` (doc-48's upper bound), receiver extends to `0x2728 = 10024`.

| Code | hex | dispatch action (decompiled) |
|---|---|---|
| 10001 | 0x2711 | read 3 ints + String16 → `param_1[0x10]->fn(...)` (addAuthResultInfo) |
| 10003 | 0x2713 | read String16 → locked write to `param_1[0x69]` map (setPackageName) |
| 10005 | 0x2715 | read String16+2 ints → insert into client-info tree `param_1[0x6b]` (setClientInfo) |
| 10015 | 0x271f | read int+int[] → build `aidl::vendor::oplus::…::ExtCamCmd`, call vtbl `*param_1+0x430` (**sendOplusExtCamCmd — the zoom/pre-capture channel**) |
| 10020 | 0x2724 | read int+bool → `func_0x0024aeb8(param_1, …)` ((un)register device cb) |
| 10021 | 0x2725 | auth-gate `func_0x0024aed0(param_1,0x268f98)` then `param_1[0x15]->fn` (satellite-call state) |
| 10024 | 0x2728 | read String16 + parcelable → `param_1[0x15]->fn(0x28)` + `param_1[0x16]->fn(0x20)` |

(Codes 10002/10004/10006-10014/10016-10019/10022-10023 are the remaining cases; many are auth-gated
via `func_0x0024b8a8(0x268f80/0x268f88, uid,pid)` or `func_0x0024aed0(param_1,0x268f9x)` before
dispatch — the `isAuthedClient` gate doc-48 names.) The 10015 path resolving to vtbl `*param_1+0x430`
= `sendOplusExtCamCmd` (`@0x187f3c`) → the `aidl…sendextcamcmd` HAL is exactly dodge's validated
zoom route.

## Depth-2 — the 6 internal hooks neither we nor dodge implement (base `CameraServiceExtImpl`)

| Hook (demangled) | Ghidra | file off | role (decompiled) |
|---|---|---|---|
| `beforeConfigureStreamsLocked(CameraMetadata&, m, String8, camera3::StreamSet&, int)` | `0x17f71c` | `0x17b71c` | **mutates the StreamSet pre-configure.** Walks `param_5` stream-id list; for streams of type/usage match (`vtbl+0x20 == 300 && vtbl+0x28 == 0x400`) it `emplace`s a synthesized stream into a `KeyedVector<int,MetaStreamInfo>` at `param_1+0x598` (add or re-type by stream-id), sets `+0x14 = 0x18`. **This is the EIS/8K output-stream inject/retype mechanism (doc-48 #8 / 0x80a9 candidate).** Also calls `addRemovePackageName` inline. |
| `getExtensionOperatingMode(CameraMetadata&, m, int)` | `0x188818` | `0x184818` | **operating-mode override.** `find_camera_metadata` for vendor-tag `UNK_00142f77`; if present returns `*entry.data` as the op_mode, else falls back to the passed-in default (`param_4`). The op_mode 0x80a9 override site. |
| `processPreview(camera_stream_buffer*, m, InFlightRequest&)` | `0x17c9a0` | `0x178c9a0`† | **preview-frame processing.** Per-frame, keyed on frame size in two tree-maps (`param_1+0x3f/+0x46`); on first/new frame builds a state string (W×H, fps `1e9/param_4[0x1e]`, frame#), sets `CameraSessionStats::CAMERA_STATE_FIRST_FRAME_ARRIVED` (`param_1+0x264`), and on a sub-state calls vtbl `*param_1+0x3b8`. **The Gate-B (#1 freeze) consumer-side hook.** |
| `beforeMetadataSendToApp(CaptureResult*, j, CaptureOutputStates&)` | `0x17aa14` | `0x176aa14`† | **mutates result metadata to app.** Operates on the result CameraMetadata at `param_2+8`: erases/updates vendor-tags `0x1001f`, `0x10020`, `0xe0010` gated on frame-count thresholds + per-session flags (`+0x55c/+0x574/+0x56d`); plus AE/AF-state fix-up. **The result-lifetime / over-exposure metadata surface (#4 contributor).** |
| `afterConnect(String8, String16, bool, sp<BasicClient>, void*, m, i)` | `0x171444` | `0x16d444` | client-lifecycle: session-auth/identity setup at connect. |
| `afterConfigureStreamsLocked(CameraMetadata&, m, m, camera3::StreamSet&, String8)` | `0x180e44` | `0x17ce44` | post-configure pass over the same `param_1+0x598` MetaStreamInfo set (companion to the `before` hook). |

† `processPreview`/`beforeMetadataSendToApp` file offsets given relative to image base 0x100000:
`0x17c9a0 − 0x100000 = 0x07c9a0`; `0x17aa14 − 0x100000 = 0x07aa14` (the "78c9a0"/"76aa14" forms
above are typos — use `0x07c9a0` / `0x07aa14`).

Supporting (confirm the surface is real, not external): `addRemovePackageName` `@0x17fe74`
(the OOS-native identity-into-metadata stamp we replaced via SDK self-stamp `62009bf`),
`afterEndConfigure` `@0x171a9c`, `sendOplusExtCamCmd` `@0x187f3c`,
`sendOplusExtCamCmdWithReply` `@0x17600c` (the `ExtCamCmd` HAL backends),
`ExtFactory::getCameraServiceExt` / `getExtFactoryImpl` (dlsym targets av/0001 dlopens).

## Why our port is missing it (E2, doc-48)
The blob is a complete, correct receiver — it is **present in the stock dump** but **absent from the
LOS build** (`libcsextimpl.so` dropped `d654641`; the av/0001 dlopen/onTransact-delegate not applied,
E2 host-scan: 0 `CameraServiceExt*` strings in our `cameraserver`). dodge ports only Depth-1
(`CameraServiceExtFactory::onTransact` delegate, validated zoom) but adds **0** Depth-2 call sites,
so even dodge never reaches `beforeConfigureStreamsLocked` / `processPreview` / `beforeMetadataSendToApp`.
The static evidence: the hooks that would shape 8K streams (`beforeConfigureStreamsLocked` +
`getExtensionOperatingMode`), un-freeze preview (`processPreview`), and fix result metadata
(`beforeMetadataSendToApp`) all exist here and would only run if cameraserver *called* them — which
requires re-adding the blob AND wiring the Depth-2 call sites (the work beyond dodge).

## Verdict
**AGREE with doc-48** on every structural claim: 22+ binder codes from `FIRST_CALL_TRANSACTION 10000`
(receiver: 10001..10024), and all 6 Depth-2 hooks present in the base class with exactly the roles
doc-48 predicted (StreamSet mutate, op-mode override, preview processing, result-metadata mutate,
connect/configure lifecycle). One refinement: the receiver dispatch range is 10001..10024, one notch
past the SDK-stub-visible 10001..10022.

— pairs with the 1b photo-hdr "G5 OEM binder dropped=2" capture (every 100xx → UNKNOWN_TRANSACTION −38
on LOS because this receiver is unbuilt; the dropped count is the SDK's binder calls hitting stock AOSP
`onTransact` with no `CameraServiceExtImpl` behind it).
