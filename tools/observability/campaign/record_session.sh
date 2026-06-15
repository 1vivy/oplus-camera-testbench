#!/usr/bin/env bash
# campaign/record_session.sh — HOST recorder for a canonical UI gesture session (record-and-replicate).
# Captures the user's EXACT touch stream (incl. the AE/AF long-press lock on a fixed scene, e.g. the RGB fan)
# via `getevent -t`, plus a screenrecord for visual reference. The recorded session is replayed
# byte-identically by `ui/drive_cycle.sh replay <name>` across every condition/repeat (and later LOS), so the
# stimulus is auditable AND reproducible — the FACT contract's G-COND/G-REP gates.
#
# Usage: tools/observability/campaign/record_session.sh <session-name> [max_seconds]
#   then perform on the device: open camera -> frame the scene -> LONG-PRESS to lock AE/AF -> shutter/mode acts.
#   press ENTER here to stop.
# Prereqs: adb + rooted (KernelSU). READ-ONLY w.r.t. partitions.
set -u
NAME="${1:?usage: record_session.sh <session-name> [max_seconds]}"
MAX="${2:-60}"
HERE="$(cd "$(dirname "$0")" && pwd)"
DST="$HERE/sessions"
mkdir -p "$DST"
EV="$DST/${NAME}.events"
MP4="$DST/${NAME}.mp4"

echo "== record_session '$NAME' (max ${MAX}s) =="
adb shell 'getprop ro.build.version.oplusrom; getprop ro.product.device' | tr '\n' ' '; echo

# 1) find the TOUCHSCREEN input device (the one exposing ABS_MT_POSITION_X)
TOUCH=$(adb shell 'getevent -lp 2>/dev/null' | awk '
  /^add device/ { dev=$NF }
  /ABS_MT_POSITION_X/ { print dev; exit }')
TOUCH=$(echo "$TOUCH" | tr -d '\r')
[ -z "$TOUCH" ] && { echo "ERROR: could not find touchscreen /dev/input/event* (ABS_MT_POSITION_X)"; exit 1; }
echo "touch device: $TOUCH"

# 2) start screenrecord (visual reference) + getevent capture (the replayable stream), both in background
adb shell "screenrecord --time-limit $MAX /sdcard/_rec_${NAME}.mp4" >/dev/null 2>&1 &
SR=$!
# getevent -t prints [   sec.usec] <dev>: TYPE CODE VALUE (hex). We pin to the touch device only.
adb shell "getevent -t $TOUCH" > "$DST/.${NAME}.raw" 2>/dev/null &
GE=$!

cat <<EOF

  >>> RECORDING. On the device now, perform the canonical sequence:
        open camera -> frame the scene (RGB fan) -> LONG-PRESS preview to lock AE/AF -> shutter (and any mode acts).
  >>> Press ENTER here when finished (or it auto-stops at ${MAX}s).
EOF
read -t "$MAX" _ || echo "(max time reached)"

# 3) stop capture
kill "$GE" 2>/dev/null
adb shell 'pkill -INT screenrecord' 2>/dev/null; wait "$SR" 2>/dev/null
sleep 1
adb pull "/sdcard/_rec_${NAME}.mp4" "$MP4" >/dev/null 2>&1 && adb shell "rm -f /sdcard/_rec_${NAME}.mp4"

# 4) write the session file: a DEVICE header line + the raw timestamped events (replay reconstructs from this)
{ echo "# device=$TOUCH"; echo "# recorded=$NAME max=${MAX}s"; cat "$DST/.${NAME}.raw"; } > "$EV"
rm -f "$DST/.${NAME}.raw"
LINES=$(grep -c ':' "$EV" 2>/dev/null || echo 0)
echo "== wrote $EV ($LINES event lines) + $MP4 =="
echo "   replay: adb push tools/observability/campaign/sessions /data/local/tmp/obs-sessions ;"
echo "           adb push tools/observability/capture /data/local/tmp/obs-capture ;"
echo "           adb shell su -c 'sh /data/local/tmp/obs-capture/ui/drive_cycle.sh replay $NAME'"
[ "$LINES" -lt 5 ] && echo "   WARN: very few events captured — re-record (wrong device? no gestures?)."
echo "   AUDIT the .mp4 to confirm the AE/AF lock badge appeared and the scene matched."
