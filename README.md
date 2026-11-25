# agents

My AI agent setup: skills, global instructions, and config for
Pi, Claude Code, Codex and OpenCode.
Host tools (shell, editor, terminal) live in
[lamiphil/dotfiles](https://github.com/lamiphil/dotfiles), whose bootstrap
clones this repo and runs its installer.

```fish
git clone https://github.com/lamiphil/agents ~/workspaces/perso/repos/agents
~/workspaces/perso/repos/agents/install.sh
```

`install.sh` links each folder into place with GNU Stow, reinstalls the
third-party skills listed in `third-party-skills.txt`, and reapplies the Pi
package patches. Rerun it after a Pi upgrade.

| Folder | Linked to |
|--------|-----------|
| `pi/` | `~/.pi` (one link per file) |
| `skills/` | `~/.agents/skills` (one link per skill) |
| `claude/` | `~/.claude` |
| `codex/` | `~/.codex` |
| `opencode/` | `~/.config/opencode` |

`pi/agent/AGENTS.md` holds the global instructions; Claude Code and Codex
link to it.
