import { clearSubmittedText } from "./helpers/draft";
import { reset as resetCapabilities } from "../capability";
import {
	clearPluginRootsAndCaches,
	resolveActiveProjectRegistryPath,
	resolveOrDefaultProjectRegistryPath,
} from "../discovery/helpers.js";
import { PluginManager } from "../extensibility/plugins";
import { setInstalledPluginEnabled } from "../extensibility/plugins/toggle";
import {
	getInstalledPluginsRegistryPath,
	getMarketplacesCacheDir,
	getMarketplacesRegistryPath,
	getPluginsCacheDir,
	MarketplaceManager,
} from "../extensibility/plugins/marketplace";
import { MCPCommandController } from "../modes/controllers/mcp-command-controller";
import type { InteractiveModeContext } from "../modes/types";
import { refreshAgentDiscovery } from "../task";
import { createMarketplaceManager } from "./helpers/marketplace-manager";
import { commandConsumed, errorMessage, parseSubcommand, usage } from "./helpers/parse";
import { parseMarketplaceInstallArgs, parsePluginScopeArgs } from "./marketplace-install-parser";
import type { SlashCommandSpec } from "./types";

/**
 * Reload the interactive session's plugin runtime: invalidate fs/plugin-root
 * caches, rediscover skills, file slash commands, and task agents, reset the
 * capability cache, and reconnect MCP servers (rebinding the session's MCP
 * tools). Shared by `/reload-plugins`'s TUI handler and the `handle`-adapter's
 * `reloadPlugins` hook so both honor the command's documented reload scope.
 */
export async function reloadTuiPluginState(ctx: InteractiveModeContext): Promise<void> {
	const projectPath = await resolveActiveProjectRegistryPath(ctx.sessionManager.getCwd());
	clearPluginRootsAndCaches(projectPath ? [projectPath] : undefined);
	await refreshAgentDiscovery(ctx.sessionManager.getCwd(), ctx.session.effectiveExtensionRoots);
	await ctx.refreshSkillState();
	await ctx.refreshSlashCommandState();
	resetCapabilities();
	if (ctx.mcpManager) {
		await new MCPCommandController(ctx).reloadServers();
	}
}

