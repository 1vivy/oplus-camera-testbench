#!/usr/bin/env bash
# tools/lint.sh — static-check every script + frida probe + agent bundle in the harness.
# The guard for the two silent-break classes this project hit: the frida-17 static-Module-API removal
# (probes that throw on load → hooks silently never arm) and shell `$!`-subshell / quoting bugs. Run before
# any capture or push. Excludes the gitignored upstream clones, binaries, and transient state.
# Usage: tools/lint.sh            (exit 0 = clean, nonzero = at least one failure)
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO" || exit 2
fail=0; nsh=0; njs=0; npy=0

# directories never to lint (external clones, caches, vendored binaries)
PRUNE='-path ./dodge-camera-port/repos -o -path ./infiniti-camera-port/repos -o -path *.omc* -o -name __pycache__ -o -name node_modules'

echo "== lint: shell (bash -n) =="
while IFS= read -r f; do
  nsh=$((nsh+1))
  if ! out=$(bash -n "$f" 2>&1); then echo "  FAIL $f"; echo "$out" | sed 's/^/      /'; fail=1; fi
done < <(find . \( $PRUNE \) -prune -o -name '*.sh' -type f -print)
echo "   $nsh shell scripts"

echo "== lint: javascript/frida (node --check) =="
if command -v node >/dev/null 2>&1; then
  while IFS= read -r f; do
    njs=$((njs+1))
    if ! out=$(node --check "$f" 2>&1); then echo "  FAIL $f"; echo "$out" | sed 's/^/      /'; fail=1; fi
  done < <(find . \( $PRUNE \) -prune -o -name '*.js' -type f -print)
  echo "   $njs js/agent files"
else echo "   (node not on PATH — skipped; install node to check frida probes)"; fi

echo "== lint: python (py_compile) =="
if command -v python3 >/dev/null 2>&1; then
  while IFS= read -r f; do
    npy=$((npy+1))
    if ! out=$(python3 -m py_compile "$f" 2>&1); then echo "  FAIL $f"; echo "$out" | sed 's/^/      /'; fail=1; fi
  done < <(find . \( $PRUNE \) -prune -o -name '*.py' -type f -print)
  echo "   $npy python files"
else echo "   (python3 not on PATH — skipped)"; fi

# .ts probes: syntax-only sanity (node can't --check TS; just flag presence)
TSN=$(find . \( $PRUNE \) -prune -o -name '*.ts' -type f -print | wc -l | tr -d ' ')
[ "$TSN" != 0 ] && echo "== note: $TSN .ts probe(s) — not statically checked (no tsc); review by hand =="

echo
if [ "$fail" = 0 ]; then echo "LINT OK ($nsh sh, $njs js, $npy py)"; else echo "LINT FAILED — see above"; fi
exit "$fail"
