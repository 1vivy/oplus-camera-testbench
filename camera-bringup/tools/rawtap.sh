#!/system/bin/sh
# Raw kernel-level touch tap via sendevent on the touchpanel (/dev/input/event7).
# Bypasses InputManager injected-event filtering (OnePlus camera rejects `input tap`).
# Touch coord space = 16x screen (20352x44352 vs 1272x2772). Args: screen_x screen_y
DEV=/dev/input/event7
SX=$1
SY=$2
X=$((SX * 16))
Y=$((SY * 16))
# touch down (MT type B, slot 0)
sendevent $DEV 3 47 0
sendevent $DEV 3 57 1
sendevent $DEV 3 53 $X
sendevent $DEV 3 54 $Y
sendevent $DEV 1 330 1
sendevent $DEV 0 0 0
# brief hold
sleep 0.08
# touch up (lift slot 0)
sendevent $DEV 3 47 0
sendevent $DEV 3 57 4294967295
sendevent $DEV 1 330 0
sendevent $DEV 0 0 0
