<script setup lang="ts">
// Account-wide composer defaults; each message can still change the read receipt in the composer.
// Ported from legacy/src/components/settings/compose-defaults-settings.tsx.
import { DEFAULT_UNDO_SEND_SECONDS, UNDO_SEND_OPTIONS } from '#lib/compose/compose-utils'
import type { ComposePreferences } from '#lib/compose/types'
import { loadComposePreferences, updateComposePreferences } from '~/utils/compose/compose-preferences'

const { t } = useLanguage()
const { data: preferences, status, error: loadError } = useAsyncData<ComposePreferences>('settings-compose-defaults', loadComposePreferences, {
  default: () => ({ trackOpensDefault: false, undoSendSeconds: DEFAULT_UNDO_SEND_SECONDS }),
})
const loading = computed(() => status.value === 'pending')
const saving = ref(false)
const saveError = ref<string | null>(null)
const error = computed(() => saveError.value ?? (loadError.value ? t('settings.compose.failed') : null))

const undoItems = computed(() => UNDO_SEND_OPTIONS.map(seconds => ({
  value: seconds as number,
  label: seconds === 0 ? t('settings.compose.undoOff') : t('settings.compose.undoSeconds', { seconds }),
})))

async function change(patch: Partial<ComposePreferences>) {
  const previous = preferences.value
  preferences.value = { ...previous, ...patch }
  saving.value = true
  saveError.value = null
  try {
    // Shared with the composer, so its cached defaults follow this change.
    preferences.value = await updateComposePreferences(patch)
  } catch (cause) {
    preferences.value = previous
    saveError.value = cause instanceof Error && cause.message === 'MIGRATION_REQUIRED' ? t('settings.compose.migrationRequired') : t('settings.compose.failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <SettingsMailSettingRow :title="t('settings.compose.trackOpensTitle')" :description="t('settings.compose.trackOpensDescription')">
      <USwitch
        :model-value="preferences.trackOpensDefault"
        :disabled="loading || saving"
        :aria-label="t('settings.compose.trackOpensTitle')"
        @update:model-value="change({ trackOpensDefault: $event })"
      />
    </SettingsMailSettingRow>
    <SettingsMailSettingRow :title="t('settings.compose.undoTitle')" :description="t('settings.compose.undoDescription')">
      <USelect
        :model-value="preferences.undoSendSeconds"
        :items="undoItems"
        :disabled="loading || saving"
        :aria-label="t('settings.compose.undoTitle')"
        class="w-32"
        @update:model-value="change({ undoSendSeconds: Number($event) })"
      />
    </SettingsMailSettingRow>
    <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" class="mx-4 w-auto" />
  </div>
</template>
