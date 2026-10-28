import { combine, register } from "../config/registry";
import { cfgAutolearnEnabled } from "../autolearn/settings";
import { cfgBashEnabled } from "../exec/settings";
import { cfgCompactionExperimentalContextManagement } from "../session/context-settings";
import { cfgEvalJs, cfgEvalPy } from "../eval/settings";
import { cfgIdaAvailable } from "../ida/install";
import { cfgLspEnabled } from "../lsp/settings";
import { cfgTaskMaxRecursionDepth } from "../task/settings";

const EMPTY_STRING_ARRAY: string[] = [];

export const cfgToolsArtifactSpillThreshold = register({
	id: "tools.artifactSpillThreshold",
	type: "number",
	default: 50,
	ui: {
		tab: "tools",
		group: "Output Limits",
		label: "Artifact 溢出阈值 (KB)",
		description: "超过此大小的工具输出保存为 artifact;尾部保留在内联",
		options: [
			{ value: "1", label: "1 千字节", description: "约 250 tokens" },
			{ value: "2.5", label: "2.5 千字节", description: "约 625 tokens" },
			{ value: "5", label: "5 千字节", description: "约 1.25K tokens" },
			{ value: "10", label: "10 千字节", description: "约 2.5K tokens" },
			{ value: "20", label: "20 千字节（KB）", description: "约 5K tokens" },
			{ value: "30", label: "30 千字节（KB）", description: "约 7.5K tokens" },
			{ value: "50", label: "50 千字节", description: "默认;约 12.5K tokens" },
			{ value: "75", label: "75 千字节", description: "约 19K tokens" },
			{ value: "100", label: "100 千字节", description: "约 25K tokens" },
			{ value: "200", label: "200 千字节", description: "约 50K tokens" },
			{ value: "500", label: "500 千字节", description: "约 125K tokens" },
			{ value: "1000", label: "1 兆字节", description: "约 250K tokens" },
		],
	},
});

export const cfgToolsArtifactTailBytes = register({
	id: "tools.artifactTailBytes",
	type: "number",
	default: 20,
	ui: {
		tab: "tools",
		group: "Output Limits",
		label: "Artifact 尾部大小 (KB)",
		description: "输出溢出到 artifact 时保留在内联的尾部内容量",
		options: [
			{ value: "1", label: "1 千字节", description: "约 250 tokens" },
			{ value: "2.5", label: "2.5 千字节", description: "约 625 tokens" },
			{ value: "5", label: "5 千字节", description: "约 1.25K tokens" },
			{ value: "10", label: "10 千字节", description: "约 2.5K tokens" },
			{ value: "20", label: "20 千字节（KB）", description: "默认;约 5K tokens" },
			{ value: "50", label: "50 千字节", description: "约 12.5K tokens" },
			{ value: "100", label: "100 千字节", description: "约 25K tokens" },
			{ value: "200", label: "200 千字节", description: "约 50K tokens" },
		],
	},
});

export const cfgToolsArtifactHeadBytes = register({
	id: "tools.artifactHeadBytes",
	type: "number",
	default: 20,
	ui: {
		tab: "tools",
		group: "Output Limits",
		label: "Artifact 头部大小 (KB)",
		description:
			"输出溢出到 artifact 时,与尾部一起保留在内联的头部内容量(中间省略)。0 表示禁用——只保留尾部。",
		options: [
			{ value: "0", label: "0 千字节", description: "已禁用;仅截断尾部" },
			{ value: "1", label: "1 千字节", description: "约 250 tokens" },
			{ value: "2.5", label: "2.5 千字节", description: "约 625 tokens" },
			{ value: "5", label: "5 千字节", description: "约 1.25K tokens" },
			{ value: "10", label: "10 千字节", description: "约 2.5K tokens" },
			{ value: "20", label: "20 千字节（KB）", description: "默认;约 5K tokens" },
			{ value: "50", label: "50 千字节", description: "约 12.5K tokens" },
			{ value: "100", label: "100 千字节", description: "约 25K tokens" },
			{ value: "200", label: "200 千字节", description: "约 50K tokens" },
		],
	},
});

