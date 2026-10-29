import { combine, effect, register, type SettingValueOf } from "../config/registry";
import {
	SERVICE_TIER_ANTHROPIC_OPTIONS,
	SERVICE_TIER_ANTHROPIC_VALUES,
	SERVICE_TIER_GOOGLE_OPTIONS,
	SERVICE_TIER_GOOGLE_VALUES,
	SERVICE_TIER_INHERIT_OPTIONS,
	SERVICE_TIER_INHERIT_SETTING_VALUES,
	SERVICE_TIER_OPENAI_OPTIONS,
	SERVICE_TIER_OPENAI_VALUES,
} from "../config/service-tier";
import {
	TINY_MODEL_DEVICE_DEFAULT,
	TINY_MODEL_DEVICE_SETTING_OPTIONS,
	TINY_MODEL_DEVICE_SETTING_VALUES,
} from "../tiny/device";
import {
	TINY_MODEL_DTYPE_DEFAULT,
	TINY_MODEL_DTYPE_SETTING_OPTIONS,
	TINY_MODEL_DTYPE_SETTING_VALUES,
} from "../tiny/dtype";
import { DEFAULT_WEB_SEARCH_TIMEOUT_SECONDS, MAX_WEB_SEARCH_TIMEOUT_SECONDS } from "../web/search/types";
import { DEFAULT_USAGE_RESERVE_PCT } from "@oh-my-pi/pi-ai/auth-storage";
import { configureProviderStoreResponses } from "@oh-my-pi/pi-ai/providers/openai-responses-state";
import { configureProviderMaxInFlightRequests } from "@oh-my-pi/pi-ai/stream";
import { THINKING_EFFORTS } from "@oh-my-pi/pi-catalog/effort";
import { formatKeyHint } from "@oh-my-pi/pi-tui/app-keybindings";
import { AUTO_THINKING, getConfiguredThinkingLevelMetadata, getThinkingLevelMetadata } from "@oh-my-pi/pi-tui/thinking";

const EMPTY_NUMBER_RECORD: Record<string, number> = {};
const EMPTY_STRING_ARRAYS_RECORD: Record<string, string[]> = {};
const DEFAULT_TOOL_CALL_LOOP_EXEMPT_TOOLS: string[] = ["wait"];

/** Scope of the resume picker's current-folder list. */
export const cfgSessionWorktreeScope = register({
	id: "session.worktreeScope",
	type: "enum",
	values: ["directory", "repo"] as const,
	default: "repo",
	ui: {
		tab: "interaction",
		group: "Startup & Updates",
		label: "恢复工作区范围",
		description:
			"选择恢复选择器的当前文件夹是否包含来自其他仓库工作区的会话",
		options: [
			{ value: "directory", label: "仅当前目录", description: "仅显示保存在此目录的会话" },
			{ value: "repo", label: "仓库工作区", description: "同时包含来自同级工作区的会话" },
		],
	},
});

// Power assertions: macOS IOKit, Linux login1/ScreenSaver, Windows execution state.
export const cfgPowerSleepPrevention = register({
	id: "power.sleepPrevention",
	type: "enum",
	values: ["off", "idle", "display", "system"] as const,
	default: "idle",
	ui: {
		tab: "interaction",
		group: "Power",
		label: "防休眠",
		description:
			"在代理执行回合期间阻止系统休眠;空闲的会话(包括正在等待后台任务的会话)不会阻止休眠。每个级别都是累加的——会包含所有更低级别的标志。",
		options: [
			{
				value: "off",
				label: "关闭",
				description: "不阻止任何休眠",
			},
			{
				value: "idle",
				label: "阻止空闲休眠",
				description: "智能体运行一轮时保持系统唤醒（macOS `caffeinate -i`）",
			},
			{
				value: "display",
				label: "阻止显示器休眠",
				description: "同时防止显示器空闲休眠（macOS `caffeinate -i -d`）",
			},
			{
				value: "system",
				label: "阻止系统休眠",
				description:
					"同时阻止接入电源时的所有系统睡眠，并将用户声明为活跃（macOS `caffeinate -i -d -s -u`）",
			},
		],
	},
});

export const cfgPrewalkEnabled = register({
	id: "prewalk.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "model",
		group: "Prewalk",
		label: "启用 Prewalk",
		description:
			"从活动模型开始，然后在计划提示的待办列表存在后的首次 edit/write 时切换到 fast/cheap 模型（默认 'smol' 角色）——强模型负责规划、提交待办事项并开始实现，然后交接。可在每个会话中用 --prewalk / --no-prewalk 覆盖。",
	},
});

export const cfgPrewalkFrom = register({
	id: "prewalk.from",
	type: "string",
	default: "@default",
	ui: {
		tab: "model",
		group: "Prewalk",
		label: "Prewalk 规划模型",
		description: "/prewalk restart 返回用于规划的模型或角色（默认 “@default”）。",
	},
});

export const cfgPrewalkInto = register({
	id: "prewalk.into",
	type: "string",
	default: "@smol",
	ui: {
		tab: "model",
		group: "Prewalk",
		label: "Prewalk 目标",
		description:
			"Prewalk 在首次edit/write时移交的模型或角色（默认 “@smol”）：/prewalk、/prewalk restart、“启用 Prewalk” 和 --prewalk。自动 Prewalk 使用其自身的目标。",
	},
});

export const cfgPrewalkAuto = register({
	id: "prewalk.auto",
	type: "enum",
	values: ["off", "suggest", "on"] as const,
	default: "off",
	ui: {
		tab: "model",
		group: "Prewalk",
		label: "自动 Prewalk",
		description:
			"通过 'judge' 角色解析的原生评判器询问每个新的顶层用户任务是否前置其困难推理。需要原生评判器；没有则不会进行任何分类。与启用 Prewalk 无关。",
		options: [
			{ value: "off", label: "关闭", description: "从不为 Prewalk 分类提示词" },
			{
				value: "suggest",
				label: "建议",
				description: "对每个任务进行分类并报告决策，但不启用 Prewalk",
			},
			{
				value: "on",
				label: "开启",
				description:
					"对于有把握属于前置推理的任务，启用从活动模型到自动目标的交接；下一个任务将重新从规划模型开始",
			},
		],
	},
});

export const cfgPrewalkAutoTarget = register({
	id: "prewalk.autoTarget",
	type: "string",
	default: "@smol",
	ui: {
		tab: "model",
		group: "Prewalk",
		label: "自动 Prewalk 目标",
		description: "在首次 edit/write. 时，自动 prewalk 会交接到的模型或角色（默认“@smol”）",
	},
});

function isLimitRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveLimit(limit: unknown): limit is number {
	return typeof limit === "number" && Number.isFinite(limit) && limit > 0;
}

/** Per-provider request limits floored to whole numbers ≥ 1; non-positive or non-numeric entries are dropped. */
export function normalizeProviderMaxInFlightRequests(value: unknown): Record<string, number> {
	const normalized: Record<string, number> = {};
	if (!isLimitRecord(value)) return normalized;
	for (const provider in value) {
		const limit = value[provider];
		if (isPositiveLimit(limit)) normalized[provider] = Math.max(1, Math.floor(limit));
	}
	return normalized;
}

