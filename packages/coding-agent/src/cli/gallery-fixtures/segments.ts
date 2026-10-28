import { truncateToWidth } from "@oh-my-pi/pi-tui";
import type { StatusLineSegmentId } from "@oh-my-pi/pi-tui/status-line/schema";
import { ALL_SEGMENT_IDS, renderSegment } from "@oh-my-pi/pi-tui/status-line/segments";
import type { SegmentContext } from "@oh-my-pi/pi-tui/status-line/types";
import { theme } from "@oh-my-pi/pi-tui/theme";
import type { GallerySessionOptions } from "./preview-session";
import { createGallerySession, GALLERY_CONTEXT_WINDOW } from "./preview-session";
import type { GalleryPreviewEntry } from "./types";

const FIXED_NOW = new Date(2026, 7, 29, 14, 7, 9);

interface SegmentVariantSpec {
	label: string;
	context?: Partial<SegmentContext>;
	session?: GallerySessionOptions;
}

/** Production status-segment registry in display order. */
export function getSegmentGalleryInventory(): readonly StatusLineSegmentId[] {
	return [...ALL_SEGMENT_IDS];
}

/** Deterministic full context for isolated status-segment previews and tests. */
export function createGallerySegmentContext(sessionOptions?: GallerySessionOptions): SegmentContext {
	return {
		session: createGallerySession(sessionOptions),
		now: FIXED_NOW,
		hostname: "gallery-host",
		sessionAccent: false,
		activeRepo: {
			cwd: "/workspace/oh-my-pi",
			repoRoot: "/workspace/oh-my-pi",
			relativeRepoRoot: "oh-my-pi",
			source: "single-direct-child-repo",
		},
		width: 100,
		options: {
			model: { showThinkingLevel: true },
			path: { abbreviate: false, maxLength: 40, stripWorkPrefix: false },
			git: { showBranch: true, showStaged: true, showUnstaged: true, showUntracked: true },
			time: { format: "24h", showSeconds: true },
		},
		compactThinkingLevel: false,
		planMode: { enabled: true, paused: false },
		prewalk: null,
		loopMode: null,
		goalMode: null,
		goalStatusInFooter: true,
		vibeMode: null,
		vim: null,
		collab: { role: "host", participantCount: 3 },
		stream: null,
		recording: false,
		usageStats: {
			input: 12_400,
			output: 3_600,
			cacheRead: 48_000,
			cacheWrite: 1_200,
			totalTokens: 65_200,
			orchestrationInput: 900,
			orchestrationOutput: 240,
			orchestrationCacheRead: 3_000,
			premiumRequests: sessionOptions?.premiumRequests ?? 2,
			cost: sessionOptions?.cost ?? 0.42,
			tokensPerSecond: 87.3,
		},
		contextPercent: 62,
		contextTokens: 124_000,
		contextWindow: GALLERY_CONTEXT_WINDOW,
		autoCompactEnabled: true,
		compactionSpeculation: "idle",
		speculationBlinkOn: false,
		subagentCount: 3,
		activeMs: 372_000,
		turnElapsedMs: null,
		git: {
			branch: "gallery/reference",
			status: { staged: 2, unstaged: 3, untracked: 1 },
			pr: { number: 1842, url: "https://github.com/can1357/oh-my-pi/pull/1842" },
		},
		worktree: null,
		usage: {
			tier: "Pro",
			fiveHour: { percent: 32, resetMinutes: 71 },
			sevenDay: { percent: 68, resetHours: 52 },
		},
	};
}

