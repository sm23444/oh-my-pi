// Copied into the portable package root; runs independently from ui-smoke.ts
// so the editor and its theme singleton initialize on their own module graph.
import { CustomEditor } from "./node_modules/@oh-my-pi/pi-tui/src/prompt/custom-editor";
import { chipLabel, compactImageMarkers, formatVisionMarker, referencedAttachments, shiftImageMarkers } from "./node_modules/@oh-my-pi/pi-tui/src/prompt/composer-attachments";
import { getEditorTheme, initTheme, setSymbolPreset, theme } from "./node_modules/@oh-my-pi/pi-tui/src/theme/theme";
import type { ImageContent } from "@oh-my-pi/pi-ai";

await initTheme(false);
const originalPreset = theme.getSymbolPreset();
const image: ImageContent = {
	type: "image", mimeType: "image/png",
	data: "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8DwnwEKmBhQAAA9+AQBHYLp7wAAAABJRU5ErkJggg==",
};
try {
	for (const preset of ["ascii", "unicode", "nerd"] as const) {
		setSymbolPreset(preset);
		for (const kind of ["image", "video"] as const) {
			const editor = new CustomEditor(getEditorTheme());
			const marker = formatVisionMarker(kind, 1, kind === "image" ? { width: 2, height: 2 } : undefined);
			editor.pendingImages = [image];
			editor.insertAtom(chipLabel(kind, 1), marker);
			const refs = referencedAttachments(editor.getText(), new Map([[chipLabel(kind, 1), kind]]));
			if (!refs[kind].has(1)) throw new Error(`Attachment chip not recognized: ${preset}/${kind}`);
			const submitted: { text: string; images: ImageContent[] }[] = [];
			editor.onSubmit = text => {
				const compacted = compactImageMarkers(text, editor.pendingImages.length);
				submitted.push({ text: compacted?.text ?? text, images: compacted ? compacted.keep.map(index => editor.pendingImages[index]) : [...editor.pendingImages] });
			};
			editor.handleInput("\r");
			if (submitted.length !== 1 || submitted[0].images.length !== 1 || submitted[0].images[0] !== image || !referencedAttachments(submitted[0].text, new Map())[kind].has(1)) throw new Error(`Attachment lost before submission: ${preset}/${kind}`);
			editor.setDraft(submitted[0].text, submitted[0].images);
			if (editor.getText() !== chipLabel(kind, 1) || compactImageMarkers(editor.getExpandedText(), editor.pendingImages.length) !== null) throw new Error(`Restored attachment lost its reference: ${preset}/${kind}`);
			editor.setText("附件已删除");
			editor.handleInput("\r");
			if (submitted.length !== 2 || submitted[1].images.length !== 0) throw new Error(`Deleted attachment still submitted: ${preset}/${kind}`);
			editor.clearDraft();
		}
	}
	const remapped = compactImageMarkers(`${formatVisionMarker("video", 3)} attachment://3 ${formatVisionMarker("image", 2)}`, 3);
	if (!remapped || JSON.stringify(remapped.keep) !== "[1,2]" || remapped.text !== "[Video #2] attachment://2 [Image #1]") throw new Error("Multiple attachment deletion/remapping changed");
	const queued = shiftImageMarkers(`${formatVisionMarker("image", 1)} attachment://1`, 2, 1);
	if (queued !== "[Image #3] attachment://3") throw new Error("Queued attachment references did not shift together");
} finally {
	setSymbolPreset(originalPreset);
}
process.stdout.write("Attachments verified: pasted image/video editor submissions retain image blocks; restored drafts, deletion, remapping, queued references and ascii/unicode/nerd chips preserved.\n");
