/**
 * Automatic session-title settings: which generator names a session, how its
 * card icon shows, and what refreshes it: a todo replan, or the judge finding
 * it stale after a run of operator prompts since it last changed.
 */
import { register } from "../config/registry";

/** The `title.icons` styles. */
export const TITLE_ICONS = ["nf+emoji", "emoji", "boring"] as const;
/** How a session title shows its card icon: see {@link cfgTitleIcons}. */
export type TitleIcons = (typeof TITLE_ICONS)[number];

export const cfgTitleIcons = register({
	id: "title.icons",
	type: "enum",
	values: TITLE_ICONS,
	default: "nf+emoji",
	ui: {
		tab: "appearance",
		group: "Display",
		label: "标题图标",
		description: "作为新生成或 /rename 会话标题开头的图标和短代码",
		options: [
			{
				value: "nf+emoji",
				label: "Nerd Font 字形 + Emoji 表情",
				description: "如果 Nerd Font 符号预设能渲染，则使用 Nerd Font 字形，否则使用 Emoji 表情（默认）",
			},
			{ value: "emoji", label: "Emoji 表情", description: "始终使用 Emoji 表情" },
			{ value: "boring", label: "朴素", description: "纯标题：无图标或代码" },
		],
	},
});

export const cfgTitleGenerator = register({
	id: "title.generator",
	type: "enum",
	values: ["fork", "tiny"] as const,
	default: "fork",
	ui: {
		tab: "tasks",
		group: "Modes",
		label: "标题生成器",
		description: "根据用户消息为无标题会话命名",
		options: [
			{
				value: "fork",
				label: "复刻",
				description:
					"会话模型回复的附带回合：读取其提示缓存，添加卡片图标（默认）",
			},
			{ value: "tiny", label: "极小", description: "仅使用标题模型角色；生成不带卡片的纯标题" },
		],
	},
});

export const cfgTitleRefreshOnReplan = register({
	id: "title.refreshOnReplan",
	type: "boolean",
	default: true,
	ui: {
		tab: "tasks",
		group: "Modes",
		label: "重新规划时刷新标题",
		description: "在 todo init 重新规划后刷新生成的会话标题,除非标题由用户设置",
	},
});

export const cfgTitleRefreshAfterPrompts = register({
	id: "title.refreshAfterPrompts",
	type: "number",
	default: 0,
	ui: {
		tab: "tasks",
		group: "Modes",
		label: "按提问次数刷新标题",
		description:
			"每收到指定次数的用户提问后，请评判模型检查自动生成的会话标题是否仍符合对话内容；若不符合，则重新生成",
		options: [
			{ value: "0", label: "关闭", description: "默认" },
			{ value: "1", label: "每次提问后" },
			{ value: "3", label: "每 3 次提问后" },
			{ value: "5", label: "每 5 次提问后" },
			{ value: "10", label: "每 10 次提问后" },
		],
	},
});
