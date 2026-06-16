#!/usr/bin/env bash
# campaign/run_condition.sh — HOST orchestrator for ONE controlled CONDITION, end-to-end, DEVICE-SERIAL.
# The device is a hard serialization point (one camera session at a time), so this owns the device for the
# whole condition: enable verbosity once, then REPEAT_N identical replay-driven ab_capture cycles, pull each
# to reference/campaign/<condition>/run<k>/, write metadata.json, and parse to a per-condition verdict.
# Deterministic stimulus = the recorded replay session + AE/AF lock (de-confound). Stock-only this phase.
#
# Usage: tools/observability/campaign/run_condition.sh <condition>     # reads conditions/<condition>.env
# Prereqs: adb + rooted (KernelSU), frida-server, a recorded session in campaign/sessions/ if MODE=replay.
set -u
COND="${1:?usage: run_condition.sh <condition>  (reads conditions/<condition>.env)}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OBS="$(cd "$HERE/.." && pwd)"
REPO="$(cd "$OBS/../.." && pwd)"
ENVF="$HERE/conditions/${COND}.env"
[ -f "$ENVF" ] || { echo "no condition file: $ENVF"; exit 1; }
ADB_UID=$(adb shell id -u 2>/dev/null | tr -d '\r')
adb_as_root() {
  if [ "$ADB_UID" = 0 ]; then
    adb shell "$1"
  else
    adb shell su -c "$1"
  fi
}

# condition knobs (with defaults)
MODE=photo; SESSION=""; AE_LOCK=0; SELINUX=""; REPEAT_N=3; NOTE=""; EXTRA_PROBES=""
# shellcheck disable=SC1090
. "$ENVF"
DST="$REPO/reference/campaign/${COND}"
mkdir -p "$DST"
echo "== condition '$COND': mode=$MODE session=$SESSION ae_lock=$AE_LOCK selinux=${SELINUX:-keep} N=$REPEAT_N =="

# build identity + (optional) SELinux set
adb shell 'getprop ro.build.version.oplusrom; getprop ro.lineage.build.version; getenforce' | tr '\n' ' '; echo
[ -n "$SELINUX" ] && adb_as_root "setenforce $([ "$SELINUX" = permissive ] && echo 0 || echo 1)" 2>/dev/null

# push kits CLEAN (rm-first defeats the adb push-into-existing-dir nesting gotcha) + the replay sessions
adb shell rm -rf /data/local/tmp/obs-enable /data/local/tmp/obs-capture /data/local/tmp/obs-sessions
adb push "$OBS/enable"           /data/local/tmp/obs-enable   >/dev/null
adb push "$OBS/capture"          /data/local/tmp/obs-capture  >/dev/null
adb push "$HERE/sessions"        /data/local/tmp/obs-sessions >/dev/null

# enable verbosity ONCE (restarts provider/cameraserver; reversible)
adb_as_root 'sh /data/local/tmp/obs-enable/00_enable_all.sh' >/dev/null 2>&1 || true
sleep 2

