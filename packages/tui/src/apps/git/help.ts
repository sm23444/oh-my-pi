/**
 * Keyboard shortcuts sheet of the git TUI (`?`).
 *
 * The keys are the git TUI's own (see `git-tui.ts` and `sidebar.ts`); this
 * sheet only lists them. ANSI draws grouped `key  description` rows; the
 * native render is the hotkeys sheet (NATIVE_REDESIGN §9.7): a glass sheet
 * titled "Keyboard shortcuts" with one section per group and a two-column
 * table whose key cells carry the `key` span token, so Tern draws keycaps.
 */
import { formatKeyHint } from "../../app-keybindings";
import type { KeyName } from "../../key-hint-format";
import { matchesKey } from "../../keys";
import { col, node, span } from "../../native/describe";
import type { NativeNode, NativeUiEvent } from "../../native/node";
import { actionBar, actionButton } from "../../native/overlay";
import { theme } from "../../theme/theme";
import type { Component } from "../../tui";
import { truncateToWidth, visibleWidth } from "../../utils";

interface Shortcut {
	readonly keys: readonly KeyName[];
	readonly label: string;
}

const GROUPS: readonly { readonly title: string; readonly rows: readonly Shortcut[] }[] = [
	{
		title: "移动",
		rows: [
			{ keys: ["up", "down"], label: "移动所选内容" },
			{ keys: ["left", "right"], label: "折叠或展开文件夹或部分" },
			{ keys: ["enter"], label: "在差异中打开文件" },
			{ keys: ["tab"], label: "在差异和更改之间切换" },
			{ keys: ["]", "["], label: "下一个或上一个文件" },
			{ keys: ["alt+down", "alt+up"], label: "下一个或上一个更改" },
			{ keys: ["g", "shift+g"], label: "首行或末行" },
		],
	},
	{
		title: "暂存",
		rows: [
			{ keys: ["space"], label: "暂存或取消暂存该行" },
			{ keys: ["s", "u"], label: "暂存或取消暂存（差异中的代码块或所选行）" },
			{ keys: ["shift+up", "shift+down"], label: "在差异中选择行" },
			{ keys: ["x"], label: "丢弃代码块或所选行（按两次）" },
			{ keys: ["delete"], label: "丢弃文件或文件夹（按两次）" },
		],
	},
	{
		title: "只读",
		rows: [
			{ keys: ["v"], label: "循环切换差异视图" },
			{ keys: ["1", "2", "3", "4"], label: "文件、拆分、内联或代码块视图" },
			{ keys: ["w"], label: "自动换行" },
			{ keys: ["b"], label: "忽略空白，然后格式化" },
			{ keys: ["t"], label: "路径或文件夹树" },
			{ keys: ["r"], label: "刷新" },
		],
	},
	{
		title: "提交",
		rows: [
			{ keys: ["c"], label: "填写提交信息（留空：自动生成）" },
			{ keys: ["escape"], label: "离开该字段" },
			{ keys: ["q"], label: "退出" },
		],
	},
];

/** The shortcuts overlay; any of `?`, escape or `q` closes it. */
export class GitHelpSheet implements Component {
	readonly nativeOverlay = { role: "omp.overlay.hotkeys", head: "Keyboard shortcuts", size: "lg" } as const;
	readonly #close: () => void;
	#native: NativeNode | undefined;

	constructor(close: () => void) {
		this.#close = close;
	}

	handleInput(data: string): void {
		if (data === "?" || data === "q" || matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) this.#close();
	}

	/** Close runs what Esc runs. */
	handleNativeEvent(event: NativeUiEvent): void {
		if (event.type === "action" && event.act === "close") this.#close();
	}

	describe(): NativeNode {
		this.#native ??= col(
			[
				...GROUPS.map(group =>
					node(
						"section",
						{ head: group.title, role: "omp.hotkeys.group" },
						[
							node("table", {
								role: "omp.hotkeys.table",
								cols: [
									{ id: "keys", head: "Keys" },
									{ id: "does", head: "Action", grow: 1 },
								],
								rows: group.rows.map((row, index) => ({
									id: String(index),
									cells: { keys: row.keys.map(key => span(formatKeyHint(key), "key")), does: row.label },
								})),
							}),
						],
						group.title,
					),
				),
				actionBar([null, actionButton("Close", "close", { keys: "escape" })]),
			],
			{ gap: "lg", role: "omp.app.git.help" },
		);
		return this.#native;
	}

	render(width: number): readonly string[] {
		const keyWidth = Math.max(
			...GROUPS.flatMap(group => group.rows.map(row => visibleWidth(row.keys.map(formatKeyHint).join(" ")))),
		);
		const lines = [truncateToWidth(` ${theme.bold("键盘快捷键")}`, width), ""];
		for (const group of GROUPS) {
			lines.push(truncateToWidth(` ${theme.fg("muted", group.title)}`, width));
			for (const row of group.rows) {
				const keys = row.keys.map(formatKeyHint).join(" ");
				const pad = " ".repeat(Math.max(1, keyWidth - visibleWidth(keys) + 2));
				lines.push(truncateToWidth(`   ${theme.fg("accent", keys)}${pad}${row.label}`, width));
			}
			lines.push("");
		}
		lines.push(truncateToWidth(` ${theme.fg("dim", `${formatKeyHint("escape")} 关闭`)}`, width));
		return lines;
	}

	invalidate(): void {
		this.#native = undefined;
	}
}
