#!/system/bin/sh
# tools/observability/capture/ab_capture.sh
# Run ONE identical camera cycle (launch -> preview -> shutter -> settle -> close) while capturing
# every available log buffer, auto-tagged by build identity, so an OOS run and a LOS run can be diffed
# byte-for-byte per subsystem. The WHOLE POINT: most stock captures to date were vendor/CamX-only and
# never the /system framework layer — this captures both sides with identical instrumentation.
# READ-ONLY. Single-block (KernelSU). Run: su -c 'sh /data/local/tmp/obs-capture/ab_capture.sh [mode] [session]'
#   [mode] (optional): photo|burst|video|video8k|night|switch|replay — delegates the stimulus to ui/drive_cycle.sh
#   [session] (with mode=replay): the recorded action session under /data/local/tmp/obs-sessions/<session>.actions
#   so the SAME stimulus (logged action trail) drives both builds. No mode = legacy single-photo cycle.
#   Reach the open symptoms with a mode: video8k -> #8, burst -> #4, replay -> deterministic AE-locked stimulus.
#   Env AE_LOCK=1 (inherited by drive_cycle) long-presses to lock AE/AF after launch. See ui/README.md.
PKG=com.oplus.camera
MODE="${1:-}"
SESSION="${2:-}"
HERE=$(dirname "$0")
# build tag: oplusrom version distinguishes OOS vs LOS captures in the artifact name
TAG=$(getprop ro.build.version.oplusrom 2>/dev/null)$(getprop ro.lineage.build.version 2>/dev/null)
[ -z "$TAG" ] && TAG=$(getprop ro.build.id)
TAG=$(echo "$TAG" | tr ' /:' '___')
TS=$(date +%s 2>/dev/null || echo 0)
DST=/data/local/tmp/obs_ab_${TAG}_${TS}
mkdir -p "$DST"
echo "build_tag=$TAG" >"$DST/meta.txt"
getprop | grep -iE 'oplusrom|lineage|sub_api|hdr.uniform|product.device' >>"$DST/meta.txt"

# 0) clear ring + start a background logcat over ALL buffers
logcat -c 2>/dev/null
logcat -b all -v threadtime > "$DST/logcat_all.txt" &
LPID=$!

# 1) pre-state: stream config + camera dump BEFORE
# NOTE: toybox grep does NOT support `\|` BRE alternation — must use `grep -E` with `|` (else empty file).
dumpsys media.camera > "$DST/dumpsys_camera_pre.txt" 2>&1
dumpsys SurfaceFlinger | grep -iEA4 'supportedhdrtypes|hdrcapab|desiredhdr|wide.?color|com\.oplus\.camera|dataspace|colormode' > "$DST/sf_pre.txt" 2>&1

# 2+3) stimulus. With a [mode] and ui/drive_cycle.sh present, delegate to the deterministic mode-aware
#       driver (identical actions both builds, action trail logged); the driver does launch+mode+SIGQUIT
#       and we tell it NOT to close so step 4 still sees the live session. Otherwise: legacy single photo.
if [ -n "$MODE" ] && [ -f "$HERE/ui/drive_cycle.sh" ]; then
  echo "stimulus=driver mode=$MODE session=$SESSION ae_lock=${AE_LOCK:-0}" >>"$DST/meta.txt"
  rm -f /data/local/tmp/obs_ui_action.log    # fresh per-cycle action trail
  DRIVE_NO_CLOSE=1 sh "$HERE/ui/drive_cycle.sh" "$MODE" "$SESSION" >>"$DST/meta.txt" 2>&1
  cp -f /data/local/tmp/obs_ui_action.log "$DST/ui_action.log" 2>/dev/null
else
  echo "stimulus=legacy-photo" >>"$DST/meta.txt"
  am start -n "$PKG/.Camera" >>"$DST/meta.txt" 2>&1 || am start -n "$PKG/com.oplus.camera.Camera" >>"$DST/meta.txt" 2>&1
  sleep 4
  # preview-delivery probe point: is onImageAvailable flowing? (the freeze signature) — grab a thread dump
  PID=$(pgrep -f "$PKG" | head -1)
  [ -n "$PID" ] && kill -3 "$PID" 2>/dev/null   # ANR-style java dump -> /data/anr/ (proves preview thread state)
  # shutter via keyevent (no UI-coord dependency), settle for capture pipeline
  input keyevent KEYCODE_CAMERA 2>>"$DST/meta.txt"
  sleep 5
