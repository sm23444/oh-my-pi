/** Context snapshot shapes shared by the session snapshot builder and the context viewer. */
import type { ContextBreakdown } from "../status-line/context-usage";

interface ContextCategoryDescriptor {
	readonly id: string;
	readonly label: string;
	/** Overview row label when the Overview weight differs from the category's content. */
	readonly overviewLabel?: string;
	/** Listed with its weight but never opened. */
	readonly openable?: false;
}

/** Context categories in display order. */
export const CONTEXT_CATEGORIES = [
	// The Overview weight excludes the Skills listing; content views keep complete system blocks.
	{ id: "system-prompt", label: "系统提示词", overviewLabel: "System Prompt (excluding Skills)" },
	// An estimate of the prompt's skill listing, without entries of its own.
	{ id: "skills", label: "技能", openable: false },
	{ id: "built-in-tools", label: "内置工具" },
	{ id: "custom-tools", label: "自定义工具" },
	{ id: "user-messages", label: "用户 / 开发者消息" },
	{ id: "assistant-messages", label: "助手消息" },
	{ id: "assistant-thinking", label: "助手思考" },
	{ id: "tool-calls", label: "工具调用" },
	{ id: "tool-output", label: "工具输出" },
] as const satisfies readonly ContextCategoryDescriptor[];

export type ContextCategoryId = (typeof CONTEXT_CATEGORIES)[number]["id"];

const DESCRIPTORS_BY_ID = new Map<ContextCategoryId, ContextCategoryDescriptor>(
	CONTEXT_CATEGORIES.map(descriptor => [descriptor.id, descriptor]),
);

/** Descriptor of a category id: its label, optional Overview label, and whether it can be opened. */
export function contextCategoryDescriptor(id: ContextCategoryId): ContextCategoryDescriptor {
	return DESCRIPTORS_BY_ID.get(id)!;
}

export interface ContextThinkingGroup {
	readonly id: string;
	readonly label: string;
	readonly tokens: number;
	readonly interrupted?: boolean;
}

export interface ContextViewEntry {
	readonly id: string;
	readonly label: string;
	readonly text: string;
	/** Aggregation weight for the unscaled replay estimate; shared blocks contribute through their group. */
	readonly tokens: number;
	readonly interrupted?: boolean;
	readonly thinkingGroup?: ContextThinkingGroup;
	readonly path?: string;
	readonly info?: string;
	readonly timestamp?: number;
	readonly callId?: string;
}

export interface ContextViewCategory {
	id: ContextCategoryId;
	key?: string;
	label: string;
	/** Overview attribution weight, not reported usage; may differ from the entry sum (e.g. Skills subtraction). */
	tokens: number;
	entries: ContextViewEntry[];
	children?: ContextViewCategory[];
}

export interface ContextViewData {
	readonly breakdown: ContextBreakdown;
	readonly categories: readonly ContextViewCategory[];
}
