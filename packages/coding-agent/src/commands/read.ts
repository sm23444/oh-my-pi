/**
 * Show what the read tool will return for a path, URL, or internal URI.
 */

import { Args, Command } from "@oh-my-pi/pi-utils/cli";
import { readHelp as commandHelp } from "../cli/command-help";
import { type ReadCommandArgs, runReadCommand } from "../cli/read-cli";
import { initTheme } from "@oh-my-pi/pi-tui/theme";

export default class Read extends Command {
	static description = commandHelp.description;
	static args = {
		path: Args.string({
			description:
				"要读取的路径、URL 或内部 URI（追加 :sel 以指定行范围或原始模式，e.g。src/foo.ts:50-100）",
			required: true,
		}),
	};

	static examples = [
		"omp read src/foo.ts",
		"omp read src/foo.ts:50-100",
		"omp read src/foo.ts:raw",
		"omp read https://example.com",
		"omp read omp://",
		"omp read issue://123",
		"omp read path/to/archive.zip:dir/file.ts",
		"omp read path/to/db.sqlite:users:42",
	];

	async run(): Promise<void> {
		const { args } = await this.parse(Read);
		const cmd: ReadCommandArgs = {
			path: args.path ?? "",
		};
		await initTheme();
		await runReadCommand(cmd);
	}
}
