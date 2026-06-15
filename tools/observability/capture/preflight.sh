#!/usr/bin/env bash
# capture/preflight.sh — readiness gate for a golden baseline run. Verifies the device + harness are ready
# and that the UI driver is calibrated for THIS firmware/variant, BEFORE any capture burns a cycle.
# Reuses the ab_capture.sh fresh-tombstone idiom (crash-loop guard) and evaluates resmap.sh ON THE DEVICE
# (where getprop works) to detect "no case for this build". doc-50 / baseline.sh.
#
# Usage: preflight.sh <condition> <dest_dir>     # writes <dest_dir>/PREFLIGHT.md
# Exit:  0=ready   3=needs-calibration   2=blocked
set -u
COND="${1:?usage: preflight.sh <condition> <dest_dir>}"
DEST="${2:?usage: preflight.sh <condition> <dest_dir>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OBS="$(cd "$HERE/.." && pwd)"
REPO="$(cd "$OBS/../.." && pwd)"
ENVF="$OBS/campaign/conditions/${COND}.env"
MD="$DEST/PREFLIGHT.md"
mkdir -p "$DEST"

MODE=photo
# shellcheck disable=SC1090
[ -f "$ENVF" ] && . "$ENVF"

fails=""; warns=""; info=""
FAIL(){ fails="$fails
- $*"; }
WARN(){ warns="$warns
- $*"; }
INFO(){ info="$info
- $*"; }

# --- device reachable ---
if ! adb get-state >/dev/null 2>&1; then
  { echo "# PREFLIGHT — $COND"; echo; echo "**VERDICT: blocked** — no adb device."; } > "$MD"
  echo "blocked"; exit 2
fi

# --- 1. root (KernelSU su) ---
ID=$(adb shell 'su -c id' 2>/dev/null | tr -d '\r')
echo "$ID" | grep -q 'uid=0' || FAIL "KernelSU su not granted (\`su -c id\` != uid=0): $ID"

# --- 2. build identity ---
ROM=$(adb shell getprop ro.build.version.oplusrom 2>/dev/null | tr -d '\r')
LOS=$(adb shell getprop ro.lineage.build.version 2>/dev/null | tr -d '\r')
DISP=$(adb shell getprop ro.build.display.id 2>/dev/null | tr -d '\r')
DEV=$(adb shell getprop ro.product.device 2>/dev/null | tr -d '\r')
BUILD="$ROM$LOS"
INFO "build: oplusrom=\`$ROM\` lineage=\`$LOS\` display=\`$DISP\` device=\`$DEV\`"
[ -z "$BUILD" ] && WARN "no oplusrom/lineage build prop — resmap match may fail"

# --- 3. SELINUX (record; frida+strace proven under Enforcing) ---
ENF=$(adb shell getenforce 2>/dev/null | tr -d '\r'); INFO "selinux: \`$ENF\`"
[ "$ENF" = "Disabled" ] && WARN "SELinux Disabled (unexpected for a stock baseline)"

# --- 4. frida-server alive + version vs host ---
FS=$(adb shell 'su -c "pidof frida-server"' 2>/dev/null | tr -d '\r')
if [ -z "$FS" ]; then
  adb shell 'su -c "nohup frida-server >/dev/null 2>&1 &"' 2>/dev/null; sleep 1
  FS=$(adb shell 'su -c "pidof frida-server"' 2>/dev/null | tr -d '\r')
fi
[ -z "$FS" ] && FAIL "frida-server not running and won't start"
DEV_FV=$(adb shell 'su -c "$(readlink -f /proc/'"$FS"'/exe 2>/dev/null) --version"' 2>/dev/null | tr -d '\r')
[ -z "$DEV_FV" ] && DEV_FV=$(adb shell 'su -c "/data/adb/modules/magisk-frida/bin/frida-server --version"' 2>/dev/null | tr -d '\r')
HOST_FV=$(frida --version 2>/dev/null)
[ -z "$HOST_FV" ] && FAIL "host frida CLI not on PATH"
INFO "frida: host=\`$HOST_FV\` device=\`$DEV_FV\`"
if [ -n "$HOST_FV" ] && [ -n "$DEV_FV" ]; then
  [ "${HOST_FV%%.*}" != "${DEV_FV%%.*}" ] && FAIL "frida MAJOR mismatch host=$HOST_FV dev=$DEV_FV (protocol incompatible)"
  [ "$HOST_FV" != "$DEV_FV" ] && [ "${HOST_FV%%.*}" = "${DEV_FV%%.*}" ] && WARN "frida minor drift host=$HOST_FV dev=$DEV_FV"
fi

# --- 5. camera not crash-looping (fresh camera-signature tombstone < 120s) ---
NEWT=$(adb shell 'su -c "ls -t /data/tombstones/tombstone_* 2>/dev/null | grep -v .pb | head -1"' 2>/dev/null | tr -d '\r')
if [ -n "$NEWT" ]; then
  TMT=$(adb shell "su -c 'stat -c %Y $NEWT 2>/dev/null'" 2>/dev/null | tr -d '\r')
  DNOW=$(adb shell 'date +%s' 2>/dev/null | tr -d '\r')
  SIG=$(adb shell "su -c 'grep -am1 -E \"Cmdline|>>> \" $NEWT'" 2>/dev/null | tr -d '\r')
  if [ -n "$TMT" ] && [ -n "$DNOW" ] && [ "$((DNOW - TMT))" -lt 120 ] 2>/dev/null; then
    if echo "$SIG" | grep -qiE 'camera|cameraserver|provider|AlgoProcess'; then
      FAIL "fresh CAMERA tombstone $NEWT (age $((DNOW-TMT))s): $SIG — camera crash-looping; fix before baseline"
    else
      WARN "fresh tombstone $NEWT (age $((DNOW-TMT))s) but not camera-signed: $SIG"
    fi
  else
    INFO "newest tombstone $NEWT not fresh (age $((DNOW-TMT))s) — ok"
  fi
fi
adb shell 'su -c "pidof cameraserver"' >/dev/null 2>&1 || WARN "cameraserver not running (will spawn on launch)"
adb shell 'su -c "pidof vendor.qti.camera.provider-service_64"' >/dev/null 2>&1 || WARN "camera provider not running"

# --- 6. resmap has a case for THIS build (evaluate resmap.sh ON DEVICE where getprop works) ---
# always push fresh — a stale on-device resmap (older case set) would mis-report calibration
adb push "$OBS/capture" /data/local/tmp/obs-capture >/dev/null 2>&1
# escape $ so the device's su-shell expands AFTER sourcing resmap; ${VAR:+1} emits a pipe/space-free
# sentinel (1 iff the var is set) so values containing spaces/'|' can't be mis-parsed as shell pipes.
RES=$(adb shell 'su -c ". /data/local/tmp/obs-capture/ui/resmap.sh; echo RM_MATCH=\${MODE_ORDER:+1}\${VID_RES_8K:+1}"' 2>/dev/null | tr -d '\r' | sed -n 's/^RM_MATCH=//p')
RESMAP_OK=0
[ "$RES" = "11" ] && RESMAP_OK=1
NEEDS_CAL=0
if [ "$RESMAP_OK" = 1 ]; then
  INFO "resmap: matched case for \`$BUILD\` (MODE_ORDER + VID_RES_8K present)"
else
  NEEDS_CAL=1
  WARN "resmap: NO case for build \`$BUILD\` (fell to default; key ids empty)"
  # escalate to blocked if THIS condition's mode needs an uncalibrated control
  case "$MODE" in video8k|night|longexp|scandoc|switch|selfie) FAIL "condition mode '$MODE' needs resmap ids that are uncalibrated for this build";; esac
fi

# --- 7. frida-inject (persistence) — info only ---
if adb shell 'su -c "ls /data/adb/modules/oplus_cam_probes/bin/frida-inject"' >/dev/null 2>&1; then
  INFO "persistence frida-inject present (resident probes can be LIVE)"
else
  WARN "persistence frida-inject absent — resident probes inert (interactive baseline unaffected)"
fi

# --- verdict ---
if [ -n "$fails" ]; then STATUS=blocked; CODE=2
elif [ "$NEEDS_CAL" = 1 ]; then STATUS=needs-calibration; CODE=3
else STATUS=ready; CODE=0; fi

{
  echo "# PREFLIGHT — $COND"
  echo
  echo "**VERDICT: $STATUS**   (mode=\`$MODE\`)"
  echo
  echo "## Info"; echo "$info"
  [ -n "$warns" ] && { echo; echo "## Warnings"; echo "$warns"; }
  [ -n "$fails" ] && { echo; echo "## Blockers"; echo "$fails"; }
  if [ "$NEEDS_CAL" = 1 ]; then
    echo
    echo "## resmap calibration (no case for build \`$BUILD\`)"
    echo '```'
    echo "1) adb shell 'am start -n com.oplus.camera/.Camera'   # let preview settle"
    echo "2) per screen (PHOTO bar / VIDEO resolution panel / switch button):"
    echo "     adb shell uiautomator dump /sdcard/u.xml && adb pull /sdcard/u.xml"
    echo "3) grep resource-id + bounds: shutter_button, switch_camera_button, more_item,"
    echo "     VIDEO 'FrameRate and Size' chip + 8K cell (tap coords), MODE strip y-center"
    echo "4) add a  case \"\$BUILD\")  arm to tools/observability/capture/ui/resmap.sh"
    echo "     (clone the V16.1.0 arm; fill RID_*, VID_RES_CHIP/VID_RES_8K, MODE_ORDER, STRIP_STEP_*, MODE_STRIP_Y)"
    echo "5) re-run: validate_modes.sh 3   (must reach K/K) then re-run baseline.sh"
    echo '```'
  fi
} > "$MD"

echo "$STATUS"
exit "$CODE"
