/**
 * repo-context: load a repo's AGENTS.md / CLAUDE.md the first time the agent touches it.
 *
 * Pi only loads context files from the session cwd and its parents. Sessions start in
 * a workspace root (for example ~/workspaces/work), so files in its nested repos never load.
 * Like Claude Code's nested CLAUDE.md, this loads them on demand:
 *
 * - Any tool call whose input names a path (path field, absolute/~ paths in any string,
 *   `cd <dir>` / `-C <dir>` in commands) collects the context files in every folder between
 *   that path and the session cwd (or $HOME), skipping files Pi already loaded natively.
 * - Read-only tools: the new files are appended to the tool result.
 * - Mutating tools (edit, write, bash, codemode, code_rewrite): the call is blocked once and
 *   the files are returned as the reason, so the rules are in context before anything changes.
 * - Each file is wrapped in <repo_instructions scope="<dir>"> and applies only under <dir>.
 * - The loaded set resets on compaction and session switches, so files load again when needed.
 */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const HOME = homedir();
const NAMES = ["AGENTS.override.md", "AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];
const MUTATING = new Set(["edit", "write", "bash", "codemode", "code_rewrite"]);
const MAX_CHARS = 40_000;
const PATH_RE = /(?:~|\/Users\/[^/\s]+)\/[^\s'"`;|&()<>,{}[\]\\]+/g;
const CD_RE = /(?:^|[;&|(\n]\s*)cd\s+(['"]?)([^\s'";&|)]+)\1|\s-C\s+(['"]?)([^\s'";&|)]+)\3/g;

const RULE = `Some tool results or blocked calls carry <repo_instructions scope="DIR"> blocks: the AGENTS.md / CLAUDE.md of a repo or folder you touched.
- Follow a block only for work on files under its scope DIR (the deepest matching scope wins on conflicts).
- Never apply one repo's instructions to another repo or to files outside its scope.
- When you work in several repos, keep each repo's rules separate.`;

const real = (p: string) => {
	try {
		return realpathSync(p);
	} catch {
		return resolve(p);
	}
};

const within = (child: string, parent: string) => child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);

export default function (pi: ExtensionAPI) {
	let loaded = new Set<string>(); // realpaths injected in this context
	let native = new Set<string>(); // realpaths Pi loaded itself
	const pendingResult = new Map<string, string>(); // toolCallId -> text to append
	const dirCache = new Map<string, string | null>();

	const reset = () => {
		loaded = new Set();
		pendingResult.clear();
	};
	pi.on("session_start", async () => reset());
	pi.on("session_compact", async () => reset());

	pi.on("before_agent_start", async (event) => {
		native = new Set((event.systemPromptOptions.contextFiles ?? []).map((f) => real(f.path)));
		event.systemPromptOptions.sections.repo_context_rule = RULE;
	});

	function contextFileIn(dir: string): string | null {
		if (dirCache.has(dir)) return dirCache.get(dir)!;
		const hit = NAMES.map((n) => join(dir, n)).find((f) => existsSync(f)) ?? null;
		dirCache.set(dir, hit);
		return hit;
	}

	function pathsOf(input: unknown, cwd: string): string[] {
		const out = new Set<string>();
		const add = (p: string) => {
			const s = p.replace(/^~(?=\/|$)/, HOME).replace(/[.:]+$/, "");
			out.add(isAbsolute(s) ? s : resolve(cwd, s));
		};
		const visit = (v: unknown, key?: string) => {
			if (typeof v === "string") {
				if (key === "path" || key === "file" || key === "cwd") add(v);
				for (const m of v.matchAll(PATH_RE)) add(m[0]);
				for (const m of v.matchAll(CD_RE)) add(m[2] ?? m[4]);
			} else if (Array.isArray(v)) v.forEach((x) => visit(x));
			else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) visit(x, k);
		};
		visit(input);
		return [...out];
	}

	/** Context files between the path and the cwd (or $HOME), outermost first, not yet in context. */
	function newFilesFor(target: string, cwd: string): string[] {
		if (!within(target, HOME)) return [];
		let dir = target;
		while (!existsSync(dir) && dir !== dirname(dir)) dir = dirname(dir);
		try {
			if (!statSync(dir).isDirectory()) dir = dirname(dir);
		} catch {
			return [];
		}
		const rcwd = real(cwd);
		const found: string[] = [];
		for (let d = real(dir); within(d, HOME) && d !== HOME && !within(rcwd, d); d = dirname(d)) {
			const f = contextFileIn(d);
			if (f) found.unshift(f);
		}
		return found.filter((f) => {
			const r = real(f);
			return !native.has(r) && !loaded.has(r);
		});
	}

	function render(files: string[]): string {
		return files
			.map((f) => {
				let body = readFileSync(f, "utf8");
				if (body.length > MAX_CHARS) body = `${body.slice(0, MAX_CHARS)}\n[… truncated; read ${f} for the rest]`;
				const scope = dirname(f);
				return `<repo_instructions scope="${scope}" file="${f}">\nApplies only to work on files under ${scope}. Do not apply it anywhere else.\n\n${body.trim()}\n</repo_instructions>`;
			})
			.join("\n\n");
	}

	pi.on("tool_call", async (event, ctx) => {
		const files = [...new Set(pathsOf(event.input, ctx.cwd).flatMap((p) => newFilesFor(p, ctx.cwd)))];
		if (!files.length) return;
		for (const f of files) loaded.add(real(f));
		const text = render(files);
		if (MUTATING.has(event.toolName.toLowerCase())) {
			return {
				block: true,
				reason: `Not run yet: this call touches a folder with its own instructions, loaded below. Check the call against them, then retry it (or adjust it).\n\n${text}`,
			};
		}
		pendingResult.set(event.toolCallId, text);
	});

	pi.on("tool_result", async (event) => {
		const text = pendingResult.get(event.toolCallId);
		if (!text) return;
		pendingResult.delete(event.toolCallId);
		return { content: [...event.content, { type: "text", text: `\n\n${text}` }] };
	});
}
