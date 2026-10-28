import { combine, effect, register, type Setting } from "../config/registry";
import type { Settings } from "../config/settings";
import { formatKeyHint, formatKeyHints } from "@oh-my-pi/pi-tui/app-keybindings";
import { cfgReadToolResultPreview } from "../tools/settings";
import { MAGIC_KEYWORDS, type MagicKeywordId } from "./magic-keywords";
import { TREE_FILTER_MODES } from "@oh-my-pi/pi-tui/overlays/tree-selector";
import {
	CONTEXT_LINE_MODE_VALUES,
	CUSTOM_STATUS_LINE_DEFAULTS,
	STATUS_LINE_PRESET_VALUES,
	STATUS_LINE_SEGMENT_IDS,
	STATUS_LINE_SEPARATOR_VALUES,
} from "@oh-my-pi/pi-tui/status-line/schema";
import { setChatTranscriptDisplayPreferences } from "@oh-my-pi/pi-tui/chat/display-preferences";
import { setEditorGapComposerShape } from "@oh-my-pi/pi-tui/prompt/editor-top-gap";
import { setEmojiAutocompleteEnabled } from "@oh-my-pi/pi-tui/prompt/prompt-action-autocomplete";
import { WORD_COMPLETION_METHODS } from "@oh-my-pi/pi-tui/prompt/word-completion";
import { applyHyperlinkSetting } from "@oh-my-pi/pi-tui/render/hyperlink";
import { setInlineImageMaxColumns, setInlineImageMaxRows } from "@oh-my-pi/pi-tui/render/render-utils";
import { setShimmerMode } from "@oh-my-pi/pi-tui/theme/shimmer";
import { setAutoThemeMapping, setColorBlindMode, setSymbolPreset } from "@oh-my-pi/pi-tui/theme/theme";

const EMPTY_UNKNOWN_RECORD: Record<string, unknown> = {};

// ────────────────────────────────────────────────────────────────────────
// General settings (no UI)
// ────────────────────────────────────────────────────────────────────────
export const cfgSetupVersion = register({ id: "setupVersion", type: "number", default: 0 });

export const cfgAutoResume = register({
	id: "autoResume",
	type: "boolean",
	default: false,
	ui: {
		tab: "interaction",
		group: "启动与更新",
		label: "自动恢复",
		description:
			"自动恢复当前目录中最近的会话。如果其模型无法恢复且模型回退被禁用，交互式启动会发出警告，并在没有已保存历史记录的情况下启动新会话。",
	},
});

export const cfgGitEnabled = register({
	id: "git.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "interaction",
		group: "Git",
		label: "启用 Git 集成",
		description: "在 TUI 中显示 git 分支、状态和 PR 信息,并监听仓库元数据。",
	},
});

// ────────────────────────────────────────────────────────────────────────
// Appearance
// ────────────────────────────────────────────────────────────────────────

// Theme
export const cfgThemeDark = register({
	id: "theme.dark",
	type: "string",
	default: "titanium",
	ui: {
		tab: "appearance",
		group: "主题",
		label: "深色主题",
		description: "终端为深色背景时使用的主题",
		options: "runtime",
	},
});
effect(cfgThemeDark, name => setAutoThemeMapping("dark", name));

export const cfgThemeLight = register({
	id: "theme.light",
	type: "string",
	default: "light",
	ui: {
		tab: "appearance",
		group: "主题",
		label: "浅色主题",
		description: "终端为浅色背景时使用的主题",
		options: "runtime",
	},
});
effect(cfgThemeLight, name => setAutoThemeMapping("light", name));

export const cfgSymbolPreset = register({
	id: "symbolPreset",
	type: "enum",
	values: ["unicode", "nerd", "ascii"] as const,
	default: "unicode",
	ui: {
		tab: "appearance",
		group: "主题",
		label: "符号预设",
		description: "图标和符号使用的字形集(Unicode、Nerd Font 或 ASCII)",
		options: [
			{ value: "unicode", label: "Unicode", description: "标准符号(默认)" },
			{
				value: "nerd",
				label: "Nerd Font",
				description: "需要 Nerd Font,或支持 Glyph Protocol 的终端(图标随流内传输)",
			},
			{ value: "ascii", label: "ASCII", description: "最大兼容性" },
		],
	},
});
effect(cfgSymbolPreset, setSymbolPreset);

export const cfgColorBlindMode = register({
	id: "colorBlindMode",
	type: "boolean",
	default: false,
	ui: {
		tab: "appearance",
		group: "主题",
		label: "色盲模式",
		description: "diff 新增内容使用蓝色而不是绿色",
	},
});
effect(cfgColorBlindMode, setColorBlindMode);

// Composer
export const cfgComposerShape = register({
	id: "composer.shape",
	type: "string",
	default: "band",
	ui: {
		tab: "appearance",
		group: "输入框",
		label: "输入框形状",
		description: "输入编辑器与状态行的视觉布局",
		options: "runtime",
	},
});
effect(cfgComposerShape, setEditorGapComposerShape);

