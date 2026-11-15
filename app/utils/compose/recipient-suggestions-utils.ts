// Contact suggestions for the To/Cc/Bcc fields. Ported from
// legacy/src/components/compose/recipient-suggestions-utils.ts.
import { formatEmailAddress, getEmailAddress } from '#lib/email/address'
import { authFetch } from '~/utils/auth-client'

export type ContactSuggestion = {
  email: string
  displayName: string | null
  hasAvatar: boolean
  blocked: boolean
  /** manual (saved), outbound (written to) or inbound (only heard from). */
  source?: 'manual' | 'inbound' | 'outbound' | null
  /** Fork-only (directory): set when the address belongs to a colleague. */
  colleague?: { id: string, title: string | null, hasAvatar: boolean }
  /** Fork-only (directory): a group; picking it adds every member. `email` is then a placeholder key. */
  group?: { id: string, memberCount: number }
}

type DirectoryPersonLike = { id: string, name: string, email: string, addresses?: string[], title: string | null, department: string | null, hasAvatar: boolean }
type DirectoryGroupLike = { id: string, name: string, description: string | null, memberCount: number }

const matchesWords = (query: string, values: (string | null | undefined)[]) => {
  const haystack = values.filter(Boolean).join(' ').toLowerCase()
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(word => haystack.includes(word))
}

/**
 * Fork-only (directory): colleagues and groups merged into the contact suggestions. Saved people and people you
 * have written to keep the top; matching colleagues come next, above people you have only heard from; groups
 * whose name matches come last. A contact who is also a colleague is marked as one where it already stands.
 */
export function mergeDirectorySuggestions(
  contacts: ContactSuggestion[],
  directory: { people: DirectoryPersonLike[], groups: DirectoryGroupLike[] },
  query: string,
  limit = CONTACT_SUGGESTIONS_LIMIT,
): ContactSuggestion[] {
  const byAddress = new Map<string, DirectoryPersonLike>()
  for (const person of directory.people) for (const address of person.addresses ?? [person.email]) byAddress.set(address.toLowerCase(), person)
  const mark = (contact: ContactSuggestion): ContactSuggestion => {
    const person = byAddress.get(contact.email.toLowerCase())
    return person ? { ...contact, displayName: contact.displayName ?? person.name, colleague: { id: person.id, title: person.title, hasAvatar: person.hasAvatar } } : contact
  }
  const known = contacts.filter(contact => contact.source !== 'inbound').map(mark)
  const others = contacts.filter(contact => contact.source === 'inbound').map(mark)
  const listed = new Set(contacts.map(contact => contact.email.toLowerCase()))
  const colleagues: ContactSuggestion[] = directory.people
    .filter(person => !(person.addresses ?? [person.email]).some(address => listed.has(address.toLowerCase())) && matchesWords(query, [person.name, ...(person.addresses ?? [person.email]), person.title, person.department]))
    .map(person => ({ email: person.email, displayName: person.name, hasAvatar: false, blocked: false, source: null, colleague: { id: person.id, title: person.title, hasAvatar: person.hasAvatar } }))
  const groups: ContactSuggestion[] = directory.groups
    .filter(group => group.memberCount > 0 && matchesWords(query, [group.name]))
    .map(group => ({ email: `group:${group.id}`, displayName: group.name, hasAvatar: false, blocked: false, source: null, group: { id: group.id, memberCount: group.memberCount } }))
  const people = [...known, ...colleagues, ...others].slice(0, limit)
  return [...people, ...groups.slice(0, 3)]
}

type ContactSuggestionsResponse = { contacts?: ContactSuggestion[], error?: string }

export const CONTACT_SUGGESTIONS_LIMIT = 8

export async function fetchContactSuggestions(mailboxId: string, query: string): Promise<ContactSuggestion[]> {
  // `sort=suggest` ranks saved people, then people you have written to, then recent senders; blocked ones are left out.
  const params = new URLSearchParams({ mailboxId, q: query, limit: String(CONTACT_SUGGESTIONS_LIMIT), sort: 'suggest' })
  const response = await authFetch(`/api/contacts?${params.toString()}`)
  if (!response.ok) return []
  const data = (await response.json()) as ContactSuggestionsResponse
  return data.contacts ?? []
}

/**
 * Suggestions worth showing for the current draft. Blocked contacts and addresses already in the
 * chips never appear; the list stays in server order, which is ranked.
 */
export function filterContactSuggestions(suggestions: ContactSuggestion[], selected: string[]): ContactSuggestion[] {
  const picked = new Set(selected.map(entry => getEmailAddress(entry).toLowerCase()))
  const seen = new Set<string>()
  return suggestions.filter((suggestion) => {
    const email = suggestion.email.toLowerCase()
    if (suggestion.blocked || picked.has(email) || seen.has(email)) return false
    seen.add(email)
    return true
  })
}

/** What picking a suggestion puts into the chip list: `"Name" <email>` or the bare address. */
export function formatContactSuggestion(suggestion: ContactSuggestion): string {
  return formatEmailAddress(suggestion.email, suggestion.displayName)
}
