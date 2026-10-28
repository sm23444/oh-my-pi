import { describe, expect, test } from "bun:test";
import type { PackageId } from "./core";
import { patchDisplayBoundaries } from "./runtime-patches";

const transpiler = new Bun.Transpiler({ loader: "ts", target: "bun" });

function fixture<T>(pkg: PackageId, file: string, source: string, expression: string): T {
	const patched = patchDisplayBoundaries(pkg, file, source);
	// Reapplying the patch must produce the same runnable artifact, not duplicate
	// declarations or wrap a protocol value a second time.
	expect(patchDisplayBoundaries(pkg, file, patched)).toBe(patched);
	return new Function(`${transpiler.transformSync(patched)}\nreturn (${expression});`)() as T;
}

const listFixture = `
const plainLine = (text: string) => text;
const span = (text: string, color: string) => ({ text, color });
const truncateToWidth = (text: string, width: number) => text.slice(0, width);
function nativeValue(item) { return plainLine(String(item.currentValue ?? "")); }
function legacyValue(item) { return truncateToWidth(String(item.currentValue ?? ""), 100); }
function nativeHeading(item) { return span(plainLine(item.label), "strong"); }
function legacyHeading(item) {
	const headingStyle = (text: string, dimmed: boolean) => text;
	const dimmed = false;
	return headingStyle(item.label, dimmed);
}
function sidebar(sections) { return sections.map(section => section.name || "其他"); }
function cycle(item, persist) {
	const currentIndex = item.values.indexOf(item.currentValue);
	const newValue = item.values[(currentIndex + 1) % item.values.length];
	item.currentValue = newValue;
	persist(item.id, newValue);
}
`;

interface Item { id: string; label: string; currentValue: string; values?: string[]; }
interface ListFixture {
	nativeValue(item: Item): string;
	legacyValue(item: Item): string;
	nativeHeading(item: Item): { text: string; color: string };
	legacyHeading(item: Item): string;
	sidebar(sections: { name: string }[]): string[];
	cycle(item: Item, persist: (id: string, value: string) => void): void;
}

function list(): ListFixture {
	return fixture("tui", "src/components/settings-list.ts", listFixture,
		"{ nativeValue, legacyValue, nativeHeading, legacyHeading, sidebar, cycle }");
}

describe("Chinese settings display keeps persistence and navigation canonical", () => {
	test("cycling still finds the original selected value and persists raw enum/boolean values", () => {
		const rendered = list();
		const writes: [string, string][] = [];
		for (const item of [
			{ id: "thinking.mode", label: "思考", currentValue: "auto", values: ["auto", "high"] },
			{ id: "tui.enabled", label: "启用", currentValue: "true", values: ["true", "false"] },
		]) {
			expect(rendered.nativeValue(item)).toMatch(/[\u3400-\u9fff]/);
			expect(rendered.legacyValue(item)).toBe(rendered.nativeValue(item));
			rendered.cycle(item, (id, value) => writes.push([id, value]));
			expect(rendered.legacyValue(item)).toBe(item.id === "thinking.mode" ? "高" : "关闭");
		}
		expect(writes).toEqual([["thinking.mode", "high"], ["tui.enabled", "false"]]);
	});

	test("headings translate without changing heading IDs, section focus names, or ordering", () => {
		const rendered = list();
		const headings = ["Theme", "Collab", "Status Line"].map(label => ({
			id: `__heading:${label}`, label, currentValue: "",
		}));
		const sections = headings.map(item => ({ name: item.label }));
		expect(rendered.sidebar(sections)).toEqual(["主题", "协作", "状态栏"]);
		for (const [index, item] of headings.entries()) {
			expect(rendered.nativeHeading(item)).toEqual({ text: rendered.sidebar(sections)[index], color: "strong" });
			expect(rendered.legacyHeading(item)).toBe(rendered.nativeHeading(item).text);
			expect(item.id).toBe(`__heading:${sections[index].name}`);
		}
		expect(sections.map(section => section.name)).toEqual(["Theme", "Collab", "Status Line"]);
	});

	test("provider IDs, paths, free text, unknown modes and prototype keys remain literal", () => {
		const rendered = list();
		for (const item of [
			{ id: "providers.search", label: "服务", currentValue: "auto", values: ["auto", "off"] },
			{ id: "theme.path", label: "路径", currentValue: "C:/high/auto" },
			{ id: "user.text", label: "文字", currentValue: "high" },
			{ id: "tui.mode", label: "模式", currentValue: "custom-mode", values: ["custom-mode"] },
			{ id: "tui.mode", label: "模式", currentValue: "toString", values: ["toString"] },
		]) {
			expect(rendered.nativeValue(item)).toBe(item.currentValue);
			expect(rendered.legacyValue(item)).toBe(item.currentValue);
		}
	});

	test("native choice labels are Chinese while section IDs and selected option keys stay canonical", () => {
		interface SelectorFixture {
			section(group: string): { id: string; title: string };
			control(def: { path: string; values: string[] }, shown: string): { value: string; options: { value: string; label: string }[] };
		}
		const rendered = fixture<SelectorFixture>("tui", "src/overlays/settings-selector.ts", `
			const prefsSectionId = (group: string) => group.toLowerCase().replaceAll(" ", "-");
			function section(group) { const id = prefsSectionId(group); return { id, title: group }; }
			function control(def, shown) { return { k: "choice", value: shown, options: def.values.map(v => ({ value: v, label: v })) }; }
		`, "{ section, control }");
		expect(rendered.section("Status Line")).toEqual({ id: "status-line", title: "状态栏" });
		const choice = rendered.control({ path: "thinking.mode", values: ["auto", "high"] }, "high");
		expect(choice.options.find(option => option.value === choice.value)?.label).toBe("高");
		expect(choice.options.map(option => option.value)).toEqual(["auto", "high"]);
	});
});

