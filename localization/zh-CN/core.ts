import { parse, parseExpression } from "@babel/parser";
import type { Node, StringLiteral, TemplateLiteral } from "@babel/types";
import { additionalDisplayRole, hasSettingsUi, isUiModule, nestedDisplayRole } from "./display-context";

export type PackageId = "agent" | "tui" | "utils";
export const packagePaths: Record<PackageId, string> = {
	agent: "packages/coding-agent",
	tui: "packages/tui",
	utils: "packages/utils",
};
export const npmPackages: Record<PackageId, string> = {
	agent: "@oh-my-pi/pi-coding-agent",
	tui: "@oh-my-pi/pi-tui",
	utils: "@oh-my-pi/pi-utils",
};
export interface Candidate {
	id: string;
	pkg: PackageId;
	file: string;
	line: number;
	role: string;
	source: string;
	text: string;
	tokens: string[];
	start: number;
	end: number;
	quote: string;
	raw: string;
	context: string;
	expressionRanges?: { start: number; end: number }[];
	expressions: string[];
}
export interface CatalogEntry {
	pkg: PackageId;
	file: string;
	role: string;
	source: string;
	text: string;
	translation: string;
	origin: "seed" | "model" | "human";
}
export type Catalog = Record<string, CatalogEntry>;
export interface SeedEntry { en: string; zh: string; }

const displayFields = new Set([
	"label", "description", "title", "hint", "message", "detail", "summary",
	"caption", "subtitle", "emptyMessage", "loadingText", "helpText", "header", "footer",
]);
const keepEnglish = new Set([
	"API", "LSP", "MCP", "JSON", "JSONL", "XML", "Git", "GitHub", "HTTP", "HTTPS", "OAuth",
	"ASCII", "Unicode", "UTF-8", "Powerline", "OpenAI", "Anthropic", "Gemini", "Codex", "Bun",
	"TypeScript", "JavaScript", "Python", "Windows", "macOS", "Linux", "Nerd Font", "Kitty", "WezTerm",
	"PR", "SmolLM", "N-gram", "Nerd", "Bash", "MongoDB", "Postgres", "SQLite", "Pi", "omp", "npx",
]);

export function inScope(pkg: PackageId, file: string): boolean {
	if (pkg === "tui" && file === "src/prompt/tips.txt") return true;
	if (!/\.tsx?$/.test(file) || /(?:\.d\.ts|\.test\.tsx?)$/.test(file)) return false;
	if (file.startsWith("src/") && /(?:^|\/)[^/]*settings\.ts$/.test(file)) return true;
	if (/(?:^|\/)(?:test|(?:[\w-]+-)?fixtures|prompts|export|protocol|rpc|acp)(?:\/|$)/.test(file)) return false;
	if (pkg === "utils") return file.startsWith("src/cli/") || file === "src/cli.ts";
	if (pkg === "tui") return isUiModule(pkg, file);
	return file.startsWith("src/");
}

function propertyName(node: Node | null | undefined): string | undefined {
	if (node?.type === "Identifier") return node.name;
	if (node?.type === "StringLiteral") return node.value;
	return undefined;
}

function displayReturnRole(ancestors: Node[], pkg: PackageId, file: string): string | undefined {
	const index = ancestors.findLastIndex(node => ["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration", "ObjectMethod", "ClassMethod"].includes(node.type));
	const fn = ancestors[index];
	const owner = ancestors[index - 1];
	if (pkg === "agent" && file.startsWith("src/slash-commands/")) {
		if (fn?.type === "ObjectMethod" && fn.kind === "get" && propertyName(fn.key) === "description") return "field:description";
		if (owner?.type === "ObjectProperty" && propertyName(owner.key) === "getTuiAutocompleteDescription") return "autocomplete:description";
	}
	if (pkg === "tui" && file === "src/prompt/welcome.ts" && fn?.type === "ClassMethod" && fn.kind === "get" && propertyName(fn.key) === "tip") return "welcome:tip";
	return undefined;
}

