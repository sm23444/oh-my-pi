/**
 * Settings declared by this domain (see `config/registry.ts`). Declaration order is the
 * settings-panel order; `config/all-settings.ts` registers every domain.
 */
import { type OAuthAccountPools, validateAgentAccountPools } from "../config/account-pools";
import {
	type AgentCompactionThresholdOverride,
	validateAgentCompactionThresholdOverrides,
} from "../config/compaction-threshold";
import { effect, register } from "../config/registry";
import { type ServiceTierInheritSettingValue, validateAgentServiceTierOverrides } from "../config/service-tier";
import { THINKING_EFFORTS } from "@oh-my-pi/pi-catalog/effort";
import { isRecord, logger, setWorktreesDir } from "@oh-my-pi/pi-utils";
import { setFeedModelBadgeEnabled } from "@oh-my-pi/pi-tui/render/render-utils";
import { getThinkingLevelMetadata } from "@oh-my-pi/pi-tui/thinking";

const EMPTY_AGENT_SERVICE_TIER_OVERRIDES: Record<string, ServiceTierInheritSettingValue> = {};
const EMPTY_AGENT_COMPACTION_THRESHOLD_OVERRIDES: Record<string, AgentCompactionThresholdOverride> = {};
const EMPTY_AGENT_ACCOUNT_POOLS: Record<string, OAuthAccountPools> = {};
const EMPTY_AGENT_SOFT_REQUEST_BUDGET: Record<string, number | null> = {};

const DEFAULT_AGENT_MODEL_OVERRIDES: Record<string, string | string[]> = {};

// Delegation. Task and isolation settings declare `protocolDefault`: protocol hosts get neutral
// defaults instead of the local user's interactive preferences.
export const cfgTaskIsolationEnabled = register({
	id: "task.isolation.enabled",
	protocolDefault: ["rpc", "acp"],
	type: "boolean",
	default: false,
	ui: {
		tab: "tasks",
		group: "Isolation",
		label: "允许隔离子代理",
		description: "允许使用 `isolated: true` 进行按任务隔离；未使用它的任务在共享检出中运行",
	},
});

export const cfgIsolationBackend = register({
	id: "isolation.backend",
	protocolDefault: ["rpc", "acp"],
	type: "enum",
	values: ["auto", "apfs", "btrfs", "zfs", "reflink", "overlayfs", "projfs", "block-clone", "rcopy"] as const,
	default: "auto",
	ui: {
		tab: "tasks",
		group: "Isolation",
		label: "隔离后端",
		description: "用于子代理隔离与 worktree 克隆的后端",
		options: [
			{ value: "auto", label: "自动", description: "让 PAL 选择最佳可用后端" },
			{ value: "apfs", label: "APFS", description: "macOS 的 clonefile reflink（APFS）" },
			{ value: "btrfs", label: "btrfs 文件系统", description: "btrfs 子卷快照" },
			{ value: "zfs", label: "ZFS", description: "ZFS 快照 + 克隆" },
			{ value: "reflink", label: "Reflink（重链接）", description: "Linux FICLONE 按文件 reflink" },
			{
				value: "overlayfs",
				label: "Overlayfs 文件系统",
				description: "Linux 内核 overlay(或 fuse-overlayfs 回退)",
			},
			{ value: "projfs", label: "ProjFS 文件系统", description: "Windows 投影文件系统（ProjFS）" },
			{
				value: "block-clone",
				label: "块克隆",
				description: "Windows 文件系统 FSCTL_DUPLICATE_EXTENTS_TO_FILE（NTFS/ReFS）",
			},
			{
				value: "rcopy",
				label: "递归复制",
				description: "可用时用 git worktree,否则递归复制",
			},
		],
	},
});

export const cfgWorktreeClone = register({
	id: "worktree.clone",
	protocolDefault: ["rpc", "acp"],
	type: "boolean",
	default: true,
	ui: {
		tab: "tasks",
		group: "Isolation",
		label: "把检出克隆进 worktree",
		description:
			"在 bash 中通过 `github pr_checkout` 和 `git worktree add` 创建的新工作树以当前检出的写时复制克隆开始，因此被忽略的构建产物（node_modules、target）会保留；当文件系统无法克隆时，回退到普通检出。",
	},
});