const statusFixture = `
function thinkingLevelWord(session) {
	if (!session.state.model?.thinking) return undefined;
	if (session.isAutoThinking) return session.autoResolvedThinkingLevel() ?? "auto";
	return session.state.thinkingLevel ?? "off";
}
const span = (text: string, color: string) => ({ text, color });
const thinkingLevelToken = (level: string) => ({ high: "thinkingHigh", xhigh: "thinkingXhigh" }[level] ?? "thinkingOff");
function modelThinkingDisplay(ctx) {
	const level = thinkingLevelWord(ctx.session);
	if (ctx.options.model?.showThinkingLevel === false || level === undefined) return "";
	return "◉ " + level;
}
function legacy(ctx) {
	const thinkingDisplay = modelThinkingDisplay(ctx);
	return { name: ctx.session.state.model.id, text: thinkingDisplay };
}
function native(ctx) {
	const level = ctx.options.model?.showThinkingLevel === false ? undefined : thinkingLevelWord(ctx.session);
	return level === undefined ? null : span(level, thinkingLevelToken(level));
}
function loopDisplay(loop) {
	const color = loop.state === "paused" ? "warning" : "customMessageLabel";
	const stateLabel = loop.state === "waiting" ? "next prompt repeats" : loop.state;
	return { text: stateLabel, color };
}
`;

interface StatusFixture {
	thinkingLevelWord(session: unknown): string | undefined;
	legacy(ctx: unknown): { name: string; text: string };
	native(ctx: unknown): { text: string; color: string } | null;
	loopDisplay(loop: { state: string }): { text: string; color: string };
}

