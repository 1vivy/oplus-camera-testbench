#!/system/bin/sh
# oplus_cam_probes/service.sh — KernelSU late_start service. Boot-persistent OPT-IN frida injection.
# KSU-guideline notes:
#   - late_start service.sh is forked & non-blocking; safe to run a long poll loop here (NOT post-fs-data).
#   - This module mounts NOTHING (no system/ tree) -> structurally cannot hit the /vendor-overlay bootloop
#     class (KERNELSU-MOUNT-NOTES incident 2026-06-13). doc-50.
#   - FAIL-SAFE: every missing piece -> log + exit 0. The module must never block or crash boot.
MODDIR=${0%/*}
LOGDIR=/data/local/tmp/probe-logs
SYMDIR=/data/local/tmp/probe-symbols       # _anchor.js per-build symbol cache
SLOG=$MODDIR/injector.log
FI=$MODDIR/bin/frida-inject
CONF=$MODDIR/config/probes.conf
AGENT=$MODDIR/agent
STATE=$MODDIR/.state

mkdir -p "$LOGDIR" "$SYMDIR" "$STATE" 2>/dev/null
chmod 0777 "$LOGDIR" "$SYMDIR" 2>/dev/null
: > "$SLOG"
log(){ echo "$(date 2>/dev/null) $*" >> "$SLOG"; }

# wait for boot_completed (bounded), then settle so the camera/HAL/frida stack is up before any inject
i=0; while [ "$(getprop sys.boot_completed)" != 1 ] && [ "$i" -lt 120 ]; do sleep 2; i=$((i+1)); done
sleep 25
log "injector start (boot_completed=$(getprop sys.boot_completed), selinux=$(getenforce 2>/dev/null))"

if [ ! -x "$FI" ]; then
  log "frida-inject NOT present/executable at $FI — injection DISABLED. Module is INERT (boot-safe)."
  log "To enable: place an aarch64 frida-inject matching frida-server $(/data/adb/modules/magisk-frida/bin/frida-server --version 2>/dev/null) at $FI, chmod 0755, reboot."
  exit 0
fi
[ -f "$CONF" ] || { log "no probes.conf — nothing to inject"; exit 0; }

# inject <target_process> <bundle>: attach (kept resident so console.log streams to the log file).
# Per-pid dedupe via a state file so a fresh app pid (relaunch) is re-injected but a live one is not.
inject(){
  bundle="$AGENT/$2.js"
  [ -f "$bundle" ] || { log "missing bundle $bundle (target $1)"; return; }
  pid=$(pidof "$1" 2>/dev/null | awk '{print $1}')
  [ -z "$pid" ] && return
  last=$(cat "$STATE/$1" 2>/dev/null)
  [ "$pid" = "$last" ] && return
  log "inject $1 (pid $pid) <- $2.js"
  "$FI" -p "$pid" -s "$bundle" --runtime=v8 > "$LOGDIR/$1.log" 2>&1 &
  echo "$pid" > "$STATE/$1"
}

log "poll loop begin (config=$CONF)"
while true; do
  while read t b m; do
    case "$t" in ''|\#*) continue;; esac
    inject "$t" "$b"
  done < "$CONF"
  sleep 5
done
