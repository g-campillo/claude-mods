# claude-mods

A marketplace of Claude Code function-hook mods; see README.md for the layout.

- One mod per `plugins/<mod>/` folder, self-contained: manifest, `hooks/`, `types/`, `tests/`, README.
  Register every new mod in `.claude-plugin/marketplace.json` and the README table.
- Load the `plugin-authoring` skill before writing or debugging a mod; its `claude-code.d.ts` is the API reference.
- Helpers that take `$` must be top-level function declarations in the hooks module (the validator traces `$`);
  keep `$`-free logic in sibling `.ts` files so tests can import it.
- Run `scripts/check.sh <mod>` after every change: validate, `claude plugin test`, then `tsc`.
- Mods named in `CLAUDE_CODE_PLUGIN_DIRS` (`~/.claude/settings.json` `env`, colon-separated) load in every
  session and hot-reload from `plugins/` directly; add a new mod's folder there once it works.
  Currently listed: `usage-meter`. Don't `dev-sync` a listed mod (it would load twice under one name).
- To try an unlisted mod live in an authoring session, `scripts/dev-sync.sh <dev-mods dir>` copies it into the
  hot-reload folder the skill names; the source of truth stays in `plugins/`.
