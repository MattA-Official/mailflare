// Ported from legacy/src/app/(admin)/webhooks/utils.ts.
import type { TranslationKey } from '#lib/i18n/types'
import { formatUserDate } from '#lib/time/utils'
import { api } from '~/utils/auth-client'
import type { CreateWebhookInput, UpdateWebhookInput, Webhook, WebhookDelivery, WebhookDeliveryStatus, WebhookEvent } from '~/types/admin/email/webhooks'

export const WEBHOOK_EVENTS: { value: WebhookEvent, labelKey: TranslationKey, hintKey: TranslationKey }[] = [
  { value: 'message.inbound', labelKey: 'webhooks.event.inbound', hintKey: 'webhooks.event.inboundHint' },
  { value: 'message.outbound', labelKey: 'webhooks.event.outbound', hintKey: 'webhooks.event.outboundHint' },
  { value: 'message.failed', labelKey: 'webhooks.event.failed', hintKey: 'webhooks.event.failedHint' },
]

export const DELIVERY_STATUS_LABELS = {
  pending: 'webhooks.status.pending',
  delivered: 'webhooks.status.delivered',
  failed: 'webhooks.status.failed',
  retrying: 'webhooks.status.retrying',
  exhausted: 'webhooks.status.exhausted',
} as const satisfies Record<WebhookDeliveryStatus, TranslationKey>

export const DELIVERY_STATUS_COLORS = {
  delivered: 'success',
  failed: 'error',
  exhausted: 'error',
  retrying: 'warning',
  pending: 'neutral',
} as const satisfies Record<WebhookDeliveryStatus, string>

export async function fetchWebhooks(): Promise<Webhook[]> {
  return (await api<{ webhooks?: Webhook[] }>('/api/webhooks')).webhooks ?? []
}

export async function fetchDeliveries(webhookId: string): Promise<WebhookDelivery[]> {
  return (await api<{ deliveries?: WebhookDelivery[] }>(`/api/webhooks/${webhookId}/deliveries?limit=50`)).deliveries ?? []
}

export function createWebhook(input: CreateWebhookInput) {
  return api<{ id: string, secret: string }>('/api/webhooks', { method: 'POST', body: input })
}

export function updateWebhook(id: string, input: UpdateWebhookInput) {
  return api<{ ok: boolean, secret?: string }>(`/api/webhooks/${id}`, { method: 'PATCH', body: input })
}

export function deleteWebhook(id: string) {
  return api(`/api/webhooks/${id}`, { method: 'DELETE' })
}

export function testWebhook(id: string) {
  return api<{ deliveryId: string, status: string }>(`/api/webhooks/${id}/test`, { method: 'POST' })
}

export function retryDelivery(webhookId: string, deliveryId: string) {
  return api<{ status: string }>(`/api/webhooks/${webhookId}/deliveries/${deliveryId}/retry`, { method: 'POST' })
}

/** Drizzle timestamps arrive as epoch seconds when they bypass the column mapper. */
export function formatTimestamp(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const numeric = typeof value === 'number' ? value : Date.parse(String(value))
  if (!Number.isFinite(numeric)) return '—'
  const ms = numeric < 1e12 ? numeric * 1000 : numeric
  return formatUserDate(new Date(ms), { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export function isRetryable(delivery: WebhookDelivery): boolean {
  return delivery.status !== 'delivered'
}
