<!-- STATUS: PLAN/INFERRED — this document reasons about proof-of-form outcomes and "what we do about it."
     The measured oracle facts (sha256 verified, grep counts, md5 lines) are evidence-anchored observations.
     All "our action," "outcome," and "adopt/improve/do-not-author" conclusions are forward plan and design
     judgment, not verified fix outcomes. -->
<!-- Parent: ./INDEX.md -->
<!-- Siblings: ./F1-stubs.md ./F2-system-framework.md ./F3-toggles-config.md ./F4-sepolicy-namespace.md ./BUILD-ORDER.md -->
<!-- Companion (the DIFF-era view this doc replaces): ../interop-tree/DODGE-VS-DIRTY.md -->

---
title: "DODGE-ORACLE — dodge as proof-of-form (what dodge PROVES exists/works, not a file diff)"
plane: facilitation
date: 2026-06-14
reframe: "DODGE-VS-DIRTY.md asks 'where does our blob diverge from dodge?' (a diff). This doc asks 'what FORM does dodge PROVE exists/works, and do we adopt or improve on it?' (proof-of-form)."
axiom: "A byte-identical artifact is never the root. So dodge's VALUE is not its file content (which matches ours) — it is the PROOF that a given facilitation FORM ships and works on a real device. We map each proof to our LOS confines and decide: adopt the form, or improve on it."
---

# DODGE-ORACLE — dodge as proof-of-form

## Why this doc exists (the re-frame)

`../interop-tree/DODGE-VS-DIRTY.md` is the **diff** ledger: per artifact, *dodge path | our path | same/differs/missing*.
That view already paid out — it proved most artifacts are byte-identical (false friends) and located the real
divergence in **apply-state** (av/0001) and a **missing functional artifact** (the SHDR knob, since downgraded).

This doc re-explores dodge **in a different manner**: **not a file diff, but what dodge PROVES exists/works** —
*proof-of-form*. The question per facilitation item is no longer "do the bytes match?" but:

> **Does a shipping reference (dodge) prove this FORM exists and works on a real device — and if so, do we
> adopt the form verbatim, or can we improve on it?**

Three proof-of-form outcomes:
- **POSITIVE** — dodge ships the form and it works → **adopt** (cheapest correct form; do not re-author).
- **NEGATIVE/decisive** — dodge proves the form is **not needed** (ships without it, yet works) → **do-not-author**
  (a falsifier; stop chasing the lever).
- **NEGATIVE/instructive** — dodge ships only a **mask**, not the root fix → **improve on dodge** (we do better
  than the reference).
- **NONE** — no shipping reference proves the form → **author-new** against the RE offsets (the spec is the
  Ghidra map, not dodge).

---

## Proof-of-form ledger (per facilitation item)

### F1 — the boot-jar stub surface

**What dodge proves.** `android_hardware_oplus/oplus-fwk/` ships a **`java_library{installable:true}` + `oplus-fwk.mk`
`PRODUCT_BOOT_JARS += oplus-fwk`** (BOOTCLASSPATH, 142 `.java`). All four camera-critical FQCNs
(`OplusCameraManager`, `OplusEdrUtils`, `CameraMetadataNativeWrapper`, `OplusCameraManagerGlobal`) exist in
`oplus-fwk/src/` and export the right shapes (`getMetadataPtr(Object)->long`, binder codes `10001–10022`,
descriptor `"android.hardware.camera"`).

**What that PROVES:** the OEM Java framework surface **is a real, shippable form** and the camera-critical class
shapes resolve at runtime on a working device. It does **not** prove the *boot-jar* placement is necessary.

**Our LOS confine + verdict.** E1/F1 **falsified** the placement-break hypothesis: the same FQCNs resolve under
our cheaper **system_ext `<uses-library>`** shared lib (`oplus-camera-stubs`, 189 classes) off the cam-app
classloader. **We IMPROVE on the form** — Treble-clean system_ext scope instead of a system-wide BOOTCLASSPATH
the cam app does not need. **Adopt the class shapes verbatim (R7 `getMetadataPtr`); improve the placement.**

### F2 — the identical frameworks patches (av/base/native)

