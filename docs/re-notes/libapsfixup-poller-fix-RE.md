<!-- STATUS: VERIFIED — Ghidra-anchored crash RE + source-built fix + on-device test. -->
# `libapsfixup.so` poller SIGSEGV — root cause, source fix, and device-test verdict

> The v1.3 (16.0.8.300) on-device `libapsfixup.so` (BuildID `be891b97…`, 27432 B) crashes its
> install poller and kills `com.oplus.camera`. This doc pins the **exact faulting instruction +
> precondition** (Ghidra on the on-device-orig blob), authors the **minimal source fix** in the
> first-party `apsfixup.cpp`, rebuilds from the device tree, and reports the on-device result
> (did `getRawSRAlgoMetaData ccm is null` clear / did a JPEG save?).
>
> Date: 2026-06-15 · Pairs with: `libapsfixup-interposition-RE.md` (what it interposes & why),
> `rearch/42-retiring-libapsfixup-the-oos-way.md`. Crash blob imported to Ghidra project
> `oos-baseline-v3` as `libapsfixup.ondevice-orig.so` (image base `0x100000`; Ghidra addr = file_off + 0x100000).

## Binaries

| artifact | path | BuildID | size | role |
|---|---|---|---|---|
| crashing original | `camera-bringup/overlays/libapsfixup.ondevice-orig.so` | `be891b97d5b0f6405eb4ad8eb49307f2` | 27432 | the lib that SIGSEGVs (pulled from device) |
| no-op stub | `camera-bringup/overlays/libapsfixup_stub.so` | — | 1888 | fallback: camera opens, but ccm-null / no JPEG |
| **fixed** | `camera-bringup/overlays/libapsfixup.fixed.so` | `59381c70aaa35f009b6565265bb1d7f7` | 27784 | source-built guard fix (this doc) |
| source | `infiniti-camera-port/repos/android_device_oneplus_infiniti/apsfixup/apsfixup.cpp` | — | 251→269 ln | first-party; built the `be891b97` blob |
| source backup (pre-fix) | `camera-bringup/overlays/apsfixup.cpp.orig-bak` | — | — | reversibility |

