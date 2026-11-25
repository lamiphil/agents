/**
 * /protect [session-id]      Add a session id to the protected list so the
 *                            weekly clean-up never moves it. Without an
 *                            argument, the current session is protected.
 *                            An argument may be a full UUID or any prefix
 *                            of an id already in the list.
 *
 * /protect list              Print the protected list.
 *
 * /unprotect [session-id]    Remove a session id from the list. Without an
 *                            argument, the current session is unprotected.
 *
 * The list lives at ~/.pi/agent/protected-sessions (one id per line, `#`
 * for comments). pi/agent/scripts/clean-sessions.sh reads it on every run.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PROTECTED_FILE = join(process.env.HOME ?? "", ".pi", "agent", "protected-sessions");
const HEADER =
	"# Pi session ids protected from the weekly clean-up.\n" +
	"# Managed by /protect and /unprotect. One UUID per line. `#` for comments.\n\n";

function readFileSafe(): string {
	try {
		return readFileSync(PROTECTED_FILE, "utf8");
	} catch {
		return "";
	}
}

function readList(): string[] {
	return readFileSafe()
		.split("\n")
		.map((line) => line.replace(/#.*/, "").trim())
		.filter((line) => line.length > 0);
}

function writeList(ids: string[]): void {
	mkdirSync(dirname(PROTECTED_FILE), { recursive: true });
	const existing = readFileSafe();
	const header = existing.match(/^(?:#[^\n]*\n|\n)+/)?.[0] ?? HEADER;
	const body = ids.length ? `${ids.join("\n")}\n` : "";
	writeFileSync(PROTECTED_FILE, header + body, "utf8");
}

function resolve(list: string[], arg: string): string | undefined {
	return list.find((id) => id === arg) ?? list.find((id) => id.startsWith(arg));
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("protect", {
		description: "Protect a Pi session from the weekly clean-up",
		handler: async (rawArgs, ctx) => {
			const arg = (rawArgs ?? "").trim();
			if (arg === "list") {
				const list = readList();
				ctx.ui.notify(
					list.length ? `Protected sessions:\n${list.join("\n")}` : "No protected sessions.",
					"info",
				);
				return;
			}
			const current = ctx.sessionManager.getSessionId();
			const id = arg || current;
			if (!id) {
				ctx.ui.notify("/protect: current session is not saved yet.", "error");
				return;
			}
			const list = readList();
			if (list.includes(id)) {
				ctx.ui.notify(`${id} is already protected.`, "info");
				return;
			}
			writeList([...list, id]);
			ctx.ui.notify(`Protected ${id}.`, "success");
		},
	});

	pi.registerCommand("unprotect", {
		description: "Remove a Pi session from the protected list",
		handler: async (rawArgs, ctx) => {
			const arg = (rawArgs ?? "").trim();
			const list = readList();
			const current = ctx.sessionManager.getSessionId();
			const match = arg
				? resolve(list, arg)
				: current && list.includes(current)
					? current
					: undefined;
			if (!match) {
				ctx.ui.notify(
					arg ? `No protected session matches "${arg}".` : "Current session is not protected.",
					"warning",
				);
				return;
			}
			writeList(list.filter((id) => id !== match));
			ctx.ui.notify(`Unprotected ${match}.`, "success");
		},
	});
}