/**
 * Per-provider request limits floored to whole numbers ≥ 1.
 *
 * @throws Error naming every provider whose limit is not a positive number.
 */
export function validateProviderMaxInFlightRequests(value: unknown): Record<string, number> {
	if (isLimitRecord(value)) {
		const invalidProviders: string[] = [];
		for (const provider in value) if (!isPositiveLimit(value[provider])) invalidProviders.push(provider);
		if (invalidProviders.length > 0) {
			throw new Error(`Provider request limits must be positive numbers: ${invalidProviders.join(", ")}`);
		}
	}
	return normalizeProviderMaxInFlightRequests(value);
}

export const cfgProvidersMaxInFlightRequests = register({
	id: "providers.maxInFlightRequests",
	type: "record",
	default: EMPTY_NUMBER_RECORD,
	validate: validateProviderMaxInFlightRequests,
	normalize: validateProviderMaxInFlightRequests,
	ui: {
		tab: "providers",
		group: "Services",
		label: "最大并发请求数",
		description:
			"每个 provider id(例如 “openai” 或 “anthropic”)的最大并发 LLM 请求数,在使用此配置根的本地 OMP 进程之间共享。未列出的提供商不受限制。",
	},
});
effect(cfgProvidersMaxInFlightRequests, limits =>
	configureProviderMaxInFlightRequests(normalizeProviderMaxInFlightRequests(limits)),
);

export const cfgImagesDescribeForTextModels = register({
	id: "images.describeForTextModels",
	type: "boolean",
	default: true,
	ui: {
		tab: "model",
		group: "Vision",
		label: "为文本模型描述图片",
		description:
			"当图片附加到不支持视觉的模型时,将其保存在 local:// 下,并注入来自支持视觉模型的描述,而不是丢弃它",
	},
});

// ────────────────────────────────────────────────────────────────────────
// Model
// ────────────────────────────────────────────────────────────────────────

// Reasoning and prompts
export const cfgDefaultThinkingLevel = register({
	id: "defaultThinkingLevel",
	type: "enum",
	values: [...THINKING_EFFORTS, AUTO_THINKING],
	default: "high",
	ui: {
		tab: "model",
		group: "Thinking",
		label: "思考级别",
		description: "支持思考的模型的推理深度",
		options: [getConfiguredThinkingLevelMetadata(AUTO_THINKING), ...THINKING_EFFORTS.map(getThinkingLevelMetadata)],
	},
});

export const cfgHideThinkingBlock = register({
	id: "hideThinkingBlock",
	type: "boolean",
	default: false,
	ui: {
		tab: "model",
		group: "Thinking",
		label: "隐藏思考块",
		description: "在助手回复中隐藏思考块",
	},
});

export const cfgExpandThinkingBlocks = register({
	id: "expandThinkingBlocks",
	type: "boolean",
	default: false,
	ui: {
		tab: "model",
		group: "Thinking",
		label: "展开思考块",
		description: "在轮次结束时保持已完成的思考块为展开状态，而不是将其折叠",
		condition: "nativeRendering",
	},
});

export const cfgProseOnlyThinking = register({
	id: "proseOnlyThinking",
	type: "boolean",
	default: true,
	ui: {
		tab: "model",
		group: "Thinking",
		label: "仅正文思考",
		description: "从思考摘要中省略代码块,并用省略号替换",
	},
});

export const cfgOmitThinking = register({
	id: "omitThinking",
	type: "boolean",
	default: false,
	ui: {
		tab: "model",
		group: "Thinking",
		label: "省略思考摘要",
		description: "指示上游提供商完全省略响应中的思考摘要(在支持的情况下)",
	},
});

export const cfgExternalThinking = register({
	id: "externalThinking",
	type: "boolean",
	default: false,
	ui: {
		tab: "model",
		group: "Thinking",
		label: "外部思考",
		description: "私有草稿本；不向用户显示。禁用受支持的 GPT、Claude 和 Gemini 推理功能",
		warning: "At your own risk: providers have flagged this request shape as abuse, up to account-level enforcement",
	},
});

export const cfgModelLoopGuardEnabled = register({
	id: "model.loopGuard.enabled",
	type: "boolean",
	default: true,
	// Kill switch shared with pi-ai's stream-level guard (`utils/thinking-loop.ts`); only `1` disables.
	env: { name: "PI_NO_THINKING_LOOP_GUARD", parse: raw => (raw === "1" ? false : undefined) },
	ui: {
		tab: "model",
		group: "Thinking",
		label: "循环防护",
		description: "为模型推理和正文启用自动流循环检测",
	},
});

export const cfgModelLoopGuardCheckAssistantContent = register({
	id: "model.loopGuard.checkAssistantContent",
	type: "boolean",
	default: true,
	ui: {
		tab: "model",
		group: "Thinking",
		label: "循环防护扫描正文",
		description: "除思考日志外,也将循环防护应用于助手正文消息",
	},
});

export const cfgModelLoopGuardToolCallReminder = register({
	id: "model.loopGuard.toolCallReminder",
	type: "boolean",
	default: true,
	ui: {
		tab: "model",
		group: "Thinking",
		label: "循环防护工具调用提醒",
		description:
			"当 Gemini 推理流连续发出多个规划头却不调用工具时,中断它并注入一条提醒,要求其发出工具调用(需要启用循环防护)",
	},
});

export const cfgModelToolCallLoopGuardEnabled = register({
	id: "model.toolCallLoopGuard.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "model",
		group: "Thinking",
		label: "工具调用循环防护",
		description: "检测跨轮次的连续相同工具调用,并注入纠正性引导",
	},
});

export const cfgModelToolCallLoopGuardThreshold = register({
	id: "model.toolCallLoopGuard.threshold",
	type: "number",
	default: 5,
	ui: {
		tab: "model",
		group: "Thinking",
		label: "工具调用循环阈值",
		description: "触发纠正性引导所需的连续相同工具调用次数",
	},
});

export const cfgModelToolCallLoopGuardExemptTools = register({
	id: "model.toolCallLoopGuard.exemptTools",
	type: "array",
	default: DEFAULT_TOOL_CALL_LOOP_EXEMPT_TOOLS,
	ui: {
		tab: "model",
		group: "Thinking",
		label: "工具调用循环豁免工具",
		description: "允许连续重复而不会触发跨轮次循环防护的工具名称",
	},
});

export const cfgInlineToolDescriptors = register({
	id: "inlineToolDescriptors",
	type: "enum",
	values: ["auto", "on", "off"] as const,
	default: "auto",
	ui: {
		tab: "model",
		group: "Prompt",
		label: "内联工具描述符",
		description:
			"在系统提示中渲染完整工具描述符，并从提供商工具 schema 中剥离 top-level/nested 描述，使描述符文本仅发送一次。对 Gemini 模型自动启用，否则禁用",
		options: [
			{
				value: "auto",
				label: "自动",
				description: "对 Gemini 模型内联描述符;其他情况保留在工具 schema 中",
			},
			{ value: "on", label: "开启", description: "始终在系统提示中内联描述符" },
			{ value: "off", label: "关闭", description: "仅将描述符保留在提供商工具 schema 中" },
		],
	},
});

