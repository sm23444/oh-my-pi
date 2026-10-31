import { SEANCE_SLASH_COMMAND } from "./seance";
import { clearSubmittedText, refuseImages, restoreDetachedDraft, runWithDetachedDraft } from "./helpers/draft";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { CompactionCancelledError } from "@oh-my-pi/pi-agent-core/compaction";
import { logger, setProjectDir } from "@oh-my-pi/pi-utils";
import { clearClaudePluginRootsCache } from "../discovery/helpers";
import { rebindMemoryBackendForCwd } from "../hindsight/backend";
import { memoryStatsUnavailableMessage, resolveMemoryBackend } from "../memory-backend";
import { continuesConversation } from "../modes/utils/conversation-position";
import type { FreshSessionResult, HandoffResult } from "../session/agent-session";
import { COMPACT_MODES, parseCompactArgs } from "../session/compact-modes";
import { USER_INTERRUPT_LABEL } from "../session/messages";
import { resolveResumableSession, resolveResumeTarget } from "../session/session-listing";
import { toggleSessionPin } from "../session/session-pins";
import {
	cleanSourceCheckoutIfConfigured,
	createSessionWorktree,
	defaultSessionWorktreeBranch,
	formatSessionWorktreeSummary,
	type SessionWorktree,
} from "../session/session-worktree";
import { formatShakeSummary, type ShakeMode } from "../session/shake-types";
import { discoverTitleSystemPromptFile, resolvePromptInput } from "../system-prompt";
import { resolveToCwd } from "../tools/path-utils";
import { commandConsumed, errorMessage, usage } from "./helpers/parse";
import { handleSshAcp } from "./helpers/ssh";
import type {
	ParsedSlashCommand,
	SlashCommandResult,
	SlashCommandRuntime,
	SlashCommandSpec,
	TuiSlashCommandRuntime,
} from "./types";

function formatFreshSessionResult(result: FreshSessionResult): string {
	const stateLabel = result.closedProviderSessions === 1 ? "provider state" : "provider states";
	return `新的提供商会话已启动（已清理 ${result.closedProviderSessions} ${stateLabel}）。`;
}

export const shutdownHandlerTui = (
	_command: ParsedSlashCommand,
	runtime: TuiSlashCommandRuntime,
): SlashCommandResult => {
	clearSubmittedText(runtime);
	void runtime.ctx.shutdown();
	return commandConsumed();
};

/** Parse the `/shake` subcommand into a {@link ShakeMode}; empty defaults to elide. */
function parseShakeMode(args: string): ShakeMode | { error: string } {
	const verb = args.trim().toLowerCase();
	if (verb === "" || verb === "elide") return "elide";
	if (verb === "images") return "images";
	if (verb === "thinking") return "thinking";
	return { error: `Unknown /shake mode "${verb}". Use elide, images, or thinking.` };
}

/** Format the session's workspace directories (cwd + additional) for display. */
function formatWorkspaceDirectories(runtime: SlashCommandRuntime, note?: string): string {
	const cwd = runtime.sessionManager.getCwd();
	const additional = runtime.sessionManager.getAdditionalDirectories();
	const lines = ["工作区目录：", `  ${cwd}（工作目录）`, ...additional.map(d => `  ${d}`)];
	return note ? `${note}\n${lines.join("\n")}` : lines.join("\n");
}
async function fatalMoveFailure(text: string, runtime: SlashCommandRuntime): Promise<SlashCommandResult> {
	await runtime.output(text);
	await runtime.session.dispose();
	return commandConsumed();
}

/** A move rollback failed: re-align the workspace to wherever the session ended up and report it. */
async function reportFailedRollback(runtime: SlashCommandRuntime, rollbackError: unknown): Promise<SlashCommandResult> {
	const actual = runtime.sessionManager.getCwd();
	try {
		await rescopeHeadlessToCwd(runtime, actual);
	} catch {
		return fatalMoveFailure(
			`Move failed and rollback failed: ${errorMessage(rollbackError)} (failed to re-align workspace to ${actual}; process remains at source while session is at ${actual})`,
			runtime,
		);
	}
	return usage(
		`移动失败且回滚失败：${errorMessage(rollbackError)}（工作区仍位于 ${actual}）`,
		runtime,
	);
}

/**
 * Relocate the headless session to `resolvedPath` (an existing directory):
 * flush settings, move the session file, re-scope the process, rolling back
 * on failure. Returns a result when the move did not complete; `undefined`
 * on success so the caller can report its own confirmation.
 */
