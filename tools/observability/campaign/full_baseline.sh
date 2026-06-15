#!/usr/bin/env bash
# campaign/full_baseline.sh — ONE full stock baseline for a condition, in a single pass.
# Composes the proven lanes instead of re-capturing:
#   1) run_condition.sh   -> enable + PROVIDER-side frida co-attach + N x ab_capture (framework+graph layer)
#   2) app_probe_capture.sh -> APP-side frida probes (fresh app pid via DRIVE_NAVONLY attach)
#   3) r3-gralloc/30_run_r3.sh  (gralloc/P010 alloc->map->lock chain)        [RUN_R3=1]
#   4) r4-oem-transact/30_run_r4.sh (media.camera OEM-transaction depths)    [RUN_R4=1]
# The r3/r4 kits are interactive (they `read` for ENTER after you drive a cycle); here we DRIVE the same
# deterministic drive_cycle stimulus and feed the ENTER over a FIFO, so they need ZERO edits.
# Everything lands under reference/campaign/<cond>/ (+ reference/r3/<cond>, reference/r4/<cond>), summarized
# in FULL-BASELINE.md. r3/r4 are best-effort: their failure never voids the core baseline.
#
# Usage: tools/observability/campaign/full_baseline.sh <condition>   # default: full-baseline
# This is the per-condition unit the test-all (campaign.sh RUNNER=full_baseline.sh) invokes.
set -u
COND="${1:-full-baseline}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OBS="$(cd "$HERE/.." && pwd)"
REPO="$(cd "$OBS/../.." && pwd)"
ENVF="$HERE/conditions/${COND}.env"
[ -f "$ENVF" ] || { echo "no condition file: $ENVF"; exit 1; }

# defaults overridable by the condition env
MODE=photo; SESSION=""; AE_LOCK=0; REPEAT_N=2; NOTE=""; EXTRA_PROBES=""; RUN_R3=1; RUN_R4=1
# shellcheck disable=SC1090
. "$ENVF"

DEV_UI=/data/local/tmp/obs-capture/ui
PKG=com.oplus.camera
DST="$REPO/reference/campaign/${COND}"
mkdir -p "$DST"
BUILD=$(adb shell 'getprop ro.build.version.oplusrom' | tr -d '\r')
DISPLAY_ID=$(adb shell 'getprop ro.build.display.id' | tr -d '\r')
ENF=$(adb shell getenforce | tr -d '\r')

echo "############################################################"
echo "# FULL BASELINE  condition=$COND  build=$BUILD ($DISPLAY_ID)  selinux=$ENF"
echo "############################################################"

# phase gates (default all on). RUN_CORE=0 / RUN_APP=0 let you re-run just the kit lanes for validation,
# e.g.  RUN_CORE=0 RUN_APP=0 full_baseline.sh full-baseline   (re-capture only r3+r4).
RUN_CORE="${RUN_CORE:-1}"; RUN_APP="${RUN_APP:-1}"

# ---- 1) framework+graph + provider-side probes --------------------------------------------------
if [ "$RUN_CORE" = 1 ]; then
  echo; echo "== [1/4] run_condition (framework+graph + provider probes) =="
  "$HERE/run_condition.sh" "$COND" || echo "  !! run_condition failed (continuing)"
else echo; echo "== [1/4] run_condition SKIPPED (RUN_CORE=0) =="; fi

# ---- 2) app-side probes -------------------------------------------------------------------------
if [ "$RUN_APP" = 1 ]; then
  echo; echo "== [2/4] app_probe_capture (app-side probes) =="
  "$HERE/app_probe_capture.sh" "$COND" || echo "  !! app_probe_capture failed (continuing)"
else echo; echo "== [2/4] app_probe_capture SKIPPED (RUN_APP=0) =="; fi

# run_condition already armed verbosity once; tell the kits to skip their disruptive re-enable
# (00_enable_all restarts cameraserver/provider and would kill the pre-launched app before frida attach).
export SKIP_ENABLE=1
# the kit auto-drive needs ui/drive_cycle.sh on device; the core/app lanes push obs-capture, but if both
# were skipped (kit-only validation run) push it now so drive_cycle exists.
if [ "$RUN_CORE" != 1 ] && [ "$RUN_APP" != 1 ]; then
  adb shell 'ls /data/local/tmp/obs-capture/ui/drive_cycle.sh' >/dev/null 2>&1 || \
    adb push "$OBS/capture" /data/local/tmp/obs-capture >/dev/null 2>&1
  adb shell 'su -c "chmod -R 755 /data/local/tmp/obs-capture"' >/dev/null 2>&1
fi

# bring the camera app up and let it FULLY settle, so the kits' frida `-n com.oplus.camera` attach finds a
# live process. The preceding app-side lane force-stopped the app; cold start after that exceeds the kits'
# internal 4s settle — pre-launching here (with SKIP_ENABLE preventing a mid-flow restart) closes the race.
prelaunch_app() { adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; sleep 6; }