export const cfgToolsOutputMaxColumns = register({
	id: "tools.outputMaxColumns",
	type: "number",
	default: 768,
	ui: {
		tab: "tools",
		group: "Output Limits",
		label: "输出列数上限",
		description:
			"流式工具输出(bash、python、js eval)和 `read` 的每行字节上限。超过此宽度的行以省略号截断;到下一个换行符为止的剩余字节被丢弃。0 表示禁用。",
		options: [
			{ value: "0", label: "关闭", description: "无每行上限" },
			{ value: "256", label: "256", description: "紧凑" },
			{ value: "512", label: "512" },
			{ value: "768", label: "768", description: "默认" },
			{ value: "1024", label: "1024" },
			{ value: "2048", label: "2048" },
			{ value: "4096", label: "4096", description: "宽松" },
		],
	},
});

export const cfgToolsArtifactTailLines = register({
	id: "tools.artifactTailLines",
	type: "number",
	default: 500,
	ui: {
		tab: "tools",
		group: "Output Limits",
		label: "Artifact 尾部行数",
		description: "输出溢出到 artifact 时保留在内联的尾部内容最大行数",
		options: [
			{ value: "50", label: "50 行", description: "约 250 tokens" },
			{ value: "100", label: "100 行", description: "约 500 tokens" },
			{ value: "250", label: "250 行", description: "约 1.25K tokens" },
			{ value: "500", label: "500 行", description: "默认;约 2.5K tokens" },
			{ value: "1000", label: "1000 行", description: "约 5K tokens" },
			{ value: "2000", label: "2000 行", description: "约 10K tokens" },
			{ value: "5000", label: "5000 行", description: "约 25K tokens" },
		],
	},
});

export const cfgToolsArtifactMaxBytes = register({
	id: "tools.artifactMaxBytes",
	type: "number",
	default: 16,
	ui: {
		tab: "tools",
		group: "Output Limits",
		label: "工件文件上限 (MB)",
		description:
			"为流式工具输出（bash、python、js eval）保存的工件文件的最大大小。较大的输出会保留其开头部分（最多 3 MB）及其最新的剩余部分，并在两者之间显示截断提示。0 = 无限制。",
		options: [
			{ value: "0", label: "无限制", description: "保存完整输出" },
			{ value: "4", label: "4 兆字节" },
			{ value: "16", label: "16 兆字节", description: "默认" },
			{ value: "64", label: "64 兆字节" },
			{ value: "256", label: "256 MB（兆字节）" },
			{ value: "1024", label: "1 千兆字节" },
		],
	},
});

export const cfgReadLineNumbers = register({
	id: "readLineNumbers",
	type: "boolean",
	default: false,
	ui: {
		tab: "files",
		group: "Reading",
		label: "行号",
		description: "默认在 read 工具输出前加上行号",
	},
});

export const cfgReadDefaultLimit = register({
	id: "read.defaultLimit",
	type: "number",
	default: 300,
	ui: {
		tab: "files",
		group: "Reading",
		label: "默认读取行数上限",
		description: "代理不带限制调用 read 时返回的默认行数",
		options: [
			{ value: "200", label: "200 行" },
			{ value: "300", label: "300 行" },
			{ value: "500", label: "500 行" },
			{ value: "1000", label: "1000 行" },
			{ value: "5000", label: "5000 行" },
		],
	},
});

export const cfgReadRenderMarkdown = register({
	id: "read.renderMarkdown",
	type: "boolean",
	default: false,
	ui: {
		tab: "files",
		group: "Reading",
		label: "Markdown 预览",
		description: "将 Markdown 读取结果渲染为格式化终端 Markdown 预览,而不是原始源码",
	},
});

export const cfgReadSummarizeEnabled = register({
	id: "read.summarize.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "files",
		group: "Read Summaries",
		label: "读取摘要",
		description: "当 read 未带显式选择器调用时,返回结构化代码摘要",
	},
});

export const cfgReadSummarizeProse = register({
	id: "read.summarize.prose",
	type: "boolean",
	default: false,
	ui: {
		tab: "files",
		group: "Read Summaries",
		label: "正文摘要",
		description: "为 Markdown 和纯文本读取返回结构化摘要",
	},
});

export const cfgReadSummarizeMinBodyLines = register({
	id: "read.summarize.minBodyLines",
	type: "number",
	default: 4,
	ui: {
		tab: "files",
		group: "Read Summaries",
		label: "读取摘要正文行数",
		description: "read 摘要折叠多行正文或字面量之前的最小长度",
	},
});