export const cfgWorktreeCleanSource = register({
	id: "worktree.cleanSource",
	protocolDefault: ["rpc", "acp"],
	type: "boolean",
	default: false,
	ui: {
		tab: "tasks",
		group: "Isolation",
		label: "/wt 时清理源检出",
		description:
			"使用 `/wt` 创建工作树时，在将更改带过去后重置原检出中的已跟踪更改并删除未跟踪文件",
	},
});

export const cfgWorktreeOnStart = register({
	id: "worktree.onStart",
	protocolDefault: ["rpc", "acp"],
	type: "enum",
	values: ["off", "ask", "create"] as const,
	default: "off",
	ui: {
		tab: "tasks",
		group: "Isolation",
		label: "启动时使用工作树",
		description: "全新交互式会话是否在新建的关联工作树中启动",
		options: [
			{ value: "off", label: "关闭", description: "在当前检出中启动" },
			{ value: "ask", label: "询问", description: "在会话开始时询问" },
			{ value: "create", label: "创建", description: "始终在 `wt/*` 分支的新工作树中启动" },
		],
	},
});

export const cfgWorktreeOnExit = register({
	id: "worktree.onExit",
	protocolDefault: ["rpc", "acp"],
	type: "enum",
	values: ["keep", "ask", "remove"] as const,
	default: "keep",
	ui: {
		tab: "tasks",
		group: "Isolation",
		label: "退出时处理工作树",
		description: "退出时如何处理自 omp 启动后创建的工作树（在启动时或使用 `/wt` 创建）",
		options: [
			{ value: "keep", label: "保留", description: "将工作树保留在原处" },
			{ value: "ask", label: "询问", description: "退出时询问" },
			{
				value: "remove",
				label: "移除",
				description:
					"移除干净的工作树；当它们有未提交的更改或新提交时询问。被 Git 忽略的文件（e.g. `.env`）也会一并删除。",
			},
		],
	},
});

export const cfgTaskIsolationApply = register({
	id: "task.isolation.apply",
	protocolDefault: ["rpc", "acp"],
	type: "boolean",
	default: true,
	ui: {
		tab: "tasks",
		group: "Isolation",
		label: "应用隔离更改",
		description:
			"自动将成功的隔离任务更改应用到父 checkout;禁用则保留 patch 或 branch 产物",
	},
});

export const cfgTaskIsolationMerge = register({
	id: "task.isolation.merge",
	protocolDefault: ["rpc", "acp"],
	type: "enum",
	values: ["patch", "branch"] as const,
	default: "patch",
	ui: {
		tab: "tasks",
		group: "Isolation",
		label: "隔离合并策略",
		description: "隔离任务更改如何整合(patch 应用或 branch 合并)",
		options: [
			{ value: "patch", label: "补丁", description: "合并 diffs 并 git apply" },
			{ value: "branch", label: "分支", description: "每个任务一个提交,以 --no-ff 合并" },
		],
	},
});

export const cfgTaskIsolationCommits = register({
	id: "task.isolation.commits",
	protocolDefault: ["rpc", "acp"],
	type: "enum",
	values: ["generic", "ai"] as const,
	default: "generic",
	ui: {
		tab: "tasks",
		group: "Isolation",
		label: "隔离提交风格",
		description: "嵌套仓库更改的提交消息风格(generic 或 AI 生成)",
		options: [
			{ value: "generic", label: "通用", description: "静态提交消息" },
			{ value: "ai", label: "AI 生成", description: "根据 diff 由 AI 生成的提交消息" },
		],
	},
});

export const cfgWorktreeBase = register({
	id: "worktree.base",
	type: "string",
	default: undefined,
	ui: {
		tab: "tasks",
		group: "Isolation",
		label: "Worktree 基础目录",
		description:
			"代理管理工作树的基目录——任务隔离副本、`github` PR 检出以及 `omp worktree` 清理都存放于此。未设置时使用 ~/.omp/wt.。必须以绝对路径或 ~ 相对路径指定，相对路径将被忽略。OMP_WORKTREE_DIR 环境变量会覆盖此设置。",
	},
});
effect(cfgWorktreeBase, value => {
	const dir = value?.trim() ? value : undefined;
	// Always applied, so an unset/empty value clears a previous override. setWorktreesDir expands `~`,
	// rejects relative paths, and returns the applied absolute path (undefined when cleared/rejected).
	if (!setWorktreesDir(dir) && dir) {
		logger.warn("Settings: worktree.base must be an absolute or ~-relative path; ignoring", { value: dir });
	}
});

