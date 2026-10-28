/**
 * Settings declared by this domain (see `config/registry.ts`). Declaration order is the
 * settings-panel order; `config/all-settings.ts` registers every domain.
 */
import { ADVISOR_SEVERITIES } from "@oh-my-pi/pi-tui/chat/messages";
import { ADVISOR_REVIEW_MODES, ADVISOR_SYNC_BACKLOG_MODES } from "@oh-my-pi/pi-tui/overlays/advisor-config";
import { register } from "../config/registry";
import { ADVISOR_DEFAULT_BUDGET_PER_UPDATE } from "./emission-guard";

// Advisor is interactive-session assistance: protocol hosts opt in explicitly instead of inheriting the
// user's local preference, and get the default tuning rather than the user's local tuning.
export const cfgAdvisorEnabled = register({
	id: "advisor.enabled",
	protocolDefault: ["rpc", "acp"],
	type: "boolean",
	default: false,
	ui: {
		tab: "model",
		group: "Advisor",
		label: "启用顾问",
		description:
			"配对第二个模型(分配给 'advisor' 角色),被动审查每一轮并在其中注入笔记。",
	},
});

export const cfgAdvisorSyncBacklog = register({
	id: "advisor.syncBacklog",
	protocolDefault: ["rpc", "acp"],
	type: "enum",
	values: ADVISOR_SYNC_BACKLOG_MODES,
	default: "off",
	ui: {
		tab: "model",
		group: "Advisor",
		label: "顾问同步积压",
		description:
			"暂停主代理，直到顾问积压降至阈值以下。数值设置最多等待 30 秒；严格设置会等待所有已安排的审查，且无实际时间上限。关闭会禁用追赶延迟。中止、失败和处置会解除等待。",
		condition: "advisorEnabled",
	},
});

export const cfgAdvisorImmuneTurns = register({
	id: "advisor.immuneTurns",
	protocolDefault: ["rpc", "acp"],
	type: "number",
	default: 3,
	ui: {
		tab: "model",
		group: "Advisor",
		label: "顾问免打扰轮数",
		description:
			"在顾问关注或阻塞项中断后，将后续关注作为非中断旁白传递，持续该数量的主轮次。阻塞项不受冷却时间限制。",
		options: [
			{ value: "0", label: "0 步", description: "无冷却时间。" },
			{ value: "1", label: "1 步" },
			{ value: "2", label: "2 步" },
			{ value: "3", label: "3 步", description: "默认。" },
			{ value: "4", label: "4 步" },
			{ value: "5", label: "5 步" },
		],
		condition: "advisorEnabled",
	},
});

export const cfgAdvisorContinueSeverity = register({
	id: "advisor.continueSeverity",
	protocolDefault: ["rpc", "acp"],
	type: "enum",
	values: ADVISOR_SEVERITIES,
	default: "concern",
	ui: {
		tab: "model",
		group: "Advisor",
		label: "Advisor Continue 严重程度",
		description:
			"在代理完成最终回答后，能唤醒代理的 Advisor 备注的最低严重程度。较低严重程度的备注会作为卡片保留在会话记录末尾，并在您发送下一条消息时传递给代理。",
		options: [
			{ value: "nit", label: "小建议", description: "每条备注都会继续运行。" },
			{ value: "concern", label: "待关注问题", description: "关注项和阻塞项都会继续运行。默认。" },
			{ value: "blocker", label: "阻断问题", description: "仅阻塞项会继续运行。" },
		],
		condition: "advisorEnabled",
	},
});

export const cfgAdvisorReviewMode = register({
	id: "advisor.reviewMode",
	protocolDefault: ["rpc", "acp"],
	type: "enum",
	values: ADVISOR_REVIEW_MODES,
	default: "turn",
	ui: {
		tab: "model",
		group: "Advisor",
		label: "顾问审查模式",
		description:
			"当不存在 WATCHDOG.yml 名册时，默认顾问节奏：turn 模式会在每个主回合审查；agent-end 模式仅在最终产出时审查。",
		options: [
			{ value: "turn", label: "每个回合", description: "审查每次主更新（工具调用回合）。" },
			{ value: "agent-end", label: "智能体结束时", description: "仅在最终产出时审查（每次运行一次）。" },
		],
		condition: "advisorEnabled",
	},
});

export const cfgAdvisorReviewInterval = register({
	id: "advisor.reviewInterval",
	protocolDefault: ["rpc", "acp"],
	type: "number",
	default: 1,
	ui: {
		tab: "model",
		group: "Advisor",
		label: "顾问审查间隔",
		description:
			"当不存在 WATCHDOG.yml 名册时，默认顾问节奏：每隔 N 个符合条件的主更新审查一次。1 = 每次更新。跳过的更新将随下一次计划审查一并发送。",
		options: [
			{ value: "1", label: "每次符合条件的更新", description: "默认。" },
			{ value: "2", label: "每 2 次" },
			{ value: "3", label: "每 3 次" },
			{ value: "5", label: "每 5 次" },
			{ value: "10", label: "每 10 次" },
		],
		condition: "advisorEnabled",
	},
});

export const cfgAdvisorMaxNotesPerUpdate = register({
	id: "advisor.maxNotesPerUpdate",
	protocolDefault: ["rpc", "acp"],
	type: "number",
	default: ADVISOR_DEFAULT_BUDGET_PER_UPDATE,
	ui: {
		tab: "model",
		group: "Advisor",
		label: "顾问每次更新最多提示条数",
		description:
			"每次顾问提示更新可接受的非阻塞性建议条数上限（1–32；界面提供 1–5 快捷选项）。阻塞性问题不受此限制。",
		options: [
			{ value: "1", label: "1 条", description: "防刷屏（严格）。" },
			{ value: "2", label: "2 条" },
			{ value: "3", label: "3 条" },
			{ value: "4", label: "4 条", description: "前沿推理模型。默认。" },
			{ value: "5", label: "5 条" },
		],
		condition: "advisorEnabled",
	},
});

export const cfgAdvisorEvictStaleResults = register({
	id: "advisor.evictStaleResults",
	protocolDefault: ["rpc", "acp"],
	type: "boolean",
	default: true,
	ui: {
		tab: "model",
		group: "Advisor",
		label: "Advisor 清除过期结果",
		description:
			"每次审查前，将 Advisor 在较旧审查中的 read/grep/glob 输出替换为简短占位符。最新审查会被保留。",
		condition: "advisorEnabled",
	},
});
