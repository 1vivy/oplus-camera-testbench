#!/usr/bin/env bash
# r4-oem-transact/15_r2_extload_check.sh — verify R2 (v2.1): does cameraserver actually LOAD the OEM ext?
#
# v2.1 wires CameraServiceExtFactory to dlopen system_ext/lib64/libcsextimpl.so and resolve
# getExtFactoryImpl / onTransact / setCameraServiceInstance. The factory ALOGI's each step, so a logcat
# scrape is a cheap, decisive R2 health check BEFORE the heavier r4 capture.
#
# Run on the v2.1 LOS unit (permissive). Restart cameraserver so the dlopen happens under capture.
# Usage:  15_r2_extload_check.sh [tag]    # tag e.g. los-v21
set -u
TAG="${1:-los-v21}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
DST="$REPO/reference/r4/${TAG}"
mkdir -p "$DST"
OUT="$DST/r2_extload.txt"
echo "== R2 ext-load check tag=$TAG ==" | tee "$OUT"
adb shell 'getprop ro.lineage.build.version; getenforce' | tee -a "$OUT"

# 1) restart cameraserver so the CameraServiceExtFactory dlopen runs while we watch logcat
adb logcat -c 2>/dev/null
adb shell su -c 'killall cameraserver' 2>/dev/null || true
# give it a moment to respawn + open a camera client (the factory loads lazily on first ensureLoaded())
adb shell 'am start -n com.oplus.camera/.OplusCamera' 2>/dev/null || \
  adb shell 'monkey -p com.oplus.camera -c android.intent.category.LAUNCHER 1' 2>/dev/null || true
sleep 6

# 2) scrape the factory's own ALOGI/ALOGE breadcrumbs
adb logcat -d -b all | grep -iE "CameraServiceExtFactory" | tee -a "$OUT"

# 3) is libcsextimpl actually mapped in cameraserver now?
CSPID=$(adb shell pidof cameraserver | tr -d '\r')
echo "-- cameraserver pid=$CSPID maps --" | tee -a "$OUT"
[ -n "$CSPID" ] && adb shell su -c "grep -c csextimpl /proc/$CSPID/maps" | sed 's/^/  libcsextimpl mappings: /' | tee -a "$OUT"

# 4) sepolicy denials touching the ext (the known risk)
echo "-- avc denials (cameraserver / csextimpl) --" | tee -a "$OUT"
adb logcat -d -b all | grep -iE "avc: *denied.*(cameraserver|csextimpl|system_ext)" | head | tee -a "$OUT"

echo "== VERDICT ==" | tee -a "$OUT"
echo "  PASS  = 'dlopen succeeded' + 'getExtFactoryImpl at' + 'onTransact found' + 'setCameraServiceInstance found' + libcsextimpl mappings>0" | tee -a "$OUT"
echo "  FAIL  = 'dlopen failed' (check sepolicy denials above + try absolute /system_ext path) | 0 mappings | dlsym failed lines" | tee -a "$OUT"
echo "wrote $OUT"
