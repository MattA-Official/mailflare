// The Contacts page's calls to /api/contacts. Ported from
// legacy/src/components/contacts/contacts-page-utils.ts and contacts-page-types.d.ts.
import type { ContactSource } from '#lib/email/address-types'
import { authFetch } from '~/utils/auth-client'

export type ContactListItem = {
  id: string
  userId: string
  email: string
  displayName: string | null
  source: ContactSource
  blocked: boolean
  remoteContentAllowed: boolean
  lastSeenAt: string | null
  createdAt: string
  hasAvatar: boolean
}

type ContactsListResponse = { contacts?: ContactListItem[], nextCursor?: string | null, error?: string }
type ContactMutationResponse = { contact?: ContactListItem, ok?: boolean, error?: string }

/** Saved is what the person added; Other is every sender and recipient collected automatically. */
export type ContactsFilter = 'saved' | 'other'
export type ContactsPage = { contacts: ContactListItem[], nextCursor: string | null }

export const CONTACTS_PAGE_SIZE = 100

/** Shared by the header and rows so the columns line up. */
export const CONTACT_COLUMNS = 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 md:grid-cols-[auto_minmax(0,2fr)_minmax(0,1fr)_auto]'

export async function fetchContacts(mailboxId: string, query: string, filter: ContactsFilter, cursor: string | null = null): Promise<ContactsPage> {
  const params = new URLSearchParams({ mailboxId, filter, limit: String(CONTACTS_PAGE_SIZE) })
  if (query.trim()) params.set('q', query.trim())
  if (cursor) params.set('cursor', cursor)
  const response = await authFetch(`/api/contacts?${params.toString()}`)
  const data = (await response.json()) as ContactsListResponse
  if (!response.ok) throw new Error(data.error ?? 'Unable to load contacts')
  return { contacts: data.contacts ?? [], nextCursor: data.nextCursor ?? null }
}

/** True when deleting would also lose a block or an image consent kept on the same row. */
export function contactHasPreferences(contact: Pick<ContactListItem, 'blocked' | 'remoteContentAllowed'>): boolean {
  return contact.blocked || contact.remoteContentAllowed
}

export async function createContact(mailboxId: string, input: { address: string, displayName?: string }): Promise<ContactListItem> {
  const response = await authFetch('/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mailboxId, address: input.address, displayName: input.displayName }),
  })
  const data = (await response.json()) as ContactMutationResponse
  if (!response.ok || !data.contact) throw new Error(data.error ?? 'Unable to save contact')
  return data.contact
}

export async function renameContact(mailboxId: string, address: string, displayName: string): Promise<ContactListItem> {
  const response = await authFetch('/api/contacts', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mailboxId, address, displayName }),
  })
  const data = (await response.json()) as ContactMutationResponse
  if (!response.ok || !data.contact) throw new Error(data.error ?? 'Unable to save contact')
  return data.contact
}

/**
 * Without `forget`, a contact that is blocked or has images allowed moves to Other instead of being
 * deleted, so neither setting is lost.
 */
export async function deleteContact(mailboxId: string, address: string, options: { forget?: boolean } = {}): Promise<void> {
  const params = new URLSearchParams({ mailboxId, address })
  if (options.forget) params.set('forget', '1')
  const response = await authFetch(`/api/contacts?${params.toString()}`, { method: 'DELETE' })
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as ContactMutationResponse
    throw new Error(data.error ?? 'Unable to delete contact')
  }
}

export async function setContactBlocked(mailboxId: string, address: string, blocked: boolean): Promise<void> {
  const response = blocked
    ? await authFetch('/api/contacts/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailboxId, address }),
      })
    : await authFetch(`/api/contacts/block?${new URLSearchParams({ mailboxId, address }).toString()}`, { method: 'DELETE' })
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as ContactMutationResponse
    throw new Error(data.error ?? 'Unable to update contact')
  }
}
