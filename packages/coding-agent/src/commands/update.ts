/**
 * Check for and install updates.
 */

import { Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { updateHelp as commandHelp } from "../cli/command-help";
import * as pluginCli from "../cli/plugin-cli";
import * as updateCli from "../cli/update-cli";
import { CliUsageError } from "../cli/usage-error";
import { initTheme } from "@oh-my-pi/pi-tui/theme";

export default class Update extends Command {
	static description = commandHelp.description;
	static flags = {
		force: Flags.boolean({ char: "f", description: "强制更新", default: false }),
		check: Flags.boolean({ char: "c", description: "检查更新而不安装", default: false }),
		plugins: Flags.boolean({ char: "l", description: "更新已安装的插件", default: false }),
		canary: Flags.boolean({ description: "切换到 canary 通道并更新", default: false }),
		stable: Flags.boolean({ description: "切换回稳定通道", default: false }),
	};

	static examples = ["omp update", "omp update --check", "omp update --canary"];

	async run(): Promise<void> {
		const { flags } = await this.parse(Update);
		await initTheme();
		if (flags.canary && flags.stable) throw new CliUsageError("--canary and --stable are mutually exclusive");
		if (flags.plugins) {
			await pluginCli.runPluginCommand({ action: "upgrade", args: [], flags: flags.check ? { dryRun: true } : {} });
		} else {
			await updateCli.runUpdateCommand({
				force: flags.force,
				check: flags.check,
				channel: flags.canary ? "canary" : flags.stable ? "stable" : undefined,
			});
		}
	}
}