export const cfgReadSummarizeMinCommentLines = register({
	id: "read.summarize.minCommentLines",
	type: "number",
	default: 6,
	ui: {
		tab: "files",
		group: "Read Summaries",
		label: "读取摘要注释行数",
		description: "read 摘要折叠多行块注释之前的最小长度",
	},
});

export const cfgReadSummarizeMinTotalLines = register({
	id: "read.summarize.minTotalLines",
	type: "number",
	default: 100,
	ui: {
		tab: "files",
		group: "Read Summaries",
		label: "读取摘要最小文件长度",
		description: "总行数更少的文件按原样读取,而不是结构化摘要",
	},
});

export const cfgReadSummarizeUnfoldUntil = register({
	id: "read.summarize.unfoldUntil",
	type: "number",
	default: 50,
	ui: {
		tab: "files",
		group: "Read Summaries",
		label: "读取摘要展开目标",
		description:
			"BFS 展开可省略片段,直到摘要至少达到这么多可见行。0 仅保留最外层的省略。",
	},
});

export const cfgReadSummarizeUnfoldLimit = register({
	id: "read.summarize.unfoldLimit",
	type: "number",
	default: 100,
	ui: {
		tab: "files",
		group: "Read Summaries",
		label: "读取摘要展开上限",
		description:
			"BFS 展开时摘要大小的硬上限。展开后超过此值的片段会被跳过(该片段保持折叠),继续展开其余片段。",
	},
});

export const cfgReadToolResultPreview = register({
	id: "read.toolResultPreview",
	type: "boolean",
	default: false,
	ui: {
		tab: "files",
		group: "Reading",
		label: "内联读取预览",
		description: "在记录中内联渲染 read 工具结果,而不是摘要行",
	},
});

// ────────────────────────────────────────────────────────────────────────
// Tools
// ────────────────────────────────────────────────────────────────────────

// Tool approval policies
export const cfgToolsApproval = register({
	id: "tools.approval",
	type: "record",
	default: {},
	ui: {
		tab: "interaction",
		group: "Approvals",
		label: "工具审批策略",
		description:
			"按工具设置的审批策略。设为 'allow' 自动批准,'prompt' 要求确认,或 'deny' 阻止。覆盖在每种审批模式下都生效。",
	},
});

// Default tool approval mode (interaction tab, but governs the tool wrapper).
//   "always-ask"        — auto-approves read-tier tools only; prompts for write/exec.
//   "always-ask-cached" — like always-ask, but file reads and writes can be approved
//                         for a file or folder, this session or across sessions.
//   "write"             — auto-approves read and write-tier tools; prompts for exec.
//   "yolo"              — auto-approves every tier.
export const cfgToolsApprovalMode = register({
	id: "tools.approvalMode",
	type: "enum",
	values: ["always-ask", "always-ask-cached", "write", "yolo"] as const,
	default: "yolo",
	ui: {
		tab: "interaction",
		group: "Approvals",
		label: "工具审批",
		description:
			"工具调用的默认审批行为。“始终询问”仅自动批准只读工具。“询问并记住”还会在读取文件前询问，并可记住文件或文件夹。“写入”自动批准读取和工作区写入工具。“Yolo”自动批准所有层级；用户策略仍可能提示或阻止。",
		options: [
			{
				value: "always-ask",
				label: "总是询问",
				description: "自动批准只读工具;写入和执行工具需要确认。",
			},
			{
				value: "always-ask-cached",
				label: "询问并记住",
				description:
					"在读取或写入文件前询问；回答可记住该文件或其文件夹，适用于本次会话或每次会话；执行工具需要确认。",
			},
			{
				value: "write",
				label: "写入",
				description:
					"自动批准只读和写入工具;bash、eval、browser、task 等执行工具需要确认。",
			},
			{
				value: "yolo",
				label: "Yolo 模式",
				description:
					"自动批准读取、写入和执行工具。用户策略仍可要求确认或阻止调用。",
			},
		],
	},
});

