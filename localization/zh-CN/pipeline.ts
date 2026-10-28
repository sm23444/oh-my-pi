import * as path from "node:path";
import { applyCatalog, extractCandidates, fromSeed, inScope, npmPackages, packagePaths, toEntry, type Candidate, type Catalog, type PackageId, type SeedEntry } from "./core";
import { translateAll, type TranslationConfig, type TranslationFailure } from "./client";

interface Settings {
	model: string;
	provider: "google" | "openai";
	baseUrl: string;
	batchSize: number;
	concurrency: number;
	maxNewEntries: number;
}
interface SourceFile { absolute: string; pkg: PackageId; file: string; code: string; candidates: Candidate[]; }
const root = import.meta.dir;
const args = process.argv.slice(2);
const command = args[0];
const option = (name: string, fallback = "") => {
	const index = args.indexOf(`--${name}`);
	return index === -1 ? fallback : args[index + 1] ?? fallback;
};
const source = path.resolve(option("source", path.join(root, "../..")));
const layout = option("layout", "repo");
const catalogFile = path.resolve(option("catalog", path.join(root, "catalog.json")));
const reportDir = path.resolve(option("report", path.join(root, "reports")));
const settings: Settings = await Bun.file(path.join(root, "config.json")).json();
let catalog: Catalog = await Bun.file(catalogFile).json();
const seedData: SeedEntry[] = await Bun.file(path.join(root, "seed.json")).json();
const seeds = new Map<string, string[]>();
for (const seed of seedData) seeds.set(seed.en, [...(seeds.get(seed.en) ?? []), seed.zh]);
if (!["scan", "translate", "apply"].includes(command)) throw new Error("Usage: bun pipeline.ts scan|translate|apply --source PATH [--layout repo|npm] [--report PATH] [--allow-missing]");
if (!["repo", "npm"].includes(layout)) throw new Error("Invalid source layout");
const files: SourceFile[] = [];
const packages = Object.keys(packagePaths) as PackageId[];
for (const pkg of packages) {
	const base = layout === "npm" ? path.join(source, "node_modules", npmPackages[pkg]) : path.join(source, packagePaths[pkg]);
	for await (const scannedFile of new Bun.Glob("src/**/*.{ts,tsx,txt}").scan({ cwd: base, onlyFiles: true })) {
		const file = scannedFile.replaceAll("\\", "/");
		if (!inScope(pkg, file)) continue;
		const absolute = path.join(base, file);
		const code = await Bun.file(absolute).text();
		const candidates = extractCandidates(code, pkg, file);
		files.push({ absolute, pkg, file, code, candidates });
	}
}
const candidates = [...new Map(files.flatMap(file => file.candidates).map(candidate => [candidate.id, candidate])).values()];
if (!files.length || !candidates.length || !candidates.some(candidate => candidate.role === "field:description")) throw new Error("No expected display strings found; upstream layout may have changed");
let seeded = 0;
for (const candidate of candidates) {
	if (catalog[candidate.id]) continue;
	const translation = fromSeed(candidate, seeds);
	if (translation) { catalog[candidate.id] = toEntry(candidate, translation, "seed"); seeded++; }
}
let reused = 0;
const reusable = new Map<string, Map<string, Catalog[keyof Catalog]>>();
for (const entry of Object.values(catalog)) {
	const key = JSON.stringify([entry.source, entry.text]);
	const variants = reusable.get(key) ?? new Map<string, Catalog[keyof Catalog]>();
	variants.set(entry.translation, entry);
	reusable.set(key, variants);
}
for (const candidate of candidates) {
	if (catalog[candidate.id]) continue;
	const variants = reusable.get(JSON.stringify([candidate.source, candidate.text]));
	if (variants?.size !== 1) continue;
	const entry = [...variants.values()][0];
	try { catalog[candidate.id] = toEntry(candidate, entry.translation, entry.origin); reused++; }
	catch { /* A translation with different expression semantics must be translated separately. */ }
}
const saveCatalog = async () => {
	const sorted = Object.fromEntries(Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b)));
	await Bun.write(catalogFile, JSON.stringify(sorted, null, 2) + "\n");
};
let translated = 0;
const deferred: TranslationFailure[] = [];
const validationReasons = new Map<string, string>();
const missing = () => candidates.filter(candidate => !catalog[candidate.id]);
const byId = new Map(candidates.map(candidate => [candidate.id, candidate]));
const saveDeferred = async () => {
	await Bun.write(path.join(reportDir, "deferred.json"), JSON.stringify(deferred.map(failure => {
		const candidate = byId.get(failure.id)!;
		return { ...failure, pkg: candidate.pkg, file: candidate.file, line: candidate.line, source: candidate.source };
	}), null, 2) + "\n");
};
const writeReport = async () => {
	const pending = missing();
	const active = new Set(candidates.map(candidate => candidate.id));
	const summary = {
		version: option("version"), model: Bun.env.TRANSLATION_MODEL || settings.model,
		scannedFiles: files.length, detectedDisplayStrings: candidates.length,
		translatedDisplayStrings: candidates.length - pending.length, pendingDisplayStrings: pending.length,
		seededThisRun: seeded, reusedThisRun: reused, modelTranslatedThisRun: translated, deferredThisRun: deferred.length,
		retainedInactiveTranslations: Object.keys(catalog).filter(id => !active.has(id)).length,
		completeWithinScannerScope: pending.length === 0,
	};
	await Bun.write(path.join(reportDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
	await Bun.write(path.join(reportDir, "pending.json"), JSON.stringify(pending.map(({ id, pkg, file, line, source, role, text }) => ({ id, pkg, file, line, source, role, text })), null, 2) + "\n");
	await saveDeferred();
	const markdown = `## OMP 中文自动化\n\n- 官方版本：${summary.version || "local"}\n- 翻译模型：${summary.model}\n- 扫描文件：${summary.scannedFiles}\n- 已识别显示文案：${summary.detectedDisplayStrings}\n- 已有翻译：${summary.translatedDisplayStrings}\n- 待翻译：${summary.pendingDisplayStrings}\n- 本次复用种子译文：${seeded}\n- 本次模型补译：${translated}\n- 本次暂缓条目：${deferred.length}（详见 deferred.json）\n\n${pending.length ? "当前仅保存翻译进度，未满足正式发布条件。\n\n" : ""}此统计仅覆盖扫描器识别的界面字段和显示调用，不代表整个产品 100% 汉化。\n`;
	await Bun.write(path.join(reportDir, "summary.md"), markdown);
	if (Bun.env.GITHUB_STEP_SUMMARY) {
		const existing = await Bun.file(Bun.env.GITHUB_STEP_SUMMARY).text().catch(() => "");
		await Bun.write(Bun.env.GITHUB_STEP_SUMMARY, existing + markdown);
	}
	console.log(JSON.stringify(summary, null, 2));
};
try {
	if (command === "translate" && missing().length) {
		const provider = Bun.env.TRANSLATION_PROVIDER || settings.provider;
		if (provider !== "google" && provider !== "openai") throw new Error("TRANSLATION_PROVIDER must be google or openai");
		const apiKey = Bun.env.TRANSLATION_API_KEY;
		if (!apiKey) throw new Error("Missing TRANSLATION_API_KEY; configure it in GitHub Actions Secrets");
		const config: TranslationConfig = {
			provider, apiKey, model: Bun.env.TRANSLATION_MODEL || settings.model,
			baseUrl: Bun.env.TRANSLATION_BASE_URL || (provider === settings.provider ? settings.baseUrl : provider === "google" ? "https://generativelanguage.googleapis.com/v1beta" : "https://api.openai.com/v1"),
			batchSize: settings.batchSize,
			concurrency: settings.concurrency,
			onRetry: (attempt, delayMs, reason) => console.warn(`Translation retry ${attempt}: ${reason} Waiting ${delayMs / 1000}s.`),
			validateResult: result => {
				const candidate = byId.get(result.id);
				if (!candidate) throw new Error("Translation returned an unknown entry ID");
				try { toEntry(candidate, result.text, "model"); }
				catch (error: unknown) {
					if (error instanceof Error) validationReasons.set(result.id, error.message);
					throw error;
				}
			},
			onFailure: async failure => {
				const detail = validationReasons.get(failure.id);
				const entry = { ...failure, reason: detail ? `${failure.reason} Last validation: ${detail}` : failure.reason };
				deferred.push(entry);
				console.warn(`Deferred translation ${entry.id}: ${entry.reason}`);
				await saveDeferred();
			},
		};
		const requestedMax = Number(Bun.env.TRANSLATION_MAX_ENTRIES || 0);
		if (!Number.isSafeInteger(requestedMax) || requestedMax < 0 || requestedMax > settings.maxNewEntries) throw new Error(`TRANSLATION_MAX_ENTRIES must be an integer from 0 to ${settings.maxNewEntries}`);
		const queue = missing().slice(0, requestedMax || settings.maxNewEntries);
		console.log(`Translating ${queue.length} pending strings (${config.batchSize} per batch, ${config.concurrency} concurrent batches), checkpointing each batch.`);
		await translateAll(queue.map(candidate => ({ id: candidate.id, text: candidate.text, context: `${candidate.pkg}:${candidate.file}:${candidate.line} ${candidate.role}\n${candidate.context}` })), config, async results => {
			const updates: Catalog = {};
			for (const result of results) {
				const candidate = byId.get(result.id);
				if (!candidate) throw new Error("Translation returned an unknown entry ID");
				updates[result.id] = toEntry(candidate, result.text, "model");
			}
			catalog = { ...catalog, ...updates };
			translated += results.length;
			await saveCatalog();
			console.log(`Checkpoint: ${translated} translated, ${missing().length} pending.`);
		});
		if (deferred.length && translated === 0) throw new Error("No acceptable translations were returned; see deferred.json for rejected entries");
	}
	if (command === "apply") {
		const allowMissing = args.includes("--allow-missing");
		if (missing().length && !allowMissing) throw new Error(`${missing().length} display strings still need translation; refusing publication`);
		// Prepare every change before mutating source so a parse/placeholder error cannot leave half a tree.
		const changes = files.map(file => ({ file, result: applyCatalog(file.code, file.candidates, catalog, allowMissing) }));
		for (const { file, result } of changes) if (result.code !== file.code) await Bun.write(file.absolute, result.code);
		await Bun.write(path.join(reportDir, "applied.json"), JSON.stringify(changes.filter(change => change.result.applied).map(({ file, result }) => ({ pkg: file.pkg, file: file.file, applied: result.applied })), null, 2) + "\n");
	}
} finally {
	await saveCatalog();
	await writeReport();
}
