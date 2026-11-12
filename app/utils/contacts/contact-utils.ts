// Ported from legacy/src/components/contacts/*-utils.ts.
import { appendOptimizedAvatar, MAX_SOURCE_AVATAR_SIZE } from '#lib/avatar-upload-client'
import { getEmailAddress } from '#lib/email/address'
import type { ContactDetailsRecord, ContactDetailsResponse } from '~/types/contacts/contacts'

export const CONTACT_CHANGED_EVENT = 'mailflare:contact-changed'
export const CONTACT_AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

export function getManagedContactAvatarUrl(mailboxId: string, address: string, version = 0): string {
  const params = new URLSearchParams({ mailboxId, address: getEmailAddress(address) })
  if (version) params.set('v', String(version))
  return `/api/contacts/avatar?${params.toString()}`
}

export function getContactAvatarInitial(name: string, address: string): string {
  return (name.trim() || getEmailAddress(address)).slice(0, 1).toUpperCase()
}

export function validateContactAvatar(file: File): string | null {
  if (!CONTACT_AVATAR_ACCEPT.split(',').includes(file.type)) return 'Use a JPEG, PNG, WebP, or GIF image'
  if (file.size > MAX_SOURCE_AVATAR_SIZE) return 'Image must be 10 MB or smaller'
  return null
}

async function errorFrom(response: Response, fallback: string): Promise<Error> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null
  return new Error(data?.error ?? fallback)
}

export async function uploadContactAvatar(mailboxId: string, address: string, file: File): Promise<void> {
  const body = new FormData()
  body.append('mailboxId', mailboxId)
  body.append('address', address)
  await appendOptimizedAvatar(body, file)
  const response = await authFetch('/api/contacts/avatar', { method: 'POST', body })
  if (!response.ok) throw await errorFrom(response, 'Upload failed')
}

export async function removeContactAvatar(mailboxId: string, address: string): Promise<void> {
  const params = new URLSearchParams({ mailboxId, address })
  const response = await authFetch(`/api/contacts/avatar?${params.toString()}`, { method: 'DELETE' })
  if (!response.ok) throw await errorFrom(response, 'Unable to remove profile picture')
}

export async function fetchContactDetails(mailboxId: string, address: string): Promise<ContactDetailsRecord> {
  const params = new URLSearchParams({ mailboxId, address: getEmailAddress(address) })
  const response = await authFetch(`/api/contacts?${params.toString()}`)
  const data = (await response.json().catch(() => ({}))) as ContactDetailsResponse
  if (!response.ok || !data.contact) throw new Error(data.error ?? 'Unable to load contact')
  return data.contact
}

export async function updateContactName(mailboxId: string, address: string, displayName: string): Promise<ContactDetailsRecord> {
  const response = await authFetch('/api/contacts', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mailboxId, address: getEmailAddress(address), displayName }),
  })
  const data = (await response.json().catch(() => ({}))) as ContactDetailsResponse
  if (!response.ok || !data.contact) throw new Error(data.error ?? 'Unable to update contact')
  return data.contact
}
