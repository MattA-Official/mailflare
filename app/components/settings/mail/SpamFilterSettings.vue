<script setup lang="ts">
// Ported from legacy/src/components/settings/spam-filter-settings.tsx.
const { t } = useLanguage()
const enabled = ref(true)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    enabled.value = (await api<{ enabled?: boolean }>('/api/settings/spam')).enabled !== false
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('settings.spam.loadFailed')
  } finally {
    loading.value = false
  }
})

async function update(next: boolean) {
  const previous = enabled.value
  enabled.value = next
  loading.value = true
  error.value = null
  try {
    enabled.value = (await api<{ enabled?: boolean }>('/api/settings/spam', { method: 'PATCH', body: { enabled: next } })).enabled !== false
  } catch (cause) {
    enabled.value = previous
    error.value = cause instanceof Error ? cause.message : t('settings.spam.updateFailed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <SettingsMailSettingRow :title="t('settings.spam.title')" :description="t('settings.spam.description')" :error="error">
    <USwitch :model-value="enabled" :disabled="loading" :aria-label="t('settings.spam.enable')" @update:model-value="update" />
  </SettingsMailSettingRow>
</template>
