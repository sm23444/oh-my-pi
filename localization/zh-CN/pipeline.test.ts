import { $ } from "bun";
import { expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { packagePaths, type Catalog } from "./core";
import type { TranslationRequest } from "./client";

interface Summary {
	modelTranslatedThisRun: number;
	deferredThisRun: number;
	pendingDisplayStrings: number;
	completeWithinScannerScope: boolean;
}
interface DeferredEntry { id: string; reason: string; pkg: string; file: string; line: number; source: string; }

async function runPipeline(acceptNeighbor: boolean) {
	const directory = await fs.mkdtemp(path.join(Bun.env.PI_SCRATCH_DIR || os.tmpdir(), "omp-zh-pipeline-"));
	const source = 'const view = { description: "Review outstanding zirconium translations", label: "Open the cobalt control panel" };';
	const server = Bun.serve({
		hostname: "127.0.0.1", port: 0,
		async fetch(request) {
			const body = await request.json() as { messages: { role: string; content: string }[] };
			const { items } = JSON.parse(body.messages.find(message => message.role === "user")!.content) as { items: TranslationRequest[] };
			const translations = items.map(item => ({
				id: item.id,
				text: acceptNeighbor && item.text.startsWith("Open") ? "打开控制面板" : "Still untranslated English",
			}));
			return Response.json({ choices: [{ message: { content: JSON.stringify({ translations }) } }] });
		},
	});
	try {
		for (const base of Object.values(packagePaths)) await fs.mkdir(path.join(directory, base, "src"), { recursive: true });
		const fixture = path.join(directory, packagePaths.agent, "src/commands/fixture.ts");
		await Bun.write(fixture, source);
		const catalogPath = path.join(directory, "catalog.json");
		const report = path.join(directory, "reports");
		await Bun.write(catalogPath, "{}\n");
		const pipeline = path.join(import.meta.dir, "pipeline.ts");
		const result = await $`${process.execPath} ${pipeline} translate --source ${directory} --catalog ${catalogPath} --report ${report}`.env({
			...process.env,
			TRANSLATION_PROVIDER: "openai",
			TRANSLATION_BASE_URL: `http://127.0.0.1:${server.port}/v1`,
			TRANSLATION_API_KEY: "pipeline-test-key",
			TRANSLATION_MODEL: "test-model",
			TRANSLATION_MAX_ENTRIES: "2",
			GITHUB_STEP_SUMMARY: "",
		}).quiet().nothrow();
		return {
			exitCode: result.exitCode,
			stderr: result.stderr.toString(),
			summary: await Bun.file(path.join(report, "summary.json")).json() as Summary,
			deferred: await Bun.file(path.join(report, "deferred.json")).json() as DeferredEntry[],
			catalog: await Bun.file(catalogPath).json() as Catalog,
			remainingSource: await Bun.file(fixture).text(),
			source,
		};
	} finally {
		server.stop(true);
		await fs.rm(directory, { recursive: true, force: true });
	}
}

test("pipeline preserves valid progress and reports rejected source while publication stays blocked", async () => {
	const result = await runPipeline(true);
	expect(result.exitCode).toBe(0);
	expect(result.summary).toMatchObject({ modelTranslatedThisRun: 1, deferredThisRun: 1, pendingDisplayStrings: 1, completeWithinScannerScope: false });
	expect(Object.values(result.catalog).map(entry => entry.translation)).toEqual(["打开控制面板"]);
	expect(result.deferred).toEqual([{
		id: expect.any(String), reason: expect.stringContaining("Translation contains no Chinese text"),
		pkg: "agent", file: "src/commands/fixture.ts", line: 1, source: "Review outstanding zirconium translations",
	}]);
	expect(result.remainingSource).toBe(result.source);
});

test("pipeline fails a run with no acceptable translations and retains every rejected entry in the report", async () => {
	const result = await runPipeline(false);
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain("No acceptable translations were returned");
	expect(result.summary).toMatchObject({ modelTranslatedThisRun: 0, deferredThisRun: 2, pendingDisplayStrings: 2, completeWithinScannerScope: false });
	expect(result.catalog).toEqual({});
	expect(result.deferred.map(entry => entry.source).sort()).toEqual(["Open the cobalt control panel", "Review outstanding zirconium translations"]);
});
