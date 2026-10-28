/**
 * Settings declared by this domain (see `config/registry.ts`). Declaration order is the
 * settings-panel order; `config/all-settings.ts` registers every domain.
 */
import { register } from "../config/registry";

const HINDSIGHT_RECALL_TYPES_DEFAULT: string[] = ["world", "experience"];

/** Integer `HINDSIGHT_*` variables: base-10 `parseInt` prefix (`5000ms` → 5000, `2.5` → 2); other text is unset. */
function parseEnvInteger(raw: string): number | undefined {
	const value = Number.parseInt(raw, 10);
	return Number.isFinite(value) ? value : undefined;
}

// Hindsight (https://hindsight.vectorize.io)
export const cfgHindsightApiUrl = register({
	id: "hindsight.apiUrl",
	env: "HINDSIGHT_API_URL",
	type: "string",
	default: "http://localhost:8888",
	ui: {
		tab: "memory",
		group: "Hindsight",
		label: "后见之明 API URL",
		description: "Hindsight 服务器 URL(云或自托管)",
		condition: "hindsightActive",
	},
});

export const cfgHindsightApiToken = register({
	id: "hindsight.apiToken",
	env: "HINDSIGHT_API_TOKEN",
	type: "string",
	credential: true,
	default: undefined,
	ui: {
		tab: "memory",
		group: "Hindsight",
		label: "Hindsight API 令牌",
		description: "用于需要认证的 Hindsight 服务器的 Bearer token",
		condition: "hindsightActive",
	},
});

export const cfgHindsightBankId = register({
	id: "hindsight.bankId",
	env: "HINDSIGHT_BANK_ID",
	type: "string",
	default: undefined,
	ui: {
		tab: "memory",
		group: "Hindsight",
		label: "Hindsight 库 ID",
		description: "记忆 bank 标识(默认:项目名)",
		condition: "hindsightActive",
	},
});

export const cfgHindsightBankIdPrefix = register({ id: "hindsight.bankIdPrefix", type: "string", default: undefined });

export const cfgHindsightScoping = register({
	id: "hindsight.scoping",
	env: "HINDSIGHT_SCOPING",
	type: "enum",
	values: ["global", "per-project", "per-project-tagged"] as const,
	default: "per-project-tagged",
	ui: {
		tab: "memory",
		group: "Hindsight",
		label: "Hindsight 作用域",
		description:
			"global = 一个共享 bank;per-project = 每个 cwd 一个隔离 bank;per-project-tagged = 带项目标签的共享 bank,使全局 + 项目记忆在回忆时合并",
		options: [
			{
				value: "global",
				label: "全局",
				description: "一个共享 bank——所有项目看到相同的记忆",
			},
			{
				value: "per-project",
				label: "按项目",
				description: "每个 cwd 基名一个隔离 bank——项目之间看不到彼此的记忆",
			},
			{
				value: "per-project-tagged",
				label: "按项目(带标签)",
				description:
					"共享 bank,记忆以 project:<cwd> 标记。回忆时项目 + 未标记的全局记忆一起浮现",
			},
		],
		condition: "hindsightActive",
	},
});

export const cfgHindsightBankMission = register({
	id: "hindsight.bankMission",
	env: "HINDSIGHT_BANK_MISSION",
	type: "string",
	default: undefined,
});

export const cfgHindsightRetainMission = register({
	id: "hindsight.retainMission",
	type: "string",
	default: undefined,
});

export const cfgHindsightAutoRecall = register({
	id: "hindsight.autoRecall",
	env: "HINDSIGHT_AUTO_RECALL",
	type: "boolean",
	default: true,
	ui: {
		tab: "memory",
		group: "Hindsight",
		label: "Hindsight 自动回忆",
		description: "在每个会话的第一轮回忆记忆",
		condition: "hindsightActive",
	},
});

export const cfgHindsightAutoRetain = register({
	id: "hindsight.autoRetain",
	env: "HINDSIGHT_AUTO_RETAIN",
	type: "boolean",
	default: true,
	ui: {
		tab: "memory",
		group: "Hindsight",
		label: "Hindsight 自动保留",
		description: "每 N 轮及会话边界保留记录",
		condition: "hindsightActive",
	},
});

