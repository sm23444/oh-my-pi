import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { runBenchCommand } from "../cli/bench-cli";
import { benchHelp as commandHelp } from "../cli/command-help";
import { SERVICE_TIER_OPENAI_VALUES } from "../config/service-tier";

export default class Bench extends Command {
	static description = commandHelp.description;
	static args = {
		models: Args.string({
			description: "模型选择器（provider/model 或模糊 ID，e.g. opus）",
			required: true,
			multiple: true,
		}),
	};

	static flags = {
		runs: Flags.integer({
			description:
				"每个模型的请求数（默认：10 次 chat、5 次 prefill/generation、9 次 mix）；使用 --detailed 时，按阶段（默认：4）",
		}),
		"max-tokens": Flags.integer({
			description: "每次请求最大输出 token 数（默认：chat 512、prefill 64、generation 2048、cache 64）",
		}),
		prompt: Flags.string({ description: "自定义提示词文本（仅限 chat 和 generation 配置文件）" }),
		profile: Flags.string({
			description:
				"基准测试工作负载（默认 chat）：chat（均衡，衡量 TTFT 和 tok/s）、prefill（大型绕过缓存的输入，衡量输入处理）、generation（长强制输出，衡量持续解码）、mix（轮换执行全部三种）",
			options: ["chat", "prefill", "generation", "mix"],
		}),
		"prefill-bytes": Flags.integer({
			description: "用于 prefill 挑战的合成输入大小（默认：32768，受上下文窗口上限限制）",
		}),
		detailed: Flags.boolean({
			description:
				"每个模型运行单用户（1 个并发）、并行（--par 个并发，并统计聚合 tok/s 与扩展性）以及 prefill 阶段。",
		}),
		"service-tier": Flags.string({
			description: "按模型族应用的服务等级(默认:配置的 `tier.*` 设置;`none` 表示省略)",
			options: SERVICE_TIER_OPENAI_VALUES,
		}),
		json: Flags.boolean({ description: "以 JSON 输出" }),
		par: Flags.integer({
			description: "执行 N 个并行 queries/requests 的运行（默认值：4）；即 --detailed 的并行阶段宽度。",
		}),
		cache: Flags.boolean({
			description: "运行独立的 cold/warm 提示缓存配对（不支持 openai-codex-responses）",
		}),
		"cache-prefix-file": Flags.string({ description: "--cache 的稳定 prompt 前缀文件" }),
		"cache-prefix-bytes": Flags.integer({ description: "--cache 的稳定前缀字节预算(默认:8192)" }),
		"cache-pairs": Flags.integer({ description: "每个模型 Cold/warm 对，用于 --cache（默认值：1）" }),
		"cache-concurrency": Flags.integer({
			description: "--cache 的并发 cache 配对数量;每对仍保持顺序执行(默认:1)",
		}),
	};

	static examples = [
		"# Compare TTFT and tok/s of two models\n  omp bench anthropic/claude-opus-4-5 openai/gpt-5.2",
		"# Fuzzy selectors work\n  omp bench opus sonnet",
		"# Average over 3 runs each\n  omp bench opus gpt-5.2 --runs 3",
		"# Rotate chat, prefill, and generation challenges in one run\n  omp bench opus sonnet --profile mix",
		"# Isolate prompt-ingestion speed with a 64 KiB cache-busted input\n  omp bench opus sonnet --profile prefill --prefill-bytes 65536",
		"# Isolate sustained decode throughput\n  omp bench opus sonnet --profile generation",
		"# Compare single-user vs 8 concurrent users, plus prefill speed\n  omp bench apple --detailed --par 8",
		"# Force priority serving tier\n  omp bench openai-codex/gpt-5.5:low --runs 10 --service-tier priority",
		"# Measure one cold/warm prompt-cache pair\n  omp bench openai/gpt-5.6 --cache --json",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Bench);
		await runBenchCommand({
			models: args.models ?? [],
			flags: {
				runs: flags.runs,
				maxTokens: flags["max-tokens"],
				prompt: flags.prompt,
				profile: flags.profile,
				prefillBytes: flags["prefill-bytes"],
				detailed: flags.detailed,
				serviceTier: flags["service-tier"],
				json: flags.json,
				par: flags.par,
				cache: flags.cache,
				cachePrefixFile: flags["cache-prefix-file"],
				cachePrefixBytes: flags["cache-prefix-bytes"],
				cachePairs: flags["cache-pairs"],
				cacheConcurrency: flags["cache-concurrency"],
			},
		});
	}
}