function roleOf(node: Node, ancestors: Node[], pkg: PackageId, file: string): string | undefined {
	// Transparent TS wrappers and conditional branches may surround a display value.
	let child = node;
	for (let index = ancestors.length - 1; index >= 0; index--) {
		const parent = ancestors[index];
		if (["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "ParenthesizedExpression"].includes(parent.type)) {
			child = parent;
			continue;
		}
		if (parent.type === "ConditionalExpression" && parent.test !== child) { child = parent; continue; }
		if (parent.type === "LogicalExpression" && parent.right === child) { child = parent; continue; }
		if ((parent.type === "ReturnStatement" && parent.argument === child) || (parent.type === "ArrowFunctionExpression" && parent.body === child)) {
			return displayReturnRole(parent.type === "ArrowFunctionExpression" ? ancestors.slice(0, index + 1) : ancestors.slice(0, index), pkg, file);
		}
		if (pkg === "tui" && file === "src/prompt/welcome.ts" && parent.type === "VariableDeclarator" && parent.init === child && ["label", "NEW_TAG_TEXT"].includes(propertyName(parent.id) ?? "")) return "welcome:label";
		if (parent.type === "ObjectProperty" && !parent.computed && parent.value === child) {
			const field = propertyName(parent.key);
			if (field && displayFields.has(field) && (isUiModule(pkg, file) || hasSettingsUi(ancestors))) return `field:${field}`;
			if (pkg === "tui" && file === "src/prompt/welcome.ts" && field === "text") return "welcome:label";
		}
		if (parent.type === "CallExpression" && parent.arguments.includes(child as StringLiteral)) {
			const position = parent.arguments.indexOf(child as StringLiteral);
			const callee = parent.callee;
			if (callee.type === "MemberExpression" && !callee.computed) {
				const method = propertyName(callee.property);
				const owner = callee.object.type === "Identifier" ? callee.object.name : "";
				if (owner === "console" && ["log", "warn", "error", "info"].includes(method ?? "")) return `console:${position}`;
				if (owner === "theme" && ((["fg", "bg"].includes(method ?? "") && position === 1) || (["bold", "italic", "dim", "strikethrough"].includes(method ?? "") && position === 0))) return `theme:${method}`;
				if (position === 0 && ["description", "summary", "setTitle", "setLabel", "setMessage", "notify", "showWarning", "showError"].includes(method ?? "")) return `call:${method}`;
			}
		}
		if (parent.type === "NewExpression" && parent.arguments[0] === child && parent.callee.type === "Identifier" && ["Text", "Loader", "CancellableLoader", "Markdown"].includes(parent.callee.name)) return `new:${parent.callee.name}`;
		return undefined;
	}
	return undefined;
}

const tokenPattern = /\[(?:NO-TERN|NEW)\]|\{(?:key|keys|tap|action):[^{}]+\}|`[^`\n]+`|https?:\/\/[^\s<>"')]+|\b(?:Ctrl|Alt|Shift|Cmd|Meta)(?:\+[A-Za-z0-9]+)+\b|[A-Za-z]:\\[^\s<>"']+|(?<![\w/])(?:~|\.{1,2})?\/[A-Za-z0-9_@.][A-Za-z0-9_@./*-]*|\b[\w.-]+\/[\w./@*-]+|\b[A-Z][A-Z0-9_]{2,}\b|--[a-z][a-z0-9-]*(?:=[^\s,;)]+)?|\b[a-z][\w-]*(?:\.[a-z][\w-]*)+\b|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|%(?:\d+\$)?[-+0 #]*\d*(?:\.\d+)?[sdifjoOc%]|\{\{[^{}]+\}\}|\r\n|[\n\r\t]/g;

function protectText(text: string, tokens: string[]): string {
	return text.replace(tokenPattern, value => {
		if (["Hide/show", "Start/stop", "issue/PR"].includes(value)) return value;
		const index = tokens.push(value) - 1;
		return `__OMP_TOKEN_${index}__`;
	});
}

function translationId(pkg: PackageId, file: string, role: string, source: string, tokens: string[]): string {
	const changedProtection = tokens.some(token => /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(token));
	const protectionVersion = /(?:Hide\/show|Start\/stop|issue\/PR)/.test(source) ? "display-slashes-v1" : changedProtection ? "protected-identifiers-v1" : undefined;
	return new Bun.CryptoHasher("sha256").update(JSON.stringify([pkg, file, role, source, ...(protectionVersion ? [protectionVersion] : [])])).digest("hex");
}

export function literalParts(node: StringLiteral | TemplateLiteral, code: string): { source: string; text: string; tokens: string[]; expressions: string[]; expressionRanges: { start: number; end: number }[] } {
	const tokens: string[] = [];
	const expressions: string[] = [];
	const expressionRanges: { start: number; end: number }[] = [];
	if (node.type === "StringLiteral") return { source: node.value, text: protectText(node.value, tokens), tokens, expressions, expressionRanges };
	let source = "";
	let text = "";
	for (let i = 0; i < node.quasis.length; i++) {
		const quasi = node.quasis[i];
		const value = quasi.value.cooked;
		if (value === null || value === undefined) throw new Error("Invalid template escape");
		source += value;
		text += protectText(value, tokens);
		if (i < node.expressions.length) {
			// Keep whitespace/comments inside ${...} byte for byte.
			const expression = code.slice((quasi.end ?? 0) + 2, (node.quasis[i + 1].start ?? 0) - 1);
			const original = `\u0024{${expression}}`;
			expressions.push(original);
			expressionRanges.push({ start: quasi.end ?? 0, end: node.quasis[i + 1].start ?? 0 });
			source += original;
			text += `__OMP_TOKEN_${tokens.push(original) - 1}__`;
		}
	}
	return { source, text, tokens, expressions, expressionRanges };
}

export function extractCandidates(code: string, pkg: PackageId, file: string): Candidate[] {
	if (!inScope(pkg, file)) return [];
	// Generated shell programs are executable source; their descriptions come from the command registry.
	if (pkg === "agent" && file === "src/cli/completion-gen.ts") return [];
	if (pkg === "tui" && file === "src/prompt/tips.txt") {
		return [...code.matchAll(/[^\r\n]+/g)].flatMap(match => {
			const source = match[0];
			if (!/[a-zA-Z]{2}/.test(source) || /[\u3400-\u9fff]/.test(source)) return [];
			if (/__OMP_TOKEN_\d+__/.test(source)) throw new Error(`Reserved placeholder found in ${pkg}:${file}`);
			const tokens: string[] = [];
			const start = match.index;
			const role = "welcome:tip";
			const text = protectText(source, tokens);
			return [{ id: translationId(pkg, file, role, source, tokens), pkg, file, role, source, text, tokens, expressions: [], start, end: start + source.length, raw: source, quote: "", line: code.slice(0, start).split("\n").length, context: source }];
		});
	}
	const tree = parse(code, { sourceType: "module", plugins: ["typescript", ...(file.endsWith(".tsx") ? ["jsx" as const] : [])] });
	const candidates: Candidate[] = [];
	const displayTemplates = new Set<Node>();
	const visit = (node: Node, ancestors: Node[]) => {
		if (node.type === "StringLiteral" || node.type === "TemplateLiteral") {
			const role = roleOf(node, ancestors, pkg, file) ?? additionalDisplayRole(node, ancestors, pkg, file) ?? nestedDisplayRole(node, ancestors, displayTemplates);
			if (role) {
				if (node.type === "TemplateLiteral") displayTemplates.add(node);
				const parts = literalParts(node, code);
				const visible = parts.text.replace(/__OMP_TOKEN_\d+__/g, "").trim();
				const technicalVariable = role === "display:variable" && /^[a-z0-9_.:/-]+$/.test(parts.source);
				const technicalPayload = /^[?&][a-z][\w.-]*=[^\s]*$/i.test(parts.source)
					|| (visible.includes("```") && !/[a-zA-Z]{2}/.test(visible.replace(/```[\s\S]*?```/g, "")));
				if ((/[a-zA-Z]{2}/.test(visible) || role === "display:plural") && !/[\u3400-\u9fff]/.test(visible) && !keepEnglish.has(parts.source.trim()) && !technicalVariable && !technicalPayload && !/^[~ *-]*[a-z][\w+.-]*:\/\//.test(parts.source)) {
					if (/__OMP_TOKEN_\d+__/.test(parts.source)) throw new Error(`Reserved placeholder found in ${pkg}:${file}`);
					const start = node.start ?? 0;
					const end = node.end ?? 0;
					const raw = code.slice(start + 1, end - 1);
					const id = translationId(pkg, file, role, parts.source, parts.tokens);
					const lineStart = code.lastIndexOf("\n", start) + 1;
					const lineEnd = code.indexOf("\n", end);
					candidates.push({ id, pkg, file, role, ...parts, start, end, raw, quote: code[start], line: node.loc?.start.line ?? 0, context: code.slice(lineStart, lineEnd === -1 ? code.length : lineEnd).slice(0, 1000) });
				}
			}
		}
		for (const value of Object.values(node)) {
			if (Array.isArray(value)) {
				for (const item of value) if (isNode(item)) visit(item, [...ancestors, node]);
			} else if (isNode(value)) visit(value, [...ancestors, node]);
		}
	};
	visit(tree.program, []);
	return candidates;
}

