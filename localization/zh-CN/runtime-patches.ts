import { parse } from "@babel/parser";
import type { PackageId } from "./core";

// These are display labels only. Registry groups, option values, section IDs,
// parser inputs, and theme tokens must keep their upstream spelling.
const groupLabels: Record<string, string> = {
	Theme: "主题", Composer: "输入框", "Status Line": "状态栏", Display: "显示", Images: "图像",
	Thinking: "思考", Sampling: "采样", Prompt: "提示词", "Retry & Fallback": "重试与回退",
	Advisor: "顾问", Prewalk: "预处理", Vision: "视觉", Input: "输入", Approvals: "审批",
	Notifications: "通知", Speech: "语音", Collab: "协作", Stream: "直播", "Magic Keywords": "魔法关键词",
	"Startup & Updates": "启动与更新", Power: "电源", Agent: "智能体", Git: "Git", Skills: "技能",
	General: "常规", Compaction: "压缩", "Rules (TTSR)": "规则 (TTSR)", Experimental: "实验功能",
	"Auto-Learn": "自动学习", Mnemopi: "Mnemopi", Hindsight: "Hindsight", Sharpshooter: "Sharpshooter",
	Editing: "编辑", Reading: "读取", "Read Summaries": "读取摘要", LSP: "LSP", Bash: "Bash",
	"Eval & Runtimes": "求值与运行时", "Available Tools": "可用工具", Todos: "待办事项",
	"Grep & Browser": "搜索与浏览器", Computer: "计算机", "IDA Pro": "IDA Pro", GitHub: "GitHub",
	"Output Limits": "输出限制", Execution: "执行", "Discovery & MCP": "发现与 MCP", Extensions: "扩展",
	Developer: "开发者", Modes: "模式", Subagents: "子智能体", Isolation: "隔离", "Commands & Skills": "命令与技能",
	Services: "服务", Fireworks: "Fireworks", "Tiny Model": "微型模型", Protocol: "协议", Timeouts: "超时",
	Privacy: "隐私", Other: "其他",
};

const valueLabels: Record<string, string> = {
	true: "开启", false: "关闭", on: "开启", off: "关闭", auto: "自动", inherit: "继承",
	minimal: "最低", min: "最低", low: "低", medium: "中", med: "中", mid: "中", high: "高", xhigh: "极高", max: "最高",
	enabled: "已启用", disabled: "已禁用", active: "进行中", inactive: "未激活", paused: "已暂停",
	running: "运行中", waiting: "等待中", complete: "已完成", dropped: "已放弃", "budget-limited": "预算受限",
	"next prompt repeats": "下一条提示词重复执行",
	always: "始终", never: "从不", smart: "智能", default: "默认", aggressive: "积极", view: "查看", control: "控制",
	global: "全局", project: "项目", "per-project": "按项目", "per-project-tagged": "按项目标签",
	session: "会话", "per-call": "每次调用", append: "追加", rebuild: "重建", preserve: "保留",
	collapsed: "折叠", full: "完整", all: "全部", "one-at-a-time": "逐条", immediate: "立即", wait: "等待",
	text: "文字", icon: "图标", none: "无", compact: "精简", reset: "重置", rewind: "回溯", tree: "树形",
	stable: "稳定版", canary: "预览版", notify: "通知", summary: "摘要", expanded: "展开", hidden: "隐藏",
	suggest: "建议", directory: "目录", repo: "仓库", idle: "空闲", display: "显示器", system: "系统",
	local: "本地", remote: "远程", discard: "丢弃", keep: "保留", once: "一次", "after-gap": "间隔后",
	"prose-only": "仅正文", "tool-only": "仅工具", "full-session": "完整会话", "last-turn": "最后一轮",
	multilingual: "多语言", en: "英语", braille: "盲文", pulse: "脉冲", dots: "圆点", line: "线条",
	classic: "经典", kitt: "扫描灯",
};

function mappingSource(name: string, labels: Record<string, string>): string {
	return `const ${name}Labels: Readonly<Record<string, string>> = ${JSON.stringify(labels)};\nfunction ${name}(value: string): string {\n\treturn Object.hasOwn(${name}Labels, value) ? ${name}Labels[value]! : value;\n}\n`;
}

