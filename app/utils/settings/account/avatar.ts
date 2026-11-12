// Profile and mailbox picture uploads, ported from legacy/src/components/settings/profile-avatar-form-utils.ts.
import { appendOptimizedAvatar, MAX_SOURCE_AVATAR_SIZE } from '#lib/avatar-upload-client'
import { authFetch } from '~/utils/auth-client'

export const PROFILE_AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

export function validateProfileAvatar(file: File): string | null {
  if (!PROFILE_AVATAR_ACCEPT.split(',').includes(file.type)) return 'Use a JPEG, PNG, WebP, or GIF image'
  if (file.size > MAX_SOURCE_AVATAR_SIZE) return 'Image must be 10 MB or smaller'
  return null
}

async function upload(url: string, file: File): Promise<void> {
  const body = new FormData()
  await appendOptimizedAvatar(body, file)
  const response = await authFetch(url, { method: 'POST', body })
  if (response.ok) return
  const data = (await response.json().catch(() => null)) as { error?: string } | null
  throw new Error(data?.error ?? 'Upload failed')
}

export function uploadProfileAvatar(file: File): Promise<void> {
  return upload('/api/profile/avatar', file)
}

export function getMailboxProfileAvatarUrl(mailboxId: string): string {
  return `/api/mailboxes/${mailboxId}/avatar?v=${Date.now()}`
}

export async function uploadMailboxProfileAvatar(mailboxId: string, file: File): Promise<void> {
  await upload(`/api/mailboxes/${mailboxId}/avatar`, file)
  clearMailboxesCache()
}