async function relocateHeadlessSession(
	runtime: SlashCommandRuntime,
	resolvedPath: string,
): Promise<SlashCommandResult | undefined> {
	try {
		await runtime.settings.flush();
	} catch (err) {
		return usage(`保存待处理设置失败：${errorMessage(err)}`, runtime);
	}
	const previousState = runtime.sessionManager.captureState();
	try {
		await runtime.session.moveSession(resolvedPath);
	} catch (err) {
		return usage(`移动失败：${errorMessage(err)}`, runtime);
	}
	try {
		setProjectDir(resolvedPath);
	} catch (err) {
		try {
			await runtime.sessionManager.rollbackMove(previousState);
		} catch (rollbackError) {
			return reportFailedRollback(runtime, rollbackError);
		}
		return usage(`移动失败：${errorMessage(err)}`, runtime);
	}
	try {
		await rescopeHeadlessToCwd(runtime, resolvedPath);
	} catch (err) {
		try {
			await runtime.sessionManager.rollbackMove(previousState);
			await rescopeHeadlessToCwd(runtime, previousState.cwd);
		} catch (rollbackError) {
			return reportFailedRollback(runtime, rollbackError);
		}
		return usage(`移动失败：${errorMessage(err)}`, runtime);
	}
	await runtime.notifyConfigChanged?.();
	await runtime.notifyTitleChanged?.();
	return undefined;
}

