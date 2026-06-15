# oplus-final clean camera reference

Purpose: clean OP13s/dodge camera-port reference plus the OP15 OOS-baseline-v3 capture matrix/tooling needed to restart bringup work without importing OP15 working-tree variations or historical ambiguity.

## Contents

- `dodge-camera-port/repos/` — direct clones from `github.com/dodge-camera-port` for the repos that carry dodge camera/framework/vendor changes.
- `dodge-camera-port/repos/patches-crdroid/` — the source patch corpus used as the cross-check/index.
- `docs/rearch/` — selected recent matrix/research notes for OOS baseline v3 capture planning.
- `tools/observability/` — fresh A/B capture harness for OOS baseline v3.
- `tools/frida/` plus `tools/enable_verbose.sh` and `tools/patch_chi_logclobber.py` — dependencies referenced by the observability harness.
- `reference/` — intentionally empty capture destination; populate with new runs only.
- `KERNELSU-MOUNT-NOTES.md` — recommended KernelSU/Hybrid Mount Lite + magisk-frida dev-loop notes.

## Cloned repos

All cloned repos live under `dodge-camera-port/repos/`.

| Repo | Branch | Rev | Why included |
|---|---:|---:|---|
| `patches-crdroid` | `main` | `54a69fa` | Patch corpus/index for dodge/common changes |
| `android_device_oneplus_dodge` | `16.0` | `0db13b9` | OP13s/dodge device tree camera integration |
| `android_device_oneplus_sm8750-common` | `16.0` | `fec2b6a` | sm8750-common device camera integration |
| `android_device_qcom_sepolicy_vndr` | `lineage-23.2-caf-sm8750` | `d4b73b7f` | vendor sepolicy modifications |
| `android_frameworks_av` | `16.0` | `a985608795` | cameraserver/OEM transaction receiver donor |
| `android_frameworks_base` | `16.0` | `936aaf438dce` | framework Oplus bridge/stub changes |
| `android_frameworks_native` | `16.0` | `1ca3930beb` | binder VM size donor; no dodge EDR port |
| `android_hardware_oplus` | `16.0` | `3eb48bf` | oplus-framework boot-stub donor |
| `proprietary_vendor_oneplus_dodge` | `lineage-23.2` | `1809945` | dodge proprietary blob tree |
| `proprietary_vendor_oneplus_sm8750-common` | `lineage-23.2` | `fd6194c` | common proprietary blob tree |
| `vendor_oplus_camera` | `A16` | `1c2c269` | clean dodge OplusCamera product module |

## Intentionally excluded

- OP15/infiniti repo forks, local dirtyaf branches, and `~/vendor_oplus_camera` local source-of-truth state.
- Historical OP15 `reference/` captures. Use `tools/observability` to generate fresh OOS baseline v3 artifacts.
- dodge kernel/KSU patch path from `dodge-camera-port/repos/patches-crdroid/patch-dodge/kernel,oneplus,sm8750`; not camera bringup reference.
- crDroid common cosmetic/system app patch payloads except where visible in `dodge-camera-port/repos/patches-crdroid` for provenance.

## Repository organization

### Two fix pathways

**Pathway A — Frida hooks (live, preferred):** runtime instrumentation via `tools/frida/*.js` injected by
frida-server, with reboot persistence via `tools/persistence/` (hook-facet). No partition writes; fully
reversible. Preferred when a target symbol is reachable at runtime.

**Pathway B — Blob patches (heavier fallback):** binary patches applied before flashing. Primary
host artifact: `tools/patch_chi_logclobber.py` (defeats the 4-stage CamX/CHI/OEM log-clobber chain).
The `tools/persistence/` patch-overlay facet and the forward LOS patch set in `los-impl/patches/` are
also part of this pathway.

### Capture harness

`tools/observability/` is the consolidated observability harness. Golden entry point:
`tools/observability/capture/baseline.sh`. Run the enable → capture → attribute sequence there.
All output lands in `reference/` (populate-only; never edit manually).

### Reference artifacts

`reference/` holds raw A/B capture dirs, parsed verdicts, and derived artifacts written by the
harness. It is intentionally empty in the repo; populate with fresh runs only.

### Port reference repos

- `dodge-camera-port/` — sm8750/OP13s oracle: read-only upstream clones used as proof-of-form
  cross-check for all adopt-dodge decisions. See `dodge-camera-port/README.md`.
- `infiniti-camera-port/` — OP15 LOS scaffold: local_manifests snippet + working clones of the 11
  `lineage-23.2-cam-final` repos owned by `1vivy`. See `infiniti-camera-port/README.md`.

### Forward LOS implementation

`los-impl/` stages the LOS camera-port patches and blueprint (R1–R7). Nothing has been applied to
the external tree yet. See `los-impl/README.md` for apply order and RE-block status.

### Docs taxonomy

`docs/` holds all research, facilitation, spec, and RE notes. Taxonomy index: `docs/INDEX.md`.
The two workflow-coupled subdirectories `docs/interop-tree/` and `docs/facilitation/` must not be
renamed (hardcoded in facilitation-audit `.mjs` workflows).

---

See also: `KERNELSU-MOUNT-NOTES.md` — KernelSU/Hybrid Mount Lite + magisk-frida dev-loop notes.
See also: `AGENTS.md` — full agent runbook (device constraints, path-coupling rules, attribution model).
