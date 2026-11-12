// Ported from the types.d.ts files beside upstream's admin pages (legacy/src/app/(admin)).
import type { AgentModelOption, AgentModelRates, AgentProviderKind, AgentProviderPreset, AgentProviderPublicConfig } from '#lib/agent/provider-types'
import type { BackupTableGroupId } from '#lib/backups/types'

export interface AdminApiKey {
  id: string
  name: string
  prefix: string
  kind: 'legacy' | 'mcp'
  scopes: string
  createdAt?: string
  lastUsedAt?: string | null
}

export interface GeneralSettings {
  outboundAttachmentMaxMb: number
  /** Per-user Drive cap in GB; null when unlimited. */
  driveStorageLimitGb: number | null
}

export type AgentAdminConfig = AgentProviderPublicConfig
export interface AgentAdminSettingsResponse { config: AgentAdminConfig, assistantEnabled: boolean, cloudflareAvailable: boolean }
export interface AgentEnabledResponse { assistantEnabled: boolean }
export interface AgentAdminModelsResponse { models: AgentModelOption[], source: 'catalog' | 'suggested' }
export interface AgentAdminForm { provider: AgentProviderKind, preset: AgentProviderPreset, baseUrl: string, apiKey: string, model: string, rates: Record<string, AgentModelRates> }

export interface AiUsageRow { id: string, createdAt: string, provider: string, model: string, source: string, inputTokens: number | null, outputTokens: number | null, costUsdMicros: number | null }
export interface AiUsageDaily { date: string, requests: number, inputTokens: number, outputTokens: number }
export interface AiUsageTotals { requests: number, inputTokens: number, outputTokens: number, totalTokens: number, costUsdMicros: number, pricedRequests: number }
export interface AiUsageResponse { totals: AiUsageTotals, daily: AiUsageDaily[], timeZone: string, rows: AiUsageRow[], page: number, pageSize: number, totalPages: number }

export interface ActivityMetadata {
  ipAddress?: string
  city?: string | null
  country?: string | null
  device?: string
  platform?: string
  userAgent?: string
}

export interface ActivityLog {
  id: string
  action: 'auth.login' | 'auth.logout' | string
  metadata: string | null
  createdAt: string
  actorEmail: string | null
}

export type BackupScheduleType = 'daily' | 'weekly' | 'monthly'
export type BackupStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface BackupSettings {
  id: string
  enabled: boolean
  scheduleType: BackupScheduleType
  scheduleValue: number | null
  retentionEnabled: boolean
  retentionDays: number
  excludedTableGroups: BackupTableGroupId[]
  updatedAt: string
}

export interface BackupItem {
  id: string
  status: BackupStatus
  trigger: 'manual' | 'scheduled'
  filename: string | null
  size: number | null
  error: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface BackupsResponse {
  settings: BackupSettings
  backups: BackupItem[]
  configuration: { configured: boolean, missing: string[] }
}

export interface MigrationStatusResponse {
  applied?: string[]
  pending: string[]
  ready: boolean
  unknown: string[]
}
