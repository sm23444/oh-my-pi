import { clearSubmittedText } from "./helpers/draft";
import { getOAuthProviders } from "@oh-my-pi/pi-ai/oauth";
import { journalJudgmentUsage, resolveJudge, sharedJudgmentCache } from "../judgment";
import type { AgentSession } from "../session/agent-session";
import type { SessionOAuthAccountList } from "../session/agent-session-types";
import {
	getChangelogPath,
	parseChangelog,
	parseChangelogView,
	renderChangelogEntries,
	selectChangelogEntries,
} from "../utils/changelog";
import { formatTokenCount, refreshStatusLine } from "./builtin-modes";
import { buildContextReportText } from "./helpers/context-report";
import { formatCoarseDuration } from "@oh-my-pi/pi-tui/chrome/format";
import { truncateToWidth } from "@oh-my-pi/pi-tui/render/render-utils";
import { buildJobTree, jobTreeGuide, jobTreeIndent } from "@oh-my-pi/pi-tui/overlays/job-tree";
import { theme } from "@oh-my-pi/pi-tui/theme";
import { sanitizeText } from "@oh-my-pi/pi-utils";
import { handleMcpAcp } from "./helpers/mcp";
import { markdownFenceFor } from "../utils/markdown-fence";
import { openLocalFileInEditor } from "../modes/local-file-editor";
import { commandConsumed, errorMessage, parseSubcommand, usage } from "./helpers/parse";
import {
	describeRedeemOutcome,
	formatResetUsageAccountLine,
	oneLine,
	resolveResetUsageTarget,
	toResetUsageAccounts,
} from "./helpers/reset-usage";
import type { ResetUsageAccount } from "@oh-my-pi/pi-tui/overlays/reset-usage-selector";
import { matchSessionPinAccounts, toSessionPinAccounts } from "./helpers/session-pin";
import {
	launchStatsDashboard,
	parseStatsDashboardArgs,
	type StatsDashboardArgs,
	type StatsDashboardLaunchResult,
} from "./helpers/stats-dashboard";
import { StatsNotice } from "@oh-my-pi/pi-tui/overlays/stats-notice";
import { handleTodoAcp } from "./helpers/todo";
import { buildUsageReportText } from "./helpers/usage-report";
import type { SlashCommandRuntime, SlashCommandSpec } from "./types";

async function handleUsageResetCommand(
	arg: string,
	session: AgentSession,
	output: SlashCommandRuntime["output"],
): Promise<void> {
	let accounts: ResetUsageAccount[];
	try {
		accounts = toResetUsageAccounts(await session.listResetCredits());
	} catch (error) {
		await output(`无法加载已保存的重置：${oneLine(errorMessage(error))}`);
		return;
	}
	if (accounts.length === 0) {
		await output("未找到提供商账户。请使用 /login 添加一个。");
		return;
	}
	if (!arg.trim()) {
		const lines = ["已保存的速率限制重置：", ...accounts.map(formatResetUsageAccountLine)];
		lines.push("", "使用 `/usage reset <provider>/<credential id>` 或 `/usage reset <provider>/active` 消耗一次。");
		await output(lines.join("\n"));
		return;
	}
	const resolved = resolveResetUsageTarget(accounts, arg, "/usage reset");
	if ("error" in resolved) {
		await output(resolved.error);
		return;
	}
	const outcome = await session.redeemResetCredit(resolved.account.target);
	await output(oneLine(describeRedeemOutcome(outcome, resolved.account.label)));
}

/**
 * `/jobs kill <id>|all`: cancel one running background job this session owns,
 * or every running one. Routes through the same owner-scoped
 * `AgentSession.cancelAsyncJob` the jobs sheet's `x`-to-cancel and
 * `proc://<id>/kill` use, so it can only touch jobs `/jobs` lists.
 */
