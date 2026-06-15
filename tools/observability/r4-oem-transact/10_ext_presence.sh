#!/system/bin/sh
# r4-oem-transact/10_ext_presence.sh — DEVICE probe (read-only, reversible): is the OnePlus OEM
# cameraserver layer present/loaded? Single-block (KernelSU drops post-first `su -c` lines).
# The decisive cheap A/B: libcsextimpl mapped in cameraserver (OOS) vs absent (LOS). doc-48 / G5.
# Output: /data/local/tmp/obs_r4_presence.txt  (pull + diff OOS vs LOS).
{
  OUT=/data/local/tmp/obs_r4_presence.txt
  echo "== r4 ext-presence $(date) =="
  echo "-- build / enforce --"
  getprop ro.build.version.oplusrom
  getprop ro.lineage.build.version
  getenforce

  echo "-- cameraserver pid + libcsextimpl mapped? (THE A/B tell) --"
  CSPID=$(pidof cameraserver)
  echo "cameraserver pid=$CSPID"
  if [ -n "$CSPID" ]; then
    if grep -q 'libcsextimpl' /proc/$CSPID/maps 2>/dev/null; then
      echo "RESULT: libcsextimpl MAPPED in cameraserver  (OEM layer present — expect OOS)"
      grep 'libcsextimpl' /proc/$CSPID/maps 2>/dev/null | head -1
    else
      echo "RESULT: libcsextimpl ABSENT in cameraserver  (stock AOSP cameraserver — expect LOS)"
    fi
  fi

  echo "-- OEM cmd-channel + display HALs registered? --"
  lshal 2>/dev/null | grep -iE 'sendextcamcmd|displaycolorfeature|displaypanelfeature' || echo "(none registered)"

  echo "-- media.camera service present? --"
  service check media.camera 2>/dev/null
  dumpsys -l 2>/dev/null | grep -i 'media.camera' || true

  echo "-- com.oplus.camera: does the app proc see the SDK proxy target? --"
  APID=$(pidof com.oplus.camera)
  echo "com.oplus.camera pid=$APID"

  echo "== done =="
} 2>&1 | tee /data/local/tmp/obs_r4_presence.txt
