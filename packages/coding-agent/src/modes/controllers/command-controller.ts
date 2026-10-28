import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { CompactionCancelledError, type CompactionOutcome } from "@oh-my-pi/pi-agent-core/compaction";
import {
	getEnvApiKey,
	getProviderDetails,
	type ProviderDetails,
	resolveUsedFraction,
	type UsageLimit,
	type UsageReport,
} from "@oh-my-pi/pi-ai";
import {
	type Component,
	Loader,
	Markdown,
	padding,
	parseSgrMouse,
	Spacer,
	Text,
	visibleWidth,
	wrapTextWithAnsi,
} from "@oh-my-pi/pi-tui";
import { formatDuration, logger, Snowflake, sanitizeText } from "@oh-my-pi/pi-utils";
import { getActiveProfile, getConfigDirName } from "@oh-my-pi/pi-utils/dirs";
import { classifyTerminalMultiplexer } from "@oh-my-pi/pi-tui/terminal-multiplexer";
import { shouldEnableAppendOnlyContext } from "../../config/append-only-context-mode";
import { type BashResult, isPersistentShellCdCommand } from "../../exec/bash-executor";
import { type LoadedCustomShare, loadCustomShare } from "../../export/custom-share";
import { parseExportArgs } from "../../export/html/args";
import { shareSession } from "../../export/share";
import type { CompactOptions } from "../../extensibility/extensions/types";
import {
	diffMentalModelContent,
	type HindsightApi,
	type HindsightSessionState,
	loadHindsightConfig,
	reloadMentalModelsForSession,
	resolveSeedsForScope,
	seedAlreadyExists,
	summarizeMentalModel,
} from "../../hindsight";
import { memoryStatsUnavailableMessage, resolveMemoryBackend } from "../../memory-backend";
import { BashExecutionComponent, bashPtyViewport } from "@oh-my-pi/pi-tui/chat/bash-execution";
import { appKey } from "@oh-my-pi/pi-tui/chrome/keybinding-hints";
import { BorderedLoader } from "@oh-my-pi/pi-tui/overlays/bordered-loader";
import { EvalExecutionComponent } from "@oh-my-pi/pi-tui/chat/eval-execution";
import { MoveOverlay, type MoveOverlayResult } from "@oh-my-pi/pi-tui/overlays/move-overlay";
import { moveDirectorySource } from "../move-directory-source";
import { getMarkdownTheme, getSymbolTheme, theme, type Theme } from "@oh-my-pi/pi-tui/theme";
import type { InteractiveModeContext } from "../../modes/types";
import { ContextViewer } from "@oh-my-pi/pi-tui/overlays/context-viewer";
import type { OverlayHandle } from "@oh-my-pi/pi-tui";
import { ReportPanel } from "@oh-my-pi/pi-tui/overlays/report-panel";
import type { TspText } from "@oh-my-pi/pi-wire";
import { computeSessionContextBreakdown } from "../../session/context-usage-runtime";
import { buildSessionContextView } from "../../session/context-view";
import { buildHotkeysMarkdown, HotkeysSheetComponent } from "@oh-my-pi/pi-tui/hotkeys-markdown";
import { isNativeRendering } from "@oh-my-pi/pi-tui/native/state";
import { buildToolsMarkdown } from "@oh-my-pi/pi-tui/prompt/tools-markdown";
import type { AsyncJobSnapshotItem } from "../../session/agent-session";
import { buildJobTree, jobTreeGuide, jobTreeIndent } from "@oh-my-pi/pi-tui/overlays/job-tree";
import type { AuthStorage, OAuthAccountIdentity } from "../../session/auth-storage";
import type { CompactMode } from "../../session/compact-modes";
import {
	currentRuntimeIdentity,
	formatRuntimeIdentity,
	runtimeIdentityHistory,
	sameRuntimeIdentity,
} from "../../session/runtime-identity";
import type { NewSessionOptions } from "../../session/session-entries";
import {
	cleanSourceCheckoutIfConfigured,
	createSessionWorktree,
	defaultSessionWorktreeBranch,
	formatSessionWorktreeSummary,
	type SessionWorktree,
} from "../../session/session-worktree";
import { formatShakeSummary, type ShakeMode, type ShakeResult } from "../../session/shake-types";
import {
	codexUsagePlan,
	formatActiveAccountLabel,
	formatCodexUsageReportLabel,
	limitMatchesActiveAccount,
} from "../../slash-commands/helpers/active-oauth-account";
import { formatProviderName } from "@oh-my-pi/pi-tui/chrome/format";
import { formatCompactQuota } from "@oh-my-pi/pi-tui/overlays/advisor-config";
import { resolveTernPane } from "../../tools/browser/tern/kind";
import { TernError, type TernErrorKind, TernSocketClient } from "../../tools/browser/tern/wire";
import { outputMeta } from "../../tools/output-meta";
import { resolveToCwd, stripOuterDoubleQuotes } from "../../tools/path-utils";
import { replaceTabs, truncateToWidth } from "@oh-my-pi/pi-tui/render/render-utils";
import {
	getChangelogPath,
	parseChangelog,
	parseChangelogView,
	renderChangelogEntries,
	selectChangelogEntries,
} from "../../utils/changelog";
import { copyToClipboard } from "../../utils/clipboard";
import { formatDumpArchiveReport, type SessionDumpArchive } from "../../session/session-dump-format";
import { openPath } from "../../utils/open";
import { resumeCommand } from "../../utils/resume-command";
import { setSessionTerminalTitle } from "../../utils/title-generator";
import {
	collapseSharedUsageReports,
	formatLimitTitle,
	summarizeUsageResetCredits,
} from "@oh-my-pi/pi-tui/overlays/usage-display";
import { formatRemainingOnlyTotal, isUsedOnlyAbsoluteAmount } from "@oh-my-pi/pi-tui/prompt/usage-amounts";
import type { UnavailableUsageAccount } from "@oh-my-pi/pi-tui/overlays/usage-dashboard";

import { cfgTerminalShowImages } from "../settings";
import { cfgProviderAppendOnlyContext } from "../../session/settings";
import { cfgShareRedactSecrets, cfgShareServerUrl, cfgShareStore } from "../../commands/settings";
import { flagConsumesValue, restartArgv } from "../../cli/flag-tables";
import {
	createDefaultTerminalLaunchRequest,
	getTerminalLaunchPlacement,
	launchTerminal,
	TerminalLaunchError,
	type TerminalLaunchRequest,
	type TerminalLaunchResult,
} from "../../subprocess/terminal-launch";
import { resolveCliEntryCmd } from "../../subprocess/worker-client";

/** How long `/fork` waits for Tern to open the fork's pane. */
const TERN_FORK_TIMEOUT_MS = 10_000;

/** Fork failures after which Tern may still open the pane, so `/fork` must not also fork in place. */
const TERN_FORK_UNCONFIRMED: Partial<Record<TernErrorKind, true>> = { closed: true, timeout: true, protocol: true };

/** Rows `/session` spends on the builds that wrote the session, including the elision row. */
const MAX_LISTED_BUILDS = 5;

function formatCreditValue(value: number): string {
	return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

interface ForkTerminalDependencies {
	classifyTerminalMultiplexer: typeof classifyTerminalMultiplexer;
	environment: () => NodeJS.ProcessEnv;
	launchTerminal: (request: TerminalLaunchRequest) => Promise<TerminalLaunchResult>;
	resolveCliEntryCmd: typeof resolveCliEntryCmd;
	getActiveProfile: typeof getActiveProfile;
	argv: () => string[];
}

/**
 * Startup flags the fork child re-supplies from the parent's live state
 * (`--profile`, `--model`, `--thinking`, `--prompt-cache-key`) or that would
 * re-point it at a stale scope (`--config`/`--cwd`/`--provider`; the child
 * gets the effective overlays via `PI_CONFIG_FILES` and the session cwd).
 */
const FORK_LAUNCH_OVERRIDES: Readonly<Record<string, true>> = {
	"--config": true,
	"--cwd": true,
	"--model": true,
	"--profile": true,
	"--prompt-cache-key": true,
	"--provider": true,
	"--thinking": true,
};

/**
 * `env` prefix pinning each scope variable for the fork child. Multiplexer
 * servers keep stale environment snapshots, so every variable is pinned:
 * defined values are assigned, absent (or empty) ones are unset with `-u`
 * (which must precede the assignments) rather than exported as empty strings
 * that `??`-style consumers would treat as a set, relative path.
 */
function forkScopeEnvCommand(scope: Readonly<Record<string, string | undefined>>): string[] {
	const unset: string[] = [];
	const assignments: string[] = [];
	for (const [name, value] of Object.entries(scope)) {
		if (value) assignments.push(`${name}=${value}`);
		else unset.push("-u", name);
	}
	return ["env", ...unset, ...assignments];
}

function hasForkApiKeyOverride(argv: string[]): boolean {
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]!;
		if (arg === "--api-key" || arg.startsWith("--api-key=")) return true;
		if (flagConsumesValue(arg, argv[i + 1])) i++;
	}
	return false;
}

export class CommandController {
	/** The open native report sheet and the component it shows. */
	#reportSheet: { handle: OverlayHandle; component: Component } | undefined;
	#forkTerminalDependencies: ForkTerminalDependencies;