function isNode(value: unknown): value is Node {
	return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}

export function validateTranslation(candidate: Pick<Candidate, "text" | "tokens"> & { expressions?: string[]; role?: string }, translation: string): void {
	if (candidate.role === "display:plural" && candidate.text === "s" && candidate.tokens.length === 0 && translation === "") return;
	if (!translation.trim() || translation.includes("\u0000")) throw new Error("Empty or invalid translation");
	const expected = candidate.text.match(/__OMP_TOKEN_\d+__/g) ?? [];
	const actual = translation.match(/__OMP_TOKEN_\d+__/g) ?? [];
	if (JSON.stringify([...expected].sort()) !== JSON.stringify([...actual].sort())) throw new Error("Translation changed protected placeholders");
	const restore = (text: string) => text.replace(/__OMP_TOKEN_(\d+)__/g, (_all, index: string) => candidate.tokens[Number(index)]).trim();
	const original = restore(candidate.text);
	const restored = restore(translation);
	if (candidate.tokens.includes("[NO-TERN]") && original.startsWith("[NO-TERN]") !== restored.startsWith("[NO-TERN]")) throw new Error("Translation moved leading welcome marker");
	if (candidate.tokens.includes("[NEW]") && original.endsWith("[NEW]") !== restored.endsWith("[NEW]")) throw new Error("Translation moved trailing welcome marker");
	const expressions = new Set(candidate.expressions ?? []);
	const originalOrder = candidate.tokens.flatMap((token, index) => expressions.has(token) ? [index] : []);
	const translatedOrder = [...translation.matchAll(/__OMP_TOKEN_(\d+)__/g)].map(match => Number(match[1])).filter(index => expressions.has(candidate.tokens[index]));
	if (JSON.stringify(originalOrder) !== JSON.stringify(translatedOrder)) throw new Error("Translation changed template expression evaluation order");
	if (!/[\u3400-\u9fff]/.test(translation)) throw new Error("Translation contains no Chinese text");
	// Inline code can cross interpolations; unchanged source fragments remain permitted.
	const permitted = candidate.text.replace(/__OMP_TOKEN_\d+__/g, "").match(tokenPattern) ?? [];
	for (const token of translation.replace(/__OMP_TOKEN_\d+__/g, "").match(tokenPattern) ?? []) {
		const index = permitted.indexOf(token);
		if (index === -1) throw new Error("Translation introduced an unprotected command, key, or line break");
		permitted.splice(index, 1);
	}
}

