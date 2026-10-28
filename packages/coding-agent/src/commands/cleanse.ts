import { postmortem } from "@oh-my-pi/pi-utils";
import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { runCleanseCommand } from "../cleanse";
import { cleanseHelp as commandHelp } from "../cli/command-help";
import { CliUsageError } from "../cli/usage-error";

export default class Cleanse extends Command {
	static description = commandHelp.description;
	static args = {
		request: Args.string({
			description: "要检测并修复的内容（e.g \"ts errors\"）；发现代理会确定命令",
			required: false,
		}),
	};
	static flags = {
		agents: Flags.integer({
			char: "n",
			description: "文件互不重叠的子代理的最大数量",
			default: 32,
		}),
		model: Flags.string({
			char: "m",
			description: "子代理模型选择器",
			default: "@smol",
		}),
		tests: Flags.boolean({
			char: "t",
			description: "同时运行已配置的项目测试套件",
			default: false,
		}),
		all: Flags.boolean({
			char: "a",
			description: "运行所有已发现的检查器，无需交互式选择器",
			default: false,
		}),
	};

	static examples = [
		"omp cleanse",
		"omp cleanse --all",
		'omp cleanse "ts errors"',
		"omp cleanse -n 8",
		"omp cleanse -m opus",
		"omp cleanse -t",
		"omp cleanse --agents 12 --model anthropic/claude-opus-4-6",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Cleanse);
		if (flags.agents <= 0) throw new CliUsageError("--agents must be a positive integer");
		const result = await runCleanseCommand({
			maxAgents: flags.agents,
			model: flags.model,
			includeTests: flags.tests,
			request: args.request,
			all: flags.all,
		});
		await postmortem.quit(result.exitCode);
	}
}