export const cfgIncludeModelInPrompt = register({
	id: "includeModelInPrompt",
	type: "boolean",
	default: true,
	ui: {
		tab: "model",
		group: "Prompt",
		label: "在提示中显示模型",
		description: "在系统提示中显示当前模型标识,让代理知道自己使用的是哪个模型",
	},
});

export const cfgIncludeWorkspaceTree = register({
	id: "includeWorkspaceTree",
	type: "boolean",
	default: false,
	ui: {
		tab: "model",
		group: "Prompt",
		label: "包含工作区目录树",
		description:
			"在系统提示中渲染工作区目录树。WARNING：文件被修改时，这可能会破坏跨会话的提示缓存。",
	},
});

export const cfgSkillful = register({
	id: "skillful",
	type: "boolean",
	default: true,
	ui: {
		tab: "model",
		group: "Prompt",
		label: "在提示中列出技能",
		description:
			"在系统提示中列出可用技能；禁用可节省上下文，并可使用 /skillful 按会话切换",
	},
});

/** Personality preset. */
export type Personality = SettingValueOf<typeof cfgPersonality>;

export const cfgPersonality = register({
	id: "personality",
	type: "enum",
	values: ["default", "friendly", "pragmatic", "none"] as const,
	default: "default",
	ui: {
		tab: "model",
		group: "Prompt",
		label: "个性",
		description: "渲染到系统提示个性块中的沟通风格",
		options: [
			{
				value: "default",
				label: "默认",
				description: "简洁、以证据为先的工程师;信息密集、面向行动的回复",
			},
			{
				value: "friendly",
				label: "友好",
				description: "温暖、鼓励的协作者,注重推进动力和士气",
			},
			{
				value: "pragmatic",
				label: "务实",
				description: "直接、高效的工程师,注重清晰和严谨",
			},
			{ value: "none", label: "无", description: "完全省略个性块" },
		],
	},
});

// Sampling
export const cfgTemperature = register({
	id: "temperature",
	type: "number",
	default: -1,
	ui: {
		tab: "model",
		group: "Sampling",
		label: "温度",
		description: "采样温度(0 = 确定性,1 = 创造性,-1 = 提供商默认)",
		options: [
			{ value: "-1", label: "默认", description: "使用提供商默认值" },
			{ value: "0", label: "0", description: "确定性" },
			{ value: "0.2", label: "0.2", description: "聚焦" },
			{ value: "0.5", label: "0.5", description: "均衡" },
			{ value: "0.7", label: "0.7", description: "创造性" },
			{ value: "1", label: "1", description: "最大多样性" },
		],
	},
});

export const cfgTopP = register({
	id: "topP",
	type: "number",
	default: -1,
	ui: {
		tab: "model",
		group: "Sampling",
		label: "Top P 值",
		description: "核采样截断值 (0-1,-1 = 提供商默认)",
		options: [
			{ value: "-1", label: "默认", description: "使用提供商默认值" },
			{ value: "0.1", label: "0.1", description: "非常聚焦" },
			{ value: "0.3", label: "0.3", description: "聚焦" },
			{ value: "0.5", label: "0.5", description: "均衡" },
			{ value: "0.9", label: "0.9", description: "广泛" },
			{ value: "1", label: "1", description: "无核过滤" },
		],
	},
});

export const cfgTopK = register({
	id: "topK",
	type: "number",
	default: -1,
	ui: {
		tab: "model",
		group: "Sampling",
		label: "Top K 值",
		description: "从 top-K tokens 中采样 (-1 = 提供商默认)",
		options: [
			{ value: "-1", label: "默认", description: "使用提供商默认值" },
			{ value: "1", label: "1", description: "贪心最高 token" },
			{ value: "20", label: "20", description: "聚焦" },
			{ value: "40", label: "40", description: "均衡" },
			{ value: "100", label: "100", description: "广泛" },
		],
	},
});

export const cfgMinP = register({
	id: "minP",
	type: "number",
	default: -1,
	ui: {
		tab: "model",
		group: "Sampling",
		label: "Min P 值",
		description: "最小概率阈值 (0-1,-1 = 提供商默认)",
		options: [
			{ value: "-1", label: "默认", description: "使用提供商默认值" },
			{ value: "0.01", label: "0.01", description: "非常宽松" },
			{ value: "0.05", label: "0.05", description: "均衡" },
			{ value: "0.1", label: "0.1", description: "严格" },
		],
	},
});

export const cfgPresencePenalty = register({
	id: "presencePenalty",
	type: "number",
	default: -1,
	ui: {
		tab: "model",
		group: "Sampling",
		label: "存在惩罚",
		description: "对引入已存在 token 的惩罚 (-1 = 提供商默认)",
		options: [
			{ value: "-1", label: "默认", description: "使用提供商默认值" },
			{ value: "0", label: "0", description: "无惩罚" },
			{ value: "0.5", label: "0.5", description: "轻度新颖" },
			{ value: "1", label: "1", description: "鼓励新颖" },
			{ value: "2", label: "2", description: "强烈新颖" },
		],
	},
});

export const cfgRepetitionPenalty = register({
	id: "repetitionPenalty",
	type: "number",
	default: -1,
	ui: {
		tab: "model",
		group: "Sampling",
		label: "重复惩罚",
		description: "对重复 token 的惩罚 (-1 = 提供商默认)",
		options: [
			{ value: "-1", label: "默认", description: "使用提供商默认值" },
			{ value: "0.8", label: "0.8", description: "允许重复" },
			{ value: "1", label: "1", description: "无惩罚" },
			{ value: "1.1", label: "1.1", description: "轻度惩罚" },
			{ value: "1.2", label: "1.2", description: "均衡" },
			{ value: "1.5", label: "1.5", description: "强烈惩罚" },
		],
	},
});

const providerDefaultWhenNegative = (value: number): number | undefined => (value >= 0 ? value : undefined);

/** Agent sampling options; a negative sampling setting means "provider default" (`undefined`). */
export const cfgSampling = combine(
	{
		temperature: cfgTemperature,
		topP: cfgTopP,
		topK: cfgTopK,
		minP: cfgMinP,
		presencePenalty: cfgPresencePenalty,
		repetitionPenalty: cfgRepetitionPenalty,
		hideThinkingSummary: cfgOmitThinking,
	},
	values => ({
		temperature: providerDefaultWhenNegative(values.temperature),
		topP: providerDefaultWhenNegative(values.topP),
		topK: providerDefaultWhenNegative(values.topK),
		minP: providerDefaultWhenNegative(values.minP),
		presencePenalty: providerDefaultWhenNegative(values.presencePenalty),
		repetitionPenalty: providerDefaultWhenNegative(values.repetitionPenalty),
		hideThinkingSummary: values.hideThinkingSummary,
	}),
);

export const cfgTextVerbosity = register({
	id: "textVerbosity",
	type: "enum",
	values: ["low", "medium", "high"] as const,
	default: "medium",
	ui: {
		tab: "model",
		group: "Sampling",
		label: "文本详细程度",
		description: "OpenAI Responses 和 Codex 的响应详细程度(low、medium 或 high)",
		options: [
			{ value: "low", label: "低", description: "偏好简洁的回复" },
			{ value: "medium", label: "中", description: "在简洁与详细之间平衡(默认)" },
			{ value: "high", label: "高", description: "偏好详细的回复" },
		],
	},
});

