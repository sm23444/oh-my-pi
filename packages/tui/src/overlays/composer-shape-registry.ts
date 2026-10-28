import { type ComposerStyle, registerComposerStyle } from "../index";
import type { SubmenuOption } from "./settings-defs";

/** Composer shape id; extensions may register additional values at runtime. */
export type ComposerShape = string;

/** Built-in composer choices and their shared settings/setup copy. */
export const BUILTIN_COMPOSER_SHAPES = [
	{
		value: "band",
		label: "状态带（默认）",
		description: "弯曲提示符上方平顶软上限状态带，无边框",
	},
	{
		value: "box",
		label: "圆角框",
		description: "状态行嵌入上边框，紧凑两行提示符",
	},
	{
		value: "claude",
		label: "Claude Code 模式",
		description: "上下通栏横线，状态行在底部",
	},
	{
		value: "pi",
		label: "Pi",
		description: "框式横线，状态行在底部",
	},
	{
		value: "borderless",
		label: "无边框",
		description: "简洁提示符字形，状态行在底部，无框",
	},
	{
		value: "rule",
		label: "顶栏停靠",
		description: "单条顶部横线，状态停靠其上与其下",
	},
	{
		value: "field",
		label: "紧凑输入场",
		description: "单行填充输入场，两端强调收尾",
	},
	{
		value: "rail",
		label: "强调轨道",
		description: "由单条强调轨道锚定的单行填充输入场",
	},
] as const;

/** Built-in composer ids used by tests and non-runtime consumers. */
export const COMPOSER_SHAPE_VALUES = BUILTIN_COMPOSER_SHAPES.map(shape => shape.value);

/** Visual composer style and selector copy registered by an extension. */
export interface ComposerShapeDefinition {
	label: string;
	description?: string;
	style: ComposerStyle;
}

const extensionComposerShapes = new Map<string, SubmenuOption>();

/** Install one extension composer shape into rendering and selector registries. */
export function installExtensionComposerShape(definition: ComposerShapeDefinition): () => void {
	const unregisterStyle = registerComposerStyle(definition.style);
	const id = definition.style.id;
	const option: SubmenuOption = {
		value: id,
		label: definition.label,
		description: definition.description,
	};
	extensionComposerShapes.set(id, option);
	return () => {
		if (extensionComposerShapes.get(id) === option) extensionComposerShapes.delete(id);
		unregisterStyle();
	};
}

/** Available built-in and extension composer choices in selector order. */
export function getComposerShapeOptions(): readonly SubmenuOption[] {
	return [...BUILTIN_COMPOSER_SHAPES, ...extensionComposerShapes.values()];
}