// Folders where every action asks, in every approval mode and whatever was remembered.
export const cfgToolsRestrictedFolders = register({
	id: "tools.restrictedFolders",
	type: "array",
	default: EMPTY_STRING_ARRAY,
	ui: {
		tab: "interaction",
		group: "Approvals",
		label: "受限文件夹",
		editor: "json",
		description:
			"在这些文件夹中，每次读取、写入、编辑、搜索或命令都需要显式审批，无论审批模式或已记住的授权如何。该文件夹及其下所有内容均受限；命令按运行所在目录匹配。一个 JSON 路径列表，e.g。[\"~/secrets\"]。",
		condition: "restrictedFoldersNotProject",
	},
	validate: raw => {
		if (raw === undefined) return;
		if (!Array.isArray(raw) || raw.some(entry => typeof entry !== "string" || entry.trim().length === 0)) {
			throw new Error("tools.restrictedFolders must be a list of folder paths");
		}
	},
});

// Todo tool
// Todo settings deliberately have no `protocolDefault`: protocol embedders need project-level opt-outs
// for reminder/prelude prompt injection.
export const cfgTodoEnabled = register({
	id: "todo.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "待办",
		description: "启用 todo 工具进行任务跟踪",
	},
});

export const cfgTodoReminders = register({
	id: "todo.reminders",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Todos",
		label: "待办提醒",
		description: "提醒代理在停止前完成待办",
	},
});

export const cfgTodoRemindersMax = register({
	id: "todo.remindersMax",
	type: "number",
	default: 3,
	ui: {
		tab: "tools",
		group: "Todos",
		label: "待办提醒上限",
		description: "放弃前的最多待办提醒次数",
		options: [
			{ value: "1", label: "1 次提醒" },
			{ value: "2", label: "2 次提醒" },
			{ value: "3", label: "3 次提醒" },
			{ value: "5", label: "5 次提醒" },
		],
	},
});

export const cfgTodoEager = register({
	id: "todo.eager",
	type: "enum",
	values: ["default", "preferred", "always"] as const,
	default: "default",
	ui: {
		tab: "tools",
		group: "Todos",
		label: "自动创建待办",
		description: "第一条消息后自动创建待办列表的推动力度",
		options: [
			{ value: "default", label: "默认", description: "由模型决定;不自动创建待办列表" },
			{
				value: "preferred",
				label: "偏好",
				description: "在第一条消息时建议待办列表(提醒,而非强制)",
			},
			{ value: "always", label: "总是", description: "在第一条消息时强制创建完整待办列表" },
		],
	},
});

export const cfgTasksTodoClearDelay = register({
	id: "tasks.todoClearDelay",
	type: "number",
	default: 60,
	ui: {
		tab: "tools",
		group: "Todos",
		label: "待办自动清除延迟",
		description: "已完成或放弃的待办从待办组件移除前的延迟",
		options: [
			{ value: "0", label: "立即" },
			{ value: "60", label: "1 分钟", description: "默认" },
			{ value: "300", label: "5 分钟" },
			{ value: "900", label: "15 分钟" },
			{ value: "1800", label: "30 分钟" },
			{ value: "3600", label: "1 小时" },
			{ value: "-1", label: "从不" },
		],
	},
});

// Grep, glob, and AST tools
export const cfgGlobEnabled = register({
	id: "glob.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "查找",
		description: "启用 glob 工具进行基于 glob 的文件查找",
	},
});

export const cfgGrepEnabled = register({
	id: "grep.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "搜索",
		description: "启用 grep 工具进行正则内容搜索",
	},
});

export const cfgGrepContextBefore = register({
	id: "grep.contextBefore",
	type: "number",
	default: 1,
	ui: {
		tab: "tools",
		group: "Grep & Browser",
		label: "Grep 前上下文行数",
		description: "每个 grep 匹配之前的上下文行数",
		options: [
			{ value: "0", label: "0 行" },
			{ value: "1", label: "1 行" },
			{ value: "2", label: "2 行" },
			{ value: "3", label: "3 行" },
			{ value: "5", label: "5 行" },
		],
	},
});

export const cfgGrepContextAfter = register({
	id: "grep.contextAfter",
	type: "number",
	default: 3,
	ui: {
		tab: "tools",
		group: "Grep & Browser",
		label: "Grep 后上下文行数",
		description: "每个 grep 匹配之后的上下文行数",
		options: [
			{ value: "0", label: "0 行" },
			{ value: "1", label: "1 行" },
			{ value: "2", label: "2 行" },
			{ value: "3", label: "3 行" },
			{ value: "5", label: "5 行" },
			{ value: "10", label: "10 行" },
		],
	},
});

