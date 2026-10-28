/**
 * Run on-disk storage maintenance.
 */

import { Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { gcHelp as commandHelp } from "../cli/command-help";
import { collectGcErrors, type GcCommandArgs, runGcCommand } from "../cli/gc-cli";

export default class Gc extends Command {
	static description = commandHelp.description;
	static flags = {
		apply: Flags.boolean({ description: "应用更改(默认是 dry-run 预览)" }),
		json: Flags.boolean({ description: "以 JSON 输出" }),
		"agent-dir": Flags.string({ description: "要维护的 agent 目录" }),
		blobs: Flags.boolean({ description: "清理无引用的 blob" }),
		archive: Flags.boolean({ description: "归档冷 session" }),
		wal: Flags.boolean({ description: "对 history/model 数据库的 WAL 文件执行检查点" }),
		stale: Flags.boolean({
			description: "清除悬空会话 markers/breadcrumbs 以及旧的调试报告和协作副本",
		}),
		compress: Flags.boolean({
			description: "使用文件系统压缩就地存储空闲会话（APFS、NTFS）",
		}),
		"cold-archive-after-days": Flags.integer({ description: "归档前 session 的最小存在天数" }),
		"retain-newest-global": Flags.integer({ description: "始终保留这么多最新的活跃 session" }),
		"retain-newest-per-cwd": Flags.integer({ description: "每个 cwd 始终保留这么多最新的活跃 session" }),
		"stale-retain-newest": Flags.integer({
			description: "始终保留此数量的最新调试报告和协作副本",
		}),
		"stale-retain-days": Flags.integer({ description: "调试 report/collab 副本在清除前的最短保留时间" }),
		"compress-after-days": Flags.integer({ description: "压缩会话前的最短空闲天数" }),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(Gc);
		const cmd: GcCommandArgs = {
			flags: {
				apply: flags.apply,
				json: flags.json,
				agentDir: flags["agent-dir"],
				blobs: flags.blobs,
				archive: flags.archive,
				wal: flags.wal,
				stale: flags.stale,
				compress: flags.compress,
				coldArchiveAfterDays: flags["cold-archive-after-days"],
				retainNewestGlobal: flags["retain-newest-global"],
				retainNewestPerCwd: flags["retain-newest-per-cwd"],
				staleRetainNewest: flags["stale-retain-newest"],
				staleRetainDays: flags["stale-retain-days"],
				compressAfterDays: flags["compress-after-days"],
			},
		};
		const result = await runGcCommand(cmd);
		const errors = collectGcErrors(result);
		if (errors.length > 0) {
			process.stderr.write(
				`GC 完成时有 ${errors.length} 个错误${errors.length === 1 ? "" : ""}:
${errors.map(error => `- ${error}`).join("\n")}
`,
			);
			process.exitCode = 1;
		}
	}
}
