// Types for the reading-mail area, gathered from upstream's sibling *-types.d.ts files
// (components/messages, components/message-actions, app/(dashboard)/inbox/[messageId]).
import type { TranslationKey } from "#lib/i18n/types";
import type { ReplyContentParts } from "#lib/email/reply-content-types";
import type { BulkMessageAction } from "#handlers/api/messages/bulk/types";
import type { Message, MessageFolder } from "~/types/messages";

export type MessageFolderConfig = {
	folder: MessageFolder;
	title: string;
	/** Translation keys for built-in folders; custom folders show `title` as typed by the user. */
	titleKey?: TranslationKey;
	emptyText: string;
	emptyTextKey?: TranslationKey;
	hrefPrefix: string;
	folderId?: string;
	/** Lucide icon name, e.g. `i-lucide-star`. */
	icon: string;
	badgeVariant?: "default" | "secondary" | "outline";
	showRowBadge?: boolean;
};

export type RowMessageAction = "archive" | "trash" | "read" | "unread";

export type SelectedMessage = Pick<Message, "id" | "read">;

export type PageRange = {
	start: number;
	end: number;
	total: number;
};

export type EmailPageTitleInput = {
	location: string;
	total: number;
	unread: number;
	emailAddress: string | null;
	/** Set for the Inbox, which shows only the unread count. */
	inbox?: boolean;
};

export type MessageDetailResponse = {
	message?: Message;
	body?: {
		htmlBody: string | null;
		textBody: string | null;
	} | null;
	attachments?: MessageAttachment[];
	unsubscribeUrl?: string | null;
	/** Unsubscribe link found in the body when the message has no List-Unsubscribe header. */
	unsubscribeViaBody?: string | null;
	/** ISO time a queued message is waiting to be sent, when it is a scheduled send. */
	scheduledAt?: string | null;
	error?: string;
};

export type MessageAttachment = {
	contentId: string | null;
	disposition: "attachment" | "inline";
	filename: string;
	id: string;
	messageId: string;
	size: number;
	type: string;
};

export type MessageBodyDisplay = ReplyContentParts & {
	htmlBody: string | null;
	/** Quoted/forwarded HTML a Mailflare composer folded under the message, shown collapsed. */
	quotedHtml: string | null;
	hasQuotedContent: boolean;
};

export interface CloudAttachment {
	filename: string;
	id: string;
	provider: "OneDrive";
	url: string;
}

export interface CloudAttachmentExtraction {
	attachments: CloudAttachment[];
	content: string;
}

export type AttachmentPreviewKind = "image" | "pdf" | "audio" | "video" | "text" | "unsupported";

export type AttachmentVisual = {
	icon: string;
	iconClassName: string;
	labelKey: TranslationKey;
	thumbnail: "image" | "video" | null;
};

export type AuthenticationSummary = {
	status: string;
	detail: string | null;
};

export type MessageSourceSummary = {
	messageId: string | null;
	createdAt: string | null;
	from: string | null;
	to: string | null;
	subject: string | null;
	spf: AuthenticationSummary | null;
	dkim: AuthenticationSummary | null;
	dmarc: AuthenticationSummary | null;
};

export type MessageDetailsMessage = Pick<
	Message,
	| "id"
	| "direction"
	| "fromAddr"
	| "fromContactName"
	| "toAddr"
	| "ccAddr"
	| "bccAddr"
	| "replyTo"
	| "subject"
	| "createdAt"
>;

export type MessageDetailNavigationState = {
	previousId: string | null;
	nextId: string | null;
	unreadOrder: number;
	totalUnread: number;
};

export type ForwardDraftInput = {
	mailboxId: string | null;
	ownAddress?: string | null;
	message: ReplyableMessage & Pick<Message, "id" | "subject" | "createdAt">;
	bodyText?: string | null;
	bodyHtml?: string | null;
};

export type ReplyMode = "reply" | "replyAll";

export type ReplyableMessage = Pick<
	Message,
	"direction" | "fromAddr" | "toAddr" | "ccAddr" | "replyTo" | "providerMessageId" | "references" | "threadId"
>;

export type ReplyRecipients = {
	to: string[];
	cc: string[];
};

export type ReplyDraftInput = {
	mailboxId: string | null;
	senderAddress: string;
	ownAddress?: string | null;
	subject?: string | null;
	bodyText?: string | null;
	bodyHtml?: string | null;
	sentAt?: string | null;
	recipients: ReplyRecipients;
	threading?: {
		inReplyTo: string | null;
		references: string | null;
		threadId: string | null;
	};
};

export type TrashSenderRuleInput = {
	mailboxId: string;
	senderAddress: string;
};

export type BlockMessageContactInput = {
	mailboxId: string;
	senderAddress: string;
};

export type MoveMessageActionItem = {
	action: BulkMessageAction;
	labelKey: TranslationKey;
	icon: string;
};

export type CustomFolderSummary = {
	id: string;
	name: string;
	color: string;
};
