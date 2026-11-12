<script setup lang="ts">
// New-mail notifications while the app is open. Ported from
// legacy/src/components/settings/browser-notification-settings.tsx.
import { BROWSER_NOTIFICATIONS, readStoredToggle, writeStoredToggle } from '~/utils/settings/mail/preferences'

const { t } = useLanguage()
const permission = ref<NotificationPermission | 'unsupported'>('unsupported')
const enabled = ref(false)
const error = ref<string | null>(null)

function refresh() {
  permission.value = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  enabled.value = readStoredToggle(BROWSER_NOTIFICATIONS)
}

onMounted(() => {
  refresh()
  window.addEventListener('focus', refresh)
  window.addEventListener('storage', refresh)
})
onBeforeUnmount(() => {
  window.removeEventListener('focus', refresh)
  window.removeEventListener('storage', refresh)
})

async function update(next: boolean) {
  error.value = null
  if (!next) {
    writeStoredToggle(BROWSER_NOTIFICATIONS, false)
    enabled.value = false
    return
  }
  try {
    const nextPermission = permission.value === 'granted' ? permission.value : await Notification.requestPermission()
    permission.value = nextPermission
    if (nextPermission !== 'granted') return
    writeStoredToggle(BROWSER_NOTIFICATIONS, true)
    enabled.value = true
  } catch {
    error.value = t('settings.notifications.enableFailed')
  }
}
</script>

<template>
  <SettingsMailSettingRow :title="t('settings.notifications.title')" :description="t('settings.notifications.description')" :error="error">
    <USwitch
      :model-value="permission === 'granted' && enabled"
      :disabled="permission === 'unsupported' || permission === 'denied'"
      :aria-label="t('settings.notifications.enable')"
      @update:model-value="update"
    />
    <template #after>
      <p v-if="permission === 'denied'" class="mt-2 px-4 text-sm text-muted">{{ t('settings.notifications.blocked') }}</p>
      <p v-if="permission === 'unsupported'" class="mt-2 px-4 text-sm text-muted">{{ t('settings.notifications.unavailable') }}</p>
    </template>
  </SettingsMailSettingRow>
</template>
