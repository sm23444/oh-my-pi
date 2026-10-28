/**
 * `omp auth-broker` — manage the omp credential vault.
 */

import { Args, Command, Flags, renderCommandHelp } from "@oh-my-pi/pi-utils/cli";
import {
	AUTH_BROKER_ACTIONS,
	type AuthBrokerAction,
	type AuthBrokerCommandArgs,
	runAuthBrokerCommand,
} from "../cli/auth-broker-cli";
import { authBrokerHelp as commandHelp } from "../cli/command-help";
import { initTheme } from "@oh-my-pi/pi-tui/theme";

export default class AuthBroker extends Command {
	static description = commandHelp.description;
	static args = {
		action: Args.string({
			description: "子命令",
			required: false,
			options: [...AUTH_BROKER_ACTIONS],
		}),
		// Second positional: provider id (login/logout) or filesystem path (import).
		source: Args.string({
			description: "OAuth 提供商 id(login/logout)或路径(import)",
			required: false,
		}),
	};

	static flags = {
		json: Flags.boolean({ description: "以 JSON 输出" }),
		bind: Flags.string({ description: "`serve` 的绑定地址(host:port)", char: "b" }),
		regenerate: Flags.boolean({ description: "重新生成 bearer token" }),
		via: Flags.string({
			description: "远程登录使用的 SSH user@host(login --via=user@host)",
		}),
		provider: Flags.string({
			description: "为 `import` 覆盖提供商 ID（e.g，当 JSON `type` 无法识别时）",
		}),
		"include-disabled": Flags.boolean({
			description: "导入 JSON 中 `disabled: true` 的凭据(import)",
		}),
		"from-local": Flags.boolean({
			description: "迁移来源:本地 SQLite + 环境变量(`migrate` 必需)",
		}),
		"include-env": Flags.boolean({
			description: "捕获尚未接入 broker 的提供商的 env 环境变量 API 密钥(migrate)",
		}),
		"include-oauth": Flags.boolean({
			description: "migrate 期间同时上传本地 SQLite 中的 OAuth(默认跳过)",
		}),
		"dry-run": Flags.boolean({ description: "只打印操作而不执行(import / login --via / migrate)" }),
		"trust-proxy-headers": Flags.boolean({
			description: "信任来自反向代理（serve）的转发对等 IP 标头；默认关闭。",
		}),
	};

	static examples = [
		"# Boot the broker against the local SQLite store\n  omp auth-broker serve",
		"# Boot on a non-default port\n  omp auth-broker serve --bind=127.0.0.1:9000",
		"# Trust client IP headers from a trusted reverse proxy\n  omp auth-broker serve --trust-proxy-headers",
		"# Print the bearer token\n  omp auth-broker token",
		"# Rotate the bearer token\n  omp auth-broker token --regenerate",
		"# List supported OAuth providers\n  omp auth-broker list",
		"# Local login (run on the broker host)\n  omp auth-broker login anthropic",
		"# Interactive provider selection\n  omp auth-broker login",
		"# Remote login over SSH tunnel\n  omp auth-broker login anthropic --via=user@broker",
		"# Log out of a provider (interactive without provider arg)\n  omp auth-broker logout anthropic",
		"# Import a CLIProxyAPI auth dump\n  omp auth-broker import ~/.cliproxy/auth",
		"# Import a single CLIProxyAPI JSON, overriding the provider mapping\n  omp auth-broker import ~/.cliproxy/auth/claude-foo.json --provider anthropic",
		"# Preview a migration from local store + env vars to the configured broker\n  omp auth-broker migrate --from-local --include-env --dry-run",
		"# Apply the migration\n  omp auth-broker migrate --from-local --include-env",
		"# Health-check the configured remote broker\n  omp auth-broker status",
	];

	async run(): Promise<void> {
		const { args, flags } = await this.parse(AuthBroker);
		if (!args.action) {
			renderCommandHelp("omp", "auth-broker", AuthBroker);
			return;
		}
		const action = args.action as AuthBrokerAction;
		const cmd: AuthBrokerCommandArgs = {
			action,
			flags: {
				json: flags.json,
				bind: flags.bind,
				regenerate: flags.regenerate,
				via: flags.via,
				// `login`/`logout` reuse the legacy `provider` slot; `import` keeps `source` separate
				// so `provider` flag (used as an override) is unambiguous.
				provider: action === "import" ? flags.provider : (args.source ?? flags.provider),
				source: args.source,
				includeDisabled: flags["include-disabled"],
				fromLocal: flags["from-local"],
				includeEnv: flags["include-env"],
				includeOauth: flags["include-oauth"],
				dryRun: flags["dry-run"],
				trustProxyHeaders: flags["trust-proxy-headers"],
			},
		};
		await initTheme();
		await runAuthBrokerCommand(cmd);
	}
}
