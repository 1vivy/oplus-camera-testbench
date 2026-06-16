#!/system/bin/sh
# tools/observability/capture/ui/drive_cycle.sh
# Deterministic, mode-aware UI driver so OOS and LOS get IDENTICAL stimulus, across the full OplusCamera
# mode matrix. Each mode maps to the interop-tree node/symptom it exercises and every action is logged.
#
# RELIABILITY MODEL (verified on OP611FL1 / OOS V16.1.0, 2026-06-13):
#  - MAIN strip modes (MORE·TEXT·PORTRAIT·PHOTO·VIDEO·MASTER) switch by a SINGLE-finger horizontal swipe
#    on the strip (the "double finger" content-desc is only the TalkBack hint; two-finger = zoom). One tab =
#    a CALIBRATED 250px/600ms swipe (deterministic by DISTANCE, not velocity). goto_main_mode steps with
#    current_mode feedback + the known order — no recording needed.
#  - MORE-grid submodes (NIGHT, HI-RES, PANO, SLO-MO, TIME-LAPSE, LONG EXPOSURE, DUAL-VIEW, UNDERWATER,
#    SCAN DOCS, TILT-SHIFT): goto MORE, then TAP @more_item by content-desc (deterministic).
#  - PHOTO-bar TOGGLES (motion photo, face beauty, filter, flash, selfie): deterministic taps by resource-id.
#  - 8K: in VIDEO, tap the Resolution chip then the "8K" option.
# Calibration + ids live in resmap.sh.
#
# READ-ONLY (only am/input/uiautomator/sendevent — no partition writes). Single-block (KernelSU).
# Run: su -c 'sh /data/local/tmp/obs-capture/ui/drive_cycle.sh <mode> [session]'
#   modes: photo burst holdshutter video video8k night longexp scandoc text portrait selfie
#          motionphoto beauty filter scene switch replay
# Env: AE_LOCK=1 long-presses the preview to lock AE/AF after launch (de-confound — pins exposure on a scene).
MODE="${1:-photo}"
SESSION="${2:-}"
PKG=com.oplus.camera
HERE=$(dirname "$0")
SESS_DIR=/data/local/tmp/obs-sessions
PREVIEW_CX=636; PREVIEW_CY=1100   # preview-area center (1272x2772); long-press here = AE/AF lock
BEAUTY_PRESET_XY="387 2555"       # 'Natural' chip in the beauty/retouch panel (no res-id/text on the chips → coord)
BEAUTY_ORIG_XY="184 2555"         # 'Original' chip (beauty OFF) — used to SELF-RESET after the beauty capture
BEAUTY_MENU_XY="110 1984"         # the menu_left_enter toggle's screen location — tap raw to CLOSE the panel
                                  # (its res-id leaves the tree while open, so tap_id can't re-find it)
FILTER_NEON_XY="843 2450"         # 'Neon' filter thumbnail (custom-rendered, no res-id → coord)
FILTER_ORIG_XY="650 2450"         # 'Original' filter thumbnail (filter OFF) — SELF-RESET after the filter capture
FILTER_MENU_XY="1161 1984"        # the menu_right_enter toggle's screen location — tap raw to CLOSE the filter panel
# WHY self-reset: beauty/filter presets PERSIST across app relaunch (sticky), so a Natural/Neon left active
# would silently contaminate every subsequent condition (photo/scene/... would carry the effect). Each effect
# mode re-opens its panel after the shutter and reselects Original so the device is left clean for the next run.
LOG=/data/local/tmp/obs_ui_action.log
TAG=$(getprop ro.build.version.oplusrom 2>/dev/null)$(getprop ro.lineage.build.version 2>/dev/null)
echo "=== drive_cycle mode=$MODE tag=$TAG @ $(date 2>/dev/null) ===" >>"$LOG"

