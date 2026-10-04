# claude-mods

Personal Claude Code mods: function-hook plugins that run inside Claude Code (terminal and the
desktop app's Code tab). The repo is a plugin marketplace, one folder per mod.

| Mod | What it does |
| --- | --- |
| [usage-meter](plugins/usage-meter) | 5-hour, weekly and Fable usage with reset times, plus prompt-cache expiry, beside the prompt |

## Layout

```
.claude-plugin/marketplace.json   lists every mod (for /plugin marketplace add)
plugins/<mod>/
  .claude-plugin/plugin.json      manifest: name, version, description, types, userConfig
  hooks/hooks.json                { "modules": ["./register.tsx"] }
  hooks/register.tsx              exports register(on, options)
  hooks/*.ts                      pure helpers the module imports
  types/index.d.ts                the mod's $.state contract
  tests/*.test.ts(x)              claude plugin test
  README.md
scripts/check.sh [mod...]         validate + test each mod, then type-check
scripts/dev-sync.sh <dir> [mod]   copy mods into a session's hot-reload folder
tsconfig.json                     types every mod against .claude/types (from /plugin-types)
```

## Using the mods

Load one or more mods into every desktop-app and CLI session by naming their folders in
`~/.claude/settings.json` (colon-separated, absolute paths). They hot-reload when saved:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/Users/gabriel.campillo/code/claude-mods/plugins/usage-meter" } }
```

Or for one terminal session:

```bash
claude --plugin-dir ./plugins/usage-meter
```

## Adding a mod

1. Copy the shape of an existing mod into `plugins/<new-mod>/`.
2. Add it to `.claude-plugin/marketplace.json` and the table above.
3. Run `scripts/check.sh <new-mod>`.