const groupSource = mappingSource("__ompZhGroup", groupLabels);
const valueSource = mappingSource("__ompZhValue", valueLabels);
const settingSource = `${valueSource}
function __ompZhSettingLabel(value: string, id: string): string {
	if (value === "true" || value === "false") return __ompZhValue(value);
	// Provider/model IDs, paths, commands, and protocols are technical text.
	if (/(provider|model|path|directory|endpoint|command|protocol|url|host|(?:^|\\.)id$)/i.test(id)) return value;
	return __ompZhValue(value);
}
`;
const itemSource = `${settingSource}
function __ompZhSettingValue(item: { id: string; currentValue: string; values?: readonly string[] }): string {
	return item.values ? __ompZhSettingLabel(String(item.currentValue ?? ""), item.id) : String(item.currentValue ?? "");
}
`;
const thinkingSource = `${valueSource}
function __ompZhThinking(display: string, level: string | undefined): string {
	if (level === undefined) return display;
	return display.replace(/\\b(?:minimal|min|low|medium|med|high|xhigh|max|off|auto)$/, () => __ompZhValue(level));
}
`;

type Replacement = readonly [before: string | RegExp, after: string];

/**
 * Apply AFTER catalog literal translation. Inputs use PackageId and package-relative
 * `src/...` paths, like extractCandidates/applyCatalog. No I/O or auxiliary assets;
 * generated packages contain only small local __ompZh helpers, with no tooling imports.
 * Unrecognized files/expressions are left alone; calling again is byte-for-byte idempotent.
 */
export function patchDisplayBoundaries(pkg: PackageId, file: string, code: string): string {
	let replacements: readonly Replacement[];
	let helpers: string;
	const normalized = file.replaceAll("\\", "/");
	if (pkg === "tui" && normalized === "src/overlays/settings-selector.ts") {
		helpers = groupSource + settingSource;
		replacements = [
			["visibleWidth(def.group)", "visibleWidth(__ompZhGroup(def.group))"],
			["title: group", "title: __ompZhGroup(group)"],
			["value: v, label: v", "value: v, label: __ompZhSettingLabel(v, def.path)"],
			['return value === undefined || value === null ? "" : String(value);', 'return value === undefined || value === null ? "" : __ompZhSettingLabel(String(value), def.path);'],
		];
	} else if (pkg === "tui" && normalized === "src/components/settings-list.ts") {
		helpers = groupSource + itemSource;
		replacements = [
			['plainLine(String(item.currentValue ?? ""))', "plainLine(__ompZhSettingValue(item))"],
			['truncateToWidth(String(item.currentValue ?? ""),', "truncateToWidth(__ompZhSettingValue(item),"],
			['span(plainLine(item.label), "strong")', 'span(plainLine(__ompZhGroup(item.label)), "strong")'],
			["headingStyle(item.label, dimmed)", "headingStyle(__ompZhGroup(item.label), dimmed)"],
			[/sections\.map\(section => section\.name \|\| ("(?:[^"\\]|\\.)*")\)/g, "sections.map(section => __ompZhGroup(section.name) || $1)"],
		];
	} else if (pkg === "tui" && normalized === "src/status-line/segments.ts") {
		helpers = thinkingSource;
		replacements = [
			["const thinkingDisplay = modelThinkingDisplay(ctx);", "const thinkingDisplay = __ompZhThinking(modelThinkingDisplay(ctx), thinkingLevelWord(ctx.session));"],
			["span(level, thinkingLevelToken(level))", "span(__ompZhValue(level), thinkingLevelToken(level))"],
			[/(const stateLabel = )(loop\.state === "waiting" \? "(?:[^"\\]|\\.)*" : loop\.state);/g, "$1__ompZhValue($2);"],
			['Loop${loop.state === "waiting" ? ":" : ""} ${stateLabel}', '循环${loop.state === "waiting" ? ":" : ""} ${stateLabel}'],
		];
	} else if (pkg === "agent" && normalized === "src/slash-commands/builtin-modes.ts") {
		helpers = `${valueSource}
function __ompZhConfiguredThinking(value: string | undefined): string | undefined {
	return value === undefined ? undefined : __ompZhValue(value);
}
`;
		replacements = [
			["${state.goal.status}", "${__ompZhValue(state.goal.status)}"],
			[/\$\{((?:runtime\.ctx\.viewSession|session)\.configuredThinkingLevel\(\)) \?\?/g, "${__ompZhConfiguredThinking($1) ??"],
			["${resolved.level}", "${__ompZhValue(resolved.level)}"],
		];
	} else if (pkg === "agent" && normalized === "src/cli/completion-gen.ts") {
		helpers = "";
		replacements = [["[Show help]", "[显示帮助]"], ["[Show version]", "[显示版本]"]];
	} else {
		return code;
	}

	let patched = code;
	for (const [before, after] of replacements) {
		patched = typeof before === "string" ? patched.replaceAll(before, after) : patched.replace(before, after);
	}
	if (patched === code) return code;
	// Helpers are appended so directive prologues, shebangs and imports keep their
	// original positions. These four modules call the helpers only after loading.
	const result = !helpers || code.includes("const __ompZhValueLabels:") ? patched : `${patched}\n${helpers}`;
	parse(result, { sourceType: "module", plugins: ["typescript"] });
	return result;
}
