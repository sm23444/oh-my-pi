/**
 * Settings declared by this domain (see `config/registry.ts`). Declaration order is the
 * settings-panel order; `config/all-settings.ts` registers every domain.
 */
import { register } from "../config/registry";
import { STT_SUBMIT_TRIGGER_OPTIONS, STT_SUBMIT_TRIGGER_VALUES } from "./submit-trigger";

// Speech-to-text
export const cfgSttEnabled = register({
	id: "stt.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "interaction",
		group: "Speech",
		label: "语音转文字",
		description: "通过麦克风启用语音转文字输入",
	},
});

export const cfgSttLanguage = register({ id: "stt.language", type: "string", default: "en" });

export const cfgSttSubmitTrigger = register({
	id: "stt.submitTrigger",
	type: "enum",
	values: STT_SUBMIT_TRIGGER_VALUES,
	default: "never",
	ui: {
		tab: "interaction",
		group: "Speech",
		label: "语音转文字提交触发",
		description:
			"选择语音听写何时自动提交:从不、松开(2 个以上词)、松开并完成整句,或当我说提交时。",
		options: STT_SUBMIT_TRIGGER_OPTIONS,
	},
});
