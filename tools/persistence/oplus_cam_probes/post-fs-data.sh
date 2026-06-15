#!/system/bin/sh
# oplus_cam_probes/post-fs-data.sh — EARLY facet (runs before the camera HAL loads its blobs).
# Overlays validated binary patches via context-preserving BIND mounts. INERT unless patches/manifest
# lists entries. Bounded + fail-open: never blocks boot. The injector (hooks facet) is separate in
# service.sh (late_start). doc-50.
MODDIR=${0%/*}
[ -f "$MODDIR/lib/mount_patches.sh" ] || exit 0
. "$MODDIR/lib/mount_patches.sh"
mount_patches_main "$MODDIR" 2>/dev/null
exit 0
