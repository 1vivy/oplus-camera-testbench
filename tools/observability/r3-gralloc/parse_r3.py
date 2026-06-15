#!/usr/bin/env python3
"""r3-gralloc/parse_r3.py — join the r3 capture artifacts and print the divergence-column verdict.

Reads one or two capture dirs (reference/r3/oos reference/r3/los), extracts the doc-42 §2.5 decision
columns per side, and prints an OOS↔LOS comparison so the diverging column = the root.

Columns (per side):
  camxformat_mapped : libcamxexternalformatutils mapped in com.oplus.camera?      (10_ probe / maps)
  dlopen_result     : in-app dlopen of the authority -> OK | NULL                  (R3|DLOPEN)
  fallback_fires    : "Failed to link CamxFormatUtil" count                        (logcat / 10_ probe)
  alloc_usage       : vendor usage bits the P010 buffer is born with               (R3|ALLOC)
  lock_layout       : returned Cb offset / contiguity at lock                      ([lockYCbCr]/[PLANE_LAYOUTS])
  blob_cb           : blob getPlaneLayout verdict (aligned vs garbage)             ([BLOB getPlaneLayout])

Usage: parse_r3.py <dir> [<dir2>]      (stdlib only)
"""
import os
import re
import sys


def _read(path):
    try:
        with open(path, "r", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def _glob(d, *suffixes):
    out = []
    for fn in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        if fn.endswith(suffixes):
            out.append(os.path.join(d, fn))
    return out


def parse_side(d):
    """Extract the decision columns from one capture dir."""
    s = {"dir": d, "camxformat_mapped": "?", "dlopen_result": "?", "fallback_fires": 0,
         "alloc": [], "lock": [], "blob": [], "sym": []}
    # --- 10_ probe + maps: camxformat reachability ---
    probe = _read(os.path.join(d, "obs_r3_camxformat.txt"))
    maps = "".join(_read(p) for p in _glob(d, ".txt") if "maps_" in os.path.basename(p))
    if "IS mapped" in probe:
        s["camxformat_mapped"] = "YES (reachable in-app)"
    elif "NOT mapped" in probe:
        s["camxformat_mapped"] = "NO (unreachable in app ns)"
    elif maps:
        s["camxformat_mapped"] = "YES" if "camxexternalformat" in maps else "NO"
    m = re.search(r"fallback-fire-count[^:]*:\s*(\d+)", probe)
    if m:
        s["fallback_fires"] = int(m.group(1))
    # --- frida log: R3|DLOPEN, R3|ALLOC, R3|SYM, lock, blob ---
    frida = "".join(_read(p) for p in _glob(d, ".log"))
    logcat = "".join(_read(p) for p in _glob(d, ".txt") if "logcat" in os.path.basename(p))
    for ln in frida.splitlines():
        if "R3|DLOPEN" in ln and "camxexternalformat" in ln:
            s["dlopen_result"] = "NULL (FAILED)" if "NULL" in ln else "OK"
        elif "R3|ALLOC" in ln:
            s["alloc"].append(ln.split("R3|ALLOC", 1)[1].strip())
        elif "R3|SYM" in ln:
            s["sym"].append(ln.split("R3|SYM", 1)[1].strip())
        elif "[lockYCbCr]" in ln or ">>> chromaOffset" in ln or "impliedAlignedH" in ln:
            s["lock"].append(ln.strip())
        elif "[BLOB getPlaneLayout]" in ln or "Cb-lumaBase=" in ln:
            s["blob"].append(ln.strip())
    if s["fallback_fires"] == 0 and logcat:
        s["fallback_fires"] = len(re.findall(r"Failed to link CamxFormatUtil", logcat))
    if s["dlopen_result"] == "?" and "Failed to link CamxFormatUtil" in (frida + logcat):
        s["dlopen_result"] = "NULL (FAILED) [from log string]"
    return s


def fmt_side(s):
    out = [f"  dir              : {s['dir']}",
           f"  camxformat_mapped: {s['camxformat_mapped']}",
           f"  dlopen_result    : {s['dlopen_result']}",
           f"  fallback_fires   : {s['fallback_fires']}",
           f"  alloc records    : {len(s['alloc'])}" + (("  e.g. " + s['alloc'][0]) if s['alloc'] else "")]
    if s["sym"]:
        out.append("  camxformat syms  : " + " | ".join(s["sym"][:3]))
    if s["blob"]:
        garb = [b for b in s["blob"] if "GARBAGE" in b]
        out.append(f"  blob getPlaneLayout: {len(s['blob'])} records, {len(garb)} GARBAGE"
                   + (("  e.g. " + garb[0][:140]) if garb else ""))
    return "\n".join(out)


def verdict(sides):
    print("\n" + "=" * 78 + "\nVERDICT (doc-42 §2.5 decision columns)\n" + "=" * 78)
    if len(sides) < 2:
        print("Single side captured — run the other (OOS or LOS) for the A/B. Per-side facts above.")
        s = sides[0]
        if s["camxformat_mapped"].startswith("NO") or s["fallback_fires"] > 0 or "NULL" in s["dlopen_result"]:
            print(">>> This side shows the CamxFormatUtil authority UNREACHABLE / fallback firing →")
            print("    namespace mechanism SUPPORTED on this build. Confirm the OTHER side has it reachable.")
        return
    a, b = sides[0], sides[1]
    na, nb = os.path.basename(a["dir"].rstrip("/")) or "A", os.path.basename(b["dir"].rstrip("/")) or "B"
    rows = [("camxformat_mapped", a["camxformat_mapped"], b["camxformat_mapped"]),
            ("dlopen_result", a["dlopen_result"], b["dlopen_result"]),
            ("fallback_fires", str(a["fallback_fires"]), str(b["fallback_fires"]))]
    w = max(len(r[0]) for r in rows)
    print(f"  {'column'.ljust(w)} | {na:<28} | {nb:<28} | diverges?")
    print("  " + "-" * (w + 2 + 31 + 31 + 10))
    namespace_div = False
    for name, va, vb in rows:
        d = "  <<< DIVERGES" if va != vb else ""
        if d and name in ("camxformat_mapped", "dlopen_result", "fallback_fires"):
            namespace_div = True
        print(f"  {name.ljust(w)} | {va:<28} | {vb:<28} |{d}")
    print()
    if namespace_div:
        print(">>> ROOT = NAMESPACE. The CamxFormatUtil authority is reachable on one side, not the other →")
        print("    doc-42 §2.5 mechanism CONFIRMED. Fix = expose libcamxexternalformatutils.so to the")
        print("    com.oplus.camera namespace (public.libraries / ld.config parity, ffb638b lever class).")
        print("    Predicted: alloc_usage MATCHES (compare the R3|ALLOC lines below to verify).")
    else:
        print(">>> camxformat reachability MATCHES across sides → mechanism REFUTED. Compare the R3|ALLOC")
        print("    usage/format/stride lines + the lock layout for a NON-usage allocation-input divergence (alt-ii).")
    print("\n  R3|ALLOC (compare usage/format/stride across sides):")
    for s, nm in ((a, na), (b, nb)):
        print(f"    [{nm}] " + (s["alloc"][0] if s["alloc"] else "(no alloc records — verify P010 capture fired)"))


def main():
    dirs = [d for d in sys.argv[1:] if os.path.isdir(d)]
    if not dirs:
        print(__doc__)
        sys.exit(2)
    sides = [parse_side(d) for d in dirs]
    for s in sides:
        print("-" * 78)
        print(fmt_side(s))
    verdict(sides)


if __name__ == "__main__":
    main()
