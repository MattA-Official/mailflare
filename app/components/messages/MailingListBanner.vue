<script setup lang="ts">
// Notice pinned to the top of an open message that carries a List-Unsubscribe header. Closing it
// hides the banner for that message; the small inline unsubscribe button next to the sender takes
// its place. Ported from legacy/src/components/messages/mailing-list-banner.tsx.
defineProps<{ messageId: string }>()
const emit = defineEmits<{ dismiss: [] }>()
const { t } = useLanguage()
</script>

<template>
  <div class="mx-4 mb-3 flex items-center gap-3 rounded-lg border border-default bg-elevated px-4 py-2.5 text-sm text-toned sm:mx-0 sm:ml-4">
    <UIcon name="i-lucide-mail" class="size-4 shrink-0 text-muted" aria-hidden="true" />
    <span class="min-w-0 flex-1">{{ t('message.mailingListNotice') }}</span>
    <MessagesUnsubscribeButton :message-id="messageId" variant="row" />
    <UButton
      icon="i-lucide-x"
      color="neutral"
      variant="ghost"
      size="xs"
      class="shrink-0 rounded-full"
      :aria-label="t('navigation.close')"
      @click="emit('dismiss')"
    />
  </div>
</template>
