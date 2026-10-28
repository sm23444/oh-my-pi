import * as path from "node:path";

const root = import.meta.dir;
const stateFile = Bun.file(path.join(root, "state.json"));
const state = await stateFile.json() as { version: string | null; fingerprint?: string | null };
const hasher = new Bun.CryptoHasher("sha256");
for (const file of ["config.json", "translation-prompt.md", "seed.json", "install.ps1", "build-windows.ps1", "windows-readme.txt", "../../.github/workflows/zh-sync.yml"]) hasher.update(await Bun.file(path.join(root, file)).text());
for (const file of [...new Bun.Glob("*.ts").scanSync({ cwd: root, onlyFiles: true })].sort()) hasher.update(await Bun.file(path.join(root, file)).text());
const fingerprint = hasher.digest("hex");
const headers: Record<string, string> = { "Accept": "application/vnd.github+json", "User-Agent": "omp-zh-sync" };
if (Bun.env.GH_TOKEN) headers.Authorization = `Bearer ${Bun.env.GH_TOKEN}`;
const response = await fetch("https://api.github.com/repos/can1357/oh-my-pi/releases/latest", { headers, signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Upstream release lookup failed: HTTP ${response.status}`);
const release = await response.json() as { tag_name: string; draft: boolean; prerelease: boolean };
if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) throw new Error("Upstream did not return a stable release tag");
const version = release.tag_name.slice(1);
const force = Bun.env.FORCE_UPDATE === "true";
const audit = Bun.env.AUDIT_ONLY === "true";
const needed = force || audit || state.version !== version || state.fingerprint !== fingerprint;
const outputs = { tag: release.tag_name, version, fingerprint, needed: String(needed) };
console.log(JSON.stringify(outputs, null, 2));
if (Bun.env.GITHUB_OUTPUT) {
	const file = Bun.file(Bun.env.GITHUB_OUTPUT);
	const previous = await file.text().catch(() => "");
	await Bun.write(file, previous + Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(""));
}