	constructor(
		private readonly ctx: InteractiveModeContext,
		forkTerminalDependencies: Partial<ForkTerminalDependencies> = {},
	) {
		this.#forkTerminalDependencies = {
			classifyTerminalMultiplexer,
			environment: () => process.env,
			launchTerminal,
			resolveCliEntryCmd,
			getActiveProfile,
			argv: () => process.argv.slice(2),
			...forkTerminalDependencies,
		};
	}

	/** Esc: take away the report shown above the editor (text mode); false when none is shown. */
	dismissCommandReport(): boolean {
		return this.#clearReport();
	}

	/**
	 * Drop any report — the one above the editor, or a focused sheet/page —
	 * because the transcript or session under it was reset, and its contents
	 * describe what is gone.
	 */
	clearCommandReport(): void {
		this.#clearReport();
		this.#closeReportSheet();
	}

	#clearReport(): boolean {
		const docked = this.ctx.reportContainer;
		if (docked.children.length === 0) return false;
		docked.dispose();
		docked.clear();
		this.ctx.ui.requestRender();
		return true;
	}

	#closeReportSheet(): void {
		const sheet = this.#reportSheet;
		if (!sheet) return;
		this.#reportSheet = undefined;
		sheet.handle.hide();
		// Like the docked report, a closed sheet is never shown again.
		sheet.component.dispose?.();
		this.ctx.ui.setFocus(this.ctx.editorContainer.children[0] ?? this.ctx.editor);
		this.ctx.ui.requestRender();
	}

	/** Open `component` as a focused full-screen page; callers close any previous sheet first. */
	#showFullscreenSheet(component: Component): void {
		const handle = this.ctx.ui.showOverlay(component, {
			anchor: "bottom-center",
			width: "100%",
			maxHeight: "100%",
			margin: 0,
			fullscreen: true,
		});
		this.#reportSheet = { handle, component };
		this.ctx.ui.setFocus(component);
	}

	/**
	 * Show a read-only report, replacing the previous one. In text mode one that
	 * fits the rows above the editor shows there like `/btw`: the editor keeps
	 * focus and its Esc takes the report away. A taller one opens as a
	 * full-screen page on the terminal's alternate screen, scrolled with the
	 * arrow/page keys and the wheel, so the main screen is never touched and
	 * Esc returns to it as it was. Natively it is a focused sheet like
	 * `/usage`, its body scrolled by the terminal once it is long, closed by
	 * Esc or Close.
	 */
	showCommandReport(options: { title: string; head?: TspText; body: Component }): void {
		this.#clearReport();
		this.#closeReportSheet();
		const terminal = this.ctx.ui.terminal;
		const inline = this.ctx.commandReportRows() ?? terminal.rows;
		let fullScreen = false;
		const report = new ReportPanel({
			...options,
			closeKey: appKey(this.ctx.keybindings, "app.interrupt"),
			onClose: () => this.#closeReportSheet(),
			maxRows: () => (fullScreen ? terminal.rows : this.ctx.commandReportRows()),
		});
		if (isNativeRendering()) {
			report.holdFocus();
			this.#reportSheet = {
				handle: this.ctx.ui.showOverlay(report, { anchor: "center", width: "90%", maxHeight: "90%" }),
				component: report,
			};
			this.ctx.ui.setFocus(report);
		} else if (report.heightAt(terminal.columns) > inline) {
			fullScreen = true;
			report.holdFocus();
			this.#showFullscreenSheet(report);
		} else {
			this.ctx.reportContainer.addChild(report);
		}
		this.ctx.ui.requestRender();
	}

	/** A titled markdown report; see {@link showCommandReport}. */
	#showMarkdownPanel(title: string, markdown: string): void {
		this.showCommandReport({ title, body: new Markdown(markdown.trim(), 0, 0, getMarkdownTheme()) });
	}

	async #restoreAfterMoveFailure(
		previousState: Parameters<InteractiveModeContext["sessionManager"]["rollbackMove"]>[0],
		initialError?: unknown,
	): Promise<void> {
		if (initialError !== undefined) {
			this.ctx.showError(
				`切换工作区失败：${initialError instanceof Error ? initialError.message : String(initialError)}`,
			);
		}

		try {
			await this.ctx.sessionManager.rollbackMove(previousState);
		} catch (rollbackError) {
			const actual = this.ctx.sessionManager.getCwd();
			let realigned = false;
			try {
				realigned = await this.ctx.applyCwdChange(actual);
			} catch {}
			if (!realigned) {
				this.ctx.showError(
					`回退移动失败：${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}（未能将工作区重新对齐到 ${actual}）`,
				);
				await this.ctx.shutdown();
				return;
			}
			this.ctx.showError(
				`回退移动失败：${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}（工作区仍位于 ${actual}）`,
			);
			return;
		}

		let sourceRestored = false;
		try {
			sourceRestored = await this.ctx.applyCwdChange(previousState.cwd);
		} catch {}
		if (sourceRestored) return;

		const actual = this.ctx.sessionManager.getCwd();
		let realigned = false;
		try {
			realigned = await this.ctx.applyCwdChange(actual);
		} catch {}
		if (!realigned) {
			this.ctx.showError(`回退后恢复源工作区失败：工作区仍位于 ${actual}`);
			await this.ctx.shutdown();
			return;
		}
		this.ctx.showError(`回退后恢复源工作区失败：工作区仍位于 ${actual}`);
	}

	openInBrowser(urlOrPath: string): void {
		openPath(urlOrPath);
	}

	async handleExportCommand(text: string): Promise<void> {
		try {
			const { outputPath, useUserThemes } = parseExportArgs(text.slice("/export".length));
			if (outputPath === "--copy" || outputPath === "clipboard" || outputPath === "copy") {
				this.ctx.showWarning("使用 /dump 将会话复制到剪贴板。");
				return;
			}

			// The viewed session: the focused subagent's transcript (plus its own
			// subagents) from a focused view, otherwise the main session.
			const filePath = await this.ctx.viewSession.exportToHtml(outputPath, useUserThemes);
			this.ctx.showStatus(`会话已导出到：${filePath}`);
			this.openInBrowser(filePath);
		} catch (error: unknown) {
			this.ctx.showError(`导出会话失败：${error instanceof Error ? error.message : "未知错误"}`);
		}
	}
	async handleTraceCommand(): Promise<void> {
		const sessionFile = this.ctx.session.sessionFile;
		if (!sessionFile) {
			this.ctx.showWarning("尚无会话文件——请先发送消息。");
			return;
		}
		try {
			// Lazy: the stats dashboard (server + sqlite) loads on demand only,
			// matching src/cli/stats-cli.ts, to keep CLI startup fast.
			const { formatStatsDashboardUrl, startServer } = await import("@oh-my-pi/omp-stats");
			const { hostname, port } = await startServer();
			const url = `${formatStatsDashboardUrl(hostname, port)}/#/traces?s=${encodeURIComponent(sessionFile)}`;
			this.openInBrowser(url);
			this.ctx.showStatus(`跟踪：${url}`);
		} catch (error: unknown) {
			this.ctx.showError(`打开跟踪失败：${error instanceof Error ? error.message : "未知错误"}`);
		}
	}

	async handleDumpCommand(): Promise<void> {
		try {
			const formatted = this.ctx.session.formatSessionAsText();
			if (!formatted) {
				this.ctx.showError("尚无要转储的消息。");
				return;
			}
			// Build the LLM request JSON sidecar first so its path (and a
			// raw-context warning) can be appended to the copied transcript.
			let sidecarPath: string | undefined;
			let sidecarError: string | undefined;
			try {
				sidecarPath = await this.ctx.session.dumpLlmRequestToTmpDir();
			} catch (error: unknown) {
				sidecarError = error instanceof Error ? error.message : "Unknown error";
			}
			const doc = sidecarPath
				? `${formatted}\n\n---\nLLM request JSON: ${sidecarPath}\nThis file persists on disk and may contain raw context/secrets — treat accordingly.`
				: formatted;
			await copyToClipboard(doc);
			const statusParts = ["Session copied to clipboard"];
			if (sidecarPath) statusParts.push(`LLM request JSON: ${sidecarPath}`);
			if (sidecarError) statusParts.push(`LLM request JSON unavailable: ${sidecarError}`);
			this.ctx.showStatus(statusParts.join("\n"));
		} catch (error: unknown) {
			this.ctx.showError(`复制会话失败：${error instanceof Error ? error.message : "未知错误"}`);
		}
	}

	handleDumpAllCommand(): Promise<void> {
		return this.#writeDumpArchive(() => this.ctx.session.dumpSessionArchiveToTmpDir());
	}

	handleDumpAnonCommand(): Promise<void> {
		return this.#writeDumpArchive(() => this.ctx.session.dumpAnonymizedArchiveToTmpDir());
	}

	async #writeDumpArchive(write: () => Promise<SessionDumpArchive | undefined>): Promise<void> {
		try {
			const archive = await write();
			if (!archive) {
				this.ctx.showError("尚无要转储的消息。");
				return;
			}
			await copyToClipboard(archive.path);
			this.ctx.showStatus([...formatDumpArchiveReport(archive), "归档路径已复制到剪贴板"].join("\n"));
		} catch (error: unknown) {
			this.ctx.showError(
				`写入会话转储失败：${error instanceof Error ? error.message : "未知错误"}`,
			);
		}
	}

	handleAdvisorDumpCommand(isRaw = false) {
		try {
			const advisorHistory = this.ctx.session.formatAdvisorHistoryAsText({ compact: !isRaw });
			if (advisorHistory === null) {
				this.ctx.showError("顾问未在此会话中激活。");
				return;
			}
			if (!advisorHistory) {
				this.ctx.showError("顾问尚无历史记录。");
				return;
			}
			copyToClipboard(advisorHistory);
			this.ctx.showStatus("顾问历史记录已复制到剪贴板");
		} catch (error: unknown) {
			this.ctx.showError(
				`复制顾问历史记录失败：${error instanceof Error ? error.message : "未知错误"}`,
			);
		}
	}

	async handleDebugTranscriptCommand(): Promise<void> {
		try {
			const width = Math.max(1, this.ctx.ui.terminal.columns);
			const renderedLines = this.ctx.chatContainer.render(width).map(line => replaceTabs(Bun.stripANSI(line)));
			const rendered = renderedLines.join("\n").trimEnd();
			if (!rendered) {
				this.ctx.showError("尚无要转储的消息。");
				return;
			}
			const tmpPath = path.join(os.tmpdir(), `${Snowflake.next()}-tmp.txt`);
			await Bun.write(tmpPath, `${rendered}\n`);
			this.ctx.showStatus(`调试记录已写入：
${tmpPath}`);
		} catch (error: unknown) {
			this.ctx.showError(
				`写入调试记录失败：${error instanceof Error ? error.message : "未知错误"}`,
			);
		}
	}

	async handleShareCommand(): Promise<void> {
		let customShare: LoadedCustomShare | null;
		try {
			customShare = await loadCustomShare();
		} catch (err) {
			this.ctx.showError(err instanceof Error ? err.message : String(err));
			return;
		}

		const loader = new BorderedLoader(this.ctx.ui, theme, "Sharing session...");
		this.ctx.editorContainer.clear();
		this.ctx.editorContainer.addChild(loader);
		this.ctx.ui.setFocus(loader);
		this.ctx.ui.requestRender();

		const restoreEditor = () => {
			loader.dispose();
			this.ctx.editorContainer.clear();
			this.ctx.editorContainer.addChild(this.ctx.editor);
			this.ctx.ui.setFocus(this.ctx.editor);
		};
		loader.onAbort = () => {
			restoreEditor();
			this.ctx.showStatus("共享已取消");
		};

		// Custom share scripts keep their legacy contract: they receive a path
		// to a standalone HTML export. No fallback to the default flow on error.
		if (customShare) {
			const tmpFile = path.join(os.tmpdir(), `${Snowflake.next()}.html`);
			try {
				await this.ctx.session.exportToHtml(tmpFile);
				const result = await customShare.fn(tmpFile);
				if (loader.signal.aborted) return;
				restoreEditor();

				if (typeof result === "string") {
					this.ctx.showStatus(`共享URL: ${result}`);
					this.openInBrowser(result);
				} else if (result) {
					const parts: string[] = [];
					if (result.url) parts.push(`Share URL: ${result.url}`);
					if (result.message) parts.push(result.message);
					if (parts.length > 0) this.ctx.showStatus(parts.join("\n"));
					if (result.url) this.openInBrowser(result.url);
				} else {
					this.ctx.showStatus("会话已共享");
				}
			} catch (err) {
				if (!loader.signal.aborted) {
					restoreEditor();
					this.ctx.showError(`自定义分享失败：${err instanceof Error ? err.message : String(err)}`);
				}
			} finally {
				await fs.rm(tmpFile, { force: true }).catch(() => {});
			}
			return;
		}

		// Default: encrypted snapshot to a secret gist (preferred) or the share
		// server; the key rides in the link fragment and never leaves the client.
		try {
			const result = await shareSession(this.ctx.session.sessionManager, {
				serverUrl: cfgShareServerUrl.get(this.ctx.settings),
				store: cfgShareStore.get(this.ctx.settings),
				state: this.ctx.session.state,
				obfuscator: cfgShareRedactSecrets.get(this.ctx.settings) ? this.ctx.session.obfuscator : undefined,
			});
			if (loader.signal.aborted) return;
			restoreEditor();

			const lines = [`共享URL: ${result.url}`];
			if (result.gistUrl) lines.push(`Gist 地址：${result.gistUrl}`);
			if (result.truncated) lines.push("注意：为符合分享大小限制，大量内容已被截断。");
			this.ctx.showStatus(lines.join("\n"));
			this.openInBrowser(result.url);
		} catch (error: unknown) {
			if (!loader.signal.aborted) {
				restoreEditor();
				this.ctx.showError(`分享会话失败：${error instanceof Error ? error.message : "未知错误"}`);
			}
		}
	}

	async handleSessionCommand(): Promise<void> {
		const stats = this.ctx.session.getSessionStats();
		const premiumRequests =
			"premiumRequests" in stats && typeof stats.premiumRequests === "number"
				? stats.premiumRequests
				: this.ctx.session.sessionManager.getUsageStatistics().premiumRequests;
		const normalizedPremiumRequests = Math.round((premiumRequests + Number.EPSILON) * 100) / 100;

		let info = "";
		info += `${theme.fg("dim", "文件：")} ${stats.sessionFile ?? "In-memory"}\n`;
		info += `${theme.fg("dim", "标识：")} ${stats.sessionId}\n`;
		const builds = runtimeIdentityHistory(this.ctx.session.sessionManager.getEntries());
		const running = currentRuntimeIdentity();
		// A source checkout's diff hash changes with each edit, so a long-lived session can collect
		// many builds: keep the first and the latest few. Every row is keyed so the overlay never
		// mistakes a colourless continuation row for a section heading.
		const hidden = builds.length > MAX_LISTED_BUILDS ? builds.length - MAX_LISTED_BUILDS + 1 : 0;
		for (const [index, build] of builds.entries()) {
			if (hidden > 0 && index > 0 && index <= hidden) {
				if (index === 1) info += `${theme.fg("dim", `构建 2–${hidden + 1}：`)} ${hidden} more\n`;
				continue;
			}
			const key = builds.length === 1 ? "Build:" : `Build ${index + 1}:`;
			info += `${theme.fg("dim", key)} ${replaceTabs(sanitizeText(formatRuntimeIdentity(build)))}\n`;
		}
		if (!sameRuntimeIdentity(builds[builds.length - 1], running)) {
			info += `${theme.fg("dim", "正在运行：")} ${replaceTabs(sanitizeText(formatRuntimeIdentity(running)))}\n`;
		}
		info += `\n${theme.bold("提供商")}\n`;
		const model = this.ctx.session.model;
		if (!model) {
			info += `${theme.fg("dim", "未选择模型")}\n`;
		} else {
			const authMode = resolveProviderAuthMode(this.ctx.session.modelRegistry.authStorage, model.provider);
			const credentialSource = this.ctx.session.modelRegistry.authStorage.keys.describe(
				model.provider,
				stats.sessionId,
			);
			const providerDetails = getProviderDetails({
				model,
				sessionId: stats.sessionId,
				authMode,
				credentialSource,
				preferWebsockets: this.ctx.session.preferWebsockets,
				providerSessionState: this.ctx.session.providerSessionState,
			});
			info += renderProviderSection(providerDetails, theme);
			if (stats.routedModels !== undefined) {
				const routed = Object.entries(stats.routedModels)
					.sort(([aId, aCount], [bId, bCount]) => bCount - aCount || aId.localeCompare(bId))
					.map(
						([id, count]) => `${replaceTabs(sanitizeText(id))}${count > 1 ? theme.fg("dim", ` ×${count}`) : ""}`,
					);
				info += `${theme.fg("dim", "已提供：")} ${routed.join(", ")}\n`;
			}
		}
		info += `\n`;
		info += `${theme.bold("消息")}\n`;
		info += `${theme.fg("dim", "用户：")} ${stats.userMessages}\n`;
		info += `${theme.fg("dim", "助手：")} ${stats.assistantMessages}\n`;
		info += `${theme.fg("dim", "工具调用：")} ${stats.toolCalls}\n`;
		info += `${theme.fg("dim", "工具结果：")} ${stats.toolResults}\n`;
		if (stats.editRejections !== undefined) {
			const kinds = Object.entries(stats.editRejections).sort(
				([aKind, aCount], [bKind, bCount]) => bCount - aCount || aKind.localeCompare(bKind),
			);
			const total = kinds.reduce((sum, [, count]) => sum + count, 0);
			const breakdown = kinds
				.map(([kind, count]) => `${replaceTabs(sanitizeText(kind.replaceAll("_", " ")))} ${count}`)
				.join(", ");
			info += `${theme.fg("dim", "编辑拒绝：")} ${total} ${theme.fg("dim", `(${breakdown})`)}\n`;
		}
		info += `${theme.fg("dim", "总计：")} ${stats.totalMessages}\n\n`;
		// Append-only context
		{
			const setting = cfgProviderAppendOnlyContext.get(this.ctx.settings);
			const model = this.ctx.session.model;
			const mode = shouldEnableAppendOnlyContext(setting, model);
			const activeLabel = mode ? theme.fg("success", "活动") : theme.fg("dim", "未激活");
			const settingLabel = setting === "auto" ? `${setting} (${model?.provider ?? "?"})` : setting;
			info += `${theme.fg("dim", "仅追加：")} ${activeLabel} (setting: ${settingLabel})\n`;
		}
		info += `${theme.bold("令牌")}\n`;
		info += `${theme.fg("dim", "输入：")} ${stats.tokens.input.toLocaleString()}\n`;
		info += `${theme.fg("dim", "输出：")} ${stats.tokens.output.toLocaleString()}\n`;
		if (stats.tokens.cacheRead > 0) {
			info += `${theme.fg("dim", "缓存读取：")} ${stats.tokens.cacheRead.toLocaleString()}\n`;
		}
		if (stats.tokens.cacheWrite > 0) {
			info += `${theme.fg("dim", "缓存写入：")} ${stats.tokens.cacheWrite.toLocaleString()}\n`;
		}
		info += `${theme.fg("dim", "总计：")} ${stats.tokens.total.toLocaleString()}\n`;

		if (stats.cost > 0 || normalizedPremiumRequests > 0 || stats.credits !== undefined) {
			info += `\n${theme.bold("成本")}\n`;
			if (stats.cost > 0) {
				info += `${theme.fg("dim", "总计：")} ${stats.cost.toFixed(4)}\n`;
			}
			if (normalizedPremiumRequests > 0) {
				info += `${theme.fg("dim", "高级请求：")} ${normalizedPremiumRequests.toLocaleString()}\n`;
			}
			if (stats.credits !== undefined) {
				info += `${theme.fg("dim", "积分：")} ${formatCreditValue(stats.credits.cost)}\n`;
				info += `${theme.fg("dim", "已承诺积分：")} ${formatCreditValue(stats.credits.committedCost)}\n`;
				info += `${theme.fg("dim", "已承诺ACU：")} ${formatCreditValue(stats.credits.acuCost)}\n`;
			}
		}

		if (this.ctx.lspServers && this.ctx.lspServers.length > 0) {
			info += `\n${theme.bold("LSP 服务器")}\n`;
			for (const server of this.ctx.lspServers) {
				const statusColor =
					server.status === "ready"
						? "success"
						: server.status === "available"
							? "dim"
							: server.status === "connecting"
								? "warning"
								: "error";
				const statusText =
					server.status === "error" && server.error ? `${server.status}: ${server.error}` : server.status;
				info += `${theme.fg("dim", `${server.name}:`)} ${theme.fg(statusColor, statusText)} ${theme.fg("dim", `(${server.fileTypes.join(", ")})`)}\n`;
			}
		}

		if (this.ctx.mcpManager) {
			const mcpServers = this.ctx.mcpManager.getConnectedServers();
			info += `\n${theme.bold("MCP 服务器")}\n`;
			if (mcpServers.length === 0) {
				info += `${theme.fg("dim", "未连接")}\n`;
			} else {
				for (const name of mcpServers) {
					const conn = this.ctx.mcpManager.getConnection(name);
					const toolCount = conn?.tools?.length ?? 0;
					info += `${theme.fg("dim", `${name}:`)} ${theme.fg("success", "已连接")} ${theme.fg("dim", `(${toolCount} 个工具)`)}\n`;
				}
			}
		}

		this.ctx.showSessionInfo(info, this.ctx.session.getContextUsage());
	}

	static readonly #advisorStatusGlyph: Record<string, string> = {
		running: "●",
		paused: "○",
		no_model: "○",
		quota_exhausted: "✕",
		error: "✕",
	};

	static readonly #advisorStatusLabel: Record<string, string> = {
		running: "running",
		paused: "off",
		no_model: "no model",
		quota_exhausted: "quota exhausted",
		error: "error",
	};

	async handleAdvisorStatusCommand(): Promise<void> {
		const stats = this.ctx.session.getAdvisorStats();
		if (!stats.configured) {
			this.showCommandReport({ title: "Advisor 状态", body: new Text("顾问已禁用。", 0, 0) });
			return;
		}
		// Render cached quota data without waiting for the network. Quota lines
		// are optional, and the refresh below serves the next invocation.
		const usageProvider = this.ctx.session as {
			cachedUsageReports?: UsageReport[];
			fetchUsageReports?: () => Promise<UsageReport[] | null>;
		};
		const usageReports: UsageReport[] | null = usageProvider.cachedUsageReports ?? null;
		// Warm the snapshot for the next invocation. The fetch logs its own
		// failures, and a missing quota line is non-fatal by design.
		void usageProvider.fetchUsageReports?.().catch(() => {});
		// Resolve the active OAuth identity for each advisor's provider so quota
		// filtering matches the credential actually in use (not sibling accounts).
		const resolveActiveAdvisorAccount = (provider: string, sessionId?: string): OAuthAccountIdentity | undefined =>
			this.ctx.session.modelRegistry.authStorage.oauth.identity(provider, sessionId ?? this.ctx.session.sessionId);
		const nowMs = Date.now();
		// Roster view: show every configured advisor with its status, even when
		// none are live (all paused/no-model). The old code returned a generic
		// message that hid the per-advisor state the user needs to act on.
		if (stats.advisors.length > 1 || (stats.configured && !stats.active)) {
			let info = "";
			for (const a of stats.advisors) {
				const glyph = CommandController.#advisorStatusGlyph[a.status] ?? "?";
				const label = CommandController.#advisorStatusLabel[a.status] ?? a.status;
				const color =
					a.status === "running"
						? "success"
						: a.status === "quota_exhausted" || a.status === "error"
							? "error"
							: "dim";
				info += `\n${theme.fg(color, glyph)} ${theme.bold(a.name)} ${theme.fg("dim", `[${label}]`)}\n`;
				if (a.model) {
					info += `${theme.fg("dim", "模型：")} ${a.model.provider}/${a.model.id}\n`;
				}
				if (a.model && usageReports) {
					const identity = resolveActiveAdvisorAccount(a.model.provider, a.sessionId);
					const quota = formatCompactQuota(
						a.model.provider,
						collapseSharedUsageReports(usageReports),
						nowMs,
						(report, limit) => !identity || limitMatchesActiveAccount(report, limit, identity),
					);
					if (quota) info += `${theme.fg("dim", quota)}\n`;
				}
				if (a.status === "running" || a.status === "quota_exhausted") {
					const ctx =
						a.contextWindow > 0
							? `${a.contextTokens.toLocaleString()} / ${a.contextWindow.toLocaleString()} (${Math.round((a.contextTokens / a.contextWindow) * 100)}%)`
							: `${a.contextTokens.toLocaleString()}`;
					info += `${theme.fg("dim", "上下文：")} ${ctx}\n`;
					info += `${theme.fg("dim", "消息：")} ${a.messages.total.toLocaleString()}\n`;
					info += `${theme.fg("dim", "消耗：")} ${a.tokens.input.toLocaleString()} in / ${a.tokens.output.toLocaleString()} out`;
					if (a.cost > 0) info += `, $${a.cost.toFixed(4)}`;
					info += "\n";
				}
			}
			if (stats.active) {
				info += `\n${theme.bold("总计")}\n`;
				info += `${theme.fg("dim", "令牌：")} ${stats.tokens.total.toLocaleString()}\n`;
				if (stats.cost > 0) info += `${theme.fg("dim", "费用：")} $${stats.cost.toFixed(4)}\n`;
			}
			this.showCommandReport({
				title: `顾问状态（${stats.advisors.length} 个顾问）`,
				body: new Text(info.trim(), 0, 0),
			});
			return;
		}
		// Single active advisor — detailed view.
		const model = stats.model;
		let info = "";
		if (stats.advisors.length === 1) {
			const a = stats.advisors[0];
			const glyph = CommandController.#advisorStatusGlyph[a.status] ?? "?";
			const label = CommandController.#advisorStatusLabel[a.status] ?? a.status;
			info += `${theme.fg(a.status === "running" ? "success" : "error", glyph)} ${a.name} ${theme.fg("dim", `[${label}]`)}\n\n`;
		}
		if (model) {
			info += `${theme.bold("提供商")}\n`;
			info += `${theme.fg("dim", "模型：")} ${model.provider}/${model.id}\n`;
		}
		if (model && usageReports) {
			const identity = resolveActiveAdvisorAccount(model.provider, stats.advisors[0]?.sessionId);
			const quota = formatCompactQuota(
				model.provider,
				collapseSharedUsageReports(usageReports),
				nowMs,
				(report, limit) => !identity || limitMatchesActiveAccount(report, limit, identity),
			);
			if (quota) {
				info += `\n${theme.bold("配额")}\n`;
				info += `${theme.fg("dim", quota)}\n`;
			}
		}
		info += `\n${theme.bold("消息")}\n`;
		info += `${theme.fg("dim", "用户：")} ${stats.messages.user.toLocaleString()}\n`;
		info += `${theme.fg("dim", "助手：")} ${stats.messages.assistant.toLocaleString()}\n`;
		info += `${theme.fg("dim", "总计：")} ${stats.messages.total.toLocaleString()}\n`;
		info += `\n${theme.bold("上下文")}\n`;
		if (stats.contextWindow > 0) {
			const percent = Math.round((stats.contextTokens / stats.contextWindow) * 100);
			info += `${theme.fg("dim", "令牌：")} ${stats.contextTokens.toLocaleString()} / ${stats.contextWindow.toLocaleString()} (${percent}%)\n`;
		} else {
			info += `${theme.fg("dim", "令牌：")} ${stats.contextTokens.toLocaleString()}\n`;
		}
		info += `\n${theme.bold("支出")}\n`;
		info += `${theme.fg("dim", "输入：")} ${stats.tokens.input.toLocaleString()}\n`;
		info += `${theme.fg("dim", "输出：")} ${stats.tokens.output.toLocaleString()}\n`;
		if (stats.tokens.cacheRead > 0) {
			info += `${theme.fg("dim", "缓存读取：")} ${stats.tokens.cacheRead.toLocaleString()}\n`;
		}
		if (stats.cost > 0) info += `${theme.fg("dim", "费用：")} $${stats.cost.toFixed(4)}\n`;
		this.showCommandReport({ title: "Advisor 状态", body: new Text(info.trim(), 0, 0) });
	}

	/**
	 * `/jobs`: natively the live jobs sheet the jobs pill opens (inspect and
	 * cancel included); `/jobs full`, and text mode, a report of the running
	 * and recent jobs (see {@link showCommandReport}). Both list the viewed
	 * session's jobs and its subagents' as a tree (see {@link buildJobTree}).
	 */
	async handleJobsCommand(options?: { full?: boolean }): Promise<void> {
		const full = options?.full === true;
		const tree = this.ctx.viewSession.getAsyncJobTree();
		if (!tree) {
			this.ctx.showWarning("此会话中异步后台任务不可用。");
			return;
		}
		if (isNativeRendering() && !full) {
			this.ctx.showJobsSheet();
			return;
		}

		const now = Date.now();
		const columns = this.ctx.ui.terminal.columns ?? 100;
		let info = `${theme.fg("dim", "正在运行：")} ${tree.running.length}\n`;
		if (tree.running.length === 0 && tree.recent.length === 0) {
			info += `\n${theme.fg("dim", "尚无异步任务。")}`;
			this.showCommandReport({ title: "后台任务", body: new Text(info, 0, 0) });
			return;
		}

		// Lines under a row hang off its tree rails. Full mode wraps here so
		// every line, including heredoc lines and wrap continuations, keeps that
		// indent inside the report box.
		info += "\n";
		for (const row of buildJobTree([...tree.running, ...tree.recent], tree.agents, tree.rootId)) {
			const guide = theme.fg("dim", jobTreeGuide(row, theme));
			if (row.kind === "agent") {
				info += `${guide}${theme.bold(row.agent.id)}\n`;
				continue;
			}
			const { job } = row;
			// A spawned subagent's task job takes the agent's id as its id and label: name it once.
			const agent = row.agent && row.agent.id !== job.id ? ` ${theme.bold(row.agent.id)}` : "";
			info += `${guide}${renderJobLine(job, now)}${agent}\n`;
			const text = full ? (job.command ?? job.label) : job.label;
			if (text === job.id) continue;
			const indent = jobTreeIndent(row, theme);
			const prefix = theme.fg("dim", indent);
			if (!full) {
				const label = truncateJobLabel(text, Math.max(24, columns - 22 - visibleWidth(indent)));
				info += `${prefix}${theme.fg("dim", label)}\n`;
				continue;
			}
			for (const line of wrapTextWithAnsi(
				replaceTabs(sanitizeText(text)),
				Math.max(1, columns - 4 - visibleWidth(indent)),
			)) {
				info += `${prefix}${theme.fg("dim", line)}\n`;
			}
		}

		this.showCommandReport({ title: "后台任务", body: new Text(info.trimEnd(), 0, 0) });
	}

	async handleUsageCommand(reports?: UsageReport[] | null): Promise<void> {
		let usageReports = reports ?? null;
		if (!usageReports) {
			const provider = this.ctx.session as { fetchUsageReports?: () => Promise<UsageReport[] | null> };
			if (!provider.fetchUsageReports) {
				this.ctx.showWarning("未为此会话配置使用情况报告。");
				return;
			}
			try {
				usageReports = await provider.fetchUsageReports();
			} catch (error) {
				this.ctx.showError(`获取使用情况数据失败：${error instanceof Error ? error.message : String(error)}`);
			}
		}

		this.ctx.showUsageDashboard(usageReports ?? []);
	}

	async handleChangelogCommand(args = ""): Promise<void> {
		const view = parseChangelogView(args);
		if ("error" in view) {
			this.ctx.showWarning(view.error);
			return;
		}
		const changelogPath = getChangelogPath();
		const allEntries = await parseChangelog(changelogPath);
		const entriesToShow = selectChangelogEntries(allEntries, view);
		const changelogMarkdown =
			entriesToShow.length > 0 ? renderChangelogEntries(entriesToShow).markdown : "No changelog entries found.";
		const shown = entriesToShow.length;
		const titleCount = shown > 0 ? shown : view.kind === "last" ? view.count : shown;
		const title =
			view.kind === "full"
				? "完整更新日志"
				: view.kind === "last"
					? titleCount === 1
						? "最新发布"
						: `最近 ${titleCount} 次发布`
					: "近期更改";
		const hint =
			view.kind === "full"
				? ""
				: `\n\n${theme.fg("dim", "使用")} ${theme.bold("/changelog 完整")} ${theme.fg("dim", "查看完整变更日志。")}`;

		this.#showMarkdownPanel(title, changelogMarkdown + hint);
	}

	handleHotkeysCommand(): void {
		const bindings = { keybindings: this.ctx.keybindings };
		if (isNativeRendering()) {
			// A native terminal gets a dismissable sheet with keycaps instead of a markdown table.
			const sheet = new HotkeysSheetComponent(bindings, () => {
				handle.hide();
				this.ctx.ui.setFocus(this.ctx.editorContainer.children[0] ?? this.ctx.editor);
				this.ctx.ui.requestRender();
			});
			const handle = this.ctx.ui.showOverlay(sheet, { anchor: "center", width: "90%", maxHeight: "90%" });
			this.ctx.ui.setFocus(sheet);
			this.ctx.ui.requestRender();
			return;
		}
		this.#showMarkdownPanel("Keyboard Shortcuts", buildHotkeysMarkdown(bindings));
	}

	handleToolsCommand(): void {
		const tools = buildToolsMarkdown({
			tools: this.ctx.session.agent.state.tools,
			xdevTools: this.ctx.session.getXdevToolEntries(),
		});
		this.#showMarkdownPanel("Available Tools", tools);
	}

	handleContextCommand(): void {
		const session = this.ctx.session;
		if (!session.model) {
			this.ctx.showWarning("上下文用量不可用：此会话未选择模型。");
			return;
		}
		// Validate capacity before tokenizing the whole history into a snapshot.
		const breakdown = computeSessionContextBreakdown(session, { snapcompactSavings: true });
		if (!(breakdown.contextWindow > 0) || !Number.isFinite(breakdown.contextWindow)) {
			this.ctx.showWarning("上下文用量不可用：模型的上下文窗口未知或无效。");
			return;
		}
		const data = buildSessionContextView(session, breakdown);
		this.#clearReport();
		this.#closeReportSheet();
		const viewer = new ContextViewer(data, {
			onClose: () => this.#closeReportSheet(),
			requestRender: () => this.ctx.ui.requestRender(),
			getRows: () => this.ctx.ui.terminal.rows,
		});
		this.#showFullscreenSheet(viewer);
		this.ctx.ui.requestRender();
	}

	async handleMemoryCommand(text: string): Promise<void> {
		const argumentText = text.slice(7).trim();
		const action = argumentText.split(/\s+/, 1)[0]?.toLowerCase() || "view";
		const agentDir = this.ctx.settings.getAgentDir();
		const backend = await resolveMemoryBackend(this.ctx.settings);

		if (action === "view") {
			const payload = await backend.buildDeveloperInstructions(
				agentDir,
				this.ctx.sessionManager.getCwd(),
				this.ctx.settings,
				this.ctx.session,
			);
			if (!payload) {
				this.ctx.showWarning("记忆负载为空（记忆后端已关闭、已禁用或没有可用记忆）。");
				return;
			}
			this.#showMarkdownPanel("Memory Injection Payload", payload);
			return;
		}

		if (action === "reset" || action === "clear") {
			try {
				await backend.clear(agentDir, this.ctx.sessionManager.getCwd(), this.ctx.session);
				await this.ctx.session.refreshBaseSystemPrompt();
				this.ctx.showStatus("记忆数据已清除，系统提示已刷新。");
			} catch (error) {
				this.ctx.showError(`清除记忆失败：${error instanceof Error ? error.message : String(error)}`);
			}
			return;
		}

		if (action === "enqueue" || action === "rebuild") {
			try {
				await backend.enqueue(agentDir, this.ctx.sessionManager.getCwd(), this.ctx.session);
				this.ctx.showStatus("记忆整合已入队。");
			} catch (error) {
				this.ctx.showError(`记忆入队失败：${error instanceof Error ? error.message : String(error)}`);
			}
			return;
		}
		if (action === "queue") {
			try {
				const payload = await backend.queuePreview?.({
					agentDir,
					cwd: this.ctx.sessionManager.getCwd(),
					session: this.ctx.session,
				});
				if (!payload) {
					this.ctx.showWarning(`记忆队列不可用于 ${backend.id} 后端。`);
					return;
				}
				this.#showMarkdownPanel("Memory Queue", payload);
			} catch (error) {
				this.ctx.showError(`记忆队列失败：${error instanceof Error ? error.message : String(error)}`);
			}
			return;
		}

		if (action === "sync") {
			try {
				await backend.enqueue(agentDir, this.ctx.sessionManager.getCwd(), this.ctx.session);
				this.ctx.showStatus("记忆整合已执行。");
			} catch (error) {
				this.ctx.showError(`内存同步失败：${error instanceof Error ? error.message : String(error)}`);
			}
			return;
		}

		if (action === "stats" || action === "diagnose") {
			const hook = action === "stats" ? backend.stats : backend.diagnose;
			try {
				const payload = await hook?.(agentDir, this.ctx.sessionManager.getCwd(), this.ctx.session);
				if (!payload) {
					this.ctx.showWarning(memoryStatsUnavailableMessage(backend.id, action));
					return;
				}
				this.#showMarkdownPanel(`Memory ${action === "stats" ? "Stats" : "Diagnostics"}`, payload);
			} catch (error) {
				this.ctx.showError(`内存 ${action} 失败：${error instanceof Error ? error.message : String(error)}`);
			}
			return;
		}

		if (action === "mm") {
			await this.#handleMentalModelsSubcommand(argumentText);
			return;
		}

		this.ctx.showError("用法：/memory <view|stats|diagnose|clear|reset|enqueue|rebuild|queue|sync|mm ...>");
	}

	async #handleMentalModelsSubcommand(argumentText: string): Promise<void> {
		// Parse: "mm <verb> [arg]"
		const parts = argumentText.split(/\s+/).slice(1);
		const verb = parts[0]?.toLowerCase() ?? "list";
		const arg = parts[1];

		const state = this.ctx.session.getHindsightSessionState();
		const primary = state && !state.aliasOf ? state : undefined;
		if (!primary) {
			this.ctx.showError("Hindsight 后端在此会话中未激活。");
			return;
		}
		if (!primary.config.mentalModelsEnabled) {
			this.ctx.showError("心智模型已禁用（hindsight.mentalModelsEnabled = false）。");
			return;
		}

		switch (verb) {
			case "list":
				await this.#mmList(primary);
				return;
			case "show":
				if (!arg) return this.ctx.showError("用法：/memory mm show <id>");
				await this.#mmShow(primary, arg);
				return;
			case "refresh":
				await this.#mmRefresh(primary, arg);
				return;
			case "history":
				if (!arg) return this.ctx.showError("用法：/memory mm history <id>");
				await this.#mmHistory(primary, arg);
				return;
			case "seed":
				await this.#mmSeed(primary);
				return;
			case "reload":
				await this.#mmReload(primary);
				return;
			case "delete":
			case "remove":
				if (!arg) return this.ctx.showError("用法：/memory mm delete <id>");
				await this.#mmDelete(primary, arg);
				return;
			default:
				this.ctx.showError("用法：/memory mm <list|show|refresh|history|seed|reload|delete>");
		}
	}

	async #mmList(state: HindsightSessionState): Promise<void> {
		const client: HindsightApi = state.client;
		try {
			const response = await client.listMentalModels(state.bankId, { detail: "元数据" });
			const items = response.items ?? [];
			if (items.length === 0) {
				this.ctx.showStatus(`库 ${state.bankId} 中没有心智模型。`);
				return;
			}
			const lines = items
				.slice()
				.sort((a, b) => a.id.localeCompare(b.id))
				.map(summarizeMentalModel);
			this.#showMarkdownPanel(`Mental Models — ${state.bankId}`, lines.join("\n"));
		} catch (error) {
			this.ctx.showError(`mm list 失败：${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async #mmShow(state: HindsightSessionState, id: string): Promise<void> {
		try {
			const model = await state.client.getMentalModel(state.bankId, id, { detail: "内容" });
			if (!model) {
				this.ctx.showError(`未找到思维模型：${id}`);
				return;
			}
			const tags = model.tags && model.tags.length > 0 ? `\n_tags: ${model.tags.join(", ")}_` : "";
			const refreshed = model.last_refreshed_at ? `\n_last refreshed: ${model.last_refreshed_at}_` : "";
			const sourceQuery = model.source_query ? `\n\n**Source query:** ${model.source_query}` : "";
			const content = (model.content ?? "_(empty — background reflect may still be running)_").trim();
			this.#showMarkdownPanel(model.name, `**id:** \`${model.id}\`${tags}${refreshed}${sourceQuery}\n\n${content}`);
		} catch (error) {
			this.ctx.showError(`mm show 失败：${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async #mmRefresh(state: HindsightSessionState, id: string | undefined): Promise<void> {
		try {
			if (id) {
				// Single-model refresh is explicit operator intent: bypass the
				// auto-refresh filter so curated/manual models can still be
				// refreshed on demand.
				await state.client.refreshMentalModel(state.bankId, id);
				this.ctx.showStatus(`已排队刷新思维模型 ${id}。`);
			} else {
				// Bulk refresh: only touch models that opted into automatic
				// refresh via `trigger.refresh_after_consolidation`. Curated
				// models are reviewed before publishing and must not be
				// silently regenerated by a bank-wide refresh sweep. Reading
				// `detail: "content"` here is required because the trigger
				// field is excluded from `detail: "metadata"`.
				const list = await state.client.listMentalModels(state.bankId, { detail: "内容" });
				const items = list.items ?? [];
				if (items.length === 0) {
					this.ctx.showStatus(`库 ${state.bankId} 中没有心智模型。`);
					return;
				}
				const targets = items.filter(m => m.trigger?.refresh_after_consolidation === true);
				const skipped = items.length - targets.length;
				if (targets.length === 0) {
					this.ctx.showStatus(
						`没有思维模型启用自动刷新；${skipped} 个精选模型未做改动。请传入显式 id 以刷新其中一个。`,
					);
					return;
				}
				let queued = 0;
				for (const item of targets) {
					try {
						await state.client.refreshMentalModel(state.bankId, item.id);
						queued++;
					} catch (error) {
						this.ctx.showWarning(
							`刷新 ${item.id} 失败：${error instanceof Error ? error.message : String(error)}`,
						);
					}
				}
				const skippedSuffix = skipped > 0 ? `; skipped ${skipped} curated model(s)` : "";
				this.ctx.showStatus(
					`已排队刷新 ${queued}/${targets.length} 个自动刷新模型${skippedSuffix}。`,
				);
			}
			// Reload the cache after a brief grace so the new content (if the refresh
			// completes synchronously on the server) flows into the system prompt.
			await Bun.sleep(500);
			await reloadMentalModelsForSession(state.session);
		} catch (error) {
			this.ctx.showError(`mm refresh 失败：${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async #mmHistory(state: HindsightSessionState, id: string): Promise<void> {
		try {
			const [model, history] = await Promise.all([
				state.client.getMentalModel(state.bankId, id, { detail: "内容" }),
				state.client.getMentalModelHistory(state.bankId, id),
			]);
			if (!model) {
				this.ctx.showError(`未找到思维模型：${id}`);
				return;
			}
			if (history.length === 0) {
				this.ctx.showStatus(`没有为 ${id} 记录历史记录。`);
				return;
			}
			// History is most-recent first. Each entry stores the content BEFORE that
			// change. To diff "what changed at entry N", compare entry N's
			// previous_content (= state before that change) with entry N-1's
			// previous_content (= state after that change, which was state before
			// the next change). For the most recent change, compare against the
			// model's CURRENT content.
			const sections: string[] = [];
			for (let i = 0; i < history.length; i++) {
				const before = history[i].previous_content ?? "";
				const after = i === 0 ? (model.content ?? "") : (history[i - 1].previous_content ?? "");
				const diff = diffMentalModelContent(before, after);
				sections.push(`### ${history[i].changed_at}\n\n\`\`\`diff\n${diff}\n\`\`\``);
			}
			this.#showMarkdownPanel(`History — ${model.name}`, sections.join("\n\n"));
		} catch (error) {
			this.ctx.showError(`mm history 失败：${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async #mmSeed(state: HindsightSessionState): Promise<void> {
		try {
			const config = loadHindsightConfig(this.ctx.settings);
			const seeds = resolveSeedsForScope(
				{
					bankId: state.bankId,
					retainTags: state.retainTags,
					recallTags: state.recallTags,
					recallTagsMatch: state.recallTagsMatch,
				},
				config.scoping,
			);
			if (seeds.length === 0) {
				this.ctx.showStatus(`没有适用于 scoping=${config.scoping} 的内置种子。`);
				return;
			}
			const list = await state.client.listMentalModels(state.bankId, { detail: "元数据" });
			const existing = list.items ?? [];
			let created = 0;
			let skipped = 0;
			for (const seed of seeds) {
				if (seedAlreadyExists(seed, existing)) {
					skipped++;
					continue;
				}
				try {
					await state.client.createMentalModel(state.bankId, seed.name, seed.sourceQuery, {
						id: seed.id,
						tags: seed.tags.length > 0 ? seed.tags : undefined,
						maxTokens: seed.maxTokens,
						trigger: seed.trigger,
					});
					created++;
				} catch (error) {
					this.ctx.showWarning(
						`为 ${seed.id} 生成种子数据失败：${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}
			this.ctx.showStatus(`已生成 ${created} 个新思维模型；${skipped} 个已存在。`);
		} catch (error) {
			this.ctx.showError(`mm seed 失败：${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async #mmReload(state: HindsightSessionState): Promise<void> {
		const ok = await reloadMentalModelsForSession(state.session);
		if (ok) {
			this.ctx.showStatus("思维模型缓存已重新加载。");
		} else {
			this.ctx.showError("重新加载失败（Hindsight 后端未激活或思维模型已禁用）。");
		}
	}

	async #mmDelete(state: HindsightSessionState, id: string): Promise<void> {
		try {
			const removed = await state.client.deleteMentalModel(state.bankId, id);
			if (!removed) {
				this.ctx.showError(`未找到思维模型：${id}`);
				return;
			}
			// Drop the cached snippet so the closing tag does not silently keep
			// stale content in the system prompt until the next agent_end TTL.
			await reloadMentalModelsForSession(state.session);
			this.ctx.showStatus(`已删除思维模型 ${id}（来自 ${state.bankId} 库）。`);
		} catch (error) {
			this.ctx.showError(`mm 删除失败：${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async #runNewSessionFlow(options?: NewSessionOptions, label: string = "New session started"): Promise<void> {
		this.ctx.clearTransientSessionUi();

		if (this.ctx.session.isCompacting) {
			this.ctx.session.abortCompaction();
			while (this.ctx.session.isCompacting) {
				await Bun.sleep(10);
			}
		}
		if (!(await this.ctx.session.newSession(options))) return;
		// A focused subagent view keeps its own history: return to the main session
		// first so the transcript below cannot rebuild from the subagent's surviving
		// conversation, then drop any turn-scoped anchors (coalescing timers,
		// in-flight dispatches) the session boundary orphaned.
		if (this.ctx.focusedAgentId) await this.ctx.unfocusSession();
		this.ctx.eventController.resetTranscriptAnchors();
		this.ctx.resetObserverRegistry();
		setSessionTerminalTitle(this.ctx.sessionManager.getSessionName(), this.ctx.sessionManager.getCwd());

		this.ctx.statusLine.invalidate();
		this.ctx.statusLine.resetActiveTime();
		this.ctx.updateEditorBorderColor();
		this.ctx.clearTransientSessionUi();
		this.ctx.resetTranscript();

		this.ctx.present([new Spacer(1), new Text(`${theme.fg("accent", `${theme.status.success} ${label}`)}`, 1, 1)]);
		await this.ctx.reloadTodos();
		this.ctx.ui.requestRender(true, { clearScrollback: true });
	}

	async handleClearCommand(): Promise<void> {
		await this.#runNewSessionFlow();
	}

	async handleFreshCommand(): Promise<void> {
		const result = this.ctx.session.freshSession();
		if (!result) {
			this.ctx.showWarning("请等待当前响应完成或中止，然后再刷新提供商状态。");
			return;
		}
		const stateLabel = result.closedProviderSessions === 1 ? "provider state" : "provider states";
		this.ctx.statusLine.invalidate();
		this.ctx.ui.requestRender();
		this.ctx.showStatus(`已启动新的提供商会话（已清理 ${result.closedProviderSessions} 个 ${stateLabel}）。`);
	}

	async handleResetContextCommand(): Promise<void> {
		if (this.ctx.session.isCompacting) {
			this.ctx.session.abortCompaction();
			while (this.ctx.session.isCompacting) {
				await Bun.sleep(10);
			}
		}
		const result = await this.ctx.session.resetSessionContext();
		if (!result) {
			this.ctx.showWarning("请等待当前响应完成或中止，然后再重置上下文。");
			return;
		}
		// Drop the rendered transcript so the UI matches the now-empty model
		// context (mirrors #runNewSessionFlow's teardown, minus the new session —
		// the session id, title, and transcript file all survive).
		this.ctx.clearTransientSessionUi();
		this.ctx.resetTranscript();
		this.ctx.statusLine.invalidate();
		this.ctx.updateEditorBorderColor();
		const noun = result.droppedCount === 1 ? "message" : "messages";
		this.ctx.present([
			new Spacer(1),
			new Text(
				`${theme.fg("accent", `${theme.status.success} 上下文已重置 — 已丢弃 ${result.droppedCount} 个 ${noun}；会话继续。`)}`,
				1,
				1,
			),
		]);
		this.ctx.ui.requestRender(true, { clearScrollback: true });
	}

	async handleDeleteCommand(): Promise<void> {
		if (!this.ctx.sessionManager.getSessionFile()) {
			this.ctx.showError("无可删除内容（内存会话）");
			return;
		}
		await this.#runNewSessionFlow({ drop: true }, "Session deleted");
	}

	async handleForkCommand(placement?: "pane" | "window"): Promise<void> {
		if (placement !== undefined) {
			await this.#handleForkTerminalCommand(placement);
			return;
		}

		// A Tern pane fork leaves this session untouched, so it may run mid-turn.
		if (await this.#forkIntoTernPane()) return;

		// An in-place fork moves this process onto the new file; a running turn
		// would finish there and leave the original transcript cut mid-turn.
		if (this.ctx.session.isStreaming) {
			this.ctx.showWarning("请等待当前响应完成或中止，然后再派生会话。");
			return;
		}
		if (this.ctx.loadingAnimation) {
			this.ctx.loadingAnimation.stop();
			this.ctx.loadingAnimation = undefined;
		}
		this.ctx.statusContainer.disposeChildren();

		// After a `/fork`, the current session ID is changed to the forked one,
		// so the session ID before the fork is the one we want to show in the hint.
		const previousSessionId = this.ctx.sessionManager.isSessionOnDisk()
			? this.ctx.sessionManager.getSessionId()
			: undefined;

		const success = await this.ctx.session.fork();
		if (!success) {
			this.ctx.showError("派生失败（会话未持久化或已取消）");
			return;
		}

		this.ctx.statusLine.invalidate();
		this.ctx.ui.requestRender();

		this.ctx.present([
			new Spacer(1),
			new Text(
				theme.fg(
					"accent",
					previousSessionId
						? `${theme.status.success} 会话已派生 · 返回原会话：${resumeCommand(previousSessionId)} 或 /resume ${previousSessionId}`
						: `${theme.status.success} 会话已派生`,
				),
				1,
				1,
			),
		]);
	}

	async #handleForkTerminalCommand(placement: "pane" | "window"): Promise<void> {
		const dependencies = this.#forkTerminalDependencies;
		const environment = dependencies.environment();
		const multiplexer = dependencies.classifyTerminalMultiplexer(environment);
		const placementInfo = getTerminalLaunchPlacement(multiplexer, placement);
		if ("error" in placementInfo) {
			this.ctx.showError(placementInfo.error);
			return;
		}

		if (this.ctx.session.isStreaming) {
			const confirmed = await this.ctx.showHookConfirm(
				"Fork while a response is running?",
				"The child may not include the partial response. Continue opening a fork? The current session will keep running here.",
			);
			if (!confirmed) return;
		}

		const initialSessionFile = this.ctx.sessionManager.getSessionFile();
		if (!initialSessionFile) {
			this.ctx.showError("无法在另一个终端中打开派生会话：当前会话尚未持久化。");
			return;
		}

		const childArgs = restartArgv(dependencies.argv(), undefined, FORK_LAUNCH_OVERRIDES);
		if (hasForkApiKeyOverride(childArgs)) {
			this.ctx.showError(
				"若在启动时提供了 --api-key，则无法在另一个终端中打开派生会话；在复用器命令中转发该密钥会暴露它。请在认证存储中配置提供商凭据后重试。",
			);
			return;
		}
		const shellGrammar = placementInfo.shellGrammar;
		if (shellGrammar === "posix") {
			const confirmed = await this.ctx.showHookConfirm(
				"Confirm destination shell compatibility",
				"This fork command uses POSIX shell syntax. Continue only if the destination's configured interactive shell accepts POSIX syntax; this cannot be inferred from the current terminal.",
			);
			if (!confirmed) {
				this.ctx.showWarning("派生已取消：目标位置与 POSIX shell 的兼容性未得到确认。");
				return;
			}
		}

		try {
			await this.ctx.sessionManager.flush();
		} catch (error) {
			logger.error("Failed to flush the session before opening a terminal fork", { error });
			this.ctx.showError("无法在另一个终端中打开派生会话：保存当前会话失败。");
			return;
		}

		const sessionFile = this.ctx.sessionManager.getSessionFile();
		if (!sessionFile) {
			this.ctx.showError("无法在另一个终端中打开派生会话：当前会话已不再持久化。");
			return;
		}
		const sourceSessionFile = path.resolve(sessionFile);
		try {
			await fs.access(sourceSessionFile);
		} catch {
			this.ctx.showError("无法在另一个终端中打开派生会话：持久化的会话记录不可用。");
			return;
		}

		try {
			const activeProfile = dependencies.getActiveProfile();
			const activeModel = this.ctx.session.model;
			if (activeProfile) childArgs.push("--profile", activeProfile);
			if (activeModel) childArgs.push("--model", `${activeModel.provider}/${activeModel.id}`);
			const activeThinkingLevel = this.ctx.session.configuredThinkingLevel();
			if (activeThinkingLevel !== undefined) childArgs.push("--thinking", activeThinkingLevel);
			// Forcing --model/--thinking marks the fork's cache shape as changed, which would
			// drop the inherited key. Automatic candidates travel in the source header;
			// forwarding them as --prompt-cache-key would bypass their model gate.
			if (
				this.ctx.session.agent.promptCacheKey !== undefined ||
				this.ctx.sessionManager.getHeader()?.taskPromptCacheKey === undefined
			) {
				childArgs.push("--prompt-cache-key", this.ctx.session.agent.promptCacheKey ?? this.ctx.session.sessionId);
			}
			childArgs.push("--fork", sourceSessionFile);
			// Pin only non-secret scope variables.
			const command = [
				...forkScopeEnvCommand({
					PI_CODING_AGENT_DIR: this.ctx.settings.getAgentDir(),
					PI_CONFIG_DIR: getConfigDirName(),
					OMP_PROFILE: activeProfile,
					PI_PROFILE: activeProfile,
					PI_CONFIG_FILES: this.ctx.settings.getConfigFiles().join(path.delimiter),
					PI_CODING_AGENT_SESSION_DIR: environment.PI_CODING_AGENT_SESSION_DIR,
					XDG_DATA_HOME: environment.XDG_DATA_HOME,
					XDG_STATE_HOME: environment.XDG_STATE_HOME,
					XDG_CACHE_HOME: environment.XDG_CACHE_HOME,
				}),
				...dependencies.resolveCliEntryCmd(),
				...childArgs,
			];
			const launchPlan = createDefaultTerminalLaunchRequest(
				multiplexer,
				placement,
				command,
				this.ctx.sessionManager.getCwd(),
				shellGrammar,
			);
			if ("error" in launchPlan) {
				this.ctx.showError(launchPlan.error);
				return;
			}

			const result = await dependencies.launchTerminal(launchPlan.request);
			if (result.warning) {
				this.ctx.showWarning(
					`已在 ${placementInfo.displayName} 中打开派生会话，但 ${result.warning} 当前会话在此继续。`,
				);
				return;
			}
			this.ctx.showStatus(
				`已在 ${placementInfo.displayName} (${placementInfo.placementLabel}) 中打开分叉；此会话在此继续。`,
			);
		} catch (error) {
			logger.error("Failed to open a terminal fork", { multiplexer, error });
			this.ctx.showError(
				error instanceof TerminalLaunchError
					? `无法在 ${placementInfo.displayName} 中打开派生会话：${error.message}`
					: `无法在 ${placementInfo.displayName} 中打开派生会话。详情请查看日志。`,
			);
		}
	}

	/**
	 * `/fork` inside a Tern pane: ask Tern to run `omp --fork` of this session in a new pane beside
	 * this one, which keeps the original session. False means fork in place instead: outside Tern,
	 * an unsaved session, a Tern without `fork`, or Tern refusing it. Once the request is out, an
	 * unconfirmed one is reported rather than retried in place, since Tern may still open the pane.
	 */
	async #forkIntoTernPane(): Promise<boolean> {
		const tern = resolveTernPane();
		if (!tern || !this.ctx.sessionManager.isSessionOnDisk()) return false;
		const client = new TernSocketClient({ socketPath: tern.socketPath });
		try {
			try {
				await client.connect();
			} catch (error) {
				logger.debug("Tern unreachable for /fork; forking in place", {
					error: error instanceof Error ? error.message : String(error),
				});
				return false;
			}
			if (!client.supports("fork")) return false;
			// The new pane's omp reads the session file as it starts.
			await this.ctx.session.flushToDisk();
			try {
				await client.fork({ block: tern.pane }, { timeoutMs: TERN_FORK_TIMEOUT_MS });
			} catch (error) {
				if (error instanceof TernError && !TERN_FORK_UNCONFIRMED[error.kind]) {
					const details = { kind: error.kind, error: error.message };
					if (error.kind === "failed") logger.warn("Tern could not open the fork pane; forking in place", details);
					else logger.debug("Tern refused the fork; forking in place", details);
					return false;
				}
				this.ctx.showError(
					`Tern 未确认派生会话：${error instanceof Error ? error.message : String(error)}`,
				);
				return true;
			}
		} finally {
			client.close();
		}
		const note = this.ctx.session.isStreaming ? " · the running response continues here, not in the fork" : "";
		this.ctx.present([
			new Spacer(1),
			new Text(theme.fg("accent", `${theme.status.success} 会话已派生到新窗格${note}`), 1, 1),
		]);
		return true;
	}

	/**
	 * `/move` — relocate the current session to a different directory.
	 *
	 * With no `targetPath` (TUI only), opens an autocomplete overlay so the user
	 * can pick or type a directory. With a `targetPath`, resolves it directly.
	 * If the target directory does not exist, the user is asked whether to create
	 * it. The active session file and artifacts are moved into the target
	 * directory's session bucket so `/resume` from that directory can find it.
	 */
	async handleMoveCommand(targetPath?: string): Promise<void> {
		if (this.ctx.session.isStreaming) {
			this.ctx.showWarning("请等待当前响应完成或中止后再移动。");
			return;
		}

		let input: string | undefined = targetPath?.trim() || undefined;

		// No argument in TUI mode: open the path autocomplete overlay.
		if (!input) {
			const result = await this.ctx.showHookCustom<MoveOverlayResult | undefined>(
				(_tui, _theme, _keybindings, done) =>
					new MoveOverlay(this.ctx.sessionManager.getCwd(), done, moveDirectorySource),
				{ overlay: true },
			);
			if (!result) return; // cancelled
			input = result.directory;
		}

		const unquoted = stripOuterDoubleQuotes(input);
		if (!unquoted) {
			this.ctx.showError("用法：/move <path>");
			return;
		}

		const cwd = this.ctx.sessionManager.getCwd();
		const resolvedPath = resolveToCwd(unquoted, cwd);

		// If the directory doesn't exist, offer to create it.
		let isDirectory: boolean;
		try {
			isDirectory = (await fs.stat(resolvedPath)).isDirectory();
		} catch {
			isDirectory = false;
		}

		if (!isDirectory) {
			const parentDir = path.dirname(resolvedPath);
			let parentExists = false;
			try {
				parentExists = (await fs.stat(parentDir)).isDirectory();
			} catch {
				parentExists = false;
			}
			if (!parentExists) {
				this.ctx.showError(`无法创建“${path.basename(resolvedPath)}”：父目录不存在`);
				return;
			}
		}
		const moved = await this.#withSessionMove(async () => {
			if (!isDirectory) {
				const confirmed = await this.ctx.showHookConfirm(
					"Create directory?",
					`"${path.basename(resolvedPath)}" does not exist. Create it?`,
				);
				if (!confirmed) return false;
				try {
					await fs.mkdir(resolvedPath, { recursive: true });
				} catch (err) {
					this.ctx.showError(`创建目录失败：${err instanceof Error ? err.message : String(err)}`);
					return false;
				}
			}
			return this.#relocateSession(resolvedPath);
		});
		if (moved) {
			this.ctx.present([
				new Spacer(1),
				new Text(`${theme.fg("accent", `${theme.status.success} 已移至 ${resolvedPath}`)}`, 1, 1),
			]);
		}
	}

	/**
	 * `/wt [<branch>]` — fork the checkout into a new linked git worktree on
	 * `branch` (default `wt/<timestamp>`), carrying uncommitted changes along
	 * unless `keepChanges` is false, then relocate the session there like `/move`.
	 * Returns the worktree only when the session now lives in it.
	 */
	async handleWorktreeCommand(
		branch?: string,
		options: { keepChanges?: boolean } = {},
	): Promise<SessionWorktree | undefined> {
		if (this.ctx.session.isStreaming) {
			this.ctx.showWarning("在创建工作树之前，请等待当前响应完成或将其中止。");
			return undefined;
		}
		let created: SessionWorktree | undefined;
		await this.#withSessionMove(async () => {
			const branchName = branch?.trim() || defaultSessionWorktreeBranch();
			const cwd = this.ctx.sessionManager.getCwd();
			this.ctx.statusContainer.disposeChildren();
			const loader = new Loader(
				this.ctx.ui,
				spinner => theme.fg("accent", spinner),
				text => theme.fg("muted", text),
				`Creating worktree on ${branchName}…`,
				getSymbolTheme().spinnerFrames,
			);
			this.ctx.statusContainer.addChild(loader);
			this.ctx.ui.requestRender();
			let worktree: SessionWorktree;
			try {
				worktree = await createSessionWorktree(cwd, this.ctx.settings, branchName, options);
			} catch (err) {
				this.ctx.showError(`创建工作树失败：${err instanceof Error ? err.message : String(err)}`);
				return false;
			} finally {
				loader.stop();
				this.ctx.statusContainer.disposeChildren();
			}
			if (worktree.cloneError) {
				logger.warn("worktree clone fell back to plain checkout", {
					path: worktree.path,
					error: worktree.cloneError,
				});
			}
			if (!(await this.#relocateSession(worktree.path))) return false;
			created = worktree;
			const cleanup = worktree.keptChanges
				? await cleanSourceCheckoutIfConfigured(cwd, this.ctx.settings)
				: { cleaned: false, errorMessage: undefined };
			if (cleanup.errorMessage !== undefined) {
				this.ctx.showWarning(`工作树已创建，但清理源代码检出失败：${cleanup.errorMessage}`);
			}
			this.ctx.present([
				new Spacer(1),
				new Text(
					`${theme.fg("accent", `${theme.status.success} ${formatSessionWorktreeSummary(worktree, cleanup.cleaned)}`)}`,
					1,
					1,
				),
			]);
			return true;
		});
		return created;
	}

	/** Save source settings before acquiring the gate for a complete relocation operation. */
	async #withSessionMove(operation: () => Promise<boolean>): Promise<boolean> {
		try {
			await this.ctx.settings.flush();
		} catch (err) {
			this.ctx.showError(`保存待处理设置失败：${err instanceof Error ? err.message : String(err)}`);
			return false;
		}

		return this.ctx.withBtwSessionMove(operation);
	}

	/** Relocate only while #withSessionMove holds the BTW gate; false means no successful move. */
	async #relocateSession(resolvedPath: string): Promise<boolean> {
		if (resolvedPath === path.resolve(this.ctx.sessionManager.getCwd())) return false;

		const previousState = this.ctx.sessionManager.captureState();
		try {
			await this.ctx.session.moveSession(resolvedPath);
		} catch (err) {
			this.ctx.showError(`移动失败：${err instanceof Error ? err.message : String(err)}`);
			return false;
		}
		let applied = false;
		try {
			applied = await this.ctx.applyCwdChange(resolvedPath);
		} catch (error) {
			await this.#restoreAfterMoveFailure(previousState, error);
			return false;
		}
		if (!applied) {
			await this.#restoreAfterMoveFailure(previousState);
			return false;
		}

		this.ctx.updateEditorBorderColor();
		await this.ctx.reloadTodos();
		this.ctx.ui.requestRender();
		return true;
	}

	async handleRenameCommand(title: string): Promise<void> {
		const session = this.ctx.session;
		const sessionManager = this.ctx.sessionManager;
		const sessionId = sessionManager.getSessionId();
		const signal = session.titleGenerationSignal;
		let titleRevision = sessionManager.titleRevision;
		const isCurrent = () =>
			this.ctx.session === session &&
			this.ctx.sessionManager === sessionManager &&
			!signal.aborted &&
			sessionManager.getSessionId() === sessionId &&
			sessionManager.titleRevision === titleRevision;
		try {
			const persistence = sessionManager.setSessionName(title, "user");
			titleRevision = sessionManager.titleRevision;
			const stored = await persistence;
			if (!isCurrent()) return;
			if (!stored) {
				this.ctx.showError("会话名称不能为空。");
				return;
			}
			const name = sessionManager.getSessionName()!;
			this.ctx.showStatus(`会话已重命名为“${name}”。`);
		} catch (err) {
			if (!isCurrent()) return;
			this.ctx.showError(`重命名失败：${err instanceof Error ? err.message : String(err)}`);
		}
	}

	async handleBashCommand(command: string, excludeFromContext = false): Promise<void> {
		const isDeferred = this.ctx.session.isStreaming;
		const shouldPersistCwd = isPersistentShellCdCommand(command);
		if (isDeferred && shouldPersistCwd) {
			this.ctx.showWarning("更改目录之前，请等待当前响应完成或中止它。");
			return;
		}

		if (shouldPersistCwd) {
			await this.#withSessionMove(() => this.#executeBashCommand(command, excludeFromContext, isDeferred, true));
		} else {
			await this.#executeBashCommand(command, excludeFromContext, isDeferred, false);
		}
	}

	/** Returns whether shell execution committed a cwd relocation, not whether the shell command succeeded. */
	async #executeBashCommand(
		command: string,
		excludeFromContext: boolean,
		isDeferred: boolean,
		shouldPersistCwd: boolean,
	): Promise<boolean> {
		const component = new BashExecutionComponent(command, this.ctx.ui, excludeFromContext);
		this.ctx.bashComponent = component;
		let detachInput: (() => void) | undefined;
		let finished = false;

		if (isDeferred) {
			this.ctx.pendingMessagesContainer.addChild(this.ctx.bashComponent);
			this.ctx.pendingBashComponents.push(this.ctx.bashComponent);
		} else {
			this.ctx.present(this.ctx.bashComponent);
		}
		this.ctx.ui.requestRender();

		try {
			const result = await this.ctx.session.executeBash(
				command,
				chunk => {
					if (this.ctx.bashComponent) {
						this.ctx.bashComponent.appendOutput(chunk);
					}
				},
				{
					excludeFromContext,
					useUserShell: true,
					// User-shell zsh/fish `!` commands run on a headless PTY; raw
					// bytes render through the component's vterm replay (color-safe).
					pty: {
						...bashPtyViewport(this.ctx.ui),
						onChunk: chunk => this.ctx.bashComponent?.appendPtyChunk(chunk),
						onStdin: write => {
							if (finished) return;
							// A TSP field without a mode handles printable keys itself and sends
							// `edit` packets instead of raw input. Label it while the PTY owns
							// the keyboard so Tern delivers those keys to the input listener.
							detachInput = this.#forwardKeysToPty(component, write);
							this.ctx.editor.nativeKeyPassthrough = true;
							this.ctx.ui.requestRender();
						},
					},
				},
			);
			if (this.ctx.bashComponent) {
				const meta = outputMeta().truncationFromSummary(result, { direction: "tail" }).get();
				this.ctx.bashComponent.setComplete(result.exitCode, result.cancelled, {
					output: result.output,
					truncation: meta?.truncation,
					artifactError: meta?.artifactError,
					images: result.images,
					showImages: cfgTerminalShowImages.get(this.ctx.settings),
				});
			}
			try {
				if (shouldPersistCwd) return await this.#applyBashResultCwd(result);
			} catch (error) {
				this.ctx.showError(
					`Bash 命令已完成，但 OMP 更新其工作目录失败：${
						error instanceof Error ? error.message : "未知错误"
					}`,
				);
			}
		} catch (error) {
			if (this.ctx.bashComponent) {
				this.ctx.bashComponent.setComplete(undefined, false);
			}
			this.ctx.showError(`Bash 命令失败：${error instanceof Error ? error.message : "未知错误"}`);
		} finally {
			finished = true;
			detachInput?.();
			if (detachInput) this.ctx.editor.nativeKeyPassthrough = false;
			this.ctx.bashComponent = undefined;
			this.ctx.ui.requestRender();
		}
		return false;
	}

	/**
	 * Routes composer keystrokes to a running `!` command's PTY so it can answer
	 * its own prompts (`read`, shell-startup questions), like a foreground job.
	 * The interrupt key still cancels; focused dialogs and mouse reports keep
	 * their input. Returns the detach function.
	 */
	#forwardKeysToPty(component: BashExecutionComponent, write: (data: string) => void): () => void {
		return this.ctx.ui.addInputListener(
			data => {
				if (this.ctx.ui.getFocused() !== this.ctx.editor) return undefined;
				if (this.ctx.keybindings.matches(data, "app.interrupt") || parseSgrMouse(data)) return undefined;
				const bytes = component.encodePtyInput(data);
				if (bytes) write(bytes);
				return { consume: true };
			},
			{ prepend: true },
		);
	}

	async #applyBashResultCwd(result: BashResult): Promise<boolean> {
		if (result.cancelled || result.exitCode !== 0 || !result.workingDir) return false;
		if (!path.isAbsolute(result.workingDir)) return false;

		const resolvedPath = path.resolve(result.workingDir);
		if (resolvedPath === path.resolve(this.ctx.sessionManager.getCwd())) return false;

		let isDirectory = false;
		try {
			isDirectory = (await fs.stat(resolvedPath)).isDirectory();
		} catch {
			isDirectory = false;
		}
		if (!isDirectory) return false;

		return this.#relocateSession(resolvedPath);
	}

	async handlePythonCommand(code: string, excludeFromContext = false): Promise<void> {
		const isDeferred = this.ctx.session.isStreaming;
		this.ctx.pythonComponent = new EvalExecutionComponent(code, this.ctx.ui, excludeFromContext);

		if (isDeferred) {
			this.ctx.pendingMessagesContainer.addChild(this.ctx.pythonComponent);
			this.ctx.pendingPythonComponents.push(this.ctx.pythonComponent);
		} else {
			this.ctx.present(this.ctx.pythonComponent);
		}
		this.ctx.ui.requestRender();

		try {
			const result = await this.ctx.session.executePython(
				code,
				chunk => {
					if (this.ctx.pythonComponent) {
						this.ctx.pythonComponent.appendOutput(chunk);
					}
				},
				{ excludeFromContext },
			);

			if (this.ctx.pythonComponent) {
				const meta = outputMeta().truncationFromSummary(result, { direction: "tail" }).get();
				this.ctx.pythonComponent.setComplete(result.exitCode, result.cancelled, {
					output: result.output,
					truncation: meta?.truncation,
					artifactError: meta?.artifactError,
				});
			}
		} catch (error) {
			if (this.ctx.pythonComponent) {
				this.ctx.pythonComponent.setComplete(undefined, false);
			}
			this.ctx.showError(`Python 执行失败：${error instanceof Error ? error.message : "未知错误"}`);
		}

		this.ctx.pythonComponent = undefined;
		this.ctx.ui.requestRender();
	}

	async handleCompactCommand(
		customInstructions?: string,
		mode?: CompactMode,
		beforeFlush?: (outcome: CompactionOutcome) => void | Promise<void>,
		internalGuidance?: string,
	): Promise<CompactionOutcome> {
		const entries = this.ctx.sessionManager.getEntries();
		const messageCount = entries.filter(e => e.type === "message").length;

		if (messageCount < 2) {
			this.ctx.showWarning("没有可压缩的内容（尚无消息）");
			return "ok";
		}

		// `internalGuidance` is a private summarizer directive (plan-mode
		// "Approve and compact context") that MUST stay off the public
		// `customInstructions` channel of the `session_before_compact` extension
		// hook — extensions treat that field as user focus and would otherwise
		// bias the summary toward the plan boilerplate (issue #4359). Ride it
		// through as a CompactOptions field instead. That caller also dispatches
		// the execution turn itself, so the compaction must not resume the
		// plan-approval turn it aborted.
		if (internalGuidance) {
			return this.executeCompaction(
				{ internalGuidance, suppressContinuation: true, ...(mode ? { mode } : {}) },
				false,
				beforeFlush,
				mode,
			);
		}
		return this.executeCompaction(customInstructions, false, beforeFlush, mode);
	}

	/**
	 * TUI handler for `/shake`. `elide` drops heavy structural content,
	 * `images` strips image blocks, and `thinking` drops all thinking blocks.
	 * Rebuilds the chat and reports counts.
	 */
	async handleShakeCommand(mode: ShakeMode): Promise<void> {
		let result: ShakeResult;
		try {
			result = await this.ctx.session.shake(mode);
		} catch (error) {
			this.ctx.showError(`Shake 失败：${error instanceof Error ? error.message : String(error)}`);
			return;
		}

		const dropped =
			result.toolResultsDropped +
			result.blocksDropped +
			(result.imagesDropped ?? 0) +
			(result.thinkingBlocksDropped ?? 0);
		if (dropped === 0) {
			this.ctx.showStatus("没有可摇动的内容。");
			return;
		}
		this.ctx.rebuildChatFromMessages();
		this.ctx.statusLine.invalidate();
		this.ctx.ui.requestRender(true, { clearScrollback: true });
		this.ctx.showStatus(formatShakeSummary(result));
	}

	async executeCompaction(
		customInstructionsOrOptions?: string | CompactOptions,
		isAuto = false,
		beforeFlush?: (outcome: CompactionOutcome) => void | Promise<void>,
		mode?: CompactMode,
	): Promise<CompactionOutcome> {
		if (this.ctx.loadingAnimation) {
			this.ctx.loadingAnimation.stop();
			this.ctx.loadingAnimation = undefined;
		}
		this.ctx.statusContainer.disposeChildren();

		const cancelHint = `(${appKey(this.ctx.keybindings, "app.interrupt")} to cancel)`;
		const label = isAuto ? `正在自动压缩上下文... ${cancelHint}` : `正在压缩上下文... ${cancelHint}`;
		const compactingLoader = new Loader(
			this.ctx.ui,
			spinner => theme.fg("accent", spinner),
			text => theme.fg("muted", text),
			label,
			getSymbolTheme().spinnerFrames,
		);
		const compactionStartMs = Date.now();
		compactingLoader.setWorkingRow(
			() => ({
				label: isAuto ? "自动压缩上下文…" : "正在压缩上下文…",
				startedAt: compactionStartMs,
				variant: { kind: "compaction" },
				interruptKey: this.ctx.maintenanceInterruptKey(),
			}),
			() => this.ctx.interruptFromPointer(),
		);
		this.ctx.statusContainer.addChild(compactingLoader);
		this.ctx.ui.requestRender();

		let outcome: CompactionOutcome = "ok";
		try {
			const instructions = typeof customInstructionsOrOptions === "string" ? customInstructionsOrOptions : undefined;
			const baseOptions =
				customInstructionsOrOptions && typeof customInstructionsOrOptions === "object"
					? customInstructionsOrOptions
					: undefined;
			// The slash path passes `mode` positionally; the extension path carries
			// it inside the options object. Either source wins over no mode.
			const effectiveMode = mode ?? baseOptions?.mode;
			const options =
				baseOptions || effectiveMode
					? { ...baseOptions, ...(effectiveMode ? { mode: effectiveMode } : {}) }
					: undefined;
			await this.ctx.session.compact(instructions, options);

			compactingLoader.stop();
			this.ctx.statusContainer.disposeChildren();
			this.ctx.rebuildChatFromMessages({ reuseSettledComponents: true });

			this.ctx.statusLine.invalidate();
			// Same pairing as the auto-compaction arm in event-controller: the
			// rebuild clears the container's emission ledger, so every block
			// re-emits on this frame while the previous copy is still in native
			// scrollback — without a clear the collapse-disabled path appends a
			// duplicate transcript, exactly as `/compact` reproduced (#12140).
			this.ctx.ui.requestRender(true, { clearScrollback: true });
		} catch (error) {
			if (error instanceof CompactionCancelledError) {
				outcome = "cancelled";
				this.ctx.showError("压缩已取消");
			} else {
				outcome = "failed";
				const message = error instanceof Error ? error.message : String(error);
				this.ctx.showError(`压缩失败：${message}`);
			}
		} finally {
			compactingLoader.stop();
			this.ctx.statusContainer.disposeChildren();
		}
		// Run the caller's pre-flush hook (e.g. the plan-approval model transition)
		// before queued user input is dispatched, so any turn queued during
		// compaction executes on the post-compaction model rather than the model
		// compaction itself ran on.
		if (beforeFlush) await beforeFlush(outcome);
		await this.ctx.flushCompactionQueue({ willRetry: false });
		return outcome;
	}

	async handleHandoffCommand(customInstructions?: string): Promise<void> {
		if (this.ctx.session.isStreaming) {
			this.ctx.showWarning("请等待当前响应完成或中止后再进行交接。");
			return;
		}
		if (this.ctx.session.isCompacting) {
			this.ctx.showWarning("请等待上下文压缩完成或取消后再进行交接。");
			return;
		}

		const entries = this.ctx.sessionManager.getEntries();
		const messageCount = entries.filter(e => e.type === "message").length;

		if (messageCount < 2) {
			this.ctx.showWarning("无可交接内容（尚无消息）");
			return;
		}

		if (this.ctx.loadingAnimation) {
			this.ctx.loadingAnimation.stop();
			this.ctx.loadingAnimation = undefined;
		}
		this.ctx.statusContainer.disposeChildren();

		const handoffLoader = new Loader(
			this.ctx.ui,
			spinner => theme.fg("accent", spinner),
			text => theme.fg("muted", text),
			`Generating handoff… (${appKey(this.ctx.keybindings, "app.interrupt")} to cancel)`,
			getSymbolTheme().spinnerFrames,
		);
		this.ctx.statusContainer.addChild(handoffLoader);
		this.ctx.ui.requestRender();

		try {
			// Handoff generation runs as a oneshot request; the document is then
			// committed as a compaction entry on this session.
			const result = await this.ctx.session.handoff(customInstructions);

			if (!result) {
				this.ctx.showError("交接已取消");
				return;
			}

			// Rebuild chat from the session, which now shows the handoff compaction divider.
			this.ctx.clearTransientSessionUi();
			await this.ctx.renderInitialMessages();
			this.ctx.statusLine.invalidate();
			this.ctx.updateEditorBorderColor();
			await this.ctx.reloadTodos();

			this.ctx.present([
				new Spacer(1),
				new Text(
					`${theme.fg("accent", `${theme.status.success} 上下文已交接并就地压缩`)}`,
					1,
					1,
				),
			]);
			if (result.savedPath) {
				this.ctx.showStatus(`交接文档已保存至：${result.savedPath}`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			// `session.handoff()` normalizes genuine cancellations to this exact message; a
			// provider error (even one named AbortError) is re-thrown verbatim so it surfaces
			// as a real failure instead of a false "cancelled".
			if (message === "Handoff cancelled") {
				this.ctx.showError("交接已取消");
			} else {
				// Persist the real failure so it is debuggable after the transient
				// TUI error clears (#7993).
				logger.error("Handoff failed", { error: message });
				this.ctx.showError(`交接失败：${message}`);
			}
		} finally {
			this.#finishHandoffUi(handoffLoader);
			await this.ctx.flushCompactionQueue({ willRetry: false });
		}
		this.ctx.ui.requestRender(true, { clearScrollback: true });
	}

	#finishHandoffUi(handoffLoader: Loader): void {
		handoffLoader.stop();
		// A retry/compaction event may replace the handoff overlay while transcript
		// replay yields. Preserve it only while it still owns the status row; a
		// reference to a loader disposed earlier must not retain the handoff overlay.
		const maintenanceLoader = this.ctx.autoCompactionLoader ?? this.ctx.retryLoader;
		if (maintenanceLoader && this.ctx.statusContainer.children.includes(maintenanceLoader)) return;
		this.ctx.statusContainer.disposeChildren();
		// `disposeChildren()` disposed any working loader mounted by a delayed
		// `agent_start` during transcript replay, which stops its animation timer.
		// Drop the now-frozen reference so the reconciler below never reattaches it
		// (`ensureLoadingAnimation()` only re-adds an existing instance, never
		// restarts it).
		if (this.ctx.loadingAnimation) {
			this.ctx.loadingAnimation.stop();
			this.ctx.loadingAnimation = undefined;
		}
		if (this.ctx.session.isStreaming) {
			// A new turn won the race with handoff cleanup; mount a fresh, running
			// loader for it now that the stale reference is cleared.
			this.ctx.ensureLoadingAnimation();
		}
	}
}