# ---- helper: run an interactive kit, feeding ENTER over a FIFO after a deterministic drive ------
# $1 = human label   $2 = kit runner path   $3 = kit tag   $4... = drive_cycle modes to fire before ENTER
run_kit_autodrive() {
  label="$1"; runner="$2"; tag="$3"; shift 3
  [ -x "$runner" ] || { echo "  $label: runner not executable ($runner) — skip"; return; }
  fifo="$(mktemp -u)"; mkfifo "$fifo" || { echo "  $label: mkfifo failed — skip"; return; }
  echo "  -- $label: launching kit (tag=$tag), will auto-drive [$*] then ENTER --"
  # kit reads its ENTER from the FIFO; everything else (stdout/err) streams to our log
  "$runner" "$tag" <"$fifo" >"$DST/${label}_run.log" 2>&1 &
  kitpid=$!
  # driver: keep the FIFO open on fd 3, wait for the kit to reach its attach+prompt, drive, then ENTER
  ( exec 3>"$fifo"
    sleep 12                                   # let the kit push/enable/attach frida + print its prompt
    for m in "$@"; do
      adb shell "su -c 'DRIVE_NO_CLOSE=1 AE_LOCK=$AE_LOCK sh $DEV_UI/drive_cycle.sh $m'" >/dev/null 2>&1
      sleep 2
    done
    printf '\n' >&3                            # release the kit's `read`
  )
  wait "$kitpid" 2>/dev/null
  rm -f "$fifo"
  echo "  -- $label: done -> $DST/${label}_run.log --"
}

# ---- 3) r3-gralloc (kit launches the app itself; drive negative-control photo + target night) ----
if [ "${RUN_R3:-0}" = 1 ]; then
  echo; echo "== [3/4] r3-gralloc (P010 alloc/map/lock) =="
  prelaunch_app
  run_kit_autodrive r3 "$OBS/r3-gralloc/30_run_r3.sh" "$COND" photo night
else echo; echo "== [3/4] r3-gralloc SKIPPED (RUN_R3=$RUN_R3) =="; fi

# ---- 4) r4-oem-transact (client frida attaches by name -> PRE-LAUNCH app; drive video8k + photo) --
if [ "${RUN_R4:-0}" = 1 ]; then
  echo; echo "== [4/4] r4-oem-transact (OEM binder depths) =="
  prelaunch_app
  run_kit_autodrive r4 "$OBS/r4-oem-transact/30_run_r4.sh" "$COND" video8k photo
else echo; echo "== [4/4] r4-oem-transact SKIPPED (RUN_R4=$RUN_R4) =="; fi

# ---- manifest -----------------------------------------------------------------------------------
R3DIR="$REPO/reference/r3/${COND}"; R4DIR="$REPO/reference/r4/${COND}"
{
  echo "# FULL BASELINE — $COND"
  echo
  echo "- build_oplusrom: \`$BUILD\`"
  echo "- display_id: \`$DISPLAY_ID\`"
  echo "- selinux: \`$ENF\`"
  echo "- mode: \`$MODE\`   ae_lock: \`$AE_LOCK\`   repeat_n: \`$REPEAT_N\`"
  echo "- note: $NOTE"
  echo
  echo "## Layers captured"
  echo "| Layer | Lane | Location |"
  echo "|---|---|---|"
  echo "| framework + graph (N x ab_capture) | run_condition.sh | reference/campaign/$COND/run1..run$REPEAT_N/ |"
  echo "| provider-side probes | run_condition.sh | reference/campaign/$COND/frida/ |"
  echo "| app-side probes | app_probe_capture.sh | reference/campaign/$COND/app_probes/ |"
  echo "| gralloc / P010 chain | r3-gralloc | reference/r3/$COND/ ($([ "${RUN_R3:-0}" = 1 ] && echo ran || echo skipped)) |"
  echo "| OEM media.camera transactions | r4-oem-transact | reference/r4/$COND/ ($([ "${RUN_R4:-0}" = 1 ] && echo ran || echo skipped)) |"
  echo
  echo "## Probe set (EXTRA_PROBES)"
  echo "\`$EXTRA_PROBES\`"
  echo
  echo "## Verdicts"
  echo "- per-condition signal verdict: reference/campaign/$COND/verdict.json (parse_condition.py)"
  echo "- r3 diff: parse_r3.py reference/r3/$COND <los-dir>"
  echo "- r4 diff: parse_r4.py reference/r4/$COND <los-dir>"
} > "$DST/FULL-BASELINE.md"

echo
echo "== FULL BASELINE '$COND' complete =="
echo "   manifest: $DST/FULL-BASELINE.md"
echo "   core:     $DST/  (run1..run$REPEAT_N, frida/, app_probes/)"
[ "${RUN_R3:-0}" = 1 ] && echo "   r3:       $R3DIR/"
[ "${RUN_R4:-0}" = 1 ] && echo "   r4:       $R4DIR/"
