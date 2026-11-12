import type { AttachmentPreviewKind, AttachmentVisual, MessageAttachment } from "./types";

export function getAttachmentFileUrl(
	messageId: string,
	attachmentId: string,
	mode: "download" | "preview" | "risk" | "acknowledged-download" = "download",
): string {
	const suffix = { preview: "?preview=1", risk: "?risk=1", download: "?download=1", "acknowledged-download": "?download=1&acknowledge=1" }[mode];
	return `/api/messages/${messageId}/attachments/${attachmentId}${suffix}`;
}

export function getAttachmentPreviewKind(
	attachment: Pick<MessageAttachment, "type">,
): AttachmentPreviewKind {
	if (attachment.type === "application/pdf") return "pdf";
	if (attachment.type.startsWith("audio/")) return "audio";
	if (attachment.type.startsWith("video/")) return "video";
	if (attachment.type.startsWith("image/") && attachment.type !== "image/svg+xml") return "image";
	if (
		attachment.type.startsWith("text/plain") ||
		attachment.type === "application/json" ||
		attachment.type === "application/xml" ||
		attachment.type === "text/csv"
	) {
		return "text";
	}
	return "unsupported";
}


export function getAttachmentVisual(
	attachment: Pick<MessageAttachment, "filename" | "type">,
): AttachmentVisual {
	const type = attachment.type.toLowerCase();
	const filename = attachment.filename.toLowerCase();
	const previewKind = getAttachmentPreviewKind(attachment);

	if (previewKind === "image") {
		return {
			icon: "i-lucide-image",
			iconClassName: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
			labelKey: "attachment.image",
			thumbnail: "image",
		};
	}
	if (previewKind === "video") {
		return {
			icon: "i-lucide-file-video-camera",
			iconClassName: "bg-rose-50 text-rose-700",
			labelKey: "attachment.video",
			thumbnail: "video",
		};
	}
	if (previewKind === "audio") {
		return {
			icon: "i-lucide-music",
			iconClassName: "bg-orange-50 text-orange-700",
			labelKey: "attachment.audio",
			thumbnail: null,
		};
	}
	if (previewKind === "pdf") {
		return {
			icon: "i-lucide-file-text",
			iconClassName: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
			labelKey: "attachment.pdf",
			thumbnail: null,
		};
	}
	if (
		type.includes("spreadsheet") ||
		type.includes("excel") ||
		type === "text/csv" ||
		/\.(csv|xls|xlsx|ods)$/.test(filename)
	) {
		return {
			icon: "i-lucide-file-spreadsheet",
			iconClassName: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
			labelKey: "attachment.spreadsheet",
			thumbnail: null,
		};
	}
	if (
		type.includes("presentation") ||
		type.includes("powerpoint") ||
		/\.(ppt|pptx|odp)$/.test(filename)
	) {
		return {
			icon: "i-lucide-presentation",
			iconClassName: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
			labelKey: "attachment.presentation",
			thumbnail: null,
		};
	}
	if (
		type.includes("zip") ||
		type.includes("compressed") ||
		type.includes("archive") ||
		/\.(zip|rar|7z|tar|gz|bz2)$/.test(filename)
	) {
		return {
			icon: "i-lucide-file-archive",
			iconClassName: "bg-violet-50 text-violet-700",
			labelKey: "attachment.archive",
			thumbnail: null,
		};
	}
	if (
		type.includes("json") ||
		type.includes("xml") ||
		type.includes("javascript") ||
		type.includes("typescript") ||
		/\.(js|jsx|ts|tsx|json|xml|html|css|md|yml|yaml)$/.test(filename)
	) {
		return {
			icon: "i-lucide-file-code",
			iconClassName: "bg-cyan-50 text-cyan-700",
			labelKey: "attachment.code",
			thumbnail: null,
		};
	}
	if (previewKind === "text" || type.includes("word") || /\.(doc|docx|odt|rtf|txt)$/.test(filename)) {
		return {
			icon: "i-lucide-file-type",
			iconClassName: "bg-sky-50 text-sky-700",
			labelKey: "attachment.document",
			thumbnail: null,
		};
	}

	return {
		icon: "i-lucide-file-text",
		iconClassName: "bg-elevated text-muted",
		labelKey: "attachment.file",
		thumbnail: null,
	};
}
