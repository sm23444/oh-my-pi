/**
 * Manage configuration settings.
 */

import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { configHelp as commandHelp } from "../cli/command-help";
import { type ConfigAction, type ConfigCommandArgs, type ConfigScope, runConfigCommand } from "../cli/config-cli";
import { initTheme } from "@oh-my-pi/pi-tui/theme";

const ACTIONS: ConfigAction[] = ["list", "get", "set", "reset", "path", "init-xdg"];

export default class Config extends Command {
	static description = commandHelp.description;
	static args = {
		action: Args.string({
			description: "配置操作",
			required: false,
			options: ACTIONS,
		}),
		key: Args.string({
			description: "设置键",
			required: false,
		}),
		value: Args.string({
			description: "值(用于 set/reset)",
			required: false,
			multiple: true,
		}),
	};

	static flags = {
		json: Flags.boolean({ description: "以 JSON 输出" }),
		scope: Flags.string({
			description:
				"使用 list 时：仅显示“全局”（agent 目录中的 config.yml）或“项目”（<cwd>/.omp）层所设置的键（按写入原样）。",
			options: ["global", "project"],
		}),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Config);
		const action = (args.action ?? "list") as ConfigAction;
		const value = Array.isArray(args.value) ? args.value.join(" ") : args.value;

		const cmd: ConfigCommandArgs = {
			action,
			key: args.key,
			value,
			flags: {
				json: flags.json,
				scope: flags.scope as ConfigScope | undefined,
			},
		};

		await initTheme();
		await runConfigCommand(cmd);
	}
}