export const cfgComposerTokenRate = register({
	id: "composer.tokenRate",
	type: "boolean",
	default: false,
	ui: {
		tab: "appearance",
		group: "输入框",
		label: "生成速率",
		description:
			"显示实时生成 tok/s 读数：在会话标题旁边的工作行中，或紧跟在思考级别之后的原生编辑器栏中显示；上一次读数会在轮次之间保留。该值根据流式增量估算，并在每条消息完成时根据提供商的计费输出数量进行修正。",
	},
});

// Status line
export const cfgStatusLinePreset = register({
	id: "statusLine.preset",
	type: "enum",
	values: STATUS_LINE_PRESET_VALUES,
	default: "default",
	ui: {
		tab: "appearance",
		group: "状态栏",
		label: "状态栏预设",
		description: "预置的状态栏配置",
		options: [
			{ value: "default", label: "默认", description: "模型、路径、git、上下文、tokens、费用" },
			{ value: "minimal", label: "极简", description: "仅路径和 git" },
			{ value: "compact", label: "紧凑", description: "模型、git、费用、上下文" },
			{ value: "full", label: "完整", description: "包括时间在内的所有分段" },
			{ value: "nerd", label: "Nerd", description: "使用 Nerd Font 图标显示最多信息" },
			{ value: "ascii", label: "ASCII", description: "无特殊字符" },
			{ value: "custom", label: "自定义", description: "用户自定义分段" },
		],
	},
});

export const cfgStatusLineSeparator = register({
	id: "statusLine.separator",
	type: "enum",
	values: STATUS_LINE_SEPARATOR_VALUES,
	default: "powerline-thin",
	ui: {
		tab: "appearance",
		group: "状态栏",
		label: "状态栏分隔符",
		description: "分段之间分隔符的样式",
		options: [
			{ value: "powerline", label: "Powerline", description: "实心箭头(Nerd Font)" },
			{ value: "powerline-thin", label: "细箭头", description: "细箭头(Nerd Font)" },
			{ value: "slash", label: "斜杠", description: "正斜杠" },
			{ value: "pipe", label: "竖线", description: "垂直竖线" },
			{ value: "block", label: "方块", description: "实心方块" },
			{ value: "none", label: "无", description: "仅空格" },
			{ value: "ascii", label: "ASCII", description: "大于号" },
		],
	},
});

export const cfgStatusLineContextLine = register({
	id: "statusLine.contextLine",
	type: "enum",
	values: CONTEXT_LINE_MODE_VALUES,
	default: "embedded",
	ui: {
		tab: "appearance",
		group: "状态栏",
		label: "上下文感应线",
		description: "左右两段之间的横线如何反映上下文占用（仅框式输入框）",
		options: [
			{ value: "off", label: "关闭", description: "实色强调线，不反馈上下文" },
			{
				value: "percentage",
				label: "百分比",
				description: "已用部分用强调色，其余置暗",
			},
			{
				value: "annotated",
				label: "带刻度",
				description: "百分比加刻度，标出投机压缩与自动压缩边界",
			},
			{
				value: "embedded",
				label: "内嵌",
				description: "带刻度线，把上下文百分比与窗口内嵌进仪表",
			},
		],
	},
});

export const cfgStatusLineSessionAccent = register({
	id: "statusLine.sessionAccent",
	type: "boolean",
	default: true,
	ui: {
		tab: "appearance",
		group: "状态栏",
		label: "会话强调色",
		description: "使用会话名称的颜色作为编辑器边框和状态栏间隙的颜色",
	},
});

export const cfgStatusLineTransparent = register({
	id: "statusLine.transparent",
	type: "boolean",
	default: false,
	ui: {
		tab: "appearance",
		group: "状态栏",
		label: "透明状态栏",
		description:
			"状态栏使用终端的默认背景,而不是主题的 `statusLineBg`。Powerline 端帽会被去掉,因为它们需要对比色填充来衔接周围终端。",
	},
});

export const cfgStatusLineCompactThinkingLevel = register({
	id: "statusLine.compactThinkingLevel",
	type: "boolean",
	default: true,
	ui: {
		tab: "appearance",
		group: "状态栏",
		label: "紧凑思考级别",
		description:
			"将思考级别显示为模型名称上的单个图标，而不是单独的 ` · <level>` 后缀；在 Tern 的编辑器中，显示为模型芯片的图标，而不是单独的芯片（点击图标可循环切换）。",
	},
});

export const cfgStatusLineShowHookStatus = register({
	id: "statusLine.showHookStatus",
	type: "boolean",
	default: true,
	ui: {
		tab: "appearance",
		group: "状态栏",
		label: "显示 Hook 状态",
		description: "在状态栏下方显示 hook 状态消息",
	},
});

export const cfgStatusLineLeftSegments = register({
	id: "statusLine.leftSegments",
	type: "array",
	default: CUSTOM_STATUS_LINE_DEFAULTS.left,
	items: { values: STATUS_LINE_SEGMENT_IDS, label: "状态栏片段" },
});

