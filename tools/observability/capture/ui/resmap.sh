# tools/observability/capture/ui/resmap.sh  (sourced by drive_cycle.sh — NOT executed standalone)
# Per-build OplusCamera resource-id map for the uiautomator fallback taps.
#
# WHY THIS FILE EXISTS: OplusCamera's resource-ids/layout can differ between stock OOS and a custom-ROM
# port. The driver prefers build-independent intents/keyevents; this map is ONLY for the modes intents
# can't reach (8K toggle, night, mode tabs). Leaving an id "" makes that step fall back or skip — the
# driver still runs, it just logs the gap. Fill the ids that matter for the symptom you're chasing.
#
# HOW TO FILL (per build):
#   adb shell uiautomator dump /sdcard/u.xml && adb pull /sdcard/u.xml
#   open the camera to the relevant screen first, then dump; grep for resource-id="com.oplus.camera:id/..."
#   of the shutter / mode tabs / 8K toggle / switch button, and paste the short id below.
#
# A resource-id is the part AFTER the package, e.g. for "com.oplus.camera:id/shutter_button" use
# "com.oplus.camera:id/shutter_button" verbatim (the driver matches the full resource-id string).

# Select the id set by build so one file serves both sides of the A/B. Match on a stable build prop.
BUILD=$(getprop ro.build.version.oplusrom 2>/dev/null)$(getprop ro.lineage.build.version 2>/dev/null)

case "$BUILD" in
  V16.1.0*|*OP611*)  # ---- OnePlus CPH2747 / OP611FL1, OOS V16.1.0 — verified via uiautomator dump 2026-06-13 ----
      RID_SHUTTER="com.oplus.camera:id/shutter_button"        # CONFIRMED bounds [520,2146][751,2377]
      RID_SWITCH_CAM="com.oplus.camera:id/switch_camera_button" # CONFIRMED "Switch to Front Camera" (selfie flip)
      # --- PHOTO-bar TOGGLES (all deterministic taps by resource-id, verified 2026-06-13) ---
      RID_LIVE_PHOTO="com.oplus.camera:id/live_photo"          # Motion Photo toggle (desc "Motion Photo off") [161,189][273,301]
      RID_FACE_BEAUTY="com.oplus.camera:id/camera_menu_left_enter_button"  # opens face-beauty panel (icon desc "face beauty off")
      RID_FILTER="com.oplus.camera:id/camera_menu_right_enter_button"      # opens filter panel (desc "filter off")
      RID_FLASH="com.oplus.camera:id/flash_mode"               # flash toggle (desc "Flash Auto")
      RID_SUBMENU="com.oplus.camera:id/submenu"                # top-right settings submenu (desc "SubSet")
      # --- MORE-grid (deterministic: fling-to-MORE then TAP @more_item by content-desc) ---
      RID_MORE_ITEM="com.oplus.camera:id/more_item"            # grid items share this id; select by content-desc
      # known MORE-grid descs (V16.1.0): NIGHT, HI-RES, PANO, "PRO VIDEO", SLO-MO, TIME-LAPSE,
      #   "LONG EXPOSURE", "DUAL-VIEW VIDEO", UNDERWATER, "SCAN DOCS", TILT-SHIFT  (tap-verified: LONG EXPOSURE)
      # --- MAIN strip modes (NO resource-id; single-finger horizontal swipe — the "double finger" in the
      #     content-desc is only the TalkBack hint; normal use is ONE finger. Two-finger = zoom). ---
      # CALIBRATED + verified 2026-06-13 (5/5 each direction, deterministic by DISTANCE, not velocity):
      #   strip order (index 0..5):  MORE · TEXT · PORTRAIT · PHOTO · VIDEO · MASTER
      #     (PHOTO's neighbours are PORTRAIT and VIDEO — matches device owner's note)
      #   ONE-TAB swipe = 250px over 600ms at y=2548:
      #     toward MASTER (index+1): input swipe 300 2548 550 2548 600
      #     toward MORE   (index-1): input swipe 550 2548 300 2548 600
      #   (a full-width 650px swipe = exactly 2 tabs; <250px = no move.) MORE = left-end attractor:
      #   repeated index-1 swipes reliably anchor there. drive_cycle goto_main_mode steps with
      #   current_mode feedback — no recording needed.
      MODE_ORDER="MORE TEXT PORTRAIT PHOTO VIDEO MASTER"
      STRIP_STEP_RIGHT="300 2548 550 2548 600"                 # index+1 (toward MASTER)
      STRIP_STEP_LEFT="550 2548 300 2548 600"                  # index-1 (toward MORE)
      RID_MODE_VIDEO=""; RID_MODE_PHOTO=""; RID_MODE_MORE=""; RID_MODE_NIGHT=""
      # 8K: in VIDEO, the "FrameRate and Size" chip (@oplus_setting_bar_middle) opens a Resolution panel
      # with tappable content-descs 720p/1080p/4K/8K + Frame rate 30fps/... (verified 2026-06-13).
      VID_RES_CHIP="980 245"                                   # tap to open the Resolution/FrameRate panel
      VID_RES_8K="1071 297"                                    # tap "8K" (bounds [961,241][1181,353])
      VID_RES_4K="851 297"                                     # tap "4K" (for an A/B vs 8K if needed)
      RID_8K_TOGGLE=""                                         # (no single id; use VID_RES_CHIP then VID_RES_8K)
      MODE_STRIP_Y=2548                                        # headline_view center (bounds [0,2478][1272,2618])
      ;;
  *)  # ---- DEFAULT / TODO: fill from `uiautomator dump` on THIS build ----
      RID_SHUTTER="com.oplus.camera:id/shutter_button"   # verify — most builds expose a shutter id
      RID_MODE_VIDEO=""; RID_MODE_PHOTO=""; RID_MODE_MORE=""; RID_MODE_NIGHT=""
      RID_8K_TOGGLE=""; RID_SWITCH_CAM=""
      MODE_STRIP_Y=""
      ;;
esac
