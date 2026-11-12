// Ported from legacy/src/app/(admin)/spam-filter/types.d.ts.
import type { SpamBrand, SpamIntelligenceStatus } from '#lib/spam/types'

export type { SpamBrand, SpamKeySource } from '#lib/spam/types'
export type SpamFilterSettingsResponse = SpamIntelligenceStatus
export interface SpamFilterUpdate {
  spamhausDqsKey?: string | null
  abuseChAuthKey?: string | null
  domainAge?: boolean
  brands?: SpamBrand[]
}
export interface BrandLinesResult { brands: SpamBrand[], invalidLines: number[] }
export type SpamKeyField = 'spamhausDqsKey' | 'abuseChAuthKey'