# --- FRIDA CO-ATTACH (provider-side) ---------------------------------------------------------------
# The CamX-core gate (g_logInfo) + CHI clobbers are defeated in-RAM by attaching the two levers to the
# camera provider and KEEPING them attached for the whole condition, so every run's logcat carries the
# working CamX-core/CHI contracts. Provider-side EXTRA_PROBES attach alongside. APP-side probes
# (trace_edr_invocation/trace_motionphoto/probe_getoplushwbuffer/trace_preview_delivery) need the fresh
# app pid per run -> run app_probe_capture.sh <condition> separately (it pairs DRIVE_NAVONLY + attach).
FDIR="$DST/frida"; mkdir -p "$FDIR"; FPIDS=""
have_frida=0; command -v frida >/dev/null 2>&1 && have_frida=1
adb_as_root 'pidof frida-server >/dev/null || (nohup frida-server >/dev/null 2>&1 &)' 2>/dev/null; sleep 1
prov_pid() { adb shell 'pgrep -f "^/vendor/bin/hw/vendor\\.qti\\.camera\\.provider-service_64$" | head -1' 2>/dev/null | tr -d '\r'; }
attach_provider() {  # $1 = frida script basename (no .js)
  s="$REPO/tools/frida/$1.js"; [ -f "$s" ] || { echo "   frida: missing $s"; return; }
  P=$(prov_pid); [ -z "$P" ] && { echo "   frida: provider not running ($1)"; return; }
  frida -U -p "$P" -l "$s" >"$FDIR/$1.log" 2>&1 &
  FPIDS="$FPIDS $!"; echo "   frida <- $1 (provider pid $P)"
}
attach_server() {  # $1 = frida script basename — server-side CameraServiceExtImpl probes (cameraserver daemon)
  s="$REPO/tools/frida/$1.js"; [ -f "$s" ] || { echo "   frida: missing $s"; return; }
  CS=$(adb shell 'pgrep -x cameraserver | head -1' 2>/dev/null | tr -d '\r')
  [ -z "$CS" ] && { echo "   frida: cameraserver not running ($1)"; return; }
  frida -U -p "$CS" -l "$s" >"$FDIR/$1.log" 2>&1 &
  FPIDS="$FPIDS $!"; echo "   frida <- $1 (cameraserver pid $CS)"
}
if [ "$have_frida" = 1 ]; then
  attach_provider enable_camx_logging          # CamX-core working contracts (crash-free, SENSOR/NCS excluded)
  attach_provider unclobber_camx_logs          # CHI tag survives configure
  for p in $EXTRA_PROBES; do
    case "$p" in
      dump_camxsettings|probe_aec_hdrdetect|probe_aec_getparam|hook_configure_streams|hook_eisv2_ports|observe_getmetadata|trace_dmabuf_alloc)
        # trace_dmabuf_alloc decodes dma_heap_allocation_data.len per camera DMA_HEAP_IOCTL_ALLOC (provider-side
        # ION alloc that bypasses gralloc — the earliest-divergence size field for the alloc-chain A/B).
        attach_provider "$p" ;;
      hook_before_configure_streams|probe_get_extension_opmode)
        # SERVER-side: CameraServiceExtImpl Depth-2 hooks live in cameraserver's libcsextimpl (TIER-2 8K)
        attach_server "$p" ;;
      trace_edr_invocation|trace_motionphoto|probe_getoplushwbuffer|trace_preview_delivery|trace_p010_planes|trace_aps_metadata_lifecycle|trace_turbohdr_tag|trace_gralloc_p010_chain|probe_aps_preview_routine|probe_sendinputdata_gate|trace_arcsoft_io)
        # APP-side: libAlgoProcess/OCS-SDK + the EDR/HwBuffer JNI + APS preview engine + the ArcSoft fusion
        # engines (trace_arcsoft_io) live in com.oplus.camera
        echo "   frida: '$p' is APP-side -> app_probe_capture.sh $COND" ;;
      *) echo "   frida: unknown probe '$p'" ;;
    esac
  done
  sleep 3   # let masks/hooks settle before the first capture
else
  echo "   (frida not on PATH — skipping CamX-core co-attach; logcat will be CHI/overlay-only)"
fi
kill_frida() { for fp in $FPIDS; do kill "$fp" 2>/dev/null; done; }
trap kill_frida EXIT

pull_dir() {  # $1=device obs_ab dir  $2=dest
  adb_as_root 'rm -rf /data/local/tmp/_pull' 2>/dev/null
  adb_as_root "cp -r $1 /data/local/tmp/_pull && chmod -R 777 /data/local/tmp/_pull" 2>/dev/null
  rm -rf "$2"; mkdir -p "$2"
  adb pull /data/local/tmp/_pull/. "$2"/ >/dev/null 2>&1
  adb_as_root 'rm -rf /data/local/tmp/_pull' 2>/dev/null
}

