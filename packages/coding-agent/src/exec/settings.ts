/**
 * Settings declared by this domain (see `config/registry.ts`). Declaration order is the
 * settings-panel order; `config/all-settings.ts` registers every domain.
 */
import { combine, register, type SettingValueOf } from "../config/registry";

/** One bash-interceptor rule: commands matching `pattern` are redirected to `tool`. */
export interface BashInterceptorRule {
	pattern: string;
	flags?: string;
	tool: string;
	message: string;
	allowSubcommands?: string[];
}

const EMPTY_STRING_ARRAY: string[] = [];
export const DEFAULT_BASH_INTERCEPTOR_RULES: BashInterceptorRule[] = [
	{
		// `cat` that sends stdout to a file or reads a heredoc writes rather than
		// reads, also after leading redirects of other fds (`cat 2>err > out`);
		// the write rule below owns those forms. `cat 2>err file` and
		// `cat >&2 file` (stdout duplicated, not sent to a file) still read.
		// A redirect target cannot start with `>` or `|`, so each leading
		// redirect is consumed one way and matching stays linear.
		pattern:
			"^\\s*(?:(?:head|tail|less|more)\\s+|cat\\s+(?!\\s|(?:[02-9]>{1,2}\\|?\\s*[^\\s>|]\\S*\\s+)*(?:<<|1?>(?!&)|&>)))",
		tool: "read",
		message: "Use the `read` tool instead of cat/head/tail. It provides better context and handles binary files.",
	},
	{
		pattern: "^\\s*(grep|rg|ripgrep|ag|ack)\\s+",
		tool: "grep",
		message: "Use the `grep` tool instead of grep/rg. It respects .gitignore and provides structured output.",
	},
	{
		pattern: "^\\s*(find|fd|locate)\\s+.*(-name|-iname|-type|--type|-glob)",
		tool: "glob",
		message: "Use the `glob` tool instead of find/fd. It respects .gitignore and is faster for glob patterns.",
	},
	{
		pattern: "^\\s*sed\\s+(-i|--in-place)",
		tool: "edit",
		message: "Use the `edit` tool instead of sed -i. It provides diff preview and fuzzy matching.",
	},
	{
		pattern: "^\\s*perl\\s+.*-[pn]?i",
		tool: "edit",
		message: "Use the `edit` tool instead of perl -i. It provides diff preview and fuzzy matching.",
	},
	{
		pattern: "^\\s*awk\\s+.*-i\\s+inplace",
		tool: "edit",
		message: "Use the `edit` tool instead of awk -i inplace. It provides diff preview and fuzzy matching.",
	},
	{
		// `>` must sit outside quoted regions (so `echo "a -> b"` passes) and be
		// followed by a plausible filename — including `$VAR` targets; `>|`
		// (clobber) counts as a redirect; `>&2`/`2>&1` style fd duplication and
		// redirects of fds other than stdout (`2>err.log`) are not matched, and
		// the scan continues past them and past input duplication (`<&0`), so
		// `2>&1 > out.txt` is a write. The scan stops at an unquoted,
		// unescaped `;`, `&&`, `|` or newline outside a command substitution,
		// so a redirect in a later command or a heredoc body is not attributed
		// to the echo/cat, while `echo foo\; > out.txt` and
		// `echo $(printf a; printf b) > out.txt` keep theirs. Allowed device
		// sinks are consumed while looking for later real file redirects
		// because the write tool cannot replace shell output/discard targets.
		// Each character has exactly one way to be consumed (an fd-numbered
		// redirect only by the fd branch, an escape only by the escape branch,
		// a `$(`, `${` or backtick only by the substitution branch, and as a
		// plain character only when that branch cannot consume it, so a deeper
		// nesting such as `${a:-${b}}` is scanned as before), which keeps
		// matching linear on long commands.
		pattern:
			"^\\s*(?:(?:echo|printf)\\s+|cat\\s*<<|cat(?=\\s+(?:\\d+|&)?>)\\s+)(?:(?:\\\\[\\s\\S]|\\$\\((?:[^()\"'`]|\"[^\"]*\"|'[^']*'|`[^`]*`|\\([^()]*\\))*\\)|\\$\\{[^{}]*\\}|`[^`]*`|\\$(?!\\((?:[^()\"'`]|\"[^\"]*\"|'[^']*'|`[^`]*`|\\([^()]*\\))*\\)|\\{[^{}]*\\})|`(?![^`]*`)|[^\"'>;&|\\n\\\\$`]|(?<=[<>])&|(?<![<>])&(?=>)|(?<=(?:^|\\s)[02-9])>{1,2}\\|?|\"[^\"]*\"|'[^']*')|(?<!\\||>|(?:^|\\s)[02-9])>{1,2}\\|?\\s*(?:\"/dev/(?:null|tty|stdout|stderr)\"|'/dev/(?:null|tty|stdout|stderr)'|/dev/(?:null|tty|stdout|stderr))(?=[\\s;&|]|$))*(?<!\\||>|(?:^|\\s)[02-9])>{1,2}\\|?\\s*(?!(?:\"/dev/(?:null|tty|stdout|stderr)\"|'/dev/(?:null|tty|stdout|stderr)'|/dev/(?:null|tty|stdout|stderr))(?:[\\s;&|]|$))[$\\w./~\"'-]",
		tool: "write",
		message:
			"Use the `write` tool instead of echo/cat redirection. It handles encoding and provides confirmation. `write` replaces the whole file; to append to an existing file, use `edit` to insert after its last line.",
	},
	{
		pattern: "^\\s*nohup\\s+|(?<!&)\\&\\s*$",
		tool: "bash",
		message:
			"Use `bash` with `name` instead of nohup or background shell syntax so the service stays observable and managed.",
	},
	{
		pattern:
			"^\\s*(?:(?:bun|npm|pnpm|yarn)\\s+(?:run\\s+)?(?:dev|start)(?:\\s|$)|(?:vite|next\\s+dev|nuxt\\s+dev|nodemon|lldb|gdb|tail\\s+-f)(?:\\s|$)|docker\\s+compose\\s+up(?!.*(?:\\s-d(?:\\s|$)|--detach))(?:\\s|$))",
		tool: "bash",
		message: "Use `bash` with `name` for services, watchers, and debuggers; inspect with `read proc://<name>`.",
	},
	{
		pattern:
			"^\\s*(?:(?:bun|npm|pnpm|yarn)\\s+(?:run\\s+)?\\S+|cargo\\s+watch|watchexec|pytest|vitest|jest|tsc)(?:.|\\n)*(?:--watch|-w)(?:\\s|$)",
		tool: "bash",
		message: "Use `bash` with `name` for watch mode so its output, input, and lifecycle stay managed.",
	},
];