function variantsFor(id: StatusLineSegmentId): readonly SegmentVariantSpec[] {
	switch (id) {
		case "pi":
			return [
				{ label: "空闲", context: { turnElapsedMs: null } },
				{ label: "活跃", context: { turnElapsedMs: 92_000 } },
				{ label: "已聚焦的子代理", context: { focusedAgentId: "Scout" } },
			];
		case "status":
			return [
				{ label: "多个扩展状态", context: { hookStatuses: ["Indexer ready", "Tests passing"] } },
			];
		case "model":
			return [
				{ label: "正常" },
				{ label: "快速模式 + 顾问已启用", session: { fastMode: true, advisorStatus: "running" } },
				{ label: "顾问警告", session: { advisorStatus: "quota_exhausted" } },
				{ label: "顾问出错", session: { advisorStatus: "error" } },
				{ label: "顾问已暂停", session: { advisorStatus: "paused" } },
				{ label: "顾问已完成（已交出控制权）", session: { advisorStatus: "running", advisorYielded: true } },
			];
		case "mode":
			return [
				{ label: "活跃", context: { planMode: { enabled: true, paused: false } } },
				{ label: "警告 / 已暂停", context: { planMode: { enabled: true, paused: true } } },
				{ label: "预遍历进行中", context: { planMode: null, prewalk: { enabled: true } } },
				{ label: "vibe 模式已启用", context: { planMode: null, vibeMode: { enabled: true } } },
				{
					label: "循环进行中",
					context: {
						planMode: null,
						loopMode: { state: "running", limit: { kind: "iterations", initial: 10, remaining: 4 } },
					},
				},
				{
					label: "循环已暂停",
					context: {
						planMode: null,
						loopMode: { state: "paused", limit: { kind: "iterations", initial: 10, remaining: 4 } },
					},
				},
				{
					label: "目标进行中",
					context: { planMode: null, goalMode: { enabled: true, paused: false } },
					session: { goalStatus: "active" },
				},
				{
					label: "目标已暂停",
					context: { planMode: null, goalMode: { enabled: true, paused: true } },
					session: { goalStatus: "paused" },
				},
				{
					label: "目标已完成",
					context: { planMode: null, goalMode: { enabled: true, paused: false } },
					session: { goalStatus: "complete" },
				},
				{
					label: "目标预算警告",
					context: { planMode: null, goalMode: { enabled: true, paused: false } },
					session: { goalStatus: "budget-limited" },
				},
				{
					label: "目标已丢弃",
					context: { planMode: null, goalMode: { enabled: true, paused: false } },
					session: { goalStatus: "dropped" },
				},
			];
		case "path":
			return [
				{ label: "工作区路径" },
				{
					label: "关联工作树",
					context: {
						options: { path: { stripWorkPrefix: true } },
						worktree: { projectName: "oh-my-pi", worktreeName: "gallery-reference" },
						git: { branch: "gallery-reference", status: null, pr: null },
					},
				},
			];
		case "git":
			return [
				{
					label: "无更改",
					context: { git: { branch: "main", status: { staged: 0, unstaged: 0, untracked: 0 }, pr: null } },
				},
				{ label: "有未提交更改" },
			];
		case "cost":
			return [
				{ label: "按量计费 + 高级版 + 顾问" },
				{
					label: "订阅",
					session: { usingSubscription: true, cost: 0, premiumRequests: 0, advisorCost: 0 },
				},
				{
					label: "订阅 + 子代理",
					session: { usingSubscription: true, cost: 0.38, premiumRequests: 0, advisorCost: 0 },
					context: { subagentTreeCost: 1.27 },
				},
				{
					label: "高级请求",
					session: { cost: 0, premiumRequests: 2, advisorCost: 0 },
				},
			];
		case "context_pct":
			return [
				{ label: "正常", context: { contextPercent: 22, contextTokens: 44_000 } },
				{ label: "警告", context: { contextPercent: 72, contextTokens: 144_000 } },
				{ label: "出错", context: { contextPercent: 96, contextTokens: 192_000 } },
				{
					label: "正在压缩",
					context: {
						contextPercent: 72,
						contextTokens: 144_000,
						compactionSpeculation: "running",
						speculationBlinkOn: true,
					},
				},
				{
					label: "已启用压缩",
					context: { contextPercent: 72, contextTokens: 144_000, compactionSpeculation: "armed" },
				},
			];
		case "time":
			return [
				{ label: "24 小时制（含秒）" },
				{ label: "12 小时制", context: { options: { time: { format: "12h", showSeconds: false } } } },
			];
		case "usage":
			return [
				{
					label: "所有窗口",
					context: {
						usage: {
							tier: "Pro",
							fiveHour: { percent: 32, resetMinutes: 71 },
							daily: { percent: 44, resetMinutes: 310 },
							sevenDay: { percent: 68, resetHours: 52 },
							monthly: { percent: 77, resetHours: 216 },
						},
					},
				},
				{
					label: "正常",
					context: { usage: { tier: "Pro", fiveHour: { percent: 24, resetMinutes: 75 } } },
				},
				{
					label: "警告",
					context: { usage: { tier: "Pro", fiveHour: { percent: 65, resetMinutes: 75 } } },
				},
				{
					label: "出错",
					context: { usage: { tier: "Pro", fiveHour: { percent: 92, resetMinutes: 75 } } },
				},
			];
		case "collab":
			return [
				{ label: "主持人已加入", context: { collab: { role: "host", participantCount: 3 } } },
				{ label: "访客已加入", context: { collab: { role: "guest", participantCount: 3 } } },
			];
		case "vim":
			return [
				{
					label: "正常",
					context: { vim: { mode: "normal", pending: "", selectedLines: 0, display: "text" } },
				},
				{
					label: "插入",
					context: { vim: { mode: "insert", pending: "", selectedLines: 0, display: "text" } },
				},
				{
					label: "视觉项数量",
					context: { vim: { mode: "visual-line", pending: "2d", selectedLines: 4, display: "text" } },
				},
				{
					label: "图标模式",
					context: { vim: { mode: "normal", pending: "", selectedLines: 0, display: "icon" } },
				},
			];
		default:
			return [{ label: "规范" }];
	}
}

function renderIsolatedSegment(id: StatusLineSegmentId, spec: SegmentVariantSpec, width: number): readonly string[] {
	const base = createGallerySegmentContext(spec.session);
	const override = spec.context;
	const context: SegmentContext = {
		...base,
		...override,
		width,
		options: { ...base.options, ...override?.options },
		usageStats: { ...base.usageStats, ...override?.usageStats },
		git: { ...base.git, ...override?.git },
	};
	const rendered = renderSegment(id, context);
	const content = rendered.visible ? rendered.content : theme.fg("dim", "（此示例中隐藏）");
	return [truncateToWidth(`  ${content}`, width)];
}

/** Every registered segment rendered directly through its production implementation. */
export function getSegmentGalleryEntries(): readonly GalleryPreviewEntry[] {
	return ALL_SEGMENT_IDS.map(id => ({
		id,
		heading: `segment · ${id}`,
		variants: variantsFor(id).map(spec => ({
			label: spec.label,
			render: width => renderIsolatedSegment(id, spec, width),
		})),
	}));
}
