#!/bin/bash
# Replicates the extract-files.py OppoGallery2 blob_fixup (manifest-only OEM-perm strip)
# directly on the committed proprietary apk, so `m OppoGallery2` re-signs the patched apk.
# Source-of-record = vendor/oplus/camera/extract-files.py (blob_fixup_oppogallery_unpack +
# blob_fixup_opluscamera_strip_oem_perms). This script just executes that fixup chain.
set -e
T=/srv/android/worktrees/lineage-infiniti
APKTOOL=$T/prebuilts/extract-tools/common/apktool/apktool.jar
JAVA=$T/prebuilts/jdk/jdk21/linux-x86/bin/java
APK=$T/vendor/oplus/camera/camera/proprietary/system_ext/priv-app/OppoGallery2/OppoGallery2.apk
WORK=/srv/android/v13_work/gallery_strip
TMP=$WORK/decoded
MANIFEST=$TMP/AndroidManifest.xml

mkdir -p "$WORK"
# one-time pristine backup of the build-input apk
[ -f "$WORK/OppoGallery2.orig.apk" ] || cp "$APK" "$WORK/OppoGallery2.orig.apk"

rm -rf "$TMP"
echo "[1/4] apktool d -s (skip smali) ..."
"$JAVA" -Xmx8g -jar "$APKTOOL" d -s "$WORK/OppoGallery2.orig.apk" -o "$TMP" -f

echo "[2/4] strip OEM permission gates from manifest ..."
MANIFEST_PATH="$MANIFEST" python3 - <<'PY'
import re, os, pathlib
m = pathlib.Path(os.environ["MANIFEST_PATH"])
data = m.read_text(encoding="utf-8")
fixed = re.sub(r'\s+android:permission="(?:oplus|oppo|com\.oplus|com\.oppo|com\.heytap)[^"]*"', '', data)
removed = data.count('android:permission=') - fixed.count('android:permission=')
print("  android:permission gates removed:", removed)
# success criterion = the camera-bound predecode service is no longer gated, and NO
# oem-namespaced (oppo/oplus/com.oppo/com.oplus/com.heytap) android:permission= ENFORCEMENT
# gates remain. OPPO_COMPONENT_SAFE may still appear in android:name= (uses-permission) — benign.
oem_gates_left = re.findall(r'android:permission="(?:oplus|oppo|com\.oplus|com\.oppo|com\.heytap)[^"]*"', fixed)
assert not oem_gates_left, "FAIL: oem enforcement gates remain: %r" % oem_gates_left
assert "OplusPreTileDecodeService" in fixed, "FAIL: predecode service vanished"
for line in fixed.splitlines():
    if "PreTileDecode" in line:
        assert "android:permission" not in line, "FAIL: predecode still gated: "+line
print("  predecode services OK (ungated); oem enforcement gates remaining:", len(oem_gates_left))
m.write_text(fixed, encoding="utf-8")
PY

echo "[3/4] apktool b (repack, unsigned) ..."
"$JAVA" -Xmx8g -jar "$APKTOOL" b "$TMP" -o "$APK"

echo "[4/4] done."
ls -la "$APK"
echo "GALLERY_STRIP_DONE_OK"
