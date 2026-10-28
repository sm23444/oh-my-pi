/**
 * List and clean up agent-managed git worktrees under `~/.omp/wt`.
 */

import { getProjectDir } from "@oh-my-pi/pi-utils";
import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { worktreeHelp as commandHelp } from "../cli/command-help";
import { addWorktree, clearWorktrees, listWorktrees } from "../cli/worktree-cli";
import { Settings } from "../config/settings";

export default class Worktree extends Command {
	static description = commandHelp.description;
	static aliases = ["wt"];

	static args = {
		// A positional action keeps `omp worktree` (the no-arg form) useful.
		action: Args.string({
			description: "列出（默认）、清除或添加",
			required: false,
			options: ["list", "clear", "add"],
			default: "list",
		}),
		path: Args.string({
			description: "工作树路径（添加）",
			required: false,
		}),
		commit: Args.string({
			description: "要检出的提交（添加）",
			required: false,
		}),
	};

	static flags = {
		cwd: Flags.string({
			char: "C",
			description: "Repository/base 目录（添加）",
		}),
		branch: Flags.string({
			char: "b",
			description: "创建新分支 (add)",
			exclusive: ["force-branch"],
		}),
		"force-branch": Flags.string({
			char: "B",
			description: "创建或重置分支 (add)",
			exclusive: ["branch"],
		}),
		detach: Flags.boolean({
			char: "d",
			description: "分离 HEAD (add)",
			default: false,
		}),
		quiet: Flags.boolean({
			char: "q",
			description: "隐藏 add 输出",
			default: false,
		}),
		all: Flags.boolean({
			description: "清除所有条目,包括正在使用的 PR 检出 worktree(clear)",
			default: false,
		}),
		"dry-run": Flags.boolean({
			char: "n",
			description: "打印将被移除的内容而不触碰文件系统(clear)",
			default: false,
		}),
		json: Flags.boolean({ char: "j", description: "输出机器可读的 JSON", default: false }),
	};

	static examples = [
		"omp worktree",
		"omp worktree list --json",
		"omp worktree add ../feature",
		"omp worktree add -b feature ../feature origin/main",
		"omp worktree add --detach ../review HEAD~2",
		"omp worktree clear",
		"omp worktree clear --dry-run",
		"omp worktree clear --all",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Worktree);
		// Load settings so the `worktree.base` override is applied before we scan
		// — otherwise this command would inspect ~/.omp/wt while the agent created
		// its worktrees under the configured base.
		if (args.action === "add") {
			if (!args.path) {
				console.error("错误：缺少必需参数：path");
				process.exitCode = 1;
				return;
			}
			try {
				await addWorktree({
					cwd: flags.cwd,
					path: args.path,
					commit: args.commit,
					branch: flags.branch,
					forceBranch: flags["force-branch"],
					detach: flags.detach ?? false,
					quiet: flags.quiet ?? false,
				});
			} catch (error) {
				console.error(error instanceof Error ? error.message : String(error));
				process.exitCode = 1;
			}
			return;
		}

		await Settings.init({ cwd: getProjectDir() });
		if (args.action === "clear") {
			const { failed } = await clearWorktrees({
				all: flags.all ?? false,
				dryRun: flags["dry-run"] ?? false,
				json: flags.json ?? false,
			});
			if (failed > 0) process.exitCode = 1;
			return;
		}
		await listWorktrees({ json: flags.json ?? false });
	}
}
