import type { Node } from "@babel/types";
import type { PackageId } from "./core";

function name(node: Node | null | undefined): string {
	if (node?.type === "PrivateName") return node.id.name;
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
	// Parsers, lookup helpers and persisted sentinels are not return sinks.
	if (file === "src/chat/messages.ts") return identifier === "resolveAbortLabel";
	if (pkg === "tui" && file === "src/overlays/settings-selector.ts" && identifier === "footerHintText") return true;
	return /^(?:format|describe|render|build).*(?:Label|Message|Status|Summary|Report|Help|Usage|Text|Description|Title|Hint|Notice|Tooltip|Result|Outcome|Line)$/.test(identifier)
		|| /^(?:thoughtLabel|noThinkingMessage|runFastCommand|runSlowCommand|applyExtendedContextCommand|applyComputerUseToggle)$/.test(identifier)
		|| (pkg === "tui" && /^(?:render|describe)(?:[A-Z]|$)/.test(identifier));
}

function displayVariable(variable: string): boolean {
	return /^(?:label|title|message|description|hint|header|footer|emptyText|errorText|statusText|empty|lines|bodyLines|helpLines|infoLines|metaLines|notice|warning)$/.test(variable)
		|| /(?:^|_)(?:USAGE|LABEL|TITLE|MESSAGE|HINT|HELP|DESCRIPTION|UNSUPPORTED)$/.test(variable);
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
			if (ui && ["text", "tooltip", "emptyText", "errorText", "explanation", "noMatchText", "statusText", "head", "lead", "noun", "note", "subhead"].includes(field)) return `field:${field}`;
			if (pkg === "tui" && file === "src/hotkeys-markdown.ts" && field === "action") return "hotkey:action";
		}
		if (pkg === "agent" && file === "src/modes/interactive-mode.ts" && parent.type === "ClassPrivateProperty" && parent.value === child && name(parent.key) === "AUTOQA_CONSENT_PROMPTS") return "feedback:consent";
		if (pkg === "tui" && file === "src/overlays/hook-selector.ts" && parent.type === "VariableDeclarator" && parent.init === child && name(parent.id) === "controlsHint") return "selector:hint";
		if (parent.type === "ReturnStatement" && parent.argument === child) return displayFunction(ancestors.slice(0, index), pkg, file) ? "display:return" : undefined;
		if (parent.type === "ArrowFunctionExpression" && parent.body === child) return displayFunction(ancestors.slice(0, index + 1), pkg, file) ? "display:return" : undefined;
		if (parent.type === "VariableDeclarator" && parent.init === child && ui && file !== "src/chat/messages.ts" && displayVariable(name(parent.id))) return "display:variable";
		if (parent.type === "VariableDeclarator" && parent.init === child && pkg === "tui" && file === "src/overlays/settings-selector.ts" && ["switchTabs", "nav"].includes(name(parent.id)) && displayFunction(ancestors.slice(0, index), pkg, file)) return "display:variable";
		if (pkg === "tui" && file === "src/overlays/settings-selector.ts" && parent.type === "NewExpression" && parent.callee.type === "Identifier" && parent.callee.name === "Error" && parent.arguments[0] === child && node.type === "TemplateLiteral" && /^Invalid (?:array|record) JSON for /.test(node.quasis[0].value.cooked ?? "")) return "settings:validation";
		if (parent.type === "CallExpression" && parent.arguments.some(argument => argument === child)) {
			const position = parent.arguments.findIndex(argument => argument === child);
			const callee = parent.callee;
			if (callee.type === "MemberExpression" && !callee.computed) {
				const method = name(callee.property);
				const owner = name(callee.object);
				if (ui && ((["fg", "bg"].includes(method) && position === 1) || (["bold", "italic", "dim", "strikethrough"].includes(method) && position === 0)) && (pkg === "tui" || /theme|chalk/i.test(owner))) return `theme:${method}`;
				// Session stdout is a machine-readable path or lease report; stderr remains display text.
				const sessionStdout = pkg === "agent" && file === "src/commands/session.ts" && callee.object.type === "MemberExpression" && name(callee.object.property) === "stdout";
				if (ui && !sessionStdout && callee.object.type === "MemberExpression" && !callee.object.computed && ["stdout", "stderr"].includes(name(callee.object.property)) && method === "write" && position === 0) return "display:stream";
				if (position === 0 && ["showStatus", "showInfo", "showWarning", "showError", "showSuccess"].includes(method)) return `call:${method}`;
				if (position === 0 && method === "output" && owner === "runtime" && file.startsWith("src/slash-commands/")) return "call:output";
				if (ui && method === "push" && /^(?:lines|rows|sections|messages|body|bodyLines|extraLines|remainder|meta|statsParts)$/.test(owner)) return "display:line";
			}
			if (ui && callee.type === "Identifier") {
				const method = callee.name;
				if (pkg === "tui" && file === "src/overlays/settings-selector.ts" && position === 1 && ["topBorder", "overlayCard", "actionHint"].includes(method)) return `settings:${method}`;
				if (pkg === "tui" && file === "src/overlays/hook-selector.ts" && ["actionHint", "pickerAction"].includes(method) && position === 1) return "selector:action";
				if (pkg === "tui" && position === 0 && ["text", "span", "plainText", "styledSpans", "compactText", "muted", "heading", "labelled", "toolHead", "noteText", "formatEmptyMessage", "formatErrorMessage", "actionHint"].includes(method)) return `display:${method}`;
				if (pkg === "tui" && method === "button" && [1, 3].includes(position)) return "display:button";
				if (pkg === "tui" && method === "actionButton" && position === 0) return "display:button";
				if (pkg === "agent" && position === 0 && ["usage", "commandConsumed", "errorMessage", "output"].includes(method) && file.startsWith("src/slash-commands/")) return `display:${method}`;
			}
		}
		return undefined;
	}
	return undefined;
}

/** Conditions, lookup keys and arbitrary call arguments stay executable data. */
export function nestedDisplayRole(node: Node, ancestors: Node[], templates: Set<Node>): string | undefined {
	const branch = ancestors.at(-1);
	const plural = node.type === "StringLiteral" && node.value === "s" && branch?.type === "ConditionalExpression"
		&& ((branch.consequent === node && branch.alternate.type === "StringLiteral" && branch.alternate.value === "")
			|| (branch.alternate === node && branch.consequent.type === "StringLiteral" && branch.consequent.value === ""));
	let child = node;
	for (let index = ancestors.length - 1; index >= 0; index--) {
		const parent = ancestors[index];
		if (parent.type === "TemplateLiteral") return templates.has(parent) ? (plural ? "display:plural" : "display:expression") : undefined;
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
