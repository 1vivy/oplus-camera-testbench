#!/usr/bin/env python3
"""strace/parse_strace.py — turn raw camera syscall traces into an env-failure A/B verdict.

The point: a byte-identical blob that behaves differently is failing on an ENVIRONMENT input. At the
syscall layer that input is concrete — a file that opens on OOS but ENOENTs on LOS, a connect/ioctl
the sepolicy lets through on one side and EACCES on the other. This parser ranks exactly those.

Maps directly onto the attribution matrix:
  - ENOENT on /vendor/etc/camera/*.txt        -> ROOT-A #2 (missing camxoverridesettings) — cheapest fix
  - EACCES/EPERM on allocator / mapper / AIDL  -> #5 (IMapper@4.0 NULL / gralloc) sepolicy denial
  - ENOENT/failed dlopen of an oplus *.so      -> a blob the LOS image never loads (libcsextimpl &c)
  - ioctl = -1 on /dev/video* /dev/v4l*        -> sensor/IFE bring-up failure below CamX

Usage: parse_strace.py <oos_dir> [<los_dir>]   # one dir = single-side triage; two = A/B diff
"""
import os, re, sys, glob, collections

# fd-decoded path appears as <path> via strace -y, e.g. openat(AT_FDCWD<...>, "/vendor/etc/camera/x")
PATH_RE = re.compile(r'"([^"]+)"')
ERR_RE  = re.compile(r'=\s*-1\s+(E[A-Z]+)')
CALL_RE = re.compile(r'\b(openat|open|access|faccessat|stat|statx|connect|ioctl)\(')

INTEREST = re.compile(r'camera|graph_desc|override|\.so\b|/odm/|/vendor/etc|mapper|allocator|gralloc|video|v4l', re.I)

def read_traces(d):
    txt = ""
    for f in glob.glob(os.path.join(d, '*.strace')):
        try: txt += open(f, errors='ignore').read()
        except OSError: pass
    return txt

def failures(txt):
    """Return {(errno, call, path): count} for every failing syscall of interest."""
    out = collections.Counter()
    for line in txt.splitlines():
        m = ERR_RE.search(line)
        if not m:
            continue
        errno = m.group(1)
        cm = CALL_RE.search(line)
        call = cm.group(1) if cm else '?'
        pm = PATH_RE.search(line)
        path = pm.group(1) if pm else line.split(maxsplit=1)[-1][:60]
        if call == 'ioctl' or INTEREST.search(path):
            out[(errno, call, path)] += 1
    return out

def classify(errno, call, path):
    p = path.lower()
    if errno == 'ENOENT' and 'override' in p:          return 'ROOT-A #2  (missing camxoverridesettings.txt — CHEAP FIX)'
    if errno == 'ENOENT' and '/vendor/etc/camera' in p: return 'config gap  (vendor camera config absent)'
    if errno in ('EACCES','EPERM') and re.search(r'mapper|allocator|gralloc', p): return '#5  (allocator/mapper sepolicy denial)'
    if errno in ('EACCES','EPERM'):                     return 'sepolicy denial  (audit2allow candidate)'
    if errno == 'ENOENT' and p.endswith('.so'):         return 'blob not on image  (dlopen miss)'
    if call == 'ioctl' and re.search(r'video|v4l', p):  return 'sensor/IFE ioctl fail  (below CamX)'
    return ''

def report_side(name, fails):
    print(f"\n=== {name}: failing syscalls of interest (top 40) ===")
    if not fails:
        print("  (none — clean, or strace did not attach / wrong window)")
        return
    print("  %-6s %-9s %5s  %s" % ("errno", "call", "count", "path  [classification]"))
    for (errno, call, path), n in fails.most_common(40):
        tag = classify(errno, call, path)
        print("  %-6s %-9s %5d  %s%s" % (errno, call, n, path, ("   <- "+tag) if tag else ""))

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    oos = sys.argv[1]
    fo = failures(read_traces(oos))
    report_side(os.path.basename(oos.rstrip('/')) or 'side-A', fo)

    if len(sys.argv) >= 3:
        los = sys.argv[2]
        fl = failures(read_traces(los))
        report_side(os.path.basename(los.rstrip('/')) or 'side-B', fl)

        # the A/B tell: failures present on LOS but NOT on OOS = the divergence the port introduced
        ok = {(e,c,p) for (e,c,p) in fo}
        new = [(k,v) for k,v in fl.items() if k not in ok]
        print("\n=== A/B DIVERGENCE: failures on LOS that are ABSENT on OOS (the port regressions) ===")
        if not new:
            print("  (none — syscall failure sets match; divergence is above the syscall layer)")
        for (errno, call, path), n in sorted(new, key=lambda x: -x[1])[:40]:
            tag = classify(errno, call, path)
            print("  %-6s %-9s %5d  %s%s" % (errno, call, n, path, ("   <- "+tag) if tag else ""))
        print("\nRule: a path that opens on OOS but ENOENT/EACCES on LOS is a copy-this-file or")
        print("      add-this-sepolicy fix — the cheapest class in the attribution matrix.")

if __name__ == '__main__':
    main()
