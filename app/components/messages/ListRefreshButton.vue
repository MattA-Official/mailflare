<script setup lang="ts">
// Reloads the visible lists and counts. Ported from legacy/src/components/messages/message-list-refresh-button.tsx.
import { refreshMessageViews } from '~/utils/messages/message-refresh'

const props = withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false })
const emit = defineEmits<{ error: [] }>()
const { t } = useLanguage()
const refreshing = ref(false)

async function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await refreshMessageViews()
  }
  catch {
    emit('error')
  }
  finally {
    refreshing.value = false
  }
}

const label = computed(() => (refreshing.value ? t('list.refreshing') : t('list.refresh')))
</script>

<template>
  <UTooltip :text="label">
    <UButton
      icon="i-lucide-refresh-cw"
      color="neutral"
      variant="ghost"
      size="sm"
      square
      :disabled="props.disabled || refreshing"
      :aria-label="label"
      :aria-busy="refreshing"
      :ui="{ leadingIcon: refreshing ? 'animate-spin' : undefined }"
      @click="refresh"
    />
  </UTooltip>
  <span role="status" aria-live="polite" class="sr-only">{{ refreshing ? t('list.refreshing') : '' }}</span>
</template>
