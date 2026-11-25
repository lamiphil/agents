---
name: agent-review
description: Find every `agent:` mark in the code, apply the instruction, and remove the mark. Use when the user writes `agent:` or `#agent` comments and asks to run agent review, apply agent marks, process agent comments, or any similar phrase.
---

# Agent Review

The user writes short instructions as comments in the code (**agent marks**).
You find every mark, read the code around it, apply the instruction, and
remove the mark. One pass, with a summary at the end.

This is for solo, agent-driven edits. For human review notes written in a
diff viewer, use `hunk-review`. For read-only reviews, use `code-review`.

## Mark shape

An agent mark sits inside a native comment and starts with the token
`agent:` (case-insensitive). `#agent` without a colon is accepted only when
the comment prefix is `#`.

| Language | Example |
|---|---|
| Python, shell, YAML, TOML, Ruby | `# agent: fix the name of this variable` |
| C, Go, Rust, TS, JS, Zig | `// agent: extract this into a helper` |
| Lua, Haskell, SQL | `-- agent: add a guard for nil` |
| HTML, XML | `<!-- agent: use semantic tags here -->` |
| CSS, block C-style | `/* agent: simplify this selector */` |

Multi-line instructions continue on consecutive comment lines with the same
prefix, until the first non-comment or non-`agent:` line.

`agent?` is the reply shape. You rewrite a mark to `agent?` when the mark is
a question you answered, or when you could not apply the instruction. The
user handles `agent?` lines by hand; they also block commits.

## Procedure

1. **Find every mark.** From the repo root:
   ```fish
   rg -n --hidden --glob '!.git' --pcre2 \
     '(?:^|\s)(?:#|//|--|;|/\*|<!--)\s*#?\s*(?i:agent)[:?]\s'
   ```
   Respect `.gitignore` (default). If the user gave a path argument, scope
   the search to it. No matches → reply `No agent marks found.` and stop.

2. **Group multi-line marks.** Consecutive comment lines in the same file,
   with the same comment prefix, starting at an `agent:` line, belong to one
   mark. Record the mark's file, line range, instruction text, and the
   comment prefix.

3. **Read context.** For each mark, read the enclosing treesitter node
   (function, class, block) plus the file's top (imports, types). Fall back
   to the whole file for files under ~500 lines or when no treesitter parser
   is available. Do not read whole large files unless you must.

4. **Classify each mark.**
   - **Edit** — a change to make ("fix the name", "extract into a helper").
   - **Question** — an answer to produce ("why is this `any`?", "is this
     correct?"). Ends with `?` or starts with "why", "what", "is", "should",
     "can".

5. **Apply in one pass.**
   - **Edit** that you can make with confidence → make it, then delete the
     mark lines.
   - **Edit** you cannot make (missing info, ambiguous, risky) → rewrite the
     mark to `<prefix> agent? <one-line reason>`, keep the rest.
   - **Question** → answer it in the final summary, and rewrite the mark to
     `<prefix> agent? <one-line answer>` so the user can keep or delete it.

6. **Report a summary.** One line per mark, in this shape:
   ```
   ✓ path:line  <what you did>
   ? path:line  <reason or answer>  → agent?
   ```
   End with the count: `N applied, M left as agent?`. Nothing else.

## House rules

1. **One pass per run.** Do not loop. If the user wants another pass after
   reviewing the result, they run the skill again.
2. **Do not commit.** The `commit` skill refuses to commit while any
   `agent:` or `agent?` line remains in the staged diff.
3. **Do not touch other comments.** Only `agent:` and `agent?` lines are
   yours. Leave `TODO`, `FIXME`, `NOTE`, etc. alone.
4. **Preserve surrounding code shape.** Keep indentation, blank lines and
   the file's existing comment prefix exactly.
5. **One mark = one edit tool call** when possible. Group only when two
   marks sit on adjacent lines and share one change.
6. **Never widen scope.** The instruction decides the change. Do not add
   "while I'm here" cleanups.

## Example

Before:
```python
# agent: rename to something short
user_authentication_token_expiry_timestamp = time.time() + 3600
```

After:
```python
token_expiry = time.time() + 3600
```

Summary line: `✓ auth.py:12  renamed user_authentication_token_expiry_timestamp → token_expiry`.
