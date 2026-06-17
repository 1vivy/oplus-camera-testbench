#!/usr/bin/env bash
# campaign/validate_modes.sh — Phase-1a RELIABILITY GATE.
# Runs each UI mode K times from a clean cold start and asserts the driver DETERMINISTICALLY reached the
# intended mode/state, by checking the verified nav markers drive_cycle.sh emits to its action log:
#   - goto_main_mode <M> OK   is logged ONLY when current_mode actually equals <M> (in-function verified)
#   - tap_desc '<DESC>' -> ..  is logged only when the MORE-grid @more_item was found + tapped
#   - tap_id <rid> -> (x,y)    is logged only when a toggle node was found + tapped (vs "NOT FOUND")
#   - "ensure 8K"              is logged after the VIDEO resolution=8K selection
# A mode GRADUATES to Phase 1b only if it reaches K/K. Flaky modes are reported (reach-rate) so they can be
# fixed (resmap/calibration) or quarantined — never silently captured. This is the navigation-reliability
# analogue of parse_condition.py's signal-determinism gate, applied UPSTREAM.
#
# Usage: tools/observability/campaign/validate_modes.sh [K] [mode ...]
#   K        repeats per mode (default 3)
#   mode...  subset to validate (default: the full matrix)
# Prereqs: adb + rooted (KernelSU). READ-ONLY w.r.t. partitions. Pushes the capture/ tree first.
set -u
K="${1:-3}"; case "$K" in ''|*[!0-9]*) K=3;; *) shift || true;; esac
DEV_UI=/data/local/tmp/obs-capture/ui
LOG=/data/local/tmp/obs_ui_action.log
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
OUT="$REPO/reference/validate_modes"; mkdir -p "$OUT"
REPORT="$OUT/report.txt"
ADB_UID=$(adb shell id -u 2>/dev/null | tr -d '\r')
adb_as_root() {
  if [ "$ADB_UID" = 0 ]; then
    adb shell "$1"
  else
    adb shell su -c "$1"
  fi
}

ALL_MODES="photo scene burst holdshutter video video8k portrait text selfie motionphoto beauty filter night longexp scandoc switch p010 masterraw"
MODES="${*:-$ALL_MODES}"

# expected FOREGROUND app per mode — the scene-reality check below asserts the run actually LANDED here, not
# on a permission popup / the home screen (the after-close poison). scandoc launches a SEPARATE app.
expect_fg() { case "$1" in scandoc) echo 'com.coloros.ocrscanner' ;; *) echo 'com.oplus.camera' ;; esac; }

# required log markers per mode (a run passes iff ALL are present and no nav FAILED). '|' separates ANDed patterns.
required() {
  case "$1" in
    photo|scene|burst|holdshutter) echo 'goto_main_mode PHOTO OK' ;;
    video)        echo 'goto_main_mode VIDEO OK' ;;
    video8k)      echo 'goto_main_mode VIDEO OK|ensure 8K' ;;
    portrait)     echo 'goto_main_mode PORTRAIT OK' ;;
    text)         echo 'goto_main_mode TEXT OK' ;;
    selfie|switch)   echo 'goto_main_mode PHOTO OK|switch_camera_button -> (' ;;
    motionphoto)  echo 'goto_main_mode PHOTO OK|live_photo -> (' ;;
    beauty)       echo 'goto_main_mode PHOTO OK|camera_menu_left_enter_button -> (' ;;
    filter)       echo 'goto_main_mode PHOTO OK|camera_menu_right_enter_button -> (' ;;
    night)        echo "tap_desc 'NIGHT' -> (" ;;
    longexp)      echo "tap_desc 'LONG EXPOSURE' -> (" ;;
    scandoc)      echo "tap_desc 'SCAN DOCS' -> (" ;;
    p010)         echo 'goto_main_mode PHOTO OK|goto_main_mode MASTER OK' ;;   # two-shot PHOTO(P010)->MASTER
    masterraw)    echo 'goto_main_mode MASTER OK|masterraw: reset format' ;;   # MASTER + RAW switch + JPG reset
    *)            echo 'complete' ;;
  esac
}

echo "== validate_modes K=$K modes=[$MODES] @ $(date) ==" | tee "$REPORT"
adb shell 'rm -rf /data/local/tmp/obs-capture' >/dev/null 2>&1
adb push "$REPO/tools/observability/capture" /data/local/tmp/obs-capture >/dev/null 2>&1
adb_as_root 'chmod -R 755 /data/local/tmp/obs-capture' >/dev/null 2>&1

