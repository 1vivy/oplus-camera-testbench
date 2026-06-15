# GOLDEN BASELINE — full-baseline

**VERDICT: GOLDEN**

| stage | result |
|---|---|
| preflight | ready |
| modes gate | PASS |
| full_baseline (lanes 1-4) | ran |
| strace lane | ran |
| signal (parse_condition) | all-stable |
| frida coverage | FRIDA_COVERAGE=13/13 verdict=FULL |

> **Frida coverage 13/13 (FULL):** 7 armed-with-data (dump_camxsettings, probe_aec_hdrdetect,
> hook_configure_streams, trace_p010_planes, trace_preview_delivery, r3_gralloc, r4_ext_server) +
> 6 hook-only/NODATA (the 2 verbosity levers emit no events; observe_getmetadata's libAlgoProcess loads in
> the provider not the app pid; trace_edr_invocation / trace_aps_metadata_lifecycle armed but no qualifying
> event; r4_ext_client watched OEM codes 10000-10022 with none firing in-window). 0 DEAD, 0 MISSING — every
> expected probe attached. See frida_coverage.txt. This golden is **frida-inclusive** (not the frida-less
> framework+graph denominator at reference/ab/oos-photo-v16.0.8.300/).

## Artifacts (raw lanes — indexed, not duplicated)
```
campaign:  /home/vivy/oplus-final/reference/campaign/full-baseline/
r3:        /home/vivy/oplus-final/reference/r3/full-baseline/
r4:        /home/vivy/oplus-final/reference/r4/full-baseline/
strace:    /home/vivy/oplus-final/reference/strace/full-baseline/
```

Parsed: parse_condition.txt, frida_coverage.txt, parse_r3.txt.
Resolve upward to root via the attribution tree (docs/interop-tree/ + tables/attribution-matrix.md).