export const cfgShellPath = register({ id: "shellPath", type: "string", default: undefined });

/** Pi shell command prefix forwarded to legacy extensions; OMP's native shell does not apply it. */
export const cfgLegacyShellCommandPrefix = register({ id: "shellCommandPrefix", type: "string", default: undefined });

export const cfgBashEnabled = register({
	id: "bash.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "shell",
		group: "Bash",
		label: "Bash",
		description: "启用 bash 工具执行 shell 命令",
	},
});

export const cfgBashAllowCompoundCommands = register({
	id: "bash.allowCompoundCommands",
	type: "boolean",
	default: false,
	ui: {
		tab: "shell",
		group: "Bash",
		label: "允许复合命令",
		description:
			"逐条命令评估字面 && 链；未匹配的命令使用普通 bash 审批策略和模式",
	},
});

export const cfgBashAutoBackgroundEnabled = register({
	id: "bash.autoBackground.enabled",
	protocolDefault: ["rpc"],
	type: "boolean",
	default: true,
	ui: {
		tab: "shell",
		group: "Bash",
		label: "Bash 自动后台化",
		description: "自动将长时间运行的 bash 命令后台化,稍后交付结果",
	},
});

export const cfgBashGitGuard = register({
	id: "bash.gitGuard",
	type: "boolean",
	default: false,
	ui: {
		tab: "shell",
		group: "Bash",
		label: "Git 防护",
		description:
			"拒绝在仓库主检出中丢弃或移动共享工作的 git 命令：stash、reset --hard 或重置到其他提交，以及在合并或变基冲突之外执行 checkout/switch/restore。在关联的工作树中它们可以运行，但会先保存它们丢弃的未提交更改",
	},
});