export const cfgTaskEager = register({
	id: "task.eager",
	protocolDefault: ["rpc", "acp"],
	type: "enum",
	values: ["default", "preferred", "always"] as const,
	default: "default",
	ui: {
		tab: "tasks",
		group: "Subagents",
		label: "偏好任务委派",
		description: "推动将工作委派给子代理的力度",
		options: [
			{
				value: "default",
				label: "默认",
				description: "使用所选模型的策略；部分模型需要显式委派请求",
			},
			{ value: "preferred", label: "偏好", description: "向系统提示添加委派指导" },
			{ value: "always", label: "总是", description: "提示指导外加第一轮委派提醒" },
		],
	},
});

export const cfgTaskBatch = register({
	id: "task.batch",
	protocolDefault: ["rpc", "acp"],
	type: "boolean",
	default: true,
	ui: {
		tab: "tasks",
		group: "Subagents",
		label: "批量任务调用",
		description:
			"将 task 工具切换为批量形态:一次调用携带 { context, tasks[] }——每个条目一个子代理,可选的逐条目 agent(默认为会话派生策略 agent)、逐条目隔离,以及预置到每个任务前的必需共享 context。当 async.enabled=true 时,每次派生作为独立的后台代理运行,遵循常规的 idle/parked 生命周期;否则调用会阻塞以等待合并结果。禁用则恢复扁平的单个派生 schema。",
	},
});

export const cfgTaskFile = register({
	id: "task.file",
	type: "boolean",
	default: false,
	ui: {
		tab: "tasks",
		group: "Subagents",
		label: "来自文件的任务指令",
		description:
			"允许任务工具从文件 (taskFile) 读取子智能体指令，并记录其路径和 SHA-256。",
	},
});

export const cfgTaskStructured = register({
	id: "task.structured",
	type: "boolean",
	default: false,
	ui: {
		tab: "tasks",
		group: "Subagents",
		label: "结构化任务结果",
		description:
			"在 task 工具上公开 outputSchema/schemaMode，并通过 yield 工具返回子代理结果，同时依据调用方或代理输出模式进行校验。关闭时：task 子代理没有 yield 工具，其最终消息以纯文本返回，但定义中设置了 structured: true 的代理除外。Eval agent()/workpool 启动始终保留结构化结果。",
	},
});

export const cfgTaskSpeculativeLaunch = register({
	id: "task.speculativeLaunch",
	type: "boolean",
	default: true,
	ui: {
		tab: "tasks",
		group: "Subagents",
		label: "推测性任务启动",
		description:
			"每个批量子代理在其 tasks[] 项完成流式输出后立即启动，而无需等待整个 task 调用完成。如果已完成的调用未通过校验、被阻止或其参数发生变化，已启动的代理将被中止。需要自动允许 task 审批且没有扩展工具生命周期处理器。",
	},
});

export const cfgTaskEnableEffort = register({
	id: "task.enableEffort",
	type: "boolean",
	default: false,
	ui: {
		tab: "tasks",
		group: "Subagents",
		label: "按任务思考力度",
		description:
			"在 task 派生时暴露可选的 effort 参数,允许调用方覆盖每个子代理的思考级别",
	},
});

export const cfgTaskMaxConcurrency = register({
	id: "task.maxConcurrency",
	protocolDefault: ["rpc", "acp"],
	type: "number",
	default: 32,
	ui: {
		tab: "tasks",
		group: "Subagents",
		label: "最大并发任务数",
		description: "并发运行的子代理最大数量",
		options: [
			{ value: "0", label: "无限制" },
			{ value: "1", label: "1 个任务" },
			{ value: "2", label: "2 个任务" },
			{ value: "4", label: "4 个任务" },
			{ value: "8", label: "8 个任务" },
			{ value: "16", label: "16 个任务" },
			{ value: "32", label: "32 个任务" },
			{ value: "64", label: "64 个任务" },
		],
	},
});

