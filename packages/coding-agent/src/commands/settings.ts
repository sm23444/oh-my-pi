/**
 * Settings declared by this domain (see `config/registry.ts`). Declaration order is the
 * settings-panel order; `config/all-settings.ts` registers every domain.
 */
import { register } from "../config/registry";
import { DEFAULT_SHARE_URL } from "@oh-my-pi/pi-wire";

export const cfgShareServerUrl = register({
	id: "share.serverUrl",
	type: "string",
	default: DEFAULT_SHARE_URL,
	ui: {
		tab: "interaction",
		group: "协作",
		label: "分享服务器",
		description:
			"分享 viewer/upload 基地址，供 /share 使用（加密 blob 上传 + 查看器；链接格式为 <base>/<id>#<key>）",
	},
});

export const cfgShareStore = register({
	id: "share.store",
	type: "enum",
	values: ["blob", "gist"] as const,
	default: "blob",
	ui: {
		tab: "interaction",
		group: "协作",
		label: "分享存储",
		description: "/share 将加密的会话 blob 上传到哪里",
		options: [
			{
				value: "blob",
				label: "加密 Blob",
				description: "上传到分享服务器(无需 GitHub 账户;避免 gist API 限流)",
			},
			{
				value: "gist",
				label: "GitHub Gist 代码片段",
				description: "推送到 secret gist(需要已认证的 gh),失败时回退到分享服务器",
			},
		],
	},
});

export const cfgShareRedactSecrets = register({
	id: "share.redactSecrets",
	type: "boolean",
	default: true,
	ui: {
		tab: "interaction",
		group: "协作",
		label: "分享机密脱敏",
		description: "上传前对 /share 快照运行机密混淆器(使用 secrets.* 配置)",
	},
});
