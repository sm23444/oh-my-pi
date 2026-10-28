/**
 * Render every built-in tool's renderer across its lifecycle states.
 */

import { Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { galleryHelp as commandHelp } from "../cli/command-help";
import {
	GALLERY_STATE_TOKENS,
	GALLERY_SURFACE_TOKENS,
	type GalleryState,
	type GallerySurface,
	parseGalleryStates,
	parseGallerySurfaces,
	runGalleryCommand,
} from "../cli/gallery-cli";

export default class Gallery extends Command {
	static description = commandHelp.description;
	static flags = {
		surface: Flags.string({
			description: "仅渲染工具、输入框或片段界面（可重复；默认：全部）",
			options: [...GALLERY_SURFACE_TOKENS],
			multiple: true,
		}),
		tool: Flags.string({ char: "t", description: "按名称渲染单个工具" }),
		composer: Flags.string({ description: "按名称渲染单个输入框形状" }),
		segment: Flags.string({ description: "按名称渲染单个状态栏片段" }),
		state: Flags.string({
			char: "s",
			description: "仅渲染给定的生命周期状态",
			options: GALLERY_STATE_TOKENS,
			multiple: true,
		}),
		width: Flags.integer({ char: "w", description: "渲染宽度(列数)" }),
		expanded: Flags.boolean({
			char: "e",
			description: "渲染每个渲染器的展开变体",
			default: false,
		}),
		plain: Flags.boolean({ description: "从输出中去掉 ANSI 样式", default: false }),
		screenshot: Flags.boolean({
			description:
				"通过 VHS 将渲染输出捕获为 PNG 截图而不是打印 ANSI(需要 vhs)",
			default: false,
		}),
		out: Flags.string({
			char: "o",
			description: "截图输出路径(与 --screenshot 搭配);拆分为多张时按图像添加后缀",
		}),
		font: Flags.string({ description: "截图字体族(默认:JetBrainsMono Nerd Font)" }),
		"font-size": Flags.integer({ description: "截图字号(磅,默认:18)" }),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(Gallery);
		let states: GalleryState[] | undefined;
		let surfaces: GallerySurface[] | undefined;
		try {
			states = parseGalleryStates(flags.state);
			surfaces = parseGallerySurfaces(flags.surface);
		} catch (err) {
			process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
			process.exitCode = 1;
			return;
		}
		await runGalleryCommand({
			surfaces,
			tool: flags.tool,
			composer: flags.composer,
			segment: flags.segment,
			states,
			width: flags.width,
			expanded: flags.expanded,
			plain: flags.plain,
			screenshot: flags.screenshot,
			out: flags.out,
			font: flags.font,
			fontSize: flags["font-size"],
		});
	}
}
