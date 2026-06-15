#!/usr/bin/env python3
# campaign/frida_coverage.py — assert the frida lanes ACTUALLY armed + captured, not just "ran".
#
# WHY: baseline.sh used to declare VERDICT=GOLDEN on `full_baseline exit 0` + parse all-stable. But a
# frida probe can exit 0 having produced a 0-byte log (the attach-race / frida-17 static-API silent-fail
# class). A golden baseline "needs it all" — so this parser opens every expected probe's log(s) and
# classifies the PROBE (grouped across its timestamped attach attempts) as:
#   ARMED   — at least one attempt installed a hook / emitted a data line (positive marker present)
#   NODATA  — armed (hook installed) but no events in the window (acceptable: a real "nothing fired" reading)
#   DEAD    — every attempt was empty / banner-only / errored ("Java is not defined", attach fail, …)
#   MISSING — no log file at all for an expected probe
# Coverage is full iff DEAD==0 and MISSING==0. NODATA does NOT void golden (absence of an event is a
# legitimate observation; a dead hook is not).
#
# Usage: frida_coverage.py <repo-root> <condition>
# Exits 0 if coverage is full (no DEAD/MISSING), else 1. Writes a table to stdout.
import os, sys, glob, re

# INSTALLED: proof a hook attached / the agent ran. Broad on purpose — many probes print their own
# arm banner (`[hook] (A)`, `★ … ON`, `★ PATCHED`/`retaa`, `[r4][server] … armed`) or, under the python
# `frida` CLI, emit `'type': 'send'` agent messages. A probe with ANY of these did NOT silently no-op.
INSTALLED_RE = re.compile(
    r'hooked |\[hook\]|\(F\) hooked|hooks armed|\barmed\b|arming|\[\*\]|★|PATCHED|retaa'
    r"|logging ON|OEM layer PRESENT|\[r4\]\[serv|\[r4\]\[clie|'type': 'send'|\"type\": \"send\""
    # generic: any line starting with an agent bracket-tag ([aec] [cfgstreams] [HDRDetect] [unclobber]…),
    # excluding the frida repl prompt [CPH…]. Robust to per-probe tag names without an allowlist.
    r'|^\s*\[(?!CPH)[A-Za-z]', re.M
)
# DATA: proof a real event/value was actually captured (distinguishes ARMED-with-signal from hook-only).
DATA_RE = re.compile(
    r'->\s*\{"|\]\s*->\s*\{"|"getOplus"|planeCount=|plane\[\d|\bHIT\b|\[HDR offsets\]|\bLEVER\('
    r'|processPreview x|beforeMetadata|onTransact|intCalls=[1-9]|strCalls=[1-9]|\(F\) hooked.*0x'
    r'|op_mode=0x|num_streams=|hdr_detected computed|\[HDRTrigger\]|\[HDRDetect\]|enable\(\+0x'
)
# FATAL: a hard attach/load failure. Only forces DEAD when NO install marker is present — narrow on
# purpose: `is not a function` / `TypeError` also appear as benign per-FIELD read errors inside richly
# working probes (e.g. trace_p010_planes plane[2] out-read), so they are NOT fatal markers.
FATAL_RE = re.compile(r'Failed to attach|Process terminated|Failed to load|unable to find module|Java is not defined')

def classify(paths):
    """Return (state, evidence) for one probe given all its candidate log paths (across attach retries).
    A probe is covered if ANY single attempt installed a hook — early attach-race 0-byte logs don't void a
    later successful retry. ARMED (real data) > NODATA (hook only) > DEAD (no hook anywhere)."""
    seen_any = False
    best = 'DEAD'; ev = ''
    for p in paths:
        if not os.path.isfile(p):
            continue
        seen_any = True
        try:
            txt = open(p, 'r', errors='replace').read()
        except OSError:
            continue
        sz = len(txt)
        installed = bool(INSTALLED_RE.search(txt))
        data      = bool(DATA_RE.search(txt))
        fatal     = bool(FATAL_RE.search(txt)) and not installed
        if data and not fatal:
            return ('ARMED', f'{os.path.basename(p)} ({sz}B, data)')
        if installed and not fatal:
            best = 'NODATA'; ev = f'{os.path.basename(p)} ({sz}B, hook-only)'
        elif best == 'DEAD':
            if fatal:    ev = f'{os.path.basename(p)} ({sz}B, attach-fail)'
            elif sz:     ev = f'{os.path.basename(p)} ({sz}B, banner-only)'
            else:        ev = f'{os.path.basename(p)} (0B)'
    if not seen_any:
        return ('MISSING', 'no log file')
    return (best, ev)

