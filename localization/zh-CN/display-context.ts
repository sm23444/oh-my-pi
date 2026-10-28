import type { Node } from "@babel/types";
import type { PackageId } from "./core";

function name(node: Node | null | undefined): string {
	return node?.type === "Identifier" ? node.name : node?.type === "StringLiteral" ? node.value : "";
}

export function isUiModule(pkg: PackageId, file: string): boolean {
	if (pkg === "tui") return /^(?:src\/(?:overlays|setup|prompt|apps|components|chat|chrome|status-line|tools|render)\/|src\/(?:autocomplete|app-keybindings|keybindings|thinking|hotkeys-markdown|settings|editor|loader|tui)\.)/.test(file);
	if (pkg === "utils") return /^src\/cli(?:\/|\.)/.test(file);
	return /^(?:src\/(?:cli|commands|modes|slash-commands)\/|src\/config\/)/.test(file);
}

export function hasSettingsUi(ancestors: Node[]): boolean {
	return ancestors.some(node => node.type === "ObjectProperty" && !node.computed && name(node.key) === "ui");
}

function functionName(fn: Node, owner?: Node): string {
	if (fn.type === "FunctionDeclaration" || fn.type === "FunctionExpression") return name(fn.id);
	if (fn.type === "ClassMethod" || fn.type === "ClassPrivateMethod" || fn.type === "ObjectMethod") return name(fn.key);
	if (owner?.type === "VariableDeclarator") return name(owner.id);
	if (owner?.type === "ObjectProperty") return name(owner.key);
	return "";
}

function displayFunction(ancestors: Node[], pkg: PackageId, file: string): boolean {
	const index = ancestors.findLastIndex(node => ["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration", "ObjectMethod", "ClassMethod", "ClassPrivateMethod"].includes(node.type));
	const fn = ancestors[index];
	if (!fn || !isUiModule(pkg, file)) return false;
	const identifier = functionName(fn, ancestors[index - 1]);
	// These helpers return operator-facing text. Parsers, identifiers, persisted
	// sentinels, and generic command handlers are deliberately not return sinks.
	if (file === "src/chat/messages.ts") return identifier === "resolveAbortLabel";
	return /^(?:format|describe|render|build).*(?:Label|Message|Status|Summary|Report|Help|Usage|Text|Description|Title|Hint|Notice|Tooltip)$/.test(identifier)
		|| /^(?:thoughtLabel|runFastCommand|runSlowCommand|applyExtendedContextCommand|applyComputerUseToggle)$/.test(identifier)
		|| (pkg === "tui" && /^(?:render|describe)(?:[A-Z]|$)/.test(identifier));
}

export function additionalDisplayRole(node: Node, ancestors: Node[], pkg: PackageId, file: string): string | undefined {
	const ui = isUiModule(pkg, file);
	let child = node;
	for (let index = ancestors.length - 1; index >= 0; index--) {
		const parent = ancestors[index];
		if (["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "ParenthesizedExpression"].includes(parent.type)
			|| (parent.type === "ConditionalExpression" && parent.test !== child)
			|| (parent.type === "LogicalExpression" && parent.right === child)
			|| (parent.type === "BinaryExpression" && parent.operator === "+")
			|| (parent.type === "ArrayExpression" && parent.elements.some(element => element === child))) {
			child = parent;
			continue;
		}
		if (parent.type === "MemberExpression" && parent.object === child && !parent.computed && ["join", "trim", "trimEnd", "trimStart"].includes(name(parent.property))) {
			child = parent;
			continue;
		}
		if (parent.type === "CallExpression" && parent.callee === child && child.type === "MemberExpression") {
			child = parent;
			continue;
		}
		if (parent.type === "ObjectProperty" && parent.value === child && !parent.computed) {
			const field = name(parent.key);
			if (ui && ["text", "tooltip", "emptyText", "errorText", "warning", "explanation", "noMatchText", "statusText"].includes(field)) return `field:${field}`;
			if (pkg === "tui" && file === "src/hotkeys-markdown.ts" && field === "action") return "hotkey:action";
		}
		if (parent.type === "ReturnStatement" && parent.argument === child) {
			return displayFunction(ancestors.slice(0, index), pkg, file) ? "display:return" : undefined;
		}
		if (parent.type === "ArrowFunctionExpression" && parent.body === child) {
			return displayFunction(ancestors.slice(0, index + 1), pkg, file) ? "display:return" : undefined;
		}
		if (parent.type === "VariableDeclarator" && parent.init === child && ui && file !== "src/chat/messages.ts") {
			const variable = name(parent.id);
			if (/^(?:label|title|message|description|hint|header|footer|emptyText|errorText|statusText)$/.test(variable)
				|| /(?:^|_)(?:USAGE|LABEL|TITLE|MESSAGE|HINT|HELP|DESCRIPTION)$/.test(variable)) return "display:variable";
		}
		if (parent.type === "CallExpression" && parent.arguments.some(argument => argument === child)) {
			const position = parent.arguments.findIndex(argument => argument === child);
			const callee = parent.callee;
			if (callee.type === "MemberExpression" && !callee.computed) {
				const method = name(callee.property);
				const owner = name(callee.object);
				if (position === 0 && ["showStatus", "showInfo", "showWarning", "showError", "showSuccess"].includes(method)) return `call:${method}`;
				if (position === 0 && method === "output" && owner === "runtime" && file.startsWith("src/slash-commands/")) return "call:output";
				if (ui && method === "push" && /^(?:lines|rows|parts|sections|messages)$/.test(owner)) return "display:line";
			}
			if (ui && callee.type === "Identifier") {
				const method = callee.name;
				if (pkg === "tui" && position === 0 && ["text", "span", "plainText", "styledSpans", "compactText", "muted", "heading", "labelled"].includes(method)) return `display:${method}`;
				if (pkg === "tui" && method === "button" && [1, 3].includes(position)) return "display:button";
				if (pkg === "tui" && method === "actionButton" && position === 1) return "display:button";
				if (pkg === "agent" && position === 0 && ["usage", "commandConsumed", "errorMessage"].includes(method) && file.startsWith("src/slash-commands/")) return `display:${method}`;
			}
		}
		return undefined;
	}
	return undefined;
}

/** Only value branches and display-only padding inside a visible interpolation
 * inherit its display role; conditions, lookup keys and arbitrary call arguments do not. */
export function nestedDisplayRole(node: Node, ancestors: Node[], templates: Set<Node>): string | undefined {
	let child = node;
	for (let index = ancestors.length - 1; index >= 0; index--) {
		const parent = ancestors[index];
		if (parent.type === "TemplateLiteral") return templates.has(parent) ? "display:expression" : undefined;
		if (["TSAsExpression", "TSSatisfiesExpression", "ParenthesizedExpression"].includes(parent.type)
			|| (parent.type === "ConditionalExpression" && parent.test !== child)
			|| (parent.type === "LogicalExpression" && parent.right === child)
			|| (parent.type === "BinaryExpression" && parent.operator === "+")) { child = parent; continue; }
		if (parent.type === "MemberExpression" && parent.object === child && !parent.computed && ["padStart", "padEnd", "trim", "trimStart", "trimEnd"].includes(name(parent.property))) { child = parent; continue; }
		if (parent.type === "CallExpression" && parent.callee === child && child.type === "MemberExpression") { child = parent; continue; }
		return undefined;
	}
	return undefined;
}
