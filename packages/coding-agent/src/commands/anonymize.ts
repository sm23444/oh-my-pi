/**
 * Write a shareable, anonymized copy of a session and its subagent transcripts.
 */
import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { runAnonymizeCommand } from "../cli/anonymize-cli";
import { reportCliUsageError } from "../cli/args";
import { anonymizeHelp as commandHelp } from "../cli/command-help";

export default class Anonymize extends Command {
	static description = commandHelp.description;
	static args = {
		session: Args.string({ description: "会话文件路径或 ID 前缀（默认：当前工作目录中的最近会话）" }),
	};
	static flags = {
		out: Flags.string({ char: "o", description: "输出目录（默认：./<session-file>.anon）" }),
	};

	static examples = [
		"omp anonymize",
		"omp anonymize 01a0285c -o ./bug-report",
		"omp anonymize ~/.omp/agent/sessions/--work-pi--/session.jsonl",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Anonymize);
		try {
			await runAnonymizeCommand({ session: args.session, out: flags.out });
		} catch (error) {
			if (!reportCliUsageError(error)) throw error;
			process.exitCode = 2;
		}
	}
}
