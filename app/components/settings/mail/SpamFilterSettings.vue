<script setup lang="ts">
// Ported from legacy/src/components/settings/spam-filter-settings.tsx.
const { t } = useLanguage()
const { data: enabled, status, error: loadError } = useAsyncData(
  'settings-spam-protection',
  () => api<{ enabled?: boolean }>('/api/settings/spam').then(data => data.enabled !== false),
  { default: () => true },
)
const saving = ref(false)
const loading = computed(() => saving.value || status.value === 'pending')
const saveError = ref<string | null>(null)
const error = computed(() => saveError.value ?? (loadError.value ? apiErrorMessage(loadError.value, t('settings.spam.loadFailed')) : null))

async function update(next: boolean) {
  const previous = enabled.value
  enabled.value = next
  saving.value = true
  saveError.value = null
  try {
    enabled.value = (await api<{ enabled?: boolean }>('/api/settings/spam', { method: 'PATCH', body: { enabled: next } })).enabled !== false
  } catch (cause) {
    enabled.value = previous
    saveError.value = cause instanceof Error ? cause.message : t('settings.spam.updateFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <SettingsMailSettingRow :title="t('settings.spam.title')" :description="t('settings.spam.description')" :error="error">
    <USwitch :model-value="enabled" :disabled="loading" :aria-label="t('settings.spam.enable')" @update:model-value="update" />
  </SettingsMailSettingRow>
</template>
