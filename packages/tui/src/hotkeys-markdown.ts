import type { TspSpan } from "@oh-my-pi/pi-wire";
import { type AppKeybinding, formatKeyHint, type KeybindingsManager, keyHintPlatform } from "./app-keybindings";
import { Markdown } from "./components/markdown";
import { matchesSelectCancel } from "./keybinding-matchers";
import type { KeyName } from "./key-hint-format";
import { canonicalKeyId } from "./keybindings";
import { col, node, span } from "./native/describe";
import type { NativeNode, NativeUiEvent } from "./native/node";
import { actionBar, actionButton } from "./native/overlay";
import { getMarkdownTheme } from "./theme/theme";
import type { Component } from "./tui";

/** Effective keybinding operations used to render the hotkey reference. */
export interface HotkeysMarkdownBindings {
	keybindings: Pick<KeybindingsManager, "getDisplayString" | "getKeys" | "matchesCanonical">;
}

/**
 * One piece of a shortcut cell: formatted key hints (alternatives, one keycap
 * each), a literal typed token (`#<number>`, `!!`), or connecting prose.
 */
type HotkeyPart =
	| {
			/** Formatted for the markdown table (`⌃R`); `Disabled` when unbound. */
			keys: readonly string[];
			/** Key ids (`ctrl+r`) for native keycaps, which the terminal draws with platform glyphs. */
			ids: readonly KeyName[];
			action?: AppKeybinding;
	  }
	| { token: string }
	| { text: string };

interface HotkeyRow {
	readonly keys: readonly HotkeyPart[];
	readonly action: string;
}

interface HotkeyGroup {
	readonly title: string;
	readonly rows: readonly HotkeyRow[];
}

/** Formatted hints for key ids. */
function hints(keys: readonly KeyName[]): HotkeyPart {
	return { keys: keys.map(formatKeyHint), ids: keys };
}

/** The markdown cell text of a part; key alternatives join with `/` as `formatKeyHints` does. */
function markdownPart(bindings: HotkeysMarkdownBindings, part: HotkeyPart): string {
	if ("text" in part) return part.text;
	if ("token" in part) return `\`${part.token}\``;
	const label = part.action ? bindings.keybindings.getDisplayString(part.action) || "已禁用" : part.keys.join("/");
	return `\`${label}\``;
}