export function renderLiteral(candidate: Candidate, translation: string, expressionOverrides = new Map<string, string>()): string {
	validateTranslation(candidate, translation);
	if (candidate.quote === "") return translation.replace(/__OMP_TOKEN_(\d+)__/g, (_all, index: string) => candidate.tokens[Number(index)]);
	if (candidate.quote !== "`") {
		const value = translation.replace(/__OMP_TOKEN_(\d+)__/g, (_all, index: string) => candidate.tokens[Number(index)]);
		return JSON.stringify(value);
	}
	const expressions = new Set(candidate.expressions);
	const escape = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");
	let raw = "";
	let offset = 0;
	for (const match of translation.matchAll(/__OMP_TOKEN_(\d+)__/g)) {
		raw += escape(translation.slice(offset, match.index));
		const token = candidate.tokens[Number(match[1])];
		raw += expressions.has(token) ? (expressionOverrides.get(token) ?? token) : escape(token);
		offset = (match.index ?? 0) + match[0].length;
	}
	raw += escape(translation.slice(offset));
	return `\`${raw}\``;
}

export function applyCatalog(code: string, candidates: Candidate[], catalog: Catalog, allowMissing = false): { code: string; applied: number } {
	let applied = 0;
	const transform = (start: number, end: number, scope: Candidate[]): string => {
		let result = code.slice(start, end);
		const roots = scope.filter(candidate => !scope.some(parent => parent !== candidate && parent.start <= candidate.start && parent.end >= candidate.end));
		for (const candidate of roots.sort((a, b) => b.start - a.start)) {
			const entry = catalog[candidate.id];
			const descendants = scope.filter(child => child !== candidate && child.start >= candidate.start && child.end <= candidate.end);
			let replacement: string;
			if (!entry) {
				if (!allowMissing) throw new Error(`Missing translation: ${candidate.id} (${candidate.pkg}:${candidate.file}:${candidate.line})`);
				replacement = transform(candidate.start, candidate.end, descendants);
			} else {
				if (entry.source !== candidate.source || entry.text !== candidate.text) throw new Error(`Stale translation: ${candidate.id}`);
				const overrides = new Map((candidate.expressionRanges ?? []).map(range => [code.slice(range.start, range.end), transform(range.start, range.end, descendants.filter(child => child.start >= range.start && child.end <= range.end))]));
				replacement = renderLiteral(candidate, entry.translation, overrides);
				applied++;
			}
			result = result.slice(0, candidate.start - start) + replacement + result.slice(candidate.end - start);
		}
		return result;
	};
	const result = transform(0, code.length, candidates);
	if (candidates.length && candidates[0].quote !== "") parse(result, { sourceType: "module", plugins: ["typescript", ...(candidates[0]?.file.endsWith(".tsx") ? ["jsx" as const] : [])] });
	return { code: result, applied };
}

