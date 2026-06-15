#!/usr/bin/env python3
"""capture/parse_ab.py — turn an ab_capture.sh OOS+LOS pair into an automatic attribution verdict.

ab_capture.sh produces the artifacts but, unlike the r3/r4 kits, had NO parser — so diffing meant
eyeballing 122k-line logs by hand. This reads the OOS dir and the LOS dir and prints the exact tells
from AB-RUNBOOK.md "What to diff", each tied to its attribution-matrix row, with an OOS-vs-LOS verdict.

It is a triage gate, not proof: a tell firing says "this row is live in this capture", pointing you at
the right frida/strace kit — it does not by itself close the row.

Usage: parse_ab.py <oos_dir> <los_dir>      (dirs from `adb pull /data/local/tmp/obs_ab_*`)
"""
import os, re, sys, glob

def slurp(d, *pats):
    out = ""
    for pat in pats:
        for f in glob.glob(os.path.join(d, pat)):
            try: out += open(f, errors='ignore').read()
            except OSError: pass
    return out

def logcat(d):    return slurp(d, 'logcat_all.txt', 'logcat_*.txt')
def anr(d):       return slurp(d, 'anr_traces.txt', 'traces*.txt', 'app_backtrace.txt')
def tombs(d):     return slurp(d, 'tombstone*', '*tombstone*')
def sf(d):        return slurp(d, 'sf_pre.txt', 'sf_post.txt')
def dumps(d):     return slurp(d, 'dumpsys_camera_*.txt')

# ---- per-symptom detectors: each returns (oos_signal, los_signal, note) ----
FUSION = ['MultiCameraReprocessRealtime','MCXSuperFG','OplusSATFusionOfflineReprocess','WriteIccProfile']

def t_fusion(o, l):      # G2 / #2 — snapshot reprocess graph present?
    co = sum(o.count(k) for k in FUSION); cl = sum(l.count(k) for k in FUSION)
    return co, cl, "fusion-graph node mentions in logcat (OOS has them; LOS≈0 => graph-selection divergence)"

def t_hdr(o, l):         # #2 — hdr_detected publish rc
    def rc(t):
        m = re.findall(r'hdr_detected.*?rc\s*=\s*(-?\d+)', t) or re.findall(r'stats_control\.hdr_detected[^\n]*?(-?\d+)', t)
        return m[-1] if m else ('present' if 'hdr_detected' in t else 'none')
    return rc(o), rc(l), "com.qti.stats_control.hdr_detected publish rc (OOS rc=0 vs LOS rc=-2 = ROOT-A)"

def t_copymeta(o, l):    # #4 — copyMetadata UAF
    pat = r'APSMetadata::copyMetadata|copyMetadata\+\d+|SIGSEGV.*copyMetadata'
    return bool(re.search(pat, o)), bool(re.search(pat, l)), "APSMetadata::copyMetadata SIGSEGV (UAF) in tombstone/log"

def t_freeze(o, l):      # #1 — preview frame-1 stall
    def stalled(t):
        if not t.strip(): return 'no-capture'
        # debuggerd -b (native, all-thread) backtrace: Java 'onImageAvailable' never appears here, so the
        # old ANR heuristic mis-reads it as 'stalled'. With native bt we can only confirm it was captured;
        # the real freeze call (where APS/preview thread is parked) is a MANUAL read of the daemon bt.
        if re.search(r'sysTid=|>>> .* <<<|Cmd line:', t): return 'bt-captured(manual-read)'
        return 'active' if re.search(r'onImageAvailable', t) and not re.search(r'Blocked|Waiting.*onImage', t) else 'stalled/absent'
    return stalled(o), stalled(l), "thread state from debuggerd/ANR (native bt = manual read; freeze = APS/preview thread parked — check *_daemon_bt)"

