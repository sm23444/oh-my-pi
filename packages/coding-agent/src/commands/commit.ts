/**
 * Generate and optionally push a commit with changelog updates.
 */

import { postmortem } from "@oh-my-pi/pi-utils";
import { Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { commitHelp as commandHelp } from "../cli/command-help";
import { CommitAbortedError, runCommitCommand } from "../commit";
import type { CommitCommandArgs } from "../commit/types";
import { initTheme } from "@oh-my-pi/pi-tui/theme";

export default class Commit extends Command {
	static description = commandHelp.description;
	static flags = {
		push: Flags.boolean({ description: "提交后推送" }),
		"dry-run": Flags.boolean({ description: "预览而不提交" }),
		"no-changelog": Flags.boolean({ description: "跳过 changelog 更新" }),
		legacy: Flags.boolean({ description: "使用旧版确定性流水线" }),
		context: Flags.string({ char: "c", description: "提供给模型的额外上下文" }),
		model: Flags.string({ char: "m", description: "覆盖模型选择" }),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(Commit);

		const cmd: CommitCommandArgs = {
			push: flags.push ?? false,
			dryRun: flags["dry-run"] ?? false,
			noChangelog: flags["no-changelog"] ?? false,
			legacy: flags.legacy,
			context: flags.context,
			model: flags.model,
		};

		await initTheme();
		// The agentic commit flow opens keep-alive sockets to the model provider
		// and spins up an AgentSession with background async-job + extension
		// machinery. `session.dispose()` releases what it can, but Bun's fetch
		// keeps idle connections warm and a few timers (Settings autosave, OAuth
		// refresh) stay armed long enough to pin the event loop after the commit
		// is already written. Mirror the `runPrintMode` exit pattern from
		// `main.ts` so the CLI returns to the shell instead of stranding the user
		// on Ctrl+C (issue #1041).
		let exitCode = 0;
		try {
			const { usedFallback } = await runCommitCommand(cmd);
			// A commit written by the mechanical fallback is a degraded outcome:
			// the agent did not do the work it was asked to do, so the command
			// reports non-zero so callers can distinguish it from a real
			// single-commit decision (issue #7835).
			if (usedFallback) exitCode = 1;
		} catch (error) {
			if (!(error instanceof CommitAbortedError)) throw error;
			// Failure already reported with a readable message; exit non-zero
			// without letting the runtime dump a stack/minified-source blob.
			exitCode = 1;
		}
		await postmortem.quit(exitCode);
	}
}
