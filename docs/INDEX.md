<!-- Parent: ../AGENTS.md -->

# docs — taxonomy index

> Build-pinned tags: **OOS V16.1.0 / 16.0.8.300 / OP611FL1 / CPH2745**

This file is the navigational index for everything under `docs/`. Two subdirectories
(`interop-tree/` and `facilitation/`) are hardcoded by a facilitation-audit workflow `.mjs` — do
**not** rename them.

---

## Workflow runbooks (how to *operate* — start here)

Single entry point: **[`../WORKFLOW.md`](../WORKFLOW.md)** (repo root) — the Mac↔builder↔device loop.
Operational runbooks in `docs/`:

| File | One-line purpose |
|------|-----------------|
| `SYNC.md` | Mac→builder sync + push tiers (overlay / wip / cam-final, no Gerrit) |
| `BUILD-HOST.md` | Building on aosp-builder — index of `/srv/android/AGENT.md` (`oplus-logs build-doc`) |
| `OVERLAY.md` | Reversible on-device tests (`adb remount` overlay) + revert guardrails |
| `LEDGER-SCHEMA.md` | Which ledger when + the `oplus-logs` retrieval interface |
| `PATH-COUPLING.md` | Paths hardcoded by scripts/workflows — do not rename |

---

## Subdirectory trees

### `docs/rearch/`
Architecture and RE notes produced during OOS baseline v3 planning. Numbered sequentially (35–50);
each file is a self-contained investigation or matrix note. Read newest-first for current state.

| File | One-line purpose |
|------|-----------------|
| `35-8k-hdrpreview-longexposure-plumbing.md` | 8K/HDR/long-exposure pipeline plumbing trace |
| `38-camera-module-architecture-v18.md` | Camera module architecture snapshot v18 |
| `40-preview-freeze-investigation-edr-plumb.md` | Preview-freeze investigation + EDR plumbing |
| `41-state-map-v19-preview-freeze-hdr.md` | State map v19: preview-freeze × HDR interaction |
| `42-retiring-libapsfixup-the-oos-way.md` | Analysis of retiring libapsfixup in favour of OOS pattern |
| `43-preview-freeze-elimination-matrix.md` | Elimination matrix narrowing the preview-freeze root |
| `44-libalgoprocess-preview-engine-re.md` | RE of libAlgoProcess preview-engine internals |
| `45-aec-hdr-detect-publication-gate.md` | AEC/HDR-detect publication gate characterisation |
| `46-cleanroom-topology-matrix.md` | Cleanroom topology + layer-boundary matrix |
| `47-root-cause-correction-two-gates.md` | Root-cause correction write-up: the two publication gates |
| `48-media-camera-oem-transaction-receiver.md` | `media.camera` OEM binder transaction receiver (doc-48 / G5) |
| `49-libgui-edr-abi-re.md` | libgui EDR ABI RE (setEdrViewTransform / layer_state_t) |
| `50-probe-persistence-and-anchoring.md` | Probe-persistence strategy and symbol-anchoring approach (**see loose file note below**) |

### `docs/facilitation/`
The requirement/task facilitation board. Drives the implementation work in `../los-impl/`.
**Do not rename this directory.**

| File | One-line purpose |
|------|-----------------|
| `INDEX.md` | Facilitation board index — canonical entry point for the board |
| `BUILD-ORDER.md` | Load-bearing build ordering contract (I1–I7 interlocks) |
| `DODGE-ORACLE.md` | Dodge oracle cross-check ledger (adopt-dodge decisions) |
| `F1-stubs.md` | F1: system_ext stub library requirements |
| `F2-system-framework.md` | F2: system framework (frameworks/av, frameworks/base) facets |
| `F3-toggles-config.md` | F3: toggle/config layer (CamX HDRMode, props) |
| `F4-sepolicy-namespace.md` | F4: sepolicy + namespace isolation facets |

### `docs/interop-tree/`
The formal specification tree: requirements, symptoms, data-flow, control-flow, and facilitation
nodes organised as a navigable attribution graph. **Do not rename this directory.**

