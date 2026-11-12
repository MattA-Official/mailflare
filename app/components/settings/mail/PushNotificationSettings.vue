<script setup lang="ts">
// Web Push alerts when the app is closed. Ported from
// legacy/src/components/settings/push-notification-settings.tsx. Upstream never translated these
// strings, and every catalogue must carry every key, so they stay in English until upstream adds them.
import { disablePushNotifications, enablePushNotifications, getPushState, type PushState } from '~/utils/settings/mail/push'

const state = ref<PushState>({ supported: false, configured: false, permission: 'unsupported', subscribed: false })
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    state.value = await getPushState()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to load notification settings'
  } finally {
    loading.value = false
  }
})

const disabled = computed(() => loading.value
  || !state.value.supported
  || (!state.value.configured && !state.value.subscribed)
  || (state.value.permission === 'denied' && !state.value.subscribed))

const description = computed(() => {
  if (!state.value.supported) return 'This browser does not support Web Push for Mailflare.'
  if (!state.value.configured) return 'Web Push has not been configured on this Mailflare server.'
  if (state.value.permission === 'denied') return 'Notifications are blocked in your browser settings.'
  return 'Get new mail alerts even when Mailflare is closed.'
})

async function update(enabled: boolean) {
  loading.value = true
  error.value = null
  try {
    await (enabled ? enablePushNotifications() : disablePushNotifications())
    state.value = await getPushState()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to update notifications'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <SettingsMailSettingRow title="Browser push notifications" :description="description" :error="error">
    <USwitch :model-value="state.subscribed" :disabled="disabled" aria-label="Enable browser push notifications" @update:model-value="update" />
  </SettingsMailSettingRow>
</template>
