<script setup lang="ts">
// Ported from legacy/src/components/settings/inbox-reading-layout-settings.tsx.
import { TWO_COLUMN_READING, useStoredToggle } from '~/utils/settings/mail/preferences'

const { t } = useLanguage()
const twoColumnReading = useStoredToggle(TWO_COLUMN_READING)
</script>

<template>
  <SettingsMailSettingRow :title="t('settings.reading.title')" :description="t('settings.reading.description')">
    <USwitch v-model="twoColumnReading" :aria-label="t('settings.reading.title')" />
  </SettingsMailSettingRow>
</template>
