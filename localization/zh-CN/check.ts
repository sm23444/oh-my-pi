import * as path from "node:path";
const root = import.meta.dir;
let checked = 0;
for await (const file of new Bun.Glob("*.ts").scan({ cwd: root })) {
	new Bun.Transpiler({ loader: "ts" }).transformSync(await Bun.file(path.join(root, file)).text());
	checked++;
}
for await (const file of new Bun.Glob("zh-*.yml").scan({ cwd: path.join(root, "../../.github/workflows") })) {
	Bun.YAML.parse(await Bun.file(path.join(root, "../../.github/workflows", file)).text());
	checked++;
}
console.log(`Syntax checked ${checked} automation files.`);
