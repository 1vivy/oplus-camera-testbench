#!/usr/bin/env python3
"""debug/parse_tombstone.py — distil an Android tombstone to the one line that attributes the crash.

ab_capture.sh COPIES tombstones but never reads them. This extracts the signal: abort/signal, the
crashing frame (module + offset — the form the gAPSOps/offset tooling speaks), and matches the two
crash signatures this port already knows, so a fresh tombstone is triaged in one line instead of read
top to bottom.

Known signatures (attribution matrix):
  APSMetadata::copyMetadata+<n>  / pc in libAlgoProcess.so   -> #4 back-to-back UAF (/system result-lifetime)
  setProcessOtherParams / strlen / TurboRaw+0x5880           -> #6 strlen-null TurboHDR (/vendor OEM-tag publish)

Usage: parse_tombstone.py <tombstone_file | dir> [more...]
"""
import os, re, sys, glob

SIG_RE   = re.compile(r'signal\s+\d+\s+\((\w+)\)(?:.*?code[^,]*)?(?:.*?fault addr\s+(\S+))?', re.I)
ABORT_RE = re.compile(r'Abort message:\s*(.*)')
# backtrace frame: "  #00 pc 0000000000abc123  /odm/lib64/libAlgoProcess.so (symbol+0x..)"
FRAME_RE = re.compile(r'#(\d+)\s+pc\s+([0-9a-f]+)\s+(\S+)(?:\s+\(([^)]*)\))?')

KNOWN = [
    (re.compile(r'copyMetadata|APSMetadata'), "#4 back-to-back copyMetadata UAF -> /system frameworks/av result-lifetime (blob innocent). Repro: ab_capture.sh burst; fix = provider/OCS result ref-hold."),
    (re.compile(r'setProcessOtherParams|strlen|TurboRaw\+0x5880|TurboHDR'), "#6 strlen-null TurboHDR -> /vendor OEM IPE tag never published (sibling of #2; test whether ROOT-A override also publishes it)."),
]

def frames(txt):
    out = []
    for m in FRAME_RE.finditer(txt):
        out.append((m.group(1), m.group(3), (m.group(4) or '').strip()))
    return out

def one(path):
    try: txt = open(path, errors='ignore').read()
    except OSError as e: print("  cannot read %s: %s" % (path, e)); return
    if 'backtrace' not in txt and 'signal' not in txt.lower():
        return  # not a tombstone
    print("\n=== %s ===" % path)
    sig = SIG_RE.search(txt); ab = ABORT_RE.search(txt)
    if sig: print("  signal : %s%s" % (sig.group(1), ("  faultaddr="+sig.group(2)) if sig.group(2) else ""))
    if ab:  print("  abort  : %s" % ab.group(1).strip())
    fr = frames(txt)
    crash = next((f for f in fr if f[2] and 'libc' not in f[1]), fr[0] if fr else None)
    if crash:
        print("  crash  : #%s  %s  (%s)" % (crash[0], crash[1], crash[2] or '?'))
    # top frames for context
    for n, mod, sym in fr[:6]:
        print("    #%-2s %-45s %s" % (n, os.path.basename(mod), sym))
    hay = txt
    for rx, verdict in KNOWN:
        if rx.search(hay):
            print("  >> MATCH: %s" % verdict)
            break
    else:
        print("  >> unrecognized signature — map the crash module+offset via the ELF/gAPSOps tooling.")

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    paths = []
    for a in sys.argv[1:]:
        if os.path.isdir(a): paths += sorted(glob.glob(os.path.join(a, '*tombstone*')) + glob.glob(os.path.join(a, 'tombstone*')))
        else: paths.append(a)
    if not paths: print("no tombstones found"); sys.exit(1)
    for p in paths: one(p)

if __name__ == '__main__':
    main()
