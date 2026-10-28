/**
 * Settings declared by this domain (see `config/registry.ts`). Declaration order is the
 * settings-panel order; `config/all-settings.ts` registers every domain.
 */
import { register } from "../config/registry";
import { DEFAULT_STREAM_URL } from "@oh-my-pi/pi-wire";

const EMPTY_STRING_ARRAY: string[] = [];

// Live streaming (omp stream)
export const cfgStreamServerUrl = register({
	id: "stream.serverUrl",
	type: "string",
	default: DEFAULT_STREAM_URL,
	ui: {
		tab: "interaction",
		group: "Stream",
		label: "直播服务器",
		description:
			"由 `omp stream` (https://host[:port]) 使用的实时流服务器；观众可在 <base>/<your Stencil username> 观看",
	},
});

export const cfgStreamRedactPatterns = register({
	id: "stream.redactPatterns",
	type: "array",
	default: EMPTY_STRING_ARRAY,
	ui: {
		tab: "interaction",
		group: "Stream",
		label: "额外脱敏模式",
		description:
			"在 env/secrets.yml 的值与内置凭据形态之外，额外从每条直播行中脱敏的正则表达式",
	},
});