The on-device-orig binary is **built from the in-tree `apsfixup.cpp`** (md5 `5ec6d59b…`, device repo HEAD
`b6ea8c7` = ITERATION-LOG transform #27, the .300 re-anchor that ADDED the BuildId guard). RE matched
the source line-for-line: 2 GOT hooks (p010 + dlsym), `module_base`, `build_id_matches`, the 24000× poller.

## 1. Root cause of the SIGSEGV (Ghidra-anchored)

Tombstone (`/data/tombstones/tombstone_00`, tid `ImageProcessThr`):
```
signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0000006cbec04000 (read)
  #00 build_id_matches(unsigned long, char const*)+48   pc 0x1884
  #01 try_install()+376                                  pc 0x1554
  #02 poller(void*)+32                                   pc 0x1680
  x0/x19 = 0x6cbec04000 (= fault addr)   x1 = "f76a88188a00589db385183c025443f…"  (libAlgoInterface BuildId)
```

**Faulting instruction (decoded from the blob):** `build_id_matches+48` @ file `0x1884` =
`ldr w8,[x0]` — the very first dereference of the module-base argument, reading the 4-byte ELF magic
(`w9` was pre-loaded with `0x464c457f` for the compare). `x0` is the `base` arg.

In source terms (`apsfixup.cpp`) the deref is:
```c
static bool build_id_matches(uint64_t base, const char* want_hex) {
    const Elf64_Ehdr* eh = (const Elf64_Ehdr*)base;
    if (memcmp(eh->e_ident, ELFMAG, SELFMAG) != 0) return false;   // <-- reads *base  → SIGSEGV
```

**Why `base` is bad — the precondition.** `base` comes from `module_base()`:
```c
static bool module_base(const char* name, uint64_t* out_base) {
    FILE* f = fopen("/proc/self/maps", "re");
    char line[512]; uint64_t best = 0;
    while (fgets(line, sizeof(line), f)) {
        if (strstr(line, name)) { uint64_t lo;
            if (sscanf(line, "%lx", &lo) == 1) if (best == 0 || lo < best) best = lo; }
    }
    if (best) { *out_base = best; return true; }   // success for ANY nonzero parsed value, no validation
    return false;
}
```
It returns the **minimum start-address of any `/proc/self/maps` line whose text contains the module
name**, with **no mapped-ness / sanity check**. The `poller` calls `try_install()` every 25 ms for ~10
min. During camera bring-up the dynamic linker is concurrently `mmap`-ing the camera blobs, so the
`/proc/self/maps` seq-file read is **torn** across `fgets`/`read` boundaries: a line fragment lets
`strstr` match the module path while `sscanf("%lx")` parses an address column belonging to a neighbour
mapping (or a partial line). The result here was `base = 0x6cbec04000` — which the tombstone memory map
confirms is **unmapped** (a PROT-NONE gap between the `---` guard ending `0x6cbebfffff` and
`vulkan.adreno.so` at `0x6cbec7c000`). At the crash instant `libAlgoInterface.so` was in fact correctly
mapped at `0x6b8a439000` (BuildID `f76a8818…` matches), so a non-torn read would have succeeded — this
is an intermittent load-time race, not a permanent offset error.

**Two-line root cause:** (a) `module_base` can return a bogus, unmapped base under the concurrent-mmap
race; (b) `build_id_matches` dereferences that base with **no guard**. The 25 ms poll simply maximises
the chance of catching the linker mid-mmap. (Confidence: High — tombstone `pc` 0x1884 == this `+48`;
`x0`/`x19` == fault addr; fault addr proven unmapped in the same tombstone's map.)

Stub corollary: with the 1888 B no-op stub installed, the camera survives but the P010/SR interposition
never runs → the OEM reprocess hits `getRawSRAlgoMetaData ccm is null` → no JPEG saved. So fixing the
poller so the REAL lib installs is the path to restoring the save.

## 2. The fix (minimal, source-level)

Chosen approach: **harden the bad deref + bound the ELF walk in `build_id_matches`** using the file's
existing `range_of()` helper. This is the smallest change that kills the SIGSEGV while keeping the poller
and the full GOT interposition intact (a torn `module_base` result becomes harmless because the consumer
now validates before dereferencing; the poller just retries next cycle and succeeds once the mapping
settles). Offsets (P010 `0x4fc25c` / GOT `0x689ba8` / dlsym `0x1bb67c8`) and the BuildId guards are
UNCHANGED, so the interposition behaviour is identical once a *valid* base is seen.

Guards added to `build_id_matches`:
1. `range_of(base,&mb,&ms)` — base must be in a mapped region; else return false (retry later).
2. ehdr + phdr table must fit inside that mapping (`base+sizeof(Ehdr) ≤ map_end`; phdr table in-bounds).
3. each `PT_NOTE` start clamped into the mapped span; `end` clamped to `map_end`.
4. per-note `name`/`desc`/desc-byte reads bounded by `end` (defends torn `n_*sz`).

(Considered but rejected for this device-tree file: the `dlopen`-GOT *pollfree* patch at
`docs/rearch/attempts/master-mode-apsfixup-pollfree-and-C-B.patch` — it targets the LARGER
`vendor/oplus/camera-sm8850/apsfixup` variant (copyMetadata/strlen/OGLtone/`dl_iterate_phdr`,
`module_base`→uintptr_t) and does **not** apply to this 251-line `apsfixup.cpp`; it also adds an
unvalidated `dlopen` GOT offset. The deref guard is the surgical, in-file fix and additionally hardens
`build_id_matches` against the torn-read regardless of how `base` is obtained.)

Build: build server `vivy@10.9.20.67`, worktree
`/srv/android/worktrees/lineage-infiniti`, `lunch lineage_infiniti-bp4a-userdebug && m libapsfixup`
→ build OK (exit 0). Result `libapsfixup.so` 27784 B, BuildID `59381c70…`; `build_id_matches` grew
452→768 bytes (guard code present). Pulled to `camera-bringup/overlays/libapsfixup.fixed.so`.

Reversibility: restore `apsfixup.cpp.orig-bak` (or `git checkout` the device repo) and rebuild; on
device, re-push `libapsfixup_stub.so` (fallback) or `libapsfixup.ondevice-orig.so`.

## 3. Device test

Iterated three source revisions on-device (each: build server `m libapsfixup` → push
`/odm/lib64/libapsfixup.so` 644 root `same_process_hal_file` → reboot → CHI logging → launch
`com.oplus.camera` → `rawtap2.sh 635 2261` → ~8-10s dwell). Findings drove each next rev:

| rev | change | result |
|---|---|---|
| v1 | guard `build_id_matches` deref + bound PT_NOTE walk to **range_of(base)** | **No SIGSEGV** (poller crash GONE), dlsym hook OK, but `libAlgoProcess BuildId != 2217d555` logged → **p010 hook SKIPPED + latched** (g_p010_done=true). false mismatch. |
| v2 | + replace `module_base` /proc/self/maps parse with **`dl_iterate_phdr`** (atomic load bias) | still `BuildId != 2217d555` → root was NOT the base after all. |
| **v3** | fix the note clamp: bound the PT_NOTE walk to **range_of(p)** — the note's OWN VMA, not base's | **p010 hook INSTALLS** (`GOT-hooked p010 (real=…)`) + dlsym hook + **no crash**. |

Why v1/v2 still mismatched (the real second bug): libAlgoProcess's `.note.gnu.build-id` is at
`p_vaddr 0x9c0030`, i.e. in a **later LOAD segment** (file off `0x6a0000`) — a **different `/proc` VMA**
than the ELF-header base. v1's crash-guard clamped the note walk to `range_of(base)` (the FIRST segment),
so it never reached the build-id note → returned false → spurious mismatch → p010 hook latched off.
v3 validates each PT_NOTE pointer against `range_of(p)` (its own mapping), so the note is found and the
build-id (`2217d555…`) matches. (`dl_iterate_phdr` from v2 is retained — it removes the torn-read race
at the source and is the correct base API; the note-VMA bound is the additional, decisive fix.)

**v3 (final, shipped to `libapsfixup.fixed.so` md5 `69537637…`, BuildID `ab09…`-class) results:**

- **(a) poller SIGSEGV — RESOLVED.** Across all post-fix runs, **zero** libapsfixup tombstones
  (`grep libapsfixup /data/tombstones/tombstone_08..10` = 0). `com.oplus.camera` survives capture
  (pid stable). Log shows clean install:
  ```
  apsfixup: libapsfixup loaded (pid 7379)
  apsfixup: GOT-hooked p010 (real=0x748c0b125c)        <- the hook the original crash prevented
  apsfixup: GOT-hooked dlsym in libAlgoInterface (real=0x787e8d3044)
  ```
  (The only libapsfixup tombstone on the device, `tombstone_00`, is the ORIGINAL pre-fix crash.)

- **(b) `getRawSRAlgoMetaData ccm is null` — NOT cleared (still ~20×/capture).**

- **(c) JPEG saved? — NO (0 in `/sdcard/DCIM/Camera/`).**

### Verdict: is the libapsfixup stub the no-save cause?  **NO.**

The fix proves it. With the REAL libapsfixup fully installed (p010 + dlsym hooks active, no crash), the
`ccm is null` and the no-save **persist unchanged**. Decisive process evidence:

- `getRawSRAlgoMetaData ccm is null` is emitted by `opluscamxchinodehwcfgipedummy.cpp:1427
  OplusOverrideIPECCMData()` (CHI IPE node, pipeline `OplusSATOfflineReprocess0_IPE0`) running inside
  the **camera provider service** `vendor.qti.camera.provider-service_64` (pid **6603**).
- **libapsfixup only loads into `com.oplus.camera`** (pid **7379**) — it is a DT_NEEDED of the app-side
  libAlgoProcess and is *not* present in the provider service. Its p010/dlsym/ARC hooks act on the
  app-side ArcSoft/Algo P010 buffer geometry, a **different stage** than the provider's CHI offline-
  reprocess SR-CCM metadata lookup. libapsfixup never touches `OplusOverrideIPECCMData` /
  `getRawSRAlgoMetaData`. (Consistent with `libapsfixup-interposition-RE.md`: the 6 interposed symbols
  are all buffer-geometry / null-guards, **none** in the SR-CCM metadata path.)
- The no-save chain is provider-side: `ccm is null` → SR/IPE reprocess fails → CHI
  `ExtensionModule::RecoveryThread → Usecase::DumpSystemEvent` SIGABRT (tombstones 08/09/10, all
  pid 6603, `com.qti.chi.override.so`) → provider aborts → app torn down → no JPEG. This abort family
  pre-dates the fix and is independent of libapsfixup.
- `wrap_p010`/`wrap_arc` did not even fire this capture (no "p010 fix"/"chroma fix"/"interposing ARC"
  logs): the provider-side reprocess dies on ccm-null before the app-side ARC engine reaches the
  garbage-chroma trigger.

**Net:** the libapsfixup poller crash is a real, now-fixed defect (two bugs: unguarded deref of a
torn-read base; and a note-VMA bound that skipped the build-id note), and the fix restores the intended
P010/SR interposition without crashing. **But stubbing libapsfixup is NOT what causes `ccm is null` or
the no-save** — that root is upstream in the **provider-side CHI `OplusOverrideIPECCMData` /
`getRawSRAlgoMetaData` SR-CCM metadata path** (the `OplusSATOfflineReprocess` IPE node), which is the
next thing to chase for that v1.3 saved-photo state. In that state the fixed lib should still ship (it removes
a camera-killing SIGSEGV and re-arms the P010 geometry repair), but it is necessary-not-sufficient for the JPEG.

## v1.4 baseline supersession (2026-06-16)

This was a v1.3 bring-up defect, not the current v1.4 symptom shape. v1.4 can launch, capture, and save normal
photos; the remaining user-visible issue is preview-only overexposure. Use this note only as historical proof
that the old poller crash was real and that `libapsfixup` does not feed SR-CCM. For current patch planning,
`docs/rearch/51-los-v14-oos-ab-preliminary.md` supersedes the "fixed lib should still ship" sentence above:
retire the shim after BasicTone/P010 replay is green, and do not keep it for preview EDR.

### Current device state / reversibility
- `/odm/lib64/libapsfixup.so` = the **v3 fixed lib** (md5 `69537637…`), camera opens & survives capture.
- Fallback if ever needed: re-push `camera-bringup/overlays/libapsfixup_stub.so` (camera still opens,
  no-save) or `libapsfixup.ondevice-orig.so` (re-introduces the SIGSEGV — do NOT). `/odm` is an
  overlayfs (`/mnt/scratch/overlay/odm`); `mount -o remount,rw /odm` before pushing.
- Source: `apsfixup.cpp` (device tree + build server, md5 `02ef927f…`); pre-fix backup
  `camera-bringup/overlays/apsfixup.cpp.orig-bak`. Not yet committed.
