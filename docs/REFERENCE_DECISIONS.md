<!-- STATUS: VERIFIED — evidence-anchored (Ghidra/device capture); no inference-surgery needed (doc-50 method). -->
# Reference copy/reject decisions

## Copied docs

- `rearch/35` — 8K/HDR-preview/long-exposure plumbing; required by doc-48 and observability attribution.
- `rearch/38` — clean camera-module architecture; required by doc-46 matrix framing.
- `rearch/40`–`49` — recent OOS-baseline/matrix/EDR/OEM-transaction chain, including doc-42 and doc-46/48/49.

## Copied tool references

- `tools/observability/**` excluding `.omc` state.
- `tools/enable_verbose.sh`, `tools/patch_chi_logclobber.py`, and the Frida scripts directly named by the observability tables/runbooks.
- Dodge source repos live separately under `dodge-camera-port/repos/**`; docs/tools/reference are top-level siblings for the clean capture matrix.

## Rejected / not copied

- Older `rearch/00`–`34` chain except `35`: useful history, but imports OP15 prior-work ambiguity and is not needed to run the v3 OOS baseline matrix.
- `rearch/14`, `16`, `19`, `20`, `22`, `23`, `28`, `33`: referenced by doc-42/46 as historical support, but rejected from this clean reference to avoid reintroducing old shim/debate context. If needed, read from the original repo only as provenance.
- Raw `reference/**` historical captures from OP15: rejected. New captures should be generated into top-level `reference/ab/` using this tree.
- External dump paths such as `dump201_full/...`: not present in this repo and not copied; docs preserve the citation only.
