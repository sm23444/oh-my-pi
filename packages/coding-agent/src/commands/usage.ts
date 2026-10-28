/**
 * Show provider usage limits for every authenticated account.
 */

import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { usageHelp as commandHelp } from "../cli/command-help";
import { runUsageCommand } from "../cli/usage-cli";

export default class Usage extends Command {
	static description = commandHelp.description;
	static args = {
		action: Args.string({
			description: "要执行的可选子命令",
			required: false,
			options: ["invalidate", "clients", "accounts", "reset"],
		}),
		target: Args.string({
			description: "已保存的重置，可配合 `reset` 使用：<provider>/<credential id>，格式与 `omp usage reset` 列出的相同",
			required: false,
		}),
	};

	static flags = {
		json: Flags.boolean({ char: "j", description: "以 JSON 输出用量报告", default: false }),
		provider: Flags.string({ char: "p", description: "仅显示此提供商 ID 的用量（e.g. anthropic）" }),
		redact: Flags.boolean({
			char: "r",
			description: "为共享屏幕截图脱敏账户 emails/ids（最短唯一前缀）",
			default: false,
		}),
		history: Flags.boolean({
			description: "显示记录的用量限额历史(每小时快照),而不是实时快照",
			default: false,
		}),
		days: Flags.integer({ char: "d", description: "历史窗口天数（与 --history 或客户端结合使用）", default: 7 }),
		extension: Flags.string({
			char: "e",
			description: "获取使用情况之前加载扩展文件（可重复）",
			multiple: true,
		}),
		"no-extensions": Flags.boolean({
			description: "禁用扩展发现（显式 -e 路径仍有效）",
		}),
	};

	static examples = [
		"# Detailed per-account usage breakdown across all providers\n  omp usage",
		"# Only Anthropic accounts\n  omp usage --provider anthropic",
		"# Redact account identifiers for screenshots\n  omp usage --redact",
		"# Machine-readable output\n  omp usage --json",
		"# Usage-limit trend over the last 30 days\n  omp usage --history --days 30",
		"# Per-client token burn (which machine/app spent what) over the last 30 days\n  omp usage clients --days 30",
		"# OAuth identity keys for task.agentAccountPools (no tokens)\n  omp usage accounts",
		"# Saved Codex and Claude rate-limit resets per account, with each account's credential id\n  omp usage reset",
		"# Spend one saved reset on a listed account\n  omp usage reset codex/3",
		"# Invalidate cached usage reports for all providers\n  omp usage invalidate",
		"# Invalidate cached usage reports for a specific provider\n  omp usage invalidate --provider anthropic",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Usage);
		await runUsageCommand({
			action: args.action,
			json: flags.json,
			provider: flags.provider,
			target: args.target,
			redact: flags.redact,
			history: flags.history,
			days: flags.days,
			extensions: flags.extension,
			noExtensions: flags["no-extensions"],
		});
	}
}