export const cfgStatusLineRightSegments = register({
	id: "statusLine.rightSegments",
	type: "array",
	default: CUSTOM_STATUS_LINE_DEFAULTS.right,
	items: { values: STATUS_LINE_SEGMENT_IDS, label: "状态栏片段" },
});

export const cfgStatusLineSegmentOptions = register({
	id: "statusLine.segmentOptions",
	type: "record",
	default: EMPTY_UNKNOWN_RECORD,
});

// Images and terminal
export const cfgTerminalShowImages = register({
	id: "terminal.showImages",
	type: "boolean",
	default: true,
	ui: {
		tab: "appearance",
		group: "图片",
		label: "显示内联图片",
		description: "在终端中内联渲染图片",
		condition: "hasImageProtocol",
	},
});

export const cfgImagesAutoResize = register({
	id: "images.autoResize",
	type: "boolean",
	default: true,
	ui: {
		tab: "appearance",
		group: "图片",
		label: "自动调整图片大小",
		description: "将大图片调整为最大 2000x2000,以获得更好的模型兼容性",
	},
});

export const cfgImagesBlockImages = register({
	id: "images.blockImages",
	type: "boolean",
	default: false,
	ui: {
		tab: "appearance",
		group: "图片",
		label: "阻止图片",
		description: "阻止图片发送给 LLM 提供商",
	},
});

export const cfgTuiMaxInlineImageColumns = register({
	id: "tui.maxInlineImageColumns",
	type: "number",
	default: 100,
	description:
		"内联图片的最大宽度(终端列数,默认 100)。设为 0 表示不限(仅受终端宽度限制)。",
});
effect(cfgTuiMaxInlineImageColumns, setInlineImageMaxColumns);

export const cfgTuiMaxInlineImageRows = register({
	id: "tui.maxInlineImageRows",
	type: "number",
	default: 20,
	description:
		"内联图片在终端行中的最大高度（默认 20）。设置为 0 则仅使用基于视口的限制（终端高度的 60% of）。",
});
effect(cfgTuiMaxInlineImageRows, setInlineImageMaxRows);

export const cfgTuiMaxInlineImages = register({
	id: "tui.maxInlineImages",
	type: "number",
	default: 8,
	description:
		"作为实时终端图形保留的内联图片最大数量(默认 8)。超过限制后,较旧的图片通过完全重绘回退为文本占位符。设为 0 表示保留所有图片(无限制)。",
});

export const cfgTuiResizeScrollback = register({
	id: "tui.resizeScrollback",
	type: "enum",
	values: ["append", "rebuild", "preserve"] as const,
	default: "rebuild",
	ui: {
		tab: "appearance",
		group: "显示",
		label: "尺寸调整时的回滚",
		description: "终端尺寸稳定后，如何刷新回滚缓冲中保留的会话记录行",
		options: [
			{
				value: "append",
				label: "追加",
				description: "以新宽度在保留历史之下重放会话记录",
			},
			{
				value: "rebuild",
				label: "重建",
				description: "清空全部回滚缓冲，再以当前宽度重放一遍会话记录",
			},
			{
				value: "preserve",
				label: "保留",
				description: "仅重绘视口，历史按旧宽度保留换行",
			},
		],
	},
});

export const cfgTuiCompleteScrollback = register({
	id: "tui.completeScrollback",
	type: "boolean",
	default: false,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "完整回滚缓冲区",
		description:
			"将被不断增大的 HUD 或对话框推出屏幕的会话记录行直接发送到回滚缓冲区；当它缩小时，空白行会留在会话记录和输入之间，直到新输出填满它们。",
	},
});

export const cfgTerminalShowProgress = register({
	id: "terminal.showProgress",
	type: "boolean",
	default: false,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "原生终端进度",
		description:
			"在代理或上下文维护运行时发出 OSC 9;4 不确定进度（在 Tern 中始终开启）。",
	},
});

export const cfgTerminalProgramStatus = register({
	id: "terminal.programStatus",
	type: "boolean",
	default: true,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "程序状态（OSC 7501）",
		description:
			"通过 OSC 7501 报告代理是正在工作、等待你、已完成还是失败，供终端标签页指示器和代理收件箱使用。",
	},
});

export const cfgTuiTextSizing = register({
	id: "tui.textSizing",
	type: "boolean",
	default: false,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "大标题 (Kitty)",
		description:
			"使用 Kitty 的 OSC 66 文本尺寸协议以 2 倍大小渲染 Markdown H1 标题。仅在 Kitty 终端上生效;其他终端忽略。默认关闭。",
	},
});

export const cfgTuiRenderMermaid = register({
	id: "tui.renderMermaid",
	type: "boolean",
	default: true,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "渲染 Mermaid 图表",
		description: "将 Mermaid 围栏代码块渲染为 ASCII 图表",
	},
});

export const cfgTuiRenderSvg = register({
	id: "tui.renderSvg",
	type: "boolean",
	default: true,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "渲染 SVG 图形",
		description:
			"邀请智能体以 SVG 格式绘制示意图和图表，并在支持图形显示的终端上以内嵌图片形式呈现。",
	},
});