const BAR_WIDTH_MAX = 24;
const COLUMN_WIDTH_MIN = 4;

function renderJobLine(job: AsyncJobSnapshotItem, now: number): string {
	const duration = formatDuration(Math.max(0, (job.endTime ?? now) - job.startTime));
	const status = formatJobStatus(job.status);
	return `${theme.fg("dim", job.id)} ${theme.fg("dim", `[${job.type}]`)} ${status} ${theme.fg("dim", `(${duration})`)}`;
}

function formatJobStatus(status: AsyncJobSnapshotItem["status"]): string {
	if (status === "running") return theme.fg("warning", "运行中");
	if (status === "completed") return theme.fg("success", "已完成");
	if (status === "cancelled") return theme.fg("dim", "已取消");
	return theme.fg("error", "失败");
}

function truncateJobLabel(label: string, maxWidth: number): string {
	if (visibleWidth(label) <= maxWidth) return label;
	if (maxWidth <= 1) return "…";

	let out = "";
	for (const char of label) {
		const next = `${out}${char}`;
		if (visibleWidth(`${next}…`) > maxWidth) break;
		out = next;
	}

	return `${out}…`;
}

function formatNumber(value: number, maxFractionDigits = 1): string {
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFractionDigits }).format(value);
}

function resolveProviderAuthMode(authStorage: AuthStorage, provider: string): string {
	if (authStorage.credentials.hasOAuth(provider)) {
		return "oauth";
	}
	if (authStorage.credentials.has(provider)) {
		return "api key";
	}
	if (getEnvApiKey(provider)) {
		return "env api key";
	}
	if (authStorage.keys.source(provider) !== undefined) {
		return "runtime/fallback";
	}
	return "unknown";
}

