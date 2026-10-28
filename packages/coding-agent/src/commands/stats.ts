/**
 * View usage statistics dashboard.
 */

import { Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { statsHelp as commandHelp } from "../cli/command-help";
import type { StatsCommandArgs } from "../cli/stats-cli";
import * as statsCli from "../cli/stats-cli";
import * as theme from "@oh-my-pi/pi-tui/theme";

export default class Stats extends Command {
	static description = commandHelp.description;
	static flags = {
		port: Flags.integer({ char: "p", description: "仪表盘服务器的端口", default: 3847 }),
		host: Flags.string({ description: "要绑定的主机", default: "127.0.0.1" }),
		json: Flags.boolean({ char: "j", description: "以 JSON 输出统计", default: false }),
		summary: Flags.boolean({ char: "s", description: "在控制台打印摘要", default: false }),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(Stats);

		const cmd: StatsCommandArgs = {
			port: flags.port,
			host: flags.host ?? "127.0.0.1",
			json: flags.json,
			summary: flags.summary,
		};

		await theme.initTheme();
		await statsCli.runStatsCommand(cmd);
	}
}
