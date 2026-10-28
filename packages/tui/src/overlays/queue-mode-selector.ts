import { type SelectItem, SelectList, type SgrMouseEvent } from "../index";
import { getSelectListTheme } from "../theme/theme";
import { OverlayPanel } from "../chrome/overlay-box";
import { routeSelectListMouseWithTopBorder } from "../chrome/select-list-mouse-routing";
import type { DescribeContext, NativeNode, NativeUiEvent } from "../native/node";
import { SelectListSheet } from "../native/picker";

/**
 * Component that renders a queue mode selector with borders
 */
export class QueueModeSelectorComponent extends OverlayPanel {
	#selectList: SelectList;
	#sheet: SelectListSheet;

	constructor(
		currentMode: "all" | "one-at-a-time",
		onSelect: (mode: "all" | "one-at-a-time") => void,
		onCancel: () => void,
	) {
		super("Queue Mode", "omp.overlay.queue-mode");

		const queueModes: SelectItem[] = [
			{
				value: "one-at-a-time",
				label: "逐条处理",
				description: "逐条处理排队的消息（推荐）",
			},
			{ value: "all", label: "全部", description: "一次性处理所有排队的消息" },
		];

		// Create selector
		this.#selectList = new SelectList(queueModes, 2, getSelectListTheme());

		// Preselect current mode
		const currentIndex = queueModes.findIndex(item => item.value === currentMode);
		if (currentIndex !== -1) {
			this.#selectList.setSelectedIndex(currentIndex);
		}

		this.#selectList.onSelect = item => {
			onSelect(item.value as "all" | "one-at-a-time");
		};

		this.#selectList.onCancel = () => {
			onCancel();
		};

		this.addChild(this.#selectList);
		this.#sheet = new SelectListSheet(this.#selectList, {
			title: "队列模式",
			subtitle: "omp 工作时发送消息的送达方式",
			icon: "list",
			noun: "modes",
			current: [currentMode],
			// The terminal list shows the setting's values; the sheet names them for people.
			decorate: item =>
				item.value === "one-at-a-time"
					? {
							label: "一次一条",
							detail: "每条排队消息各自占用一轮",
							badges: [{ text: "recommended" }],
						}
					: { label: "一次性全部发送", detail: "排队消息会在同一轮中一起发送" },
		});
	}

	override describe(cx: DescribeContext): NativeNode | null {
		return cx.supports("picker") ? this.#sheet.describe() : super.describe(cx);
	}

	/** Picker pointer events drive the list exactly as its keys do. */
	handleNativeEvent(event: NativeUiEvent): void {
		this.#sheet.handle(event);
	}

	getSelectList(): SelectList {
		return this.#selectList;
	}

	routeMouse(event: SgrMouseEvent, line: number, col: number): void {
		routeSelectListMouseWithTopBorder(this.#selectList, event, line, col);
	}
}