export const BUILTIN_MARKETPLACE_SLASH_COMMANDS: ReadonlyArray<SlashCommandSpec> = [
	{
		name: "marketplace",
		icon: "cart",
		description: "管理插件市场源和已安装插件",
		acpDescription: "Manage plugins from marketplaces",
		acpInputHint: "<subcommand>",
		subcommands: [
			{ name: "add", description: "添加插件市场源", usage: "<source>" },
			{ name: "remove", description: "移除插件市场源", usage: "<name>" },
			{ name: "update", description: "更新插件市场目录", usage: "[name]" },
			{ name: "list", description: "列出已配置的插件市场" },
			{ name: "discover", description: "浏览可用插件", usage: "[marketplace]" },
			{
				name: "install",
				description: "安装插件（无参数时使用交互式浏览器）",
				usage: "[--force] [name@marketplace]",
			},
			{ name: "uninstall", description: "卸载插件（无参数时使用选择器）", usage: "[name@marketplace]" },
			{ name: "installed", description: "列出已安装的市场插件" },
			{ name: "upgrade", description: "升级过期的插件", usage: "[name@marketplace]" },
			{ name: "help", description: "显示使用指南" },
		],
		allowArgs: true,
		handle: async (command, runtime) => {
			const { verb, rest } = parseSubcommand(command.args);
			if (!verb) {
				try {
					const manager = await createMarketplaceManager(runtime);
					const marketplaces = await manager.listMarketplaces();
					if (marketplaces.length === 0) {
						await runtime.output(
							"未配置任何市场。\n\n开始操作：\n /marketplace 添加 anthropics/claude-plugins-official\n\n然后使用 /marketplace discover 浏览",
						);
					} else {
						const lines = marketplaces.map(m => `  ${m.name}  ${m.sourceUri}`);
						await runtime.output(
							`市场：
${lines.join("\n")}

使用 /marketplace discover 浏览插件，或使用 /marketplace help 获取所有命令`,
						);
					}
					return commandConsumed();
				} catch (err) {
					return usage(`市场错误： ${errorMessage(err)}`, runtime);
				}
			}
			if (verb === "help") {
				await runtime.output(
					[
						"市场命令：",
						" /marketplace 列出已配置的市场",
						" /marketplace add <source> 添加市场 (e.g. owner/repo)",
						" /marketplace remove <name> 移除市场",
						" /marketplace update [name] 重新获取目录(s)",
						" /marketplace list 列出已配置的市场",
						"  /marketplace discover [marketplace]        浏览可用插件",
						"  /marketplace install <name@marketplace>    安装插件",
						"  /marketplace uninstall <name@marketplace>  卸载插件",
						"  /marketplace installed                     列出已安装插件",
						"  /marketplace upgrade [name@marketplace]    升级插件",
						"",
						"快速开始：",
						"  /marketplace 添加 anthropics/claude-plugins-official",
					].join("\n"),
				);
				return commandConsumed();
			}
			if ((verb === "install" || verb === "uninstall") && !rest) {
				return usage(
					"交互式插件选择器仅支持 TUI。请显式传入 name@marketplace 参数。",
					runtime,
				);
			}
			try {
				const manager = await createMarketplaceManager(runtime);
				switch (verb) {
					case "add": {
						if (!rest) return usage("用法：/marketplace add <source>", runtime);
						const entry = await manager.addMarketplace(rest);
						await runtime.output(`已添加市场：${entry.name}`);
						return commandConsumed();
					}
					case "remove":
					case "rm": {
						if (!rest) return usage("用法：/marketplace remove <name>", runtime);
						await manager.removeMarketplace(rest);
						await runtime.output(`已移除市场：${rest}`);
						return commandConsumed();
					}
					case "update": {
						if (rest) {
							await manager.updateMarketplace(rest);
							await runtime.output(`已更新市场：${rest}`);
						} else {
							const results = await manager.updateAllMarketplaces();
							await runtime.output(`已更新 ${results.length} 个市场`);
						}
						return commandConsumed();
					}
					case "list": {
						const marketplaces = await manager.listMarketplaces();
						if (marketplaces.length === 0) {
							await runtime.output("未配置任何市场。");
						} else {
							const lines = marketplaces.map(m => `  ${m.name}  ${m.sourceUri}`);
							await runtime.output(`市场：
${lines.join("\n")}`);
						}
						return commandConsumed();
					}
					case "discover": {
						const plugins = await manager.listAvailablePlugins(rest || undefined);
						if (plugins.length === 0) {
							const marketplaces = await manager.listMarketplaces();
							await runtime.output(
								marketplaces.length === 0
									? "未配置任何市场。请尝试：\n  /marketplace add anthropics/claude-plugins-official"
									: "已配置的市场中没有可用插件",
							);
							return commandConsumed();
						}
						const lines = ["可用插件："];
						for (const plugin of plugins) {
							lines.push(`  - ${plugin.name}${plugin.version ? `@${plugin.version}` : ""}`);
							if (plugin.description) lines.push(`      ${plugin.description}`);
						}
						await runtime.output(lines.join("\n"));
						return commandConsumed();
					}
					case "install": {
						const parsed = parseMarketplaceInstallArgs(rest);
						if ("error" in parsed) return usage(parsed.error, runtime);
						const atIndex = parsed.installSpec.lastIndexOf("@");
						const pluginName = parsed.installSpec.slice(0, atIndex);
						const marketplace = parsed.installSpec.slice(atIndex + 1);
						await manager.installPlugin(pluginName, marketplace, { force: parsed.force, scope: parsed.scope });
						await runtime.reloadPlugins();
						await runtime.output(`已安装 ${pluginName}（来自 ${marketplace}）`);
						return commandConsumed();
					}
					case "uninstall": {
						const parsed = parsePluginScopeArgs(
							rest,
							"Usage: /marketplace uninstall [--scope user|project] <name@marketplace>",
						);
						if ("error" in parsed) return usage(parsed.error, runtime);
						await manager.uninstallPlugin(parsed.pluginId, parsed.scope);
						await runtime.reloadPlugins();
						await runtime.output(`已卸载 ${parsed.pluginId}`);
						return commandConsumed();
					}
					case "installed": {
						const installed = await manager.listInstalledPlugins();
						if (installed.length === 0) {
							await runtime.output("未安装任何市场插件");
						} else {
							const lines = installed.map(
								p => `  ${p.id} [${p.scope}]${p.shadowedBy ? " [shadowed]" : ""} (${p.entries.length} entry)`,
							);
							await runtime.output(`已安装的插件：
${lines.join("\n")}`);
						}
						return commandConsumed();
					}
					case "upgrade": {
						if (rest) {
							const parsed = parsePluginScopeArgs(
								rest,
								"Usage: /marketplace upgrade [--scope user|project] <name@marketplace>",
							);
							if ("error" in parsed) return usage(parsed.error, runtime);
							const result = await manager.upgradePlugin(parsed.pluginId, parsed.scope);
							await runtime.reloadPlugins();
							await runtime.output(`已将 ${parsed.pluginId} 升级至 ${result.version}`);
							return commandConsumed();
						}
						const results = await manager.upgradeAllPlugins();
						if (results.length === 0) {
							await runtime.output("所有市场插件均已是最新版本");
						} else {
							await runtime.reloadPlugins();
							const lines = results.map(r => `  ${r.pluginId}: ${r.from} -> ${r.to}`);
							await runtime.output(`已升级 ${results.length} 个插件：
${lines.join("\n")}`);
						}
						return commandConsumed();
					}
					default:
						return usage(
							`未知的 /marketplace 子命令：${verb}。使用 /marketplace help 查看可用命令。`,
							runtime,
						);
				}
			} catch (err) {
				return usage(`市场错误： ${errorMessage(err)}`, runtime);
			}
		},
		handleTui: async (command, runtime) => {
			clearSubmittedText(runtime);
			const args = command.args.trim().split(/\s+/);
			const sub = args[0] || "install";
			const rest = args.slice(1).join(" ").trim();

			// /marketplace (no args) or /marketplace install (no args) → interactive browser
			if ((sub === "install" && !rest) || (!args[0] && !command.args.trim())) {
				try {
					runtime.ctx.showPluginSelector("install");
				} catch (err) {
					runtime.ctx.showStatus(`市场错误：${err}`);
				}
				return;
			}

			const mgr = new MarketplaceManager({
				marketplacesRegistryPath: getMarketplacesRegistryPath(),
				installedRegistryPath: getInstalledPluginsRegistryPath(),
				projectInstalledRegistryPath: await resolveOrDefaultProjectRegistryPath(
					runtime.ctx.sessionManager.getCwd(),
				),
				marketplacesCacheDir: getMarketplacesCacheDir(),
				pluginsCacheDir: getPluginsCacheDir(),
				clearPluginRootsCache: clearPluginRootsAndCaches,
			});

			try {
				switch (sub) {
					case "add": {
						if (!rest) {
							runtime.ctx.showStatus("用法：/marketplace add <source>");
							return;
						}
						const entry = await mgr.addMarketplace(rest);
						runtime.ctx.showStatus(`已添加市场：${entry.name}`);
						break;
					}
					case "remove":
					case "rm": {
						if (!rest) {
							runtime.ctx.showStatus("用法：/marketplace remove <name>");
							return;
						}
						await mgr.removeMarketplace(rest);
						runtime.ctx.showStatus(`已移除市场：${rest}`);
						break;
					}
					case "update": {
						if (rest) {
							await mgr.updateMarketplace(rest);
							runtime.ctx.showStatus(`已更新市场：${rest}`);
						} else {
							const results = await mgr.updateAllMarketplaces();
							runtime.ctx.showStatus(`已更新 ${results.length} 个市场`);
						}
						break;
					}
					case "discover": {
						const plugins = await mgr.listAvailablePlugins(rest || undefined);
						if (plugins.length === 0) {
							const marketplaces = await mgr.listMarketplaces();
							if (marketplaces.length === 0) {
								runtime.ctx.showStatus(
									"未配置市场。请尝试：\n  /marketplace add anthropics/claude-plugins-official",
								);
							} else {
								runtime.ctx.showStatus("已配置的市场中没有可用插件");
							}
						} else {
							const lines = plugins.map(
								p =>
									`  ${p.name}${p.version ? `@${p.version}` : ""}${p.description ? ` - ${p.description}` : ""}`,
							);
							runtime.ctx.showStatus(`可用插件：
${lines.join("\n")}`);
						}
						break;
					}
					case "install": {
						// Parse: /marketplace install [--force] [--scope user|project] name@marketplace
						const parsed = parseMarketplaceInstallArgs(rest);
						if ("error" in parsed) {
							runtime.ctx.showStatus(parsed.error);
							return;
						}
						const atIdx = parsed.installSpec.lastIndexOf("@");
						const name = parsed.installSpec.slice(0, atIdx);
						const marketplace = parsed.installSpec.slice(atIdx + 1);
						await mgr.installPlugin(name, marketplace, { force: parsed.force, scope: parsed.scope });
						runtime.ctx.showStatus(`已安装 ${name}，来自 ${marketplace}`);
						break;
					}
					case "uninstall": {
						if (!rest) {
							// No args → open interactive uninstall selector
							runtime.ctx.showPluginSelector("uninstall");
							return;
						}
						const uninstArgs = parsePluginScopeArgs(
							rest,
							"Usage: /marketplace uninstall [--scope user|project] <name@marketplace>",
						);
						if ("error" in uninstArgs) {
							runtime.ctx.showStatus(uninstArgs.error);
							return;
						}
						await mgr.uninstallPlugin(uninstArgs.pluginId, uninstArgs.scope);
						runtime.ctx.showStatus(`已卸载 ${uninstArgs.pluginId}`);
						break;
					}
					case "installed": {
						const installed = await mgr.listInstalledPlugins();
						if (installed.length === 0) {
							runtime.ctx.showStatus("未安装任何市场插件");
						} else {
							const lines = installed.map(
								p => `  ${p.id} [${p.scope}]${p.shadowedBy ? " [shadowed]" : ""} (${p.entries.length} entry)`,
							);
							runtime.ctx.showStatus(`已安装插件：
${lines.join("\n")}`);
						}
						break;
					}
					case "upgrade": {
						if (rest) {
							const upArgs = parsePluginScopeArgs(
								rest,
								"Usage: /marketplace upgrade [--scope user|project] <name@marketplace>",
							);
							if ("error" in upArgs) {
								runtime.ctx.showStatus(upArgs.error);
								return;
							}
							const result = await mgr.upgradePlugin(upArgs.pluginId, upArgs.scope);
							runtime.ctx.showStatus(`已将 ${upArgs.pluginId} 升级至 ${result.version}`);
						} else {
							const results = await mgr.upgradeAllPlugins();
							if (results.length === 0) {
								runtime.ctx.showStatus("所有市场插件均已是最新版本");
							} else {
								const lines = results.map(r => `  ${r.pluginId}: ${r.from} -> ${r.to}`);
								runtime.ctx.showStatus(`已升级 ${results.length} 个插件：
${lines.join("\n")}`);
							}
						}
						break;
					}
					case "help": {
						runtime.ctx.showStatus(
							[
								"市场命令：",
								"  /marketplace                              浏览并安装插件",
								"  /marketplace add <source>                  添加市场（e.g owner/repo）",
								"  /marketplace remove <name>                 移除市场",
								"  /marketplace update [name]                 重新获取目录",
								"  /marketplace list                          列出已配置的市场",
								"  /marketplace discover [marketplace]        浏览可用插件",
								"  /marketplace install <name@marketplace>    安装插件",
								"  /marketplace uninstall <name@marketplace>  卸载插件",
								"  /marketplace installed                     列出已安装的插件",
								"  /marketplace upgrade [name@marketplace]    升级插件",
								"",
								"快速开始：",
								"  /marketplace add anthropics/claude-plugins-official（添加市场）",
								"  /marketplace                               （打开交互式浏览器）",
							].join("\n"),
						);
						break;
					}
					default: {
						const marketplaces = await mgr.listMarketplaces();
						if (marketplaces.length === 0) {
							runtime.ctx.showStatus(
								"尚未配置插件市场。\n\n开始使用：\n  /marketplace add anthropics/claude-plugins-official\n\n然后使用 /marketplace 或 /marketplace discover 浏览插件",
							);
						} else {
							const lines = marketplaces.map(m => `  ${m.name}  ${m.sourceUri}`);
							runtime.ctx.showStatus(
								`插件市场：
${lines.join("\n")}

使用 /marketplace discover 浏览插件，或使用 /marketplace help 查看所有命令`,
							);
						}
						break;
					}
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				runtime.ctx.showStatus(`插件市场错误：${msg}`);
			}
		},
	},
	{
		name: "plugins",
		aliases: ["plugin"],
		icon: "package",
		description: "查看和管理已安装插件",
		acpDescription: "Manage plugins",
		acpInputHint: "[list|enable|disable]",
		subcommands: [
			{ name: "list", description: "列出所有已安装插件（npm + 市场）" },
			{ name: "enable", description: "启用已安装插件", usage: "<plugin>" },
			{ name: "disable", description: "禁用已安装插件", usage: "<plugin>" },
		],
		allowArgs: true,
		handle: async (command, runtime) => {
			const { verb, rest } = parseSubcommand(command.args);
			try {
				if (verb === "enable" || verb === "disable") {
					const parsed = parsePluginScopeArgs(rest, `Usage: /plugins ${verb} [--scope user|project] <plugin>`);
					if ("error" in parsed) return usage(parsed.error, runtime);
					const marketplace = await createMarketplaceManager(runtime);
					const marketplaceIds = new Set((await marketplace.listInstalledPlugins()).map(plugin => plugin.id));
					await setInstalledPluginEnabled(parsed.pluginId, {
						enabled: verb === "enable",
						scope: parsed.scope,
						marketplaceIds,
						marketplace,
						npm: new PluginManager(),
					});
					await runtime.reloadPlugins();
					await runtime.output(`${verb === "enable" ? "已启用" : "已禁用"} ${parsed.pluginId}`);
					return commandConsumed();
				}
				// Default: list
				const lines: string[] = [];
				const npmManager = new PluginManager();
				const npmPlugins = await npmManager.list();
				if (npmPlugins.length > 0) {
					lines.push("npm 插件：");
					for (const plugin of npmPlugins) {
						const status = plugin.enabled === false ? " (disabled)" : "";
						lines.push(`  ${plugin.name}@${plugin.version}${status}`);
					}
				}

				const marketplaceManager = await createMarketplaceManager(runtime);
				const marketplacePlugins = await marketplaceManager.listInstalledPlugins();
				if (marketplacePlugins.length > 0) {
					if (lines.length > 0) lines.push("");
					lines.push("市场插件：");
					for (const plugin of marketplacePlugins) {
						const entry = plugin.entries[0];
						const status = entry?.enabled === false ? " (disabled)" : "";
						const shadowed = plugin.shadowedBy ? " [shadowed]" : "";
						lines.push(`  ${plugin.id} v${entry?.version ?? "?"}${status} [${plugin.scope}]${shadowed}`);
					}
				}

				await runtime.output(lines.length === 0 ? "未安装插件" : lines.join("\n"));
				return commandConsumed();
			} catch (err) {
				return usage(`插件错误：${errorMessage(err)}`, runtime);
			}
		},
	},
	{
		name: "reload-plugins",
		icon: "restart",
		description: "重新加载所有插件（技能、命令、钩子、工具、智能体、MCP）",
		acpDescription: "Reload all plugins",
		handle: async (_command, runtime) => {
			await runtime.reloadPlugins();
			await runtime.output("插件已重新加载。");
			return commandConsumed();
		},
		handleTui: async (_command, runtime) => {
			await reloadTuiPluginState(runtime.ctx);
			runtime.ctx.showStatus("插件已重新加载。");
			clearSubmittedText(runtime);
		},
	},
];
