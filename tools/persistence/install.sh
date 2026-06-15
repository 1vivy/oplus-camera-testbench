#!/usr/bin/env bash
# install.sh — build bundles + install the oplus_cam_probes KernelSU module to /data/adb/modules.
# /data-only module: no system/ tree, no mounts. Activates on next reboot. doc-50.
# Does NOT fetch or push frida-inject (external binary — must be added separately/with approval); the
# module is boot-safe and INERT without it.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
MOD="$HERE/oplus_cam_probes"
ID=oplus_cam_probes
DEST=/data/adb/modules/$ID
TMP=/data/local/tmp/$ID

adb get-state >/dev/null 2>&1 || { echo "no adb device"; exit 1; }

echo "== build bundles =="
"$HERE/build_bundle.sh" || { echo "bundle build failed"; exit 1; }

echo "== stage module to device ($TMP) =="
adb shell "rm -rf $TMP" 2>/dev/null
adb push "$MOD" "$TMP" >/dev/null
# normalize line endings + perms on device, then move into /data/adb/modules as root
adb shell "su -c '
  set -e
  # CRLF guard on the boot scripts (host editors)
  for s in service.sh post-fs-data.sh lib/mount_patches.sh; do
    [ -f $TMP/$s ] && sed -i \"s/\r\$//\" $TMP/$s 2>/dev/null || true
  done
  rm -rf $DEST
  mkdir -p $(dirname $DEST)
  cp -r $TMP $DEST
  chown -R 0:0 $DEST
  find $DEST -type d -exec chmod 0755 {} +
  find $DEST -type f -exec chmod 0644 {} +
  chmod 0755 $DEST/service.sh
  [ -f $DEST/post-fs-data.sh ] && chmod 0755 $DEST/post-fs-data.sh
  [ -f $DEST/lib/mount_patches.sh ] && chmod 0755 $DEST/lib/mount_patches.sh
  [ -f $DEST/bin/frida-inject ] && chmod 0755 $DEST/bin/frida-inject
  rm -rf $TMP
  echo INSTALLED $DEST
'"
echo "== installed module tree =="
adb shell "su -c 'ls -R $DEST | head -40; echo; if [ -x $DEST/bin/frida-inject ]; then echo \"frida-inject present: yes (LIVE on next boot)\"; else echo \"frida-inject present: NO — module inert until added\"; fi'"
echo
echo "Module installed. It activates on the NEXT REBOOT (KernelSU late_start service)."
echo "Without bin/frida-inject the module is INERT + boot-safe; check $DEST/injector.log after boot."