export const cfgAstGrepEnabled = register({
	id: "astGrep.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "AST 搜索",
		description: "启用 ast_grep 工具进行结构化 AST 搜索",
	},
});

export const cfgAstEditEnabled = register({
	id: "astEdit.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "AST 编辑",
		description: "启用 ast_edit 工具进行结构化 AST 重写",
	},
});

export const cfgFindEnabled = register({
	id: "find.enabled",
	type: "enum",
	values: ["auto", "on", "off"] as const,
	default: "auto",
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "检索(语义 grep)",
		description:
			"启用查找工具：对文件和行范围进行自然语言搜索，由 judge 模型角色判定。仅当 judge 角色解析为原生 TypeSafe jev 模型时自动启用。",
		options: [
			{
				value: "auto",
				label: "自动",
				description: "当 judge 角色解析为原生 TypeSafe jev 模型时启用",
			},
			{ value: "on", label: "开启", description: "始终启用，无论 judge 角色解析为哪个模型" },
			{ value: "off", label: "关闭", description: "禁用查找工具" },
		],
	},
});

// Optional tools

export const cfgDebugEnabled = register({
	id: "debug.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "调试",
		description: "启用 debug 工具进行基于 DAP 的调试",
	},
});

export const cfgLaunchEnabled = register({
	id: "launch.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "服务",
		description: "启用命名的 bash 服务和 proc:// 监督，用于共享的长时间运行的项目进程",
	},
});

export const cfgSpeechgenEnabled = register({
	id: "speechgen.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "语音生成",
		description: "启用 tts 工具进行设备端 (Kokoro) 或 xAI Grok Voice 语音文件合成",
	},
});

export const cfgGenerateImageEnabled = register({
	id: "generate_image.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "生成图片",
		description:
			"启用 generate_image 工具(文生图生成和编辑)。当 tools.xdev 开启时作为 xd:// 设备暴露。",
	},
});

export const cfgComputerEnabled = register({
	id: "computer.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "计算机",
		description: "启用可脚本化的桌面 eval 前奏（截图、输入、无障碍）",
	},
});

export const cfgRatchetEnabled = register({
	id: "ratchet.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "Ratchet（棘轮）",
		description: "启用 ratchet eval/hillclimb 前置引导；/ratchet 会为当前会话将其开启。",
	},
});

export const cfgArchiveEnabled = register({
	id: "archive.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "归档",
		description:
			"启用只读归档评估前置引导：提示历史、最近项目、过往会话和摘要",
	},
});

export const cfgComputerDisplay = register({
	id: "computer.display",
	type: "string",
	default: "active",
	ui: {
		tab: "tools",
		group: "Computer",
		label: "计算机显示器",
		description: "活动窗口所在的显示器（active）、所有显示器（all）或原生显示器 ID",
	},
});

export const cfgComputerMaxWidth = register({
	id: "computer.maxWidth",
	type: "number",
	default: 3840,
	ui: {
		tab: "tools",
		group: "Computer",
		label: "计算机截图宽度",
		description: "截图最大宽度（像素）",
	},
});

export const cfgComputerMaxHeight = register({
	id: "computer.maxHeight",
	type: "number",
	default: 2400,
	ui: {
		tab: "tools",
		group: "Computer",
		label: "计算机截图高度",
		description: "截图最大高度（像素）",
	},
});

export const cfgComputerBackgroundFallback = register({
	id: "computer.backgroundFallback",
	type: "enum",
	values: ["takeover", "refuse"] as const,
	default: "takeover",
	ui: {
		tab: "tools",
		group: "Computer",
		label: "计算机后台回退",
		description:
			"窗口输入在其后台路由不可用时的行为：以接管方式重新运行并将焦点返回给你的应用（macOS；其他平台为普通接管），或拒绝；拒绝还会阻止智能体自行夺取前台或自行打开 macOS 菜单。",
		options: [
			{
				value: "takeover",
				label: "接管",
				description:
					"短暂将目标前置以完成该次调用，然后将焦点返回给你的应用（在 macOS 上，即使你一直在输入）。",
			},
			{
				value: "refuse",
				label: "拒绝",
				description:
					"使调用失败；不会有任何对象接管，并且智能体自身的接管、置前、激活打开操作、桌面输入和 macOS 菜单（上下文菜单、弹出菜单和菜单按钮；它们在打开时会占用你的键盘）也会被拒绝。",
			},
		],
	},
});

