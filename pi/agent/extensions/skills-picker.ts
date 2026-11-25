/**
 * /skills                    Open a picker to enable or disable skills for this
 *                            session. A small default set is always on;
 *                            everything else is off until you pick it.
 *
 * /skills list               Print the currently enabled skills.
 * /skills defaults           Reset the selection to the tracked defaults.
 * /skills all | /skills none Enable or disable every skill at once.
 *
 * The selection persists in the session file through pi.appendEntry, so /resume
 * restores it. Hiding a skill only removes it from the auto-discovery prompt;
 * /skill:name keeps working for the skills you hide.
 *
 * Defaults live in ~/.pi/agent/skill-picker.json (tracked in the agents repo):
 *
 *     { "defaults": ["commit", "todo", "log", "@core", ...] }
 *
 * Entries starting with "@" are category names resolved against
 * ~/.agents/skill-categories (the same file simonayotte/skillswitch uses).
 *
 * /task forks inherit the master's selection through the forked transcript.
 * pi-tidy-subagents run in a fresh pi process and always start from defaults.
 */

import type { ExtensionAPI, ExtensionContext, Skill } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULTS_FILE = join(homedir(), ".pi", "agent", "skill-picker.json");
const CATEGORIES_FILE = join(homedir(), ".agents", "skill-categories");
const ENTRY_TYPE = "skill-picker";

interface PickerEntry {
	enabled: string[];
}

interface Category {
	name: string;
	patterns: string[];
}

/* ---------- config loading ---------- */

function readDefaults(): string[] {
	if (!existsSync(DEFAULTS_FILE)) {
		return ["commit", "log", "todo", "find-skills", "agent-review"];
	}
	try {
		const raw = JSON.parse(readFileSync(DEFAULTS_FILE, "utf8")) as { defaults?: unknown };
		return Array.isArray(raw.defaults) ? raw.defaults.filter((v): v is string => typeof v === "string") : [];
	} catch {
		return [];
	}
}

function readCategories(): Category[] {
	if (!existsSync(CATEGORIES_FILE)) return [];
	const out: Category[] = [];
	for (const line of readFileSync(CATEGORIES_FILE, "utf8").split("\n")) {
		const match = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
		if (!match) continue;
		const patterns = match[2].trim().split(/\s+/).filter(Boolean);
		if (patterns.length) out.push({ name: match[1], patterns });
	}
	return out;
}

function globToRegex(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
	return new RegExp(`^${escaped}$`);
}

function categoryMembers(cat: Category, allNames: string[]): string[] {
	const regexes = cat.patterns.map(globToRegex);
	return allNames.filter((name) => regexes.some((r) => r.test(name)));
}

function categoriesOf(skillName: string, cats: Category[], allNames: string[]): string[] {
	return cats.filter((c) => categoryMembers(c, allNames).includes(skillName)).map((c) => c.name);
}

function expandDefaults(defaults: string[], cats: Category[], allNames: string[]): Set<string> {
	const out = new Set<string>();
	for (const entry of defaults) {
		if (entry.startsWith("@")) {
			const cat = cats.find((c) => c.name === entry.slice(1));
			if (cat) for (const n of categoryMembers(cat, allNames)) out.add(n);
		} else {
			out.add(entry);
		}
	}
	return out;
}

/* ---------- extension ---------- */