/** The shortcut groups, built from the effective bindings. */
function hotkeyGroups(bindings: HotkeysMarkdownBindings): HotkeyGroup[] {
	const isMac = keyHintPlatform() === "darwin";
	// An action's effective keys, one keycap each; `Disabled` when unbound.
	const act = (action: AppKeybinding): HotkeyPart => {
		const keys = bindings.keybindings.getKeys(action);
		if (keys.length > 0) return { keys: keys.map(formatKeyHint), ids: keys, action };
		return { keys: [bindings.keybindings.getDisplayString(action) || "Disabled"], ids: [], action };
	};
	const pushToTalkKeys = bindings.keybindings.getKeys("app.stt.pushToTalk");
	// CustomEditor tests the chord that was actually pressed, so exit keys split by role: a key
	// that also carries tui.editor.deleteCharForward (the readline `^D` overlap) forward-deletes
	// while the prompt holds a draft, any other exit key quits immediately. Mixed bindings such as
	// `["ctrl+d", "ctrl+q"]` therefore get one row per behavior instead of a single row claiming
	// both keys delete.
	const exitKeys = bindings.keybindings.getKeys("app.exit");
	const deletingExitKeys = exitKeys.filter(key =>
		bindings.keybindings.matchesCanonical(canonicalKeyId(key), "tui.editor.deleteCharForward"),
	);
	const quittingExitKeys = exitKeys.filter(
		key => !bindings.keybindings.matchesCanonical(canonicalKeyId(key), "tui.editor.deleteCharForward"),
	);
	const exitRows: HotkeyRow[] = [];
	if (deletingExitKeys.length > 0) {
		exitRows.push({
			keys: [hints(deletingExitKeys)],
			action: "有草稿时向后删除字符／输入为空时退出",
		});
	}
	// An unbound exit action still gets its row, mirroring the `Disabled` hint every other row uses.
	if (quittingExitKeys.length > 0 || deletingExitKeys.length === 0) {
		exitRows.push({
			keys: [quittingExitKeys.length > 0 ? hints(quittingExitKeys) : { keys: ["Disabled"], ids: [] }],
			action: "退出",
		});
	}
	const groups: HotkeyGroup[] = [
		{
			title: "导航",
			rows: [
				{
					keys: [hints(["up", "down", "left", "right"])],
					action: `移动光标／浏览历史（输入为空时按${formatKeyHint("up")}）`,
				},
				{ keys: [hints(["alt+left", "alt+right"])], action: "按单词移动" },
				{
					keys: [hints(isMac ? ["ctrl+a", "home", "super+left"] : ["ctrl+a", "home"])],
					action: "移到行首",
				},
				{ keys: [hints(isMac ? ["ctrl+e", "end", "super+right"] : ["ctrl+e", "end"])], action: "移到行尾" },
			],
		},
		{
			title: "编辑",
			rows: [
				{ keys: [hints(["enter"])], action: "发送消息" },
				{ keys: [hints(["shift+enter", "alt+enter"])], action: "换行" },
				{ keys: [hints(["ctrl+w", "alt+backspace"])], action: "向前删除一个单词" },
				{ keys: [hints(["ctrl+u"])], action: "删除到行首" },
				{ keys: [hints(["ctrl+k"])], action: "删除到行尾" },
				{ keys: [act("app.clipboard.copyLine")], action: "复制当前行" },
				{ keys: [act("app.clipboard.copyPrompt")], action: "复制整段提示词" },
			],
		},
		{
			title: "其他",
			rows: [
				{ keys: [hints(["tab"])], action: "补全路径／接受自动补全" },
				{ keys: [act("app.interrupt")], action: "取消自动补全／中断当前任务" },
				{ keys: [act("app.clear")], action: "第一次清空输入／第二次退出" },
				...exitRows,
				{ keys: [act("app.suspend")], action: "挂起到后台" },
				{ keys: [act("app.display.reset")], action: "重置终端显示" },
				{ keys: [act("app.thinking.cycle")], action: "切换思考强度" },
				{ keys: [act("app.model.cycleForward")], action: "切换角色模型（slow/default/smol）" },
				{ keys: [act("app.model.cycleBackward")], action: "反向切换角色模型" },
				{ keys: [act("app.model.selectTemporary")], action: "临时选择模型" },
				{ keys: [act("app.model.select")], action: "选择模型并分配角色" },
				{ keys: [act("app.plan.toggle")], action: "切换计划模式" },
				{ keys: [act("app.history.search")], action: "搜索提示词历史" },
				{ keys: [act("app.tools.expand")], action: "展开或折叠工具输出" },
				{ keys: [act("app.tools.toggleVisibility")], action: "显示或隐藏工具活动" },
				{ keys: [act("app.links.hint")], action: "按标签选择屏幕上的扩展链接" },
				{ keys: [act("app.ask.hide")], action: "隐藏或显示待回答的问题" },
				{ keys: [act("app.approval.approve")], action: "批准待处理的工具调用" },
				{ keys: [act("app.thinking.toggle")], action: "显示或隐藏思考内容" },
				{ keys: [act("app.editor.external")], action: "在外部编辑器中编辑消息" },
				{ keys: [act("app.local.open")], action: "在外部编辑器中打开 local:// 文件" },
				{ keys: [act("app.retry")], action: "重试最近失败的回合" },
				{ keys: [act("app.clipboard.pasteImage")], action: "粘贴剪贴板中的图像或文字" },
				{
					keys:
						pushToTalkKeys.length > 0
							? [{ text: "按住 " }, act("app.stt.pushToTalk")]
							: [act("app.stt.pushToTalk")],
					action:
						pushToTalkKeys.length > 0
							? "按住录音，松开转写为文字"
							: "按住录音转写（已禁用）",
				},
				{ keys: [act("app.live.toggle")], action: "启动或停止实时语音模式（/live）" },
				{
					keys: [
						act("app.agents.hub"),
						{ text: " / " },
						act("app.session.observe"),
						{ text: "／连按两次 " },
						hints(["left"]),
						{ text: "（输入为空时）" },
					],
					action: "打开智能体中心",
				},
				{ keys: [{ token: "#<number>" }], action: "GitHub 议题／PR 引用（e.g. `#3164` → `pr://`/`issue://`）" },
				{
					keys: [{ token: "#" }, { text: " / " }, { token: "#<text>" }],
					action: "提示词操作（复制／撤销／移动光标）",
				},
				{ keys: [{ token: "/" }], action: "斜杠命令" },
				{ keys: [{ token: "!" }], action: "运行 bash 命令" },
				{ keys: [{ token: "!!" }], action: "运行 bash 命令（不计入上下文）" },
				{ keys: [{ token: "$" }], action: "在共享内核中运行 Python" },
				{ keys: [{ token: "$$" }], action: "运行 Python（不计入上下文）" },
			],
		},
	];
	return groups;
}

