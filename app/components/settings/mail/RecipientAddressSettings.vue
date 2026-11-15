<script setup lang="ts">
// Show full To/Cc/Bcc addresses. Ported from legacy/src/components/settings/recipient-address-settings.tsx.
const { t } = useLanguage()
const { data: enabled, status, error: loadError } = useAsyncData(
  'settings-recipient-addresses',
  () => api<{ enabled: boolean }>('/api/settings/recipient-addresses').then(data => data.enabled === true),
  { default: () => false },
)
const loading = computed(() => status.value === 'pending')
const saving = ref(false)
const saveError = ref<string | null>(null)
const error = computed(() => saveError.value ?? (loadError.value ? apiErrorMessage(loadError.value, t('settings.recipient.failed')) : null))

async function update(next: boolean) {
  const previous = enabled.value
  enabled.value = next
  saving.value = true
  saveError.value = null
  try {
    enabled.value = (await api<{ enabled: boolean }>('/api/settings/recipient-addresses', { method: 'PATCH', body: { enabled: next } })).enabled === true
  } catch (cause) {
    enabled.value = previous
    saveError.value = cause instanceof Error ? cause.message : t('settings.recipient.failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <SettingsMailSettingRow :title="t('settings.recipient.title')" :description="t('settings.recipient.description')" :error="error">
    <USwitch :model-value="enabled" :disabled="loading || saving" :aria-label="t('settings.recipient.title')" @update:model-value="update" />
  </SettingsMailSettingRow>
</template>