export const cfgTaskEnableLsp = register({
	id: "task.enableLsp",
	type: "boolean",
	default: false,
	ui: {
		tab: "tasks",
		group: "Subagents",
		label: "子代理中的 LSP",
		description:
			"允许通过 task 工具派生的子代理使用 lsp 工具。默认关闭以保持子代理成本低廉;当 LSP 感知的委派值得额外 tokens 时启用。",
	},
});

export const cfgTaskMaxRecursionDepth = register({
	id: "task.maxRecursionDepth",
	protocolDefault: ["rpc", "acp"],
	type: "number",
	default: 2,
	ui: {
		tab: "tasks",
		group: "Subagents",
		label: "最大任务递归深度",
		description: "子代理可以派生自己的子代理的嵌套深度",
		options: [
			{ value: "-1", label: "无限制" },
			{ value: "0", label: "无" },
			{ value: "1", label: "一层" },
			{ value: "2", label: "两层" },
			{ value: "3", label: "三层" },
		],
	},
});

export const cfgTaskMaxRuntimeMs = register({
	id: "task.maxRuntimeMs",
	type: "number",
	default: 0,
	ui: {
		tab: "tasks",
		group: "Subagents",
		label: "最大子代理运行时间",
		description:
			"每个子代理的硬墙钟限制(毫秒)。0 禁用。针对逃脱推理层看门狗的提供商侧流挂起提供纵深防御;触发带有 'timed out' 原因的正常子代理中止。",
		options: [
			{ value: "0", label: "无限制", description: "默认" },
			{ value: "300000", label: "5 分钟" },
			{ value: "900000", label: "15 分钟" },
			{ value: "1800000", label: "30 分钟" },
			{ value: "3600000", label: "1 小时" },
		],
	},
});

export const cfgTaskCompletionProbe = register({
	id: "task.completionProbe",
	type: "boolean",
	default: true,
	ui: {
		tab: "tasks",
		group: "Subagents",
		label: "子代理完成度探测",
		description:
			"通过类似 /btw 这样的缓存侧请求，询问正在工作的子代理其任务完成度：在继续运行 2、5、10 和 30 分钟后询问，之后每小时询问一次。估算结果显示在等待视图和任务视图中的子代理旁边。仅询问交互式会话主代理生成的子代理；print、RPC、ACP 和 SDK 运行从不探测。",
	},
});

export const cfgTaskAgentIdleTtlMs = register({
	id: "task.agentIdleTtlMs",
	type: "number",
	default: 420_000,
	ui: {
		tab: "tasks",
		group: "Subagents",
		label: "代理空闲 TTL",
		description:
			"空闲子代理在被停驻到磁盘前保持内存存活的时间(毫秒)。停驻的代理在收到消息或恢复时自动唤醒。0 让空闲代理保持存活直到退出。",
	},
});

export const cfgTaskSoftRequestBudget = register({
	id: "task.softRequestBudget",
	type: "number",
	default: 200,
	ui: {
		tab: "tasks",
		group: "Subagents",
		label: "子代理软请求预算",
		description:
			"每个子代理的软性请求预算（每次运行的助手请求数）。超过后会注入一条收尾引导消息（见 task.softRequestBudgetNotice）；达到预算的 1.5 倍时，运行会被强制停止，代理必须交回其部分发现。0 表示禁用此防护。捆绑的 scout/sonic 代理受较低的内置预算上限限制，因此低于该上限的值仍适用于它们。task.agentSoftRequestBudget 条目会为其指定的代理替换此预算。",
		options: [
			{ value: "0", label: "已禁用" },
			{ value: "90", label: "90 次请求" },
			{ value: "150", label: "150 次请求" },
			{ value: "200", label: "200 次请求", description: "默认" },
		],
	},
});

/**
 * Validates `task.agentSoftRequestBudget`: exact agent name → request budget,
 * a non-negative integer (0 disables that agent's guard). A `null` entry clears
 * one inherited from a lower-priority settings layer.
 */
function validateAgentSoftRequestBudget(value: unknown): void {
	if (value === undefined || value === null) return;
	if (!isRecord(value)) {
		const received = Array.isArray(value) ? "an array" : `a ${typeof value}`;
		throw new Error(
			`Invalid task.agentSoftRequestBudget: expected a map of agent name to request budget, got ${received}.`,
		);
	}
	for (const [agentName, budget] of Object.entries(value)) {
		if (budget === null || (typeof budget === "number" && Number.isSafeInteger(budget) && budget >= 0)) continue;
		throw new Error(
			`Invalid task.agentSoftRequestBudget.${agentName}: expected a non-negative integer request count (0 disables the guard), got ${Bun.inspect(budget)}.`,
		);
	}
}

