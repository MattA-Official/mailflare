// Mailbox-scoped rules (applied after delivery). Ported from legacy/src/components/settings/inbox-rules-utils.ts.
import { defaultTranslator, type Translator } from '#lib/i18n/utils'
import type { InboxRule, InboxRuleInput, RuleFolder } from '~/types/settings/mail'

export async function fetchInboxRules(mailboxId: string): Promise<InboxRule[]> {
  const data = await api<{ rules?: InboxRule[] }>(`/api/routing-rules?${new URLSearchParams({ mailboxId })}`)
  return data.rules ?? []
}

/** Folders of a mailbox, as /api/folders lists them. */
export async function fetchMailboxFolders(mailboxId: string): Promise<RuleFolder[]> {
  const data = await api<{ folders?: RuleFolder[] }>(`/api/folders?${new URLSearchParams({ mailboxId })}`, { cache: 'no-store' })
  return data.folders ?? []
}

export function createInboxRule(input: InboxRuleInput) {
  return api('/api/routing-rules', { method: 'POST', body: input })
}

export function updateInboxRule(ruleId: string, input: InboxRuleInput) {
  return api(`/api/routing-rules/${ruleId}`, { method: 'PATCH', body: input })
}

export function deleteInboxRule(ruleId: string) {
  return api(`/api/routing-rules/${ruleId}`, { method: 'DELETE' })
}

export function getRuleFieldLabel(field: string, t: Translator = defaultTranslator): string {
  if (field === 'content') return t('rules.field.content')
  if (field === 'title') return t('rules.field.title')
  return t('rules.field.email')
}

export function getRuleOperatorLabel(operator: string, t: Translator = defaultTranslator): string {
  return operator === 'exact' ? t('rules.operator.exact') : t('rules.operator.contains')
}

export function getInboxRuleDestination(rule: Pick<InboxRule, 'action' | 'folderId'>): string {
  if (rule.action === 'spam' || rule.action === 'trash' || rule.action === 'forward') return rule.action
  return rule.folderId ? `folder:${rule.folderId}` : ''
}
