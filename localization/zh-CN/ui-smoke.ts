// Copied into the portable package root by build-windows.ps1 so all imports
// exercise the translated modules and dependencies that users actually receive.
import { BUILTIN_SLASH_COMMAND_DEFS } from "./node_modules/@oh-my-pi/pi-coding-agent/src/slash-commands/builtin-registry";
import { generateCompletion, type CompletionSpec } from "./node_modules/@oh-my-pi/pi-coding-agent/src/cli/completion-gen";
import { Settings } from "./node_modules/@oh-my-pi/pi-coding-agent/src/config/settings";
import type { SlashCommandRuntime, TuiSlashCommandRuntime } from "./node_modules/@oh-my-pi/pi-coding-agent/src/slash-commands/types";
import { CombinedAutocompleteProvider } from "./node_modules/@oh-my-pi/pi-tui/src/autocomplete";
import { WelcomeComponent, renderWelcomeTip } from "./node_modules/@oh-my-pi/pi-tui/src/prompt/welcome";
import { getSettingsListTheme, initTheme, theme } from "./node_modules/@oh-my-pi/pi-tui/src/theme/theme";
import { orderedSettings } from "./node_modules/@oh-my-pi/pi-coding-agent/src/config/all-settings";
import { BUILTIN_MODE_SLASH_COMMANDS } from "./node_modules/@oh-my-pi/pi-coding-agent/src/slash-commands/builtin-modes";
import { KeybindingsManager } from "./node_modules/@oh-my-pi/pi-tui/src/app-keybindings";
import { SettingsList, type SettingItem } from "./node_modules/@oh-my-pi/pi-tui/src/components/settings-list";
import { buildHotkeysMarkdown } from "./node_modules/@oh-my-pi/pi-tui/src/hotkeys-markdown";
import type { DescribeContext } from "./node_modules/@oh-my-pi/pi-tui/src/native/node";
import { getAllSettingDefs, getSettingsForTab, SETTING_TABS, TAB_GROUPS, type SettingsDisplayEntry } from "./node_modules/@oh-my-pi/pi-tui/src/overlays/settings-defs";
import { describeSegment, renderSegment, thinkingLevelWord, type SegmentContext } from "./node_modules/@oh-my-pi/pi-tui/src/status-line/segments";
import { thinkingLevelToken } from "./node_modules/@oh-my-pi/pi-tui/src/theme/theme-class";
import { CLI_THINKING_LEVELS, getConfiguredThinkingLevelMetadata, parseCliThinkingLevel, parseConfiguredThinkingLevel, parseThinkingLevel } from "./node_modules/@oh-my-pi/pi-tui/src/thinking";

function requireChinese(value: string | undefined, surface: string): void {
	if (!value || !/[\u3400-\u9fff]/.test(value)) throw new Error(`Chinese UI check failed for ${surface}: ${value ?? "missing"}`);
	process.stdout.write(`${surface}: ${value}\n`);
}

await initTheme(false);
for (const name of ["settings", "setup", "stats", "session", "extensions", "security"]) {
	const command = BUILTIN_SLASH_COMMAND_DEFS.find(command => command.name === name);
	requireChinese(command?.description, `/${name} menu`);
}

const runtime = {
	ctx: {
		viewSession: { model: { provider: "smoke-provider", id: "smoke-model" } },
		settings: Settings.isolated(),
		planModeEnabled: false,
		goalModeEnabled: false,
	},
} as unknown as TuiSlashCommandRuntime;
for (const name of ["model", "switch", "plan"]) {
	const command = BUILTIN_SLASH_COMMAND_DEFS.find(command => command.name === name);
	const description = command?.getTuiAutocompleteDescription?.(runtime);
	requireChinese(description, `/${name} live description`);
	if (name !== "plan" && !description?.includes("smoke-provider/smoke-model")) throw new Error(`Model selector changed in /${name}`);
}
for (const count of [1, 3]) {
	const autocomplete = new CombinedAutocompleteProvider(
		Array.from({ length: count }, (_, index) => ({ name: `skill:smoke-${index}` })), process.cwd(),
	);
	const skillDescription = autocomplete.trySyncSlashCompletion("/")?.items.find(item => item.value === "skill:")?.description;
	requireChinese(skillDescription, "skill namespace count");
	if (!skillDescription?.includes(String(count)) || /[\u3400-\u9fff]s\b/.test(skillDescription)) throw new Error("Skill namespace count or plural rendering changed");
}