export default function (pi: ExtensionAPI) {
	const enabled = new Set<string>();
	let defaultsApplied = false;

	function readLatestEntry(ctx: ExtensionContext): string[] | undefined {
		let last: string[] | undefined;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "custom" && entry.customType === ENTRY_TYPE) {
				const data = entry.data as PickerEntry | undefined;
				if (Array.isArray(data?.enabled)) last = data.enabled;
			}
		}
		return last;
	}

	function applyDefaults(allNames: string[]): void {
		const expanded = expandDefaults(readDefaults(), readCategories(), allNames);
		enabled.clear();
		for (const n of expanded) if (allNames.includes(n)) enabled.add(n);
		defaultsApplied = true;
	}

	function restoreFromBranch(ctx: ExtensionContext): void {
		const saved = readLatestEntry(ctx);
		if (saved) {
			enabled.clear();
			for (const n of saved) enabled.add(n);
			defaultsApplied = true;
		} else {
			defaultsApplied = false; // let before_agent_start apply defaults with real names
			enabled.clear();
		}
	}

	function persist(): void {
		pi.appendEntry<PickerEntry>(ENTRY_TYPE, { enabled: [...enabled] });
	}

	pi.on("session_start", async (_e, ctx) => restoreFromBranch(ctx));
	pi.on("session_tree", async (_e, ctx) => restoreFromBranch(ctx));

	pi.on("before_agent_start", async (event, _ctx) => {
		const skills = event.systemPromptOptions.skills ?? [];
		const allNames = skills.map((s) => s.name);

		if (!defaultsApplied && enabled.size === 0) applyDefaults(allNames);

		// Keep object identity so Pi's section diff stays minimal.
		const before = skills.length;
		event.systemPromptOptions.skills = skills.filter((s) => enabled.has(s.name));
		if (process.env.SKILL_PICKER_DEBUG) {
			process.stderr.write(`[skill-picker] ${event.systemPromptOptions.skills.length}/${before} enabled=${[...enabled].sort().join(",")}\n`);
		}
	});

	/* ---------- /skills command ---------- */

	pi.registerCommand("skills", {
		description: "Enable or disable skills for this session",
		getArgumentCompletions: (prefix) => {
			const items = ["list", "defaults", "all", "none"].filter((s) => s.startsWith(prefix));
			return items.length ? items.map((v) => ({ value: v, label: v })) : null;
		},
		handler: async (rawArgs, ctx) => {
			const arg = (rawArgs ?? "").trim();
			const base = ctx.getSystemPromptOptions();
			const allSkills = (base.skills ?? []) as Skill[];
			const allNames = allSkills.map((s) => s.name);

			if (arg === "list") {
				const list = [...enabled].sort().join(", ") || "(none)";
				ctx.ui.notify(`Enabled: ${list}`, "info");
				return;
			}
			if (arg === "defaults") {
				applyDefaults(allNames);
				persist();
				ctx.ui.notify(`Reset to defaults (${enabled.size}/${allNames.length} enabled).`, "success");
				return;
			}
			if (arg === "all") {
				enabled.clear();
				for (const n of allNames) enabled.add(n);
				defaultsApplied = true;
				persist();
				ctx.ui.notify(`All ${enabled.size} skills enabled.`, "success");
				return;
			}
			if (arg === "none") {
				enabled.clear();
				defaultsApplied = true;
				persist();
				ctx.ui.notify("All skills disabled.", "success");
				return;
			}
			if (arg.length > 0) {
				ctx.ui.notify(`Unknown argument: ${arg}`, "error");
				return;
			}

			if (ctx.mode !== "tui") {
				ctx.ui.notify("/skills needs TUI mode. Use /skills list|defaults|all|none.", "error");
				return;
			}

			await openPicker(pi, ctx, allSkills, enabled, persist);
		},
	});
}

/* ---------- picker UI ---------- */