export const cfgTuiAutoGraph = register({
	id: "tui.autoGraph",
	type: "enum",
	values: ["smart", "always", "off"] as const,
	default: "always",
	ui: {
		tab: "appearance",
		group: "显示",
		label: "自动绘制表格图表",
		description:
			"在智能体回答中的数值表格下方，使用你的主题颜色绘制图表，并在支持图形显示的终端上显示。",
		options: [
			{
				value: "smart",
				label: "智能",
				description:
					"评判模型会优化每张图表：图表类型、列、行名称与分组、刻度、更合适的方向以及标题。",
			},
			{
				value: "always",
				label: "总是",
				description: "使用内置最佳猜测，为每个看起来是数值的表格绘制图表。",
			},
			{ value: "off", label: "关闭", description: "将表格保留为表格" },
		],
	},
});

export const cfgTuiReactions = register({
	id: "tui.reactions",
	type: "boolean",
	default: true,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "代理表情回应",
		description: "让代理在你的消息气泡上以 emoji 徽章回应",
	},
});

export const cfgTuiCodexResetFireworks = register({
	id: "tui.codexResetFireworks",
	type: "boolean",
	default: false,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "Codex 重置烟花",
		get description() {
			return `Celebrate unscheduled Codex weekly usage resets and newly banked saved resets with a top-third fireworks overlay that remains until ${formatKeyHint("escape")}`;
		},
	},
});

export const cfgTuiTitleState = register({
	id: "tui.titleState",
	type: "boolean",
	default: true,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "终端标题运行状态",
		description:
			"在终端标题的分隔符中显示代理运行状态——工作时为动画旋转指示器(WSL 下是静态 ':'),轮到你时显示 '>',代理等待你时显示 '!'",
	},
});

export const cfgTuiTitleSpinner = register({
	id: "tui.titleSpinner",
	type: "enum",
	values: ["braille", "pulse", "dots", "line"] as const,
	default: "braille",
	ui: {
		tab: "appearance",
		group: "显示",
		label: "终端标题指示器",
		description:
			"终端标题中工作状态指示器使用的字形集 —— 盲文扫动、月相填充、单点循环或 ASCII 线条",
		options: [
			{ value: "braille", label: "盲文", description: "经典 ⠋⠙⠹ 扫动（默认）" },
			{ value: "pulse", label: "脉动", description: "月相由亏转盈 ○◑● 再回到空" },
			{ value: "dots", label: "点阵", description: "单点盲文循环" },
			{ value: "line", label: "线条", description: "ASCII 的 \\ | /（适用于不支持盲文点阵的字体）" },
		],
	},
});

export const cfgTuiHyperlinks = register({
	id: "tui.hyperlinks",
	type: "enum",
	values: ["off", "auto", "always"] as const,
	default: "auto",
	ui: {
		tab: "appearance",
		group: "显示",
		label: "终端超链接",
		description:
			"将路径和网址包装为 OSC 8 超链接，以便在终端中点击打开（auto：检测支持情况；off：从不启用；always：无条件启用）",
	},
});
// Also re-applied when a project-scoped reload (`/move`, cross-project resume, rollback) changes the
// effective value, so pi-tui renderers gating on the shared flag track it the same instant path links do.
effect(cfgTuiHyperlinks, applyHyperlinkSetting);

export const cfgTuiMouse = register({
	id: "tui.mouse",
	type: "boolean",
	default: false,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "鼠标点击聚焦",
		get description() {
			const shift = formatKeyHint("shift");
			return `Capture mouse clicks in the main session so live subagent cards and HUD rows focus on click, with a hover highlight on the target. Native text selection becomes ${shift}+drag and wheel scroll becomes ${shift}+wheel while on`;
		},
	},
});

export const cfgTuiTight = register({
	id: "tui.tight",
	type: "boolean",
	default: false,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "紧凑布局",
		description: "移除终端输出左右两侧 1 字符的水平内边距",
	},
});

export const cfgDisplayShimmer = register({
	id: "display.shimmer",
	type: "enum",
	values: ["classic", "kitt", "disabled"] as const,
	default: "classic",
	ui: {
		tab: "appearance",
		group: "显示",
		label: "微光动画",
		description: "用于 working/loading 消息的动画样式",
		options: [
			{ value: "classic", label: "经典", description: "柔和余弦波扫过文本" },
			{ value: "kitt", label: "KITT 扫描灯", description: "Knight Rider 1982 红色指示灯左右弹跳" },
			{ value: "disabled", label: "已禁用", description: "无动画;静态弱化文本" },
		],
	},
});
effect(cfgDisplayShimmer, setShimmerMode);

export const cfgDisplayPinnedAgents = register({
	id: "display.pinnedAgents",
	type: "enum",
	values: ["off", "collapsed", "full"] as const,
	default: "collapsed",
	ui: {
		tab: "appearance",
		group: "显示",
		label: "固定的代理",
		description:
			"编辑器上方的活跃代理固定跳转列表（关闭则隐藏；折叠时显示几行并带展开器；完整时全部列出）",
		options: [
			{ value: "off", label: "关闭", description: "隐藏固定跳转列表" },
			{ value: "collapsed", label: "折叠", description: "显示几行并带展开器" },
			{ value: "full", label: "完整", description: "始终列出全部活跃代理" },
		],
	},
});