const originalRandom = Math.random;
const originalPreset = theme.getSymbolPreset;
try {
	// Force the exact font hint shown in the reported screenshot, then sample
	// the regular tip pool through the actual welcome component as well.
	theme.getSymbolPreset = () => "unicode";
	for (const roll of [0, 0.2, 0.5, 0.99]) {
		Math.random = () => roll;
		const tip = new WelcomeComponent("ui-smoke").tip;
		requireChinese(tip, `welcome tip (${roll})`);
		const rendered = renderWelcomeTip(tip!, 90).join("\n");
		requireChinese(rendered, "rendered welcome tip");
		if (/Tip:/.test(rendered) || /\{(?:key|keys|tap|action):/.test(rendered)) throw new Error("Welcome label or key placeholder was not rendered");
	}
} finally {
	Math.random = originalRandom;
	theme.getSymbolPreset = originalPreset;
}
// Every check below runs the portable modules with in-memory settings and
// local doubles; no provider request or settings-file write is needed.
for (const level of CLI_THINKING_LEVELS) {
	const metadata = getConfiguredThinkingLevelMetadata(level);
	requireChinese(metadata.label, `thinking ${level} label`);
	requireChinese(metadata.description, `thinking ${level} description`);
	if (metadata.value !== level || parseCliThinkingLevel(level) !== level || parseConfiguredThinkingLevel(level) !== level) throw new Error(`Thinking selector changed: ${level}`);
}
if (parseThinkingLevel("xhi") !== "xhigh" || parseThinkingLevel("med") !== "medium" || parseThinkingLevel("auto") !== undefined || parseCliThinkingLevel("inherit") !== undefined) throw new Error("Thinking parser boundary changed");

const bindings = KeybindingsManager.inMemory();
const hotkeys = buildHotkeysMarkdown({ keybindings: bindings });
requireChinese(hotkeys, "hotkeys markdown");
if (/Move by word|Send message|Delete word backwards|Cycle thinking level|Cycle role models|Start\/stop live voice|issue\/PR reference|Open the agent hub|Slash commands|Start of line|Path completion|Keyboard shortcuts|\| Key \| Action \|/.test(hotkeys)) throw new Error("Known English hotkey action or table heading remains");
if (!hotkeys.includes(bindings.getDisplayString("app.model.selectTemporary")) || !hotkeys.includes("!!") || !hotkeys.includes("local://")) throw new Error("Hotkey or literal command token changed");

const entries: SettingsDisplayEntry[] = orderedSettings().filter(setting => setting.ui).map(setting => ({
	path: setting.id, type: setting.type, defaultValue: setting.default, ui: setting.ui, enumValues: setting.enumValues,
}));
const defs = getAllSettingDefs(entries);
if (new Set(defs.map(def => def.path)).size !== defs.length || defs.length < 100) throw new Error("Settings registry lost or duplicated built-in entries");
for (const tab of SETTING_TABS) {
	let previous = -1;
	for (const def of getSettingsForTab(entries, tab)) {
		const rank = def.group ? TAB_GROUPS[tab].indexOf(def.group) : -1;
		if ((def.group && rank < 0) || rank < previous) throw new Error(`Settings group/order changed: ${tab}/${def.group}/${def.path}`);
		previous = rank;
	}
}
for (const group of ["Theme", "Collab", "Thinking", "Status Line"]) {
	const def = defs.find(def => def.group === group);
	if (!def) throw new Error(`Canonical settings group changed: ${group}`);
	requireChinese(def.label, `${group} setting label`);
	requireChinese(def.description, `${group} setting description`);
}

const items: SettingItem[] = [
	{ id: "__heading:Theme", label: "Theme", currentValue: "", heading: true },
	{ id: "smoke.enabled", label: "开关", currentValue: "true", values: ["true", "false"] },
	{ id: "__heading:Collab", label: "Collab", currentValue: "", heading: true },
	{ id: "smoke.mode", label: "模式", currentValue: "auto", values: ["auto", "high"] },
	{ id: "providers.smoke", label: "服务", currentValue: "provider/high", values: ["provider/high"] },
];
const writes: [string, string][] = [];
const list = new SettingsList(items, 10, getSettingsListTheme(), (id, value) => writes.push([id, value]), () => {}, { layout: "flat", hint: "" });
const settingsRows = list.render(100).join("\n");
const nativeSettings = JSON.stringify(list.describe({} as DescribeContext));
for (const rendered of [settingsRows, nativeSettings]) {
	if (!rendered.includes("主题") || !rendered.includes("协作") || !rendered.includes("自动") || !rendered.includes("开启") || !rendered.includes("provider/high")) throw new Error("Settings heading/value display failed");
}
list.selectItem("smoke.mode");
list.handleInput("\r");
if (JSON.stringify(writes) !== JSON.stringify([["smoke.mode", "high"]]) || items[3].currentValue !== "high" || items[0].label !== "Theme") throw new Error("Settings persistence, selection or section key changed");

const outputs: string[] = [];
const model = { provider: "smoke-provider", id: "smoke-model", name: "smoke-model", reasoning: true, thinking: {} };
let fast = false;
let ultra = false;
const session = {
	model, settings: Settings.isolated(), state: { model, messages: [], thinkingLevel: parseThinkingLevel("high")! },
	isAutoThinking: false,
	autoResolvedThinkingLevel: (): string | undefined => undefined,
	isFastModeActive: () => false,
	isFastModeEnabled: () => fast,
	isUltrafastModeEnabled: () => ultra,
	configuredThinkingLevel: () => "high",
	getAvailableEffortSelectors: () => ["off", "high", "auto"],
	getGoalModeState: () => ({ goal: { status: "paused", objective: "smoke-objective", tokensUsed: 0 } }),
};
const commandRuntime = { session, settings: session.settings, output: (text: string) => { outputs.push(text); } } as unknown as SlashCommandRuntime;
const tuiRuntime = { ctx: {
	...runtime.ctx, session, viewSession: session,
	statusLine: { invalidate: () => {} }, ui: { requestRender: () => {} }, editor: { setText: () => {} },
	showStatus: (text: string) => { outputs.push(text); },
} } as unknown as TuiSlashCommandRuntime;
for (const [enabled, ultrafast] of [[false, false], [true, false], [true, true]]) {
	fast = enabled!;
	ultra = ultrafast!;
	const spec = BUILTIN_MODE_SLASH_COMMANDS.find(spec => spec.name === "fast")!;
	outputs.length = 0;
	await spec.handle!({ name: "fast", args: "status", text: "/fast status" }, commandRuntime);
	await spec.handleTui!({ name: "fast", args: "status", text: "/fast status" }, tuiRuntime);
	const live = spec.getTuiAutocompleteDescription!(tuiRuntime);
	for (const output of [...outputs, live]) {
		requireChinese(output, `/fast ${enabled}/${ultrafast}`);
		if (/\b(?:on|off|ultra|Fast mode)\b/.test(output ?? "")) throw new Error("Untranslated fast status value");
	}
	if (outputs.length !== 2 || outputs[0] !== outputs[1]) throw new Error("Fast TUI/text status mismatch");
}
outputs.length = 0;
await BUILTIN_MODE_SLASH_COMMANDS.find(spec => spec.name === "model")!.handle!({ name: "model", args: "", text: "/model" }, commandRuntime);
requireChinese(outputs[0], "/model runtime status");
if (!outputs[0]?.includes("smoke-provider/smoke-model")) throw new Error("Model runtime selector changed");
for (const name of ["goal", "effort"]) {
	const output = BUILTIN_MODE_SLASH_COMMANDS.find(spec => spec.name === name)!.getTuiAutocompleteDescription!(tuiRuntime);
	requireChinese(output, `/${name} interpolated status`);
	if (/\b(?:paused|high)\b/.test(output ?? "")) throw new Error(`Untranslated /${name} state`);
	if (name === "goal" && !output?.includes("smoke-objective")) throw new Error("Goal objective changed");
}
outputs.length = 0;
await BUILTIN_MODE_SLASH_COMMANDS.find(spec => spec.name === "effort")!.handle!({ name: "effort", args: "", text: "/effort" }, commandRuntime);
requireChinese(outputs[0], "/effort runtime status");
if (/Thinking:|Available:/.test(outputs[0] ?? "")) throw new Error("Known English /effort status label remains");
if (/\bhigh\b/.test(outputs[0]?.split("\n")[0] ?? "") || !outputs[0]?.includes("off, high, auto")) throw new Error("Effort display or available parser selectors changed");

const statusContext = {
	session, width: 100, options: {}, compactThinkingLevel: false, sessionAccent: false,
	planMode: null, prewalk: null, goalMode: null, vibeMode: null, loopMode: null,
} as unknown as SegmentContext;
for (const level of ["off", "high", "xhigh", "auto"]) {
	session.isAutoThinking = level === "auto";
	session.state.thinkingLevel = parseThinkingLevel(level) ?? parseThinkingLevel("high")!;
	const canonical = thinkingLevelWord(statusContext.session);
	if (canonical !== level) throw new Error("thinkingLevelWord must remain canonical");
	const ansi = renderSegment("model", statusContext).content;
	const native = describeSegment("model", statusContext)!;
	requireChinese(ansi, `statusline legacy ${level}`);
	requireChinese(native.spans.map(span => span.t).join(""), `statusline native ${level}`);
	if (!ansi.includes("smoke-model") || native.spans.at(-1)?.s !== thinkingLevelToken(level)) throw new Error("Statusline model identity or thinking color changed");
}
for (const state of ["running", "paused", "waiting"] as const) {
	statusContext.loopMode = { state };
	const ansi = renderSegment("mode", statusContext).content;
	const native = describeSegment("mode", statusContext)!;
	requireChinese(ansi, `loop legacy ${state}`);
	requireChinese(native.spans.map(span => span.t).join(""), `loop native ${state}`);
	if (/\b(?:Loop|running|paused|waiting|next prompt repeats)\b/.test(ansi + native.spans.map(span => span.t).join("")) || native.icon !== (state === "paused" ? "pause" : "loop") || native.spans[0]?.s !== (state === "paused" ? "warning" : "customMessageLabel") || statusContext.loopMode.state !== state) throw new Error("Loop state display, icon or color changed");
}
process.stdout.write(`Portable Chinese UI verified: ${defs.length} settings; thinking parsers, hotkeys, settings controls, /fast, /model and both statusline variants.\n`);

const completionSpec: CompletionSpec = { bin: "omp", root: {flags:[],args:[]}, commands:[{name:"session",aliases:["s"],description:"会话管理",flags:[],args:[]}] };
const fishCompletion = generateCompletion("fish",completionSpec);
if (!fishCompletion.includes("\nfunction __fish_omp_no_subcommand\n") || !fishCompletion.includes("\tfor i in (commandline -opc)\n") || !fishCompletion.includes("\nend\n") || !fishCompletion.includes("complete -c omp -f -n '__fish_omp_no_subcommand' -a 'session' -d '会话管理'")) throw new Error("Generated fish program keywords or completion arguments changed");
const zshCompletion = generateCompletion("zsh",completionSpec);
if (!zshCompletion.includes("[显示帮助]") || !zshCompletion.includes("[显示版本]")) throw new Error("Generated zsh help descriptions remain English");
if (!generateCompletion("bash",completionSpec).includes("session")) throw new Error("Generated bash command completion changed");
process.stdout.write("Shell completion verified: executable fish keywords, command tokens and Chinese descriptions.\n");