# REPEAT_N identical replay-driven ab_capture cycles (determinism: same stimulus each run)
k=1
while [ "$k" -le "$REPEAT_N" ]; do
  echo "  -- run $k/$REPEAT_N --"
  RUN="$DST/run${k}"; mkdir -p "$RUN"
  adb_as_root 'rm -rf /data/local/tmp/obs_ab_* /data/local/tmp/_pull' 2>/dev/null
  adb_as_root "AE_LOCK=$AE_LOCK sh /data/local/tmp/obs-capture/ab_capture.sh $MODE $SESSION" >/dev/null 2>&1
  DEVDIR=$(adb_as_root 'ls -dt /data/local/tmp/obs_ab_* 2>/dev/null | head -1' | tr -d '\r')
  [ -n "$DEVDIR" ] && pull_dir "$DEVDIR" "$RUN/ab" && adb_as_root "rm -rf $DEVDIR" 2>/dev/null
  if [ -s "$RUN/ab/scene_live.png" ]; then
    cp -f "$RUN/ab/scene_live.png" "$RUN/scene.png"
    cp -f "$RUN/ab/scene_live_audit.txt" "$RUN/scene_audit.txt" 2>/dev/null || printf 'scene_ok=1 foreground=in-cycle scene_bytes=%s\n' "$(stat -c %s "$RUN/scene.png" 2>/dev/null || echo 0)" > "$RUN/scene_audit.txt"
    k=$((k+1))
    continue
  fi
  # reference screencap + SCENE AUDIT. A stuck popup / wrong app makes the cold launch come up BEHIND it, so
  # the screenshot is the wrong screen (the ~82KB scene.png poison — e.g. the "Allow Scan to take pictures"
  # permission dialog from the doc-digitizer). Record the foreground app + screenshot size and flag SUSPECT
  # when the camera isn't foreground or the shot is tiny (a real preview is MBs; a popup/black is ~80KB).
  fg=$(adb shell dumpsys window 2>/dev/null | grep -m1 mCurrentFocus | tr -d '\r')
  adb shell screencap -p /sdcard/_sc.png 2>/dev/null; adb pull /sdcard/_sc.png "$RUN/scene.png" >/dev/null 2>&1; adb shell rm -f /sdcard/_sc.png
  ssz=$(stat -c %s "$RUN/scene.png" 2>/dev/null || echo 0)
  scene_ok=1; case "$fg" in *com.oplus.camera*) : ;; *) scene_ok=0 ;; esac; [ "$ssz" -lt 300000 ] && scene_ok=0
  printf 'scene_ok=%s foreground=%s scene_bytes=%s\n' "$scene_ok" "$fg" "$ssz" > "$RUN/scene_audit.txt"
  [ "$scene_ok" = 1 ] || echo "  !! SCENE SUSPECT run${k} (fg=$fg size=${ssz}B) — likely a stuck popup/wrong app; see scene_audit.txt"
  k=$((k+1))
done

# EXTRA_PROBES: provider-side ones were already co-attached above (see $DST/frida/*.log). App-side ones
# (EDR / motionphoto / getoplushwbuffer / preview_delivery) need the fresh app pid → app_probe_capture.sh.
for p in $EXTRA_PROBES; do
  case "$p" in
    trace_edr_invocation|trace_motionphoto|probe_getoplushwbuffer|trace_preview_delivery)
      echo "  (app-side probe '$p' -> run: tools/observability/campaign/app_probe_capture.sh $COND)" ;;
    *) [ -s "$FDIR/$p.log" ] && echo "  (probe '$p' co-attached -> $DST/frida/$p.log)" ;;
  esac
done

# metadata.json (condition fingerprint — makes the capture self-describing + diffable)
BUILD=$(adb shell 'getprop ro.build.version.oplusrom' | tr -d '\r')
ENF=$(adb shell getenforce | tr -d '\r')
cat > "$DST/metadata.json" <<EOF
{ "condition":"$COND", "mode":"$MODE", "session":"$SESSION", "ae_lock":$AE_LOCK,
  "selinux":"$ENF", "build_oplusrom":"$BUILD", "repeat_n":$REPEAT_N,
  "note":"$NOTE", "scope":"stock-only (LOS A/B deferred)" }
EOF

echo "== condition '$COND' captured -> $DST (run1..run$REPEAT_N) =="
if [ "${SKIP_PARSE:-0}" = 1 ]; then
  echo "   parse skipped (SKIP_PARSE=1)"
  exit 0
fi
"$HERE/parse_condition.py" "$DST" 2>/dev/null || echo "   next: tools/observability/campaign/parse_condition.py $DST"
