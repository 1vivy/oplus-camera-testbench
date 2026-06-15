#!/usr/bin/env bash
# campaign/campaign.sh — run a SET of conditions SERIALLY behind a device lockfile.
# The device is a hard serialization point (one camera session at a time), so conditions are QUEUED, never
# concurrent. Throughput comes from host-side analysis (parse_condition / agents), not parallel captures.
#
# Usage: tools/observability/campaign/campaign.sh [cond1 cond2 ...]   # default: every conditions/*.env
# Each <cond> reads conditions/<cond>.env and runs $RUNNER (default run_condition.sh).
# Artifacts -> reference/campaign/<cond>/.
#
# RUNNER (env, default run_condition.sh): the per-condition orchestrator to invoke. Set
#   RUNNER=full_baseline.sh to capture FULL baselines (framework+graph + provider + app probes + r3 + r4)
#   for every condition — e.g.  RUNNER=full_baseline.sh tools/observability/campaign/campaign.sh full-baseline
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
RUNNER="${RUNNER:-run_condition.sh}"
[ -x "$HERE/$RUNNER" ] || { echo "RUNNER not executable: $HERE/$RUNNER"; exit 1; }
LOCK=/tmp/.oplus-campaign.devicelock

# resolve the condition list (args, or all conditions/*.env)
if [ "$#" -gt 0 ]; then CONDS=("$@"); else
  CONDS=(); for f in "$HERE"/conditions/*.env; do [ -e "$f" ] && CONDS+=("$(basename "${f%.env}")"); done
fi
[ "${#CONDS[@]}" -eq 0 ] && { echo "no conditions (pass names or add conditions/*.env)"; exit 1; }

# device lockfile — refuse to run two campaigns against the one device at once
if ! ( set -o noclobber; echo "$$" > "$LOCK" ) 2>/dev/null; then
  echo "device lock held ($LOCK, pid $(cat "$LOCK" 2>/dev/null)). Another campaign is using the device."; exit 1
fi
trap 'rm -f "$LOCK"' EXIT

adb get-state >/dev/null 2>&1 || { echo "no adb device"; exit 1; }
echo "== campaign: ${#CONDS[@]} condition(s) SERIAL  (runner=$RUNNER) =="; printf '   - %s\n' "${CONDS[@]}"
for c in "${CONDS[@]}"; do
  echo; echo "################ condition: $c ################"
  "$HERE/$RUNNER" "$c" || echo "   !! condition $c failed (continuing)"
done
echo; echo "== campaign done. verdicts: reference/campaign/<cond>/verdict.json =="
