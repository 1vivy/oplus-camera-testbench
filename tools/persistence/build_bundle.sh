#!/usr/bin/env bash
# build_bundle.sh — assemble agent/<bundle>.js for the oplus_cam_probes module from bundle.manifest.
# _anchor.js is prepended raw (it installs globalThis.Anchor). Each probe is wrapped in its own IIFE so
# two probes can't collide on a top-level const/let (scope isolation). doc-50.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MOD="$HERE/oplus_cam_probes"
MANIFEST="$MOD/bundle.manifest"
ANCHOR="$REPO/tools/frida/_anchor.js"
OUT="$MOD/agent"
mkdir -p "$OUT"
[ -f "$MANIFEST" ] || { echo "no manifest: $MANIFEST"; exit 1; }
[ -f "$ANCHOR" ]   || { echo "no _anchor.js: $ANCHOR"; exit 1; }

built=0
while IFS= read -r line; do
  case "$line" in ''|\#*) continue;; esac
  bundle="${line%%:*}"; scripts="${line#*:}"
  bundle="$(echo "$bundle" | tr -d '[:space:]')"
  dst="$OUT/$bundle.js"
  {
    echo "// AUTO-BUILT by build_bundle.sh — bundle '$bundle'. Do not edit; edit bundle.manifest + sources."
    echo "// _anchor.js (OTA-resilient resolver; installs globalThis.Anchor):"
    cat "$ANCHOR"
    for s in $scripts; do
      src="$REPO/tools/$s"
      if [ ! -f "$src" ]; then echo "// MISSING $s"; echo "  !! missing $src (bundle $bundle)" >&2; continue; fi
      echo ""; echo "// ---- probe: $s (IIFE-isolated) ----"
      echo "(function(){ try {"
      cat "$src"
      echo ""; echo "} catch (e) { try { console.log('[bundle] probe $s threw: ' + e.message); } catch (_) {} } })();"
    done
  } > "$dst"
  echo "built $dst ($(grep -c . "$dst") lines) <- $scripts"
  built=$((built+1))
done < "$MANIFEST"
echo "done: $built bundle(s) in $OUT"
