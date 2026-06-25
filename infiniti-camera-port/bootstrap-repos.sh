#!/usr/bin/env bash
# bootstrap-repos.sh — initialise the Mac edit-site: clone the 11 lineage-23.2-cam-final
# forks named in local_manifests/infiniti-camera.xml into ./repos/<path>.
#
# The Mac is the canonical EDIT + PUSH site (git creds live here; the builder only repo-syncs
# from 1vivy). ./repos/ is gitignored (.gitignore: /infiniti-camera-port/repos/) — the manifest
# snippet IS the source of truth for what to clone, so this script parses it rather than
# hardcoding the list.
#
# Usage:
#   ./bootstrap-repos.sh                 # clone all projects in the manifest (skip existing)
#   ./bootstrap-repos.sh <path> [...]    # clone only the given repo path(s), e.g. device/oneplus/sm8850-common
#
# LFS: skipped by default (GIT_LFS_SKIP_SMUDGE=1) so blob repos clone light. Editing source/
# configs (the edit-site's job) doesn't need the LFS payloads; fetch them on the builder at
# build time. Set OPLUS_LFS=1 to smudge LFS on clone.
set -uo pipefail

cd "$(dirname "$0")"
MANIFEST="local_manifests/infiniti-camera.xml"
FETCH_BASE="https://github.com/1vivy"
BRANCH="lineage-23.2-cam-final"     # remote default revision for the 'vivy' remote
[ -f "$MANIFEST" ] || { echo "bootstrap: $MANIFEST not found (run from infiniti-camera-port/)"; exit 1; }
[ "${OPLUS_LFS:-0}" = 1 ] || export GIT_LFS_SKIP_SMUDGE=1

# parse <project path="..." name="..."> from the manifest (one per line).
# macOS ships bash 3.2 (no `mapfile`); use a read loop + array append (3.1+).
PROJECTS=()
while IFS= read -r __line; do
  [ -n "$__line" ] && PROJECTS+=("$__line")
done < <(grep -oE '<project [^>]*>' "$MANIFEST" \
  | sed -nE 's/.*path="([^"]+)".*name="([^"]+)".*/\1 \2/p')

want=("$@")   # optional path filter
clone_one() {
  local path="$1" name="$2"
  if [ ${#want[@]} -gt 0 ] && ! printf '%s\n' "${want[@]}" | grep -qx "$path"; then return; fi
  if [ -d "repos/$path/.git" ]; then echo "skip (exists)  $path"; return; fi
  echo "clone          $path  <-  $FETCH_BASE/$name @ $BRANCH"
  mkdir -p "repos/$(dirname "$path")"
  git clone --branch "$BRANCH" --single-branch "$FETCH_BASE/$name" "repos/$path" \
    && git -C "repos/$path" rev-parse --short HEAD | sed 's/^/  HEAD /'
}

rc=0
for p in "${PROJECTS[@]}"; do clone_one $p || rc=1; done
echo "bootstrap done (rc=$rc). edit-site = $(pwd)/repos"
exit $rc
