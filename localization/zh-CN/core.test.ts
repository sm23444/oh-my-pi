import { describe, expect, test } from "bun:test";
import { applyCatalog, extractCandidates, fromSeed, toEntry, type Catalog } from "./core";

const extract = (code: string) => extractCandidates(code, "agent", "src/commands/example.ts");

describe("display translation contracts", () => {
	test("translates display labels without changing matching protocol values or imports", () => {
		const source = 'import { x } from "settings"; const item = {value: "Default", label: "Default"}; if (item.value === "Default") x(item);';
		const candidates = extract(source);
		expect(candidates.map(candidate => candidate.source)).toEqual(["Default"]);
		const catalog: Catalog = { [candidates[0].id]: toEntry(candidates[0], "默认", "human") };
		const result = applyCatalog(source, candidates, catalog);
		expect(result.code).toBe('import { x } from "settings"; const item = {value: "Default", label: "默认"}; if (item.value === "Default") x(item);');
	});

	test("preserves nested template expressions, comments, paths and flags byte for byte", () => {
		const source = 'const view = {description: `Save ${ /*keep*/ data.map(x => `${x.name}:${x.id}`).join(",") } with --force in settings.json`};';
		const [candidate] = extract(source);
		expect(candidate.tokens).toEqual(['${ /*keep*/ data.map(x => `${x.name}:${x.id}`).join(",") }', "--force", "settings.json"]);
		const catalog = { [candidate.id]: toEntry(candidate, "将 __OMP_TOKEN_0__ 用 __OMP_TOKEN_1__ 保存到 __OMP_TOKEN_2__", "model") };
		const result = applyCatalog(source, [candidate], catalog);
		expect(result.code).toBe('const view = {description: `将 ${ /*keep*/ data.map(x => `${x.name}:${x.id}`).join(",") } 用 --force 保存到 settings.json`};');
	});

	test("blocks lost, duplicated or invented placeholders before mutating output", () => {
		const [candidate] = extract('const item = {label: `Delete ${name}?`};');
		for (const translation of ["删除吗？", "删除 __OMP_TOKEN_0__ __OMP_TOKEN_0__", "删除 __OMP_TOKEN_99__"]) {
			expect(() => toEntry(candidate, translation, "model")).toThrow("protected placeholders");
		}
	});

	test("escapes literal interpolation in translated text so it cannot execute", () => {
		const source = 'const item = {label: `Open ${name}`};';
		const [candidate] = extract(source);
		const result = applyCatalog(source, [candidate], { [candidate.id]: toEntry(candidate, '打开 ${evil()} __OMP_TOKEN_0__', "human") });
		const read = new Function("name", "evil", `${result.code}; return item.label;`);
		let called = false;
		expect(read("file", () => { called = true; })).toBe("打开 ${evil()} file");
		expect(called).toBe(false);
	});

	test("reuses IDs after line movement and detects a changed English source", () => {
		const [first] = extract('const item = {label: "Open file"};');
		const [moved] = extract('\n\nconst item = {label: "Open file"};');
		const [changed] = extract('const item = {label: "Open folder"};');
		const catalog = { [first.id]: toEntry(first, "打开文件", "human") };
		expect(applyCatalog('\n\nconst item = {label: "Open file"};', [moved], catalog).code).toContain('label: "打开文件"');
		expect(() => applyCatalog('const item = {label: "Open folder"};', [changed], catalog)).toThrow("Missing translation");
	});

	test("rebinds seed tokens and refuses ambiguous or unsafe donor translations", () => {
		const [candidate] = extract('const item = {description: "Use --force to update"};');
		expect(fromSeed(candidate, new Map([[candidate.raw, ["使用 --force 更新"]]]))).toBe("使用 __OMP_TOKEN_0__ 更新");
		expect(fromSeed(candidate, new Map([[candidate.raw, ["使用 --delete 更新"]]]))).toBeUndefined();
		expect(fromSeed(candidate, new Map([[candidate.raw, ["使用 --force 更新", "使用 --force 升级"]]]))).toBeUndefined();
	});

	test("skips prompts, machine options, regexes and comparisons while recognizing conditional UI labels", () => {
		const source = 'const pattern = /label: "Fake text"/; const item = {label: enabled ? "Enabled" : "Disabled", options:["write","yolo"], type:"checkbox"};';
		expect(extract(source).map(candidate => candidate.source)).toEqual(["Enabled", "Disabled"]);
		expect(extractCandidates('const item = {description: "Change the system prompt"};', "agent", "src/prompts/system/example.ts")).toEqual([]);
	});

	test("rejects reordering of template expressions that can have side effects", () => {
		const [candidate] = extract('const item = {label: `First ${next()} then ${last()}`};');
		expect(() => toEntry(candidate, "先 __OMP_TOKEN_1__ 后 __OMP_TOKEN_0__", "model")).toThrow("evaluation order");
	});

	test("leaves executable input examples untouched while translating their labels", () => {
		const source = 'const item = {label: "Server command", placeholder: "npx -y server"};';
		const candidates = extract(source);
		const catalog = { [candidates[0].id]: toEntry(candidates[0], "服务器命令", "human") };
		expect(applyCatalog(source, candidates, catalog).code).toBe('const item = {label: "服务器命令", placeholder: "npx -y server"};');
	});

	test("keeps Windows paths and keyboard shortcuts intact in translated help", () => {
		const source = String.raw`const item = {label: "Open C:\\work\\file.txt with Ctrl+O"};`;
		const [candidate] = extract(source);
		expect(candidate.tokens).toEqual([String.raw`C:\work\file.txt`, "Ctrl+O"]);
		const result = applyCatalog(source, [candidate], { [candidate.id]: toEntry(candidate, "使用 __OMP_TOKEN_1__ 打开 __OMP_TOKEN_0__", "model") });
		expect(new Function(`${result.code}; return item.label;`)()).toBe("使用 Ctrl+O 打开 " + String.raw`C:\work\file.txt`);
	});
});
