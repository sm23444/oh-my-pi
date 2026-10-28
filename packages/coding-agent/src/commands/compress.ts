import { postmortem } from "@oh-my-pi/pi-utils";
import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { compressHelp as commandHelp } from "../cli/command-help";
import { CliUsageError } from "../cli/usage-error";
import { runCompressCommand } from "../compress";

export default class Compress extends Command {
	static description = commandHelp.description;
	static args = {
		files: Args.string({ description: "要压缩的文件或 glob 模式", required: true, multiple: true }),
	};
	static flags = {
		out: Flags.string({ char: "o", description: "将审批通过的文本写入此处，而不是标准输出（单个文件）" }),
		inPlace: Flags.boolean({ char: "i", description: "用审批通过的文本覆盖每个源文件" }),
		rounds: Flags.integer({ char: "r", description: "放弃前每个文件允许的最大草稿数", default: 3 }),
		agents: Flags.integer({ char: "n", description: "并发压缩的文件数", default: 4 }),
		model: Flags.string({ char: "m", description: "模型选择器" }),
	};

	static examples = [
		"omp compress prompts/tools/read.md",
		"omp compress notes.md -o notes.compressed.md",
		"omp compress 'src/prompts/**/*.md' -i",
		"omp compress a.md b.md c.md -i -n 8",
		"omp compress spec.md -r 5 -m opus",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Compress);
		const files = args.files ?? [];
		if (files.length === 0) throw new CliUsageError("compress requires at least one file or glob pattern");
		if (flags.rounds <= 0) throw new CliUsageError("--rounds must be a positive integer");
		if (flags.agents <= 0) throw new CliUsageError("--agents must be a positive integer");
		if (flags.inPlace && flags.out) throw new CliUsageError("--in-place and --out are mutually exclusive");
		const result = await runCompressCommand({
			files,
			model: flags.model,
			maxRounds: flags.rounds,
			concurrency: flags.agents,
			output: flags.out,
			inPlace: flags.inPlace,
		});
		await postmortem.quit(result.exitCode);
	}
}
