import { existsSync } from "node:fs";
import * as path from "node:path";
/**
 * `omp ttsr` — inspect and test Time-Traveling Stream Rules.
 *
 * `omp ttsr test` feeds a snippet (inline, --file, or stdin) through the real
 * TTSR matching pipeline and reports which rules would trigger. `omp ttsr list`
 * shows every TTSR-registered rule the current project/user config would load.
 */
import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { ttsrHelp as commandHelp } from "../cli/command-help";
import {
	runTtsrCommand,
	TTSR_ACTIONS,
	TTSR_SOURCES,
	type TtsrCommandArgs,
	type TtsrScanArgs,
	type TtsrTestArgs,
} from "../cli/ttsr-cli";
import type { TtsrMatchSource } from "../export/ttsr";

export default class Ttsr extends Command {
	static description = commandHelp.description;
	static args = {
		action: Args.string({
			description: "TTSR 操作",
			required: false,
			options: TTSR_ACTIONS,
		}),
		snippet: Args.string({
			description: "要测试的内联片段文本(ttsr test)或要扫描的目录(ttsr scan)",
			required: false,
		}),
	};

	static flags = {
		file: Flags.string({ description: "片段文件路径,或 - 表示 stdin(ttsr test)" }),
		rule: Flags.string({
			char: "r",
			description: "单独测试的规则 markdown 文件(跳过项目规则加载)",
		}),
		source: Flags.string({
			description: "匹配来源:text、thinking 或 tool(省略时从 --file 推断)",
			options: TTSR_SOURCES,
		}),
		tool: Flags.string({
			description: "来源为工具时的工具名称（例如 e.g、edit、write）；默认为 edit",
		}),
		path: Flags.string({
			char: "p",
			description: "用于 scope/glob 匹配和 AST 语言推断的候选文件路径",
		}),
		agent: Flags.string({
			description: "用于评估规则 `agents` 作用域的代理名称（ttsr 测试）；默认为 main",
		}),
		verbose: Flags.boolean({ char: "v", description: "显示所有评估过的规则,而不只是触发的" }),
		json: Flags.boolean({ description: "以 JSON 输出" }),
		"no-gitignore": Flags.boolean({ description: "包含被 .gitignore 排除的文件(ttsr scan)" }),
		"max-bytes": Flags.integer({
			description: "要扫描的最大文件大小(字节);0 表示不限制(ttsr scan)",
		}),
	};

	static examples = [
		"omp ttsr list",
		"omp ttsr test 'const x: any = 1'",
		"omp ttsr test src/foo.ts",
		"omp ttsr test --file src/foo.ts",
		"omp ttsr test --file src/foo.ts --source text",
		"omp ttsr test --rule .omp/rules/no-any.md --source tool --path src/foo.ts 'const x: any = 1'",
		"omp ttsr test --agent scout 'const x: any = 1'",
		"echo 'Box::leak(&mut v)' | omp ttsr test --file - --path src/lib.rs",
		"omp ttsr test --source tool --tool edit --path src/foo.ts 'const x: any = 1'",
		"omp ttsr scan",
		"omp ttsr scan src/",
		"omp ttsr scan -r .omp/rules/no-any.md src/",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Ttsr);
		const action = (args.action ?? "list") as (typeof TTSR_ACTIONS)[number];

		// A positional that resolves to an existing file is a snippet file, not
		// inline text — so `omp ttsr test src/foo.ts` works without --file.
		// --file always wins over the positional.
		let file = flags.file;
		let snippet = args.snippet;
		if (action === "test" && snippet && !file) {
			const resolved = path.resolve(snippet);
			if (existsSync(resolved)) {
				file = resolved;
				snippet = undefined;
			}
		}

		const test: TtsrTestArgs | undefined =
			action === "test"
				? {
						snippet,
						file,
						rule: flags.rule,
						source: flags.source as TtsrMatchSource | undefined,
						tool: flags.tool,
						filePath: flags.path,
						verbose: flags.verbose,
						agent: flags.agent,
					}
				: undefined;

		const scan: TtsrScanArgs | undefined =
			action === "scan"
				? {
						directory: args.snippet,
						rule: flags.rule,
						gitignore: !flags["no-gitignore"],
						maxBytes: flags["max-bytes"],
						verbose: flags.verbose,
					}
				: undefined;

		const cmd: TtsrCommandArgs = {
			action,
			test,
			scan,
			json: flags.json,
		};

		await runTtsrCommand(cmd);
	}
}