export function renderProviderSection(details: ProviderDetails, uiTheme: Pick<Theme, "fg">): string {
	const lines: string[] = [];
	lines.push(`${uiTheme.fg("dim", "名称：")} ${details.provider}`);
	for (const field of details.fields) {
		lines.push(`${uiTheme.fg("dim", `${field.label}:`)} ${field.value}`);
	}
	return `${lines.join("\n")}\n`;
}

function resolveProviderUsageTotal(reports: UsageReport[]): number {
	return reports
		.flatMap(report => report.limits)
		.map(limit => resolveUsedFraction(limit) ?? 0)
		.reduce((sum, value) => sum + value, 0);
}

function formatWindowSuffix(label: string, windowLabel: string, uiTheme: Theme): string {
	const normalizedLabel = label.toLowerCase();
	const normalizedWindow = windowLabel.toLowerCase();
	if (normalizedWindow === "quota window") return "";
	if (normalizedLabel.includes(normalizedWindow)) return "";
	return uiTheme.fg("dim", `(${windowLabel})`);
}

/** ` (org)` suffix for providers whose orgName is an organization. */
function orgSuffix(report: UsageReport): string {
	const orgName = report.metadata?.orgName;
	const orgId = report.metadata?.orgId;
	const org = typeof orgName === "string" && orgName ? orgName : typeof orgId === "string" ? orgId : undefined;
	return org ? ` (${org})` : "";
}