export const cfgImagesQuestionTimeoutMs = register({
	id: "images.questionTimeoutMs",
	type: "number",
	default: 300_000,
	ui: {
		tab: "tools",
		group: "Execution",
		label: "图片提问超时",
		description:
			"read 的 ?q= 图像问题所对应的视觉模型调用的单次请求超时时间（毫秒）。如果提供商停滞，则会快速失败并返回超时错误，而不是一直阻塞到手动中止。设为 0 可禁用超时。",
		options: [
			{ value: "0", label: "已禁用" },
			{ value: "60000", label: "1 分钟" },
			{ value: "120000", label: "2 分钟" },
			{ value: "180000", label: "3 分钟" },
			{ value: "300000", label: "5 分钟" },
		],
	},
});

export const cfgCheckpointEnabled = register({
	id: "checkpoint.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "Checkpoint/Rewind",
		description: "启用 checkpoint 和 rewind 工具进行上下文检查点",
	},
});

// Fetching and browser
export const cfgFetchEnabled = register({
	id: "fetch.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "读取网址",
		description: "允许读取工具获取并处理网址内容",
	},
});

export const cfgVaultEnabled = register({
	id: "vault.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "Obsidian 库",
		description:
			"启用 vault:// 内部 URL,通过 Obsidian CLI 读取和编辑 Obsidian vault 内容。禁用后,vault:// 解析被拒绝,并且系统提示中省略 vault:// 条目。",
	},
});

export const cfgGithubEnabled = register({
	id: "github.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "GitHub CLI 命令行工具",
		description:
			"启用 github 工具(基于 op 的派发,用于仓库、issue、pull request、diff、搜索、checkout、push 和 Actions watch 工作流)",
	},
});

export const cfgGithubCacheEnabled = register({
	id: "github.cache.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "GitHub",
		label: "GitHub 视图缓存",
		description: "将已渲染的议题／合并请求视图输出缓存到 ~/.omp/cache/github-cache.db，重复读取无需额外开销",
	},
});

export const cfgGithubCacheSoftTtlSec = register({
	id: "github.cache.softTtlSec",
	type: "number",
	default: 300,
	ui: {
		tab: "tools",
		group: "GitHub",
		label: "GitHub 缓存软 TTL",
		description: "在此时间窗口内，直接返回缓存的议题／合并请求视图行（单位为秒，默认 5 分钟）",
	},
});

export const cfgGithubCacheHardTtlSec = register({
	id: "github.cache.hardTtlSec",
	type: "number",
	default: 604800,
	ui: {
		tab: "tools",
		group: "GitHub",
		label: "GitHub 缓存硬 TTL",
		description:
			"超过软 TTL 后,返回缓存行并在后台刷新;超过硬 TTL 后丢弃(秒;默认 7 天)",
	},
});

export const cfgWebSearchEnabled = register({
	id: "web_search.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "Web 搜索",
		description: "启用 web_search 工具获取实时网页结果",
	},
});

export const cfgSecurityEnabled = register({
	id: "security.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "安全",
		description:
			"启用 OMP 原生安全扫描规划、执行,以及只读的 security:// 资源命名空间",
	},
});

export const cfgAskEnabled = register({
	id: "ask.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Available Tools",
		label: "询问",
		description: "启用 ask 工具进行交互式用户提问",
	},
});

// Tool execution
export const cfgToolsIntentTracing = register({
	id: "tools.intentTracing",
	type: "boolean",
	default: true,
	env: "PI_INTENT_TRACING",
	ui: {
		tab: "tools",
		group: "Execution",
		label: "意图跟踪",
		description: "要求代理在执行每个工具调用前描述其意图",
	},
});

export const cfgToolsAbortOnFabricatedResult = register({
	id: "tools.abortOnFabricatedResult",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Execution",
		label: "伪造工具结果时中止",
		description:
			"使用带内工具调用时,当模型在一轮中途开始幻觉工具结果时立即停止。禁用则让模型完成生成,然后丢弃伪造的延续内容。",
	},
});