# per-build resource-id map + strip calibration (fill via uiautomator dump). Defaults if resmap missing.
RID_SHUTTER=""; RID_SWITCH_CAM=""; RID_LIVE_PHOTO=""; RID_FACE_BEAUTY=""; RID_FILTER=""; RID_FLASH=""
RID_MORE_ITEM="com.oplus.camera:id/more_item"
RID_MASTER_PRO="com.oplus.camera:id/master_pro"   # MASTER's Auto|Pro sub-toggle; default is Auto -> tap to engage Pro/manual
MODE_ORDER="MORE TEXT PORTRAIT PHOTO VIDEO MASTER"
STRIP_STEP_RIGHT="300 2548 550 2548 600"   # index+1 (toward MASTER)
STRIP_STEP_LEFT="550 2548 300 2548 600"    # index-1 (toward MORE)
VID_RES_CHIP="980 245"; VID_RES_8K="1071 297"
MODE_STRIP_Y=2548
[ -f "$HERE/resmap.sh" ] && . "$HERE/resmap.sh"

act() { echo "  [$(date +%H:%M:%S 2>/dev/null)] $*" >>"$LOG"; }
dump() { uiautomator dump /data/local/tmp/obs_ui.xml >/dev/null 2>&1; }

# tap a node by resource-id (first match), tap its center. Returns 1 if not found.
tap_id() {
  rid="$1"; [ -z "$rid" ] && return 1
  dump || return 1
  line=$(tr '>' '\n' < /data/local/tmp/obs_ui.xml 2>/dev/null | grep -F "resource-id=\"$rid\"" | head -1)
  [ -z "$line" ] && { act "tap_id $rid -> NOT FOUND"; return 1; }
  b=$(echo "$line" | grep -oE 'bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' | head -1 | grep -oE '[0-9]+')
  set -- $b; [ $# -lt 4 ] && return 1
  cx=$(( ($1 + $3) / 2 )); cy=$(( ($2 + $4) / 2 ))
  input tap "$cx" "$cy"; act "tap_id $rid -> ($cx,$cy)"; return 0
}
# tap a node by content-desc (optionally constrained to a resource-id substring, e.g. more_item).
tap_desc() {
  d="$1"; filt="${2:-}"
  dump || return 1
  line=$(tr '>' '\n' < /data/local/tmp/obs_ui.xml 2>/dev/null | grep -F "content-desc=\"$d\"")
  [ -n "$filt" ] && line=$(echo "$line" | grep -F "$filt")
  line=$(echo "$line" | head -1)
  [ -z "$line" ] && { act "tap_desc '$d' -> NOT FOUND"; return 1; }
  b=$(echo "$line" | grep -oE 'bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' | head -1 | grep -oE '[0-9]+')
  set -- $b; [ $# -lt 4 ] && return 1
  cx=$(( ($1 + $3) / 2 )); cy=$(( ($2 + $4) / 2 ))
  input tap "$cx" "$cy"; act "tap_desc '$d' -> ($cx,$cy)"; return 0
}

# dismiss intermittent consent/overlay dialogs that BLOCK the mode strip (the verified flake root).
# Known: the AI Service Engine "Statement of Use" privacy notice (com.oplus.aiunit) pops ~1/3 of cold
# launches with btn_privacy_confirm="Agree and continue". Returns 0 if it dismissed something.
dismiss_overlays() {
  if tap_id "com.oplus.aiunit:id/btn_privacy_confirm"; then act "dismissed AI-consent (Agree and continue)"; sleep 1; return 0; fi
  # Runtime camera-permission dialog — e.g. the "Allow Scan to take pictures and record video?" popup from the
  # doc-digitizer (scandoc/text). VERIFIED root of the ~82KB scene.png poison: it stays foreground and every
  # cold camera launch comes up BEHIND it, so all modes screenshot the popup. Dismiss it (allow foreground so
  # it doesn't re-prompt). permissioncontroller button ids are stable across the AOSP dialog.
  if tap_id "com.android.permissioncontroller:id/permission_allow_foreground_only_button"; then act "granted runtime perm (While using the app)"; sleep 1; return 0; fi
  if tap_id "com.android.permissioncontroller:id/permission_allow_button"; then act "granted runtime perm (Allow)"; sleep 1; return 0; fi
  if tap_id "com.android.permissioncontroller:id/permission_deny_button"; then act "dismissed runtime perm dialog (deny)"; sleep 1; return 0; fi
  return 1
}

launch() {
  # COLD start = deterministic + always-live preview (the app blanks the strip when idle).
  input keyevent KEYCODE_WAKEUP 2>/dev/null
  am force-stop "$PKG" 2>/dev/null
  am start -n "$PKG/.Camera" >/dev/null 2>&1 || am start -n "$PKG/com.oplus.camera.Camera" >/dev/null 2>&1
  act "launch $PKG (cold)"; sleep 5
  # SETTLE + FOREGROUND-VERIFY: dismiss blocking dialogs AND make sure com.oplus.camera actually OWNS the
  # foreground before nav. A stuck permission popup or the doc-Scan app obscures the camera, so every cold
  # launch comes up behind it and we screenshot the wrong screen (the ~82KB scene.png poison). If the
  # foreground is NOT the camera, back out of the intruder + relaunch; only proceed when the camera is
  # foreground AND the mode strip is readable.
  s=0; while [ "$s" -lt 6 ]; do
    dismiss_overlays && { sleep 1; continue; }
    fg=$(dumpsys window 2>/dev/null | grep -m1 mCurrentFocus)
    case "$fg" in
      *com.oplus.camera*) [ -n "$(current_mode)" ] && break ;;
      *) act "launch: foreground NOT camera ($fg) — backing out + relaunching"
         input keyevent KEYCODE_BACK; sleep 1; input keyevent KEYCODE_HOME; sleep 1
         am force-stop "$PKG" 2>/dev/null
         am start -n "$PKG/.Camera" >/dev/null 2>&1 || am start -n "$PKG/com.oplus.camera.Camera" >/dev/null 2>&1
         sleep 4 ;;
    esac
    input keyevent KEYCODE_WAKEUP; input tap "$PREVIEW_CX" "$PREVIEW_CY" 2>/dev/null; sleep 2; act "settle: nudged preview awake ($s)"
    s=$((s+1))
  done
  [ "$AE_LOCK" = 1 ] && aelock
}
# DRIVE_NAVONLY=1 (set by app_probe_capture.sh) navigates to the mode but SKIPS the shutter, so a frida
# app-side probe can attach to the freshly-launched app BEFORE the capture trigger. Pair with DRIVE_NO_CLOSE=1.
# RAW full-finger shutter tap (incl. ABS_MT_TOUCH_MAJOR + BTN_TOOL_FINGER). The LOS-ported OnePlus
# shutter IGNORES `input tap` and size-0 sendevent — it fires a still ONLY on a real finger contact
# (verified 2026-06-15: input tap => no still=1; full contact => still=1). OOS accepts input tap, so
# this is the LOS-bringup enabler that lets the A/B campaign drive real captures on LOS.
raw_shutter() {
  dump || return 1
  line=$(tr '>' '\n' < /data/local/tmp/obs_ui.xml 2>/dev/null | grep -F "resource-id=\"$RID_SHUTTER\"" | head -1)
  [ -z "$line" ] && { act "raw_shutter: $RID_SHUTTER NOT FOUND"; return 1; }
  b=$(echo "$line" | grep -oE 'bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' | head -1 | grep -oE '[0-9]+')
  set -- $b; [ $# -lt 4 ] && return 1
  cx=$(( (($1 + $3) / 2) * 16 )); cy=$(( (($2 + $4) / 2) * 16 )); D="$TOUCH_DEV"
  se() { sendevent "$D" "$1" "$2" "$3"; }
  se 3 47 0; se 3 57 88; se 3 55 0; se 3 48 120; se 3 49 120; se 3 53 "$cx"; se 3 54 "$cy"; se 1 330 1; se 1 325 1; se 0 0 0
  sleep 0.1
  se 3 47 0; se 3 57 4294967295; se 1 330 0; se 1 325 0; se 0 0 0
  act "raw_shutter -> center*16 ($cx,$cy) full-finger contact"; return 0
}
shutter() { [ "$DRIVE_NAVONLY" = 1 ] && { act "shutter skipped (NAVONLY)"; return 0; }; raw_shutter || tap_id "$RID_SHUTTER" || { input keyevent KEYCODE_CAMERA; act "shutter via KEYCODE_CAMERA"; }; }
# long-press the preview center to lock AE/AF (OplusCamera gesture).
longpress() { input swipe "$1" "$2" "$1" "$2" "${3:-900}"; act "longpress ($1,$2) ${3:-900}ms"; }
aelock()    { longpress "$PREVIEW_CX" "$PREVIEW_CY" 900; sleep 1; act "AE/AF lock (long-press preview)"; }
close()   { [ "$DRIVE_NO_CLOSE" = 1 ] && { act "close skipped (DRIVE_NO_CLOSE)"; return; }; am force-stop "$PKG" 2>/dev/null; act "force-stop $PKG"; }

# real protocol-B multitouch pinch-OUT -> ramp zoom to the 120x MAX (the AI super-zoom capture path).
# `input swipe` is single-pointer (a horizontal swipe just scrolls the mode strip; the zoom chips are not
# accessibility nodes), so we drive the touchpanel (/dev/input/event7) directly via sendevent (needs root).
# Touch space is 16x the 1272x2772 screen (X 0..20351, Y 0..44351). Two fingers start ~100px apart at the
# preview center and diverge vertically; repeated REPS times so the accumulated ratio clamps at 120x.
TOUCH_DEV=/dev/input/event7
pinch_zoom_max() {
  reps="${1:-4}"; D="$TOUCH_DEV"
  se() { sendevent "$D" "$1" "$2" "$3"; }
  cx=$((PREVIEW_CX*16)); a0=20800; a1=4800; b0=22400; b1=39200    # fingerA 1300->300 up, fingerB 1400->2450 down
  r=0
  while [ "$r" -lt "$reps" ]; do
    se 3 47 0; se 3 57 100; se 1 330 1; se 3 53 "$cx"; se 3 54 "$a0"   # slot0 (A) down
    se 3 47 1; se 3 57 101; se 3 53 "$cx"; se 3 54 "$b0"; se 0 0 0     # slot1 (B) down + SYN
    i=0
    while [ "$i" -le 16 ]; do
      ay=$(( a0 - (a0-a1)*i/16 )); by=$(( b0 + (b1-b0)*i/16 ))
      se 3 47 0; se 3 53 "$cx"; se 3 54 "$ay"
      se 3 47 1; se 3 53 "$cx"; se 3 54 "$by"; se 0 0 0
      i=$((i+1))
    done
    se 3 47 0; se 3 57 4294967295; se 3 47 1; se 3 57 4294967295; se 1 330 0; se 0 0 0   # lift both (id=-1)
    r=$((r+1)); sleep 1
  done
  act "pinch_zoom_max: $reps pinch-out(s) -> zoom ramped to 120x max (AI super-zoom)"
}

# the filter LUT carousel RE-CENTERS on the selected item, so a fixed slot coord drifts after any selection
# (observed: a reset tap meant for 'Original' landed on 'Cold flash'). Fling it back to the START — content
# moves L->R, bringing Original to the leftmost slot — so FILTER_NEON_XY / FILTER_ORIG_XY are deterministic.
filter_fling_start() { j=0; while [ "$j" -lt 5 ]; do input swipe 300 2480 1150 2480 250; j=$((j+1)); done; act "filter: carousel flung to start (Original leftmost)"; }

# --- mode strip: read the centered mode from headline_view content-desc ---
# RETRY on empty: a transient/un-settled dump returns no strip — blindly acting on "" sends nav the wrong
# way (the observed flake root). Retry a few times before declaring the strip unreadable.
current_mode() {
  n=0
  while [ "$n" -lt 4 ]; do
    dump
    m=$(tr '>' '\n' < /data/local/tmp/obs_ui.xml 2>/dev/null \
      | grep -oE 'content-desc="[A-Za-z0-9 ]+mode,' | head -1 \
      | grep -oE '[A-Za-z0-9]+mode,' | sed 's/mode,//' | tr '[:lower:]' '[:upper:]')
    [ -n "$m" ] && { echo "$m"; return 0; }
    n=$((n+1)); sleep 1
  done
  echo ""; return 1
}
mode_idx() { i=0; for m in $MODE_ORDER; do [ "$m" = "$1" ] && { echo $i; return; }; i=$((i+1)); done; echo -1; }
# deterministic MAIN-mode nav: step a calibrated one-tab swipe toward the target, with feedback.
# Hardened: NEVER swipe on an unreadable strip (the flake root) — wake/settle instead; confirm the target
# with a second read; cap generously to absorb the rare 2-tab swipe.
goto_main_mode() {
  want=$(echo "$1" | tr '[:lower:]' '[:upper:]'); wi=$(mode_idx "$want")
  [ "$wi" -lt 0 ] && { act "goto_main_mode: '$want' not a main mode"; return 2; }
  i=0; unknown=0
  while [ "$i" -lt 18 ]; do
    cur=$(current_mode); ci=$(mode_idx "$cur")
    if [ "$cur" = "$want" ]; then
      cur2=$(current_mode)                                    # confirm (guard a transient match)
      [ "$cur2" = "$want" ] && { act "goto_main_mode $want OK"; return 0; }
    fi
    if [ "$ci" -lt 0 ]; then                                  # strip unreadable: dismiss overlay / WAKE, do NOT swipe blindly
      if dismiss_overlays; then i=$((i+1)); continue; fi       # a consent dialog was blocking the strip
      unknown=$((unknown+1)); act "goto_main_mode: strip unreadable ($unknown) — waking/settling"
      input keyevent KEYCODE_WAKEUP; input tap "$PREVIEW_CX" "$PREVIEW_CY"; sleep 2
      if [ "$unknown" -ge 4 ]; then input swipe $STRIP_STEP_LEFT; sleep 2; unknown=0; fi  # last resort: nudge toward MORE end
    elif [ "$ci" -lt "$wi" ]; then unknown=0; input swipe $STRIP_STEP_RIGHT; act "goto step R (at=$cur->$want)"; sleep 2
    else unknown=0; input swipe $STRIP_STEP_LEFT; act "goto step L (at=$cur->$want)"; sleep 2; fi
    i=$((i+1))
  done
  act "goto_main_mode $want FAILED (last='$cur')"; return 1
}
# enter a MORE-grid submode: go MORE, tap the @more_item by content-desc.
enter_more_item() {
  goto_main_mode MORE || return 1; sleep 1
  tap_desc "$1" "more_item" || { act "enter_more_item '$1' FAILED"; return 1; }
  sleep 2
}
# ensure VIDEO resolution = 8K — FEEDBACK-DRIVEN (no blind coords). The old fixed-coord taps
# (VID_RES_CHIP / VID_RES_8K) mis-fired into OTHER apps (observed: Google Lens) whenever this ran on a
# screen that wasn't actually the open VIDEO resolution chooser — e.g. when goto_main_mode hadn't really
# reached VIDEO (frozen/slow camera) but the case ran ensure_8k regardless. Now: refuse unless in VIDEO,
# short-circuit if already 8K (this device defaults to 8K·30 → usually zero taps), else open the
# FrameRate/Size chooser BY CONTENT-DESC and tap "8K" only AFTER confirming the chooser actually opened.
ensure_8k() {
  [ "$(current_mode)" = "VIDEO" ] || { act "ensure_8k: not in VIDEO (got '$(current_mode)') — REFUSE (no blind tap)"; return 1; }
  dump
  if tr '>' '\n' < /data/local/tmp/obs_ui.xml 2>/dev/null | grep -F 'id/tv_first' | grep -qE 'text="8K'; then
    act "ensure 8K OK (already 8K — no taps)"; return 0   # canonical marker 'ensure 8K' for validate_modes
  fi
  tap_desc "FrameRate and Size" || { act "ensure_8k: FrameRate chip not found — ABORT (no blind tap)"; return 1; }
  sleep 1; dump
  if ! tr '>' '\n' < /data/local/tmp/obs_ui.xml 2>/dev/null | grep -qF 'content-desc="8K"'; then
    act "ensure_8k: chooser did not open (no 8K option) — ABORT (no blind tap)"; return 1
  fi
  tap_desc "8K" || { act "ensure_8k: 8K option tap failed"; return 1; }
  sleep 1; act "ensure 8K (feedback-driven, confirmed)"; return 0
}

# MASTER's Auto|Pro sub-toggle PERSISTS Pro across relaunch (sticky), AND its toggle row shifts position when
# the manual bar is shown — so a BLIND tap on master_pro toggles Pro back OFF when it's already on (observed:
# the p010 MASTER shot silently fell back to Auto). FEEDBACK-DRIVEN like ensure_8k: if already Pro (the
# professional params bar / 'capture params pro' present) do nothing; else tap master_pro and CONFIRM it engaged.
ensure_pro() {
  dump
  if tr '>' '\n' < /data/local/tmp/obs_ui.xml 2>/dev/null | grep -qE 'professional_params_bar_container|capture params pro'; then
    act "ensure_pro OK (already Pro — no tap)"; return 0
  fi
  tap_id "$RID_MASTER_PRO" || { act "ensure_pro: master_pro not found — ABORT"; return 1; }
  sleep 1; dump
  if tr '>' '\n' < /data/local/tmp/obs_ui.xml 2>/dev/null | grep -qE 'professional_params_bar_container|capture params pro'; then
    act "ensure_pro: engaged Pro (confirmed)"; return 0
  fi
  act "ensure_pro: tapped but Pro not confirmed — ABORT"; return 1
}

# MASTER/Pro 'Format' control: a collapsed pill (content-desc="Format") that EXPANDS to Format|JPG|RAW on tap;
# the JPG/RAW option nodes (content-desc + selected="true|false") exist ONLY while expanded. Format is sticky
# (persists like Pro), so set it feedback-driven and reset it after. CRUCIAL: the shutter is BLOCKED while the
# Format submenu is open — after selecting, you must tap OFF the bar (onto the preview) to DISENGAGE it, else
# the capture silently produces no file. $1 = JPG | RAW.
ensure_format() {
  want="$1"; dump
  # expand the bar if the option nodes aren't present (collapsed shows only the 'Format' pill)
  if ! grep -qF "content-desc=\"$want\"" /data/local/tmp/obs_ui.xml; then
    tap_desc "Format" || { act "ensure_format: Format pill not found — ABORT"; return 1; }; sleep 1; dump
  fi
  if tr '>' '\n' < /data/local/tmp/obs_ui.xml 2>/dev/null | grep -F "content-desc=\"$want\"" | grep -q 'selected="true"'; then
    act "ensure_format OK ($want already selected)"
  else
    tap_desc "$want" || { act "ensure_format: '$want' option not found — ABORT"; return 1; }; sleep 1; dump
    if tr '>' '\n' < /data/local/tmp/obs_ui.xml 2>/dev/null | grep -F "content-desc=\"$want\"" | grep -q 'selected="true"'; then
      act "ensure_format: set $want (confirmed)"
    else
      act "ensure_format: '$want' not confirmed — ABORT"; return 1
    fi
  fi
  # DISENGAGE: tap off the submenu onto the preview, else the shutter is blocked (proven: RAW capture saved 0
  # files with the bar open; saved the .dng once disengaged). $PREVIEW_CX,900 is clear of all controls.
  input tap "$PREVIEW_CX" 900; sleep 1; act "ensure_format: tapped off submenu (disengaged)"; return 0
}

# CAPTURED-WHAT-WE-WANTED guard. Coverage (13/13 probes armed) does NOT prove we captured the intended
# scene: a mis-tap that lands in Google Lens — or the wrong camera mode — still arms probes and flows frames.
# Call before the capture trigger to assert the camera is foreground AND in the expected mode; abort if not.
assert_scope() {
  want=$(echo "$1" | tr '[:lower:]' '[:upper:]')
  fg=$(dumpsys window 2>/dev/null | grep -m1 mCurrentFocus)
  case "$fg" in
    *com.oplus.camera*) : ;;
    *) act "assert_scope: FOREGROUND is not the camera ($fg) — ABORT capture"; return 1 ;;
  esac
  cm=$(current_mode)
  [ "$cm" = "$want" ] || { act "assert_scope: mode is '$cm', wanted '$want' — ABORT capture"; return 1; }
  act "assert_scope OK (camera foreground, mode=$cm)"; return 0
}

