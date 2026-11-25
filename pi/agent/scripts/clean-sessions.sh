#!/usr/bin/env bash
# Move Pi session files inactive for at least N days (default 7) to the
# user's Trash so they stay recoverable.
#
# Skips sessions whose UUID is in ~/.pi/agent/protected-sessions, master
# sessions of open /task entries (~/.local/state/pi/tasks/*/meta.json with
# "closed": null), and the newest session file in the working directory of
# each running pi process (macOS blocks reading another process's env
# without root, so we approximate with cwd + newest mtime).
#
# Options:
#   -n, --dry-run     List what would be moved and exit without changes.
#   -d, --days N      Threshold in days (default 7).
#   -h, --help        Help.
#
# Invoked weekly by the LaunchAgent com.lamiphil.pi-clean-sessions installed
# by pi/agent/scripts/apply.sh.
set -euo pipefail

PI_HOME="${PI_HOME:-$HOME/.pi/agent}"
SESSIONS_DIR="$PI_HOME/sessions"
PROTECTED_FILE="$PI_HOME/protected-sessions"
TASKS_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/pi/tasks"

DAYS=7
DRY_RUN=0

usage() { sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--dry-run) DRY_RUN=1 ;;
    -d|--days)    DAYS="${2:?}"; shift ;;
    -h|--help)    usage; exit 0 ;;
    *)            echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if [[ ! -d "$SESSIONS_DIR" ]]; then
  echo "No sessions directory at $SESSIONS_DIR" >&2
  exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

: > "$tmp/protected"

# ── Collect protected session ids ────────────────────────────────────────────

# 1. User list (one id per line, `#` comments allowed).
if [[ -f "$PROTECTED_FILE" ]]; then
  sed 's/#.*//' "$PROTECTED_FILE" | awk 'NF {print $1}' >> "$tmp/protected"
fi

# 2. Masters of open /task entries.
if [[ -d "$TASKS_DIR" ]]; then
  for meta in "$TASKS_DIR"/*/meta.json; do
    [[ -f "$meta" ]] || continue
    awk '
      /"closed":[[:space:]]*null/        { open = 1 }
      /"closed":/ && !/"closed":[[:space:]]*null/ { closed = 1 }
      match($0, /"master":[[:space:]]*"[^"]+"/) {
        s = substr($0, RSTART, RLENGTH)
        sub(/^.*"/, "", s); sub(/"$/, "", s)
        master = s
      }
      END { if (master && !closed) print master }
    ' "$meta" >> "$tmp/protected" || true
  done
fi

# 3. For each running pi process, protect the newest session file in its cwd.
pids="$(pgrep -x pi 2>/dev/null || true)"
for pid in $pids; do
  cwd="$(lsof -a -d cwd -p "$pid" -Fn 2>/dev/null \
    | awk '/^n/ { sub(/^n/, ""); print; exit }')"
  [[ -n "$cwd" ]] || continue
  enc="$(printf '%s' "$cwd" | sed 's|/|-|g')"
  enc="--${enc#-}--"
  dir="$SESSIONS_DIR/$enc"
  [[ -d "$dir" ]] || continue
  newest="$(ls -t "$dir"/*.jsonl 2>/dev/null | head -1)"
  [[ -n "$newest" ]] || continue
  base="$(basename "$newest")"
  id="${base#*_}"; id="${id%.jsonl}"
  printf '%s\n' "$id" >> "$tmp/protected"
done

sort -u -o "$tmp/protected" "$tmp/protected"

# ── Classify inactive sessions ───────────────────────────────────────────────
find "$SESSIONS_DIR" -type f -name '*.jsonl' -mtime +"$DAYS" > "$tmp/candidates" || true

: > "$tmp/to-move"
: > "$tmp/kept"
while IFS= read -r file; do
  [[ -n "$file" ]] || continue
  base="$(basename "$file")"
  id="${base#*_}"; id="${id%.jsonl}"
  if grep -qxF "$id" "$tmp/protected"; then
    printf '%s\n' "$file" >> "$tmp/kept"
  else
    printf '%s\n' "$file" >> "$tmp/to-move"
  fi
done < "$tmp/candidates"

count_prot=$(wc -l < "$tmp/protected" | tr -d ' ')
count_move=$(wc -l < "$tmp/to-move"   | tr -d ' ')
count_kept=$(wc -l < "$tmp/kept"      | tr -d ' ')

printf 'Pi sessions clean-up (older than %s days)\n' "$DAYS"
printf '  protected ids: %s\n  inactive but protected: %s\n  to move: %s\n' \
  "$count_prot" "$count_kept" "$count_move"

if (( DRY_RUN )); then
  if (( count_kept > 0 )); then
    echo
    echo 'Protected (would skip):'
    sed 's|^|  |' "$tmp/kept"
  fi
  if (( count_move > 0 )); then
    echo
    echo 'Would move:'
    sed 's|^|  |' "$tmp/to-move"
  fi
  exit 0
fi

if (( count_move == 0 )); then
  echo 'Nothing to move.'
  exit 0
fi

dest="$HOME/.Trash/pi-sessions-$(date +%F)"
mkdir -p "$dest"

while IFS= read -r file; do
  [[ -n "$file" ]] || continue
  rel="${file#"$SESSIONS_DIR"/}"
  target="$dest/$rel"
  mkdir -p "$(dirname "$target")"
  mv "$file" "$target"
done < "$tmp/to-move"

# Prune encoded-cwd folders left empty by the move.
find "$SESSIONS_DIR" -mindepth 1 -type d -empty -delete || true

printf 'Moved %s file(s) to %s\n' "$count_move" "$dest"