export const cfgToolsSpeculativeExecutionEnabled = register({
	id: "tools.speculativeExecution.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "tools",
		group: "Execution",
		label: "实验性推测执行",
		description:
			"启用可安全丢弃的首批能力：通过直接 read 调用与嵌套 eval 执行经过校验的本地读取。网络请求、提供商补全与实时文件系统写入不在本基线范围内。",
	},
});

export const cfgToolsSpeculativeExecutionMaxInFlight = register({
	id: "tools.speculativeExecution.maxInFlight",
	type: "number",
	default: 2,
	ui: {
		tab: "tools",
		group: "Execution",
		label: "推测执行并发数",
		description: "转入正常派发前允许运行的最大已校验本地读取数。",
		options: [
			{ value: "1", label: "1 个操作" },
			{ value: "2", label: "2 个操作" },
			{ value: "3", label: "3 个操作" },
			{ value: "4", label: "4 个操作" },
		],
	},
});

export const cfgToolsMaxTimeout = register({
	id: "tools.maxTimeout",
	type: "number",
	default: 0,
	ui: {
		tab: "tools",
		group: "Execution",
		label: "最大工具超时",
		description: "代理可为任何工具设置的最大超时(秒)(0 = 无限制)",
		options: [
			{ value: "0", label: "无限制" },
			{ value: "30", label: "30 秒" },
			{ value: "60", label: "60 秒" },
			{ value: "120", label: "120 秒" },
			{ value: "300", label: "5 分钟" },
			{ value: "600", label: "10 分钟" },
		],
	},
});

// Async jobs. RPC hosts start from the neutral background-job defaults (`protocolDefault`), as do the
// bash/eval auto-background settings.
export const cfgAsyncEnabled = register({
	id: "async.enabled",
	protocolDefault: ["rpc"],
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Execution",
		label: "异步执行",
		description: "启用异步 bash 命令和后台任务执行",
	},
});

export const cfgAsyncMaxJobs = register({
	id: "async.maxJobs",
	protocolDefault: ["rpc"],
	type: "number",
	default: 100,
});

// Print mode is single-shot by default: it disposes after the last prompt, cancelling the
// run's background jobs. Opting in keeps `-p` alive so each job's async-result wakes the same
// session, as the TUI does, before exiting (issue #10363).
export const cfgAsyncPrintWake = register({
	id: "async.printWake",
	type: "boolean",
	default: false,
	ui: {
		tab: "tools",
		group: "Execution",
		label: "作业结果唤醒打印模式",
		description:
			"在打印模式（-p、--mode json）下，当本次运行的后台作业处于活动状态时，在最后一个提示之后继续运行，并针对每个作业的结果在同一会话中启动新一轮；一旦没有待处理的作业或结果，便退出。关闭：打印模式会在其提示之后退出并取消正在运行的作业",
	},
});

export const cfgAsyncWidgets = register({
	id: "async.widgets",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Execution",
		label: "实时作业小部件",
		description:
			"在等待卡片、作业胶囊和作业面板中，为每个正在运行的后台作业绘制实时小部件（根据其输出生成的图表、条形图、状态网格）。`widget` 模型角色（默认：`smol`）为每个作业编写一个规格；更新不需要进一步的模型调用",
	},
});

export const cfgToolsXdev = register({
	id: "tools.xdev",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Discovery & MCP",
		label: "xd:// Tools",
		description:
			"将不常用但可发现的工具挂载到通过 read/write 驱动的 xd:// 设备地址下，避免每次请求都发送它们的结构定义。工具列表明确允许 read 但未允许 write 的会话会使用专用于设备的写入通道挂载设备（除设备外，仅 local:// 临时目录可写）。关闭后，所有已启用工具均在顶层提供。",
	},
});

export const cfgToolsXdevDocs = register({
	id: "tools.xdevDocs",
	type: "enum",
	values: ["inline", "builtins", "catalog"] as const,
	default: "catalog",
	ui: {
		tab: "tools",
		group: "Discovery & MCP",
		label: "xd:// Prompt Docs",
		description:
			"选择哪些已挂载设备的文档和 schema 内联到系统提示中。Built-ins 将核心工具保持内联,而 MCP 和扩展工具保持按需加载。",
		options: [
			{ value: "inline", label: "所有设备", description: "为每个已挂载设备内联文档和 schema。" },
			{
				value: "builtins",
				label: "仅内置",
				description: "内联内置文档;按需获取 MCP 和扩展文档。",
			},
			{ value: "catalog", label: "仅目录", description: "列出所有设备;按需获取所有文档。" },
		],
	},
});