gate_pass=1
for m in $MODES; do
  pats="$(required "$m")"; want_fg="$(expect_fg "$m")"; reach=0
  rm -rf "$OUT/$m"; mkdir -p "$OUT/$m"
  for k in $(seq 1 "$K"); do
    RUNOUT="$OUT/$m/run$k"; mkdir -p "$RUNOUT"
    # DRIVE_NO_CLOSE=1 leaves the app UP so the scene-reality check below sees the REAL destination (a plain
    # close would force-stop -> the post-check would read the home screen, the documented after-close poison).
    adb_as_root "rm -f $LOG; DRIVE_NO_CLOSE=1 sh $DEV_UI/drive_cycle.sh $m" >"$RUNOUT/drive_stdout.txt" 2>"$RUNOUT/drive_stderr.txt"
    sect="$(adb_as_root "cat $LOG" 2>"$RUNOUT/action_stderr.txt" | tr -d '\r')"
    printf '%s\n' "$sect" >"$RUNOUT/action.log"
    ok=1
    reasons=""
    # (1) ALL ANDed log markers must be present
    IFS='|'; for p in $pats; do
      if ! echo "$sect" | grep -qF "$p"; then ok=0; reasons="$reasons missing_marker=$p"; fi
    done; unset IFS
    # (2) any nav FAILED voids the run
    echo "$sect" | grep -q 'FAILED' && { ok=0; reasons="$reasons nav_failed"; }
    # (3) SCENE REALITY — markers alone don't prove we captured the intended scene (a mis-tap into a popup /
    #     wrong app still logs the tap). Assert the foreground IS the expected app AND the screenshot is a real
    #     preview (MBs), not the ~82KB permission popup. This is the "coverage != what-we-wanted" guard.
    fg="$(adb shell 'dumpsys window' 2>/dev/null | grep -m1 mCurrentFocus | tr -d '\r')"
    printf '%s\n' "$fg" >"$RUNOUT/focus.txt"
    adb shell 'screencap -p /sdcard/_vm.png' 2>/dev/null
    ssz="$(adb shell 'stat -c %s /sdcard/_vm.png' 2>/dev/null | tr -d '\r')"; adb shell 'rm -f /sdcard/_vm.png' 2>/dev/null
    printf '%s\n' "$ssz" >"$RUNOUT/screenshot_size.txt"
    case "$fg" in *"$want_fg"*) : ;; *) ok=0; reasons="$reasons foreground_mismatch=$want_fg" ;; esac
    [ -z "$ssz" ] && { ok=0; reasons="$reasons screenshot_size_missing"; }
    [ -n "$ssz" ] && [ "$ssz" -lt 300000 ] && { ok=0; reasons="$reasons screenshot_too_small=$ssz"; }
    if [ "$ok" = 1 ]; then
      printf 'PASS mode=%s run=%s markers=%s foreground=%s screenshot_bytes=%s\n' "$m" "$k" "$pats" "$fg" "$ssz" >"$RUNOUT/verdict.txt"
    else
      printf 'FAIL mode=%s run=%s reasons=%s markers=%s foreground=%s screenshot_bytes=%s\n' "$m" "$k" "$reasons" "$pats" "$fg" "$ssz" >"$RUNOUT/verdict.txt"
    fi
    [ "$ok" = 1 ] && reach=$((reach+1))
    adb shell 'am force-stop com.oplus.camera' >/dev/null 2>&1   # restore the cold start for the next repeat
    [ "$m" = scandoc ] && adb shell 'am force-stop com.coloros.ocrscanner' >/dev/null 2>&1
  done
  if [ "$reach" = "$K" ]; then verdict="GRADUATE"; else verdict="FLAKY"; gate_pass=0; fi
  printf "  %-12s %d/%d  %s\n" "$m" "$reach" "$K" "$verdict" | tee -a "$REPORT"
done
echo "----" | tee -a "$REPORT"
if [ "$gate_pass" = 1 ]; then
  echo "GATE: PASS — all modes reached K/K; cleared for Phase 1b." | tee -a "$REPORT"
else
  echo "GATE: HOLD — fix/quarantine FLAKY modes before baseline capture." | tee -a "$REPORT"
fi
echo "report: $REPORT"
