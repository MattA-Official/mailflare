// The label key for a follow-up interval, from legacy/src/components/follow-ups/follow-up-client-utils.ts.
import type { TranslationKey } from '#lib/i18n/types'

export function followUpOptionKey(days: number): TranslationKey {
  if (days === 1) return 'followUp.in1Day'
  if (days === 7) return 'followUp.in1Week'
  return 'followUp.in3Days'
}
