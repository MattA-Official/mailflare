// Ported from legacy/src/app/(admin)/spam-filter/utils.ts.
import { api } from '~/utils/auth-client'
import type { BrandLinesResult, SpamBrand, SpamFilterSettingsResponse, SpamFilterUpdate } from '~/types/admin/email/spam-filter'

export const SPAMHAUS_SIGNUP_URL = 'https://www.spamhaus.com/data-access/free-data-query-service/'
export const ABUSECH_SIGNUP_URL = 'https://auth.abuse.ch/'

const DOMAIN = /^(?=.{3,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/

export function loadSpamFilterSettings() {
  return api<SpamFilterSettingsResponse>('/api/admin/spam-filter')
}

export function saveSpamFilterSettings(update: SpamFilterUpdate) {
  return api<SpamFilterSettingsResponse>('/api/admin/spam-filter', { method: 'PUT', body: update })
}

/** One brand per line, `Name = domain.ch, domain.com`; blank lines are skipped, unreadable ones reported (1-based). */
export function parseBrandLines(text: string): BrandLinesResult {
  const brands: SpamBrand[] = []
  const invalidLines: number[] = []
  text.split('\n').forEach((line, index) => {
    if (!line.trim()) return
    const [name = '', list = ''] = line.split('=', 2).map(part => part?.trim() ?? '')
    const domains = list.split(/[\s,;]+/).map(domain => domain.toLowerCase().replace(/^@/, '')).filter(Boolean)
    if (name.length < 2 || name.length > 60 || !domains.length || domains.length > 20 || !domains.every(domain => DOMAIN.test(domain))) invalidLines.push(index + 1)
    else brands.push({ name, domains })
  })
  return { brands, invalidLines }
}

export function formatBrandLines(brands: SpamBrand[]): string {
  return brands.map(brand => `${brand.name} = ${brand.domains.join(', ')}`).join('\n')
}
