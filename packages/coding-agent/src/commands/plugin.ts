/**
 * Manage plugins (install, uninstall, list, etc.).
 */

import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { pluginHelp as commandHelp } from "../cli/command-help";
import { type PluginAction, type PluginCommandArgs, runPluginCommand } from "../cli/plugin-cli";
import { initTheme } from "@oh-my-pi/pi-tui/theme";

const ACTIONS: PluginAction[] = [
	"install",
	"uninstall",
	"list",
	"link",
	"doctor",
	"features",
	"config",
	"enable",
	"disable",
	"marketplace",
	"discover",
	"upgrade",
];

export default class Plugin extends Command {
	static description = commandHelp.description;
	static aliases = ["plugins"];
	static args = {
		action: Args.string({
			description: "插件操作",
			required: false,
			options: ACTIONS,
		}),
		targets: Args.string({
			description: "包、路径或插件名称",
			required: false,
			multiple: true,
		}),
	};

	static flags = {
		json: Flags.boolean({ description: "以 JSON 输出" }),
		fix: Flags.boolean({ description: "尝试修复问题(doctor)" }),
		force: Flags.boolean({ description: "强制安装" }),
		"dry-run": Flags.boolean({
			description:
				"仅显示操作而不实际应用更改（安装、卸载、链接、升级市场插件）",
		}),
		local: Flags.boolean({ char: "l", description: "操作本地插件目录" }),
		enable: Flags.string({ description: "启用某个功能" }),
		disable: Flags.string({ description: "禁用某个功能" }),
		set: Flags.string({ description: "设置插件配置(key=value)" }),
		scope: Flags.string({
			description: "安装范围:\"user\"(默认)或 \"project\"",
			options: ["user", "project"],
		}),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Plugin);
		const action = (args.action ?? "list") as PluginAction;

		const targets = Array.isArray(args.targets) ? args.targets : args.targets ? [args.targets] : [];
		const cmd: PluginCommandArgs = {
			action,
			args: targets,
			flags: {
				json: flags.json,
				fix: flags.fix,
				force: flags.force,
				dryRun: flags["dry-run"],
				local: flags.local,
				enable: flags.enable,
				disable: flags.disable,
				set: flags.set,
				scope: flags.scope as "user" | "project" | undefined,
			},
		};

		await initTheme();
		await runPluginCommand(cmd);
	}
}