def main():
    if len(sys.argv) < 3:
        print('usage: frida_coverage.py <repo-root> <condition>'); return 2
    repo, cond = sys.argv[1], sys.argv[2]
    envf = os.path.join(repo, 'tools/observability/campaign/conditions', cond + '.env')
    extra, run_r3, run_r4 = '', '1', '1'
    if os.path.isfile(envf):
        for ln in open(envf, errors='replace'):
            m = re.match(r'\s*EXTRA_PROBES="([^"]*)"', ln);            extra = m.group(1) if m else extra
            m = re.match(r'\s*RUN_R3=(\d)', ln);                       run_r3 = m.group(1) if m else run_r3
            m = re.match(r'\s*RUN_R4=(\d)', ln);                       run_r4 = m.group(1) if m else run_r4

    APP = {'trace_edr_invocation','trace_motionphoto','probe_getoplushwbuffer','trace_preview_delivery',
           'trace_p010_planes','trace_aps_metadata_lifecycle','trace_turbohdr_tag','trace_gralloc_p010_chain',
           'probe_aps_preview_routine','probe_sendinputdata_gate'}
    SERVER = {'hook_before_configure_streams','probe_get_extension_opmode'}
    fdir = os.path.join(repo, 'reference/campaign', cond, 'frida')
    adir = os.path.join(repo, 'reference/campaign', cond, 'app_probes')

    expected = []  # (probe, lane, [candidate paths])
    # always-on provider levers
    for lever in ('enable_camx_logging', 'unclobber_camx_logs'):
        expected.append((lever, 'lever', [os.path.join(fdir, lever + '.log')]))
    for p in extra.split():
        if p in APP:
            expected.append((p, 'app', [os.path.join(adir, p + '.log')]))
        else:  # provider or server side both land in frida/
            expected.append((p, 'provider', [os.path.join(fdir, p + '.log')]))
    if run_r3 == '1':
        expected.append(('r3_gralloc', 'r3-kit', sorted(glob.glob(os.path.join(repo, 'reference/r3', cond, 'frida_*.log')))))
    if run_r4 == '1':
        expected.append(('r4_ext_server', 'r4-kit', sorted(glob.glob(os.path.join(repo, 'reference/r4', cond, 'ext_server_*.log')))))
        expected.append(('r4_ext_client', 'r4-kit', sorted(glob.glob(os.path.join(repo, 'reference/r4', cond, 'ext_client_*.log')))))

    rows = []; armed = nodata = dead = missing = 0
    for probe, lane, paths in expected:
        st, ev = classify(paths)
        rows.append((probe, lane, st, ev))
        armed   += st == 'ARMED'
        nodata  += st == 'NODATA'
        dead    += st == 'DEAD'
        missing += st == 'MISSING'

    total = len(rows)
    ok = armed + nodata
    print(f'# FRIDA COVERAGE — {cond}')
    print(f'# armed+data={armed}  hook-only(nodata)={nodata}  DEAD={dead}  MISSING={missing}  total={total}')
    print(f'{"probe":<32} {"lane":<10} {"state":<8} evidence')
    print('-' * 96)
    for probe, lane, st, ev in rows:
        flag = '' if st in ('ARMED', 'NODATA') else '  <<<'
        print(f'{probe:<32} {lane:<10} {st:<8} {ev}{flag}')
    bad = [p for p, _, s, _ in rows if s in ('DEAD', 'MISSING')]
    print('-' * 96)
    verdict = 'FULL' if not bad else 'GAP'
    print(f'FRIDA_COVERAGE={ok}/{total} verdict={verdict}' + (f' dead_or_missing={bad}' if bad else ''))
    return 0 if not bad else 1

if __name__ == '__main__':
    sys.exit(main())
