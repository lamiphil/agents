# Agents repo

Philippe's agent setup: own skills, the global instructions and the config of
Pi, Claude Code, Codex and OpenCode. Host tools (shell, editor, terminal) live in
the dotfiles repo, including host settings that only launch agents. Terms are in
`GLOSSARY.md`; the split is explained in dotfiles `docs/adr/0001-*`.

This file is the repo guide. It is never deployed to `$HOME`. The global
instructions are `pi/agent/AGENTS.md`.

## Layout

Each top folder is a GNU Stow package with its own target. `./install.sh`
places them all and is safe to rerun.

| Package | Target | Notes |
|---------|--------|-------|
| `pi/` | `~/.pi` | `--no-folding`: one link per file. Sessions, credentials and npm packages stay in real folders outside the repo. |
| `skills/` | `~/.agents/skills` | One link per skill. |
| `claude/` | `~/.claude` | `CLAUDE.md` points to the global instructions. |
| `codex/` | `~/.codex` | `AGENTS.md` points to the global instructions. |
| `opencode/` | `~/.config/opencode` | |

`~/.agents/skills` also holds what this repo does not publish:

- Vooban skills: in `skills/` but gitignored. Copy them by hand to a new machine.
- Third-party skills: installed from `third-party-skills.txt`, never committed.
- `synced/` (Claude.ai skills) and tool-provided links.

## Rules

- Public repo: no customer names, people, non-public IDs or paths, secrets.
  Grep before every commit. Vooban-only skills go in `.gitignore`.
- A new file under a package needs `./install.sh` (or `stow -R`) to get its link.
- Pi package patches: `pi/agent/packages/<pkg>/apply.sh`. Reinstalls and Pi
  upgrades wipe them; rerun `./install.sh`. Adapt needles when upstream changes.
- Extensions load on `/reload`; `node --check` cannot parse `import type`.
- Commands for the user use Fish syntax.

## Commits

Format: `<type>(<scope>): <description>`. Type is one of `feat`, `fix`,
`chore`, `refactor`. Scope is the tool or skill (`pi`, `skills`, `claude`,
`todo`, ...). Imperative, lowercase first letter, no trailing period.

## Log

- **Target**: `_log.md` at the root of this repository.
- **Language**: English.
- **Visibility**: public.
