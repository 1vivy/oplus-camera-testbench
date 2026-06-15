#!/system/bin/sh
# replay_events.sh — DEVICE-SIDE faithful replay of a raw `getevent -t` capture (a *.events file from
# campaign/record_session.sh) back onto the touch device via sendevent, preserving inter-event timing.
#
# WHY: the OplusCamera mode strip is a momentum carousel — synthesized `input swipe` flings unpredictably
# (0, 1, or 2+ modes). A REAL recorded two-finger slide, replayed event-for-event, reproduces the exact
# gesture the user made (which lands on exactly one mode). This is the deterministic strip-nav primitive.
# Replay runs slightly time-stretched (sendevent spawn latency) → a *controlled* drag, which only helps
# (less release fling). Deltas are capped so a recording pause doesn't stall the run.
#
# .events line format (from `getevent -t <dev>`):  [   12345.678901] 0003 0035 000004a2
#   bracketed monotonic timestamp, then HEX type code value. A leading "# device=/dev/input/eventN"
#   header line (written by record_session.sh) sets the target device.
#
# Root required. Usage: sh replay_events.sh <path-to.events> [maxgap_ms]
set -u
F="${1:?usage: replay_events.sh <file.events> [maxgap_ms]}"
MAXGAP="${2:-400}"                 # cap any inter-event sleep at this many ms (kills long record pauses)
[ -f "$F" ] || { echo "replay_events: no file $F"; exit 2; }

# device: from the header, else autodetect the touchscreen
DEV=$(grep -m1 '^# device=' "$F" 2>/dev/null | sed 's/^# device=//' | tr -d '\r')
if [ -z "$DEV" ]; then
  DEV=$(getevent -lp 2>/dev/null | awk '/^add device/{d=$NF} /ABS_MT_POSITION_X/{print d; exit}')
fi
[ -z "$DEV" ] && { echo "replay_events: no touch device"; exit 2; }

prev=""
# stream the events; for each, sleep the (capped) delta then emit. awk pre-computes decimal fields + delta.
grep ':' "$F" 2>/dev/null | grep -vE '^#' | awk -v maxg="$MAXGAP" '
  {
    # timestamp is the first [ ... ] token; the last 3 fields are hex type code value
    line=$0
    ts=line; sub(/^[^[]*\[[ ]*/,"",ts); sub(/\].*/,"",ts)+0; ts=ts+0
    n=split(line,a," ")
    t=a[n-2]; c=a[n-1]; v=a[n]
    # strip a trailing device "evN:" token case where value parsing shifted — require 3 hex-ish fields
    if (t ~ /^[0-9a-fA-F]+$/ && c ~ /^[0-9a-fA-F]+$/ && v ~ /^[0-9a-fA-F]+$/) {
      if (prev=="") d=0; else { d=(ts-prev)*1000; if (d<0) d=0; if (d>maxg) d=maxg }
      prev=ts
      printf "%d %s %s %s\n", d, t, c, v
    }
  }' | while read -r dms t c v; do
    if [ "$dms" -gt 0 ] 2>/dev/null; then sleep "$(awk -v m="$dms" 'BEGIN{printf "%.3f", m/1000}')"; fi
    sendevent "$DEV" "$((0x$t))" "$((0x$c))" "$((0x$v))" 2>/dev/null
  done
echo "replay_events: done ($F)"
