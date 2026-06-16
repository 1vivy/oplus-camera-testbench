#!/system/bin/sh
# Full finger-contact raw tap (MT type B) — includes ABS_MT_TOUCH_MAJOR/MINOR + TOOL_TYPE +
# BTN_TOOL_FINGER, matching a real finger. The OnePlus camera shutter ignores input-tap / size-0
# synthetic touches but fires on a real contact. Coord space = 16x screen. Args: screen_x screen_y
DEV=/dev/input/event7
X=$(( $1 * 16 ))
Y=$(( $2 * 16 ))
ID=$(( $(date +%s 2>/dev/null) % 30000 + 100 ))
# down (new contact in slot 0)
sendevent $DEV 3 47 0          # ABS_MT_SLOT 0
sendevent $DEV 3 57 $ID        # ABS_MT_TRACKING_ID (new)
sendevent $DEV 3 55 0          # ABS_MT_TOOL_TYPE = MT_TOOL_FINGER
sendevent $DEV 3 48 120        # ABS_MT_TOUCH_MAJOR (contact size)
sendevent $DEV 3 49 120        # ABS_MT_TOUCH_MINOR
sendevent $DEV 3 53 $X         # ABS_MT_POSITION_X
sendevent $DEV 3 54 $Y         # ABS_MT_POSITION_Y
sendevent $DEV 1 330 1         # BTN_TOUCH down
sendevent $DEV 1 325 1         # BTN_TOOL_FINGER down
sendevent $DEV 0 0 0           # SYN_REPORT
sleep 0.09
# up (lift contact)
sendevent $DEV 3 47 0          # ABS_MT_SLOT 0
sendevent $DEV 3 57 4294967295 # ABS_MT_TRACKING_ID -1 (lift)
sendevent $DEV 1 330 0         # BTN_TOUCH up
sendevent $DEV 1 325 0         # BTN_TOOL_FINGER up
sendevent $DEV 0 0 0           # SYN_REPORT