async function handleJobsKillCommand(
	arg: string,
	session: AgentSession,
	output: SlashCommandRuntime["output"],
): Promise<void> {
	const target = arg.trim();
	if (!target) {
		await output("用法：/jobs kill <id>|all");
		return;
	}
	const snapshot = session.getAsyncJobSnapshot({ recentLimit: 0 });
	if (!snapshot) {
		await output("此会话中无法使用异步后台作业。");
		return;
	}
	if (target === "all") {
		let cancelled = 0;
		for (const job of snapshot.running) {
			if (session.cancelAsyncJob(job.id)) cancelled += 1;
		}
		await output(
			cancelled === 0
				? "没有正在运行的后台作业可取消。"
				: `已取消 ${cancelled} 个后台作业${cancelled === 1 ? "" : ""}。`,
		);
		return;
	}
	const safeTarget = truncateToWidth(sanitizeText(target).replace(/\s+/g, " ").trim(), 60);
	if (!snapshot.running.some(job => job.id === target)) {
		await output(`没有正在运行的、ID 为“${safeTarget}”的后台作业。`);
		return;
	}
	await output(
		session.cancelAsyncJob(target)
			? `已取消后台作业 ${safeTarget}。`
			: `无法取消后台作业 ${safeTarget}。`,
	);
}

async function handleSessionPinCommand(
	arg: string,
	session: AgentSession,
	output: SlashCommandRuntime["output"],
): Promise<void> {
	if (session.isStreaming) {
		await output("会话正在流式输出时无法固定账户。");
		return;
	}
	let accountList: SessionOAuthAccountList | undefined;
	try {
		accountList = await session.listCurrentProviderOAuthAccounts();
	} catch (error) {
		await output(`无法加载提供商账户：${errorMessage(error)}`);
		return;
	}
	if (!accountList) {
		await output("固定提供商账户前，请先选择模型。");
		return;
	}
	const provider = getOAuthProviders().find(candidate => candidate.id === accountList.provider);
	const providerName = provider?.name ?? accountList.provider;
	const accounts = toSessionPinAccounts(accountList.accounts);
	if (accounts.length === 0) {
		const source = session.modelRegistry.authStorage.keys.describe(accountList.provider, session.sessionId);
		await output(
			source
				? `没有为 ${providerName} 存储的 OAuth 账户。当前认证来自 ${source}。`
				: `没有为 ${providerName} 存储的 OAuth 账户。使用 /login 添加一个。`,
		);
		return;
	}

	const selector = arg.trim();
	if (!selector) {
		const lines = [`${providerName} 的 OAuth 账户：`];
		for (const account of accounts) {
			lines.push(`${account.position + 1}. ${account.label}${account.active ? " (活跃)" : ""}`);
		}
		lines.push("", "使用 `/session pin <number|email|account id>` 固定一个。");
		await output(lines.join("\n"));
		return;
	}

	const matches = matchSessionPinAccounts(accounts, selector);
	if (matches.length === 0) {
		await output(`没有 ${providerName} 账户与 "${selector}" 匹配。`);
		return;
	}
	if (matches.length > 1) {
		await output(
			`"${selector}" 与多个 ${providerName} 账户匹配：${matches
				.map(account => `${account.position + 1}. ${account.label}`)
				.join(", ")}。请使用账户编号。`,
		);
		return;
	}
	const account = matches[0];
	if (!account || !session.pinCurrentProviderOAuthAccount(account.credentialId)) {
		await output(`${account?.label ?? selector} 不再可用于固定。`);
		return;
	}
	await output(`已将 ${account.label} 固定到此会话，用于 ${providerName}。`);
}

/**
 * Start (or reuse) the stats dashboard for this session. The Frustration page
 * judges through this session's settings and registry; its cost lands on this
 * session's ledger.
 */