fi

# 4) post-state (app still alive here — driver ran with DRIVE_NO_CLOSE, legacy not yet force-stopped)
dumpsys media.camera > "$DST/dumpsys_camera_post.txt" 2>&1
dumpsys SurfaceFlinger | grep -iEA4 'supportedhdrtypes|hdrcapab|desiredhdr|wide.?color|com\.oplus\.camera|dataspace|colormode' > "$DST/sf_post.txt" 2>&1
LIVE_FG=$(dumpsys window 2>/dev/null | grep -m1 mCurrentFocus)
screencap -p "$DST/scene_live.png" 2>/dev/null
LIVE_SZ=$(wc -c < "$DST/scene_live.png" 2>/dev/null || echo 0)
LIVE_OK=1; case "$LIVE_FG" in *com.oplus.camera*) : ;; *) LIVE_OK=0 ;; esac; [ "$LIVE_SZ" -lt 300000 ] && LIVE_OK=0
printf 'scene_ok=%s foreground=%s scene_bytes=%s\n' "$LIVE_OK" "$LIVE_FG" "$LIVE_SZ" > "$DST/scene_live_audit.txt"
# preview/GL thread state (the freeze #1 signal): /data/anr/ is EMPTY on A16 — SIGQUIT traces don't land
# there. debuggerd -b is the reliable path (all-thread native unwind, non-fatal). Keep kill -3 best-effort.
APP_PID=$(pgrep -f "$PKG" | head -1)
if [ -n "$APP_PID" ]; then
  kill -3 "$APP_PID" 2>/dev/null            # best-effort ART dump; ART logs "Wrote stack traces to <path>"
  debuggerd -b "$APP_PID" > "$DST/app_backtrace.txt" 2>/dev/null && echo "app_backtrace.txt via debuggerd -b $APP_PID" >>"$DST/meta.txt"
fi
# the freeze (#1) parks the APS/preview thread in the NATIVE daemons, not the app — capture those too.
# debuggerd -b is non-fatal; reliable on natives (app-process java dump is unreliable, see debug/README).
for D in cameraserver camera.provider; do
  DP=$(pgrep -f "$D" | head -1)
  [ -n "$DP" ] && debuggerd -b "$DP" > "$DST/${D%%.*}_daemon_bt.txt" 2>/dev/null
done
ls -t /data/vendor/camera/*.log 2>/dev/null | head -3 | while read f; do cp -f "$f" "$DST/"; done

# 5) stop capture; snapshot a tombstone ONLY if it is FRESH (mtime >= this cycle's start = $TS).
#    The old code copied the newest tombstone unconditionally → could pull a stale crash. Guard it.
sleep 1; kill "$LPID" 2>/dev/null
NEWT=$(ls -t /data/tombstones/tombstone_* 2>/dev/null | grep -v '\.pb$' | head -1)
if [ -n "$NEWT" ]; then
  TMT=$(stat -c %Y "$NEWT" 2>/dev/null || echo 0)
  if [ "$TMT" -ge "$TS" ] 2>/dev/null; then cp -f "$NEWT" "$DST/"; echo "FRESH tombstone $NEWT (mtime $TMT >= start $TS)" >>"$DST/meta.txt"
  else echo "no fresh tombstone (newest $NEWT mtime $TMT < start $TS — NOT copied)" >>"$DST/meta.txt"; fi
fi
# what path did ART actually write the SIGQUIT trace to (if any)?
logcat -d -b all 2>/dev/null | grep -aE 'Wrote stack traces to' | tail -1 >>"$DST/meta.txt" 2>/dev/null
am force-stop "$PKG" 2>/dev/null

echo "WROTE $DST  (pull: adb pull $DST ; diff OOS vs LOS dir per subsystem — see AB-RUNBOOK.md)"
