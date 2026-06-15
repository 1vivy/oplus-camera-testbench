#!/system/bin/sh
# oplus_cam_probes/lib/mount_patches.sh — the binary-patch OVERLAY facet engine.
# Systemless replacement of EXISTING vendor/odm blobs via context-preserving BIND mounts, applied early
# (post-fs-data, before the camera HAL dlopen()s them). doc-50.
#
# HARD RULES (KERNELSU-MOUNT-NOTES incident 2026-06-13 — a naked /vendor overlay bootlooped):
#   1. REPLACE-EXISTING-ONLY. Bind only over a target that already exists as a regular file. Never create
#      a NEW path in a system partition (that is what bootlooped). This makes a per-file bind a "replace
#      existing /vendor/lib64 file" (allowed, OP13-OCVM does it) — NOT a "/vendor overlay" (forbidden).
#   2. PRESERVE SELINUX CONTEXT. Label the replacement with the TARGET's original context before binding,
#      or the HAL domain can't dlopen it (OP13-OCVM sets explicit contexts).
#   3. NEVER touch /mnt/vendor/persist.
#   4. DISABLE-GATED + bootloop-aware. A sentinel disables all mounts without needing module removal.
#   5. INERT by default: empty patches/manifest => no mounts.
#
# manifest format (patches/manifest), one per line:
#   <target_abs_path>  <source_rel_under_patches>  [selinux_context|auto]
# e.g.  /vendor/lib64/libAlgoProcess.so  vendor/lib64/libAlgoProcess.so  auto

PLOG=/data/local/tmp/probe-logs/patches.log
plog(){ echo "$(date 2>/dev/null) $*" >> "$PLOG"; }

# read a target's current SELinux context (toybox ls -Z), or empty
_ctx_of(){ ls -Zd "$1" 2>/dev/null | awk '{print $1}'; }

mount_patches_main(){
  MODDIR="$1"
  MAN="$MODDIR/patches/manifest"
  mkdir -p /data/local/tmp/probe-logs 2>/dev/null
  : > "$PLOG"
  plog "patch-overlay facet start (selinux=$(getenforce 2>/dev/null))"

  # rule 4 — global disable sentinels (module-local or world-writable tmp for emergency)
  if [ -f "$MODDIR/disable_patches" ] || [ -f /data/local/tmp/oplus_cam_probes.no_patches ]; then
    plog "DISABLED by sentinel — no patches mounted"; return 0
  fi
  [ -f "$MAN" ] || { plog "no manifest — inert (no patches)"; return 0; }

  n=0; ok=0
  while read target source ctx; do
    case "$target" in ''|\#*) continue;; esac
    n=$((n+1))
    src="$MODDIR/patches/$source"

    # rule 3 — never touch persist
    case "$target" in /mnt/vendor/persist*|*/persist/*) plog "REFUSE persist path: $target"; continue;; esac
    # source must exist
    [ -f "$src" ] || { plog "SKIP $target: source missing ($src)"; continue; }
    # rule 1 — replace-existing-only: target must already be a regular file
    [ -f "$target" ] || { plog "SKIP $target: target does not exist (replace-existing-only; refusing to create new path)"; continue; }
    # sanity: ELF-for-ELF (don't bind a text blob over a .so)
    if [ "${target%.so}" != "$target" ]; then
      head -c4 "$src" 2>/dev/null | grep -q "ELF" || { plog "SKIP $target: source not an ELF"; continue; }
    fi

    # rule 2 — context: capture target's, apply to source
    want="$ctx"; [ -z "$want" ] || [ "$want" = auto ] && want="$(_ctx_of "$target")"
    if [ -n "$want" ]; then chcon "$want" "$src" 2>/dev/null || plog "WARN chcon $want $src failed"; fi
    chmod 0644 "$src" 2>/dev/null

    if mount -o bind "$src" "$target" 2>>"$PLOG"; then
      now="$(_ctx_of "$target")"
      plog "BOUND $target <- patches/$source  ctx=$now"
      ok=$((ok+1))
    else
      plog "FAIL bind $target <- patches/$source (left original in place)"
    fi
  done < "$MAN"
  plog "patch-overlay done: $ok/$n bound"
}