export const cfgTierOpenai = register({
	id: "tier.openai",
	type: "enum",
	values: SERVICE_TIER_OPENAI_VALUES,
	default: "none",
	ui: {
		tab: "model",
		group: "Sampling",
		label: "服务层级 — OpenAI",
		description:
			"OpenAI / OpenAI-Codex 请求以及经由 OpenRouter 路由的 OpenAI 系模型的处理层级(none = 省略)。以 `service_tier` 字段发送。",
		options: SERVICE_TIER_OPENAI_OPTIONS,
	},
});

export const cfgTierAnthropic = register({
	id: "tier.anthropic",
	type: "enum",
	values: SERVICE_TIER_ANTHROPIC_VALUES,
	default: "none",
	ui: {
		tab: "model",
		group: "Sampling",
		label: "服务层级 — Anthropic",
		description:
			"Claude 请求的处理层级。`priority` 在支持的直接 Anthropic 模型上实现快速模式（`speed: \"fast\"`）；在 Bedrock/Vertex Claude 上以及通过 OpenRouter 时忽略。",
		options: SERVICE_TIER_ANTHROPIC_OPTIONS,
	},
});

export const cfgTierGoogle = register({
	id: "tier.google",
	type: "enum",
	values: SERVICE_TIER_GOOGLE_VALUES,
	default: "none",
	ui: {
		tab: "model",
		group: "Sampling",
		label: "服务层级 — Google",
		description:
			"Gemini(Google AI Studio + Vertex)请求以及经由 OpenRouter 路由的 Google 系模型的处理层级(none = 省略)。作为顶层 `serviceTier` 字段发送。",
		options: SERVICE_TIER_GOOGLE_OPTIONS,
	},
});

export const cfgTierSubagent = register({
	id: "tier.subagent",
	type: "enum",
	values: SERVICE_TIER_INHERIT_SETTING_VALUES,
	default: "inherit",
	ui: {
		tab: "model",
		group: "Sampling",
		label: "服务层级 — 子代理",
		description:
			"派生的 task/eval 子代理的服务层级。Inherit = 匹配主代理当前的各家族层级(跟随 /fast);选择某个值则将其应用于子代理模型所属的家族。",
		options: SERVICE_TIER_INHERIT_OPTIONS,
	},
});

export const cfgTierAdvisor = register({
	id: "tier.advisor",
	protocolDefault: ["rpc", "acp"],
	type: "enum",
	values: SERVICE_TIER_INHERIT_SETTING_VALUES,
	default: "none",
	ui: {
		tab: "model",
		group: "Sampling",
		label: "服务层级 — 顾问",
		description:
			"顾问模型的服务层级。None = 标准处理;Inherit = 匹配主代理当前的各家族层级;选择某个值则将其应用于顾问模型所属的家族。",
		options: SERVICE_TIER_INHERIT_OPTIONS,
		condition: "advisorEnabled",
	},
});

// Retries
export const cfgRetryEnabled = register({ id: "retry.enabled", type: "boolean", default: true });

export const cfgRetryMaxRetries = register({
	id: "retry.maxRetries",
	type: "number",
	default: 10,
	ui: {
		tab: "model",
		group: "Retry & Fallback",
		label: "重试次数",
		description: "API 错误时的最大重试次数",
		options: [
			{ value: "1", label: "1 次重试" },
			{ value: "2", label: "2 次重试" },
			{ value: "3", label: "3 次重试" },
			{ value: "5", label: "5 次重试" },
			{ value: "10", label: "10 次重试" },
		],
	},
});

export const cfgRetryBaseDelayMs = register({ id: "retry.baseDelayMs", type: "number", default: 500 });

export const cfgRetryMaxDelayMs = register({
	id: "retry.maxDelayMs",
	type: "number",
	default: 5 * 60 * 1000,
	ui: {
		tab: "model",
		group: "Retry & Fallback",
		label: "最大重试延迟",
		description:
			"重试之间的最长等待时间（毫秒）。当提供商要求等待的时间超过此值，且没有凭据或模型回退成功时，请求会快速失败，而不是继续休眠（e.g。3 小时的 Anthropic 速率限制窗口）。设为 0 可禁用该上限——让会话在提供商声明的配额重置后自动恢复。",
	},
});

export const cfgRetryWaitForUsageReset = register({
	id: "retry.waitForUsageReset",
	type: "boolean",
	default: false,
	ui: {
		tab: "model",
		group: "Retry & Fallback",
		label: "等待用量重置",
		get description() {
			return `When a provider reports usage-limit exhaustion with a reset time (5-hour or weekly quota windows on any provider), sleep until the reset instead of failing fast past retry.maxDelayMs. Waits are abortable (${formatKeyHint("escape")}) but also hold subagents, so leave off for unattended runs.`;
		},
	},
});

export const cfgRetryModelFallback = register({
	id: "retry.modelFallback",
	type: "boolean",
	default: true,
	ui: {
		tab: "model",
		group: "Retry & Fallback",
		label: "重试模型回退",
		description:
			"允许重试恢复在提供商错误后切换到 retry.fallbackChains 中的模型。与自动提升上下文无关",
	},
});

export const cfgRetryFallbackOn = register({
	id: "retry.fallbackOn",
	type: "enum",
	values: ["any", "usage-limit", "except-usage-limit"] as const,
	default: "any",
	ui: {
		tab: "model",
		group: "Retry & Fallback",
		label: "回退触发条件",
		description: "哪些失败的请求可以切换到已配置的回退模型",
		options: [
			{ value: "any", label: "任何错误", description: "任何提供商错误都可能切换模型" },
			{
				value: "usage-limit",
				label: "仅用量限制",
				description: "仅在用量限制时切换；其他错误在同一模型上重试，然后再将它们暴露出来",
			},
			{
				value: "except-usage-limit",
				label: "除用量限制外的所有错误",
				description: "等待使用限制结束或将其暴露出来；其他错误则切换",
			},
		],
	},
});

export const cfgRetryRateLimitWalksChain = register({
	id: "retry.rateLimitWalksChain",
	type: "boolean",
	default: false,
	ui: {
		tab: "model",
		group: "Retry & Fallback",
		label: "速率限制时遍历回退链",
		description:
			"遇到速率限制时，对于思考内容由失败模型签名的轮次，不要阻塞 retry.fallbackChains 遍历。关闭（默认）时，此类轮次会在到达链之前持续重试受速率限制的模型，直到 retry.maxRetries 用完。",
	},
});

export const cfgRetryUsageAwareFallback = register({
	id: "retry.usageAwareFallback",
	type: "boolean",
	default: false,
	ui: {
		tab: "model",
		group: "Retry & Fallback",
		label: "用量感知回退",
		description:
			"在达到硬用量限制之前,使用可靠的 coding-plan 配额报告优先选择同提供商的账户,然后是已配置的回退模型。普通的已配置 API keys 不在考虑范围内。",
	},
});