/** Keep the existing TUI `(plan)` layout while using the live Codex usage plan. */
function formatCodexTuiLabel(report: UsageReport, peers: readonly UsageReport[], base: string): string {
	const identity = formatCodexUsageReportLabel(report, peers, base, undefined, false);
	const plan = codexUsagePlan(report);
	return plan ? `${identity} (${plan})` : identity;
}

function formatAccountLabel(
	limit: UsageLimit,
	report: UsageReport,
	peers: readonly UsageReport[],
	index: number,
): string {
	const codex = report.provider === "openai-codex";
	const email = report.metadata?.email;
	if (typeof email === "string" && email)
		return codex ? formatCodexTuiLabel(report, peers, email) : `${email}${orgSuffix(report)}`;
	const accountId =
		typeof report.metadata?.accountId === "string" && report.metadata.accountId
			? report.metadata.accountId
			: limit.scope.accountId || undefined;
	if (accountId) return codex ? formatCodexTuiLabel(report, peers, accountId) : `${accountId}${orgSuffix(report)}`;
	const projectId =
		typeof report.metadata?.projectId === "string" && report.metadata.projectId
			? report.metadata.projectId
			: limit.scope.projectId || undefined;
	const base = typeof projectId === "string" && projectId ? projectId : `account ${index + 1}`;
	return codex ? formatCodexTuiLabel(report, peers, base) : base;
}

