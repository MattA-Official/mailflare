// Ported from legacy/src/app/(admin)/mailboxes/utils.ts, [id]/utils.ts and [id]/avatar-utils.ts.
import { appendOptimizedAvatar, MAX_SOURCE_AVATAR_SIZE } from '#lib/avatar-upload-client'
import { api } from '~/utils/auth-client'
import type { Mailbox, MailboxAliasesResponse, MailboxDetail, SharedInboxAccessResponse } from '~/types/admin/email/mailboxes'

/**
 * Fired whenever this area changes the mailbox list (create, rename, delete, aliases, avatar), so
 * the mailbox selector can drop its cached list. Upstream called clearMailboxesCache() directly.
 */
export const MAILBOXES_CHANGED_EVENT = 'mailflare:mailboxes-changed'

export function notifyMailboxesChanged() {
  window.dispatchEvent(new CustomEvent(MAILBOXES_CHANGED_EVENT))
}

export function getMailboxAddress(mailbox: Pick<Mailbox, 'localPart' | 'hostname'>): string {
  return `${mailbox.localPart}@${mailbox.hostname}`
}

export function getMailboxName(mailbox: Pick<Mailbox, 'displayName' | 'localPart'>): string {
  return mailbox.displayName?.trim() || mailbox.localPart
}

/** The mailbox pages are served both under the admin area and under Settings. */
export function getMailboxesBase(path: string) {
  return path.startsWith('/settings') ? '/settings/mailboxes' : '/mailboxes'
}

export function formatAccountDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export async function fetchMailbox(id: string): Promise<MailboxDetail> {
  const json = await api<{ mailbox?: MailboxDetail }>(`/api/mailboxes/${id}`)
  if (!json.mailbox) throw new Error('Failed to load mailbox')
  return json.mailbox
}

export async function updateMailboxSettings(id: string, input: { displayName: string, useAllDomains: boolean }): Promise<MailboxDetail> {
  const json = await api<{ mailbox?: MailboxDetail }>(`/api/mailboxes/${id}`, { method: 'PATCH', body: input })
  if (!json.mailbox) throw new Error('Failed to update mailbox')
  notifyMailboxesChanged()
  return json.mailbox
}

export function fetchSharedInboxAccess(id: string) {
  return api<SharedInboxAccessResponse>(`/api/mailboxes/${id}/access`)
}

export async function grantSharedInboxAccess(id: string, userId: string) {
  await api(`/api/mailboxes/${id}/access`, { method: 'POST', body: { userId, permission: 'full_access' } })
}

export async function revokeSharedInboxAccess(id: string, userId: string) {
  await api(`/api/mailboxes/${id}/access?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

export function fetchMailboxAliases(id: string) {
  return api<MailboxAliasesResponse>(`/api/mailboxes/${id}/aliases`)
}

export async function createMailboxAlias(id: string, input: { domainId: string, localPart: string }) {
  await api(`/api/mailboxes/${id}/aliases`, { method: 'POST', body: input })
  notifyMailboxesChanged()
}

export async function deleteMailboxAlias(id: string, aliasId: string) {
  await api(`/api/mailboxes/${id}/aliases?aliasId=${encodeURIComponent(aliasId)}`, { method: 'DELETE' })
  notifyMailboxesChanged()
}

export async function deleteMailbox(id: string) {
  await api(`/api/mailboxes/${id}`, { method: 'DELETE' })
  notifyMailboxesChanged()
}

export const MAILBOX_AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

export function validateMailboxAvatar(file: File): string | null {
  if (!MAILBOX_AVATAR_ACCEPT.split(',').includes(file.type)) return 'Use a JPEG, PNG, WebP, or GIF image'
  if (file.size > MAX_SOURCE_AVATAR_SIZE) return 'Image must be 10 MB or smaller'
  return null
}

export function getMailboxAvatarUrl(mailboxId: string): string {
  return `/api/mailboxes/${mailboxId}/avatar?v=${Date.now()}`
}

export async function uploadMailboxAvatar(mailboxId: string, file: File): Promise<void> {
  const body = new FormData()
  await appendOptimizedAvatar(body, file)
  await api(`/api/mailboxes/${mailboxId}/avatar`, { method: 'POST', body })
  notifyMailboxesChanged()
}