| Path | One-line purpose |
|------|-----------------|
| `REQUIREMENTS.md` | Canonical R1–R7 requirement set |
| `POST-PROCESSING-CONTRACT.md` | Post-processing pipeline contract (data consumer side) |
| `SCHEMA.md` | Node/edge schema for the interop-tree format |
| `DIRTY-NOTES-EXAM.md` | Scratch examination of dirty-branch state |
| `DODGE-VS-DIRTY.md` | Dodge oracle vs dirty-branch diff ledger |
| `OOS-OPEN-ITEMS-AND-DIFF-PLAN.md` | Open items list + OOS↔LOS diff plan |
| `REFUTED-LOG.md` | Log of refuted hypotheses (anti-evidence archive) |
| `control/` | Control-flow nodes (C1–C6: app OCS SDK → cameraserver → HAL → CamX/CHI) |
| `data/` | Data-flow nodes (D1–D4: gralloc/CamxFormat → HAL fill → ImageReader → SF/EDR) |
| `facilitation/` | Facilitation nodes (E1–E5: stubs / system-framework / toggles / sepolicy / NCS-sensor-bridge) |
| `symptoms/` | Symptom nodes (S1–S8: preview freeze, no-JPEG, overexposure, copyMetadata, P010, strlennull, getOplusHwBuffer, 8K) |

### `docs/re-notes/`
Reverse-engineering field notes, one file per subsystem site. Each is a focused characterisation
of a specific binary, symbol, or ABI, linked from `los-impl/` blocked rows.

| File | One-line purpose |
|------|-----------------|
| `aec-hdrdetect-publish-RE.md` | AEC / HDR-detect publication-gate RE (R1 + doc-47) |
| `apsclient-bridge-RE.md` | APSClient bridge characterisation |
| `apsclient-onTransact-routing-RE.md` | APSClient `onTransact` routing map |
| `camx-loginfo-layout-and-groups.md` | CamX LogInfo struct layout + log-group constants |
| `camx-logmask-gate-FINDINGS.md` | CamX log-mask gate findings (clobber chain) |
| `camxcore-characterization-v16.1.0.md` | CamX core characterisation pinned to V16.1.0 |
| `decmetarefzero-upcall-RE.md` | `decMetaRefZero` upcall RE — R1 bridge JNI site |
| `edr-sf-readside-RE.md` | SurfaceFlinger EDR read-side RE (R3 / libgui ABI) |
| `gralloc-p010-chain-RE.md` | Gralloc P010 allocation chain RE (S5) |
| `libapsfixup-interposition-RE.md` | libapsfixup interposition characterisation (retired path) |
| `oem-binder-ontransact-RE.md` | OEM `onTransact` binder map (doc-48 Depth-1/Depth-2, R4) |
| `oem-ext-depth2-lifecycle-RE.md` | R4 Depth-2 hook lifecycle/dispatch RE — WIRED→FIXED (op_mode clobber, `a536f0a481`) |
| `cameraserver-static-link-build-traps.md` | cameraserver static-link + ccache stale-object + adb-remount traps (load-bearing for ALL frameworks/av work) |
| `aps-metadata-buffer-init-RE.md` | APS result metadata-buffer HW-mem ops (`gAPSOps.pfnAPSMemHW{Acquire,Release}` NULL, OCS-SDK consumer) — side-finding, NOT the freeze |

---

## Loose top-level docs files

| File | One-line purpose |
|------|-----------------|
| `OOS-BASELINE-V16.0.8.300.md` | OOS baseline capture record pinned to build 16.0.8.300 |
| `OOS-BASELINE-V16.1.0.md` | OOS baseline capture record pinned to V16.1.0 |
| `REFERENCE_DECISIONS.md` | Authoritative decision log for reference design choices |

### Notable cross-reference
`docs/rearch/50-probe-persistence-and-anchoring.md` is also the conceptual parent of the
`tools/persistence/` kit and the `_anchor.js` Frida script in `tools/frida/`. Changes to the
persistence/anchoring strategy should reconcile with that document.
