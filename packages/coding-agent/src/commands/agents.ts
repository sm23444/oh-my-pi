/**
 * Manage bundled task agents.
 */

import { Args, Command, Flags, renderCommandHelp } from "@oh-my-pi/pi-utils/cli";
import { type AgentsAction, type AgentsCommandArgs, runAgentsCommand } from "../cli/agents-cli";
import { agentsHelp as commandHelp } from "../cli/command-help";
import { initTheme } from "@oh-my-pi/pi-tui/theme";

const ACTIONS: AgentsAction[] = ["unpack"];

export default class Agents extends Command {
	static description = commandHelp.description;
	static args = {
		action: Args.string({
			description: "代理操作",
			required: false,
			options: ACTIONS,
		}),
	};

	static flags = {
		force: Flags.boolean({ char: "f", description: "覆盖已有的 agent 文件" }),
		json: Flags.boolean({ description: "以 JSON 输出" }),
		dir: Flags.string({ description: "输出目录(覆盖 --user/--project)" }),
		user: Flags.boolean({ description: "写入 ~/.omp/agent/agents(默认)" }),
		project: Flags.boolean({ description: "写入 ./.omp/agents" }),
	};

	static examples = [
		"# Export bundled agents into user config (default)\n  omp agents unpack",
		"# Export bundled agents into project config\n  omp agents unpack --project",
		"# Overwrite existing local agent files\n  omp agents unpack --project --force",
		"# Export into a custom directory\n  omp agents unpack --dir ./tmp/agents --json",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Agents);
		if (!args.action) {
			renderCommandHelp("omp", "agents", Agents);
			return;
		}

		const cmd: AgentsCommandArgs = {
			action: args.action as AgentsAction,
			flags: {
				force: flags.force,
				json: flags.json,
				dir: flags.dir,
				user: flags.user,
				project: flags.project,
			},
		};

		await initTheme();
		await runAgentsCommand(cmd);
	}
}
