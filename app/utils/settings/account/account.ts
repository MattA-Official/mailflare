// Account settings helpers, ported from legacy/src/components/settings/utils.ts.
import { requestError } from '#lib/http/client-error'
import { authFetch } from '~/utils/auth-client'
import type { AccountSettingsUser, MfaEnrollment, ProfileFormResponse } from '~/types/settings/account'

function errorText(data: { error?: unknown } | null | undefined, fallback: string): string {
  return typeof data?.error === 'string' ? data.error : fallback
}

export async function loadAccountSettings(): Promise<AccountSettingsUser> {
  const res = await authFetch('/api/auth/me')
  const data = (await res.json()) as { user?: AccountSettingsUser, error?: unknown }
  if (!res.ok || !data.user) throw new Error(errorText(data, 'Failed to load account'))
  return data.user
}

/** Saves the account's recovery address. The name is sent unchanged because the endpoint requires it. */
export async function updateProfile(name: string, resetEmail: string): Promise<string> {
  const res = await authFetch('/api/settings/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, resetEmail }),
  })
  const data = (await res.json()) as ProfileFormResponse
  if (!res.ok) throw new Error(errorText(data, 'Failed to update profile'))
  return data.user?.resetEmail ?? ''
}

export async function updatePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await authFetch('/api/settings/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  const data = (await res.json()) as { error?: unknown, code?: unknown }
  if (!res.ok) throw requestError(data, 'Failed to change password')
}

/** An API key limited to the JMAP scope, for external mail apps. */
export async function createJmapApiKey(name: string, mailboxIds: string[]): Promise<string> {
  const res = await authFetch('/api/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, scopes: ['jmap'], mailboxIds }),
  })
  const data = (await res.json().catch(() => ({}))) as { key?: string, error?: unknown }
  if (!res.ok || !data.key) throw new Error(errorText(data, 'Could not create a key'))
  window.dispatchEvent(new Event('mailflare:api-keys-changed'))
  return data.key
}

export async function beginMfaEnrollment(password: string | null, stepUpToken?: string): Promise<MfaEnrollment> {
  const res = await authFetch('/api/settings/mfa/enroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: password ?? undefined, stepUpToken }),
  })
  const data = (await res.json()) as Partial<MfaEnrollment> & { error?: unknown, code?: unknown }
  if (!res.ok || !data.secret || !data.otpauthUrl || !data.qrSvg) throw requestError(data, 'Could not start enrolment')
  return { secret: data.secret, otpauthUrl: data.otpauthUrl, qrSvg: data.qrSvg }
}

export async function confirmMfaEnrollment(code: string): Promise<string[]> {
  const res = await authFetch('/api/settings/mfa/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  const data = (await res.json()) as { recoveryCodes?: string[], error?: unknown, code?: unknown }
  if (!res.ok || !data.recoveryCodes) throw requestError(data, 'Could not confirm the code')
  return data.recoveryCodes
}

export async function disableMfa(input: { password?: string, stepUpToken?: string }): Promise<void> {
  const res = await authFetch('/api/settings/mfa/disable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = (await res.json()) as { error?: unknown, code?: unknown }
  if (!res.ok) throw requestError(data, 'Could not turn off two-factor authentication')
}