export const cfgToolsXdevInlineDevices = register({
	id: "tools.xdevInlineDevices",
	type: "array",
	default: EMPTY_STRING_ARRAY,
	ui: {
		tab: "tools",
		group: "Discovery & MCP",
		label: "xd:// Inline Devices",
		description:
			"当 xd:// 提示文档为仅内置时,内联名称匹配这些 glob 模式的动态设备(例如 mcp__context_mode_*)。仅目录模式忽略此设置。",
	},
});

export const cfgToolsXdevNotices = register({
	id: "tools.xdevNotices",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Discovery & MCP",
		label: "xd:// Mount Notices",
		description:
			"显示 `xd://: mounted …` 通知，当 MCP 或扩展工具被挂载或卸载时。模型仍会在下一次提示时得知该变化。",
	},
});

export const cfgDevAutoqa = register({
	id: "dev.autoqa",
	type: "boolean",
	default: true,
	env: "PI_AUTO_QA",
	ui: {
		tab: "tools",
		group: "Developer",
		label: "自动 QA",
		description:
			"自动化工具问题上报 (xd://report_issue)。默认开启;首次上报会征求同意,拒绝后会禁用上报,直到显式重新启用",
	},
});

export const cfgDevAutoqaPushEndpoint = register({
	id: "dev.autoqaPush.endpoint",
	type: "string",
	default: "https://qa.omp.sh/v1/grievances" as const,
	ui: {
		tab: "tools",
		group: "Developer",
		label: "自动 QA 推送端点",
		description: "接收自动 QA JSON 上报的完整 URL(默认 https://qa.omp.sh/v1/grievances)",
	},
});

export const cfgDevAutoqaPushToken = register({
	id: "dev.autoqaPush.token",
	type: "string",
	default: undefined,
	credential: true,
});

/**
 * User decision on sharing automatic `report_tool_issue` grievances.
 *
 *   - `"unset"`  — never asked; the first `report_tool_issue` invocation
 *                  pops a consent dialog and persists the answer here.
 *   - `"granted"` — record and (when push is configured) ship grievances.
 *   - `"denied"`  — silently no-op every `report_tool_issue` call.
 *
 * Owned by `packages/coding-agent/src/tools/report-tool-issue.ts` via the
 * process-global consent handler registered by `InteractiveMode`.
 *
 * @default "unset"
 */
export const cfgDevAutoqaConsent = register({
	id: "dev.autoqaConsent",
	type: "enum",
	values: ["unset", "granted", "denied"] as const,
	default: "unset" as const,
});

/** Settings read by `resolveBuiltinToolPlan` (`tools/index.ts`); a live session reconciles its built-ins when any changes. */
export const cfgBuiltinToolGates = combine({
	ask: cfgAskEnabled,
	astEdit: cfgAstEditEnabled,
	astGrep: cfgAstGrepEnabled,
	async: cfgAsyncEnabled,
	autolearn: cfgAutolearnEnabled,
	bash: cfgBashEnabled,
	checkpoint: cfgCheckpointEnabled,
	contextManagement: cfgCompactionExperimentalContextManagement,
	debug: cfgDebugEnabled,
	evalJs: cfgEvalJs,
	evalPy: cfgEvalPy,
	find: cfgFindEnabled,
	github: cfgGithubEnabled,
	glob: cfgGlobEnabled,
	grep: cfgGrepEnabled,
	ida: cfgIdaAvailable,
	launch: cfgLaunchEnabled,
	lsp: cfgLspEnabled,
	security: cfgSecurityEnabled,
	taskMaxRecursionDepth: cfgTaskMaxRecursionDepth,
	todo: cfgTodoEnabled,
	webSearch: cfgWebSearchEnabled,
});

/** Settings that add or remove the built-in tools they gate (`AgentSession.reconcileBuiltinTools`). */
export const cfgSessionToolGates = combine({
	builtins: cfgBuiltinToolGates,
	generateImage: cfgGenerateImageEnabled,
	speechgen: cfgSpeechgenEnabled,
	xdev: cfgToolsXdev,
});
