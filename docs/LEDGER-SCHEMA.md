# LEDGER-SCHEMA — which ledger, when

Two ledgers, mapped to the push tiers (`WORKFLOW.md`). Don't mix them.

| Ledger | Tier | Records | Format |
|--------|------|---------|--------|
| `camera-bringup/records/LEDGER.md` | 0 / 1 | overlay tests + wip builds — fast iteration, device-side | per-iteration narrative: **Action / Result / Root cause / Fix chosen / Next** |
| `infiniti-camera-port/ITERATION-LOG.md` | 2 | canonical version builds (vX.Y) shipped to the device | per-build: **thesis · transforms table · build result · in-image verify · flash status** |

## When to write which
- Ran a reversible overlay or a throwaway `wip/<topic>` build? → `camera-bringup/records/LEDGER.md`.
  Cheap, frequent, may be abandoned. Mark wip-build entries `WIP`.
- Promoted to `cam-final` and built a version artifact? → a new `ITERATION-LOG.md` build entry.

## Promotion (one-way)
A Tier-0/1 finding graduates to an `ITERATION-LOG.md` transform row **only when it lands on `cam-final` and
builds**. The transforms table columns: `# · transform · repo/path · class (source edit / build input /
host env) · reconciliation (PROMOTE / revert note)`. Every shipped binary must trace to a `cam-final` commit.
Always include an **in-image verify** line (what you grepped/observed in the built image), e.g. the DV fix:
`c2.qti.dv ×3 in canoe_v2.xml (extract-fixup-owned, no manual restore)`.

## Retrieval (so the ledger's evidence is reachable)
`oplus-logs` bridges the Mac and the builder/capture store. It lives in `~/.local/bin` (env-coupled,
**never committed**); reinstall it there if missing.

| Need | Command |
|------|---------|
| build-host snapshot (latest artifact/log, tree HEADs) | `oplus-logs status` |
| tail/list a build log | `oplus-logs build-log [id\|latest] [-f]` |
| list / fetch a ROM zip | `oplus-logs artifact ls` · `oplus-logs artifact pull <zip>` |
| read the build-host ops guide | `oplus-logs build-doc` |
| capture-store slices (reference/) | `oplus-logs ls\|grep\|pull\|cond pull <c>` |

Env: `OPLUS_REMOTE` (default `vivy@aosp-builder`), `OPLUS_RROOT` (capture store), `OPLUS_SROOT`
(`/srv/android`), `OPLUS_ARTIFACT_DIR` (local landing for pulled zips).
