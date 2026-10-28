/**
 * Settings declared by this domain (see `config/registry.ts`). Declaration order is the
 * settings-panel order; `config/all-settings.ts` registers every domain.
 */
import { register } from "../config/registry";

// Memory backend selector — picks between local memories pipeline,
// Mnemopi local SQLite, Hindsight remote memory, Sharpshooter project
// decisions, or off. The legacy
// `memories.enabled` flag is migration input only; see config/settings.ts.
// Protocol hosts (RPC/ACP) start with memory off: embedders opt in through their own settings layer.
export const cfgMemoryBackend = register({
	id: "memory.backend",
	protocolDefault: ["rpc", "acp"],
	type: "enum",
	values: ["off", "local", "hindsight", "mnemopi", "sharpshooter"] as const,
	default: "off",
	ui: {
		tab: "memory",
		group: "General",
		label: "记忆后端",
		description: "关闭、本地摘要管线、Mnemopi SQLite、Hindsight 远程记忆或 Sharpshooter",
		options: [
			{ value: "off", label: "关闭", description: "不运行任何记忆子系统" },
			{ value: "local", label: "本地", description: "本地 rollout 总结流水线 (memory_summary.md)" },
			{ value: "hindsight", label: "Hindsight 远程记忆", description: "Vectorize Hindsight 远程记忆服务" },
			{
				value: "mnemopi",
				label: "Mnemopi 记忆后端",
				description: "本地 SQLite recall/retain 后端，支持可选嵌入",
			},
			{
				value: "sharpshooter",
				label: "Sharpshooter 决策",
				description:
					"受摩擦阈值控制的项目决策文件（architecture/product/style），在后台汇总",
			},
		],
	},
});