export const BUILTIN_LIFECYCLE_SLASH_COMMANDS: ReadonlyArray<SlashCommandSpec> = [
	{
		name: "ssh",
		icon: "host",
		description: "管理 SSH 主机（添加、列出、移除）",
		acpDescription: "Manage SSH connections",
		inlineHint: "<subcommand>",
		subcommands: [
			{
				name: "add",
				description: "添加一个 SSH 主机",
				usage: "<name> --host <host> [--user <user>] [--port <port>] [--key <keyPath>] [--scope project|user]",
			},
			{ name: "list", description: "列出所有已配置的 SSH 主机" },
			{ name: "remove", description: "移除一个 SSH 主机", usage: "<name> [--scope project|user]" },
			{ name: "help", description: "显示帮助消息" },
		],
		allowArgs: true,
		handle: handleSshAcp,
		handleTui: async (command, runtime) => {
			clearSubmittedText(runtime);
			await runtime.ctx.handleSSHCommand(command.text);
		},
	},
	{
		name: "new",
		icon: "plus",
		description: "开始新会话",
		handleTui: async (_command, runtime) => {
			clearSubmittedText(runtime);
			await runtime.ctx.handleNewCommand();
		},
	},
	{
		name: "fresh",
		icon: "restart",
		description: "重置提供商流状态，而不更改本地会话记录",
		getTuiAutocompleteDescription: runtime =>
			runtime.ctx.session.isStreaming ? "Fresh：流式传输期间不可用" : "Fresh：就绪",
		handle: async (_command, runtime) => {
			const result = runtime.session.freshSession();
			if (!result) {
				await runtime.output(
					"请等待当前响应完成或中止，然后再刷新提供商状态。",
				);
				return commandConsumed();
			}
			await runtime.output(formatFreshSessionResult(result));
			return commandConsumed();
		},
		handleTui: async (_command, runtime) => {
			clearSubmittedText(runtime);
			await runtime.ctx.handleFreshCommand();
		},
	},
	{
		name: "clear",
		icon: "eraser",
		description: "原地清除对话上下文，同时保留会话",
		getTuiAutocompleteDescription: runtime =>
			runtime.ctx.session.isStreaming ? "Clear：流式传输期间不可用" : "Clear：丢弃上下文，保留会话",
		handleTui: async (_command, runtime) => {
			clearSubmittedText(runtime);
			await runtime.ctx.handleResetContextCommand();
		},
	},
	{
		name: "delete",
		icon: "trash",
		description: "删除当前会话并开始新会话",
		handleTui: async (_command, runtime) => {
			clearSubmittedText(runtime);
			await runtime.ctx.handleDeleteCommand();
		},
	},
	{
		name: "compact",
		icon: "compress",
		description: "手动压缩会话上下文",
		acpDescription: "Compact the conversation",
		subcommands: COMPACT_MODES.map(mode => ({
			name: mode.name,
			description: mode.description,
			usage: mode.rejectsFocus ? undefined : "[focus]",
		})),
		acpInputHint: `[${COMPACT_MODES.map(mode => mode.name).join("|")}] [focus]`,
		allowArgs: true,
		getTuiAutocompleteDescription: runtime => {
			const usage = runtime.ctx.session.getContextUsage();
			return usage ? `Compact：上下文已使用 ${Math.round(usage.percent)}%` : "Compact：上下文不可用";
		},
		handle: async (command, runtime) => {
			const parsed = parseCompactArgs(command.args);
			if ("error" in parsed) return usage(parsed.error, runtime);
			// Print mode turns a failed compaction into a nonzero exit; the
			// flag is closure state because the background-dispatch branch
			// (RPC) returns before `runCompact` settles.
			let compactFailed = false;
			const runCompact = async (): Promise<void> => {
				const before = runtime.session.getContextUsage?.();
				const beforeTokens = before?.tokens;
				try {
					await runtime.session.compact(parsed.instructions, parsed.mode ? { mode: parsed.mode } : undefined);
				} catch (err) {
					// RPC `abort` and ACP `session/cancel` propagate their explicit
					// USER_INTERRUPT_LABEL through the compaction abort signal. The client
					// already saw the interrupt it sent; emitting anything here would
					// append an out-of-turn chunk. Other cancellations (including an
					// extension veto) remain visible.
					if (err instanceof CompactionCancelledError && err.cause === USER_INTERRUPT_LABEL) return;
					// Compaction precondition failures (no model, already compacted, too
					// small) and provider errors propagate as plain Errors; surface them
					// via runtime.output so they don't fail the ACP prompt turn.
					compactFailed = true;
					await runtime.output(`压缩失败：${errorMessage(err)}`);
					return;
				}
				const after = runtime.session.getContextUsage?.();
				const afterTokens = after?.tokens;
				if (beforeTokens != null && afterTokens != null) {
					const saved = beforeTokens - afterTokens;
					await runtime.output(`压缩完成。Token 数：${beforeTokens} -> ${afterTokens}（节省 ${saved}）。`);
				} else {
					await runtime.output("上下文压缩完成。");
				}
			};
			// Provider-backed: background-dispatch under RPC so the serialized command
			// queue stays free for `abort` (SlashCommandRuntime.runCommandInBackground).
			// ACP/TUI have no such hook and keep the inline await.
			if (runtime.runCommandInBackground) {
				runtime.runCommandInBackground(runCompact);
				return commandConsumed();
			}
			await runCompact();
			return commandConsumed({ failed: compactFailed });
		},
		handleTui: async (command, runtime) => {
			const parsed = parseCompactArgs(command.args);
			clearSubmittedText(runtime);
			if ("error" in parsed) {
				runtime.ctx.showWarning(parsed.error);
				return;
			}
			const { ctx } = runtime;
			const origin = runtime.followUp;
			// A switch still applying (or rolling back) decides which conversation is live; judge after it.
			if (origin && ctx.session.isSessionTransitioning) await ctx.session.waitForSessionTransition();
			if (origin && !continuesConversation(ctx.sessionManager, origin)) {
				// Input hooks ran while the conversation changed: never compact one it was not sent in.
				restoreDetachedDraft(ctx.editor, command.text, runtime.input?.images, runtime.input?.imageLinks);
				ctx.showWarning("执行 /compact 前对话已发生变化，命令已放回编辑器");
				return;
			}
			if (origin && ctx.session.isStreaming) {
				ctx.yieldCompaction = {
					...origin,
					text: command.text,
					instructions: parsed.instructions,
					mode: parsed.mode,
				};
				ctx.updatePendingMessagesDisplay();
				ctx.showStatus("已将上下文压缩加入队列，将在智能体交出控制权时执行");
				// A prompt still in setup may bail without an agent run, and so without the settle that runs this.
				ctx.runYieldCompaction();
				return;
			}
			await ctx.handleCompactCommand(parsed.instructions, parsed.mode);
		},
	},
	{
		name: "shake",
		icon: "vibrate",
		description: "丢弃上下文中的重型内容（工具结果、大型块）",
		acpDescription: "Shake heavy content out of the conversation context",
		subcommands: [
			{ name: "elide", description: "移除工具结果和大型代码块（默认）" },
			{ name: "images", description: "移除图像块" },
			{ name: "thinking", description: "丢弃所有思考块" },
		],
		acpInputHint: "[elide|images|thinking]",
		allowArgs: true,
		handle: async (command, runtime) => {
			const mode = parseShakeMode(command.args);
			if (typeof mode !== "string") return usage(mode.error, runtime);
			const result = await runtime.session.shake(mode);
			await runtime.output(formatShakeSummary(result));
			return commandConsumed();
		},
		handleTui: async (command, runtime) => {
			clearSubmittedText(runtime);
			const mode = parseShakeMode(command.args);
			if (typeof mode !== "string") {
				runtime.ctx.showWarning(mode.error);
				return;
			}
			await runtime.ctx.handleShakeCommand(mode);
		},
	},
	{
		name: "handoff",
		icon: "handoff",
		description: "将会话总结为交接文档并就地压缩",
		acpDescription: "Summarize the session into a handoff document and compact in place",
		inlineHint: "[focus instructions]",
		allowArgs: true,
		handle: async (command, runtime) => {
			if (runtime.session.isStreaming) {
				return usage("请等待当前响应完成或中止后再进行交接。", runtime);
			}
			if (runtime.session.isGeneratingHandoff) {
				return usage("交接生成已在进行中。", runtime);
			}
			// Print mode turns a failed handoff into a nonzero exit; closure
			// state because the background-dispatch branch (RPC) returns
			// before `runHandoff` settles.
			let handoffFailed = false;
			const runHandoff = async (): Promise<void> => {
				let result: HandoffResult | undefined;
				try {
					result = await runtime.session.handoff(command.args || undefined);
				} catch (err) {
					const message = errorMessage(err);
					// A user interrupt (ACP `session/cancel`, TUI Esc) already settled the
					// owning turn: `AgentSession.abort()` forwards its reason into the
					// handoff abort controller, and `throwIfHandoffAborted` rethrows a
					// reasoned abort verbatim — so the throw arrives as
					// `USER_INTERRUPT_LABEL`, not "Handoff cancelled". Emitting anything
					// here would append an out-of-turn chunk after the client already saw
					// `stopReason: "cancelled"`, so consume silently.
					if (message === USER_INTERRUPT_LABEL) {
						return;
					}
					// `session.handoff()` normalizes an unreasoned cancellation to this
					// exact message; every other throw is a real failure (no model
					// selected, nothing to hand off, already compacted, provider error)
					// and is surfaced verbatim behind the same "<verb> failed:" prefix
					// `/compact` uses.
					if (message === "Handoff cancelled") {
						await runtime.output("已取消交接。");
						return;
					}
					// Persist the real failure so it stays debuggable after the client
					// message scrolls away (same rationale as the TUI path, #7993).
					logger.error("Handoff failed", { error: message });
					handoffFailed = true;
					await runtime.output(`交接失败：${message}`);
					return;
				}
				if (!result) {
					await runtime.output("已取消交接。");
					return;
				}
				// `savedPath` is deliberately not reported: `SessionHandoff` only writes
				// the document to disk when `options.autoTriggered` is set, which the
				// user-invoked path never passes.
				await runtime.output("上下文已交接并就地压缩。");
			};
			if (runtime.runCommandInBackground) {
				runtime.runCommandInBackground(runHandoff);
				return commandConsumed();
			}
			await runHandoff();
			return commandConsumed({ failed: handoffFailed });
		},
		handleTui: async (command, runtime) => {
			if (refuseImages(command, runtime)) return;
			const customInstructions = command.args || undefined;
			clearSubmittedText(runtime);
			await runtime.ctx.handleHandoffCommand(customInstructions);
		},
	},
	SEANCE_SLASH_COMMAND,
	{
		name: "resume",
		icon: "history",
		description: "恢复其他会话",
		inlineHint: "[session id|@claude|@codex]",
		allowArgs: true,
		handleTui: async (command, runtime) => {
			const sessionArg = command.args.trim();
			clearSubmittedText(runtime);
			const foreignSource = sessionArg === "@claude" ? "claude" : sessionArg === "@codex" ? "codex" : undefined;
			if (foreignSource) {
				runtime.ctx.showSessionSelector(foreignSource);
				return;
			}
			if (!sessionArg) {
				runtime.ctx.showSessionSelector();
				return;
			}
			const target = await resolveResumeTarget(
				sessionArg,
				runtime.ctx.sessionManager.getCwd(),
				runtime.ctx.sessionManager.getSessionDir(),
				{ allowGlobalFallback: true },
			);
			if (!target) {
				runtime.ctx.showError(`未找到会话“${sessionArg}”`);
				return;
			}
			try {
				await runtime.ctx.handleResumeSession(target.session.path, { continuation: target.continuation });
			} catch (error) {
				// The picker reports a failed switch itself; `/resume <id>` has no picker.
				runtime.ctx.showError(error instanceof Error ? error.message : String(error));
			}
		},
	},
	{
		name: "pin",
		icon: "pin",
		description: "在恢复列表顶部置顶或取消置顶会话",
		inlineHint: "[session id]",
		allowArgs: true,
		handle: async (command, runtime) => {
			const sessionArg = command.args.trim();
			let sessionId: string | undefined;
			if (sessionArg) {
				const match = await resolveResumableSession(
					sessionArg,
					runtime.cwd,
					runtime.sessionManager.getSessionDir(),
					{ allowGlobalFallback: true },
				);
				if (!match) {
					return usage(`未找到会话“${sessionArg}”。`, runtime);
				}
				sessionId = match.session.id;
			} else {
				sessionId = runtime.sessionManager.getSessionId();
				if (!sessionId) {
					return usage("没有可固定的活动会话。", runtime);
				}
			}
			const pinned = await toggleSessionPin(sessionId);
			await runtime.output(pinned ? "会话已固定到恢复列表顶部。" : "会话已取消固定。");
			return commandConsumed();
		},
	},
	{
		name: "btw",
		icon: "question",
		description: "提出附带问题，或浏览此会话的 BTW 历史记录",
		inlineHint: "[question]",
		allowArgs: true,
		handleTui: async (command, runtime) => {
			const question = command.text.slice(`/${command.name}`.length).trim();
			await runWithDetachedDraft(
				command,
				runtime,
				() => runtime.ctx.handleBtwCommand(question, runtime.input?.images),
				{ restoreText: true },
			);
		},
	},
	{
		name: "tan",
		icon: "rocket",
		description: "针对外围工作运行完整的后台代理",
		inlineHint: "<work>",
		allowArgs: true,
		handleTui: async (command, runtime) => {
			const work = command.text.slice(`/${command.name}`.length).trim();
			await runWithDetachedDraft(command, runtime, () => runtime.ctx.handleTanCommand(work, runtime.input?.images), {
				restoreText: true,
			});
		},
	},
	{
		name: "omfg",
		icon: "rule",
		description: "根据投诉创建一条 TTSR 规则，以阻止反复出现的行为",
		inlineHint: "<complaint>",
		allowArgs: true,
		handleTui: async (command, runtime) => {
			if (refuseImages(command, runtime)) return;
			const complaint = command.text.slice(`/${command.name}`.length).trim();
			clearSubmittedText(runtime);
			await runtime.ctx.handleOmfgCommand(complaint);
		},
	},
	{
		name: "cleanse",
		icon: "stethoscope",
		description: "用加权并行子代理检测并修复项目诊断问题",
		inlineHint: "[request] [--all]",
		allowArgs: true,
		handleTui: async (command, runtime) => {
			if (refuseImages(command, runtime)) return;
			const args = command.text.slice(`/${command.name}`.length).trim();
			clearSubmittedText(runtime);
			await runtime.ctx.handleCleanseCommand(args);
		},
	},
	{
		name: "retry",
		icon: "redo",
		description: "重试上一个失败的智能体回合",
		handle: async (_command, runtime) => {
			if (runtime.session.isStreaming) {
				return usage("请等待当前响应结束或中止后再重试。", runtime);
			}
			const didRetry = await runtime.session.retry();
			if (!didRetry) {
				return usage("无可重试的内容。", runtime);
			}
			await runtime.output("正在重试上一次失败的轮次。");
			// `AgentSession.retry()` only schedules the continuation as a
			// post-prompt task; it returns before the retried turn streams. Hosts
			// whose prompt turn owns the event subscription (ACP) must stay open
			// across that turn — `AcpAgent.prompt` installs the subscription
			// before running the command and `#finishPrompt` unsubscribes, so
			// returning early would silently swallow the entire retried turn
			// (model output and tool calls). RPC and TUI omit this hook: they
			// stream the continuation through their own session subscription, and
			// blocking their command queue here would strand a follow-up `abort`.
			await runtime.keepTurnOpenUntilIdle?.();
			// `retry()` returned true, so a real agent turn is now scheduled — RPC
			// hosts must not be told this was local-only work.
			return commandConsumed({ agentInvoked: true });
		},
		handleTui: async (_command, runtime) => {
			const didRetry = await runtime.ctx.session.retry();
			if (!didRetry) {
				runtime.ctx.showStatus("没有可重试的内容");
			}
			clearSubmittedText(runtime);
		},
	},
	{
		name: "debug",
		icon: "bug",
		description: "打开调试工具选择器",
		handleTui: async (_command, runtime) => {
			await runtime.ctx.showDebugSelector();
			clearSubmittedText(runtime);
		},
	},
	{
		name: "memory",
		icon: "memory",
		description: "检查并操作记忆维护",
		acpDescription: "Manage memory",
		acpInputHint: "<subcommand>",
		subcommands: [
			{ name: "view", description: "显示当前记忆注入载荷" },
			{ name: "stats", description: "显示记忆后端统计信息" },
			{ name: "diagnose", description: "运行记忆后端诊断" },
			{ name: "queue", description: "显示等待合并的待处理记忆增量" },
			{ name: "sync", description: "立即运行记忆整合" },
			{ name: "clear", description: "清除已持久化的记忆数据与产物" },
			{ name: "reset", description: "clear 的别名" },
			{ name: "enqueue", description: "将记忆整合维护任务入队" },
			{ name: "rebuild", description: "enqueue 的别名" },
			{ name: "mm list", description: "列出活动库中的心智模型" },
			{ name: "mm show", description: "显示一个心智模型（需提供 id）" },
			{
				name: "mm refresh",
				description: "刷新整个库的自动刷新模型，或按 id 刷新单个模型",
			},
			{ name: "mm history", description: "对比心智模型的变更历史" },
			{ name: "mm seed", description: "创建所有缺失的内置心智模型" },
			{ name: "mm delete", description: "从库中删除一个心智模型（需提供 id）" },
			{ name: "mm reload", description: "重新拉取缓存的 <mental_models> 块" },
		],
		allowArgs: true,
		handle: async (command, runtime) => {
			const verb = (command.args.trim().split(/\s+/)[0] ?? "").toLowerCase() || "view";
			const backend = await resolveMemoryBackend(runtime.settings);
			switch (verb) {
				case "view": {
					const payload = await backend.buildDeveloperInstructions(
						runtime.settings.getAgentDir(),
						runtime.cwd,
						runtime.settings,
						runtime.session,
					);
					await runtime.output(payload || "记忆负载为空。");
					return commandConsumed();
				}
				case "clear":
				case "reset": {
					await backend.clear(runtime.settings.getAgentDir(), runtime.cwd, runtime.session);
					await runtime.session.refreshBaseSystemPrompt();
					await runtime.output("记忆已清空。");
					return commandConsumed();
				}
				case "enqueue":
				case "rebuild": {
					await backend.enqueue(runtime.settings.getAgentDir(), runtime.cwd, runtime.session);
					await runtime.output("记忆整合已入队。");
					return commandConsumed();
				}
				case "queue": {
					const payload = await backend.queuePreview?.({
						agentDir: runtime.settings.getAgentDir(),
						cwd: runtime.cwd,
						session: runtime.session,
					});
					await runtime.output(payload ?? `记忆队列不可用于 ${backend.id} 后端。`);
					return commandConsumed();
				}
				case "sync": {
					await backend.enqueue(runtime.settings.getAgentDir(), runtime.cwd, runtime.session);
					await runtime.output("记忆整合已执行。");
					return commandConsumed();
				}
				case "stats":
				case "diagnose": {
					const hook = verb === "stats" ? backend.stats : backend.diagnose;
					const payload = await hook?.(runtime.settings.getAgentDir(), runtime.cwd, runtime.session);
					await runtime.output(payload ?? memoryStatsUnavailableMessage(backend.id, verb));
					return commandConsumed();
				}
				case "mm":
					return usage(
						"通过 /memory mm 进行心智模型维护在 ACP 模式下不受支持；请直接使用 hindsight HTTP API。",
						runtime,
					);
				default:
					return usage("用法：/memory <view|stats|diagnose|clear|reset|enqueue|rebuild|queue|sync>", runtime);
			}
		},
		handleTui: async (command, runtime) => {
			clearSubmittedText(runtime);
			await runtime.ctx.handleMemoryCommand(command.text);
		},
	},
	{
		name: "rename",
		icon: "pencil",
		description: "重命名当前会话（省略标题将自动生成）",
		inlineHint: "[title]",
		allowArgs: true,
		handle: async (command, runtime) => {
			const session = runtime.session;
			const sessionManager = runtime.sessionManager;
			const runRename = async (): Promise<void> => {
				const sessionId = sessionManager.getSessionId();
				const titleSignal = session.titleGenerationSignal;
				let titleRevision = sessionManager.titleRevision;
				const isCurrent = () =>
					runtime.session === session &&
					runtime.sessionManager === sessionManager &&
					!runtime.signal?.aborted &&
					// An interrupt cancels a generated title; a typed one applies regardless.
					!(titleSignal.aborted && !command.args) &&
					sessionManager.getSessionId() === sessionId &&
					sessionManager.titleRevision === titleRevision;
				try {
					const generation = session.renameTitle(command.args, runtime.signal);
					titleRevision = sessionManager.titleRevision;
					const title = await generation;
					if (!isCurrent() || title === undefined) return;
					if (!title) {
						await runtime.output("无法生成会话标题。使用 /rename <title> 设置一个。");
						return;
					}
					const persistence = sessionManager.setSessionName(title, "user");
					titleRevision = sessionManager.titleRevision;
					const ok = await persistence;
					if (!isCurrent()) return;
					if (!ok) {
						await runtime.output("会话名称未更改（用户设置的名称优先）。");
						return;
					}
					await runtime.notifyTitleChanged?.();
					if (!isCurrent()) return;
					await runtime.output(`会话已重命名为 ${title}。`);
				} catch (err) {
					if (!isCurrent()) return;
					if (command.args || !runtime.runCommandInBackground) throw err;
					await runtime.output(`重命名失败：${errorMessage(err)}`);
				}
			};
			if (!command.args && runtime.runCommandInBackground) {
				runtime.runCommandInBackground(runRename);
				return commandConsumed();
			}
			await runRename();
			return commandConsumed();
		},
		handleTui: async (command, runtime) => {
			clearSubmittedText(runtime);
			const session = runtime.ctx.session;
			const sessionManager = runtime.ctx.sessionManager;
			const sessionId = sessionManager.getSessionId();
			// `renameTitle` resolves undefined for a generated title an interrupt cancelled.
			const generation = session.renameTitle(command.args.trim());
			const titleRevision = sessionManager.titleRevision;
			const title = await generation;
			if (
				runtime.ctx.session !== session ||
				runtime.ctx.sessionManager !== sessionManager ||
				sessionManager.getSessionId() !== sessionId ||
				sessionManager.titleRevision !== titleRevision ||
				title === undefined
			)
				return;
			if (!title) {
				runtime.ctx.showStatus("无法生成会话标题。请使用 /rename <title> 设置标题。");
				return;
			}
			await runtime.ctx.handleRenameCommand(title);
		},
	},
	{
		name: "move",
		icon: "folderMove",
		description: "将当前会话移动到其他目录",
		acpDescription: "Move the current session to a different directory",
		inlineHint: "[<path>]",
		allowArgs: true,
		handle: async (command, runtime) => {
			if (runtime.session.isStreaming) return usage("流式传输时无法移动。", runtime);
			if (!command.args) return usage("用法：/move <path>", runtime);
			const resolvedPath = resolveToCwd(command.args, runtime.cwd);
			try {
				const stat = await fs.stat(resolvedPath);
				if (!stat.isDirectory()) {
					return usage(`不是目录：${resolvedPath}`, runtime);
				}
			} catch {
				return usage(`目录不存在：${resolvedPath}`, runtime);
			}
			const failure = await relocateHeadlessSession(runtime, resolvedPath);
			if (failure) return failure;
			await runtime.output(`已移动到 ${runtime.sessionManager.getCwd()}。`);
			return commandConsumed();
		},
		handleTui: async (command, runtime) => {
			runtime.ctx.editor.addToHistory(command.text);
			clearSubmittedText(runtime);
			await runtime.ctx.handleMoveCommand(command.args || undefined);
		},
	},
	{
		name: "wt",
		aliases: ["worktree"],
		icon: "folderMove",
		description: "将此会话移动到新工作树，包含更改",
		acpDescription: "Move this session into a new worktree, changes included",
		inlineHint: "[<branch>]",
		allowArgs: true,
		handle: async (command, runtime) => {
			if (runtime.session.isStreaming) return usage("流式传输时无法创建工作树。", runtime);
			const branch = command.args.trim() || defaultSessionWorktreeBranch();
			const sourceCwd = runtime.sessionManager.getCwd();
			let worktree: SessionWorktree;
			try {
				worktree = await createSessionWorktree(sourceCwd, runtime.settings, branch);
			} catch (err) {
				return usage(`工作树创建失败：${errorMessage(err)}`, runtime);
			}
			const failure = await relocateHeadlessSession(runtime, worktree.path);
			if (failure) return failure;
			const cleanup = await cleanSourceCheckoutIfConfigured(sourceCwd, runtime.settings);
			if (cleanup.errorMessage !== undefined) {
				await runtime.output(
					`警告：工作树已创建，但清理源检出失败：${cleanup.errorMessage}`,
				);
			}
			await runtime.output(formatSessionWorktreeSummary(worktree, cleanup.cleaned));
			return commandConsumed();
		},
		handleTui: async (command, runtime) => {
			runtime.ctx.editor.addToHistory(command.text);
			clearSubmittedText(runtime);
			await runtime.ctx.handleWorktreeCommand(command.args || undefined);
		},
	},
	{
		name: "add-dir",
		icon: "folderPlus",
		description: "向此会话添加工作区目录（多根）",
		acpDescription: "Add a workspace directory to this session",
		inlineHint: "<path>",
		allowArgs: true,
		handle: async (command, runtime) => {
			if (runtime.session.isStreaming) return usage("正在流式传输时无法添加目录。", runtime);
			if (!command.args) return usage(formatWorkspaceDirectories(runtime, "Usage: /add-dir <path>"), runtime);
			const resolved = resolveToCwd(command.args, runtime.cwd);
			try {
				const stat = await fs.stat(resolved);
				if (!stat.isDirectory()) return usage(`不是目录：${resolved}`, runtime);
			} catch {
				return usage(`目录不存在：${resolved}`, runtime);
			}
			let added: string | null;
			try {
				added = await runtime.sessionManager.addWorkspaceDirectory(resolved);
			} catch (err) {
				return usage(errorMessage(err), runtime);
			}
			if (added === null) {
				await runtime.output(`已在工作区中：${resolved}`);
				return commandConsumed();
			}
			await runtime.session.refreshBaseSystemPrompt();
			await runtime.output(formatWorkspaceDirectories(runtime, `Added ${added}.`));
			return commandConsumed();
		},
	},
	{
		name: "remove-dir",
		icon: "folderMinus",
		description: "从此会话移除工作区目录",
		acpDescription: "Remove a workspace directory from this session",
		inlineHint: "<path>",
		allowArgs: true,
		handle: async (command, runtime) => {
			if (runtime.session.isStreaming) return usage("正在流式传输时无法删除目录。", runtime);
			if (!command.args) return usage("用法：/remove-dir <path>", runtime);
			const resolved = resolveToCwd(command.args, runtime.cwd);
			if (resolved === path.resolve(runtime.cwd)) {
				return usage("无法删除工作目录；请使用 /move 更改。", runtime);
			}
			let removed: string | null;
			try {
				removed = await runtime.sessionManager.removeWorkspaceDirectory(resolved);
			} catch (err) {
				return usage(errorMessage(err), runtime);
			}
			if (removed === null) {
				await runtime.output(`不是工作区目录：${resolved}`);
				return commandConsumed();
			}
			await runtime.session.refreshBaseSystemPrompt();
			await runtime.output(formatWorkspaceDirectories(runtime, `Removed ${removed}.`));
			return commandConsumed();
		},
	},
	{
		name: "dirs",
		description: "列出此会话的工作区目录",
		acpDescription: "List this session's workspace directories",
		handle: async (_command, runtime) => {
			await runtime.output(formatWorkspaceDirectories(runtime));
			return commandConsumed();
		},
	},
	{
		name: "exit",
		description: "退出应用程序",
		handleTui: shutdownHandlerTui,
	},
	{
		name: "restart",
		icon: "restart",
		description: "使用相同的启动标志重启 omp，并恢复此会话",
		handleTui: async (_command, runtime) => {
			clearSubmittedText(runtime);
			await runtime.ctx.restart();
		},
	},
];
async function rescopeHeadlessToCwd(runtime: SlashCommandRuntime, cwd: string): Promise<void> {
	setProjectDir(cwd);
	await runtime.settings.reloadForCwd(cwd);
	await rebindMemoryBackendForCwd(runtime.session);
	clearClaudePluginRootsCache();
	const src = discoverTitleSystemPromptFile(cwd);
	const p = await resolvePromptInput(src, "title system prompt");
	runtime.session.setTitleSystemPrompt(p);
	await runtime.session.refreshSkillsAndCommands();
	await runtime.refreshCommands?.();
	await runtime.reloadPlugins();
}
