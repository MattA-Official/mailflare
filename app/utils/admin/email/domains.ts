// Ported from legacy/src/app/(admin)/domains/{utils,api,tracking-host-utils}.ts.
import type { TranslationKey } from '#lib/i18n/types'
import type { Translator } from '#lib/i18n/utils'
import { ApiError, api } from '~/utils/auth-client'
import type { CreateDomainInput, DnsAuthRecord, DnsAuthStatus, DomainPreflightResponse, MxConflictRecord, SetupResponse } from '~/types/admin/email/domains'

export const dnsAuthRecords: DnsAuthRecord[] = ['mx', 'spf', 'dkim', 'dmarc']

export const dnsAuthDescriptions = {
  mx: 'dns.mx',
  spf: 'dns.spf',
  dkim: 'dns.dkim',
  dmarc: 'dns.dmarc',
} satisfies Record<DnsAuthRecord, TranslationKey>

export function getDnsAuthStatusLabel(status: DnsAuthStatus, t: Translator): string {
  if (status === 'ok') return t('dns.found')
  if (status === 'missing') return t('dns.missing')
  return t('dns.notVerified')
}

/** Row tint for a DNS check, in Nuxt UI's semantic colours so it follows the theme. */
export function getDnsAuthItemClass(status: DnsAuthStatus): string {
  if (status === 'ok') return 'bg-success/10'
  if (status === 'missing') return 'bg-error/10'
  return 'bg-elevated'
}

export async function checkDomain(hostname: string): Promise<DomainPreflightResponse> {
  try {
    const data = await api<Omit<DomainPreflightResponse, 'ok'>>('/api/domains/check', { method: 'POST', body: { hostname } })
    return { ok: true, ...data }
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, ...(error.data as object | null), error: error.message }
    throw error
  }
}

export function isMxConflictError(error: unknown): error is ApiError & { data: SetupResponse } {
  if (!(error instanceof ApiError) || error.status !== 409 || !error.data || typeof error.data !== 'object') return false
  const code = (error.data as SetupResponse).code
  return code === 'MX_CONFLICT' || code === 'MX_RECORDS_CONFLICT'
}

/** Asks whether to replace the MX records another service holds; resolves true to go ahead. */
export type MxReplaceConfirm = (message: string, records: MxConflictRecord[]) => Promise<boolean>

/**
 * Runs a call that the server refuses with 409 MX_CONFLICT while other MX records exist. On a
 * conflict, asks the user and repeats the call with replacement on. Resolves null when declined.
 */
export async function withMxReplacement<T>(call: (replaceMx: boolean) => Promise<T>, confirm: MxReplaceConfirm): Promise<T | null> {
  try {
    return await call(false)
  } catch (error) {
    if (!isMxConflictError(error)) throw error
    if (!(await confirm(error.message, error.data.records ?? []))) return null
    return call(true)
  }
}

export function createDomain(input: CreateDomainInput, confirm: MxReplaceConfirm) {
  return withMxReplacement(
    replaceMxRecords => api<SetupResponse>('/api/domains', { method: 'POST', body: replaceMxRecords ? { ...input, replaceMxRecords: true } : input }),
    confirm,
  )
}

/** Runs Cloudflare Email Routing setup for a domain. Resolves false when the user declined replacing MX records. */
export async function runReceivingSetup(domainId: string, confirm: MxReplaceConfirm): Promise<boolean> {
  const result = await withMxReplacement(
    replaceMx => api<SetupResponse>(`/api/domains/${domainId}/receiving/cloudflare`, { method: 'POST', body: { replaceMx } }),
    confirm,
  )
  return result !== null
}

/**
 * Loads the pixel through the hostname like a mail client would. Image loads need no CORS, so
 * this tells whether the host reaches this Worker over HTTPS.
 */
export function probeTrackingHost(hostname: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image()
    const timer = window.setTimeout(() => finish(false), timeoutMs)
    function finish(ok: boolean) {
      window.clearTimeout(timer)
      image.onload = null
      image.onerror = null
      resolve(ok)
    }
    image.onload = () => finish(image.naturalWidth === 1 && image.naturalHeight === 1)
    image.onerror = () => finish(false)
    image.src = `https://${hostname}/api/i/probe.gif?t=${Date.now()}`
  })
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
