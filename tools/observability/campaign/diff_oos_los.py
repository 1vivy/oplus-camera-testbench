#!/usr/bin/env python3
"""diff_oos_los.py — the OOS↔LOS B-side diff harness.

The OOS baseline is the DIFF ORACLE. Replay the SAME condition on LOS, then run this against the matched
capture dirs: it emits a per-contract divergence table (OOS value | LOS value | MATCH/DIVERGE). The FIRST
diverging checkpoint along a symptom's node path is where LOS went wrong.

Two value sources, both already produced by the campaign (symmetric on both sides):
  1. parse_condition verdict.json rows  -> {row: stock_value}   (the symptom-row detectors)
  2. probe checkpoint lines             -> the `[TAG] ... verdict=/=value` records the symmetric frida
     probes emit (EDR/P010/metadata/turbohdr/gralloc) under app_probes/*.log and frida/*.log

Usage:
  diff_oos_los.py <oos_cond_dir> <los_cond_dir>        # e.g. reference/campaign/photo-hdr  /path/los/photo-hdr
  diff_oos_los.py --self <oos_cond_dir>                # sanity: diff a dir against itself (all MATCH)
No LOS captures exist yet (stock-only phase) — --self validates the mechanics now; the real diff runs at LOS bringup.
"""
import sys, os, json, re, glob

# checkpoint extractors: probe-log basename -> regex capturing (key, value) comparable records.
PROBE_CHECKPOINTS = {
    "trace_turbohdr_tag":          r"\[TALLY\].*deref\(n=\d+ nonNull=(\d+) NULL=(\d+)\)",      # R6: nonNull,NULL
    "trace_gralloc_p010_chain":    r"\[GP010 lock\].*planeCount=(\d+)|contiguous=([YN])",       # C: planeCount/contiguity
    "trace_p010_planes":           r"camApsBufferLockPlanes.*descriptor\(ret\)=(0x[0-9a-f]+)|planeCount=(\d+)",
    "trace_aps_metadata_lifecycle":r"RELEASE signal|copyMetadata|balance=(-?\d+)",              # R1/B4: upcall present + balance
    "trace_edr_invocation":        r"getBlastSurfaceControl.*->\s*(Surface|null)|setEdrViewTransform",  # R3: real-vs-null + curve fires
    "enable_camx_logging":         r"operation_mode:\s*(0x[0-9a-f]+)",                            # C3: op_mode
}

def load_verdict(d):
    f = os.path.join(d, "verdict.json")
    if not os.path.isfile(f): return {}
    try:
        j = json.load(open(f))
    except Exception:
        return {}
    return {r.get("row"): r.get("stock_value") for r in j.get("rows", []) if r.get("row")}

def probe_signature(d):
    """Reduce each probe log to a stable signature (the checkpoint fact), so OOS vs LOS is comparable."""
    sig = {}
    for log in glob.glob(os.path.join(d, "app_probes", "*.log")) + glob.glob(os.path.join(d, "frida", "*.log")):
        base = re.sub(r"\.log$", "", os.path.basename(log))
        pat = PROBE_CHECKPOINTS.get(base)
        if not pat: continue
        hits = []
        try:
            for ln in open(log, errors="replace"):
                m = re.search(pat, ln)
                if m:
                    hits.append(tuple(g for g in m.groups() if g) or (m.group(0)[:40],))
        except Exception:
            continue
        if hits:
            # signature = the FIRED checkpoint (did it fire? + the distinct values seen)
            distinct = sorted(set(hits))
            sig[base] = {"fired": True, "n": len(hits), "values": distinct[:6]}
        else:
            sig[base] = {"fired": False}
    return sig

def diff(oos, los, self_mode=False):
    ov, lv = load_verdict(oos), load_verdict(oos if self_mode else los)
    os_, ls_ = probe_signature(oos), probe_signature(oos if self_mode else los)
    print(f"# OOS↔LOS diff   OOS={oos}   LOS={'(self)' if self_mode else los}\n")
    diverged = []

    print("## symptom-row checkpoints (parse_condition)")
    print(f"  {'row':<34} {'OOS':<22} {'LOS':<22} verdict")
    for row in sorted(set(ov) | set(lv)):
        o, l = ov.get(row, "—"), lv.get(row, "—")
        v = "MATCH" if str(o) == str(l) else "DIVERGE"
        if v == "DIVERGE": diverged.append(("row", row, o, l))
        print(f"  {row[:34]:<34} {str(o)[:22]:<22} {str(l)[:22]:<22} {v}")

    print("\n## probe checkpoints (symmetric frida)")
    for p in sorted(set(os_) | set(ls_)):
        o, l = os_.get(p, {"fired": False}), ls_.get(p, {"fired": False})
        v = "MATCH" if o == l else "DIVERGE"
        if v == "DIVERGE": diverged.append(("probe", p, o, l))
        print(f"  {p:<32} OOS={_fmt(o)}  LOS={_fmt(l)}  {v}")

    print("\n## ROOT (first divergence)")
    if not diverged:
        print("  none — OOS and LOS match on every captured checkpoint (good, or self-mode).")
    else:
        k, name, o, l = diverged[0]
        print(f"  >>> {k}:{name}  OOS={o}  LOS={l}  <<<  — start the LOS root hunt at this checkpoint's node path.")
        if len(diverged) > 1:
            print(f"  (+{len(diverged)-1} more downstream divergences — fix the first, re-diff.)")
    return 0

def _fmt(s):
    if not s.get("fired"): return "DARK"
    return f"fired(n={s['n']},{s['values']})"

def main():
    a = sys.argv[1:]
    if len(a) == 2 and a[0] == "--self":
        return diff(a[1], a[1], self_mode=True)
    if len(a) == 2:
        return diff(a[0], a[1])
    print(__doc__); return 2

if __name__ == "__main__":
    sys.exit(main())