export const cfgRetryUsageReservePct = register({
	id: "retry.usageReservePct",
	type: "number",
	default: DEFAULT_USAGE_RESERVE_PCT,
	ui: {
		tab: "model",
		group: "Retry & Fallback",
		label: "预留余量",
		description:
			"当剩余百分比低于此值时,将 coding-plan 模型视为接近上限。未知或未映射的用量保持主模型不变。",
		condition: "usageAwareFallbackEnabled",
		options: [
			{ value: "5", label: "5%", description: "仅在几乎耗尽时触发" },
			{ value: "10", label: "10%", description: "均衡的安全余量" },
			{ value: "15", label: "15%", description: "保守" },
			{ value: "20", label: "20%", description: "早期保护" },
			{ value: "25", label: "25%", description: "非常保守" },
		],
	},
});

export const cfgRetryUsageReservePolicy = register({
	id: "retry.usageReservePolicy",
	type: "enum",
	values: ["confirm", "auto", "fail-closed"] as const,
	default: "confirm",
	ui: {
		tab: "model",
		group: "Retry & Fallback",
		label: "预留策略",
		description: "当所有同提供商的 coding-plan 账户都处于预留余量之内时该怎么做。",
		condition: "usageAwareFallbackEnabled",
		options: [
			{
				value: "confirm",
				label: "交互式确认",
				description: "在确认前让交互会话保持使用主账户;后台代理自动回退",
			},
			{
				value: "auto",
				label: "自动回退",
				description: "始终选择下一个符合条件的已配置回退",
			},
			{
				value: "fail-closed",
				label: "安全失败",
				description: "不消耗预留配额,也不选择回退",
			},
		],
	},
});

export const cfgRetryFallbackChains = register({
	id: "retry.fallbackChains",
	type: "record",
	default: EMPTY_STRING_ARRAYS_RECORD,
	ui: {
		tab: "model",
		group: "Retry & Fallback",
		label: "重试回退链",
		description:
			"JSON 对象，将模型角色、模型选择器（\"provider/model-id\"）或提供商通配符（\"provider/*\"）映射到有序的回退选择器，e.g。{\"default\":[\"openai/gpt-4o-mini\"],\"google-antigravity/*\":[\"google/*\",\"google-vertex/*\"]}。面向模型的键在该 model/provider 处于活动状态时生效，与角色无关；\"provider/*\" 条目保留失败模型的 id 并更换提供商。带 id 前缀的通配符（\"openrouter/google/*\"）会为失败模型的裸 id 重新加前缀（google-antigravity/gemini-x -> openrouter/google/gemini-x），且作为键使用时仅匹配该提供商下此前缀的 id。回退条目可带有显式思考后缀（\"provider/model:low\"、\":high\"、\":max\"、\":off\"）；裸条目继承失败轮次的思考强度，而 \"provider/*\" 条目始终继承。",
	},
});

export const cfgRetryFallbackRevertPolicy = register({
	id: "retry.fallbackRevertPolicy",
	type: "enum",
	values: ["cooldown-expiry", "never"] as const,
	default: "cooldown-expiry",
	ui: {
		tab: "model",
		group: "Retry & Fallback",
		label: "回退还原策略",
		description: "回退后何时返回主模型",
		options: [
			{
				value: "cooldown-expiry",
				label: "冷却期结束",
				description: "抑制窗口结束后返回主模型",
			},
			{ value: "never", label: "从不", description: "一直使用回退模型,直到手动更改" },
		],
	},
});

/** Retry/backoff and usage-aware fallback policy (`retry.*` except fallback chains/revert policy). */
export const cfgRetry = combine({
	enabled: cfgRetryEnabled,
	maxRetries: cfgRetryMaxRetries,
	baseDelayMs: cfgRetryBaseDelayMs,
	maxDelayMs: cfgRetryMaxDelayMs,
	waitForUsageReset: cfgRetryWaitForUsageReset,
	modelFallback: cfgRetryModelFallback,
	fallbackOn: cfgRetryFallbackOn,
	rateLimitWalksChain: cfgRetryRateLimitWalksChain,
	usageAwareFallback: cfgRetryUsageAwareFallback,
	usageReservePct: cfgRetryUsageReservePct,
	usageReservePolicy: cfgRetryUsageReservePolicy,
});

/** Retry/backoff policy ({@link cfgRetry}). */
export type RetrySettings = SettingValueOf<typeof cfgRetry>;

export const cfgProvidersAnthropicServerSideFallback = register({
	id: "providers.anthropic.serverSideFallback",
	type: "boolean",
	default: false,
	ui: {
		tab: "model",
		group: "Retry & Fallback",
		label: "Anthropic 服务端回退 (Fable 5)",
		description:
			"当 Claude Fable 5 / Mythos 5 请求被 Anthropic 的安全分类器拦截时，在服务端改用 Claude Opus 5 重试（Anthropic `server-side-fallback-2026-06-01` beta）。需主动启用——关闭此项会为所有请求保留回退前的行为。",
	},
});

/**
 * Anthropic subscription slow mode (`off` | `auto`). Deliberately has no
 * `/settings` UI: `/slow on|off` on an Anthropic model is the only switch.
 * `auto` switches to low priority automatically when a Claude subscription
 * hits its 5-hour limit and Anthropic offers it. Wrap-up allowance tracking
 * runs either way; this only gates the low-priority lane.
 */
export const cfgProvidersAnthropicSlowMode = register({
	id: "providers.anthropic.slowMode",
	type: "enum",
	values: ["off", "auto"] as const,
	default: "off" as const,
});

// Provider selection
export const cfgProvidersOllamaCloudMaxConcurrency = register({
	id: "providers.ollama-cloud.maxConcurrency",
	type: "number",
	default: 3,
	ui: {
		tab: "providers",
		group: "Services",
		label: "Ollama Cloud 最大并发数",
		description: "每个进程的 Ollama Cloud 子代理最大并发运行数;0 禁用该提供商特定限制",
	},
});

export const cfgProvidersWebSearchTimeoutSeconds = register({
	id: "providers.webSearchTimeoutSeconds",
	type: "number",
	default: DEFAULT_WEB_SEARCH_TIMEOUT_SECONDS,
	ui: {
		tab: "providers",
		group: "Services",
		label: "Web 搜索超时",
		description: `web_search 前进到下一个回退前,每个提供商搜索传输的硬超时(秒)(最大 ${MAX_WEB_SEARCH_TIMEOUT_SECONDS})`,
		options: [
			{ value: "30", label: "30 秒" },
			{ value: "60", label: "1 分钟" },
			{ value: "120", label: "2 分钟" },
			{ value: "180", label: "3 分钟" },
			{ value: "300", label: "5 分钟" },
		],
	},
});

export const cfgProvidersAntigravityEndpoint = register({
	id: "providers.antigravityEndpoint",
	type: "enum",
	values: ["auto", "production", "sandbox"] as const,
	default: "auto",
	ui: {
		tab: "providers",
		group: "Services",
		label: "Antigravity 端点模式",
		description: "google-antigravity 提供商的端点路由策略(chat、search、image、discovery)",
		options: [
			{
				value: "auto",
				label: "自动",
				description: "尝试生产端点,5xx/429 时故障转移到沙箱",
			},
			{
				value: "production",
				label: "仅生产",
				description: "仅强制使用生产端点",
			},
			{
				value: "sandbox",
				label: "仅沙箱",
				description: "仅强制使用沙箱端点",
			},
		],
	},
});

