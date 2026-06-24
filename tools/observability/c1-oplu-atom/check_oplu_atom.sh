#!/usr/bin/env bash
# c1-oplu-atom/check_oplu_atom.sh — verify C1 (v2.1): does a recorded MP4 carry the OEM 'oplu' udta atom?
#
# C1 chain: OEM app setParameter("OplusUserData",<blob>) -> StagefrightRecorder mOplusUserData ->
# kKeyOplusUserData -> MPEG4Writer writes a 'udta'>'oplu' box. This pulls the most-recent camcorder MP4
# and scans the container for the 'udta'/'oplu' fourccs. The atom is INERT unless the app actually passes
# the param (no regression either way) — this records the producer-side reality on v2.1.
#
# Run after recording a short video with the OEM camera app on the v2.1 unit.
# Usage:  check_oplu_atom.sh [tag] [remote_mp4]   # remote_mp4 optional; else newest DCIM .mp4
set -u
TAG="${1:-los-v21}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
DST="$REPO/reference/c1-oplu/${TAG}"; mkdir -p "$DST"
OUT="$DST/oplu_atom.txt"

REMOTE="${2:-}"
if [ -z "$REMOTE" ]; then
  REMOTE=$(adb shell 'ls -t /sdcard/DCIM/Camera/*.mp4 2>/dev/null | head -1' | tr -d '\r')
fi
echo "== C1 oplu-atom check tag=$TAG mp4=$REMOTE ==" | tee "$OUT"
if [ -z "$REMOTE" ]; then echo "  no MP4 found in /sdcard/DCIM/Camera — record a video first." | tee -a "$OUT"; exit 2; fi

LOCAL="$DST/$(basename "$REMOTE")"
adb pull "$REMOTE" "$LOCAL" >/dev/null 2>&1
# 'udta' / 'oplu' are atom fourccs; scan with strings + a raw byte grep (atoms are length-prefixed, not
# null-terminated, so grep -a on the raw file is the reliable check).
echo "-- fourcc scan --" | tee -a "$OUT"
{ grep -aoc "udta" "$LOCAL" 2>/dev/null | sed 's/^/  udta box count: /'
  grep -aoc "oplu" "$LOCAL" 2>/dev/null | sed 's/^/  oplu box count: /'; } | tee -a "$OUT"
echo "-- oplu payload context (if present) --" | tee -a "$OUT"
grep -aoE "oplu.{0,80}" "$LOCAL" 2>/dev/null | head -2 | tee -a "$OUT"

echo "== VERDICT ==" | tee -a "$OUT"
echo "  oplu>0 ⇒ C1 chain end-to-end (app set OplusUserData; writer emitted the atom)." | tee -a "$OUT"
echo "  oplu=0 ⇒ inert: app did not pass the recorder param (acceptable, no regression). Confirm the app" | tee -a "$OUT"
echo "          path with: adb logcat | grep -i 'OplusUserData\\|setParameter' during record." | tee -a "$OUT"
echo "wrote $OUT  (mp4 $LOCAL)"
