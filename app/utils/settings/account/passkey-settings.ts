// Passkey, step-up and password helpers, ported from legacy/src/components/settings/passkey-settings-utils.ts.
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { requestError } from '#lib/http/client-error'
import { authFetch } from '~/utils/auth-client'
import type { SecurityStatus } from '~/types/settings/account'

type PasskeyOptionsResponse = { options?: unknown, ceremonyToken?: string, error?: string, code?: string }
type StepUpResponse = { stepUpToken?: string, error?: string, code?: string }
type AuthenticationOptions = Parameters<typeof startAuthentication>[0]['optionsJSON']
type RegistrationOptions = Parameters<typeof startRegistration>[0]['optionsJSON']

const PROVIDERS: Record<string, string> = {
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'iCloud Keychain',
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google Password Manager',
  '08987058-cadc-4b81-b6e1-30de50dcbe96': 'Windows Hello',
  '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': 'Windows Hello',
  'cb69481e-8ff7-4039-93ec-0a2729a154a8': 'YubiKey',
  'ee882879-721c-4913-9775-3dfcce97072a': 'YubiKey',
  'fa2b99dc-9e39-4257-8f92-4a30d23c4118': 'YubiKey',
  '2fc0579f-8113-47ea-b116-bb5a8db9202a': 'YubiKey',
  '73bb0cd4-e502-49b8-9c6f-b59445bf720b': 'YubiKey',
}

/** The provider name is only a hint; WebAuthn never exposes the device's own label. */
export function passkeyProvider(aaguid: string | null): string | null {
  return aaguid ? PROVIDERS[aaguid.toLowerCase()] ?? null : null
}

function postJson(url: string, body?: unknown, method = 'POST') {
  return authFetch(url, {
    method,
    redirectOnUnauthorized: false,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T
}

export async function loadSecurityStatus(): Promise<SecurityStatus> {
  const res = await authFetch('/api/settings/security')
  const data = await readJson<SecurityStatus>(res)
  if (!res.ok) throw requestError(data, 'Could not load security settings')
  return data
}

export async function stepUpWithPassword(password: string, code: string | undefined, action: string, targetUserId?: string): Promise<string> {
  const res = await postJson('/api/auth/step-up', { password, code, action, targetUserId })
  const data = await readJson<StepUpResponse>(res)
  if (!res.ok || !data.stepUpToken) throw requestError(data, 'Verification failed')
  return data.stepUpToken
}

export async function stepUpWithPasskey(action: string, targetUserId?: string): Promise<string> {
  const optionsRes = await postJson('/api/auth/step-up/options', { action, targetUserId })
  const options = await readJson<PasskeyOptionsResponse>(optionsRes)
  if (!optionsRes.ok || !options.options || !options.ceremonyToken) throw requestError(options, 'Passkey verification is unavailable')
  const response = await startAuthentication({ optionsJSON: options.options as AuthenticationOptions })
  const res = await postJson('/api/auth/step-up/verify', { ceremonyToken: options.ceremonyToken, response, action, targetUserId })
  const data = await readJson<StepUpResponse>(res)
  if (!res.ok || !data.stepUpToken) throw requestError(data, 'Passkey verification failed')
  return data.stepUpToken
}

export async function addPasskey(name: string, stepUpToken: string): Promise<void> {
  const optionsRes = await postJson('/api/settings/passkeys/options', { stepUpToken })
  const options = await readJson<PasskeyOptionsResponse>(optionsRes)
  if (!optionsRes.ok || !options.options || !options.ceremonyToken) throw requestError(options, 'Could not start passkey setup')
  const response = await startRegistration({ optionsJSON: options.options as RegistrationOptions })
  const res = await postJson('/api/settings/passkeys', { ceremonyToken: options.ceremonyToken, response, name, stepUpToken })
  if (!res.ok) throw requestError(await readJson(res), 'Could not add the passkey')
}

/** Asks the browser to present one saved passkey so the list can identify it. */
export async function checkPasskey(): Promise<string> {
  const optionsRes = await authFetch('/api/settings/passkeys/check/options', { method: 'POST', redirectOnUnauthorized: false })
  const options = await readJson<PasskeyOptionsResponse>(optionsRes)
  if (!optionsRes.ok || !options.options || !options.ceremonyToken) throw requestError(options, 'Could not start the passkey check')
  const response = await startAuthentication({ optionsJSON: options.options as AuthenticationOptions })
  const res = await postJson('/api/settings/passkeys/check/verify', { ceremonyToken: options.ceremonyToken, response })
  const data = await readJson<{ passkeyId?: string, error?: string, code?: string }>(res)
  if (!res.ok || !data.passkeyId) throw requestError(data, 'Could not check the passkey')
  return data.passkeyId
}

export async function renamePasskey(id: string, name: string): Promise<void> {
  const res = await authFetch(`/api/settings/passkeys/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw requestError(await readJson(res), 'Could not rename the passkey')
}

export async function removePasskey(id: string, stepUpToken: string): Promise<void> {
  const res = await postJson(`/api/settings/passkeys/${encodeURIComponent(id)}`, { stepUpToken }, 'DELETE')
  if (!res.ok) throw requestError(await readJson(res), 'Could not remove the passkey')
}

export async function setSecondFactorRequirement(enabled: boolean, stepUpToken: string): Promise<void> {
  const res = await postJson('/api/settings/second-factor', { enabled, stepUpToken })
  if (!res.ok) throw requestError(await readJson(res), 'Could not update the second-step setting')
}

export async function generateRecoveryCodes(stepUpToken: string): Promise<string[]> {
  const res = await postJson('/api/settings/mfa/recovery-codes', { stepUpToken })
  const data = await readJson<{ recoveryCodes?: string[], error?: string, code?: string }>(res)
  if (!res.ok || !data.recoveryCodes) throw requestError(data, 'Could not generate recovery codes')
  return data.recoveryCodes
}

export async function setPassword(newPassword: string, stepUpToken: string, requireSecondFactor?: boolean): Promise<void> {
  const res = await postJson('/api/settings/password', { newPassword, stepUpToken, requireSecondFactor })
  if (!res.ok) throw requestError(await readJson(res), 'Could not set a password')
}

export async function removePassword(stepUpToken: string): Promise<void> {
  const res = await postJson('/api/settings/password', { stepUpToken }, 'DELETE')
  if (!res.ok) throw requestError(await readJson(res), 'Could not remove the password')
}
