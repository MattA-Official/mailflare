// API helpers for the general, agent, AI usage, activity, branding and API key admin pages,
// ported from the utils.ts files beside upstream's pages in legacy/src/app/(admin).
import { PROVIDER_BASE_URLS } from '#lib/agent/provider-constants'
import type { AgentProviderPreset } from '#lib/agent/provider-types'
import { formatUserDate, getUserTimeZone, recentZonedDays } from '#lib/time/utils'
import type { TranslationKey } from '#lib/i18n/types'
import type { Translator } from '#lib/i18n/utils'
import { api } from '~/utils/auth-client'
import type {
  ActivityLog, ActivityMetadata, AdminApiKey, AgentAdminForm, AgentAdminModelsResponse, AgentAdminSettingsResponse,
  AgentEnabledResponse, AiUsageDaily, AiUsageResponse, GeneralSettings, MigrationStatusResponse,
} from '~/types/admin/system/misc'

// General

export function loadGeneralSettings() {
  return api<GeneralSettings>('/api/admin/general', { cache: 'no-store' })
}

export function saveGeneralSettings(changes: Partial<GeneralSettings>) {
  return api<GeneralSettings>('/api/admin/general', { method: 'PUT', body: changes })
}

// API keys

export type AdminApiKeyScope = 'domains' | 'accounts' | 'mailboxes' | 'storage'

export const ADMIN_KEY_PERMISSIONS: { value: AdminApiKeyScope, labelKey: TranslationKey, descriptionKey: TranslationKey }[] = [
  { value: 'domains', labelKey: 'adminKeys.perm.domains', descriptionKey: 'adminKeys.perm.domainsDesc' },
  { value: 'accounts', labelKey: 'adminKeys.perm.accounts', descriptionKey: 'adminKeys.perm.accountsDesc' },
  { value: 'mailboxes', labelKey: 'adminKeys.perm.mailboxes', descriptionKey: 'adminKeys.perm.mailboxesDesc' },
  { value: 'storage', labelKey: 'adminKeys.perm.storage', descriptionKey: 'adminKeys.perm.storageDesc' },
]

export function parseApiKeyScopes(scopes: string): string[] {
  try {
    const parsed: unknown = JSON.parse(scopes)
    return Array.isArray(parsed) ? parsed.filter((scope): scope is string => typeof scope === 'string') : []
  } catch {
    return []
  }
}

export async function fetchAdminApiKeys(): Promise<AdminApiKey[]> {
  return (await api<{ apiKeys: AdminApiKey[] }>('/api/admin/api-keys')).apiKeys ?? []
}

export async function createAdminApiKey(input: { name: string, scopes: AdminApiKeyScope[], mcpAllowed: boolean }): Promise<string> {
  const data = await api<{ key?: string }>('/api/admin/api-keys', { method: 'POST', body: input })
  if (!data.key) throw new Error('Unable to create API key')
  return data.key
}

