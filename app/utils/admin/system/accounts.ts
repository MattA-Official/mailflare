// Account administration helpers, ported from legacy/src/app/(admin)/accounts/utils.ts and
// accounts/[id]/utils.ts. API shapes are upstream's.
import { appendOptimizedAvatar } from '#lib/avatar-upload-client'
import { requestError } from '#lib/http/client-error'
import { ApiError, api, authFetch } from '~/utils/auth-client'
import type { Account, AccountDomain, AccountResponse, ManagedAccount, ManagedDomain, ManagedMailbox, TransferCandidate } from '~/types/admin/system/accounts'

export function getAccountInitials(account: Pick<Account, 'name' | 'email'>): string {
  const source = account.name.trim() || account.email
  return source.slice(0, 1).toUpperCase()
}

export function formatAccountDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

export function formatAccountDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export function fetchAccounts(): Promise<AccountResponse> {
  return api<AccountResponse>('/api/accounts')
}

export async function fetchDomains(): Promise<AccountDomain[]> {
  return (await api<{ domains?: AccountDomain[] }>('/api/domains')).domains ?? []
}

export function createAccount(input: { username: string, domainId: string, password: string, role: 'admin' | 'user', useAllDomains: boolean, aliases: { domainId: string, localPart: string }[] }) {
  return api<AccountResponse>('/api/accounts', { method: 'POST', body: input })
}

export function deleteAccounts(ids: string[], transferToId: string | null) {
  return api('/api/accounts', { method: 'DELETE', body: { ids, transferToId } })
}

export function restoreAccount(id: string) {
  return api(`/api/accounts/${id}/restore`, { method: 'POST' })
}

export async function fetchManagedAccount(accountId: string): Promise<ManagedAccount> {
  const data = await api<{ account?: ManagedAccount }>(`/api/accounts/${accountId}`)
  if (!data.account) throw new Error('Unable to load account')
  return data.account
}

/** Throws a ClientRequestError so step-up failures keep their stable code. */
export async function saveManagedAccount(account: ManagedAccount, stepUpToken?: string): Promise<void> {
  try {
    await api(`/api/accounts/${account.id}`, {
      method: 'PATCH',
      body: {
        name: account.name,
        role: account.role,
        disabled: account.disabled,
        canManageMailboxes: account.canManageMailboxes,
        canManageDomains: account.canManageDomains,
        canManageUsers: account.canManageUsers,
        calendarEnabled: account.calendarEnabled,
        driveEnabled: account.driveEnabled,
        forwardingEmail: account.forwardingEmail,
        password: account.newPassword || undefined,
        stepUpToken,
      },
    })
  } catch (error) {
    if (error instanceof ApiError) throw requestError((error.data ?? {}) as { error?: unknown, code?: unknown }, 'Unable to update account')
    throw error
  }
}

export async function fetchTransferCandidates(): Promise<TransferCandidate[]> {
  const data = await fetchAccounts()
  return (data.accounts ?? []).map(account => ({
    id: account.id,
    email: account.email,
    name: account.name,
    hasAvatar: !!account.hasAvatar,
    disabled: !!account.disabled,
  }))
}

export function transferPrimaryAdmin(accountId: string) {
  return api(`/api/accounts/${accountId}/transfer-primary`, { method: 'POST' })
}

export async function uploadManagedAccountAvatar(accountId: string, file: File): Promise<void> {
  const form = new FormData()
  await appendOptimizedAvatar(form, file)
  const response = await authFetch(`/api/accounts/${accountId}/avatar`, { method: 'POST', body: form })
  if (!response.ok) throw new Error('Unable to update avatar')
}

export function getManagedAccountAvatarUrl(accountId: string, version = 0): string {
  return `/api/accounts/${accountId}/avatar${version ? `?v=${version}` : ''}`
}

export async function fetchManagedMailboxes(accountId: string): Promise<ManagedMailbox[]> {
  return (await api<{ mailboxes?: ManagedMailbox[] }>(`/api/accounts/${accountId}/mailboxes`)).mailboxes ?? []
}

export async function fetchManagedDomains(): Promise<ManagedDomain[]> {
  return (await api<{ domains?: ManagedDomain[] }>('/api/domains')).domains ?? []
}

export function addManagedMailbox(account: ManagedAccount, input: { domainId: string, localPart: string }) {
  return api('/api/mailboxes', {
    method: 'POST',
    body: { ownerUserId: account.id, domainId: input.domainId, localPart: input.localPart, displayName: account.name, type: 'personal' },
  })
}

export function removeManagedMailbox(mailboxId: string) {
  return api(`/api/mailboxes/${mailboxId}`, { method: 'DELETE' })
}

export async function createRecoveryLink(accountId: string, stepUpToken: string): Promise<string> {
  try {
    const data = await api<{ link?: string }>(`/api/accounts/${accountId}/recovery`, { method: 'POST', body: { stepUpToken } })
    if (!data.link) throw new Error('Unable to create a recovery link')
    return data.link
  } catch (error) {
    if (error instanceof ApiError) throw requestError((error.data ?? {}) as { error?: unknown, code?: unknown }, 'Unable to create a recovery link')
    throw error
  }
}

export const accountSettingsNavItems = [
  { segment: '', labelKey: 'accountSettings.details' },
  { segment: 'password', labelKey: 'accountSettings.password' },
  { segment: 'permissions', labelKey: 'accountSettings.permissions' },
  { segment: 'mailboxes', labelKey: 'accountSettings.mailboxes' },
] as const

export function getAccountSettingsHref(accountId: string, segment: string): string {
  return `/accounts/${accountId}${segment ? `/${segment}` : ''}`
}
