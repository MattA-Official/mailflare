<script setup lang="ts">
// Ported from legacy/src/components/settings/inbox-reading-layout-settings.tsx.
import { AUTO_ADVANCE, TWO_COLUMN_READING, useStoredToggle } from '~/utils/settings/mail/preferences'

const { t } = useLanguage()
const twoColumnReading = useStoredToggle(TWO_COLUMN_READING)
const autoAdvance = useStoredToggle(AUTO_ADVANCE)
</script>

<template>
  <div class="space-y-3">
    <SettingsMailSettingRow :title="t('settings.reading.title')" :description="t('settings.reading.description')">
      <USwitch v-model="twoColumnReading" :aria-label="t('settings.reading.title')" />
    </SettingsMailSettingRow>
    <SettingsMailSettingRow :title="t('settings.reading.autoAdvanceTitle')" :description="t('settings.reading.autoAdvanceDescription')">
      <USwitch v-model="autoAdvance" :aria-label="t('settings.reading.autoAdvanceTitle')" />
    </SettingsMailSettingRow>
  </div>
</template>