function launchSessionStatsDashboard(
	args: StatsDashboardArgs,
	owner: Pick<SlashCommandRuntime, "settings" | "session" | "sessionManager">,
): Promise<StatsDashboardLaunchResult> {
	const judge = resolveJudge({
		settings: owner.settings,
		registry: owner.session.modelRegistry,
		sessionId: owner.session.sessionId,
		purpose: "stats_frustration",
		onUsage: journalJudgmentUsage(owner.sessionManager),
		telemetry: owner.session.agent.telemetry,
		cache: sharedJudgmentCache(),
	});
	return launchStatsDashboard(args, async () => judge);
}

export const BUILTIN_SESSION_SLASH_COMMANDS: ReadonlyArray<SlashCommandSpec> = [
	{
		name: "todo",
		icon: "todo",
		description: "查看或修改智能体的待办事项列表",
		acpDescription: "Manage todos",
		acpInputHint: "<subcommand>",
		subcommands: [
			{ name: "edit", description: "在 $EDITOR 中打开待办事项（Markdown 往返）" },
			{ name: "copy", description: "将待办事项以 Markdown 格式复制到剪贴板" },
			{ name: "expand", description: "在 HUD 中显示所有阶段和任务" },
			{ name: "collapse", description: "恢复受限的 HUD 预览" },
			{ name: "export", description: "将待办事项以 Markdown 格式写入文件（默认：TODO.md）", usage: "[<path>]" },
			{ name: "import", description: "用 Markdown 文件替换待办事项（默认：TODO.md）", usage: "[<path>]" },
			{
				name: "append",
				description: "追加任务；阶段模糊匹配或自动创建",
				usage: "[<phase>] <task...>",
			},
			{ name: "start", description: "标记任务 in_progress（模糊匹配）", usage: "<task>" },
			{ name: "done", description: "将 task/phase/all 标记为已完成（模糊匹配）", usage: "[<task|phase>]" },
			{ name: "drop", description: "将 task/phase/all 标记为已放弃（模糊匹配）", usage: "[<task|phase>]" },
			{ name: "rm", description: "移除 task/phase/all（模糊匹配）", usage: "[<task|phase>]" },
		],
		allowArgs: true,
		getTuiAutocompleteDescription: runtime => {
			const tasks = runtime.ctx.todoPhases.flatMap(phase => phase.tasks);
			if (tasks.length === 0) return "待办事项：无";
			const pending = tasks.filter(task => task.status === "pending").length;
			const inProgress = tasks.filter(task => task.status === "in_progress").length;
			const completed = tasks.filter(task => task.status === "completed").length;
			return `待办事项：${pending + inProgress} 项未完成（${inProgress} 项进行中，${completed} 项已完成）`;
		},
		handle: handleTodoAcp,
		handleTui: async (command, runtime) => {
			await runtime.ctx.handleTodoCommand(command.args);
			clearSubmittedText(runtime);
		},
	},
	{
		name: "session",
		icon: "session",
		description: "会话管理命令",
		acpDescription: "Show or configure the current session",
		acpInputHint: "[info|delete|pin [account]]",
		subcommands: [
			{ name: "info", description: "显示会话信息和统计信息" },
			{ name: "delete", description: "删除当前会话并返回选择器" },
			{
				name: "pin",
				description: "将已存储的 OAuth 账户固定到当前提供商以供此会话使用",
				usage: "[account]",
			},
		],
		allowArgs: true,
		handle: async (command, runtime) => {
			const { verb, rest } = parseSubcommand(command.args);
			if (!verb || (verb === "info" && !rest)) {
				await runtime.output(
					[
						`会话：${runtime.session.sessionId}`,
						`标题：${runtime.session.sessionName}`,
						`CWD: ${runtime.cwd}`,
					].join("\n"),
				);
				return commandConsumed();
			}
			if (verb === "delete" && !rest) {
				if (runtime.session.isStreaming) return usage("流式传输期间无法删除会话。", runtime);
				const sessionFile = runtime.sessionManager.getSessionFile();
				if (!sessionFile) return usage("没有可删除的会话文件（内存中的会话）。", runtime);
				// Route through the active SessionManager so the persist writer is
				// closed before the file is deleted. Constructing a fresh
				// FileSessionStorage and calling deleteSessionWithArtifacts leaves
				// the active writer attached to the now-deleted path, so the next
				// prompt would silently resurrect or corrupt the "deleted" file.
				try {
					await runtime.sessionManager.dropSession(sessionFile);
				} catch (err) {
					return usage(`删除会话失败：${errorMessage(err)}`, runtime);
				}
				await runtime.output(
					`会话已删除：${sessionFile}。使用 ACP \`session/load\` 切换到其他会话。`,
				);
				return commandConsumed();
			}
			if (verb === "pin") {
				await handleSessionPinCommand(rest, runtime.session, runtime.output);
				return commandConsumed();
			}
			return usage("用法：/session [info|delete|pin [account]]", runtime);
		},
		handleTui: async (command, runtime) => {
			const { verb, rest } = parseSubcommand(command.args);
			if (verb === "delete" && !rest) {
				clearSubmittedText(runtime);
				await runtime.ctx.handleSessionDeleteCommand();
				return;
			}
			if (verb === "pin") {
				if (rest) {
					await handleSessionPinCommand(rest, runtime.ctx.session, text => runtime.ctx.showStatus(text));
					refreshStatusLine(runtime.ctx);
				} else {
					await runtime.ctx.showSessionPinSelector();
				}
				clearSubmittedText(runtime);
				return;
			}
			if (!verb || (verb === "info" && !rest)) {
				await runtime.ctx.handleSessionCommand();
			} else {
				runtime.ctx.showStatus("用法：/session [info|delete|pin [account]]");
			}
			clearSubmittedText(runtime);
		},
	},
	{
		name: "jobs",
		icon: "jobs",
		description: "显示异步后台作业状态",
		acpDescription: "Show background jobs",
		acpInputHint: "[full|kill <id>|kill all]",
		subcommands: [
			{ name: "full", description: "显示完整、未截断的命令行" },
			{ name: "kill", description: "取消正在运行的后台作业", usage: "<id>|all" },
		],
		allowArgs: true,
		getTuiAutocompleteDescription: runtime => {
			const snapshot = runtime.ctx.session.getAsyncJobSnapshot({ recentLimit: 5 });
			if (!snapshot || (snapshot.running.length === 0 && snapshot.recent.length === 0)) return "作业：无";
			return `任务：${snapshot.running.length} 个正在运行，${snapshot.recent.length} 个最近`;
		},
		handle: async (command, runtime) => {
			const { verb, rest } = parseSubcommand(command.args);
			if (verb === "kill") {
				await handleJobsKillCommand(rest, runtime.session, runtime.output);
				return commandConsumed();
			}
			if (rest || (verb && verb !== "full")) return usage("用法：/jobs [full|kill <id>|kill all]", runtime);
			const full = verb === "full";
			const tree = runtime.session.getAsyncJobTree();
			if (!tree || (tree.running.length === 0 && tree.recent.length === 0)) {
				await runtime.output(
					"没有正在运行的后台任务。（后台任务会运行异步工具——e.g 长时间运行的 bash、调试或任务子代理，否则这些任务会占用一轮对话。它们存活期间会显示在这里，并在结束后短暂显示（直到结果送达；最多约 5 分钟）。）",
				);
				return commandConsumed();
			}
			// One fenced block keeps the tree rails aligned; the fence outgrows any run inside a command.
			const now = Date.now();
			const rows: string[] = [];
			for (const row of buildJobTree([...tree.running, ...tree.recent], tree.agents, tree.rootId)) {
				const guide = jobTreeGuide(row, theme);
				if (row.kind === "agent") {
					rows.push(`${guide}${row.agent.id}`);
					continue;
				}
				const { job } = row;
				// A spawned subagent's task job takes the agent's id as its id and label: name it once.
				const agent = row.agent && row.agent.id !== job.id ? ` ${row.agent.id}` : "";
				rows.push(
					`${guide}[${job.id}] ${job.type} (${job.status}) — ${formatCoarseDuration((job.endTime ?? now) - job.startTime)}${agent}`,
				);
				const text = sanitizeText(full ? (job.command ?? job.label) : job.label);
				if (text === job.id) continue;
				const indent = jobTreeIndent(row, theme);
				for (const line of full ? text.split("\n") : [text]) rows.push(`${indent}${line}`);
			}
			const body = rows.join("\n");
			const fence = markdownFenceFor(body);
			await runtime.output(
				["后台任务", `运行中：${tree.running.length}`, "", `${fence}文本`, body, fence].join("\n"),
			);
			return commandConsumed();
		},
		handleTui: async (command, runtime) => {
			const { verb, rest } = parseSubcommand(command.args);
			if (verb === "kill") {
				await handleJobsKillCommand(rest, runtime.ctx.session, text => runtime.ctx.showStatus(text));
			} else if (rest || (verb && verb !== "full")) {
				runtime.ctx.showStatus("用法：/jobs [full|kill <id>|kill all]");
			} else {
				await runtime.ctx.handleJobsCommand({ full: verb === "full" });
			}
			clearSubmittedText(runtime);
		},
	},
	{
		name: "usage",
		icon: "gauge",
		description: "显示提供商使用情况和限制",
		acpDescription: "Show token usage",
		acpInputHint: "[show|reset [provider/credential-id|provider/active]]",
		subcommands: [
			{ name: "show", description: "显示提供商使用情况和限制" },
			{
				name: "reset",
				description: "使用已保存的提供商速率限制重置",
				usage: "[provider/credential-id|provider/active]",
			},
		],
		allowArgs: true,
		handle: async (command, runtime) => {
			const { verb, rest } = parseSubcommand(command.args);
			if (!verb || (verb === "show" && !rest)) {
				await runtime.output(await buildUsageReportText(runtime));
				return commandConsumed();
			}
			if (verb === "reset") {
				await handleUsageResetCommand(rest, runtime.session, runtime.output);
				return commandConsumed();
			}
			return usage("用法：/usage [show|reset [provider/credential-id|provider/active]]", runtime);
		},
		handleTui: async (command, runtime) => {
			const { verb, rest } = parseSubcommand(command.args);
			if (!verb || (verb === "show" && !rest)) {
				await runtime.ctx.handleUsageCommand();
				clearSubmittedText(runtime);
				return;
			}
			if (verb === "reset") {
				if (rest) {
					await handleUsageResetCommand(rest, runtime.ctx.session, text => runtime.ctx.showStatus(text));
				} else {
					await runtime.ctx.showResetUsageSelector();
				}
				clearSubmittedText(runtime);
				return;
			}
			runtime.ctx.showStatus("用法：/usage [show|reset [provider/credential-id|provider/active]]");
			clearSubmittedText(runtime);
		},
	},
	{
		name: "stats",
		icon: "stats",
		description: "打开本地统计面板",
		inlineHint: "[--port <port>] [--host <host>]",
		allowArgs: true,
		handle: async (command, runtime) => {
			const parsed = parseStatsDashboardArgs(command.args);
			if ("error" in parsed) return usage(parsed.error, runtime);

			await runtime.output("正在同步会话文件…");
			try {
				const result = await launchSessionStatsDashboard(parsed, runtime);
				await runtime.output(result.message);
			} catch (error) {
				await runtime.output(`统计信息仪表板失败：${errorMessage(error)}`);
				// Mark the failure like `usage()` does, for hosts that report a
				// failed builtin (print mode does not dispatch `/stats`).
				return commandConsumed({ failed: true });
			}
			return commandConsumed();
		},
		handleTui: async (command, runtime) => {
			const ctx = runtime.ctx;
			ctx.editor.setText("");
			const parsed = parseStatsDashboardArgs(command.args);
			if ("error" in parsed) {
				ctx.showStatus(parsed.error);
				return;
			}
			try {
				const result = await launchSessionStatsDashboard(parsed, ctx);
				ctx.presentCommandOutput(new StatsNotice(result.message, result.url));
			} catch (error) {
				ctx.showError(`统计信息仪表板失败：${errorMessage(error)}`);
			}
		},
	},
	{
		name: "changelog",
		icon: "news",
		description: "显示更新日志条目",
		acpDescription: "Show changelog",
		acpInputHint: "[full|last [N]]",
		subcommands: [
			{ name: "full", description: "显示完整更新日志" },
			{ name: "last", description: "显示最近 N 个版本（默认 1）", usage: "[N]" },
		],
		allowArgs: true,
		handle: async (command, runtime) => {
			const view = parseChangelogView(command.args);
			if ("error" in view) return usage(view.error, runtime);
			const changelogPath = getChangelogPath();
			const allEntries = await parseChangelog(changelogPath);
			const entriesToShow = selectChangelogEntries(allEntries, view);
			if (entriesToShow.length === 0) {
				await runtime.output("未找到更新日志。");
				return commandConsumed();
			}
			await runtime.output(renderChangelogEntries(entriesToShow).markdown);
			return commandConsumed();
		},
		handleTui: async (command, runtime) => {
			await runtime.ctx.handleChangelogCommand(command.args);
			clearSubmittedText(runtime);
		},
	},
	{
		name: "hotkeys",
		icon: "keyboard",
		description: "显示所有键盘快捷键",
		handleTui: (_command, runtime) => {
			runtime.ctx.handleHotkeysCommand();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "tools",
		icon: "tools",
		description: "显示当前对智能体可见的工具",
		acpDescription: "Show available tools",
		getTuiAutocompleteDescription: runtime => {
			const active = runtime.ctx.session.getActiveToolNames().length;
			const all = runtime.ctx.session.getAllToolNames().length;
			return all === 0 ? "工具：没有可用工具" : `工具：${active} 活跃 / ${all} 可用`;
		},
		handle: async (_command, runtime) => {
			const active = runtime.session.getActiveToolNames();
			const all = runtime.session.getAllToolNames();
			if (all.length === 0) {
				await runtime.output("没有可用工具。");
				return commandConsumed();
			}
			const lines = all.map(name => `${active.includes(name) ? "*" : "-"} ${name}`);
			for (const mounted of runtime.session.getXdevToolEntries()) {
				lines.push(`~ xd://${mounted.name}`);
			}
			await runtime.output(lines.join("\n"));
			return commandConsumed();
		},
		handleTui: (_command, runtime) => {
			runtime.ctx.handleToolsCommand();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "context",
		icon: "context",
		description: "浏览上下文使用情况和详细内容",
		acpDescription: "Show context usage",
		getTuiAutocompleteDescription: runtime => {
			const usage = runtime.ctx.session.getContextUsage();
			if (!usage) return "上下文：不可用";
			return `上下文：${Math.round(usage.percent)}% (${formatTokenCount(usage.tokens)}/${formatTokenCount(usage.contextWindow)})`;
		},
		handle: async (_command, runtime) => {
			await runtime.output(buildContextReportText(runtime));
			return commandConsumed();
		},
		handleTui: (_command, runtime) => {
			runtime.ctx.handleContextCommand();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "extensions",
		aliases: ["status"],
		icon: "extension",
		description: "打开扩展控制中心",
		handleTui: (_command, runtime) => {
			runtime.ctx.showExtensionsDashboard();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "agents",
		icon: "agents",
		description: "打开代理中心（查看各代理的模型、预走查和顾问）",
		handleTui: (_command, runtime) => {
			runtime.ctx.showAgentsDashboard();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "git",
		icon: "branch",
		description: "打开 Git 界面（分栏差异查看器、暂存、提交撰写器）",
		inlineHint: "[revision]",
		allowArgs: true,
		handleTui: (command, runtime) => {
			runtime.ctx.showGitUi(command.args.trim() || undefined);
			clearSubmittedText(runtime);
		},
	},
	{
		name: "local",
		icon: "pencil",
		description: "在 $EDITOR 中打开会话 local:// 文件（未提供名称时使用选择器）",
		inlineHint: "[name]",
		allowArgs: true,
		handleTui: async (command, runtime) => {
			clearSubmittedText(runtime);
			await openLocalFileInEditor(runtime.ctx, command.args);
		},
	},
	{
		name: "hub",
		aliases: ["subagents"],
		icon: "agents",
		description: "打开实时代理中心（子代理，含已完成项）",
		handleTui: (_command, runtime) => {
			runtime.ctx.showAgentHub({ initialSection: "activity" });
			clearSubmittedText(runtime);
		},
	},
	{
		name: "branch",
		aliases: ["rewind"],
		icon: "branch",
		description: "回退到之前的消息，并将旧路径保留为分支",
		handleTui: (_command, runtime) => {
			runtime.ctx.showUserMessageSelector();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "fork",
		icon: "branch",
		description: "分叉此会话，或在多路复用器窗格或窗口中打开它",
		subcommands: [
			{ name: "pane", description: "在新的终端窗格中打开 fork" },
			{ name: "window", description: "在新的多路复用器窗口中打开 fork" },
			{ name: "tab", description: "window 的别名" },
		],
		subcommandOptional: true,
		allowArgs: true,
		handleTui: async (command, runtime) => {
			const args = command.args.trim();
			let placement: "pane" | "window" | undefined;
			if (args) {
				const [keyword, ...extra] = args.split(/\s+/);
				if (extra.length > 0) {
					clearSubmittedText(runtime);
					runtime.ctx.showError("用法：/fork [pane|window|tab]");
					return;
				}
				switch (keyword?.toLowerCase()) {
					case "pane":
						placement = "pane";
						break;
					case "window":
					case "tab":
						placement = "window";
						break;
					default:
						clearSubmittedText(runtime);
						runtime.ctx.showError("用法：/fork [pane|window|tab]");
						return;
				}
			}
			clearSubmittedText(runtime);
			if (placement) await runtime.ctx.handleForkCommand(placement);
			else await runtime.ctx.handleForkCommand();
		},
	},
	{
		name: "tree",
		icon: "tree",
		description: "导航会话树（切换分支）",
		handleTui: (_command, runtime) => {
			runtime.ctx.showTreeSelector();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "login",
		icon: "signIn",
		description: "使用 OAuth 提供商登录",
		inlineHint: "[provider|redirect URL]",
		allowArgs: true,
		getTuiAutocompleteDescription: runtime =>
			runtime.ctx.oauthManualInput.hasPending()
				? `登录：等待 ${runtime.ctx.oauthManualInput.pendingProviderId ?? "OAuth"} 回调`
				: "登录：选择提供商",
		handleTui: (command, runtime) => {
			const manualInput = runtime.ctx.oauthManualInput;
			const args = command.args.trim();
			if (args.length > 0) {
				const matchedProvider = getOAuthProviders().find(provider => provider.id === args);
				if (matchedProvider) {
					if (manualInput.hasPending()) {
						const pendingProvider = manualInput.pendingProviderId;
						const message = pendingProvider
							? `正在为 ${pendingProvider} 进行 OAuth 登录。请粘贴重定向 URL（使用 /login <url>）。`
							: "OAuth 登录已在进行中。请粘贴重定向 URL（使用 /login <url>）。";
						runtime.ctx.showWarning(message);
						clearSubmittedText(runtime);
						return;
					}
					void runtime.ctx.showOAuthSelector("login", matchedProvider.id);
					clearSubmittedText(runtime);
					return;
				}
				const submitted = manualInput.submit(args);
				if (submitted) {
					runtime.ctx.showStatus("已收到 OAuth 回调；正在完成登录…");
				} else {
					runtime.ctx.showWarning("当前没有等待手动回调的 OAuth 登录。");
				}
				clearSubmittedText(runtime);
				return;
			}

			if (manualInput.hasPending()) {
				const provider = manualInput.pendingProviderId;
				const message = provider
					? `正在为 ${provider} 进行 OAuth 登录。请粘贴重定向 URL（使用 /login <url>）。`
					: "OAuth 登录已在进行中。请粘贴重定向 URL（使用 /login <url>）。";
				runtime.ctx.showWarning(message);
				clearSubmittedText(runtime);
				return;
			}

			void runtime.ctx.showOAuthSelector("login");
			clearSubmittedText(runtime);
		},
	},
	{
		name: "logout",
		icon: "signOut",
		description: "从 OAuth 提供商注销登录",
		inlineHint: "[provider]",
		allowArgs: true,
		handleTui: (command, runtime) => {
			const providerId = command.args.trim();
			if (providerId) {
				const matchedProvider = getOAuthProviders().find(provider => provider.id === providerId);
				if (!matchedProvider) {
					runtime.ctx.showWarning(`未知 OAuth 提供商：${providerId}`);
					clearSubmittedText(runtime);
					return;
				}
				void runtime.ctx.showOAuthSelector("logout", matchedProvider.id);
				clearSubmittedText(runtime);
				return;
			}
			void runtime.ctx.showOAuthSelector("logout");
			clearSubmittedText(runtime);
		},
	},
	{
		name: "mcp",
		icon: "mcp",
		description: "管理 MCP 服务器（添加、列出、移除、测试）",
		acpDescription: "Manage MCP servers",
		inlineHint: "<subcommand>",
		subcommands: [
			{
				name: "add",
				description: "添加新的 MCP 服务器",
				usage: "<name> [--scope project|user] [--url <url>] [-- <command...>]",
			},
			{ name: "list", description: "列出所有已配置的 MCP 服务器" },
			{ name: "remove", description: "移除 MCP 服务器", usage: "<name> [--scope project|user]" },
			{ name: "test", description: "测试服务器连接", usage: "<name>" },
			{ name: "reauth", description: "为服务器重新授权 OAuth", usage: "<name>" },
			{ name: "unauth", description: "移除服务器的 OAuth 授权", usage: "<name>" },
			{ name: "enable", description: "启用 MCP 服务器", usage: "<name>" },
			{ name: "disable", description: "禁用 MCP 服务器", usage: "<name>" },
			{
				name: "smithery-search",
				description: "搜索 Smithery 注册表并部署一个 MCP 服务器",
				usage: "<keyword> [--scope project|user] [--limit <1-100>] [--semantic]",
			},
			{ name: "smithery-login", description: "登录 Smithery 并缓存 API 密钥" },
			{ name: "smithery-logout", description: "移除已缓存的 Smithery API 密钥" },
			{ name: "reconnect", description: "重新连接到指定的 MCP 服务器", usage: "<name>" },
			{ name: "reload", description: "强制重新加载 MCP 运行时工具" },
			{ name: "resources", description: "列出已连接服务器上的可用资源" },
			{ name: "prompts", description: "列出已连接服务器上的可用提示" },
			{ name: "notifications", description: "显示通知能力与订阅" },
			{ name: "help", description: "显示帮助消息" },
		],
		allowArgs: true,
		handle: handleMcpAcp,
		handleTui: async (command, runtime) => {
			clearSubmittedText(runtime);
			await runtime.ctx.handleMCPCommand(command.text);
		},
	},
];
