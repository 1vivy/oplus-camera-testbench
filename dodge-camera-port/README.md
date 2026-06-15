<!-- Parent: ../AGENTS.md -->

# dodge-camera-port — sm8750 oracle

> Build-pinned tags: **OOS V16.1.0 / 16.0.8.300 / OP611FL1 / CPH2745**

The **sm8750/OP13s (dodge) camera port** is the proven upstream reference for the OOS→LOS camera
bringup. Everything here is **read-only** in the context of this repo: these clones exist as a
proof-of-form cross-check and patch-corpus index, not as an active development surface.

## What this is

- `repos/` — direct clones from `github.com/dodge-camera-port` for the repos that carry dodge
  camera, framework, and vendor changes. Held locally so offline diff and adopt-dodge decisions
  can be made without a network round-trip.
- `repos/patches-crdroid/` — the source patch corpus used as the cross-check/index. Each
  `patch-dodge/` subdirectory maps to a repo; patches are the unit of attribution when deciding
  what to adopt verbatim vs author-new for the infiniti port.

## How it is used

When making an adopt-dodge decision for `los-impl/`:
1. Locate the relevant patch in `repos/patches-crdroid/patch-dodge/<repo>/`.
2. Cross-check the implementation in the corresponding `repos/<repo>` clone at the pinned rev.
3. Record the adoption (or divergence) in `docs/facilitation/DODGE-ORACLE.md`.

The `vendor_oplus_camera` clone here is the **canonical source** for
`infiniti-camera-port/repos/vendor_oplus_camera` — it was force-set to the dodge tip `1c2c269`
(see `infiniti-camera-port/README.md` ‡ note).

## Repos

| Repo | Branch | Rev | Why included |
|------|--------|-----|-------------|
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
| `vendor_oplus_camera` | `A16` | `1c2c269` | clean dodge OplusCamera product module — **canonical source for infiniti port** |

## Intentionally excluded

- dodge kernel/KSU patch path (`patches-crdroid/patch-dodge/kernel,oneplus,sm8750`) — not camera
  bringup reference.
- crDroid common cosmetic/system app patch payloads except where visible in `patches-crdroid` for
  provenance tracing.