/** Build the platform-aware Markdown reference for effective application hotkeys. */
export function buildHotkeysMarkdown(bindings: HotkeysMarkdownBindings): string {
	const lines: string[] = [];
	for (const [index, group] of hotkeyGroups(bindings).entries()) {
		if (index > 0) lines.push("");
		lines.push(`**${group.title}**`, "| 按键 | 操作 |", "|-----|--------|");
		for (const row of group.rows) {
			const keys = row.keys.map(part => markdownPart(bindings, part)).join("");
			lines.push(`| ${keys} | ${row.action} |`);
		}
	}
	return lines.join("\n");
}

/**
 * A shortcut cell as spans: each key alternative a `key` span holding its key
 * id (`ctrl+r`, drawn as a keycap like `kbd`), literal tokens as code, prose dim.
 */
function keySpans(parts: readonly HotkeyPart[]): TspSpan[] {
	const spans: TspSpan[] = [];
	for (const part of parts) {
		if ("text" in part) spans.push(span(part.text, "dim"));
		else if ("token" in part) spans.push(span(part.token, "code"));
		else if (part.ids.length === 0) spans.push(span(part.keys.join("/"), "dim"));
		else {
			for (const [index, id] of part.ids.entries()) {
				if (index > 0) spans.push(span(" ", "dim"));
				spans.push(span(id, "key"));
			}
		}
	}
	return spans;
}

/** Inline markdown (backticks) of an action description as spans: code runs mono, the rest plain. */
function actionSpans(action: string): TspSpan[] {
	return action.split(/(`[^`]+`)/).flatMap(piece => {
		if (piece === "") return [];
		return piece.startsWith("`") && piece.endsWith("`") ? [span(piece.slice(1, -1), "code")] : [span(piece)];
	});
}

/**
 * `/hotkeys` under a native terminal: a large sheet "Keyboard shortcuts" with
 * one section per group, each a two-column table whose key cells carry `key`
 * spans (Tern draws them as keycaps). Esc (or Close) dismisses it. Terminals
 * without the native surface get the transcript markdown panel instead.
 */
export class HotkeysSheetComponent implements Component {
	readonly nativeOverlay = { role: "omp.overlay.hotkeys", size: "lg", head: "键盘快捷键" } as const;
	readonly #bindings: HotkeysMarkdownBindings;
	readonly #onClose: () => void;
	#native: NativeNode | undefined;
	#markdown: Markdown | undefined;

	constructor(bindings: HotkeysMarkdownBindings, onClose: () => void) {
		this.#bindings = bindings;
		this.#onClose = onClose;
	}

	describe(): NativeNode {
		if (this.#native) return this.#native;
		const sections = hotkeyGroups(this.#bindings).map((group, index) =>
			node(
				"section",
				{ head: group.title, role: "omp.hotkeys.group" },
				[
					node("table", {
						role: "omp.hotkeys.table",
						cols: [
							{ id: "keys", head: "按键" },
							{ id: "action", head: "操作", grow: 1 },
						],
						rows: group.rows.map((row, rowIndex) => ({
							id: String(rowIndex),
							cells: { keys: keySpans(row.keys), action: actionSpans(row.action) },
						})),
					}),
				],
				`g${index}`,
			),
		);
		const close = actionButton("关闭", "close", { keys: "escape" });
		this.#native = col([...sections, actionBar([null, close])], { gap: "lg" });
		return this.#native;
	}

	/** The markdown reference, for a terminal that falls back to rows. */
	render(width: number): readonly string[] {
		this.#markdown ??= new Markdown(buildHotkeysMarkdown(this.#bindings), 1, 1, getMarkdownTheme());
		return this.#markdown.render(width);
	}

	invalidate(): void {
		this.#native = undefined;
		this.#markdown = undefined;
	}

	handleInput(data: string): void {
		if (matchesSelectCancel(data)) this.#onClose();
	}

	/** Close runs what Esc runs. */
	handleNativeEvent(event: NativeUiEvent): void {
		if (event.type === "action" && event.act === "close") this.#onClose();
	}
}
