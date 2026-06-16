#!/bin/bash
# Gallery fix #2: inject RECEIVER_NOT_EXPORTED into ActionReceiver.a() registerReceiver call.
# Android-14 requires RECEIVER_EXPORTED/NOT_EXPORTED on dynamic receivers; the gallery passes
# flags=0 -> SecurityException -> "Photos keeps stopping" (intercepts camera input). This is the
# smali half of the disabled patches-gallery/0003, re-anchored to the 300 apk's classes11.dex.
# Single-dex baksmali/smali surgery (no full apktool b) so only classes11 is reassembled.
set -e
T=/srv/android/worktrees/lineage-infiniti
JAVA=$T/prebuilts/jdk/jdk21/linux-x86/bin/java
SMALI=$T/prebuilts/extract-tools/common/smali/smali.jar
BAK=$T/prebuilts/extract-tools/common/smali/baksmali.jar
APK=$T/vendor/oplus/camera/camera/proprietary/system_ext/priv-app/OppoGallery2/OppoGallery2.apk
W=/srv/android/v13_work/garcv
AR=$W/smali11/com/oplus/gallery/foundation/uikit/broadcast/bus/ActionReceiver.smali

# one-time backup of the manifest-stripped apk (pre-AR-fix)
[ -f "$W/OppoGallery2.beforeAR.apk" ] || cp "$APK" "$W/OppoGallery2.beforeAR.apk"

# fresh baksmali of classes11 from the current apk (idempotent / re-derivable)
cd "$W"
unzip -o -q "$APK" classes11.dex -d "$W/_dexsrc"
rm -rf "$W/smali11"
"$JAVA" -jar "$BAK" d "$W/_dexsrc/classes11.dex" -o "$W/smali11"

echo "[1/3] patch ActionReceiver.smali"
AR_PATH="$AR" python3 - <<'PY'
import os, pathlib
p = pathlib.Path(os.environ["AR_PATH"])
s = p.read_text()
invoke = ("    invoke-virtual/range {v2 .. v7}, Landroid/content/Context;->registerReceiver("
          "Landroid/content/BroadcastReceiver;Landroid/content/IntentFilter;Ljava/lang/String;"
          "Landroid/os/Handler;I)Landroid/content/Intent;")
patch = ("    # PATCH: force RECEIVER_NOT_EXPORTED (0x4) if neither export flag (0x6) set\n"
         "    and-int/lit8 v0, v7, 0x6\n"
         "    if-nez v0, :cond_rcv_not_exported_skip\n"
         "    or-int/lit8 v7, v7, 0x4\n"
         "    :cond_rcv_not_exported_skip\n")
assert invoke in s, "FAIL: registerReceiver invoke not found"
if "cond_rcv_not_exported_skip" in s:
    print("  already patched"); raise SystemExit(0)
s = s.replace(invoke, patch + invoke, 1)
p.write_text(s)
print("  patched ActionReceiver.a()")
PY

echo "[2/3] reassemble classes11.dex"
"$JAVA" -jar "$SMALI" a "$W/smali11" -o "$W/classes11.dex"
ls -la "$W/classes11.dex"

echo "[3/3] swap classes11.dex into apk"
cd "$W"
zip -X "$APK" classes11.dex
echo "GAR_DONE_OK"
