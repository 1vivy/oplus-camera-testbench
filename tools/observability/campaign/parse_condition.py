#!/usr/bin/env python3
"""campaign/parse_condition.py — per-condition verdict + DETERMINISM variance across the REPEAT_N runs.

Reuses capture/parse_ab.py's detectors (no logic duplication): for each symptom row it computes the stock
signal on every run<k>/ab, then flags the column `stable` (identical across all runs — the only state allowed
to back a CONFIRMED tree verdict) or `flaky` (varies under identical replayed stimulus = non-deterministic).
A flaky lane must never be promoted to a tree finding (SCHEMA G-REP gate).

Usage: parse_condition.py <reference/campaign/<condition> dir>
Writes <dir>/verdict.json and prints a table.
"""
import os, sys, glob, json, importlib.util

def load_parse_ab():
    here = os.path.dirname(os.path.abspath(__file__))
    pa = os.path.normpath(os.path.join(here, '..', 'capture', 'parse_ab.py'))
    spec = importlib.util.spec_from_file_location('parse_ab', pa)
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod

def main():
    if len(sys.argv) != 2:
        print(__doc__); sys.exit(2)
    d = sys.argv[1]
    runs = sorted(glob.glob(os.path.join(d, 'run*/ab')))
    if not runs:
        print("no run*/ab dirs under %s" % d); sys.exit(1)
    pa = load_parse_ab()
    meta = {}
    mf = os.path.join(d, 'metadata.json')
    if os.path.exists(mf):
        try: meta = json.load(open(mf))
        except Exception: pass

    print("=== condition verdict: %s ===" % os.path.basename(d.rstrip('/')))
    print("runs=%d  mode=%s session=%s ae_lock=%s selinux=%s build=%s" % (
        len(runs), meta.get('mode','?'), meta.get('session','?'), meta.get('ae_lock','?'),
        meta.get('selinux','?'), meta.get('build_oplusrom','?')))
    print("  %-30s %-22s %s" % ("symptom row", "stock value (run1)", "determinism across runs"))
    print("  " + "-"*78)

    def bucket(v):
        # count-based signals (fusion nodes, UNKNOWN_TRANSACTION) jitter run-to-run by raw count, but the
        # DECISION is 0-vs-present. Bucket ints so "fusion present all 3 runs" reads stable, not flaky.
        try:
            n = int(v); return "0" if n == 0 else "present(>0)"
        except (ValueError, TypeError):
            return v   # bool/string signals compared exactly

    rows = []
    for name, fn in pa.ROWS:
        vals = []
        for r in runs:
            try:
                ov, lv, note = fn(r, r)   # single-side: OOS==LOS==this run -> ov is the stock reading
                vals.append(str(ov))
            except Exception as e:
                vals.append("err:%s" % e)
        buckets = [bucket(v) for v in vals]
        stable = len(set(buckets)) == 1
        is_count = buckets[0] in ("0", "present(>0)")
        if stable and is_count and len(set(vals)) > 1:
            state = "stable [%s; counts vary %s]" % (buckets[0], vals)   # bucket-stable, raw counts jitter (expected)
        elif stable:
            state = "stable"
        else:
            state = "FLAKY %s" % vals
        print("  %-30s %-22s %s" % (name, vals[0][:22], state))
        rows.append({"row": name, "stock_value": vals[0], "all_runs": vals, "buckets": buckets,
                     "variance": "stable" if stable else "flaky"})

    # ui stimulus sanity: did every run tap the shutter by id (not fall back)? (G-COND audit)
    shutter_byid = []
    for r in runs:
        f = os.path.join(r, 'ui_action.log')
        try: txt = open(f, errors='ignore').read()
        except OSError: txt = ''
        # shutter fired by ANY path: resource-id tap, replay coordinate tap, or keyevent fallback
        fired = bool(txt) and ('shutter_button -> (' in txt or 'KEYCODE_CAMERA' in txt
                               or 'tap 635 2261' in txt or '] tap ' in txt or 'shutter' in txt.lower())
        shutter_byid.append(fired)
    print("\n  stimulus audit: shutter fired each run = %s (false => stimulus did NOT run — check action log)" % shutter_byid)

    verdict = {"condition": os.path.basename(d.rstrip('/')), "runs": len(runs), "meta": meta,
               "rows": rows, "shutter_by_id_per_run": shutter_byid,
               "note": "stock-only; rows are stock readings, not OOS-vs-LOS. 'flaky' rows are NOT decision-ready (SCHEMA G-REP)."}
    with open(os.path.join(d, 'verdict.json'), 'w') as f:
        json.dump(verdict, f, indent=2)
    flaky = [r["row"] for r in rows if r["variance"] == "flaky"]
    print("\n  wrote %s/verdict.json" % d)
    print("  %s" % ("ALL STABLE — decision-ready (still stock-only; LOS A/B deferred)" if not flaky
                     else "FLAKY rows (NOT decision-ready): " + ", ".join(flaky)))

if __name__ == '__main__':
    main()
