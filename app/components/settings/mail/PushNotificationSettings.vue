<script setup lang="ts">
// Web Push alerts when the app is closed. Ported from
// legacy/src/components/settings/push-notification-settings.tsx.
import { disablePushNotifications, enablePushNotifications, getPushState, type PushState } from '~/utils/settings/mail/push'

const { t } = useLanguage()
const state = ref<PushState>({ supported: false, configured: false, permission: 'unsupported', subscribed: false })
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    state.value = await getPushState()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('settings.push.loadFailed')
  } finally {
    loading.value = false
  }
})

const disabled = computed(() => loading.value
  || !state.value.supported
  || (!state.value.configured && !state.value.subscribed)
  || (state.value.permission === 'denied' && !state.value.subscribed))

const description = computed(() => {
  if (!state.value.supported) return t('settings.push.unsupported')
  if (!state.value.configured) return t('settings.push.notConfigured')
  if (state.value.permission === 'denied') return t('settings.push.blocked')
  return t('settings.push.description')
})

async function update(enabled: boolean) {
  loading.value = true
  error.value = null
  try {
    await (enabled ? enablePushNotifications() : disablePushNotifications())
    state.value = await getPushState()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('settings.push.updateFailed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <SettingsMailSettingRow :title="t('settings.push.title')" :description="description" :error="error">
    <USwitch :model-value="state.subscribed" :disabled="disabled" :aria-label="t('settings.push.toggleLabel')" @update:model-value="update" />
  </SettingsMailSettingRow>
</template>
