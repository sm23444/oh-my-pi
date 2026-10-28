/** Inspect and maintain image publication backends. */

import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { imagesHelp as commandHelp } from "../cli/command-help";
import { IMAGES_ACTIONS, type ImagesAction, type ImagesCommandArgs, runImagesCommand } from "../cli/images-cli";

export default class Images extends Command {
	static description = commandHelp.description;
	static aliases = ["img"];
	static args = {
		action: Args.string({
			description: "status（默认）、doctor、probe 或 purge",
			required: false,
			options: [...IMAGES_ACTIONS],
		}),
	};
	static flags = {
		json: Flags.boolean({ description: "输出一个 JSON 文档" }),
		apply: Flags.boolean({ description: "应用 purge 删除操作（默认为 dry-run）" }),
		all: Flags.boolean({ description: "清除所有条目，而非仅清除过期条目" }),
		dir: Flags.string({ description: "项目目录（默认：当前目录）" }),
		timeout: Flags.integer({ description: "外部健康探测超时时间（秒）" }),
	};
	static examples = [
		"omp images",
		"omp images status --json",
		"omp images doctor",
		"omp images probe --timeout 15",
		"omp images purge",
		"omp images purge --all --apply",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Images);
		const command: ImagesCommandArgs = {
			action: (args.action ?? "status") as ImagesAction,
			flags: {
				json: flags.json,
				apply: flags.apply,
				all: flags.all,
				dir: flags.dir,
				timeout: flags.timeout,
			},
		};
		const result = await runImagesCommand(command);
		if (result.exitCode !== 0) process.exitCode = result.exitCode;
	}
}
