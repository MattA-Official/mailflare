<script setup lang="ts">
// Warning above a received message whose sender does not check out. With `badge`, the compact
// form for a collapsed thread card. Ported from sender-check-notice.tsx.
import type { TranslationKey } from '#lib/i18n/types'
import { useMessageAuthentication } from '~/composables/messages/useMessageAuthentication'
import { getSenderWarning, type SenderWarningReason } from '~/utils/messages/message-details-utils'
import type { MessageDetailsMessage } from '~/utils/messages/types'

defineOptions({ inheritAttrs: false })
const props = defineProps<{
  message: MessageDetailsMessage
  badge?: boolean
  detailsOpen?: boolean
  /** Announce the warning when it appears after authentication loads. */
  announce?: boolean
}>()
const emit = defineEmits<{ viewDetails: [] }>()
const { t } = useLanguage()
const reasonKeys: Record<SenderWarningReason, TranslationKey> = {
  authentication: 'message.senderCheckAuthenticationFailed',
  senderName: 'message.detailsSenderWarning',
  domain: 'message.detailsDomainMismatch',
  replyTo: 'message.detailsReplyToWarning',
}
const { authentication } = useMessageAuthentication(() => props.message.id, () => props.message.direction)
const warning = computed(() => getSenderWarning(props.message, authentication.value))
</script>

<template>
  <span
    v-if="badge && warning"
    :title="warning.reasons.map(reason => t(reasonKeys[reason])).join(' ')"
    class="mt-1 inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning"
    :class="$attrs.class"
  >
    <UIcon name="i-lucide-shield-alert" class="size-3 shrink-0" aria-hidden="true" />
    {{ t('message.senderCheckShort') }}
  </span>
  <!-- Keep the live region mounted so late authentication warnings are announced. -->
  <div v-else-if="!badge" :role="announce ? 'status' : undefined" :class="warning ? $attrs.class : undefined">
    <button
      v-if="warning"
      type="button"
      :aria-expanded="detailsOpen"
      :aria-label="t('message.senderCheckTitle')"
      class="flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning"
      :class="detailsOpen ? 'border-warning/50 bg-warning/20 text-highlighted' : 'border-warning/30 bg-warning/10 text-highlighted hover:bg-warning/15'"
      @click="emit('viewDetails')"
    >
      <UIcon name="i-lucide-shield-alert" class="size-4 shrink-0 text-warning" aria-hidden="true" />
      <span class="min-w-0 flex-1 break-words">{{ t('message.senderCheckTitle') }}</span>
      <UIcon name="i-lucide-chevron-down" aria-hidden="true" class="size-4 shrink-0 transition-transform" :class="detailsOpen && 'rotate-180'" />
    </button>
  </div>
</template>
