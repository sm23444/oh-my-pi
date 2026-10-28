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

	test("plural suffix removal retains the original condition and singular/plural counts", () => {
		const source = 'const item={description:`${count} skill${check(count) ? "" : "s"}`};';
		const code = translate(source,"tui","src/autocomplete.ts",{'${count} skill${check(count) ? "" : "s"}':"__OMP_TOKEN_0__ 项技能__OMP_TOKEN_1__",s:""});
		const checked: number[] = [];
		const render = new Function("count","check",`${code};return item.description;`);
		expect(render(1,(count: number)=>{checked.push(count);return true;})).toBe("1 项技能");
		expect(render(3,(count: number)=>{checked.push(count);return false;})).toBe("3 项技能");
		expect(checked).toEqual([1,3]);
	});

	test("tool button labels and theme aliases translate without changing actions or color names", () => {
		const source = 'function render(){return [uiTheme.fg("warning","No files found"),actionButton("Force kill","kill",{keys:"escape"})];}';
		const code = translate(source,"tui","src/tools/bash-interactive.ts",{"No files found":"未找到文件","Force kill":"强制终止"});
		const result = new Function("uiTheme","actionButton",`${code};return render();`)({fg:(color: string,text: string)=>[color,text]},(...args: unknown[])=>args);
		expect(result).toEqual([["warning","未找到文件"],["强制终止","kill",{keys:"escape"}]]);
	});
});

test("input submission policy remains canonical while its caption is translated", () => {
	const source='const input={empty:"submit",caption:"Authorization code"};function enter(value){return value || input.empty === "submit" ? "submitted" : "cancelled";}';
	const code=translate(source,"tui","src/overlays/login-dialog.ts",{"Authorization code":"授权码"});
	const result=new Function(`${code};return [input,enter("")];`)();
	expect(result).toEqual([{empty:"submit",caption:"授权码"},"submitted"]);
});

test("snake-case command identifiers stay literal inside translated instructions", () => {
	const source='console.log("Use log_experiment to record results");';
	const code=translate(source,"agent","src/commands/example.ts",{"Use log_experiment to record results":"使用__OMP_TOKEN_0__记录结果"});
	const messages: string[]=[];
	new Function("console",code)({log:(message: string)=>messages.push(message)});
	expect(messages).toEqual(["使用log_experiment记录结果"]);
});

test("theme warning roles remain valid palette keys after translating an SVG caption", () => {
	const source='const PALETTE={warning:"warning"};const item={caption:"Diagram preview"};function palette(theme){return theme.getColorHex(PALETTE.warning);}';
	const code=translate(source,"tui","src/chat/svg-figure.ts",{"Diagram preview":"图表预览"});
	const result=new Function("theme",`${code};return [palette(theme),item.caption];`)({getColorHex:(key: string)=>{if(key!=="warning")throw new Error("Unknown palette key");return "#ffaa00";}});
	expect(result).toEqual(["#ffaa00","图表预览"]);
});

test("historical English background footers remain recognizable after localizing the output caption", () => {
	const source='const item={caption:"Command output"};function isBackgroundNotice(line,jobId){const prefix=`Backgrounded as job ${jobId}`;return line.startsWith(prefix)&&(line[prefix.length]===";"||line[prefix.length]===" ");}';
	const code=translate(source,"tui","src/tools/bash.ts",{"Command output":"命令输出"});
	const result=new Function(`${code};return [item.caption,isBackgroundNotice("Backgrounded as job job-1; still running","job-1"),isBackgroundNotice("Backgrounded as job job-10; still running","job-1")];`)();
	expect(result).toEqual(["命令输出",true,false]);
});

test("copyable shell command text retains cd and environment assignments", () => {
	const source='const item={caption:"Command preview"};function formatBashCommandText(cwd,command){const parts=[];if(cwd)parts.push(`cd ${cwd} &&`);parts.push(command);return parts.join(" ");}';
	const code=translate(source,"tui","src/tools/bash.ts",{"Command preview":"命令预览"});
	const result=new Function(`${code};return [item.caption,formatBashCommandText("/work/project","MODE=test echo ok")];`)();
	expect(result).toEqual(["命令预览","cd /work/project && MODE=test echo ok"]);
});

test("slash-separated UI verbs translate while file paths remain protected", () => {
	const source='const item={label:"Hide/show files in src/tools"};';
	const code=translate(source,"tui","src/overlays/settings-selector.ts",{"Hide/show files in src/tools":"显示或隐藏__OMP_TOKEN_0__中的文件"});
	expect(new Function(`${code};return item.label;`)()).toBe("显示或隐藏src/tools中的文件");
});

test("interpolated inline commands retain their literal command text and flags", () => {
	const source='const item={label:`Try \\`${app} update --stable\\`.`};'.replaceAll('\\\\`','\\`');
	const candidates=extractCandidates(source,"agent","src/cli/build-service.ts");
	const translation="尝试 `__OMP_TOKEN_0__ update __OMP_TOKEN_1__`。";
	const code=translate(source,"agent","src/cli/build-service.ts",{[candidates[0].source]:translation});
	expect(new Function("app",`${code};return item.label;`)("omp")).toBe("尝试 `omp update --stable`。");
	expect(()=>toEntry(candidates[0],translation.replace("update","reset"),"human")).toThrow("unprotected command");
	expect(()=>toEntry(candidates[0],translation+" `malicious command`","human")).toThrow("unprotected command");
});

test("endpoint query parameters retain their syntax inside translated descriptions", () => {
	const source='const item={label:`Extension endpoint ${port}${token ? "?token=***" : ""}`};';
	const candidate=extractCandidates(source,"agent","src/cli/browser-relay-cli.ts")[0];
	const code=translate(source,"agent","src/cli/browser-relay-cli.ts",{[candidate.source]:"扩展端点 __OMP_TOKEN_0____OMP_TOKEN_1__"});
	expect(new Function("port","token",`${code};return item.label;`)(1234,true)).toBe("扩展端点 1234?token=***");
});

test("diff fence scaffolding stays literal while its panel label translates", () => {
	const source='const sections=[];sections.push(`### ${changed}\\n\\n\\`\\`\\`diff\\n${diff}\\n\\`\\`\\``);const item={label:"History"};'.replaceAll('\\\\`','\\`');
	const code=translate(source,"agent","src/modes/controllers/command-controller.ts",{History:"历史记录"});
	const result=new Function("changed","diff",`${code};return [item.label,sections[0]];`)("2026-10-28","- old\n+ new");
	expect(result).toEqual(["历史记录","### 2026-10-28\n\n```diff\n- old\n+ new\n```"]);
});
