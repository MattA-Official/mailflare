<script setup lang="ts">
// Hides or shows the list beside the reader, or goes back to it in single-column reading.
// Ported from legacy/src/components/messages/message-reading-header-button.tsx.
import { useMessageListVisibility } from '~/composables/messages/useMessageListContext'

const props = defineProps<{ assistantVisible: boolean }>()
const { t } = useLanguage()
const visibility = useMessageListVisibility()
const label = computed(() => {
  const { singleColumn, visible, backLabel } = visibility.value
  if (singleColumn) return t('message.nav.backTo', { folder: backLabel })
  if (props.assistantVisible) return null
  return visible ? t('message.nav.hideList') : t('message.nav.showList')
})

function handleClick() {
  if (visibility.value.singleColumn) void navigateTo(visibility.value.backHref)
  else visibility.value.toggle()
}
</script>

<template>
  <UTooltip :text="label ?? undefined" :disabled="!label">
    <UButton
      color="neutral"
      variant="ghost"
      size="sm"
      class="relative z-10 shrink-0 rounded-full"
      :class="[
        !visibility.singleColumn && 'hidden lg:inline-flex',
        !visibility.singleColumn && assistantVisible ? 'opacity-40' : !visibility.singleColumn && !visibility.visible ? 'opacity-60 hover:opacity-100' : '',
      ]"
      :icon="visibility.singleColumn ? 'i-lucide-arrow-left' : 'i-lucide-columns-2'"
      :disabled="!visibility.singleColumn && assistantVisible"
      :aria-label="label ?? t('message.nav.listUnavailable')"
      :aria-pressed="visibility.singleColumn ? undefined : visibility.visible"
      @click="handleClick"
    />
  </UTooltip>
</template>