test("both status-line renderers show Chinese without changing thinking words or colors", () => {
	const rendered = fixture<StatusFixture>("tui", "src/status-line/segments.ts", statusFixture,
		"{ thinkingLevelWord, legacy, native, loopDisplay }");
	for (const [level, auto, resolved, label, token] of [
		["high", false, undefined, "高", "thinkingHigh"],
		["xhigh", true, "xhigh", "极高", "thinkingXhigh"],
		["off", false, undefined, "关闭", "thinkingOff"],
		["high", true, undefined, "自动", "thinkingOff"],
	] as const) {
		const session = { state: { model: { id: "provider/high", thinking: {} }, thinkingLevel: level }, isAutoThinking: auto, autoResolvedThinkingLevel: () => resolved };
		const ctx = { session, options: {} };
		expect(rendered.thinkingLevelWord(session)).toBe(auto ? resolved ?? "auto" : level);
		expect(rendered.legacy(ctx)).toEqual({ name: "provider/high", text: `◉ ${label}` });
		expect(rendered.native(ctx)).toEqual({ text: label, color: token });
	}
	const unsupported = { session: { state: { model: { id: "plain-model" } } }, options: {} };
	expect(rendered.thinkingLevelWord(unsupported.session)).toBeUndefined();
	expect(rendered.legacy(unsupported).text).toBe("");
	expect(rendered.native(unsupported)).toBeNull();
	const hidden = { session: { state: { model: { id: "reasoning-model", thinking: {} }, thinkingLevel: "high" } }, options: { model: { showThinkingLevel: false } } };
	expect(rendered.legacy(hidden).text).toBe("");
	expect(rendered.native(hidden)).toBeNull();
	for (const [state, label, color] of [["running", "运行中", "customMessageLabel"], ["paused", "已暂停", "warning"], ["waiting", "下一条提示词重复执行", "customMessageLabel"]]) {
		const loop = { state };
		expect(rendered.loopDisplay(loop)).toEqual({ text: label, color });
		expect(loop.state).toBe(state);
	}
});

test("slash descriptions translate interpolated state but leave objectives, selectors and fast labels intact", () => {
	interface ModesFixture {
		goal(state: unknown): string;
		thinking(runtime: unknown): string;
		status(session: unknown): string;
		fast(): string;
	}
	const rendered = fixture<ModesFixture>("agent", "src/slash-commands/builtin-modes.ts", [
		'function goal(state) { return `目标：${state.goal.status} (${state.goal.objective})`; }',
		'function thinking(runtime) { return `思考：${runtime.ctx.viewSession.configuredThinkingLevel() ?? "模型默认"}`; }',
		'function status(session) { return `思考：${session.configuredThinkingLevel() ?? "模型默认"}；可用：${session.getAvailableEffortSelectors().join(", ")}`; }',
		'function formatFastModeStatus() { return "超快"; }',
		'function fast() { return `快速模式：${formatFastModeStatus()}`; }',
	].join("\n"), "{ goal, thinking, status, fast }");
	expect(rendered.goal({ goal: { status: "paused", objective: "keep high/active literal" } })).toBe("目标：已暂停 (keep high/active literal)");
	const session = { configuredThinkingLevel: () => "high", getAvailableEffortSelectors: () => ["off", "high", "auto"] };
	expect(rendered.thinking({ ctx: { viewSession: session } })).toBe("思考：高");
	expect(rendered.status(session)).toBe("思考：高；可用：off, high, auto");
	expect(rendered.thinking({ ctx: { viewSession: { configuredThinkingLevel: () => undefined } } })).toBe("思考：模型默认");
	expect(rendered.fast()).toBe("快速模式：超快");
});

test("unrelated modules keep interrupt sentinel equality and original control values", () => {
	const source = 'const USER_INTERRUPT_LABEL = "Interrupted by user"; const GENERIC_ABORT_SENTINEL = "aborted"; function aborted(value) { return value === USER_INTERRUPT_LABEL || value === GENERIC_ABORT_SENTINEL; }';
	const aborted = fixture<(value: string) => boolean>("tui", "src/chat/messages.ts", source, "aborted");
	expect(aborted("Interrupted by user")).toBe(true);
	expect(aborted("aborted")).toBe(true);
	expect(aborted("已中断")).toBe(false);
});

test("generated shell help descriptions translate while flags and quoting stay executable", () => {
	const source='function completion(){return "\\\"(-h --help)[Show help] (-v --version)[Show version]\\\"";}';
	const translated=patchDisplayBoundaries("agent","src/cli/completion-gen.ts",source);
	expect(new Function(`${translated};return completion();`)()).toBe('"(-h --help)[显示帮助] (-v --version)[显示版本]"');
	expect(patchDisplayBoundaries("agent","src/cli/completion-gen.ts",translated)).toBe(translated);
});
