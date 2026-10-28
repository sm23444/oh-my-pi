import translationPrompt from "./translation-prompt.md" with { type: "text" };

export interface TranslationRequest {
	id: string;
	text: string;
	context: string;
}

export interface TranslationResult {
	id: string;
	text: string;
}

export interface TranslationConfig {
	provider: "google" | "openai";
	model: string;
	baseUrl: string;
	apiKey: string;
	batchSize?: number;
	validateResult?: (result: TranslationResult) => void;
}

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 90_000;

class TranslationError extends Error {
	constructor(message: string, readonly retryable: boolean, readonly invalidOutput = false) {
		super(message);
		this.name = "TranslationError";
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

type OutputFailure = "provider-shape" | "openai-choices" | "openai-content" | "google-candidates" | "google-content" | "google-part" | "json-code-fence" | "invalid-json" | "translations-shape" | "translation-count" | "entry-shape" | "entry-id" | "entry-placeholders" | "output-truncated";

function invalidOutput(reason: OutputFailure): never {
	throw new TranslationError(`Translation provider returned invalid structured output. Reason: ${reason}.`, true, true);
}

function validateItems(items: TranslationRequest[]): void {
	const ids = new Set<string>();
	for (const item of items) {
		if (
			typeof item.id !== "string" || !item.id || ids.has(item.id) ||
			typeof item.text !== "string" || typeof item.context !== "string"
		) {
			throw new TranslationError("Translation requests require unique nonempty IDs and string text/context.", false);
		}
		ids.add(item.id);
	}
}

function endpoint(config: TranslationConfig): URL {
	if (
		(config.provider !== "google" && config.provider !== "openai") ||
		!config.model.trim() || !config.apiKey.trim()
	) {
		throw new TranslationError("Translation provider, model, and API key are required.", false);
	}
	let url: URL;
	try {
		url = new URL(config.baseUrl || (config.provider === "google"
			? "https://generativelanguage.googleapis.com/v1beta"
			: "https://api.openai.com/v1"));
	} catch {
		throw new TranslationError("Invalid translation base URL.", false);
	}
	const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
	if (
		(url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
		url.username || url.password || url.search || url.hash
	) {
		throw new TranslationError("Translation base URL requires HTTPS (or localhost HTTP) without credentials, query, or fragment.", false);
	}
	url.pathname = `${url.pathname.replace(/\/+$/, "")}${config.provider === "google"
		? `/models/${encodeURIComponent(config.model.replace(/^models\//, ""))}:generateContent`
		: "/chat/completions"}`;
	return url;
}

function requestBody(items: TranslationRequest[], config: TranslationConfig): object {
	const data = JSON.stringify({ items });
	if (config.provider === "openai") {
		return {
			model: config.model,
			messages: [
				{ role: "system", content: translationPrompt },
				{ role: "user", content: data },
			],
			response_format: { type: "json_object" },
		};
	}
	return {
		systemInstruction: { parts: [{ text: translationPrompt }] },
		contents: [{ role: "user", parts: [{ text: data }] }],
		generationConfig: {
			responseMimeType: "application/json",
			responseSchema: {
				type: "OBJECT",
				properties: {
					translations: {
						type: "ARRAY",
						items: {
							type: "OBJECT",
							properties: { id: { type: "STRING" }, text: { type: "STRING" } },
							required: ["id", "text"],
						},
					},
				},
				required: ["translations"],
			},
		},
	};
}

function outputText(body: unknown, provider: TranslationConfig["provider"]): string {
	if (!isObject(body)) return invalidOutput("provider-shape");
	if (provider === "openai") {
		if (!Array.isArray(body.choices) || body.choices.length !== 1) return invalidOutput("openai-choices");
		const choice: unknown = body.choices[0];
		if (!isObject(choice) || !isObject(choice.message) || typeof choice.message.content !== "string") {
			return invalidOutput("openai-content");
		}
		if (choice.finish_reason === "length") return invalidOutput("output-truncated");
		return choice.message.content;
	}
	if (!Array.isArray(body.candidates) || body.candidates.length !== 1) return invalidOutput("google-candidates");
	const candidate: unknown = body.candidates[0];
	if (!isObject(candidate) || !isObject(candidate.content) || !Array.isArray(candidate.content.parts)) {
		return invalidOutput("google-content");
	}
	const texts: string[] = [];
	for (const part of candidate.content.parts as unknown[]) {
		if (!isObject(part)) return invalidOutput("google-part");
		if (part.thought === true) continue;
		if (typeof part.text !== "string") return invalidOutput("google-part");
		texts.push(part.text);
	}
	return texts.join("");
}

function tokens(text: string): string[] {
	return (text.match(/__OMP_TOKEN_\d+__/g) ?? []).sort();
}

function validateOutput(text: string, items: TranslationRequest[]): TranslationResult[] {
	let output: unknown;
	try {
		output = JSON.parse(text);
	} catch {
		return invalidOutput(text.trimStart().startsWith("```") ? "json-code-fence" : "invalid-json");
	}
	if (!isObject(output) || Object.keys(output).length !== 1 || !Array.isArray(output.translations)) {
		return invalidOutput("translations-shape");
	}
	if (output.translations.length !== items.length) return invalidOutput("translation-count");
	const sources = new Map(items.map(item => [item.id, item.text]));
	const results = new Map<string, TranslationResult>();
	for (const result of output.translations as unknown[]) {
		if (
			!isObject(result) || Object.keys(result).length !== 2 ||
			typeof result.id !== "string" || typeof result.text !== "string" || !result.text.trim()
		) {
			return invalidOutput("entry-shape");
		}
		if (!sources.has(result.id) || results.has(result.id)) return invalidOutput("entry-id");
		if (JSON.stringify(tokens(sources.get(result.id)!)) !== JSON.stringify(tokens(result.text))) {
			return invalidOutput("entry-placeholders");
		}
		results.set(result.id, { id: result.id, text: result.text });
	}
	return items.map(item => results.get(item.id)!);
}

async function attempt(
	items: TranslationRequest[], config: TranslationConfig, url: URL, fetcher: typeof fetch,
): Promise<TranslationResult[]> {
	const controller = new AbortController();
	const deadline = Promise.withResolvers<never>();
	const timer = setTimeout(() => {
		deadline.reject(new TranslationError("Translation request timed out.", true));
		controller.abort();
	}, REQUEST_TIMEOUT_MS);
	try {
		const operation = async (): Promise<TranslationResult[]> => {
			const response = await fetcher(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(config.provider === "google"
						? { "x-goog-api-key": config.apiKey }
						: { Authorization: `Bearer ${config.apiKey}` }),
				},
				body: JSON.stringify(requestBody(items, config)),
				signal: controller.signal,
				redirect: "error",
			});
			if (!response.ok) {
				void response.body?.cancel().catch(() => {});
				throw new TranslationError(
					`Translation provider HTTP ${response.status}.`,
					response.status === 408 || response.status === 429 || response.status >= 500,
				);
			}
			const body: unknown = await response.json();
			const results = validateOutput(outputText(body, config.provider), items);
			for (const result of results) config.validateResult?.(result);
			return results;
		};
		return await Promise.race([operation(), deadline.promise]);
	} catch (error: unknown) {
		if (error instanceof TranslationError) throw error;
		throw new TranslationError("Translation request failed or returned invalid JSON.", true);
	} finally {
		clearTimeout(timer);
		controller.abort();
	}
}

export async function translateBatch(
	items: TranslationRequest[], config: TranslationConfig, fetcher: typeof fetch = fetch,
): Promise<TranslationResult[]> {
	validateItems(items);
	if (items.length === 0) return [];
	const url = endpoint(config);
	for (let index = 0; index < MAX_ATTEMPTS; index++) {
		try {
			return await attempt(items, config, url, fetcher);
		} catch (error: unknown) {
			if (!(error instanceof TranslationError)) {
				throw new TranslationError("Translation request failed.", false);
			}
			if (!error.retryable || index === MAX_ATTEMPTS - 1) throw error;
			await Bun.sleep(250 * 2 ** index);
		}
	}
	throw new TranslationError("Translation attempts exhausted.", false);
}

export async function translateAll(
	items: TranslationRequest[], config: TranslationConfig,
	onBatch?: (results: TranslationResult[]) => Promise<void>,
): Promise<TranslationResult[]> {
	validateItems(items);
	const batchSize = config.batchSize ?? 20;
	if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
		throw new TranslationError("Translation batch size must be a positive safe integer.", false);
	}
	const results = new Map<string, TranslationResult>();
	const checkpoint = async (batch: TranslationResult[]) => {
		if (batch.length === 0) return;
		if (onBatch) await onBatch(batch);
		for (const result of batch) results.set(result.id, result);
	};
	const processBatch = async (requests: TranslationRequest[]): Promise<void> => {
		let batch: TranslationResult[];
		try {
			batch = await translateBatch(requests, { ...config, validateResult: undefined });
		} catch (error: unknown) {
			if (!(error instanceof TranslationError) || !error.invalidOutput || requests.length === 1) throw error;
			const middle = Math.floor(requests.length / 2);
			await processBatch(requests.slice(0, middle));
			await processBatch(requests.slice(middle));
			return;
		}
		const accepted: TranslationResult[] = [];
		const rejected = new Set<string>();
		for (const result of batch) {
			try {
				config.validateResult?.(result);
				accepted.push(result);
			} catch {
				rejected.add(result.id);
			}
		}
		// Checkpoint good items before spending any requests on an invalid neighbor.
		await checkpoint(accepted);
		for (const request of requests) {
			if (!rejected.has(request.id)) continue;
			await checkpoint(await translateBatch([request], config));
		}
	};
	for (let index = 0; index < items.length; index += batchSize) {
		await processBatch(items.slice(index, index + batchSize));
	}
	return items.map(item => results.get(item.id)!);
}
