<script setup lang="ts">
// Auto-empty trash after N days. Ported from legacy/src/components/settings/trash-retention-settings.tsx.
import { TRASH_RETENTION_OPTIONS, describeTrashRetention } from '#lib/email/trash-retention-utils'

const { t } = useLanguage()
const days = ref<number | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
// USelect cannot hold null, so "never" has its own value.
const NEVER = 'never'

onMounted(async () => {
  try {
    days.value = (await api<{ days?: number | null }>('/api/settings/trash-retention')).days ?? null
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('settings.trash.loadFailed')
  } finally {
    loading.value = false
  }
})

// Keep a custom value set through the API selectable instead of silently showing "Never".
const items = computed(() => {
  const options: number[] = days.value && !(TRASH_RETENTION_OPTIONS as readonly number[]).includes(days.value)
    ? [...TRASH_RETENTION_OPTIONS, days.value].sort((a, b) => a - b)
    : [...TRASH_RETENTION_OPTIONS]
  return [
    { value: NEVER, label: describeTrashRetention(null, t) },
    ...options.map(value => ({ value: String(value), label: describeTrashRetention(value, t) })),
  ]
})

async function update(value: string) {
  const next = value === NEVER ? null : Number(value)
  const previous = days.value
  days.value = next
  loading.value = true
  error.value = null
  try {
    days.value = (await api<{ days?: number | null }>('/api/settings/trash-retention', { method: 'PATCH', body: { days: next } })).days ?? null
  } catch (cause) {
    days.value = previous
    error.value = cause instanceof Error ? cause.message : t('settings.trash.updateFailed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <SettingsMailSettingRow :title="t('settings.trash.title')" :description="t('settings.trash.description')" :error="error">
    <USelect
      :model-value="days === null ? NEVER : String(days)"
      :items="items"
      :disabled="loading"
      :aria-label="t('settings.trash.title')"
      class="w-36"
      @update:model-value="update(String($event))"
    />
  </SettingsMailSettingRow>
</template>
