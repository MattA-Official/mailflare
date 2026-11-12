// Mailbox name and signature helpers for the account page, ported from
// legacy/src/components/settings/utils.ts. Kept apart from account.ts because they reach the shared
// mailbox cache.
import { authFetch } from '~/utils/auth-client'

interface MailboxAddressParts { localPart: string, hostname: string }

interface MailboxResponse {
  mailbox?: {
    id: string
    domainId: string
    localPart: string
    hostname: string
    displayName: string | null
    signature?: string | null
    hasAvatar?: boolean
    isPrimary?: boolean
  }
  error?: unknown
}

function errorText(data: { error?: unknown } | null | undefined, fallback: string): string {
  return typeof data?.error === 'string' ? data.error : fallback
}

export function getMailboxAddress(mailbox: MailboxAddressParts): string {
  return `${mailbox.localPart}@${mailbox.hostname}`
}

export async function updateCurrentMailboxName(id: string, displayName: string) {
  const res = await authFetch(`/api/mailboxes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName }),
  })
  const data = (await res.json()) as MailboxResponse
  if (!res.ok || !data.mailbox) throw new Error(errorText(data, 'Failed to update mailbox'))
  clearMailboxesCache()
  return {
    id: data.mailbox.id,
    domainId: data.mailbox.domainId,
    localPart: data.mailbox.localPart,
    hostname: data.mailbox.hostname,
    displayName: data.mailbox.displayName,
    hasAvatar: data.mailbox.hasAvatar,
    isPrimary: data.mailbox.isPrimary,
  }
}

export async function updateMailboxSignature(mailboxId: string, signature: string): Promise<string> {
  const res = await authFetch(`/api/mailboxes/${mailboxId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature }),
  })
  const data = (await res.json()) as MailboxResponse
  if (!res.ok || !data.mailbox) throw new Error(errorText(data, 'Failed to update signature'))
  clearMailboxesCache()
  return data.mailbox.signature ?? ''
}

/** Same test the composer uses (rich-text-utils isHtmlSignature) to decide whether a signature is HTML. */
export function isHtmlSignature(signature: string | null | undefined): boolean {
  return /<\/?[a-z][a-z0-9]*[\s>/]/i.test(signature ?? '')
}