export function fromSeed(candidate: Candidate, seeds: Map<string, string[]>): string | undefined {
	const variants = seeds.get(candidate.raw) ?? [];
	const accepted = new Set<string>();
	for (const raw of variants) {
		try {
			const translated = `${candidate.quote}${raw}${candidate.quote}`;
			const node = parseExpression(translated, { plugins: ["typescript"] });
			if (node.type !== "StringLiteral" && node.type !== "TemplateLiteral") continue;
			const parts = literalParts(node, translated);
			// Rebind tokens by original value; a donor must preserve every protected token.
			let valid = parts.tokens.length === candidate.tokens.length;
			const used = new Set<number>();
			const rebound = parts.text.replace(/__OMP_TOKEN_(\d+)__/g, (_match, index: string) => {
				const target = candidate.tokens.findIndex((token, i) => token === parts.tokens[Number(index)] && !used.has(i));
				if (target === -1) { valid = false; return "__INVALID__"; }
				used.add(target);
				return `__OMP_TOKEN_${target}__`;
			});
			if (!valid) continue;
			validateTranslation(candidate, rebound);
			accepted.add(rebound);
		} catch { /* An incompatible seed is left for the model. */ }
	}
	return accepted.size === 1 ? [...accepted][0] : undefined;
}

export function toEntry(candidate: Candidate, translation: string, origin: CatalogEntry["origin"]): CatalogEntry {
	validateTranslation(candidate, translation);
	return { pkg: candidate.pkg, file: candidate.file, role: candidate.role, source: candidate.source, text: candidate.text, translation, origin };
}
