<script setup lang="ts">
// Sender, recipients and authentication results of one message.
// Ported from legacy/src/components/messages/message-details-panel.tsx.
import { splitEmailAddressList } from '#lib/email/address'
import { formatRecipientAddressList } from '#lib/email/recipient-display'
import type { MessageAuthenticationMethod } from '#lib/email/authentication-types'
import { formatUserDate } from '#lib/time/utils'
import { useMessageAuthentication } from '~/composables/messages/useMessageAuthentication'
import {
  getOriginalSender,
  getReplyToEntries,
  hasDomainMismatchWarning,
  hasFailingAuthenticationCheck,
  hasPassingAuthenticationCheck,
  hasSenderNameAddressMismatch,
  isReplyToDifferent,
} from '~/utils/messages/message-details-utils'
import type { MessageDetailsMessage } from '~/utils/messages/types'

const props = defineProps<{ message: MessageDetailsMessage, closable?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useLanguage()
const sourceOpen = ref(false)
const { authentication, failed: authenticationFailed, loading } = useMessageAuthentication(() => props.message.id, () => props.message.direction)

const original = computed(() => getOriginalSender(props.message.fromAddr))
const contactName = computed(() => props.message.fromContactName?.trim())
const showContactName = computed(() => props.message.direction === 'inbound' && !!contactName.value && contactName.value !== original.value.name)
const replyToEntries = computed(() => getReplyToEntries(props.message.replyTo))
const replyToWarning = computed(() => isReplyToDifferent(props.message))
const senderNameWarning = computed(() => hasSenderNameAddressMismatch(props.message))
const hasPassingCheck = computed(() => hasPassingAuthenticationCheck(authentication.value))
const hasFailingCheck = computed(() => hasFailingAuthenticationCheck(authentication.value))
const spfDetail = computed(() => {
  const auth = authentication.value
  if (!auth?.available) return null
  if (auth.mailedBy) return `mailed by ${auth.mailedBy}${auth.spf?.detail ? ` · ${auth.spf.detail}` : ''}`
  return auth.spf?.detail ?? null
})
const authRows = computed(() => {
  const auth = authentication.value?.available ? authentication.value : null
  return [
    { method: 'SPF', result: auth?.spf ?? null, detail: spfDetail.value },
    { method: 'DKIM', result: auth?.dkim ?? null, detail: auth?.dkim?.detail ?? null },
    { method: 'DMARC', result: auth?.dmarc ?? null, detail: auth?.dmarc?.detail ?? null },
  ] as Array<{ method: string, result: MessageAuthenticationMethod | null, detail: string | null }>
})
const messageRows = computed(() => {
  const message = props.message
  const rows: Array<{ label: string, value: string, warning?: string | null, html?: { name: string, address: string } }> = [
    {
      label: t('message.detailsFrom'),
      value: original.value.address,
      html: original.value.name ? { name: original.value.name, address: original.value.address } : undefined,
      warning: senderNameWarning.value ? t('message.detailsSenderWarning') : null,
    },
  ]
  if (showContactName.value) rows.push({ label: t('message.detailsContact'), value: contactName.value ?? '' })
  if (replyToEntries.value.length > 0) rows.push({ label: t('message.detailsReplyTo'), value: formatRecipientAddressList(message.replyTo, 'full'), warning: replyToWarning.value ? t('message.detailsReplyToWarning') : null })
  rows.push({ label: t('source.to'), value: formatRecipientAddressList(message.toAddr, 'full') || '—' })
  if (splitEmailAddressList(message.ccAddr).length > 0) rows.push({ label: t('message.cc'), value: formatRecipientAddressList(message.ccAddr, 'full') })
  if (splitEmailAddressList(message.bccAddr).length > 0) rows.push({ label: t('message.bcc'), value: formatRecipientAddressList(message.bccAddr, 'full') })
  rows.push({ label: t('message.date'), value: formatUserDate(message.createdAt, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) })
  rows.push({ label: t('source.subject'), value: message.subject?.trim() || t('list.noSubject') })
  return rows
})

function statusTone(status: string | null): string {
  if (status === 'PASS') return 'text-success'
  if (status === 'FAIL' || status === 'SOFTFAIL' || status === 'PERMERROR') return 'text-error'
  if (status === 'TEMPERROR' || status === 'NEUTRAL' || status === 'NONE') return 'text-warning'
  return 'text-default'
}
function statusIcon(status: string | null): string | null {
  if (status === 'PASS') return 'i-lucide-circle-check'
  if (status === 'FAIL' || status === 'SOFTFAIL' || status === 'PERMERROR') return 'i-lucide-triangle-alert'
  return null
}
</script>

<template>
  <section :aria-label="t('message.detailsTitle')" class="overflow-hidden rounded-xl border border-default bg-default text-xs">
    <header class="flex items-center justify-between gap-2 border-b border-default bg-elevated/50 px-3 py-2">
      <h2 class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{{ t('message.detailsTitle') }}</h2>
      <UButton v-if="closable" icon="i-lucide-x" size="xs" color="neutral" variant="ghost" :aria-label="t('navigation.close')" @click="emit('close')" />
    </header>

    <div class="grid gap-4 px-3 py-3" :class="message.direction === 'inbound' && 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] sm:gap-6'">
      <section>
        <h3 class="text-[10px] font-semibold uppercase tracking-[0.08em] text-dimmed">{{ t('message.detailsMessageSection') }}</h3>
        <dl class="mt-2 space-y-2">
          <div v-for="row in messageRows" :key="row.label" class="grid gap-0.5 sm:grid-cols-[92px_minmax(0,1fr)] sm:gap-3">
            <dt class="text-muted">{{ row.label }}</dt>
            <dd class="min-w-0 break-words text-highlighted">
              <template v-if="row.html">
                <span class="font-medium">{{ row.html.name }}</span> <span class="text-muted">&lt;{{ row.html.address }}&gt;</span>
              </template>
              <template v-else>{{ row.value }}</template>
              <span v-if="row.warning" class="mt-0.5 flex items-start gap-1 text-warning">
                <UIcon name="i-lucide-triangle-alert" class="mt-px size-3 shrink-0" aria-hidden="true" />
                <span>{{ row.warning }}</span>
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <section v-if="message.direction === 'inbound'">
        <h3 class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-dimmed">
          <UIcon name="i-lucide-shield-check" class="size-3.5" aria-hidden="true" />
          {{ t('message.detailsAuthentication') }}
        </h3>
        <p v-if="authenticationFailed" class="mt-2 text-muted">{{ t('message.detailsAuthenticationError') }}</p>
        <p v-else-if="loading" class="mt-2 flex items-center gap-1.5 text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" aria-hidden="true" />
          {{ t('message.detailsChecking') }}
        </p>
        <p v-else-if="!authentication || !authentication.available" class="mt-2 text-muted">{{ t('message.detailsAuthenticationUnavailable') }}</p>
        <template v-else>
          <ul class="mt-2 space-y-1">
            <li v-for="row in authRows" :key="row.method" class="flex items-baseline gap-2">
              <span class="text-dimmed" aria-hidden="true">•</span>
              <span class="w-10 shrink-0 font-medium text-toned">{{ row.method }}</span>
              <span class="min-w-0 flex-1 break-words">
                <span class="inline-flex items-center gap-1 font-medium" :class="statusTone(row.result?.status ?? null)">
                  <UIcon v-if="statusIcon(row.result?.status ?? null)" :name="statusIcon(row.result?.status ?? null)!" class="size-3 shrink-0 self-center" aria-hidden="true" />
                  {{ row.result?.status ?? t('source.noResult') }}
                </span>
                <span v-if="row.result && row.detail" class="text-muted"> · {{ row.detail }}</span>
              </span>
            </li>
          </ul>
          <p v-if="authentication.encryption" class="mt-2 text-muted">
            {{ t('message.detailsEncryption') }} <span class="text-highlighted">{{ authentication.encryption }}</span>
          </p>
          <p v-if="hasDomainMismatchWarning(authentication)" class="mt-2 flex items-start gap-1.5 text-warning">
            <UIcon name="i-lucide-shield-alert" class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{{ t('message.detailsDomainMismatch') }}</span>
          </p>
          <div v-if="hasPassingCheck || hasFailingCheck" class="mt-3 rounded-lg bg-elevated px-2.5 py-2">
            <h4 class="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{{ t('message.detailsExplanationTitle') }}</h4>
            <div class="mt-1 space-y-1 text-[11px] leading-snug text-toned">
              <p v-if="hasPassingCheck">{{ t('message.detailsAuthenticationNote') }}</p>
              <p v-if="hasFailingCheck">{{ t('message.detailsAuthenticationFailureNote') }}</p>
            </div>
          </div>
        </template>
      </section>
    </div>

    <footer class="flex justify-end border-t border-default px-3 py-2">
      <UButton variant="ghost" size="xs" icon="i-lucide-external-link" :label="t('message.showOriginal')" @click="sourceOpen = true" />
    </footer>
    <MessagesMessageSourceDialog v-model:open="sourceOpen" :message-id="message.id" />
  </section>
</template>