export const cfgProvidersFireworksTier = register({
	id: "providers.fireworksTier",
	type: "enum",
	values: ["standard", "priority"] as const,
	default: "standard",
	ui: {
		tab: "providers",
		group: "Fireworks",
		label: "Fireworks 层级",
		description:
			"Fireworks 请求的服务路径。Priority 在高峰流量期间以更高价格发送 `service_tier: \"priority\"` 以提高可靠性；Standard 则省略它。Fast（`-fast`）模型会忽略此项——Fast 有其自己的服务路径。",
		options: [
			{ value: "standard", label: "标准", description: "默认服务路径(无 service_tier)" },
			{
				value: "priority",
				label: "优先",
				description: "优先服务路径:更高可靠性,按 token 溢价计费",
			},
		],
	},
});

export const cfgProvidersTinyModelDevice = register({
	id: "providers.tinyModelDevice",
	type: "enum",
	values: TINY_MODEL_DEVICE_SETTING_VALUES,
	default: TINY_MODEL_DEVICE_DEFAULT,
	env: {
		name: "PI_TINY_DEVICE",
		parse: raw => TINY_MODEL_DEVICE_SETTING_VALUES.find(value => value === raw.trim().toLowerCase()),
	},
	ui: {
		tab: "providers",
		group: "Tiny Model",
		label: "小模型设备",
		description:
			"本地微型模型（标题 + 记忆）的推理后端：ONNX 执行提供程序，或使用 `mlx` 下载 MLX 权重并在 Apple 芯片上通过 mlx-lm 运行。默认使用仅 CPU 的 ONNX。PI_TINY_DEVICE 环境变量可覆盖此项。",
		options: TINY_MODEL_DEVICE_SETTING_OPTIONS,
	},
});

export const cfgProvidersTinyModelDtype = register({
	id: "providers.tinyModelDtype",
	type: "enum",
	values: TINY_MODEL_DTYPE_SETTING_VALUES,
	default: TINY_MODEL_DTYPE_DEFAULT,
	env: {
		name: "PI_TINY_DTYPE",
		parse: raw => TINY_MODEL_DTYPE_SETTING_VALUES.find(value => value === raw.trim().toLowerCase()),
	},
	ui: {
		tab: "providers",
		group: "Tiny Model",
		label: "小模型精度",
		description:
			"ONNX quantization/precision 用于本地微型模型。默认使用各模型随附的 dtype（q4）；精度越低速度越快，越高则越忠实。MLX 后端会忽略此项（其仓库已预量化为 4 位）。PI_TINY_DTYPE 环境变量可覆盖此项。",
		options: TINY_MODEL_DTYPE_SETTING_OPTIONS,
	},
});

export const cfgProvidersAutoThinkingMaxEffort = register({
	id: "providers.autoThinkingMaxEffort",
	type: "enum",
	values: ["xhigh", "max"] as const,
	default: "xhigh",
	ui: {
		tab: "model",
		group: "Thinking",
		label: "自动思考上限",
		description:
			"`auto` 分类器可解析的最高档位。`xhigh` 让分类器比最高档低一档,因此只有显式的 `ultrathink` 才能达到 `max`;`max` 允许分类器判定为例外的一轮,在支持的模型上计入最高档费用。",
		condition: "autoThinkingActive",
		options: [
			{ value: "xhigh", label: "极高", description: "分类器在 xhigh 处停止(默认)" },
			{ value: "max", label: "最高", description: "在模型支持的情况下,分类器可解析为 max" },
		],
	},
});

export const cfgFeaturesUnexpectedStopDetection = register({
	id: "features.unexpectedStopDetection",
	type: "enum",
	values: ["none", "mechanical", "smart"] as const,
	default: "mechanical",
	ui: {
		tab: "interaction",
		group: "Agent",
		label: "异常停止",
		description:
			"当助手在没有可见消息的情况下停止时自动恢复。智能模式还会使用小模型对纯文本停止进行分类。",
		options: [
			{ value: "none", label: "无", description: "已禁用" },
			{
				value: "mechanical",
				label: "机械判定",
				description: "对没有可见助手消息的停止进行重试；工具调用除外（默认）",
			},
			{
				value: "smart",
				label: "智能",
				description: "机械判定 + 用小模型对纯文本停止分类",
			},
		],
	},
});

export const cfgProvidersKimiApiFormat = register({
	id: "providers.kimiApiFormat",
	type: "enum",
	values: ["auto", "openai", "anthropic"] as const,
	default: "auto",
	ui: {
		tab: "providers",
		group: "Protocol",
		label: "Kimi API 格式",
		description: "Kimi Code 提供商的 API 格式(auto 跟随模型实时元数据)",
		options: [
			{ value: "auto", label: "自动", description: "使用模型服务端声明的协议" },
			{ value: "openai", label: "OpenAI", description: "api.kimi.com" },
			{ value: "anthropic", label: "Anthropic", description: "api.moonshot.ai" },
		],
	},
});

export const cfgProvidersOpenaiWebsockets = register({
	id: "providers.openaiWebsockets",
	type: "enum",
	values: ["auto", "off", "on"] as const,
	default: "auto",
	ui: {
		tab: "providers",
		group: "Protocol",
		label: "OpenAI WebSocket 连接",
		description: "OpenAI Codex 模型的 websocket 策略(auto 使用模型默认,on 强制,off 禁用)",
		options: [
			{ value: "auto", label: "自动", description: "使用 model/provider 默认 WebSocket 行为" },
			{ value: "off", label: "关闭", description: "禁用 OpenAI Codex 模型的 websockets" },
			{ value: "on", label: "开启", description: "强制 OpenAI Codex 模型使用 websockets" },
		],
	},
});

export const cfgProvidersOpenaiLiveSteering = register({
	id: "providers.openaiLiveSteering",
	type: "boolean",
	default: false,
	ui: {
		tab: "providers",
		group: "Protocol",
		label: "OpenAI 实时引导",
		description:
			"在 GPT-6 响应流式传输期间输入的消息，会通过 Codex WebSocket 并入该响应，而无需等到下一个工具边界",
	},
});

export const cfgProvidersMuseCodeStoreResponses = register({
	id: "providers.muse-code.storeResponses",
	type: "boolean",
	default: false,
	env: "PI_MUSE_STORE_RESPONSES",
	ui: {
		tab: "providers",
		group: "Protocol",
		label: "Muse Code 存储响应",
		description:
			"将 Muse Code 的结果存储在 Meta 的服务器上，这样连接中断的回合可以被恢复，而无需重新运行。存储的运行会在 Meta 一侧保留提示和输出。",
	},
});
// Process-wide too, so side requests that call `completeSimple`/`streamSimple`
// directly (titles, commit messages, memories) follow the setting.
effect(cfgProvidersMuseCodeStoreResponses, enabled => configureProviderStoreResponses({ "muse-code": enabled }));

