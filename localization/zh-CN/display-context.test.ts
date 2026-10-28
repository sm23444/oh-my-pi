import { describe, expect, test } from "bun:test";
import { applyCatalog, extractCandidates, toEntry, type Catalog, type PackageId } from "./core";

function translate(source: string, pkg: PackageId, file: string, translations: Record<string, string>): string {
	const candidates = extractCandidates(source, pkg, file);
	const catalog: Catalog = Object.fromEntries(candidates.map(candidate => {
		const translation = translations[candidate.source];
		if (translation === undefined) throw new Error(`Unexpected display string: ${candidate.source}`);
		return [candidate.id, toEntry(candidate, translation, "human")];
	}));
	return applyCatalog(source, candidates, catalog).code;
}

describe("built-in UI localization boundaries", () => {
	test("settings registered outside config keep ids, defaults and option values while translating UI metadata", () => {
		const source = 'const setting = {id:"browser.enabled", default:"off", description:"Machine field", ui:{label:"Browser", description:"Enable the browser", options:[{value:"off",label:"Off"}]}};';
		const code = translate(source, "agent", "src/tools/browser/settings.ts", { Browser:"浏览器", "Enable the browser":"启用浏览器", Off:"关闭" });
		const value = new Function(`${code}; return setting;`)();
		expect(value).toEqual({id:"browser.enabled",default:"off",description:"Machine field",ui:{label:"浏览器",description:"启用浏览器",options:[{value:"off",label:"关闭"}]}});
	});

	test("command feedback and display helpers translate without changing command dispatch or provider ids", () => {
		const source = 'function formatFastModeStatus(session) {return session.fast ? "on" : "off";} function runFastCommand(arg, session) {if(arg === "status") return `Fast mode is ${formatFastModeStatus(session)}.`;} const command={name:"fast",handle: (arg,runtime) => runtime.output(runFastCommand(arg,runtime.session))};';
		const code = translate(source,"agent","src/slash-commands/builtin-modes.ts", {on:"开启",off:"关闭",'Fast mode is ${formatFastModeStatus(session)}.':"快速模式已__OMP_TOKEN_0__。"});
		const outputs: string[] = [];
		const command = new Function(`${code}; return command;`)();
		command.handle("status", {session:{fast:false},output:(value: string)=>outputs.push(value)});
		command.handle("status", {session:{fast:true},output:(value: string)=>outputs.push(value)});
		expect(command.name).toBe("fast");
		expect(outputs).toEqual(["快速模式已关闭。","快速模式已开启。"]);
	});

	test("status and output calls recognize literals, concatenated text and joined lines", () => {
		const source = 'function run(ctx,runtime) {ctx.showStatus("Checking updates"); runtime.output(["Current model: " + runtime.model, "Ready"].join("\\n"));}';
		const code = translate(source,"agent","src/slash-commands/builtin-session.ts", {"Checking updates":"正在检查更新","Current model: ":"当前模型：",Ready:"就绪"});
		const outputs: string[] = [];
		new Function(`${code}; return run;`)()({showStatus:(value: string)=>outputs.push(value)},{model:"provider/id",output:(value: string)=>outputs.push(value)});
		expect(outputs).toEqual(["正在检查更新","当前模型：provider/id\n就绪"]);
	});

	test("hotkey action descriptions are localized without translating their binding identifiers", () => {
		const source = 'const rows=[{keys:["ctrl+c"],action:"Interrupt operation"}]; const bindings={"app.interrupt":{description:"Interrupt operation"}};';
		const code = translate(source,"tui","src/hotkeys-markdown.ts", {"Interrupt operation":"中断操作"});
		expect(new Function(`${code};return [rows,bindings];`)()).toEqual([[{keys:["ctrl+c"],action:"中断操作"}],{"app.interrupt":{description:"中断操作"}}]);
	});

	test("chat rendering keeps persisted abort sentinels recognizable and translates only the fallback display", () => {
		const source = 'const USER_INTERRUPT_LABEL="Interrupted by user"; const GENERIC_ABORT_SENTINEL="Request was aborted"; function isUserInterrupt(message){return message === USER_INTERRUPT_LABEL;} function resolveAbortLabel(message){return message === GENERIC_ABORT_SENTINEL ? "Operation aborted" : message;}';
		const code = translate(source,"tui","src/chat/messages.ts", {"Operation aborted":"操作已中止"});
		const [recognize,resolve] = new Function(`${code}; return [isUserInterrupt,resolveAbortLabel];`)();
		expect(recognize("Interrupted by user")).toBe(true);
		expect(resolve("Request was aborted")).toBe("操作已中止");
		expect(resolve("Custom extension reason")).toBe("Custom extension reason");
	});

	test("native chat buttons preserve action keys while translating captions and tooltips", () => {
		const source = 'function renderError() {return button("retry", "Retry", ["F5"], "Retry the failed turn");}';
		const code = translate(source,"tui","src/chat/assistant-message.ts", {Retry:"重试","Retry the failed turn":"重试失败的回合"});
		const button = (...args: unknown[])=>args;
		expect(new Function("button", `${code}; return renderError();`)(button)).toEqual(["retry","重试",["F5"],"重试失败的回合"]);
	});

	test("nested visible states translate while preserving comparisons, call count and evaluation order", () => {
		const source = 'const item={label:`Mode ${next() === "on" ? "enabled" : "disabled"}; ${last()}`};';
		const translations = {'Mode ${next() === "on" ? "enabled" : "disabled"}; ${last()}':"模式__OMP_TOKEN_0__；__OMP_TOKEN_1__",enabled:"已启用",disabled:"已禁用"};
		const code = translate(source,"agent","src/commands/example.ts",translations);
		const calls: string[] = [];
		const rendered = new Function("next","last",`${code}; return item.label;`)(() => {calls.push("next"); return "on";}, () => {calls.push("last"); return "尾部";});
		expect(rendered).toBe("模式已启用；尾部");
		expect(calls).toEqual(["next","last"]);
	});

	test("nested dynamic template values are composed after translating both parent and child", () => {
		const source = 'const item={label:`Plan: ${enabled ? `On (${file})` : "Off"}`};';
		const code = translate(source,"agent","src/commands/example.ts",{'Plan: ${enabled ? `On (${file})` : "Off"}':"计划：__OMP_TOKEN_0__",'On (${file})':"已开启（__OMP_TOKEN_0__）",Off:"已关闭"});
		const render = new Function("enabled","file",`${code}; return item.label;`);
		expect(render(true,"plan.md")).toBe("计划：已开启（plan.md）");
		expect(render(false,"plan.md")).toBe("计划：已关闭");
	});
});