async function openPicker(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	allSkills: Skill[],
	enabled: Set<string>,
	persist: () => void,
): Promise<void> {
	const allNames = allSkills.map((s) => s.name);
	const cats = readCategories();
	const skillCats = new Map<string, string[]>();
	for (const s of allSkills) skillCats.set(s.name, categoriesOf(s.name, cats, allNames));

	// Row model: either a category header (toggles all members) or a leaf skill row.
	type CategoryRow = { kind: "cat"; cat: Category; members: string[] };
	type SkillRow = { kind: "skill"; skill: Skill; indent: boolean };
	type Row = CategoryRow | SkillRow;

	function buildRows(filter: string): Row[] {
		const normalized = filter.trim().toLowerCase();
		const match = (s: Skill) =>
			!normalized ||
			s.name.toLowerCase().includes(normalized) ||
			s.description.toLowerCase().includes(normalized);

		const rows: Row[] = [];
		const seen = new Set<string>();
		for (const c of cats) {
			const members = categoryMembers(c, allNames)
				.map((n) => allSkills.find((s) => s.name === n))
				.filter((s): s is Skill => !!s && match(s));
			if (members.length === 0) continue;
			rows.push({ kind: "cat", cat: c, members: members.map((m) => m.name) });
			for (const s of members) {
				rows.push({ kind: "skill", skill: s, indent: true });
				seen.add(s.name);
			}
		}
		for (const s of allSkills) {
			if (seen.has(s.name) || !match(s)) continue;
			rows.push({ kind: "skill", skill: s, indent: false });
		}
		return rows;
	}

	await ctx.ui.custom<void>((tui, theme, _kb, done) => {
		let filter = "";
		let cursor = 0;
		let rows = buildRows(filter);

		function refresh() {
			rows = buildRows(filter);
			if (cursor >= rows.length) cursor = Math.max(0, rows.length - 1);
			tui.requestRender();
		}

		function dot(state: "on" | "off" | "mixed"): string {
			const color = state === "on" ? "success" : state === "off" ? "error" : "warning";
			return theme.fg(color, "●");
		}

		function toggleRow(row: Row) {
			if (row.kind === "cat") {
				const allOn = row.members.every((n) => enabled.has(n));
				for (const n of row.members) {
					if (allOn) enabled.delete(n);
					else enabled.add(n);
				}
			} else {
				if (enabled.has(row.skill.name)) enabled.delete(row.skill.name);
				else enabled.add(row.skill.name);
			}
			persist();
		}

		function handleInput(data: string) {
			if (matchesKey(data, Key.escape) || data === "q") return done(undefined);
			if (matchesKey(data, Key.enter)) return done(undefined);
			if (matchesKey(data, Key.up) || data === "k") {
				cursor = Math.max(0, cursor - 1);
				return tui.requestRender();
			}
			if (matchesKey(data, Key.down) || data === "j") {
				cursor = Math.min(rows.length - 1, cursor + 1);
				return tui.requestRender();
			}
			if (data === "h" || data === "\x1b[5~" /* PgUp */) {
				cursor = Math.max(0, cursor - 10);
				return tui.requestRender();
			}
			if (data === "l" || data === "\x1b[6~" /* PgDn */) {
				cursor = Math.min(rows.length - 1, cursor + 10);
				return tui.requestRender();
			}
			if (data === " ") {
				if (rows[cursor]) toggleRow(rows[cursor]);
				return tui.requestRender();
			}
			if (data === "\x7f" || data === "\b") {
				filter = filter.slice(0, -1);
				cursor = 0;
				return refresh();
			}
			if (data.length === 1 && data >= " " && data !== "\x7f") {
				filter += data;
				cursor = 0;
				return refresh();
			}
		}

		function categoryState(members: string[]): "on" | "off" | "mixed" {
			const on = members.filter((n) => enabled.has(n)).length;
			if (on === 0) return "off";
			if (on === members.length) return "on";
			return "mixed";
		}

		function render(width: number): string[] {
			const w = Math.max(20, width);
			const lines: string[] = [];
			lines.push(theme.fg("accent", "─".repeat(w)));
			const title = theme.bold(theme.fg("accent", " Skills "));
			const count = theme.fg("muted", ` ${enabled.size}/${allSkills.length} on`);
			lines.push(title + count);
			lines.push(
				theme.fg("dim", " j/k move · h/l page · space toggle · type to filter · enter/esc close"),
			);
			lines.push(
				` ${theme.fg("muted", "filter:")} ${filter.length ? filter : theme.fg("dim", "(none)")}`,
			);
			lines.push("");

			if (rows.length === 0) {
				lines.push(theme.fg("warning", " (no matches)"));
				return lines;
			}

			// Viewport: show up to ~18 rows centred on the cursor.
			const viewport = 18;
			const start = Math.max(0, Math.min(rows.length - viewport, cursor - Math.floor(viewport / 2)));
			const end = Math.min(rows.length, start + viewport);

			for (let i = start; i < end; i++) {
				const row = rows[i];
				const selected = i === cursor;
				const marker = selected ? theme.fg("accent", "> ") : "  ";

				if (row.kind === "cat") {
					const state = categoryState(row.members);
					const on = row.members.filter((n) => enabled.has(n)).length;
					const label = theme.bold(
						selected ? theme.fg("accent", row.cat.name) : theme.fg("text", row.cat.name),
					);
					const tally = theme.fg("muted", ` ${on}/${row.members.length}`);
					lines.push(`${marker}${dot(state)} ${label}${tally}`);
				} else {
					const state = enabled.has(row.skill.name) ? "on" : "off";
					const indent = row.indent ? theme.fg("dim", "  · ") : "";
					const name = selected
						? theme.fg("accent", row.skill.name)
						: theme.fg("text", row.skill.name);
					const desc = row.skill.description.split("\n")[0];
					const descCol = theme.fg("dim", ` — ${desc}`);
					const raw = `${marker}${indent}${dot(state)} ${name}${descCol}`;
					const wrapped = wrapTextWithAnsi(raw, w);
					lines.push(wrapped[0] ?? raw);
				}
			}
			if (end < rows.length) {
				lines.push(theme.fg("dim", `  … ${rows.length - end} more below`));
			}
			return lines;
		}

		return {
			capturesViewportInput: true,
			render,
			handleInput,
			invalidate() {},
		};
	});
}
