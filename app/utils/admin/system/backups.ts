// Ported from legacy/src/app/(admin)/backups/utils.ts.
import { formatUserDate } from '#lib/time/utils'
import { api, authFetch } from '~/utils/auth-client'
import type { BackupItem, BackupsResponse, BackupSettings } from '~/types/admin/system/misc'

export const WEEKDAYS = [
  { value: 0, labelKey: 'weekday.0' },
  { value: 1, labelKey: 'weekday.1' },
  { value: 2, labelKey: 'weekday.2' },
  { value: 3, labelKey: 'weekday.3' },
  { value: 4, labelKey: 'weekday.4' },
  { value: 5, labelKey: 'weekday.5' },
  { value: 6, labelKey: 'weekday.6' },
] as const

export function fetchBackups() {
  return api<BackupsResponse>('/api/backups')
}

export function saveBackupSettings(settings: BackupSettings) {
  return api('/api/backups', { method: 'PUT', body: settings })
}

export function startBackup() {
  return api('/api/backups', { method: 'POST' })
}

export function removeBackup(id: string) {
  return api(`/api/backups/${id}`, { method: 'DELETE' })
}

export function restoreBackup(file: File) {
  const form = new FormData()
  form.set('backup', file)
  return api('/api/backups/restore', { method: 'POST', body: form })
}

export async function downloadBackup(backup: BackupItem): Promise<void> {
  const response = await authFetch(`/api/backups/${backup.id}/download`)
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? 'Failed to download backup')
  }
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = backup.filename ?? `${backup.id}.sql`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function formatBackupDate(value: string | null): string {
  if (!value) return '-'
  return formatUserDate(value, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatBackupSize(value: number | null): string {
  if (value === null) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function backupStatusColor(status: BackupItem['status']): 'success' | 'error' | 'info' | 'warning' {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'running') return 'info'
  return 'warning'
}
