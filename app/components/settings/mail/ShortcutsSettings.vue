<script setup lang="ts">
// Ported from legacy/src/components/settings/inbox-shortcuts-settings.tsx.
const { t } = useLanguage()
const { shortcutsEnabled, shortcutsPreferenceLoading, shortcutsPreferenceError, setShortcutsEnabled } = useShortcuts()
const saving = ref(false)
const saveError = ref<string | null>(null)

async function update(enabled: boolean) {
  saving.value = true
  saveError.value = null
  try {
    await setShortcutsEnabled(enabled)
  } catch (cause) {
    saveError.value = cause instanceof Error ? cause.message : t('settings.shortcuts.failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <SettingsMailSettingRow
    :title="t('settings.shortcuts.title')"
    :description="t('settings.shortcuts.description')"
    :error="saveError || shortcutsPreferenceError"
  >
    <USwitch
      :model-value="shortcutsEnabled"
      :disabled="shortcutsPreferenceLoading || saving"
      :aria-label="t('settings.shortcuts.enable')"
      @update:model-value="update"
    />
  </SettingsMailSettingRow>
</template>