export const cfgBashPatterns = register({
	id: "bash.patterns",
	type: "array",
	default: [],
	ui: {
		tab: "shell",
		group: "Bash",
		label: "Bash 审批模式",
		description:
			"有序的 bash 命令审批规则。每项包含 match 和 approval 字段;仅支持 '*' 通配符。",
	},
});

// Bash interceptor
export const cfgBashInterceptorEnabled = register({
	id: "bashInterceptor.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "shell",
		group: "Bash",
		label: "Bash 拦截器",
		description: "阻止已有专用工具的 shell 命令",
	},
});

export const cfgBashInterceptorPatterns = register({
	id: "bashInterceptor.patterns",
	type: "array",
	default: DEFAULT_BASH_INTERCEPTOR_RULES,
});

export const cfgBashDirenv = register({
	id: "bash.direnv",
	type: "enum",
	values: ["auto", "off"] as const,
	default: "auto",
	ui: {
		tab: "shell",
		group: "Bash",
		label: "direnv 自动加载",
		description:
			"自动将仓库的 direnv/devenv `.envrc` 加载到 bash 会话,使 devenv 工具和环境变量无需手动 `direnv exec` 即可使用。遵循 direnv 的允许列表:未经 `direnv allow` 的 `.envrc` 永远不会被执行",
	},
});

export const cfgBashDirenvLoadTimeoutMs = register({
	id: "bash.direnvLoadTimeoutMs",
	type: "number",
	default: 30_000,
	ui: {
		tab: "shell",
		group: "Bash",
		label: "direnv 加载超时 (ms)",
		description:
			"等待第一次 `direnv export` 的最大时间(冷 devenv shell 可能很慢);超时后会话在没有 direnv 环境的情况下运行",
	},
});

// Shell output minimizer
export const cfgShellMinimizerEnabled = register({
	id: "shellMinimizer.enabled",
	type: "boolean",
	default: true,
	ui: {
		tab: "shell",
		group: "Bash",
		label: "Shell 输出压缩器",
		description: "在将冗长的 shell 输出(git、npm、cargo 等)返回给代理之前进行压缩",
	},
});

export const cfgShellMinimizerSettingsPath = register({
	id: "shellMinimizer.settingsPath",
	type: "string",
	default: undefined,
});

export const cfgShellMinimizerOnly = register({
	id: "shellMinimizer.only",
	type: "array",
	default: EMPTY_STRING_ARRAY,
});

export const cfgShellMinimizerExcept = register({
	id: "shellMinimizer.except",
	type: "array",
	default: EMPTY_STRING_ARRAY,
});

export const cfgShellMinimizerMaxCaptureBytes = register({
	id: "shellMinimizer.maxCaptureBytes",
	type: "number",
	default: 4 * 1024 * 1024,
});

export const cfgShellMinimizerSourceOutlineLevel = register({
	id: "shellMinimizer.sourceOutlineLevel",
	type: "enum",
	values: ["default", "aggressive"] as const,
	default: "default",
	ui: {
		tab: "shell",
		group: "Bash",
		label: "Shell 压缩器源码大纲",
		description: "cat/read 源码文件的源码大纲模式:default 或 aggressive",
	},
});

export const cfgShellMinimizerLegacyFilters = register({
	id: "shellMinimizer.legacyFilters",
	type: "boolean",
	default: undefined,
});

/** Shell output minimizer configuration (`shellMinimizer.*`). */
export const cfgShellMinimizer = combine({
	enabled: cfgShellMinimizerEnabled,
	settingsPath: cfgShellMinimizerSettingsPath,
	only: cfgShellMinimizerOnly,
	except: cfgShellMinimizerExcept,
	maxCaptureBytes: cfgShellMinimizerMaxCaptureBytes,
	sourceOutlineLevel: cfgShellMinimizerSourceOutlineLevel,
	legacyFilters: cfgShellMinimizerLegacyFilters,
});

/** Shell output minimizer configuration ({@link cfgShellMinimizer}). */
export type ShellMinimizerSettings = SettingValueOf<typeof cfgShellMinimizer>;

export const cfgBashAutoBackgroundThresholdMs = register({
	id: "bash.autoBackground.thresholdMs",
	protocolDefault: ["rpc"],
	type: "number",
	default: 60_000,
});
