import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { dryBalanceHelp as commandHelp } from "../cli/command-help";
import { runDryBalanceCommand } from "../cli/dry-balance-cli";

export default class DryBalance extends Command {
	static description = commandHelp.description;
	static args = {
		model: Args.string({
			description: "模型选择器(provider/model 或模糊 id)。默认为配置的默认模型。",
			required: false,
		}),
	};

	static flags = {
		model: Flags.string({ description: "模型选择器(语法与 omp 的 --model 相同)" }),
		count: Flags.integer({ description: "要尝试的随机 session id 数量", default: 100 }),
		concurrency: Flags.integer({ description: "并发解析凭据的最大数量", default: 32 }),
		json: Flags.boolean({ description: "以 JSON 输出" }),
		bench: Flags.boolean({ description: "为每个 OAuth 账户发送一次实时基准测试请求" }),
		config: Flags.string({
			description: "为此运行加载一个额外的 config.yml-style 覆盖层（可重复）",
			multiple: true,
		}),
	};

	static examples = [
		"# Dry-run the configured default model with 100 random session ids\n  omp dry-balance",
		"# Dry-run a specific model\n  omp dry-balance anthropic/claude-sonnet-4-5",
		"# Larger run with bounded concurrency\n  omp dry-balance --model openai-codex/gpt-5-codex --count 1000 --concurrency 64",
		"# Benchmark every OAuth account in parallel\n  omp dry-balance --bench",
		"# Machine-readable output\n  omp dry-balance --json",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(DryBalance);
		await runDryBalanceCommand({
			model: args.model,
			flags: {
				model: flags.model,
				count: flags.count,
				concurrency: flags.concurrency,
				json: flags.json,
				bench: flags.bench,
				config: flags.config,
			},
		});
	}
}
