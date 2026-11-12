// Ported from legacy/src/components/settings/domain-routing/utils.ts and (admin)/routing/utils.ts.
import type { TranslationKey } from '#lib/i18n/types'
import type { Translator } from '#lib/i18n/utils'
import { formatUserDate } from '#lib/time/utils'
import { ApiError, api } from '~/utils/auth-client'
import type { DomainRule, DomainRuleField, DomainRuleInput, DomainRuleMailbox, DomainRuleOperator, RoutingDomain } from '~/types/admin/email/routing'

export const MATCH_FIELD_LABELS: Record<DomainRuleField, TranslationKey> = {
  recipient: 'routing.field.recipient',
  sender: 'routing.field.sender',
  title: 'routing.field.title',
  content: 'routing.field.content',
}

export const MATCH_OPERATOR_LABELS: Record<DomainRuleOperator, TranslationKey> = {
  contains: 'routing.operator.contains',
  exact: 'routing.operator.exact',
  starts_with: 'routing.operator.starts_with',
  ends_with: 'routing.operator.ends_with',
  regex: 'routing.operator.regex',
}

export const ACTION_LABELS = {
  store: 'routing.action.store',
  forward: 'routing.action.forward',
  reject: 'routing.action.reject',
} satisfies Record<DomainRule['action'], TranslationKey>

export const ACTION_ICONS = {
  store: 'i-lucide-inbox',
  forward: 'i-lucide-forward',
  reject: 'i-lucide-ban',
} as const satisfies Record<DomainRule['action'], string>

export async function fetchAdminRoutingDomains(): Promise<RoutingDomain[]> {
  return (await api<{ domains?: RoutingDomain[] }>('/api/routing-rules/domain?list=true')).domains ?? []
}

export async function fetchDomainRules(domainId: string, mailboxId?: string): Promise<{ rules: DomainRule[], mailboxes: DomainRuleMailbox[] }> {
  const params = new URLSearchParams({ domainId })
  if (mailboxId) params.set('mailboxId', mailboxId)
  const json = await api<{ rules?: DomainRule[], mailboxes?: DomainRuleMailbox[] }>(`/api/routing-rules/domain?${params}`)
  return { rules: json.rules ?? [], mailboxes: json.mailboxes ?? [] }
}

function domainRuleUrl(id: string | null, mailboxId?: string): string {
  const query = mailboxId ? `?${new URLSearchParams({ mailboxId })}` : ''
  return `/api/routing-rules/domain${id ? `/${id}` : ''}${query}`
}

export function createDomainRule(input: DomainRuleInput, mailboxId?: string) {
  return api(domainRuleUrl(null, mailboxId), { method: 'POST', body: input })
}

export function updateDomainRule(id: string, input: DomainRuleInput, mailboxId?: string) {
  return api(domainRuleUrl(id, mailboxId), { method: 'PATCH', body: input })
}

export function deleteDomainRule(id: string, mailboxId?: string) {
  return api(domainRuleUrl(id, mailboxId), { method: 'DELETE' })
}

export function describeRule(rule: DomainRule, mailboxes: DomainRuleMailbox[], hostname: string, t: Translator): string {
  const condition = rule.matchValue === '*'
    ? t('routing.anyMessage')
    : `${t(MATCH_FIELD_LABELS[rule.matchField])} ${t(MATCH_OPERATOR_LABELS[rule.matchOperator])} "${rule.matchValue}"`
  if (rule.action === 'reject') return t('routing.describe.reject', { condition })
  if (rule.action === 'forward') return t(rule.keepCopy ? 'routing.describe.forwardCopy' : 'routing.describe.forward', { condition, to: rule.forwardTo ?? '—' })
  const mailbox = mailboxes.find(m => m.id === rule.mailboxId)
  return t('routing.describe.store', { condition, address: mailbox ? `${mailbox.localPart}@${hostname}` : '—' })
}

export function formatLastMatched(value: DomainRule['lastMatchedAt'], t: Translator): string {
  if (value === null || value === undefined) return t('routing.never')
  const numeric = typeof value === 'number' ? value : Date.parse(String(value))
  if (!Number.isFinite(numeric)) return t('routing.never')
  // Drizzle timestamps serialise as seconds when they bypass the mapper.
  const ms = numeric < 1e12 ? numeric * 1000 : numeric
  return formatUserDate(new Date(ms), { dateStyle: 'medium', timeStyle: 'short' })
}

export function emptyRuleInput(domainId: string): DomainRuleInput {
  return { domainId, name: '', enabled: true, matchField: 'recipient', matchOperator: 'contains', matchValue: '', action: 'store', mailboxId: null, forwardTo: '', keepCopy: false, rejectReason: '', priority: 100 }
}

export function ruleToInput(rule: DomainRule): DomainRuleInput {
  return {
    domainId: rule.domainId,
    name: rule.name ?? '',
    enabled: rule.enabled,
    matchField: rule.matchField,
    matchOperator: rule.matchOperator,
    matchValue: rule.matchValue,
    action: rule.action,
    mailboxId: rule.mailboxId,
    forwardTo: rule.forwardTo ?? '',
    keepCopy: rule.keepCopy,
    rejectReason: rule.rejectReason ?? '',
    priority: rule.priority,
  }
}

/** The routing endpoints answer a 400 with zod's flattened errors; turn them into one line. */
export function validationMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  const detail = (error.data as { error?: unknown } | null)?.error
  if (!detail || typeof detail !== 'object') return null
  const { formErrors = [], fieldErrors = {} } = detail as { formErrors?: string[], fieldErrors?: Record<string, string[] | undefined> }
  const lines = [...formErrors, ...Object.values(fieldErrors).flatMap(messages => messages ?? [])]
  return lines.length ? lines.join('; ') : null
}
