#!/usr/bin/env bash
# Agent installer. Places the agent setup where each tool expects it,
# reinstalls third-party skills and Pi packages, and reapplies Pi package
# patches. Safe to rerun, for example after a Pi upgrade: ./install.sh
set -euo pipefail

repo="$(cd "$(dirname "$0")" && pwd)"

need() { command -v "$1" >/dev/null || { echo "Missing: $1" >&2; exit 1; }; }
need stow

# 1. Links. One Stow package per tool, each with its own target.
#    pi uses --no-folding: ~/.pi/agent stays a real folder, so sessions,
#    credentials and npm packages never live in this repo.
place() {
  local pkg="$1" target="$2"; shift 2
  mkdir -p "$target"
  stow -d "$repo" -t "$target" -R "$@" "$pkg"
}
place pi       "$HOME/.pi" --no-folding
place skills   "$HOME/.agents/skills"
place claude   "$HOME/.claude"
place codex    "$HOME/.codex"
place opencode "$HOME/.config/opencode"
[ -e "$HOME/.claude/skills" ] || ln -s "$HOME/.agents/skills" "$HOME/.claude/skills"

# 2. Third-party skills, reinstalled from their sources when missing.
if command -v npx >/dev/null; then
  grep -vE '^[[:space:]]*(#|$)' "$repo/third-party-skills.txt" |
    while read -r source skill; do
      [ -e "$HOME/.agents/skills/$skill" ] && continue
      echo "Installing $skill from $source"
      npx -y skills add "$source" --skill "$skill" -g -y </dev/null ||
        echo "Failed: $skill" >&2
    done
else
  echo "Skipped third-party skills: npx not found" >&2
fi

# 3. Vooban skills are never published. Copy them by hand from another machine.
for skill in $(sed -n 's#^skills/\([^/]*\)/$#\1#p' "$repo/.gitignore"); do
  [ -e "$repo/skills/$skill" ] || echo "Not on this machine (copy by hand): skills/$skill"
done

# 4. Pi packages and patches. Pi installs the packages listed in
#    settings.json on its first start; rerun this script after that.
npm_dir="$HOME/.pi/agent/npm"
if [ -f "$npm_dir/package.json" ] && command -v npm >/dev/null; then
  (cd "$npm_dir" && npm install --legacy-peer-deps --no-fund --no-audit)
  for patch in "$repo"/pi/agent/packages/*/apply.sh; do
    echo "Patching $(basename "$(dirname "$patch")")"
    bash "$patch" || echo "Patch failed: $patch" >&2
  done
else
  echo "Pi packages not installed yet: start pi once, then rerun ./install.sh"
fi
