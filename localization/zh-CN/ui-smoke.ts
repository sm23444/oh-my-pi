// Copied into the portable package root by build-windows.ps1 so all imports
// exercise the translated modules and dependencies that users actually receive.
import { BUILTIN_SLASH_COMMAND_DEFS } from "./node_modules/@oh-my-pi/pi-coding-agent/src/slash-commands/builtin-registry";
import { Settings } from "./node_modules/@oh-my-pi/pi-coding-agent/src/config/settings";
import type { TuiSlashCommandRuntime } from "./node_modules/@oh-my-pi/pi-coding-agent/src/slash-commands/types";
import { CombinedAutocompleteProvider } from "./node_modules/@oh-my-pi/pi-tui/src/autocomplete";
import { WelcomeComponent, renderWelcomeTip } from "./node_modules/@oh-my-pi/pi-tui/src/prompt/welcome";
import { initTheme, theme } from "./node_modules/@oh-my-pi/pi-tui/src/theme/theme";

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
process.stdout.write("Portable Chinese menu and welcome UI verified.\n");