export const cfgDisplaySubagentLivePreview = register({
	id: "display.subagentLivePreview",
	type: "boolean",
	default: false,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "子代理实时预览",
		description: "在每个已固定子代理的行下方显示其当前（或最近）的工具调用",
	},
});

export const cfgDisplaySmoothStreaming = register({
	id: "display.smoothStreaming",
	type: "boolean",
	default: true,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "平滑流式输出",
		description: "在数据块到达时平滑地显示助手文本和流式工具输入",
	},
});

export const cfgDisplayHideToolActivity = register({
	id: "display.hideToolActivity",
	type: "boolean",
	default: false,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "隐藏工具活动",
		description: "在记录中隐藏模型发起的工具调用和结果",
	},
});

export const cfgDisplayShowTokenUsage = register({
	id: "display.showTokenUsage",
	type: "boolean",
	default: false,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "显示 Token 用量",
		description: "在助手消息上显示每轮 token 用量",
	},
});

export const cfgDisplayShowTurnTime = register({
	id: "display.showTurnTime",
	type: "boolean",
	default: false,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "显示轮次耗时",
		description: "在助手消息用量行显示从提示到产出的总耗时（含工具调用）",
	},
});

export const cfgDisplayCacheMissMarker = register({
	id: "display.cacheMissMarker",
	type: "boolean",
	default: false,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "缓存未命中标记",
		description: "在未命中提示缓存的助手轮次后显示分隔线",
	},
});

export const cfgDisplayAdvisorCollapsedLines = register({
	id: "display.advisorCollapsedLines",
	type: "number",
	default: 0,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "Advisor 折叠行",
		description:
			"折叠的顾问卡片在其标题下方显示的最大注释行数（0 表示保留完整预览；使用工具输出开关展开）",
		options: [
			{ value: "0", label: "无限制", description: "默认。" },
			{ value: "1", label: "1 行" },
			{ value: "2", label: "2 行" },
			{ value: "3", label: "3 行" },
			{ value: "5", label: "5 行" },
		],
	},
});
effect(
	combine({
		hideToolActivity: cfgDisplayHideToolActivity,
		readToolResultPreview: cfgReadToolResultPreview,
		showImages: cfgTerminalShowImages,
		cacheMissMarker: cfgDisplayCacheMissMarker,
		showTokenUsage: cfgDisplayShowTokenUsage,
		showTurnTime: cfgDisplayShowTurnTime,
		advisorCollapsedLines: cfgDisplayAdvisorCollapsedLines,
	}),
	setChatTranscriptDisplayPreferences,
);

export const cfgDisplayCollapseCompacted = register({
	id: "display.collapseCompacted",
	type: "boolean",
	default: true,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "折叠压缩历史",
		description:
			"在实时记录中,将压缩前的历史折叠到摘要分隔线之后;禁用则保留完整记录,并在每个压缩点显示分隔线",
	},
});

export const cfgShowHardwareCursor = register({
	id: "showHardwareCursor",
	type: "boolean",
	default: true, // will be computed based on platform if undefined
	ui: {
		tab: "appearance",
		group: "显示",
		label: "显示硬件光标",
		description: "为 IME 支持显示终端光标",
	},
});

export const cfgTuiImeSafeCursor = register({
	id: "tui.imeSafeCursor",
	type: "boolean",
	default: false,
	ui: {
		tab: "appearance",
		group: "显示",
		label: "IME 安全提示行布局",
		description: "将提示行的底部边框移到单独一行,以免 macOS IME 预编辑将其挤开",
	},
});

// ────────────────────────────────────────────────────────────────────────
// Interaction
// ────────────────────────────────────────────────────────────────────────

// Conversation flow
export const cfgSteeringMode = register({
	id: "steeringMode",
	type: "enum",
	values: ["all", "one-at-a-time"] as const,
	default: "one-at-a-time",
	ui: {
		tab: "interaction",
		group: "输入",
		label: "引导模式",
		description: "代理工作时如何处理排队消息",
	},
});

export const cfgFollowUpMode = register({
	id: "followUpMode",
	type: "enum",
	values: ["all", "one-at-a-time"] as const,
	default: "one-at-a-time",
	ui: {
		tab: "interaction",
		group: "输入",
		label: "跟进模式",
		description: "一轮完成后如何处理积压的跟进消息",
	},
});

export const cfgInterruptMode = register({
	id: "interruptMode",
	type: "enum",
	values: ["immediate", "wait"] as const,
	default: "immediate",
	ui: {
		tab: "interaction",
		group: "输入",
		label: "中断模式",
		description: "引导消息何时中断工具执行",
	},
});

