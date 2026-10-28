/**
 * Test web search models.
 */

import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { searchHelp as commandHelp } from "../cli/command-help";
import { runSearchCommand, type SearchCommandArgs } from "../cli/web-search-cli";

const RECENCY: NonNullable<SearchCommandArgs["recency"]>[] = ["day", "week", "month", "year"];

export default class Search extends Command {
	static description = commandHelp.description;
	static aliases = ["q", "web-search"];

	static args = {
		query: Args.string({ description: "搜索查询文本", required: false, multiple: true }),
	};

	static flags = {
		model: Flags.string({ description: "目录模型选择器" }),
		recency: Flags.string({ description: "时间范围过滤器", options: RECENCY }),
		limit: Flags.integer({ char: "l", description: "最多返回的结果数" }),
		compact: Flags.boolean({ description: "渲染精简输出" }),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Search);
		const query = Array.isArray(args.query) ? args.query.join(" ") : (args.query ?? "");

		const cmd: SearchCommandArgs = {
			query,
			model: flags.model,
			recency: flags.recency as SearchCommandArgs["recency"],
			limit: flags.limit,
			expanded: !flags.compact,
		};

		await runSearchCommand(cmd);
	}
}
