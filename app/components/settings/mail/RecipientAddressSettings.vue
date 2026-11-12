<script setup lang="ts">
// Show full To/Cc/Bcc addresses. Ported from legacy/src/components/settings/recipient-address-settings.tsx.
const { t } = useLanguage()
const enabled = ref(false)
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    enabled.value = (await api<{ enabled: boolean }>('/api/settings/recipient-addresses')).enabled === true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('settings.recipient.failed')
  } finally {
    loading.value = false
  }
})

async function update(next: boolean) {
  const previous = enabled.value
  enabled.value = next
  saving.value = true
  error.value = null
  try {
    enabled.value = (await api<{ enabled: boolean }>('/api/settings/recipient-addresses', { method: 'PATCH', body: { enabled: next } })).enabled === true
  } catch (cause) {
    enabled.value = previous
    error.value = cause instanceof Error ? cause.message : t('settings.recipient.failed')
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