export const cfgTuiVimMode = register({
	id: "tui.vimMode",
	type: "boolean",
	default: false,
	ui: {
		tab: "interaction",
		group: "输入",
		label: "Vim 编辑模式",
		get description() {
			return `Modal prompt editing. ${formatKeyHint("escape")} leaves Insert mode; Normal mode has hjkl, 0, $, ^, w, b, e, gg, G, counts, x/D/C, dd/yy, p and u; operators take motions or text objects (diw, ca(, dap); v/V start a Visual selection that y copies and d deletes`;
		},
	},
});

export const cfgTuiVimModeDisplay = register({
	id: "tui.vimModeDisplay",
	type: "enum",
	values: ["text", "icon", "none"] as const,
	default: "text",
	ui: {
		tab: "interaction",
		group: "输入",
		label: "Vim 模式指示器",
		description: "当前 Vim 模式在状态栏中的显示方式",
		condition: "vimModeEnabled",
		options: [
			{ value: "text", label: "文本", description: "完整模式名称——NORMAL、INSERT、VISUAL、V-LINE、REPLACE" },
			{ value: "icon", label: "图标", description: "每个模式显示为单个紧凑字形" },
			{ value: "none", label: "隐藏", description: "不在状态栏中显示模式" },
		],
	},
});

export const cfgLoopMode = register({
	id: "loop.mode",
	type: "enum",
	values: ["prompt", "compact", "reset"] as const,
	default: "prompt",
	ui: {
		tab: "interaction",
		group: "输入",
		label: "循环模式",
		description: "/loop 迭代之间、重新提交提示之前会发生什么",
		options: [
			{
				value: "prompt",
				label: "提示词",
				description: "将提示作为跟进消息重新提交(当前行为)",
			},
			{
				value: "compact",
				label: "紧凑",
				description: "压缩会话上下文,然后重新提交提示",
			},
			{ value: "reset", label: "重置", description: "开启新会话,然后重新提交提示" },
		],
	},
});

export const cfgLoopConditionTimeoutMs = register({
	id: "loop.conditionTimeoutMs",
	type: "number",
	default: 30_000,
	ui: {
		tab: "interaction",
		group: "输入",
		label: "循环条件超时（毫秒）",
		description:
			"`/loop --while` / `--until` 条件命令的最长等待时间，超时即视为条件失效并停止循环。设为 0 表示无限等待",
		options: [
			{ value: "0", label: "无限制" },
			{ value: "10000", label: "10 秒" },
			{ value: "30000", label: "30 秒" },
			{ value: "120000", label: "2 分钟" },
		],
	},
});

// Input and startup
export const cfgComposerRecallClearedDrafts = register({
	id: "composer.recallClearedDrafts",
	type: "boolean",
	default: true,
	ui: {
		tab: "interaction",
		group: "输入",
		label: "恢复已清除的草稿",
		get description() {
			return `Keep drafts cleared with ${formatKeyHint("ctrl+c")} in local ${formatKeyHints(["up", "down"])} history until exit; disabling affects future clears`;
		},
	},
});

export const cfgDoubleEscapeAction = register({
	id: "doubleEscapeAction",
	type: "enum",
	values: ["rewind", "tree", "none"] as const,
	default: "rewind",
	ui: {
		tab: "interaction",
		group: "输入",
		label: "双击 Escape 操作",
		get description() {
			return `What pressing ${formatKeyHint("escape")} twice with an empty editor does: open the transcript rewind selector, open the session tree, or nothing`;
		},
	},
});

export const cfgBareExitOnEmptySession = register({
	id: "input.bareExitOnEmptySession",
	type: "boolean",
	default: true,
	ui: {
		tab: "interaction",
		group: "输入",
		label: "空会话时直接退出",
		description:
			"在第一条消息之前，精确提交 `exit`、`quit` 或 `q`（不区分大小写）将直接退出，而不会向模型发送提示",
	},
});

export const cfgBareSlashCommands = register({
	id: "input.bareSlashCommands",
	type: "boolean",
	default: false,
	ui: {
		tab: "interaction",
		group: "输入",
		label: "无斜杠命令",
		description:
			"精确提交不带前导 `/` 的命令名（例如 e.g. `model`, `compact`）即可运行该斜杠命令；会话中有消息后，按两次 Enter 确认",
	},
});

export const cfgTreeFilterMode = register({
	id: "treeFilterMode",
	type: "enum",
	values: TREE_FILTER_MODES,
	default: "default",
	ui: {
		tab: "interaction",
		group: "输入",
		label: "会话树过滤器",
		description: "打开会话树时的默认过滤模式",
	},
});

export const cfgAutocompleteMaxVisible = register({
	id: "autocompleteMaxVisible",
	type: "number",
	default: 10,
	ui: {
		tab: "interaction",
		group: "输入",
		label: "自动补全条目数",
		description: "自动补全下拉菜单中最多可见的条目数 (3-20)",
		options: [
			{ value: "3", label: "3 项" },
			{ value: "5", label: "5 项" },
			{ value: "7", label: "7 项" },
			{ value: "10", label: "10 项" },
			{ value: "15", label: "15 项" },
			{ value: "20", label: "20 项" },
		],
	},
});

