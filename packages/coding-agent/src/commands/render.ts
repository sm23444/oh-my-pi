/**
 * Draw a session's entire thread through the production transcript pipeline.
 */

import { postmortem } from "@oh-my-pi/pi-utils";
import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { renderHelp as commandHelp } from "../cli/command-help";
import { runRenderCommand } from "../cli/render-cli";
import { CliUsageError } from "../cli/usage-error";

export default class Render extends Command {
	static description = commandHelp.description;
	static args = {
		session: Args.string({ description: "会话文件路径或 ID 前缀（默认：当前工作目录中最近的会话）" }),
	};
	static flags = {
		width: Flags.integer({ char: "w", description: "渲染宽度（列数；默认：终端宽度）" }),
		height: Flags.integer({ description: "视口高度（行数，默认：终端高度）" }),
		timing: Flags.boolean({ char: "t", description: "将各阶段耗时和输出字节数打印到 stderr" }),
		repaint: Flags.integer({
			description: "基准测试额外执行 N 次完整清除滚动缓冲区重绘（/tree导航框架）",
		}),
		plain: Flags.boolean({ description: "从输出中去掉 ANSI 样式", default: false }),
		quiet: Flags.boolean({ char: "q", description: "抑制转录输出（基准测试运行时）", default: false }),
	};

	static examples = [
		"omp render",
		"omp render 01a0285c --plain",
		"omp render ~/.omp/agent/sessions/--work-pi--/big.jsonl -q -t --repaint 5",
		"omp render -w 200 > thread.ansi",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Render);
		if (flags.repaint !== undefined && flags.repaint <= 0) {
			throw new CliUsageError("--repaint must be a positive integer");
		}
		const exitCode = await runRenderCommand({
			session: args.session,
			width: flags.width,
			height: flags.height,
			timing: flags.timing,
			repaint: flags.repaint,
			plain: flags.plain,
			quiet: flags.quiet,
		});
		await postmortem.quit(exitCode);
	}
}
