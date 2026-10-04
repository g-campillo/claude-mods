#!/usr/bin/env bash
# Prints the path of a `claude` CLI: $CLAUDE_BIN, the one on PATH, or the newest the desktop app installed.
set -euo pipefail
if [[ -n "${CLAUDE_BIN:-}" ]]; then echo "$CLAUDE_BIN"; exit 0; fi
if command -v claude >/dev/null 2>&1; then command -v claude; exit 0; fi
newest=$(ls -td "$HOME/Library/Application Support/Claude/claude-code"/*/*/claude.app/Contents/MacOS/claude 2>/dev/null | head -1 || true)
if [[ -n "$newest" ]]; then echo "$newest"; exit 0; fi
echo "claude CLI not found; set CLAUDE_BIN" >&2
exit 1