run_session() {
  ac="$SESS_DIR/$1.actions"
  [ -f "$ac" ] || { act "replay: no session $1 (.actions)"; echo "no session: $1"; return 2; }
  act "replay session=$1 ($ac)"
  while IFS= read -r ln; do
    set -- $ln; v="$1"; shift 2>/dev/null
    case "$v" in
      ''|'#'*) : ;;
      tap)       input tap "$1" "$2"; act "tap $1 $2" ;;
      longpress) longpress "$1" "$2" "${3:-900}" ;;
      swipe)     input swipe "$1" "$2" "$3" "$4" "${5:-250}"; act "swipe $1 $2 $3 $4 ${5:-250}" ;;
      key)       input keyevent "$1"; act "key $1" ;;
      shutter)   shutter ;;
      aelock)    aelock ;;
      sleep)     sleep "$1"; act "sleep $1" ;;
      *)         act "replay: unknown verb '$v'" ;;
    esac
  done < "$ac"
}

case "$MODE" in
  photo)        launch; goto_main_mode PHOTO; sleep 1; shutter; sleep 5 ;;          # #2 baseline HDR/JPEG
  scene)        launch; goto_main_mode PHOTO; sleep 1; shutter; sleep 5 ;;          # AI-scene/HDR on the framed scene (same as photo; scene set physically)
  burst)        launch; goto_main_mode PHOTO; sleep 1
                # resolve the shutter coords ONCE, then tap RAPIDLY. The old form called shutter() per tap,
                # which does a uiautomator dump each time (~3s/tap) — far too slow to burst. Fast back-to-back
                # taps at the fixed coord = a real burst. (holdshutter is the SEPARATE long-press test.)
                set -- $(dump; tr '>' '\n' < /data/local/tmp/obs_ui.xml | grep -F "resource-id=\"$RID_SHUTTER\"" | grep -oE 'bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' | head -1 | grep -oE '[0-9]+')
                if [ $# -ge 4 ]; then scx=$(( ($1+$3)/2 )); scy=$(( ($2+$4)/2 )); else scx=636; scy=2261; fi
                # ~0.5s between taps: fast enough to be a burst, slow enough that each registers (taps with
                # NO gap coalesce into a single capture on this HAL). Tune SHUTTER_GAP if needed.
                i=0; while [ $i -lt 6 ]; do input tap "$scx" "$scy"; sleep "${SHUTTER_GAP:-0.5}"; i=$((i+1)); done; act "burst: 6 taps @ ($scx,$scy) gap=${SHUTTER_GAP:-0.5}s"; sleep 4 ;;   # #4 back-to-back UAF
  holdshutter)  launch; goto_main_mode PHOTO; sleep 1
                # press-and-hold the shutter -> continuous shot (Cshot, ~19 frames). NO leading tap: the old
                # `tap_id $RID_SHUTTER` to "locate" the shutter fired a spurious photo before the hold; the
                # line below re-resolves the coords from a dump anyway.
                set -- $(dump; tr '>' '\n' < /data/local/tmp/obs_ui.xml | grep -F "resource-id=\"$RID_SHUTTER\"" | grep -oE 'bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' | head -1 | grep -oE '[0-9]+')
                if [ $# -ge 4 ]; then scx=$(( ($1+$3)/2 )); scy=$(( ($2+$4)/2 )); else scx=636; scy=2261; fi
                longpress "$scx" "$scy" 2500; sleep 4 ;;
  video)        launch; goto_main_mode VIDEO || { act "video: goto VIDEO failed — ABORT (no capture)"; close; exit 3; }
                sleep 1; assert_scope VIDEO || { close; exit 3; }
                shutter; sleep 4; shutter; sleep 2 ;;  # preview/record baseline
  video8k)      launch; goto_main_mode VIDEO || { act "video8k: goto VIDEO failed — ABORT (no capture)"; close; exit 3; }
                sleep 1; ensure_8k || { act "video8k: ensure_8k failed — ABORT (no capture)"; close; exit 3; }
                assert_scope VIDEO || { close; exit 3; }
                shutter; sleep 4; shutter; sleep 2 ;;  # #8 configure_streams/EISv2
  p010)         # D1 native P010/plane-layout contract: a real HDR Photo (P010) THEN a Master/Pro capture
                # (the trace_p010_planes blob hooks only fire once libAlgoProcess loads + a P010 buffer flows).
                launch; goto_main_mode PHOTO; sleep 1; shutter; sleep 7
                goto_main_mode MASTER; sleep 2; ensure_pro || { close; exit 3; }; sleep 1   # engage Pro/manual (feedback-driven; Pro is sticky)
                shutter; sleep 7 ;;
  masterraw)    # like p010, but the MASTER/Pro shot is captured in RAW (DNG) — exercises the Pro RAW output
                # stream + op_mode. Format is sticky, so switch JPG->RAW feedback-driven then RESET to JPG after.
                launch; goto_main_mode PHOTO; sleep 1; shutter; sleep 7
                goto_main_mode MASTER; sleep 2; ensure_pro || { close; exit 3; }
                ensure_format RAW || { close; exit 3; }; sleep 1; shutter; sleep 7
                ensure_format JPG; act "masterraw: reset format -> JPG (sticky-format hygiene)" ;;
  portrait)     launch; goto_main_mode PORTRAIT; sleep 1; shutter; sleep 5 ;;       # bokeh/depth + logical-multicam
  text)         launch; goto_main_mode TEXT; sleep 1; shutter; sleep 4 ;;           # text/AI-extraction mode
  selfie)       launch; goto_main_mode PHOTO; sleep 1; tap_id "$RID_SWITCH_CAM"; sleep 3; shutter; sleep 4 ;;  # front-cam configure_streams
  motionphoto)  launch; goto_main_mode PHOTO; sleep 1; tap_id "$RID_LIVE_PHOTO"; sleep 1; shutter; sleep 5 ;;  # CameraMetadataNativeWrapper/HEIF
  beauty)       launch; goto_main_mode PHOTO; sleep 1; assert_scope PHOTO || { close; exit 3; }
                tap_id "$RID_FACE_BEAUTY"; sleep 2                                   # open retouch panel (menu_left_enter)
                input tap $BEAUTY_PRESET_XY; act "beauty: select Natural preset ($BEAUTY_PRESET_XY)"; sleep 2
                input tap $BEAUTY_MENU_XY; sleep 1; act "beauty: close panel ($BEAUTY_MENU_XY) -> reveal shutter"   # toggle panel shut
                shutter; sleep 5       # arcsoft beauty path (Natural preset active, not Original/off)
                tap_id "$RID_FACE_BEAUTY"; sleep 2; input tap $BEAUTY_ORIG_XY; sleep 1
                input tap $BEAUTY_MENU_XY; act "beauty: SELF-RESET to Original (sticky-effect hygiene)" ;;
  filter)       launch; goto_main_mode PHOTO; sleep 1; assert_scope PHOTO || { close; exit 3; }
                tap_id "$RID_FILTER"; sleep 2; filter_fling_start                   # open LUT panel + deterministic start
                input tap $FILTER_NEON_XY; act "filter: select Neon ($FILTER_NEON_XY)"; sleep 2
                input tap $FILTER_MENU_XY; sleep 1; act "filter: close panel -> reveal shutter"   # toggle panel shut
                shutter; sleep 5       # filter/LUT path (Neon active, not Original/off)
                tap_id "$RID_FILTER"; sleep 2; filter_fling_start; input tap $FILTER_ORIG_XY; sleep 1
                input tap $FILTER_MENU_XY; act "filter: SELF-RESET to Original (sticky-effect hygiene)" ;;
  night)        launch; enter_more_item "NIGHT"; sleep 1; shutter; sleep 8 ;;       # MORE-grid: long-exposure night
  longexp)      launch; enter_more_item "LONG EXPOSURE"; sleep 1; shutter; sleep 8 ;; # MORE-grid: G8 finalize / camAECGetParam
  scandoc)      launch; enter_more_item "SCAN DOCS"; sleep 1; shutter; sleep 4 ;;    # MORE-grid: document scan op_mode
  switch)       launch; goto_main_mode PHOTO; sleep 1; pinch_zoom_max 4; sleep 1
                assert_scope PHOTO || { close; exit 3; }; shutter; sleep 5 ;;  # full pinch-out to 120x -> AI super-zoom reconfigure
  replay)
    [ -z "$SESSION" ] && { echo "replay needs a session name: drive_cycle.sh replay <session>"; exit 2; }
    launch; run_session "$SESSION"; sleep 2 ;;
  *)
    act "UNKNOWN mode $MODE"; echo "unknown mode: $MODE" ; exit 2 ;;
esac

# preview-state probe point: is onImageAvailable flowing? (the freeze signature #1) — ANR-style dump
PID=$(pgrep -f "$PKG" | head -1)
[ -n "$PID" ] && { kill -3 "$PID" 2>/dev/null; act "SIGQUIT $PID -> /data/anr (preview-thread state)"; }
close
act "mode=$MODE complete"
echo "WROTE $LOG  (mode=$MODE). Pair with the same mode on the other build for an A/B."
