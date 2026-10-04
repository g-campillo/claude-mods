#!/usr/bin/env bash
# Validates and tests every mod (or the ones named), then type-checks the repo.
#   scripts/check.sh               # all mods
#   scripts/check.sh usage-meter   # one mod
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
claude="$("$root/scripts/claude-bin.sh")"
mods=("$@")
if [[ ${#mods[@]} -eq 0 ]]; then
  for dir in "$root"/plugins/*/; do mods+=("$(basename "$dir")"); done
fi
for mod in "${mods[@]}"; do
  echo "== $mod"
  "$claude" plugin validate "$root/plugins/$mod"
  if compgen -G "$root/plugins/$mod/tests/*.test.ts*" >/dev/null; then
    "$claude" plugin test "$root/plugins/$mod"
  fi
done
echo "== tsc"
if [[ ! -f "$root/.claude/types/claude-code.d.ts" ]]; then
  echo "missing .claude/types/claude-code.d.ts: run /plugin-types in a Claude Code session here" >&2
  exit 1
fi
npx -y -p typescript@5.9 tsc -p "$root/tsconfig.json"
echo "all checks passed"
