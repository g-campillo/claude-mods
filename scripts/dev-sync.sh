#!/usr/bin/env bash
# Copies mods into a session's hot-reload folder (the path the plugin-authoring skill prints,
# ~/.claude/dev-mods/<session-id>) so edits made here reload live in that session.
#   scripts/dev-sync.sh <dev-mods-dir> [mod...]
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dest="${1:?usage: scripts/dev-sync.sh <dev-mods-dir> [mod...]}"; shift
mods=("$@")
if [[ ${#mods[@]} -eq 0 ]]; then
  for dir in "$root"/plugins/*/; do mods+=("$(basename "$dir")"); done
fi
mkdir -p "$dest"
for mod in "${mods[@]}"; do
  rsync -a --delete --exclude '.claude-plugin/types/' --exclude 'tests/' "$root/plugins/$mod/" "$dest/$mod/"
  echo "synced $mod -> $dest/$mod"
done