export const cfgSpellingTypoDetection = register({
	id: "spelling.typoDetection",
	type: "boolean",
	default: true,
	ui: {
		tab: "interaction",
		group: "输入",
		label: "拼写检查（macOS）",
		description: "用启用的 macOS 词典标记输入中的拼写错误",
		condition: "macOS",
	},
});

export const cfgSpellingAutocomplete = register({
	id: "spelling.autocomplete",
	type: "enum",
	values: WORD_COMPLETION_METHODS,
	default: "auto",
	ui: {
		tab: "interaction",
		group: "输入",
		label: "单词自动补全",
		get description() {
			return `Show predicted word completions as inline hints: ${formatKeyHint("tab")} accepts with a space, ${formatKeyHint("right")} without`;
		},
		options: [
			{ value: "off", label: "关闭", description: "无单词补全" },
			{
				value: "auto",
				label: "自动",
				description: "N-gram（无需下载）",
			},
			{ value: "ngram", label: "N-gram", description: "从提示历史中学习你的词汇" },
			{
				value: "smollm",
				label: "SmolLM",
				description: "与 N-gram 混合的小型端侧语言模型（首次使用时下载权重）",
			},
			...(process.platform === "darwin"
				? [{ value: "apple" as const, label: "苹果", description: "macOS 词典补全" }]
				: []),
		],
	},
});

export const cfgComposerPredictions = register({
	id: "composer.predictions",
	type: "boolean",
	default: false,
	ui: {
		tab: "interaction",
		group: "输入",
		label: "Composer 预测",
		get description() {
			return `After a completed turn, ask the active model to predict your next message and show it as ghost text in the empty composer; ${formatKeyHint("tab")} or ${formatKeyHint("right")} inserts it without sending. Extra usage: every completed turn sends one more billed request over the whole conversation (counted in /stats)`;
		},
	},
});

export const cfgSpellingAutocorrect = register({
	id: "spelling.autocorrect",
	type: "boolean",
	default: false,
	ui: {
		tab: "interaction",
		group: "输入",
		label: "自动纠错（macOS）",
		description: "在完成输入的单词后应用有把握的 macOS 纠错",
		condition: "macOS",
	},
});

export const cfgEmojiAutocomplete = register({
	id: "emojiAutocomplete",
	type: "boolean",
	default: true,
	ui: {
		tab: "interaction",
		group: "输入",
		label: "Emoji 自动补全",
		description: "从 `:name:` 短代码建议 emoji,并展开 `:D` 或 `:-)` 之类的文本表情",
	},
});
effect(cfgEmojiAutocomplete, setEmojiAutocompleteEnabled);

export const cfgPasteLargeMenuThreshold = register({
	id: "paste.largeMenuThreshold",
	type: "number",
	default: 100,
	ui: {
		tab: "interaction",
		group: "输入",
		label: "大段粘贴菜单",
		description:
			"当粘贴内容达到这么多行时,提供菜单将其包裹在代码块中、包裹在 XML 标签中,或保存到文件。0 禁用该菜单(大段粘贴仍会折叠为 [Paste] 标记)。",
		options: [
			{ value: "0", label: "关闭" },
			{ value: "100", label: "100 行" },
			{ value: "250", label: "250 行" },
			{ value: "500", label: "500 行" },
			{ value: "1000", label: "1000 行" },
		],
	},
});

export const cfgStartupQuiet = register({
	id: "startup.quiet",
	type: "boolean",
	default: false,
	ui: {
		tab: "interaction",
		group: "启动与更新",
		label: "安静启动",
		description: "跳过欢迎界面和启动状态消息",
	},
});

export const cfgStartupShowSplash = register({
	id: "startup.showSplash",
	type: "boolean",
	default: false,
	ui: {
		tab: "interaction",
		group: "启动与更新",
		label: "显示启动画面",
		description:
			"在正常的交互式启动时显示完整的动画设置画面,而不重新运行设置。安静启动仍会抑制它。",
	},
});

export const cfgStartupSetupWizard = register({
	id: "startup.setupWizard",
	type: "boolean",
	default: true,
	ui: {
		tab: "interaction",
		group: "启动与更新",
		label: "设置向导",
		description: "每个设置版本显示一次新增的引导步骤",
	},
});

export const cfgStartupCheckUpdate = register({
	id: "startup.checkUpdate",
	type: "boolean",
	default: true,
	ui: {
		tab: "interaction",
		group: "启动与更新",
		label: "检查更新",
		description: "启动时检查 omp 更新",
	},
});

export const cfgUpdateChannel = register({
	id: "update.channel",
	type: "enum",
	values: ["stable", "canary"] as const,
	default: "stable",
	ui: {
		tab: "interaction",
		group: "启动与更新",
		label: "更新通道",
		description: "omp update 与启动时更新检查所用的通道",
		options: [
			{ value: "stable", label: "稳定版" },
			{ value: "canary", label: "Canary 预览版" },
		],
	},
});

