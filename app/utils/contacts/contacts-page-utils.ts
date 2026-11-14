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

type ContactsListResponse = { contacts?: ContactListItem[], error?: string }
type ContactMutationResponse = { contact?: ContactListItem, ok?: boolean, error?: string }

export const CONTACTS_QUERY_LIMIT = 500

/** Shared by the header and rows so the columns line up. */
export const CONTACT_COLUMNS = 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 md:grid-cols-[auto_minmax(0,2fr)_minmax(0,1fr)_auto]'

export async function fetchContacts(mailboxId: string, query: string): Promise<ContactListItem[]> {
  const params = new URLSearchParams({ mailboxId, limit: String(CONTACTS_QUERY_LIMIT) })
  if (query.trim()) params.set('q', query.trim())
  const response = await authFetch(`/api/contacts?${params.toString()}`)
  const data = (await response.json()) as ContactsListResponse
  if (!response.ok) throw new Error(data.error ?? 'Unable to load contacts')
  return data.contacts ?? []
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

export async function deleteContact(mailboxId: string, address: string): Promise<void> {
  const params = new URLSearchParams({ mailboxId, address })
  const response = await authFetch(`/api/contacts?${params.toString()}`, { method: 'DELETE' })
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as ContactMutationResponse
    throw new Error(data.error ?? 'Unable to delete contact')
  }
}
