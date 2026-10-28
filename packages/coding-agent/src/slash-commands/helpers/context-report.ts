import { computeSessionContextBreakdown } from "../../session/context-usage-runtime";
import type { SlashCommandRuntime } from "../types";
import { renderAsciiBar } from "@oh-my-pi/pi-tui/chrome/format";

/**
 * Build the `/context` ACP-mode text. Tries the rich breakdown first
 * (categories + auto-compact buffer + free slack) and falls back to the
 * minimal "window/used" lines when the breakdown helper throws.
 */
export function buildContextReportText(runtime: SlashCommandRuntime): string {
	try {
		const breakdown = computeSessionContextBreakdown(runtime.session, { snapcompactSavings: true });
		if (breakdown.contextWindow <= 0) {
			return "上下文用量不可用：此会话未选择模型。";
		}
		const usedPct = Math.round((breakdown.usedTokens / breakdown.contextWindow) * 100);
		const lines = [`上下文窗口：${breakdown.contextWindow} 个令牌（已使用 ${usedPct}%）`];
		for (const category of breakdown.categories) {
			if (category.tokens === 0) continue;
			const fraction = category.tokens / breakdown.contextWindow;
			lines.push(`  ${category.label.padEnd(16)} ${renderAsciiBar(fraction)}  ${category.tokens} 个令牌`);
		}
		if (breakdown.autoCompactBufferTokens > 0) {
			const fraction = breakdown.autoCompactBufferTokens / breakdown.contextWindow;
			lines.push(
				`  ${"自动压缩缓冲".padEnd(16)} ${renderAsciiBar(fraction)}  ${breakdown.autoCompactBufferTokens} 个 Token`,
			);
		}
		if (breakdown.freeTokens > 0) {
			const fraction = breakdown.freeTokens / breakdown.contextWindow;
			lines.push(`  ${"空闲".padEnd(16)} ${renderAsciiBar(fraction)}  ${breakdown.freeTokens} 个 Token`);
		}
		const snap = breakdown.snapcompact;
		if (snap) {
			if (!snap.visionCapable) {
				lines.push("Snapcompact：未启用（模型无图像输入）");
			} else {
				lines.push("Snapcompact（预计传输节省）：");
				if (snap.systemPrompt) {
					const sp = snap.systemPrompt;
					lines.push(
						sp.applied
							? `  系统提示词：${sp.textTokens} 个文本 Token → ${sp.frames} 帧${sp.frames === 1 ? "" : ""} ≈ ${sp.imageTokens} 个 Token（节省约 ${sp.savedTokens}）`
							: "  系统提示词：仍为文本（无净节省）",
					);
				}
				if (snap.toolResults) {
					const tr = snap.toolResults;
					lines.push(
						tr.swapped > 0
							? `  工具结果：${tr.swapped}/${tr.total} 已图像化，${tr.textTokens} 个文本 Token → ${tr.frames} 帧 ≈ ${tr.imageTokens} 个 Token（节省约 ${tr.savedTokens}）`
							: `  工具结果：无已图像化项（历史中共 ${tr.total} 项）`,
					);
				}
				if (snap.savedTokens > 0) {
					lines.push(`  预计下一次请求：线上约 ${breakdown.usedTokens - snap.savedTokens} 个令牌`);
				}
			}
		}
		return lines.join("\n");
	} catch {
		const fallback = runtime.session.getContextUsage();
		if (!fallback) return "上下文使用情况不可用。";
		return ["上下文", `窗口：${fallback.contextWindow}`, `已使用：${fallback.tokens ?? 0}`].join("\n");
	}
}
