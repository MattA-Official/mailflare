// Built-in folder views, ported from legacy/src/components/messages/message-folder-configs.ts.
import type { MessageFolderConfig } from "./types";

export const inboxFolderConfig: MessageFolderConfig = {
	folder: "inbox",
	title: "Inbox",
	titleKey: "navigation.inbox",
	emptyTextKey: "folder.empty.inbox",
	emptyText: "No emails",
	hrefPrefix: "/inbox",
	icon: "i-lucide-star",
	showRowBadge: false,
};

export const starredFolderConfig: MessageFolderConfig = {
	folder: "starred",
	title: "Starred",
	titleKey: "navigation.starred",
	emptyTextKey: "folder.empty.starred",
	emptyText: "No starred emails",
	hrefPrefix: "/starred",
	icon: "i-lucide-star",
	badgeVariant: "outline",
};

export const snoozedFolderConfig: MessageFolderConfig = {
	folder: "snoozed",
	title: "Snoozed",
	titleKey: "navigation.snoozed",
	emptyTextKey: "folder.empty.snoozed",
	emptyText: "No snoozed emails",
	hrefPrefix: "/snoozed",
	icon: "i-lucide-clock",
	badgeVariant: "outline",
};

export const sentFolderConfig: MessageFolderConfig = {
	folder: "sent",
	title: "Sent",
	titleKey: "navigation.sent",
	emptyTextKey: "folder.empty.inbox",
	emptyText: "No emails",
	hrefPrefix: "/sent",
	icon: "i-lucide-send",
	badgeVariant: "outline",
};

export const scheduledFolderConfig: MessageFolderConfig = {
	folder: "scheduled",
	title: "Scheduled",
	titleKey: "navigation.scheduled",
	emptyTextKey: "folder.empty.scheduled",
	emptyText: "No scheduled emails",
	hrefPrefix: "/scheduled",
	icon: "i-lucide-calendar-clock",
	badgeVariant: "outline",
};

export const draftsFolderConfig: MessageFolderConfig = {
	folder: "drafts",
	title: "Drafts",
	titleKey: "navigation.drafts",
	emptyText: "No drafts",
	emptyTextKey: "folder.drafts.empty",
	hrefPrefix: "/drafts",
	icon: "i-lucide-file-text",
	badgeVariant: "outline",
};

export const archivedFolderConfig: MessageFolderConfig = {
	folder: "archived",
	title: "Archived",
	titleKey: "navigation.archived",
	emptyTextKey: "folder.empty.archived",
	emptyText: "No archived emails",
	hrefPrefix: "/archived",
	icon: "i-lucide-archive",
	badgeVariant: "outline",
};

export const spamFolderConfig: MessageFolderConfig = {
	folder: "spam",
	title: "Spam",
	titleKey: "navigation.spam",
	emptyTextKey: "folder.empty.spam",
	emptyText: "No spam",
	hrefPrefix: "/spam",
	icon: "i-lucide-shield-alert",
	badgeVariant: "outline",
};

export const trashFolderConfig: MessageFolderConfig = {
	folder: "trash",
	title: "Trash",
	titleKey: "navigation.trash",
	emptyTextKey: "folder.empty.trash",
	emptyText: "No emails in trash",
	hrefPrefix: "/trash",
	icon: "i-lucide-trash-2",
	badgeVariant: "outline",
};

/** A user-created folder; its name arrives later from the folders API. */
export function customFolderConfig(folderId: string, name = "Folder"): MessageFolderConfig {
	return {
		folder: "inbox",
		folderId,
		title: name,
		emptyText: "No emails in this folder",
		hrefPrefix: `/folders/${folderId}`,
		icon: "i-lucide-folder",
		showRowBadge: false,
	};
}