def t_edr(o, l):         # #3 / G6 — display HDR caps (device reports supportedHdrTypes= + ColorMode::, not HLG/PQ literals)
    def caps(t):
        hdr = re.search(r'supportedHdrTypes=([^\s,}]+)', t)
        cm  = re.search(r'Current color mode:\s*(\S+)', t)
        explicit = bool(re.search(r'\b(HLG|ST2084|PQ|DOLBY)\b', t, re.I))
        parts = []
        if hdr: parts.append('hdr=' + hdr.group(1))
        if cm:  parts.append(cm.group(1))
        if explicit: parts.append('HLG/PQ')
        return ' '.join(parts) if parts else 'none'
    return caps(o), caps(l), "SF supportedHdrTypes + current ColorMode (OOS vs LOS divergence = over-exposure/EDR co-factor)"

def t_8k(o, l):          # #8 — configure_streams -38
    pat = r'configure_streams.*-38|0x80a9.*-38|-38.*0x80a9|EISv2.*bypass'
    return bool(re.search(pat, o)), bool(re.search(pat, l)), "8K configure_streams(0x80a9) = -38 (EISv2 pure-bypass)"

def t_oem(o, l):         # G5 — OEM binder txns dropped
    return o.count('UNKNOWN_TRANSACTION'), l.count('UNKNOWN_TRANSACTION'), "media.camera UNKNOWN_TRANSACTION (OEM 100xx dropped on LOS)"

ROWS = [
    ("#2  no-JPEG / fusion graph",      lambda o,l: t_fusion(logcat(o), logcat(l))),
    ("#2  hdr_detected publish",        lambda o,l: t_hdr(logcat(o), logcat(l))),
    ("#4  copyMetadata UAF",            lambda o,l: t_copymeta(tombs(o)+logcat(o), tombs(l)+logcat(l))),
    ("#1  preview freeze",              lambda o,l: t_freeze(anr(o), anr(l))),
    ("#3/G6 display HDR caps",          lambda o,l: t_edr(sf(o), sf(l))),
    ("#8  8K configure_streams -38",    lambda o,l: t_8k(logcat(o), logcat(l))),
    ("G5  OEM binder dropped",          lambda o,l: t_oem(logcat(o), logcat(l))),
]

def verdict(name, ov, lv):
    if isinstance(ov, bool):
        if ov and not lv:   return "DIVERGES (OOS yes / LOS no)  <- live"
        if not ov and lv:   return "DIVERGES (LOS-only)          <- live"
        if ov and lv:       return "both present"
        return "neither (not exercised this cycle?)"
    if isinstance(ov, int):
        if ov and not lv:   return "DIVERGES (OOS>0 / LOS=0)     <- live"
        if ov != lv:        return "differs"
        return "match"
    # strings
    return "DIVERGES  <- live" if ov != lv else "match"

def main():
    if len(sys.argv) != 3:
        print(__doc__); sys.exit(2)
    oos, los = sys.argv[1], sys.argv[2]
    print("=== ab_capture A/B verdict ===")
    print("OOS=%s\nLOS=%s\n" % (oos, los))
    # confirm the stimulus matched (the A/B is only valid if it did)
    mo, ml = slurp(oos,'meta.txt'), slurp(los,'meta.txt')
    so = re.search(r'stimulus=(\S+)', mo); sl = re.search(r'stimulus=(\S+)', ml)
    print("stimulus:  OOS=%s  LOS=%s%s\n" % (so.group(1) if so else '?', sl.group(1) if sl else '?',
          "   *** MISMATCH — re-run with the same mode! ***" if (so and sl and so.group(1)!=sl.group(1)) else ""))
    print("  %-30s %-14s %-14s %s" % ("symptom (matrix row)", "OOS", "LOS", "verdict"))
    print("  " + "-"*86)
    for name, fn in ROWS:
        try: ov, lv, note = fn(oos, los)
        except Exception as e: ov, lv, note = 'err', str(e), ''
        print("  %-30s %-14s %-14s %s" % (name, str(ov), str(lv), verdict(name, ov, lv)))
        print("  %-30s %s" % ("", "↳ " + note))
    print("\nNext: a 'live' row -> open its dedicated kit. #2 hdr -> dump_camxsettings.js (G3);")
    print("      #1 freeze -> trace_preview_delivery.js; #8 -> r4-oem-transact/ + hook_configure_streams.js;")
    print("      a config ENOENT behind any of these -> ../strace/parse_strace.py.")

if __name__ == '__main__':
    main()
