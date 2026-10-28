/**
 * Settings declared by this domain (see `config/registry.ts`). Declaration order is the
 * settings-panel order; `config/all-settings.ts` registers every domain.
 */
import { register } from "../config/registry";

// Auto-Learn (experimental): post-stop nudge to capture lessons to memory
// and mint/enhance isolated managed skills under ~/.omp/agent/managed-skills.
// Master flag is default-off → inert (read live at every stop); sub-flags gate behaviour.
export const cfgAutolearnEnabled = register({
	id: "autolearn.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "memory",
		group: "Auto-Learn",
		label: "自动学习(实验性)",
		description:
			"在代理停止后，引导其将经验教训捕获到记忆中，并 create/enhance 隔离的托管技能",
	},
});

export const cfgAutolearnAutoContinue = register({
	id: "autolearn.autoContinue",
	type: "boolean",
	default: false,
	ui: {
		tab: "memory",
		group: "Auto-Learn",
		label: "停止时自动运行捕获",
		description:
			"开启时,在停止时自动运行一次私有捕获轮(消耗额外 tokens)。关闭时,仅保留常驻的自动学习指导。",
		condition: "autolearnActive",
	},
});

// Config-file-only knob (numbers without `options` are hidden from the UI).
export const cfgAutolearnMinToolCalls = register({ id: "autolearn.minToolCalls", type: "number", default: 5 });
