<!-- Parent: ../AGENTS.md -->

# perfetto — (planned kit, not yet implemented)

Placeholder for a perfetto frame-timeline capture kit. Empty by design; documented so the reference in
`../TEST-PLAN.md` (§"A `perfetto/` kit would give frame-timeline visibility on the freeze that ANR dumps
approximate") does not dangle.

**Intended scope (when built):** a `perfetto` system-trace config + runner that captures the GPU/SF
frame-timeline across a capture cycle, to see the preview-freeze (#1) as a frame-timeline stall rather than
inferring it from `debuggerd -b` daemon backtraces. Until then, the freeze is observed via the
`probe_aps_preview_routine` / `probe_sendinputdata_gate` Gate-B traces (doc-50) and the daemon backtraces in
`capture/ab_capture.sh`.
