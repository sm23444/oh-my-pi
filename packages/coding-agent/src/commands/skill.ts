/**
 * Install, publish, and manage skills on a Skillshare registry (skills.omp.sh).
 */
import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import type { SkillSearchSort } from "@oh-my-pi/pi-wire/skillshare";
import { skillHelp as commandHelp } from "../cli/command-help";
import { runSkillCommand, SKILL_ACTIONS, SKILL_USAGE, type SkillAction } from "../cli/skill-cli";

export default class Skill extends Command {
	static description = commandHelp.description;
	static aliases = ["skills"];

	static args = {
		action: Args.string({ description: "技能操作", required: false, options: SKILL_ACTIONS }),
		targets: Args.string({
			description: "规范、名称、目录或操作参数",
			required: false,
			multiple: true,
		}),
	};

	static flags = {
		global: Flags.boolean({ char: "g", description: "使用用户全局 skills.json（install/update/uninstall）" }),
		yes: Flags.boolean({ char: "y", description: "安装或更新附带脚本的技能，无需询问" }),
		json: Flags.boolean({ description: "输出 JSON（search、info、token、list）" }),
		sort: Flags.string({ description: "搜索顺序", options: ["relevance", "downloads", "recent"] }),
		scope: Flags.string({ description: "发布作用域（默认：你的 Stencil 用户名）" }),
		tag: Flags.string({ description: "已发布版本的 Dist-tag" }),
		"dry-run": Flags.boolean({ description: "打包并验证而不发布" }),
		"allow-secrets": Flags.boolean({ description: "即使发现凭据形状的字符串也继续发布" }),
		registry: Flags.string({ description: "Registry 基础 URL（覆盖 skills.registryUrl）" }),
		undo: Flags.boolean({ description: "还原下架或弃用" }),
		package: Flags.string({ description: "将新令牌限制到某个包（可重复）", multiple: true }),
		expires: Flags.integer({ description: "令牌有效期（天）" }),
	};

	static examples = [
		"omp skill install @alice/pdf-tools",
		"omp skill install -g @alice/pdf-tools@^1.2",
		'omp skill search "pdf" --sort downloads',
		"omp skill version minor && omp skill publish",
		"omp skill publish ./skills/pdf-tools --dry-run",
		"omp skill tag @alice/pdf-tools@2.0.0-beta.1 next",
		'omp skill deprecate @alice/pdf-tools@"<1.0.0" "use 1.x"',
		"omp skill token create ci --package @alice/pdf-tools --expires 90",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Skill);
		if (!args.action) {
			process.stdout.write(SKILL_USAGE);
			return;
		}
		const exitCode = await runSkillCommand({
			action: args.action as SkillAction,
			args: args.targets ?? [],
			cwd: process.cwd(),
			flags: {
				tag: flags.tag,
				dryRun: flags["dry-run"],
				allowSecrets: flags["allow-secrets"],
				registry: flags.registry,
				scope: flags.scope,
				undo: flags.undo,
				global: flags.global,
				yes: flags.yes,
				json: flags.json,
				sort: flags.sort as SkillSearchSort | undefined,
				package: flags.package,
				expires: flags.expires,
			},
		});
		if (exitCode !== 0) process.exitCode = exitCode;
	}
}