export const cfgProvidersCacheRetention = register({
	id: "providers.cacheRetention",
	type: "enum",
	values: ["auto", "short", "long", "none"] as const,
	default: "auto",
	ui: {
		tab: "providers",
		group: "Protocol",
		label: "提示缓存保留",
		description:
			"将提示缓存保留时长转发给支持该功能的提供商（Anthropic、Bedrock、OpenRouter、OpenAI）",
		options: [
			{
				value: "auto",
				label: "自动",
				description:
					"提供商默认值 — Anthropic OAuth 订阅者会话默认 1h，API 密钥使用 5m；PI_CACHE_RETENTION 仍然生效",
			},
			{
				value: "short",
				label: "短（5 分钟）",
				description: "最便宜的缓存写入；配合缓存预热，可在空闲时让短条目保持存活",
			},
			{
				value: "long",
				label: "长时间 (1h+)",
				description:
					"在支持的情况下使用更长的 TTL（Anthropic/Bedrock 1 小时，OpenAI GPT-5.6+ Responses 12 小时）；写入成本更高，仅在活跃运行时预热",
			},
			{ value: "none", label: "关闭", description: "禁用提示缓存与缓存亲和路由" },
		],
	},
});

export const cfgProvidersCacheWarming = register({
	id: "providers.cacheWarming",
	type: "enum",
	values: ["off", "streaming", "idle"] as const,
	default: "idle",
	ui: {
		tab: "providers",
		group: "Protocol",
		label: "缓存预热",
		description:
			"在提示缓存条目过期前，以单令牌输出预算重新发送最后一个请求",
		options: [
			{ value: "off", label: "关闭", description: "禁用缓存预热" },
			{
				value: "streaming",
				label: "流式传输",
				description: "在长时间工具执行期间保护高成本前缀；当代理稳定后停止",
			},
			{
				value: "idle",
				label: "空闲",
				description:
					"在两次运行之间也会刷新 5 分钟条目，只要预期节省保持在成本底线以上",
			},
		],
	},
});

export const cfgProvidersStreamFirstEventTimeoutSeconds = register({
	id: "providers.streamFirstEventTimeoutSeconds",
	type: "number",
	default: -1,
	ui: {
		tab: "providers",
		group: "Timeouts",
		label: "流首事件超时",
		description:
			"等待第一个模型流事件的时间（秒）；-1 使用 provider/env 默认值，0 禁用看门狗",
		options: [
			{ value: "-1", label: "自动", description: "使用提供商默认值和 PI_* 超时环境变量" },
			{ value: "0", label: "关闭", description: "禁用首事件超时" },
			{ value: "300", label: "5 分钟" },
			{ value: "600", label: "10 分钟" },
			{ value: "1800", label: "30 分钟" },
		],
	},
});

export const cfgProvidersStreamIdleTimeoutSeconds = register({
	id: "providers.streamIdleTimeoutSeconds",
	type: "number",
	default: -1,
	ui: {
		tab: "providers",
		group: "Timeouts",
		label: "流空闲超时",
		description:
			"模型流在事件之间允许静默的秒数；-1 使用 provider/env 默认值，0 禁用看门狗",
		options: [
			{ value: "-1", label: "自动", description: "使用提供商默认值和 PI_* 超时环境变量" },
			{ value: "0", label: "关闭", description: "禁用空闲超时" },
			{ value: "300", label: "5 分钟" },
			{ value: "600", label: "10 分钟" },
			{ value: "1800", label: "30 分钟" },
		],
	},
});

export const cfgProvidersOpenrouterVariant = register({
	id: "providers.openrouterVariant",
	type: "enum",
	values: ["default", "nitro", "floor", "online", "exacto"] as const,
	default: "default",
	ui: {
		tab: "providers",
		group: "Protocol",
		label: "OpenRouter 路由",
		description:
			"追加到 OpenRouter 模型 ID 的默认路由变体后缀(选择器已指定变体时覆盖)",
		options: [
			{ value: "default", label: "默认", description: "无后缀;使用 OpenRouter 默认路由" },
			{ value: "nitro", label: ":nitro 模式", description: "优先吞吐量 / 最低延迟" },
			{ value: "floor", label: ":floor 模式", description: "优先最便宜的可用提供商" },
			{ value: "online", label: ":online 模式", description: "启用 OpenRouter 的 web-search 插件" },
			{
				value: "exacto",
				label: ":exacto 模式",
				description: "精选的高质量提供商(仅为特定模型定义)",
			},
		],
	},
});

export const cfgProvidersFetch = register({
	id: "providers.fetch",
	type: "enum",
	values: ["auto", "native", "trafilatura", "lynx", "parallel", "firecrawl", "jina"] as const,
	default: "auto",
	ui: {
		tab: "providers",
		group: "Services",
		label: "抓取提供商",
		description: "fetch/read URL 工具的阅读器后端优先级",
		options: [
			{
				value: "auto",
				label: "自动",
				description: "优先级：native > trafilatura > lynx > parallel > firecrawl > jina",
			},
			{ value: "native", label: "原生", description: "进程内 HTML→Markdown 转换器(始终可用)" },
			{ value: "trafilatura", label: "Trafilatura 提取器", description: "通过 uv/pip 自动安装" },
			{ value: "lynx", label: "Lynx 提取器", description: "需要 lynx 系统包" },
			{ value: "parallel", label: "Parallel 提取器", description: "需要 PARALLEL_API_KEY" },
			{ value: "firecrawl", label: "Firecrawl 提取器", description: "需要 FIRECRAWL_API_KEY" },
			{ value: "jina", label: "Jina 提取器", description: "使用 r.jina.ai 阅读器(JINA_API_KEY 可选)" },
		],
	},
});

// Codex saved rate-limit resets (auto-redeem)
export const cfgCodexResetsAutoRedeem = register({
	id: "codexResets.autoRedeem",
	type: "enum",
	values: ["unset", "yes", "no"] as const,
	default: "unset" as const,
	ui: {
		tab: "providers",
		group: "Services",
		label: "Codex 自动赎回保存的重置",
		description:
			"自动使用已保存的 Codex 速率限制重置次数：当回合卡住且没有其他账户可接替时，恢复因 5 小时或每周窗口耗尽而被阻止的账户，并挽救即将过期的额度。unset 会在首次使用前询问（在没有提示 UI 的情况下，仅使用 5 分钟内到期的重置），yes 直接使用而不提示，no 则禁用这两项检查。",
		options: [
			{
				value: "unset",
				label: "未设置",
				description:
					"检查资格，然后在首次使用已保存的重置前询问。在没有提示 UI 的情况下，仅使用 5 分钟内到期的重置。",
			},
			{ value: "yes", label: "是", description: "不加提示地花费符合条件的保存重置。" },
			{ value: "no", label: "否", description: "不运行保存重置自动赎回检查。" },
		],
	},
});

export const cfgCodexResetsMinBlockedMinutes = register({
	id: "codexResets.minBlockedMinutes",
	type: "number",
	default: 60,
	ui: {
		tab: "providers",
		group: "Services",
		label: "Codex 自动赎回最小阻塞",
		description:
			"仅在自然解除阻塞——已耗尽的 5h/weekly 窗口中最晚的重置——至少还要这么多分钟才到来时自动兑换（不要为了节省短暂等待而使用稀缺额度）。提高该值（e.g. 360）可忽略仅 5 小时的阻塞。",
	},
});

export const cfgCodexResetsKeepCredits = register({
	id: "codexResets.keepCredits",
	type: "number",
	default: 0,
	ui: {
		tab: "providers",
		group: "Services",
		label: "Codex 自动赎回储备",
		description:
			"绝不低于这个数量地自动花费保存的重置(0 = 最后一份额度也可能被自动花费)。即将过期的额度除外——保留的额度过期也不保留任何东西。",
	},
});