export const cfgTaskAgentSoftRequestBudget = register({
	id: "task.agentSoftRequestBudget",
	type: "record",
	default: EMPTY_AGENT_SOFT_REQUEST_BUDGET,
	validate: validateAgentSoftRequestBudget,
});

export const cfgTaskSoftRequestBudgetNotice = register({
	id: "task.softRequestBudgetNotice",
	type: "boolean",
	default: true,
	ui: {
		tab: "tasks",
		group: "Subagents",
		label: "软请求预算通知",
		description:
			"当子代理超过其软请求预算时注入一条引导通知,要求它在 1.5 倍强制让出停止之前收尾。",
	},
});

export const cfgTaskMaxEffort = register({
	id: "task.maxEffort",
	type: "enum",
	values: THINKING_EFFORTS,
	default: "max",
	ui: {
		tab: "tasks",
		group: "Subagents",
		label: "每次派生的最大思考力度",
		description:
			"task 工具每次派生 effort 提示所允许的最大推理力度。较低的值可防止调用方将子代理提升到该上限之上;默认保留模型的全部范围。",
		options: THINKING_EFFORTS.map(getThinkingLevelMetadata),
	},
});

export const cfgTaskDisabledAgents = register({
	id: "task.disabledAgents",
	protocolDefault: ["rpc", "acp"],
	type: "array",
	default: [] as string[],
});

export const cfgTaskAgentModelOverrides = register({
	id: "task.agentModelOverrides",
	protocolDefault: ["rpc", "acp"],
	type: "record",
	default: DEFAULT_AGENT_MODEL_OVERRIDES,
});

export const cfgTaskAgentServiceTierOverrides = register({
	id: "task.agentServiceTierOverrides",
	protocolDefault: ["rpc", "acp"],
	type: "record",
	default: EMPTY_AGENT_SERVICE_TIER_OVERRIDES,
	validate: validateAgentServiceTierOverrides,
});

export const cfgTaskAgentCompactionThresholdOverrides = register({
	id: "task.agentCompactionThresholdOverrides",
	protocolDefault: ["rpc", "acp"],
	type: "record",
	default: EMPTY_AGENT_COMPACTION_THRESHOLD_OVERRIDES,
	validate: validateAgentCompactionThresholdOverrides,
});

export const cfgTaskAgentAccountPools = register({
	id: "task.agentAccountPools",
	protocolDefault: ["rpc", "acp"],
	type: "record",
	default: EMPTY_AGENT_ACCOUNT_POOLS,
	validate: validateAgentAccountPools,
});

export const cfgTaskAgentPrewalk = register({
	id: "task.agentPrewalk",
	protocolDefault: ["rpc", "acp"],
	type: "record",
	default: {} as Record<string, string>,
});

export const cfgTaskAgentAdvisor = register({
	id: "task.agentAdvisor",
	protocolDefault: ["rpc", "acp"],
	type: "record",
	default: {} as Record<string, string>,
});

export const cfgTaskPrewalk = register({
	id: "task.prewalk",
	type: "boolean",
	default: false,
	ui: {
		tab: "tasks",
		group: "Subagents",
		label: "通用任务 Prewalk",
		description:
			"为捆绑的通用 `task` 子代理启用预走：它在其解析出的模型上启动，规划并开始实现，然后在首次 edit/write. 后移交给 'smol' 角色。按代理覆盖项（task.agentPrewalk，从 /agents 中心配置）和用户代理 `prewalk` frontmatter 仍然适用，不受此开关影响。",
	},
});

export const cfgTaskShowResolvedModelBadge = register({
	id: "task.showResolvedModelBadge",
	type: "boolean",
	default: false,
	ui: {
		tab: "appearance",
		group: "Display",
		label: "显示解析后的模型徽章",
		description: "在 task 组件状态栏中显示每个子代理实际使用的模型 ID",
	},
});
effect(cfgTaskShowResolvedModelBadge, setFeedModelBadgeEnabled);
