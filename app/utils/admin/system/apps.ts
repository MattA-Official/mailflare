// Fork-only. Client calls for the OIDC provider's admin API (server/handlers/api/admin/apps).
import { api } from '~/utils/auth-client'

export type OidcAppRole = { key: string, label: string, description?: string }

export type OidcApp = {
  id: string
  clientId: string
  name: string
  homepageUrl: string | null
  redirectUris: string[]
  roles: OidcAppRole[]
  confidential: boolean
  clientSecretPrefix: string | null
  disabled: boolean
  memberCount?: number
}

export type OidcAppInput = {
  name: string
  homepageUrl: string | null
  redirectUris: string[]
  roles: OidcAppRole[]
  confidential?: boolean
  disabled?: boolean
}

export type OidcAppMember = { userId: string, name: string, email: string, disabled: boolean, roles: string[] }
export type AccountApp = OidcApp & { heldRoles: string[] }

export async function fetchOidcApps(): Promise<OidcApp[]> {
  return (await api<{ apps: OidcApp[] }>('/api/admin/apps')).apps
}

export function fetchOidcApp(id: string) {
  return api<{ app: OidcApp, members: OidcAppMember[] }>(`/api/admin/apps/${encodeURIComponent(id)}`)
}

export function createOidcApp(input: OidcAppInput) {
  return api<{ app: OidcApp, clientSecret: string | null }>('/api/admin/apps', { method: 'POST', body: input })
}

export function updateOidcApp(id: string, input: OidcAppInput) {
  return api<{ app: OidcApp }>(`/api/admin/apps/${encodeURIComponent(id)}`, { method: 'PATCH', body: input })
}

export function deleteOidcApp(id: string) {
  return api(`/api/admin/apps/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function rotateOidcAppSecret(id: string) {
  return api<{ app: OidcApp, clientSecret: string }>(`/api/admin/apps/${encodeURIComponent(id)}/secret`, { method: 'POST' })
}

export function fetchAccountApps(accountId: string) {
  return api<{ twoFactorReady: boolean, apps: AccountApp[] }>(`/api/accounts/${encodeURIComponent(accountId)}/apps`)
}

export function saveAccountAppRoles(accountId: string, appId: string, roles: string[]) {
  return api<{ roles: string[] }>(`/api/accounts/${encodeURIComponent(accountId)}/apps`, { method: 'PUT', body: { appId, roles } })
}

/** Turns a role label into a suggested key: "Sponsorships" -> "sponsorships". */
export function roleKeyFromLabel(label: string): string {
  return label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^[^a-z]+/, '').slice(0, 40)
}

type Draft = { name: string, homepageUrl: string, redirectUris: string, roles: OidcAppRole[], confidential: boolean, disabled: boolean }

export function emptyAppDraft(): Draft {
  return { name: '', homepageUrl: '', redirectUris: '', roles: [{ key: 'owner', label: 'Owner', description: '' }], confidential: true, disabled: false }
}

export function appToDraft(app: OidcApp): Draft {
  return {
    name: app.name,
    homepageUrl: app.homepageUrl ?? '',
    redirectUris: app.redirectUris.join('\n'),
    roles: app.roles.map(role => ({ ...role, description: role.description ?? '', keyEdited: true })),
    confidential: app.confidential,
    disabled: app.disabled,
  }
}

export function draftToInput(draft: Draft): OidcAppInput {
  return {
    name: draft.name.trim(),
    homepageUrl: draft.homepageUrl.trim() || null,
    redirectUris: draft.redirectUris.split('\n').map(line => line.trim()).filter(Boolean),
    roles: draft.roles.map(role => ({ key: role.key.trim(), label: role.label.trim(), ...(role.description?.trim() ? { description: role.description.trim() } : {}) })),
    confidential: draft.confidential,
    disabled: draft.disabled,
  }
}
