# OVERLAY — reversible on-device tests (Tier 0)

How to put a change on the device for a fast A/B *without* a build, and revert cleanly. This is the
Tier-0 lane (see `WORKFLOW.md`). Device is on the Mac (adb, root).

## Which mechanism?

| You have… | Use | Persists reboot? | Revert |
|-----------|-----|------------------|--------|
| a source change you can rebuild | **module rebuild + flash** (`docs/BUILD-HOST.md`) | yes (in OTA) | reflash |
| a single file (XML/config/blob) to swap | **`adb remount` overlay** (below) | yes (overlayfs) | restore file / `adb enable-verity` + reboot |
| a running-symbol behavior to probe | **frida hook** (`tools/frida/*.js`, `tools/persistence/`) | only with persistence facet | detach |

Reach for the lightest one that answers the question. An `adb remount` overlay is the fastest way to
confirm a config fix registers.

## adb remount overlay recipe (worked example: the DV codec fix)

```
adb root && adb remount                                  # OverlayFS RW on /system,/vendor,/odm,... (works on LOS)
adb shell cp -f /vendor/etc/media_codecs_canoe_v2.xml /data/local/tmp/media_codecs_canoe_v2.xml.orig   # backup
adb push fixed_media_codecs_canoe_v2.xml /vendor/etc/media_codecs_canoe_v2.xml
adb shell am force-stop com.oplus.camera                 # consumer rebuilds its MediaCodecList on next open
```
Keep the patched file under `camera-bringup/overlays/<topic>/` (gitignored: `.gitignore:36`).

### Verify (no UI needed — registration, not a full recording)
```
adb shell getprop ro.media.xml_variant.codecs                                         # which variant loads
adb shell grep -c 'MediaCodec name="c2.qti.dv' /vendor/etc/media_codecs_canoe_v2.xml  # file side: 3
adb shell dumpsys android.hardware.media.c2.IComponentStore/default | grep -B1 video/dolby-vision  # component side
```
MediaCodecList = XML names ∩ codec2-store components — both present ⇒ registered. (A live recording is the
end-to-end confirmation but needs a human at the shutter; the input-actuation blocker stops synthetic taps.)

### Revert
```
adb shell cp -f /data/local/tmp/media_codecs_canoe_v2.xml.orig /vendor/etc/media_codecs_canoe_v2.xml
# or fully clear the overlay: adb disable-verity won't undo it — reflash / factory reset clears OverlayFS
```

## Guardrails (from AGENTS.md device constraints)
- **Reversible levers only**: file swaps under `adb remount`, `setprop`, verbosity overlays. **Never** write
  `persist.*` props or real partitions. The overlay is OverlayFS, not a partition write — restore the file
  content to revert.
- KernelSU `su -c` drops lines after the first → device scripts stay single-block.
- Read the real `/odm` via cameraserver's mount namespace: `ls /proc/<cameraserver-pid>/root/odm/`.
- An overlay is a **test/stopgap**, not the fix of record — promote the real change through the build
  (`docs/SYNC.md` Tier 2) and ledger it.

See also `KERNELSU-MOUNT-NOTES.md` (Hybrid Mount Lite dev-loop) and `tools/persistence/README.md` (hooks/patches facets).