function formatUnlimitedReportLabel(report: UsageReport, peers: readonly UsageReport[], index: number): string {
	const email = report.metadata?.email;
	if (typeof email === "string" && email)
		return report.provider === "openai-codex"
			? formatCodexTuiLabel(report, peers, email)
			: `${email}${orgSuffix(report)}`;
	const accountId = report.metadata?.accountId;
	if (typeof accountId === "string" && accountId)
		return report.provider === "openai-codex"
			? formatCodexTuiLabel(report, peers, accountId)
			: `${accountId}${orgSuffix(report)}`;
	const projectId = report.metadata?.projectId;
	const base = typeof projectId === "string" && projectId ? projectId : `account ${index + 1}`;
	return report.provider === "openai-codex" ? formatCodexTuiLabel(report, peers, base) : base;
}

function formatResetShort(limit: UsageLimit, nowMs: number): string | undefined {
	const resetsAt = limit.window?.resetsAt;
	if (resetsAt === undefined) return undefined;
	// Codex returns the prior window's reset_at until a new request opens a fresh window —
	// rendering a negative delta is meaningless, so drop the suffix in that case.
	if (resetsAt <= nowMs) return undefined;
	return formatDuration(resetsAt - nowMs);
}

function formatAccountHeaderRow(
	limits: UsageLimit[],
	reports: UsageReport[],
	peers: readonly UsageReport[],
	nowMs: number,
	columnWidth: number,
	uiTheme: Theme,
	activeAccount?: OAuthAccountIdentity,
): string[] {
	const parts = limits.map((limit, index) => {
		const reset = formatResetShort(limit, nowMs);
		const report = reports[index];
		const active = report !== undefined && limitMatchesActiveAccount(report, limit, activeAccount);
		const label = formatAccountLabel(limit, report, peers, index);
		return {
			label: active ? `● ${label}` : label,
			suffix: reset ? `(${reset})` : "",
			active,
			daybreak: report?.metadata?.daybreak === true,
		};
	});
	const maxSuffixWidth = parts.reduce((max, p) => Math.max(max, visibleWidth(p.suffix)), 0);
	const gap = maxSuffixWidth > 0 ? 1 : 0;
	const prefixBudget = columnWidth - maxSuffixWidth - gap;

	// If suffix can't share the cell with at least `x…`, fall back to whole-label truncation.
	if (prefixBudget < 2) {
		return parts.map(p => {
			const full = `${p.label}${p.daybreak ? " daybreak" : ""}${p.suffix ? ` ${p.suffix}` : ""}`;
			const cell = padColumn(truncateJobLabel(full, columnWidth), columnWidth);
			return p.active ? uiTheme.fg("accent", cell) : cell;
		});
	}

	return parts.map(p => {
		// Keep the full badge visible by taking its columns from the account label.
		const badge = p.daybreak && prefixBudget >= 10 ? " daybreak" : "";
		const label = truncateJobLabel(p.label, prefixBudget - visibleWidth(badge));
		const prefix = `${p.active ? uiTheme.fg("accent", label) : label}${badge ? uiTheme.fg("success", badge) : ""}`;
		const prefixCell = prefix + " ".repeat(prefixBudget - visibleWidth(prefix));
		if (!p.suffix) return prefixCell + " ".repeat(maxSuffixWidth + gap);
		const suffixPad = " ".repeat(maxSuffixWidth - visibleWidth(p.suffix));
		return `${prefixCell} ${suffixPad}${uiTheme.fg("dim", p.suffix)}`;
	});
}

