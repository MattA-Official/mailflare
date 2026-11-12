<script setup lang="ts">
// Sent messages still waiting for a reply after their reminder came due, pinned above the inbox.
// Ported from legacy/src/components/follow-ups/due-follow-ups.tsx.
import type { DueFollowUp } from '#lib/follow-ups/types'
import { formatUserDate } from '#lib/time/utils'
import { fetchDueFollowUps, FOLLOW_UPS_CHANGED_EVENT, updateDueFollowUp } from '~/utils/messages/follow-up-client-utils'

const props = defineProps<{ mailboxId?: string | null }>()
const { t } = useLanguage()
const items = shallowRef<DueFollowUp[]>([])
const failed = ref(false)
const DATE_FORMAT: Intl.DateTimeFormatOptions = { month: 'short', day: '2-digit' }

function load() {
  void fetchDueFollowUps(props.mailboxId).then((value) => {
    items.value = value
  }).catch(() => undefined)
}
watch(() => props.mailboxId, load, { immediate: true })
onMounted(() => {
  window.addEventListener(FOLLOW_UPS_CHANGED_EVENT, load)
  window.addEventListener('mailflare:messages-changed', load)
})
onBeforeUnmount(() => {
  window.removeEventListener(FOLLOW_UPS_CHANGED_EVENT, load)
  window.removeEventListener('mailflare:messages-changed', load)
})

function update(id: string, change: Parameters<typeof updateDueFollowUp>[1]) {
  failed.value = false
  items.value = items.value.filter(item => item.id !== id)
  void updateDueFollowUp(id, change).catch(() => {
    failed.value = true
    load()
  })
}
</script>

<template>
  <section v-if="items.length > 0" :aria-label="t('followUp.sectionLabel')" class="border-b border-warning/20 bg-warning/5">
    <h2 class="flex items-center gap-1.5 px-6 pb-1 pt-2.5 text-xs font-medium text-warning">
      <UIcon name="i-lucide-bell-ring" class="size-3.5" aria-hidden="true" />
      {{ t('followUp.sectionTitle', { count: items.length }) }}
    </h2>
    <ul>
      <li v-for="item in items" :key="item.id" class="flex items-center gap-2 px-6 py-1.5 text-sm">
        <NuxtLink :to="`/sent/${item.messageId}`" class="flex min-w-0 flex-1 items-baseline gap-3 hover:underline">
          <span class="w-40 shrink-0 truncate text-toned max-md:w-28">{{ t('followUp.to', { to: item.toAddr }) }}</span>
          <span class="min-w-0 flex-1 truncate font-medium text-highlighted">{{ item.subject || t('list.noSubject') }}</span>
          <time :datetime="item.sentAt" class="shrink-0 text-xs text-muted">{{ formatUserDate(item.sentAt, DATE_FORMAT) }}</time>
        </NuxtLink>
        <ComposeFollowUpMenu @pick="days => update(item.id, { action: 'snooze', days })">
          <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-bell-ring" :aria-label="t('followUp.remindAgain')" />
        </ComposeFollowUpMenu>
        <UTooltip :text="t('followUp.done')">
          <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-check" :aria-label="t('followUp.done')" @click="update(item.id, { action: 'dismiss' })" />
        </UTooltip>
      </li>
    </ul>
    <p v-if="failed" role="alert" class="px-6 pb-2 text-xs text-error">{{ t('followUp.failed') }}</p>
  </section>
</template>