export const cfgMarketplaceAutoUpdate = register({
	id: "marketplace.autoUpdate",
	type: "enum",
	values: ["off", "notify", "auto"] as const,
	default: "notify",
	ui: {
		tab: "interaction",
		group: "启动与更新",
		label: "插件市场自动更新",
		description: "启动时检查插件更新",
		options: [
			{ value: "off", label: "关闭", description: "不检查插件更新" },
			{ value: "notify", label: "通知", description: "启动时检查,有更新时通知" },
			{ value: "auto", label: "自动", description: "启动时检查并自动安装更新" },
		],
	},
});

export const cfgStartupChangelogMode = register({
	id: "startup.changelogMode",
	type: "enum",
	values: ["summary", "expanded", "hidden"] as const,
	default: "summary",
	ui: {
		tab: "interaction",
		group: "启动与更新",
		label: "启动更新日志",
		description: "选择更新说明以摘要、完整详情开始,还是保持隐藏",
		options: [
			{
				value: "summary",
				label: "摘要",
				description: "显示发布和更改数量,并附带 /changelog 提示",
			},
			{
				value: "expanded",
				label: "展开",
				description: "完整显示最近的发布说明",
			},
			{
				value: "hidden",
				label: "隐藏",
				description: "启动时不显示发布说明",
			},
		],
	},
});

export const cfgMagicKeywordsEnabled = register({
	id: "magicKeywords.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "interaction",
		group: "魔法关键词",
		label: "魔法关键词",
		description: `为独立的 ${MAGIC_KEYWORDS.map(keyword => keyword.word).join(", ")} 关键词启用隐藏提示`,
	},
});

/** One `magicKeywords.<id>` toggle per registered keyword, keyed by keyword id. */
export const cfgMagicKeyword = Object.fromEntries(
	MAGIC_KEYWORDS.map(keyword => [
		keyword.id,
		register({
			id: `magicKeywords.${keyword.id}`,
			type: "boolean",
			default: true,
			ui: { tab: "interaction", group: "魔法关键词", label: keyword.label, description: keyword.description },
		}),
	]),
) as Record<MagicKeywordId, Setting<boolean>>;

// Notifications
export const cfgCompletionNotify = register({
	id: "completion.notify",
	type: "enum",
	values: ["on", "off"] as const,
	default: "on",
	ui: {
		tab: "interaction",
		group: "通知",
		label: "完成通知",
		description: "代理完成一轮时通知",
	},
});

export const cfgErrorNotify = register({
	id: "error.notify",
	type: "enum",
	values: ["on", "off"] as const,
	default: "off",
	ui: {
		tab: "interaction",
		group: "通知",
		label: "错误通知",
		description: "代理因错误停止时通知",
	},
});

export const cfgAskTimeout = register({
	id: "ask.timeout",
	type: "number",
	default: 0,
	ui: {
		tab: "interaction",
		group: "通知",
		label: "询问超时",
		description:
			"在此秒数后自动选择推荐的询问选项（0 表示禁用）。同时约束 cfg:// 审批提示；未答复的审批将拒绝写入，而不是自动选择",
		options: [
			{ value: "0", label: "已禁用" },
			{ value: "15", label: "15 秒" },
			{ value: "30", label: "30 秒" },
			{ value: "60", label: "60 秒" },
			{ value: "120", label: "120 秒" },
		],
	},
});

/**
 * `ask.timeout` in the milliseconds dialogs consume, or `undefined` for no
 * deadline. Shared by the ask tool and the `cfg://` approval prompt so the
 * setting means the same thing everywhere it is honored.
 */
export function askTimeoutMs(settings: Settings): number | undefined {
	const timeoutSeconds = cfgAskTimeout.get(settings);
	return timeoutSeconds === 0 ? undefined : timeoutSeconds * 1000;
}

export const cfgAskNotify = register({
	id: "ask.notify",
	type: "enum",
	values: ["on", "off"] as const,
	default: "on",
	ui: {
		tab: "interaction",
		group: "通知",
		label: "询问通知",
		description: "ask 工具等待输入时通知",
	},
});

export const cfgRecapEnabled = register({
	id: "recap.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "interaction",
		group: "通知",
		label: "空闲回顾",
		description: "终端空闲一段时间后,生成一份简短的 LLM 回顾,说明当前进展",
	},
});

export const cfgRecapIdleSeconds = register({
	id: "recap.idleSeconds",
	type: "number",
	default: 240,
	ui: {
		tab: "interaction",
		group: "通知",
		label: "空闲回顾延迟",
		description: "空闲后等待多少秒再显示回顾",
		options: [
			{ value: "60", label: "1 分钟" },
			{ value: "120", label: "2 分钟" },
			{ value: "240", label: "4 分钟" },
			{ value: "300", label: "5 分钟" },
			{ value: "600", label: "10 分钟" },
		],
	},
});

/** Idle recap policy (`recap.*`). */
export const cfgRecap = combine({ enabled: cfgRecapEnabled, idleSeconds: cfgRecapIdleSeconds });