function padColumn(text: string, width: number): string {
	const visible = visibleWidth(text);
	if (visible >= width) return text;
	return `${text}${padding(width - visible)}`;
}

type AggregateDisplayStatus = NonNullable<UsageLimit["status"]> | "neutral";

function resolveAggregateStatus(limits: UsageLimit[]): AggregateDisplayStatus {
	const hasOk = limits.some(limit => limit.status === "ok");
	const hasWarning = limits.some(limit => limit.status === "warning");
	const hasExhausted = limits.some(limit => limit.status === "exhausted");
	if (!hasOk && !hasWarning && !hasExhausted) {
		return limits.length > 0 && limits.every(isUsedOnlyAbsoluteAmount) ? "neutral" : "unknown";
	}
	if (hasOk) {
		return hasWarning || hasExhausted ? "warning" : "ok";
	}
	if (hasWarning) return "warning";
	return "exhausted";
}

function formatAggregateAmount(limits: UsageLimit[]): string {
	const fractions = limits
		.map(limit => resolveUsedFraction(limit))
		.filter((value): value is number => value !== undefined);
	if (fractions.length === limits.length && fractions.length > 0) {
		const sum = fractions.reduce((total, value) => total + value, 0);
		const avgRemaining = Math.max(0, ((limits.length - sum) / limits.length) * 100);
		return `${formatNumber(avgRemaining)}% free`;
	}

	const amounts = limits
		.map(limit => limit.amount)
		.filter(amount => amount.used !== undefined && amount.limit !== undefined && amount.limit > 0);
	if (amounts.length === limits.length && amounts.length > 0) {
		const totalUsed = amounts.reduce((sum, amount) => sum + (amount.used ?? 0), 0);
		const totalLimit = amounts.reduce((sum, amount) => sum + (amount.limit ?? 0), 0);
		const remainingPct = totalLimit > 0 ? Math.max(0, 100 - (totalUsed / totalLimit) * 100) : 0;
		return `${formatNumber(remainingPct)}% free`;
	}

	if (limits.length > 0 && limits.every(isUsedOnlyAbsoluteAmount)) return "";

	// Prepaid balances have no total to divide by. `totalRemainingOnly`
	// collapses account-wide pools seen once per stored key and sums only
	// genuinely distinct ones, so a multi-key provider is never double-counted.
	const remaining = formatRemainingOnlyTotal(limits);
	if (remaining !== undefined) return remaining;

	// Count unique accounts from limit scopes — not limits.length.
	const uniqueAccountIds = new Set(
		limits.map(limit => limit.scope.accountId).filter((id): id is string => typeof id === "string" && id.length > 0),
	);
	if (uniqueAccountIds.size > 0) return `${uniqueAccountIds.size} ${uniqueAccountIds.size === 1 ? "acct" : "accts"}`;
	// No account IDs available — keep the pre-existing fallback so providers
	// that don't populate scope.accountId still show a summary.
	return `${limits.length} accts`;
}

function resolveResetRange(limits: UsageLimit[], nowMs: number): string | null {
	const windows = limits
		.map(limit => limit.window)
		.filter(
			(window): window is NonNullable<UsageLimit["window"]> =>
				window?.resetsAt !== undefined && Number.isFinite(window.resetsAt) && window.resetsAt > nowMs,
		);
	if (windows.length === 0) return null;
	// Use the shared verb when every contributing window agrees (e.g. all "tick");
	// mixed or absent labels fall back to the generic "resets".
	const labels = new Set(windows.map(window => window.resetLabel ?? "resets"));
	const verb = labels.size === 1 ? [...labels][0]! : "resets";
	const offsets = windows.map(window => window.resetsAt! - nowMs);
	const minReset = Math.min(...offsets);
	const maxReset = Math.max(...offsets);
	if (maxReset - minReset > 60_000) {
		return `${verb} in ${formatDuration(minReset)}–${formatDuration(maxReset)}`;
	}
	return `${verb} in ${formatDuration(minReset)}`;
}