export const cfgCodexResetsSalvageHorizonHours = register({
	id: "codexResets.salvageHorizonHours",
	type: "number",
	default: 12,
	ui: {
		tab: "providers",
		group: "Services",
		label: "Codex 重置抢救时限",
		description:
			"启用自动兑换后，当任一聊天窗口有实际使用时，在到期前这么多小时内使用一次已保存的 Codex 重置。0 会禁用提前挽救；无论使用情况如何，仍会尝试使用 5 分钟内到期的额度。",
	},
});

/** Codex saved-reset auto-redeem policy (`codexResets.*`). */
export const cfgCodexResets = combine({
	autoRedeem: cfgCodexResetsAutoRedeem,
	minBlockedMinutes: cfgCodexResetsMinBlockedMinutes,
	keepCredits: cfgCodexResetsKeepCredits,
	salvageHorizonHours: cfgCodexResetsSalvageHorizonHours,
});

/** Whether automatic reset redemption asks first, spends, or remains disabled. */
export type ResetAutoRedeemMode = SettingValueOf<typeof cfgCodexResetsAutoRedeem>;

// Claude Cedar/Juniper rate-limit resets (independent auto-redeem consent)
export const cfgClaudeResetsAutoRedeem = register({
	id: "claudeResets.autoRedeem",
	type: "enum",
	values: ["unset", "yes", "no"] as const,
	default: "unset" as const,
	ui: {
		tab: "providers",
		group: "Services",
		label: "Claude 自动兑换重置",
		description:
			"自动使用符合条件的 Claude Cedar 或 Juniper 重置次数。Cedar 仅用于受覆盖的限制；Juniper 只能恢复单个 5 小时阻塞。unset 会在首次使用前询问（在没有提示 UI 的情况下，仅使用 5 分钟内到期的重置），yes 直接使用而不提示，no 则禁用阻塞恢复和到期挽救。",
		options: [
			{
				value: "unset",
				label: "未设置",
				description:
					"检查实时资格，然后在首次使用 Claude 重置前询问。在没有提示 UI 的情况下，仅使用 5 分钟内到期的重置。",
			},
			{ value: "yes", label: "是", description: "直接使用符合条件的 Claude 重置，无需提示。" },
			{ value: "no", label: "否", description: "不运行 Claude 重置自动兑换检查。" },
		],
	},
});

export const cfgClaudeResetsMinBlockedMinutes = register({
	id: "claudeResets.minBlockedMinutes",
	type: "number",
	default: 60,
	ui: {
		tab: "providers",
		group: "Services",
		label: "Claude 自动兑换最小阻塞",
		description:
			"仅当自然解除阻止（即已耗尽的覆盖时间窗口中最晚的重置）距现在至少这么多分钟时，才自动兑换。仅 5 小时重置绝不会用于每周或模型范围的阻止。",
	},
});

export const cfgClaudeResetsKeepCredits = register({
	id: "claudeResets.keepCredits",
	type: "number",
	default: 0,
	ui: {
		tab: "providers",
		group: "Services",
		label: "Claude 自动兑换储备",
		description:
			"至少保留这么多 Claude 重置备用（0 允许自动使用最后一个符合条件的重置）。该储备适用于提前挽救，但不适用于 5 分钟内到期的符合条件重置。",
	},
});

export const cfgClaudeResetsSalvageHorizonHours = register({
	id: "claudeResets.salvageHorizonHours",
	type: "number",
	default: 12,
	ui: {
		tab: "providers",
		group: "Services",
		label: "Claude 重置挽救时限",
		description:
			"启用自动兑换后，当服务器选择的 Cedar 重置的覆盖时间窗口有实际用量时，会在其到期前这么多小时内使用该重置。0 禁用提前挽救；符合条件的 Cedar 或 Juniper 重置若在 5 分钟内到期，仍会尝试使用，无论用量或储备如何。提供商限制要求仍然适用。",
	},
});

/** Claude reset auto-redeem policy (`claudeResets.*`), independent of {@link cfgCodexResets}. */
export const cfgClaudeResets = combine({
	autoRedeem: cfgClaudeResetsAutoRedeem,
	minBlockedMinutes: cfgClaudeResetsMinBlockedMinutes,
	keepCredits: cfgClaudeResetsKeepCredits,
	salvageHorizonHours: cfgClaudeResetsSalvageHorizonHours,
});

export const cfgProviderAppendOnlyContext = register({
	id: "provider.appendOnlyContext",
	type: "enum",
	values: ["auto", "on", "off"] as const,
	default: "auto",
	ui: {
		tab: "providers",
		group: "Protocol",
		label: "仅追加上下文",
		description:
			"缓存系统提示 + 工具规格,并保持仅追加的消息日志,使提供商前缀缓存(DeepSeek、Xiaomi/SGLang、Anthropic)以最大命中率工作。Auto 对已知的前缀缓存提供商启用。",
		options: [
			{ value: "auto", label: "自动", description: "对已知的前缀缓存提供商启用(推荐)" },
			{ value: "on", label: "开启", description: "始终启用仅追加上下文" },
			{ value: "off", label: "关闭", description: "禁用仅追加上下文" },
		],
	},
});

export const cfgThinkingBudgetsMinimal = register({ id: "thinkingBudgets.minimal", type: "number", default: 1024 });

export const cfgThinkingBudgetsLow = register({ id: "thinkingBudgets.low", type: "number", default: 2048 });

export const cfgThinkingBudgetsMedium = register({ id: "thinkingBudgets.medium", type: "number", default: 8192 });

export const cfgThinkingBudgetsHigh = register({ id: "thinkingBudgets.high", type: "number", default: 16384 });

export const cfgThinkingBudgetsXhigh = register({ id: "thinkingBudgets.xhigh", type: "number", default: 32768 });

export const cfgThinkingBudgetsMax = register({ id: "thinkingBudgets.max", type: "number", default: 32768 });

/** Token budget per thinking level (`thinkingBudgets.*`) on transports that accept reasoning token budgets. */
export const cfgThinkingBudgets = combine({
	minimal: cfgThinkingBudgetsMinimal,
	low: cfgThinkingBudgetsLow,
	medium: cfgThinkingBudgetsMedium,
	high: cfgThinkingBudgetsHigh,
	xhigh: cfgThinkingBudgetsXhigh,
	max: cfgThinkingBudgetsMax,
});

/** Rejects a cost threshold that is not a positive USD amount. */
function validateCostThreshold(id: string): (raw: unknown) => void {
	return raw => {
		if (raw === undefined || raw === null || (typeof raw === "number" && Number.isFinite(raw) && raw > 0)) return;
		throw new Error(`Invalid ${id}: expected a positive USD amount, got ${Bun.inspect(raw)}.`);
	};
}

/** Session-tree spend (USD) at which omp warns once; `--warn-cost` overrides it for one run. */
export const cfgSessionWarnCost = register({
	id: "session.warnCost",
	type: "number",
	default: undefined,
	validate: validateCostThreshold("session.warnCost"),
});

/** Session-tree spend (USD) at which omp stops sending model requests; `--max-cost` overrides it for one run. */
export const cfgSessionMaxCost = register({
	id: "session.maxCost",
	type: "number",
	default: undefined,
	validate: validateCostThreshold("session.maxCost"),
});
