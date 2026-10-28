/**
 * List, search, and refresh available models.
 */

import { MODEL_KINDS, type ModelKind } from "@oh-my-pi/pi-catalog/types";
import { APP_NAME } from "@oh-my-pi/pi-utils";
import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { modelsHelp as commandHelp } from "../cli/command-help";
import { resolveModelsArgs, runModelsCommand } from "../cli/models-cli";

const MODEL_KIND_OPTIONS: readonly (ModelKind | "all")[] = [...MODEL_KINDS, "all"];

export default class Models extends Command {
	static description = commandHelp.description;
	static args = {
		action: Args.string({
			description: "ls(默认)| find | refresh | <provider>",
			required: false,
		}),
		pattern: Args.string({
			description: "Filter/search 子字符串，或提供商名称（查找时必需）",
			required: false,
		}),
	};

	static flags = {
		json: Flags.boolean({ description: "以 JSON 输出" }),
		kind: Flags.string({
			description: "要列出的目录类型",
			options: MODEL_KIND_OPTIONS,
			default: "chat",
		}),
		extension: Flags.string({
			char: "e",
			description: "列出前加载扩展文件(可重复)",
			multiple: true,
		}),
		"no-extensions": Flags.boolean({
			description: "禁用扩展发现（显式 -e 路径仍然有效）",
		}),
		config: Flags.string({
			description: "为本次运行加载额外的 config.yml-style 覆盖层（可重复）",
			multiple: true,
		}),
	};

	static examples = [
		`# List available chat models, grouped by provider\n  ${APP_NAME} models`,
		`# List models of every catalog kind\n  ${APP_NAME} models --kind all`,
		`# List one provider's models (any provider name works)\n  ${APP_NAME} models openai-codex`,
		`# Find models by substring\n  ${APP_NAME} models find minimax`,
		`# Force a fresh catalog fetch (replaces rm -rf ~/.omp/models.db)\n  ${APP_NAME} models refresh`,
		`# Machine-readable output\n  ${APP_NAME} models --json`,
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Models);
		const { action, pattern } = resolveModelsArgs(args.action, args.pattern);
		const kind = MODEL_KIND_OPTIONS.find(option => option === flags.kind) ?? "chat";
		await runModelsCommand({
			action,
			pattern,
			flags: {
				json: flags.json,
				kind,
				extensions: flags.extension,
				noExtensions: flags["no-extensions"],
				config: flags.config,
			},
		});
	}
}
