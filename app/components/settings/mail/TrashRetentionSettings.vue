<script setup lang="ts">
// Auto-empty trash after N days. Ported from legacy/src/components/settings/trash-retention-settings.tsx.
import { TRASH_RETENTION_OPTIONS, describeTrashRetention } from '#lib/email/trash-retention-utils'

const { t } = useLanguage()
const { data: days, status, error: loadError } = useAsyncData(
  'settings-trash-retention',
  () => api<{ days?: number | null }>('/api/settings/trash-retention').then(data => data.days ?? null),
  { default: () => null as number | null },
)
const saving = ref(false)
const loading = computed(() => saving.value || status.value === 'pending')
const saveError = ref<string | null>(null)
const error = computed(() => saveError.value ?? (loadError.value ? apiErrorMessage(loadError.value, t('settings.trash.loadFailed')) : null))
// USelect cannot hold null, so "never" has its own value.
const NEVER = 'never'

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
  saving.value = true
  saveError.value = null
  try {
    days.value = (await api<{ days?: number | null }>('/api/settings/trash-retention', { method: 'PATCH', body: { days: next } })).days ?? null
  } catch (cause) {
    days.value = previous
    saveError.value = cause instanceof Error ? cause.message : t('settings.trash.updateFailed')
  } finally {
    saving.value = false
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