export const cfgHindsightRetainMode = register({
	id: "hindsight.retainMode",
	env: "HINDSIGHT_RETAIN_MODE",
	type: "enum",
	values: ["full-session", "last-turn"] as const,
	default: "full-session",
	ui: {
		tab: "memory",
		group: "Hindsight",
		label: "Hindsight 保留模式",
		description: "full-session = 每个会话 upsert 一个文档,last-turn = 分块",
		options: [
			{
				value: "full-session",
				label: "完整会话",
				description: "每个会话 upsert 一个文档(推荐)",
			},
			{ value: "last-turn", label: "最后一轮", description: "按轮次边界切分的分块保留" },
		],
		condition: "hindsightActive",
	},
});

export const cfgHindsightRetainEveryNTurns = register({
	id: "hindsight.retainEveryNTurns",
	env: { name: "HINDSIGHT_RETAIN_EVERY_N_TURNS", parse: parseEnvInteger },
	type: "number",
	default: 3,
});

export const cfgHindsightRetainOverlapTurns = register({
	id: "hindsight.retainOverlapTurns",
	type: "number",
	default: 2,
});

export const cfgHindsightRetainContext = register({ id: "hindsight.retainContext", type: "string", default: "omp" });

export const cfgHindsightRecallBudget = register({
	id: "hindsight.recallBudget",
	env: "HINDSIGHT_RECALL_BUDGET",
	type: "enum",
	values: ["low", "mid", "high"] as const,
	default: "mid",
});

export const cfgHindsightRecallMaxTokens = register({
	id: "hindsight.recallMaxTokens",
	env: { name: "HINDSIGHT_RECALL_MAX_TOKENS", parse: parseEnvInteger },
	type: "number",
	default: 1024,
});

export const cfgHindsightRecallContextTurns = register({
	id: "hindsight.recallContextTurns",
	env: { name: "HINDSIGHT_RECALL_CONTEXT_TURNS", parse: parseEnvInteger },
	type: "number",
	default: 1,
});

export const cfgHindsightRecallMaxQueryChars = register({
	id: "hindsight.recallMaxQueryChars",
	env: { name: "HINDSIGHT_RECALL_MAX_QUERY_CHARS", parse: parseEnvInteger },
	type: "number",
	default: 800,
});

export const cfgHindsightRecallTypes = register({
	id: "hindsight.recallTypes",
	type: "array",
	default: HINDSIGHT_RECALL_TYPES_DEFAULT,
});

export const cfgHindsightDebug = register({
	id: "hindsight.debug",
	env: "HINDSIGHT_DEBUG",
	type: "boolean",
	default: false,
});

export const cfgHindsightRequestTimeoutMs = register({
	id: "hindsight.requestTimeoutMs",
	env: { name: "HINDSIGHT_REQUEST_TIMEOUT_MS", parse: parseEnvInteger },
	type: "number",
	default: 30_000,
});

export const cfgHindsightReflectTimeoutMs = register({
	id: "hindsight.reflectTimeoutMs",
	env: { name: "HINDSIGHT_REFLECT_TIMEOUT_MS", parse: parseEnvInteger },
	type: "number",
	default: 120_000,
});

export const cfgHindsightRecallTimeoutMs = register({
	id: "hindsight.recallTimeoutMs",
	env: { name: "HINDSIGHT_RECALL_TIMEOUT_MS", parse: parseEnvInteger },
	type: "number",
	default: 30_000,
});

export const cfgHindsightRetainTimeoutMs = register({
	id: "hindsight.retainTimeoutMs",
	env: { name: "HINDSIGHT_RETAIN_TIMEOUT_MS", parse: parseEnvInteger },
	type: "number",
	default: 60_000,
});

export const cfgHindsightMentalModelsEnabled = register({
	id: "hindsight.mentalModelsEnabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "memory",
		group: "Hindsight",
		label: "Hindsight 心智模型",
		description:
			"启动时将精选的 reflect 摘要(心智模型)读入开发者指令。加载 bank 上已有的模型——不写入。配合 hindsight.mentalModelAutoSeed 可同时自动创建内置种子集。",
		condition: "hindsightActive",
	},
});

export const cfgHindsightMentalModelAutoSeed = register({
	id: "hindsight.mentalModelAutoSeed",
	type: "boolean",
	default: true,
	ui: {
		tab: "memory",
		group: "Hindsight",
		label: "Hindsight 心智模型自动播种",
		description:
			"会话开始时,创建 bank 上尚不存在的内置心智模型(project-conventions、project-decisions、user-preferences)。",
		condition: "hindsightActive",
	},
});

export const cfgHindsightMentalModelMaxRenderChars = register({
	id: "hindsight.mentalModelMaxRenderChars",
	type: "number",
	default: 16_000,
});