export function revokeAdminApiKey(id: string) {
  return api(`/api/admin/api-keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Ported from legacy/src/components/settings/mcp-agent-instructions-utils.ts. */
export function buildMcpAgentPrompt(origin: string, { mode, apiKey }: { mode: 'mail' | 'admin', apiKey: string }): string {
  const serverUrl = `${origin || 'https://your-mailflare-domain'}/mcp`
  const instructions = mode === 'mail'
    ? 'Use get_calendars for calendar access and list_mailboxes for mail access when available. Use only the tools and mailbox IDs returned by this server. Calendar changes save immediately. Sending mail requires a review request and confirmation in Mailflare.'
    : 'Use only the admin management tools and permissions exposed by this key. This key cannot read or send mail.'
  return `Connect to my Mailflare MCP server using these settings:\nServer URL: ${serverUrl}\nTransport: Streamable HTTP\nAuthorization header: Bearer ${apiKey}\n\n${instructions}\nDo not print the API key in your replies or logs. If you cannot configure the MCP connection directly, tell me which settings to enter in my client.`
}

// Assistant (agent) provider

export const PROVIDER_PRESETS: { id: AgentProviderPreset, label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'groq', label: 'Groq' },
  { id: 'custom', label: 'Custom endpoint' },
]

export function baseUrlForPreset(preset: AgentProviderPreset, current = '') {
  return preset === 'custom' ? current : PROVIDER_BASE_URLS[preset]
}

export function updateAgentModelRate(form: AgentAdminForm, model: string, kind: 'input' | 'output', value: string | number): AgentAdminForm {
  const current = form.rates[model] ?? { input: null, output: null }
  return { ...form, rates: { ...form.rates, [model]: { ...current, [kind]: value === '' || value === null ? null : Number(value) } } }
}

export function loadAgentAdminSettings() {
  return api<AgentAdminSettingsResponse>('/api/admin/agent')
}

export function loadAgentModels(form: AgentAdminForm, signal?: AbortSignal) {
  return api<AgentAdminModelsResponse>('/api/admin/agent/models', { method: 'POST', body: form, signal })
}

export function saveAgentAdminSettings(form: AgentAdminForm) {
  return api<AgentAdminSettingsResponse>('/api/admin/agent', { method: 'PUT', body: form })
}

export function saveAgentEnabled(enabled: boolean) {
  return api<AgentEnabledResponse>('/api/admin/agent', { method: 'PUT', body: { enabled } })
}

// AI usage

export function fetchAiUsage(page: number) {
  return api<AiUsageResponse>(`/api/admin/ai-usage?page=${page}`)
}

export function formatTokenCount(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat().format(value)
}

export function formatEstimatedUsd(micros: number | null) {
  if (micros === null) return '—'
  const dollars = micros / 1_000_000
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: dollars < 0.01 && dollars > 0 ? 6 : 2 })}`
}

export function formatUsageDate(value: string) {
  return formatUserDate(value, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatUsageProvider(value: string) {
  return ({ cloudflare: 'Cloudflare Workers AI', openai: 'OpenAI', openrouter: 'OpenRouter', groq: 'Groq', custom: 'Custom API' } as Record<string, string>)[value] ?? value
}

export function fillDailyUsage(days: AiUsageDaily[], timeZone = getUserTimeZone()): AiUsageDaily[] {
  const byDate = new Map(days.map(day => [day.date, day]))
  return recentZonedDays(timeZone, 30).map(({ date }) => byDate.get(date) ?? { date, requests: 0, inputTokens: 0, outputTokens: 0 })
}

export function formatDailyLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

// Activity

export async function fetchActivity(): Promise<ActivityLog[]> {
  return (await api<{ activities?: ActivityLog[] }>('/api/activity')).activities ?? []
}

export function formatActivityDate(value: string): string {
  return formatUserDate(value, { dateStyle: 'medium', timeStyle: 'short' })
}

export function getActivityLabel(action: string, t: Translator): string {
  if (action === 'auth.login') return t('activity.login')
  if (action === 'auth.logout') return t('activity.logout')
  return action
}

export function getActivityMetadata(log: ActivityLog): ActivityMetadata {
  if (!log.metadata) return {}
  try {
    return JSON.parse(log.metadata) as ActivityMetadata
  } catch {
    return {}
  }
}

// Branding

export const BRANDING_ICON_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

export function saveBranding(appName: string, icon: File | null) {
  const form = new FormData()
  form.set('appName', appName)
  if (icon) form.set('icon', icon, icon.name)
  return api<{ appName?: string, hasCustomIcon?: boolean }>('/api/branding', { method: 'PUT', body: form })
}

// Database migrations (the overview's update card)

export function getMigrationStatus() {
  return api<MigrationStatusResponse>('/api/admin/migrations', { cache: 'no-store' })
}

export function applyDatabaseMigrations() {
  return api<MigrationStatusResponse>('/api/admin/migrations', { method: 'POST' })
}