**What dodge proves.** The four `patches-crdroid/patch-dodge/frameworks,{av,base,native}/*.patch` files are
**sha256-identical** dodge↔ours (`15b3171b…`, `022f82cd…`, `fd45f9c6…`). On dodge's shipping ROM, av/0001 is
**applied + effective** with a prebuilt `libcsextimpl.so`, and **zoom works** (the patch `Test:` line).

**What that PROVES — per patch:**
- **av/0001 (R2)** — POSITIVE/strong. The **dlopen-bridge Depth-1 form** (`CameraService::onTransact` →
  `CameraServiceExtFactory::onTransact` short-circuit → `dlopen("system_ext/lib64/libcsextimpl.so")`) ships and
  works on a real device. **Adopt** the file. *Our divergence is apply-state, not content* — dodge proves the
  form, so the only manual step is reversing `d654641` to re-add the blob.
- **base/0001 (X3/#7)** — POSITIVE. The `nativeGetOplusHardwareBuffer` JNI bridge form ships and is effective →
  **#7 REFUTED**; **keep**, no action.
- **native/0001** — POSITIVE. BINDER_VM_SIZE 1→4MB, file-identical → **adopt**, low-risk.
- **Depth-2 hooks (R4), R1 release receiver, R3 EDR ABI** — **NONE.** No dodge patch carries them (the dodge set
  is av/base/native only). Dodge proves the Depth-1 *delegation* form, **not** the Depth-2 internal-hook form, the
  release-upcall-receiver form, or the EDR-ABI form. → **author-new** against the RE offsets.

**Our LOS confine + verdict.** **Adopt** where dodge proves the form (av/0001, base/0001, native/0001);
**author-new** where it does not (R1, R3, R4). The identical patches prove **apply-state is the divergence, not
content** — never byte-copy past what dodge proves.

### F3 — the HDR session-typing config + the SHDR knob (a decisive negation)

**What dodge proves — by negation.** Dodge ships **no `camxoverridesettings.txt`** and **no
`selectSHDRAutoExposureUsecase` string anywhere** (grep = 0). Yet dodge's HDR works. Its HDRMode/numHDRExposure
session-typing carriers live in **proprietary odm CamX config blobs**
(`proprietary/odm/etc/camera/CameraHWConfiguration.config`, `config/camera_unit_config`).

**What that PROVES:**
- The **SHDR-toggle form does NOT exist on a working device** → **X1 do-not-author** (NEGATIVE/decisive — a
  falsifier; this retires the old E3 "author the knob" recommendation).
- The **working form is odm CamX session-typing** (the path stock actually rides: HDRMode=1 + DCG
  `numHDRExposure 1→2` + offline fusion) → **adopt** that carrier for R5/R6 (POSITIVE-by-carrier).

**Our LOS confine + verdict.** **Adopt** the odm session-typing carrier (config artifact) and **keep** the
HDR/EDR props that arm the OEM HDR feature. **Author nothing** at the SHDR-knob site. The only
`camxoverridesettings.txt` we ship is `tools/enable_verbose.sh`'s logging-mask-only overlay — keep it logging-only.

### F4 — the public.libraries set (a decisive negation)

**What dodge proves — by negation.** Dodge's shipping `public.libraries.txt` (22 lines) **does not list
`libcamxexternalformatutils`** (`grep = 0`, VERIFIED). Yet dodge captures P010 reliably.

**What that PROVES:** the **public.libraries/app-namespace form is NOT needed** for P010 — the camx plane-layout
authority resolves transitively in the **sphal / `same_process_hal_file`** namespace (via
`mapper.qti.so → libgrallocutils.so DT_NEEDED → dlopen`, driven by `camera_alignments.json`), not the app
namespace. → **X4 do-not-author** the public.libraries entry (NEGATIVE/decisive; re-home #5 at D1 lock-math).

**The positive corollary.** The **12-lib public.libraries patch** (5 arcsoft + 6 QNN + `libapsfixup.so`) **is**
byte-identical dodge↔ours and load-bearing for the libs the app dlopens **by name** → **adopt** verbatim. The
`same_process_hal_file` label form for the tag-producer family is the form R6's vendor-tag publish must live in →
**adopt** the namespace form.

### F4 — that dodge SHIPS libapsfixup (the key "we can do better")

**What dodge proves.** Dodge's `public.libraries.txt` **line 22 ships `libapsfixup.so`** (VERIFIED). The shim is
6 interposers / 3 families (Family-I geometry, Family-II `copyMetadata` null-guard, Family-III TurboHDR `strlen`
guard).

**What that PROVES — the decisive instructive negation:**

> **Dodge ships libapsfixup ⇒ dodge has NOT done the post-processing root fix.** It carries the **mask**, not the
> root. So dodge proves only the *mask* form for Family-II/III — it does **not** prove a working root form.

This is the central improvement claim of the F-plane. The shim's metadata interposer is a **UAF null-guard that
MASKS #4, it does not cause it** (`grep metaObjRef|MetaImageRef|decMetaRef|isInc|callbackToCamUnit` over the
binary = **0** — the shim never touches lifetime). So:

| Family | Dodge proof-of-form | Our improvement (the root fix) |
|--------|---------------------|-------------------------------|
| **I — P010/chroma geometry** | POSITIVE (dodge ships it; irreducible) | **keep, minimal** — match dodge (rearch/14, no upstream lever) |
| **II — `copyMetadata` guard** | NEGATIVE/instructive (dodge ships the mask) | **improve** — author R1 release upcall (F2) → guard becomes dead code; retires #1 + #4 |
| **III — TurboHDR `strlen` guard** | NEGATIVE/instructive (dodge ships the mask; R6 DARK) | **improve** — publish R6 tag in-scene (F3) → guard becomes dead code; retires #6 |

**Our LOS confine + verdict.** Where dodge proves the irreducible form (Family-I), **match it**. Where dodge ships
only a mask (Family-II/III), **do better than the reference** — satisfy the contract at the root
(`./BUILD-ORDER.md` + POST-PROCESSING-CONTRACT.md) so the shim **shrinks** to Family-I. **This is the one place
the optimal LOS form is strictly better than the shipping reference.**

---

## Net — what dodge proves, and what we do about it

| Facilitation item | Dodge proof-of-form | Outcome | Our action |
|-------------------|---------------------|---------|------------|
| **Boot-jar stub surface** (F1) | POSITIVE (class shapes ship + resolve) | improve placement | adopt shapes (R7); keep system_ext form |
| **Identical av/0001 patch** (F2 · R2) | POSITIVE/strong (ships, zoom works) | adopt | apply av/0001 + reverse `d654641` |
| **Identical base/0001 patch** (F2 · X3) | POSITIVE (bridge effective) | keep | no action — #7 refuted |
| **Identical native/0001 patch** (F2) | POSITIVE (file-identical) | adopt | adopt, verify built |
| **Depth-2 / R1 / R3 forms** (F2) | NONE (no dodge patch) | author-new | write against RE offsets |
| **SHDR knob / camxoverridesettings** (F3 · X1) | NEGATIVE/decisive (dodge ships none) | do-not-author | retire the knob recommendation |
| **odm CamX session-typing** (F3 · R5/R6) | POSITIVE-by-carrier | adopt | adopt the odm carrier + keep HDR props |
| **public.libraries set** (F4) | POSITIVE for 12-lib; NEGATIVE/decisive for `libcamxexternalformatutils` | adopt 12-lib; do-not-author the camx entry | keep 12-lib patch; re-home #5 at D1 |
| **dodge SHIPS libapsfixup** (F4 · reduction) | NEGATIVE/instructive (ships the mask, not the root) | **improve on dodge** | root-fix R1 (F2) + R6 (F3) → shim shrinks to Family-I |

> **The one-line thesis.** Dodge is a **proof-of-form oracle**, never a thing to byte-copy. Where it proves a
> form ships and works, we **adopt**. Where it proves a form is unnecessary, we **do-not-author**. Where it ships
> only a mask (libapsfixup Family-II/III), **we improve on it** — our reduction
> (`../interop-tree/POST-PROCESSING-CONTRACT.md`) does the post-processing root fix dodge never did.

## Cross-links
- **The diff-era view this replaces:** `../interop-tree/DODGE-VS-DIRTY.md` (per-artifact `same/differs/missing`)
- **The status board:** `./INDEX.md` (each row's verdict + status)
- **The reduction map (the improvement):** `../interop-tree/POST-PROCESSING-CONTRACT.md`
- **Per-node proof-of-form detail:** `./F1-stubs.md` §(iii) · `./F2-system-framework.md` §(iii) · `./F3-toggles-config.md` §(iii) · `./F4-sepolicy-namespace.md` §(2)/(iii)
