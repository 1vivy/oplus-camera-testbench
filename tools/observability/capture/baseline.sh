#!/usr/bin/env bash
# capture/baseline.sh — the GOLDEN all-encompassing baseline for one condition, in one command.
# Composes (reuses, never reimplements): preflight -> validate_modes gate -> full_baseline lanes 1-4 ->
# strace lane -> auto-parse -> top-level VERDICT. Single artifact index under reference/baseline/<cond>/.
# Heavy raw captures stay where the lanes write them (reference/campaign|r3|r4|strace/<cond>/); we index them.
# doc-50.
#
# Usage: baseline.sh <condition=full-baseline> [los-ref-root]
#   los-ref-root (optional): a sibling reference/ from a LOS capture; enables the 2-side differs (r4/strace).
# Env: BASELINE_FORCE=1 (run past needs-calibration / modes HOLD), BASELINE_NO_LOCK=1 (when nested under
#      campaign.sh which already holds the device), STRACE_WIN=25, RUN_STRACE=1.
set -u
COND="${1:-full-baseline}"
LOS_REF="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OBS="$(cd "$HERE/.." && pwd)"
REPO="$(cd "$OBS/../.." && pwd)"
ENVF="$OBS/campaign/conditions/${COND}.env"
DEST="$REPO/reference/baseline/${COND}"
mkdir -p "$DEST"

MODE=photo
# shellcheck disable=SC1090
[ -f "$ENVF" ] && . "$ENVF"

# --- device lock (compose with campaign's distinct lock; skip when nested) ---
LOCK=/tmp/.oplus-baseline.devicelock
if [ "${BASELINE_NO_LOCK:-0}" != 1 ]; then
  if ! ( set -o noclobber; echo "$$" > "$LOCK" ) 2>/dev/null; then
    echo "baseline lock held ($LOCK, pid $(cat "$LOCK" 2>/dev/null)). Another baseline owns the device."; exit 1
  fi
  trap 'rm -f "$LOCK"' EXIT
fi

echo "############################################################"
echo "# GOLDEN BASELINE  condition=$COND  mode=$MODE  los_ref=${LOS_REF:-<none, single-side>}"
echo "############################################################"

# roll-up state
PF="-"; GATE="-"; CORE="-"; STRACE="-"; SIGNAL="-"
note(){ echo "$1" >> "$DEST/links.txt"; }
: > "$DEST/links.txt"

# --- [0] PREFLIGHT ---
echo; echo "== [0] preflight =="
"$HERE/preflight.sh" "$COND" "$DEST"; pf=$?
case "$pf" in
  0) PF=ready ;;
  3) PF=needs-calibration ;;
  2) PF=blocked ;;
  *) PF="error($pf)" ;;
esac
echo "   preflight: $PF"
if [ "$pf" = 2 ]; then
  { echo "# BASELINE $COND"; echo; echo "**VERDICT: BLOCKED** — preflight blocked (see PREFLIGHT.md)"; } > "$DEST/BASELINE.md"
  echo "VERDICT=BLOCKED (preflight)"; exit 2
fi
if [ "$pf" = 3 ] && [ "${BASELINE_FORCE:-0}" != 1 ]; then
  { echo "# BASELINE $COND"; echo; echo "**VERDICT: BLOCKED** — preflight needs-calibration (set BASELINE_FORCE=1 to override). See PREFLIGHT.md."; } > "$DEST/BASELINE.md"
  echo "VERDICT=BLOCKED (needs-calibration; BASELINE_FORCE=1 to override)"; exit 3
fi

# --- [1] validate_modes GATE ---
echo; echo "== [1] validate_modes gate (K=2, mode=$MODE) =="
if "$OBS/campaign/validate_modes.sh" 2 "$MODE" >/dev/null 2>&1; then :; fi
cp -f "$REPO/reference/validate_modes/report.txt" "$DEST/validate_modes_report.txt" 2>/dev/null
if grep -q "GATE: PASS" "$DEST/validate_modes_report.txt" 2>/dev/null; then GATE=PASS; else GATE=HOLD; fi
echo "   modes gate: $GATE"
if [ "$GATE" = HOLD ] && [ "${BASELINE_FORCE:-0}" != 1 ]; then
  { echo "# BASELINE $COND"; echo; echo "**VERDICT: BLOCKED** — modes gate HOLD (flaky nav). See validate_modes_report.txt. BASELINE_FORCE=1 to override."; } > "$DEST/BASELINE.md"
  echo "VERDICT=BLOCKED (modes HOLD)"; exit 3
fi