function resolveStatusIcon(status: AggregateDisplayStatus, uiTheme: Theme): string {
	if (status === "neutral") return uiTheme.fg("dim", uiTheme.status.info);
	if (status === "exhausted") return uiTheme.fg("error", uiTheme.status.error);
	if (status === "warning") return uiTheme.fg("warning", uiTheme.status.warning);
	if (status === "ok") return uiTheme.fg("success", uiTheme.status.success);
	return uiTheme.fg("dim", uiTheme.status.pending);
}

function resolveStatusColor(status: UsageLimit["status"]): "success" | "warning" | "error" | "dim" {
	if (status === "exhausted") return "error";
	if (status === "warning") return "warning";
	if (status === "ok") return "success";
	return "dim";
}

function renderUsageBar(limit: UsageLimit, uiTheme: Theme, barWidth: number): string {
	const usedAmount = limit.amount.used;
	if (usedAmount !== undefined && isUsedOnlyAbsoluteAmount(limit)) {
		const used =
			limit.amount.unit === "usd"
				? `$${usedAmount.toFixed(2)}`
				: `${formatNumber(usedAmount, 2)} ${limit.amount.unit}`;
		return uiTheme.fg("dim", truncateJobLabel(`${used} used`, barWidth));
	}
	const fraction = resolveUsedFraction(limit);
	if (fraction === undefined) {
		return uiTheme.fg("dim", "·".repeat(barWidth));
	}
	const clamped = Math.min(Math.max(fraction, 0), 1);
	const exact = clamped * barWidth;
	const fullCells = Math.floor(exact);
	const remainder = exact - fullCells;
	let partial = "";
	if (remainder >= 2 / 3) partial = "▓";
	else if (remainder >= 1 / 3) partial = "▒";
	const leading = "█".repeat(fullCells) + partial;
	const empty = "░".repeat(Math.max(0, barWidth - fullCells - (partial ? 1 : 0)));
	const color = resolveStatusColor(limit.status);
	return `${uiTheme.fg(color, leading)}${uiTheme.fg("dim", empty)}`;
}

/**
 * Pick a per-account column width so the columns and trailing amount fit in `available`.
 * Falls back to the minimum when the terminal is too narrow rather than wrapping.
 */
function resolveColumnWidth(count: number, available: number, trailing: number): number {
	if (count <= 0) return BAR_WIDTH_MAX;
	const indent = 2;
	const gaps = count - 1;
	const spaceForBars = available - indent - gaps - (trailing > 0 ? trailing + 1 : 0);
	const ideal = Math.floor(spaceForBars / count);
	if (ideal < COLUMN_WIDTH_MIN) return COLUMN_WIDTH_MIN;
	return ideal;
}

export function renderUsageReports(
	reports: UsageReport[],
	uiTheme: Theme,
	nowMs: number,
	availableWidth: number,
	resolveActiveAccount?: (provider: string) => OAuthAccountIdentity | undefined,
	usageModelSelectors: readonly string[] = [],
	unavailableAccounts: readonly UnavailableUsageAccount[] = [],
): string {
	const displayReports = collapseSharedUsageReports(reports);
	const lines: string[] = [];
	const latestFetchedAt = Math.max(0, ...reports.map(report => report.fetchedAt ?? 0));
	const headerSuffix = latestFetchedAt ? ` (${formatDuration(nowMs - latestFetchedAt)} ago)` : "";
	lines.push(uiTheme.bold(uiTheme.fg("accent", `使用情况${headerSuffix}`)));
	const grouped = new Map<string, UsageReport[]>();
	for (const report of displayReports) {
		const list = grouped.get(report.provider) ?? [];
		list.push(report);
		grouped.set(report.provider, list);
	}
	for (const account of unavailableAccounts) {
		if (!grouped.has(account.provider)) grouped.set(account.provider, []);
	}
	const providerEntries = Array.from(grouped.entries())
		.map(([provider, providerReports]) => ({
			provider,
			providerReports,
			totalUsage: resolveProviderUsageTotal(providerReports),
		}))
		.sort((a, b) => {
			if (a.totalUsage !== b.totalUsage) return a.totalUsage - b.totalUsage;
			return a.provider.localeCompare(b.provider);
		});

	for (const { provider, providerReports } of providerEntries) {
		lines.push("");
		const providerName = formatProviderName(provider);
		const activeAccount = resolveActiveAccount?.(provider);

		const limitGroups = new Map<
			string,
			{ label: string; windowLabel: string; limits: UsageLimit[]; reports: UsageReport[] }
		>();
		for (const report of providerReports) {
			for (const limit of report.limits) {
				const windowId = limit.window?.id ?? limit.scope.windowId ?? "default";
				// Distinct buckets can share a label and window (Antigravity's Gemini
				// vs Gemini (Argon) weekly) and must stay separate rows instead of
				// averaging into "50% free", so the id joins the key. Label and window
				// stay in it too: some providers build ids positionally or per plan
				// (kimi's `${index}`, copilot's allowance), where ids differ across
				// accounts for the same quota. `sharedGroup` keeps the routing copies
				// of one shared bucket together.
				const key = limit.scope.sharedGroup ?? `${formatLimitTitle(limit)}|${windowId}|${limit.id}`;
				const windowLabel = limit.window?.label ?? windowId;
				const entry = limitGroups.get(key) ?? {
					label: formatLimitTitle(limit),
					windowLabel,
					limits: [],
					reports: [],
				};
				entry.limits.push(limit);
				entry.reports.push(report);
				limitGroups.set(key, entry);
			}
		}

		lines.push(uiTheme.bold(uiTheme.fg("accent", providerName)));
		const activeReport =
			provider === "openai-codex" && activeAccount
				? ((activeAccount.accountId
						? providerReports.find(
								report =>
									report.metadata?.orgId === activeAccount.orgId &&
									report.metadata?.accountId === activeAccount.accountId,
							)
						: undefined) ??
					providerReports.find(
						report =>
							report.metadata?.orgId === activeAccount.orgId &&
							!!activeAccount.email &&
							report.metadata?.email === activeAccount.email &&
							(!activeAccount.accountId || !report.metadata?.accountId),
					))
				: undefined;
		const activeAccountLabel =
			provider === "openai-codex"
				? activeReport
					? formatCodexTuiLabel(
							activeReport,
							providerReports,
							activeAccount?.email || activeAccount?.accountId || "account",
						)
					: activeAccount?.email || activeAccount?.accountId || activeAccount?.projectId
				: formatActiveAccountLabel(activeAccount);
		if (activeAccountLabel) {
			lines.push(`  ${uiTheme.fg("accent", "此会话正在使用：")} ${activeAccountLabel}`);
		}
		const reportingModels = usageModelSelectors.filter(selector => selector.startsWith(`${provider}/`));
		if (reportingModels.length > 0) {
			lines.push(`  ${uiTheme.fg("accent", "具有使用数据的模型")}`);
			for (const selector of reportingModels) {
				lines.push(`    ${replaceTabs(truncateToWidth(sanitizeText(selector), availableWidth - 4))}`);
			}
		}
		for (const account of unavailableAccounts) {
			if (account.provider !== provider) continue;
			const label = replaceTabs(sanitizeText(account.label.replace(/[\r\n]+/g, " ")));
			const status = " — usage unavailable";
			const boundedLabel = truncateToWidth(label, Math.max(0, availableWidth - 2 - visibleWidth(status)));
			lines.push(`  ${uiTheme.fg("dim", truncateToWidth(`${boundedLabel}${status}`, availableWidth - 2))}`);
		}

		// Provider-wide disclaimers (e.g. "OMP-observed spend only") render once
		// above the per-account sections instead of duplicating onto every limit.
		const providerNotes = [...new Set(providerReports.flatMap(report => report.notes ?? []))];
		if (providerNotes.length > 0) {
			lines.push(
				`  ${uiTheme.fg("dim", replaceTabs(truncateToWidth(sanitizeText(providerNotes.map(n => n.replace(/[\r\n]+/g, " ")).join(" • ")), 110)))}`.trimEnd(),
			);
		}

		const resetAccountLines: string[] = [];
		for (const report of providerReports) {
			const resets = summarizeUsageResetCredits(report.resetCredits, nowMs);
			if (!resets || resets.bankedCount <= 0) continue;
			const identityLabel =
				typeof report.metadata?.email === "string" && report.metadata.email
					? report.metadata.email
					: typeof report.metadata?.accountId === "string" && report.metadata.accountId
						? report.metadata.accountId
						: "account";
			const orgName = report.metadata?.orgName;
			const orgId = report.metadata?.orgId;
			const orgLabel =
				typeof orgName === "string" && orgName ? orgName : typeof orgId === "string" ? orgId : undefined;
			const rawLabel =
				provider === "openai-codex"
					? formatCodexTuiLabel(report, providerReports, identityLabel)
					: orgLabel && orgLabel !== identityLabel
						? `${identityLabel} (${orgLabel})`
						: identityLabel;
			const label = sanitizeText(rawLabel.replace(/[\r\n\t]+/g, " "));
			const activeOrg = activeAccount?.orgId;
			const reportOrg = typeof report.metadata?.orgId === "string" ? report.metadata.orgId : undefined;
			const orgMatches = !activeOrg && !reportOrg ? true : activeOrg === reportOrg;
			const isActive =
				provider === "openai-codex"
					? activeReport === report
					: orgMatches &&
						!!activeAccount &&
						((!!activeAccount.accountId && activeAccount.accountId === report.metadata?.accountId) ||
							(!!activeAccount.email && activeAccount.email === report.metadata?.email));
			const availability =
				resets.redeemableCount === resets.bankedCount ? "" : ` · ${resets.redeemableCount} usable now`;
			resetAccountLines.push(
				`    • ${label}: ${resets.bankedCount} saved reset${resets.bankedCount === 1 ? "" : "s"}${availability}${isActive ? " (active)" : ""}`,
			);
			if (resets.soonestExpiry) {
				const expiryMs = Date.parse(resets.soonestExpiry);
				const remaining = expiryMs - nowMs;
				const expiryDate = resets.soonestExpiry.slice(0, 10);
				if (remaining > 0) {
					resetAccountLines.push(`        soonest expires in ${formatDuration(remaining)} (${expiryDate})`);
				} else {
					resetAccountLines.push(`        expired (${expiryDate})`);
				}
			}
			if (resets.redeemableCount === 0 && resets.unavailableReason) {
				const reason = sanitizeText(resets.unavailableReason.replace(/[\r\n\t]+/g, " "));
				resetAccountLines.push(`        unavailable: ${reason}`);
			}
		}
		if (resetAccountLines.length > 0) {
			lines.push(
				`  ${uiTheme.fg("accent", "已保存速率限制重置")} ${uiTheme.fg("dim", "(/usage 重置以消费)")}`,
			);
			for (const line of resetAccountLines) lines.push(uiTheme.fg("dim", line));
		}

		// Order account columns ONCE per provider (worst-first), then apply that
		// same order to every window group. Sorting each group independently by
		// its own used fraction (issue #6067) desynchronized the columns: an
		// account exhausted on its 5h window but light on the weekly window would
		// land in different column positions on each row, so the positional
		// `account N` labels denoted different credentials per row and an
		// exhausted limit appeared under a sibling that still had quota.
		const accountRank = new Map<UsageReport, number>();
		providerReports.forEach((report, position) => {
			const worst = report.limits.reduce((max, limit) => {
				const fraction = resolveUsedFraction(limit) ?? -1;
				return fraction > max ? fraction : max;
			}, -1);
			// Encode worst-first primary key with the stable position as tiebreak
			// so accounts tied on pressure keep their discovery order.
			accountRank.set(report, -worst * 1000 + position);
		});

		const renderableGroups = Array.from(limitGroups.values()).map(group => {
			const entries = group.limits.map((limit, index) => ({
				limit,
				report: group.reports[index],
				index,
			}));
			entries.sort((a, b) => {
				const aRank = accountRank.get(a.report) ?? a.index;
				const bRank = accountRank.get(b.report) ?? b.index;
				if (aRank !== bRank) return aRank - bRank;
				return a.index - b.index;
			});
			const sortedLimits = entries.map(entry => entry.limit);
			const sortedReports = entries.map(entry => entry.report);
			return { group, sortedLimits, sortedReports, amountText: formatAggregateAmount(sortedLimits) };
		});

		const sectionCount = renderableGroups.reduce((max, g) => Math.max(max, g.sortedLimits.length), 0);
		const sectionTrailing = renderableGroups.reduce((max, g) => Math.max(max, visibleWidth(g.amountText)), 0);
		const sectionColumnWidth = resolveColumnWidth(sectionCount, availableWidth, sectionTrailing);
		const sectionBarWidth = Math.min(sectionColumnWidth, BAR_WIDTH_MAX);

		for (const { group, sortedLimits, sortedReports, amountText } of renderableGroups) {
			const status = resolveAggregateStatus(sortedLimits);
			const statusIcon = resolveStatusIcon(status, uiTheme);

			const windowSuffix = formatWindowSuffix(group.label, group.windowLabel, uiTheme);
			lines.push(`${statusIcon} ${uiTheme.bold(group.label)} ${windowSuffix}`.trim());
			const accountLabels = formatAccountHeaderRow(
				sortedLimits,
				sortedReports,
				providerReports,
				nowMs,
				sectionColumnWidth,
				uiTheme,
				activeAccount,
			);
			lines.push(`  ${accountLabels.join(" ")}`.trimEnd());
			const bars = sortedLimits.map(limit =>
				padColumn(renderUsageBar(limit, uiTheme, sectionBarWidth), sectionColumnWidth),
			);
			lines.push(`  ${bars.join(" ")} ${amountText}`.trimEnd());
			const resetText = sortedLimits.length <= 1 ? resolveResetRange(sortedLimits, nowMs) : null;
			if (resetText) {
				lines.push(`  ${uiTheme.fg("dim", resetText)}`.trimEnd());
			}
			const notes = [...new Set(sortedLimits.flatMap(limit => limit.notes ?? []))];
			if (notes.length > 0) {
				lines.push(
					`  ${uiTheme.fg("dim", replaceTabs(truncateToWidth(sanitizeText(notes.map(n => n.replace(/[\r\n]+/g, " ")).join(" • ")), 110)))}`.trimEnd(),
				);
			}
		}

		// Render accounts with no rate limits (e.g. business/enterprise plans).
		const unlimitedReports = providerReports.filter(report => report.limits.length === 0);
		for (const report of unlimitedReports) {
			const label = formatUnlimitedReportLabel(report, providerReports, 0);
			const tier = report.provider === "openai-codex" ? undefined : report.metadata?.planType;
			const tierSuffix = typeof tier === "string" && tier ? ` ${uiTheme.fg("dim", `(${tier})`)}` : "";
			const daybreakSuffix = report.metadata?.daybreak === true ? uiTheme.fg("success", " 破晓") : "";
			lines.push(
				`${uiTheme.fg("success", uiTheme.status.success)} ${label}${daybreakSuffix}${tierSuffix} ${uiTheme.fg("dim", "-- 无限制")}`,
			);
		}
		// No per-provider footer; global header shows last check.
	}

	return lines.join("\n");
}
