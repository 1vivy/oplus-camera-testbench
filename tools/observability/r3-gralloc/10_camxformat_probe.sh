#!/system/bin/sh
# r3-gralloc/10_camxformat_probe.sh
# THE DECISIVE, FRIDA-FREE PROBE for the doc-42 §2.5 namespace mechanism.
# Is the vendor camera plane-layout authority (libcamxexternalformatutils.so) reachable from the
# com.oplus.camera app process? If NOT mapped there + the "Failed to link CamxFormatUtil" fallback fires,
# the namespace mechanism is proven and the fix is a public.libraries/ld.config exposure (ffb638b class).
# READ-ONLY. Single-block (KernelSU). Run DURING/AFTER a P010 capture with verbosity enabled
# (../enable/00_enable_all.sh lifts the logd throttle so the fallback string persists in the ring).
# Run: su -c 'sh /data/local/tmp/obs-r3/10_camxformat_probe.sh'
OUT=/data/local/tmp/obs_r3_camxformat.txt
PKG=com.oplus.camera
TAG=$(getprop ro.build.version.oplusrom 2>/dev/null)$(getprop ro.lineage.build.version 2>/dev/null)
: > "$OUT"
echo "== r3 CamxFormatUtil reachability probe  tag=$TAG  enforce=$(getenforce 2>/dev/null) ==" >>"$OUT"

# (1) GROUND TRUTH: is libcamxexternalformatutils mapped in the camera app process?
APPPIDS=$(pgrep -f "$PKG")
if [ -z "$APPPIDS" ]; then echo "  $PKG not running — launch the camera + take a P010 capture first" >>"$OUT"; fi
for P in $APPPIDS; do
  echo "-- app pid $P : gralloc/mapper/camxformat libs mapped --" >>"$OUT"
  grep -oE '/[^ ]*(camxexternalformat|camximageformat|libgrallocutils|libgralloccore|mapper\.qti|libgralloc\.qti)[^ ]*\.so' /proc/$P/maps 2>/dev/null | sort -u >>"$OUT"
  if grep -qE 'camxexternalformat' /proc/$P/maps 2>/dev/null; then
    echo "  => libcamxexternalformatutils IS mapped in $PKG ($P)  ->  authority REACHABLE in-app (mechanism likely REFUTED -> look at alloc-input alt-ii)" >>"$OUT"
  else
    echo "  => libcamxexternalformatutils NOT mapped in $PKG ($P)  ->  authority UNREACHABLE in app namespace (mechanism SUPPORTED)" >>"$OUT"
  fi
done

# (2) the fallback log signature in the current ring
echo "-- logcat ring: CamxFormatUtil link fallback --" >>"$OUT"
logcat -d -b all 2>/dev/null | grep -iE 'Failed to link CamxFormatUtil|Unable to get IS_UBWC from snap|getCameraFormatPlaneInfo' | tail -40 >>"$OUT"
FC=$(logcat -d -b all 2>/dev/null | grep -icE 'Failed to link CamxFormatUtil')
echo "  fallback-fire-count (Failed to link CamxFormatUtil): $FC  [>0 = mechanism firing]" >>"$OUT"

# (3) POSITIVE CONTROL: the vendor allocator/cameraserver process SHOULD map it (it does the allocation)
echo "-- positive control: vendor alloc/cameraserver process should HAVE camxexternalformat --" >>"$OUT"
for P in $(pgrep -f 'allocator-service|cameraserver|camera.provider' 2>/dev/null); do
  CMD=$(cat /proc/$P/cmdline 2>/dev/null | tr '\0' ' ')
  if grep -qE 'camxexternalformat' /proc/$P/maps 2>/dev/null; then echo "  [ctrl OK] pid $P ($CMD) HAS camxexternalformat (expected)" >>"$OUT";
  else echo "  [ctrl] pid $P ($CMD) lacks camxexternalformat" >>"$OUT"; fi
done

# (4) confirm the lib + config are actually on the device (rule out missing-file)
echo "-- file presence (rule out missing-file vs namespace) --" >>"$OUT"
PROV=$(pgrep -f camera.provider | head -1)
[ -n "$PROV" ] && ls -l /proc/$PROV/root/vendor/lib64/libcamxexternalformatutils.so /proc/$PROV/root/vendor/etc/display/camera_alignments.json 2>>"$OUT" >>"$OUT"
echo DONE >>"$OUT"; echo "WROTE $OUT"