# --- [2] full baseline lanes 1-4 (reuse full_baseline.sh verbatim) ---
echo; echo "== [2] full_baseline lanes 1-4 =="
if BASELINE_NO_LOCK=1 "$OBS/campaign/full_baseline.sh" "$COND"; then CORE=ran; else CORE=failed; fi
echo "   full_baseline: $CORE"
note "campaign:  $REPO/reference/campaign/$COND/"
note "r3:        $REPO/reference/r3/$COND/"
note "r4:        $REPO/reference/r4/$COND/"

# --- [3] strace lane (auto-driven; non-fatal) ---
if [ "${RUN_STRACE:-1}" = 1 ]; then
  echo; echo "== [3] strace lane (win=${STRACE_WIN:-25}s) =="
  SB="${STRACE_BIN:-$OBS/strace/strace.aarch64}"
  if [ -f "$SB" ]; then
    # hard-bounded: timeout caps the host runner; the device pkill guarantees no runaway strace survives
    # (the 10_strace_camera.sh $!-subshell bug used to leave an 84MB strace tracing forever).
    ( timeout $(( ${STRACE_WIN:-25} + 60 )) env STRACE_BIN="$SB" "$OBS/strace/30_run_strace.sh" "$COND" "${STRACE_WIN:-25}" >/dev/null 2>&1 ) &
    spid=$!
    sleep 4
    adb shell "su -c 'DRIVE_NO_CLOSE=1 AE_LOCK=${AE_LOCK:-0} sh /data/local/tmp/obs-capture/ui/drive_cycle.sh $MODE'" >/dev/null 2>&1
    wait "$spid" 2>/dev/null
    adb shell 'su -c "pkill -9 strace"' >/dev/null 2>&1   # safety: never leave a runaway strace attached
    STRACE=ran
    note "strace:    $REPO/reference/strace/$COND/"
  else
    STRACE=skipped
    echo "   strace: SKIPPED (no aarch64 binary at $SB; set STRACE_BIN=)"
  fi
else STRACE=skipped; fi
echo "   strace: $STRACE"

# --- [4] auto-parse ---
echo; echo "== [4] parse =="
"$OBS/campaign/parse_condition.py" "$REPO/reference/campaign/$COND" > "$DEST/parse_condition.txt" 2>&1 || true
grep -qiE 'ALL STABLE|all_stable.*true' "$DEST/parse_condition.txt" && SIGNAL=all-stable || SIGNAL=see-parse
"$OBS/r3-gralloc/parse_r3.py" "$REPO/reference/r3/$COND" ${LOS_REF:+"$LOS_REF/r3/$COND"} > "$DEST/parse_r3.txt" 2>&1 || true
if [ -n "$LOS_REF" ]; then
  "$OBS/r4-oem-transact/parse_r4.py" "$REPO/reference/r4/$COND" "$LOS_REF/r4/$COND" > "$DEST/parse_r4.txt" 2>&1 || true
  "$OBS/strace/parse_strace.py" "$REPO/reference/strace/$COND" "$LOS_REF/strace/$COND" > "$DEST/parse_strace.txt" 2>&1 || true
else
  echo "single-side (no LOS ref): r4/strace are pure differs — raw artifacts only" > "$DEST/parse_r4.txt"
fi

# --- [5] verdict ---
VERDICT=PARTIAL
[ "$PF" = ready ] && [ "$GATE" = PASS ] && [ "$CORE" = ran ] && [ "$SIGNAL" = all-stable ] && VERDICT=GOLDEN
[ "$CORE" = failed ] && VERDICT=PARTIAL
cat > "$DEST/verdict.json" <<EOF
{ "condition":"$COND", "mode":"$MODE", "preflight":"$PF", "modes_gate":"$GATE",
  "lanes":{ "core":"$CORE", "strace":"$STRACE" }, "signal":"$SIGNAL",
  "los_ref":"${LOS_REF:-}", "verdict":"$VERDICT" }
EOF
{
  echo "# GOLDEN BASELINE — $COND"
  echo
  echo "**VERDICT: $VERDICT**"
  echo
  echo "| stage | result |"
  echo "|---|---|"
  echo "| preflight | $PF |"
  echo "| modes gate | $GATE |"
  echo "| full_baseline (lanes 1-4) | $CORE |"
  echo "| strace lane | $STRACE |"
  echo "| signal (parse_condition) | $SIGNAL |"
  echo
  echo "## Artifacts (raw lanes — indexed, not duplicated)"
  echo '```'; cat "$DEST/links.txt"; echo '```'
  echo
  echo "Parsed: parse_condition.txt, parse_r3.txt$( [ -n "$LOS_REF" ] && echo ', parse_r4.txt, parse_strace.txt')."
  echo "Resolve upward to root via the attribution tree (docs/interop-tree/ + tables/attribution-matrix.md)."
} > "$DEST/BASELINE.md"

echo
echo "== GOLDEN BASELINE '$COND' => $VERDICT =="
echo "   manifest: $DEST/BASELINE.md"
