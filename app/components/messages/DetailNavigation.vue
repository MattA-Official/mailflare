<script setup lang="ts">
// Newer / older buttons above the reader, unread messages first. The list of neighbours comes from
// MessagesSplitLayout. Ported from MessageDetailNavigation in message-detail-navigation.tsx.
import { useMessageDetailNavigationContext } from '~/composables/messages/useMessageListContext'
import { fetchCachedMessageDetail, getCachedMessageDetail } from '~/utils/messages/detail-cache'
import { getMessageDetailNavigationState } from '~/utils/messages/detail-navigation-utils'

const props = defineProps<{ messageId: string, unread: boolean }>()
const { t } = useLanguage()
const context = useMessageDetailNavigationContext()

watch(() => [props.messageId, props.unread] as const, ([id, unread]) => {
  if (unread) context?.recordUnread(id)
}, { immediate: true })

const navigation = computed(() => (context ? getMessageDetailNavigationState(context.entries.value, props.messageId) : null))
const previousId = computed(() => navigation.value?.previousId ?? null)
const nextId = computed(() => navigation.value?.nextId ?? null)

function warm(id: string | null) {
  if (!id || getCachedMessageDetail(id)?.body) return
  void fetchCachedMessageDetail(id, true).catch(() => {})
}

watch([previousId, nextId], ([previous, next], _old, onCleanup) => {
  if (!previous && !next) return
  const run = () => {
    warm(previous)
    warm(next)
  }
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(run, { timeout: 1000 })
    onCleanup(() => window.cancelIdleCallback(id))
    return
  }
  const timer = setTimeout(run, 250)
  onCleanup(() => clearTimeout(timer))
}, { immediate: true })

function go(id: string | null) {
  warm(id)
  if (id && context) void navigateTo(`${context.hrefPrefix.value}/${id}`)
}
</script>

<template>
  <div v-if="context" class="ml-auto flex shrink-0 items-center gap-2 text-muted">
    <span v-if="(navigation?.totalUnread ?? 0) > 0" class="mr-2 whitespace-nowrap text-xs" aria-live="polite">
      {{ t('message.nav.unreadPosition', { position: navigation?.unreadOrder ?? 0, total: navigation?.totalUnread ?? 0 }) }}
    </span>
    <UTooltip :text="t('message.nav.newer')">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        class="rounded-full"
        icon="i-lucide-chevron-left"
        :aria-label="t('message.nav.newer')"
        :disabled="!previousId"
        @pointerenter="warm(previousId)"
        @focus="warm(previousId)"
        @click="go(previousId)"
      />
    </UTooltip>
    <UTooltip :text="t('message.nav.older')">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        class="rounded-full"
        icon="i-lucide-chevron-right"
        :aria-label="t('message.nav.older')"
        :disabled="!nextId"
        @pointerenter="warm(nextId)"
        @focus="warm(nextId)"
        @click="go(nextId)"
      />
    </UTooltip>
  </div>
</template>
