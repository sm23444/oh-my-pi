/**
 * Settings declared by this domain (see `config/registry.ts`). Declaration order is the
 * settings-panel order; `config/all-settings.ts` registers every domain.
 */
import { register } from "../config/registry";
import { DEFAULT_RELAY_URL } from "./protocol";

// Collab
export const cfgCollabRelayUrl = register({
	id: "collab.relayUrl",
	type: "string",
	default: DEFAULT_RELAY_URL,
	ui: {
		tab: "interaction",
		group: "Collab",
		label: "中继 URL",
		description: "/collab 使用的 relay (wss://host[:port])",
	},
});

export const cfgCollabWebUrl = register({
	id: "collab.webUrl",
	type: "string",
	default: "",
	ui: {
		tab: "interaction",
		group: "Collab",
		label: "Web UI 地址 URL",
		description:
			"/collab 链接使用的浏览器 UI;留空则从 collab.relayUrl 派生;显式 http:// 仅限 localhost",
	},
});

export const cfgCollabDisplayName = register({
	id: "collab.displayName",
	type: "string",
	default: "",
	ui: {
		tab: "interaction",
		group: "Collab",
		label: "显示名称",
		description: "向其他协作参与者显示的名称(默认:OS 用户名)",
	},
});

export const cfgCollabAutoStart = register({
	id: "collab.autoStart",
	type: "enum",
	values: ["off", "view", "control"] as const,
	default: "off",
	ui: {
		tab: "interaction",
		group: "Collab",
		label: "自动启动",
		description:
			"每个交互式会话启动时即通过 collab.relayUrl 托管，并发布到本地注册表（omp collab list）；切换会话时房间会轮换",
		options: [
			{ value: "off", label: "关闭", description: "仅在运行 /collab 时共享" },
			{
				value: "view",
				label: "只读",
				description: "自动托管；由注册表分发只读链接（omp collab link --view）",
			},
			{
				value: "control",
				label: "控制",
				description: "自动托管；由注册表分发可向会话发送提示的控制链接",
			},
		],
	},
});
