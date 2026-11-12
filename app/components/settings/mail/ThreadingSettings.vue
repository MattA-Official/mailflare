<script setup lang="ts">
// Ported from legacy/src/components/settings/inbox-threading-settings.tsx.
import { CONVERSATION_VIEW, LATEST_MESSAGES_FIRST, useStoredToggle } from '~/utils/settings/mail/preferences'

const { t } = useLanguage()
const conversationView = useStoredToggle(CONVERSATION_VIEW)
const latestMessagesFirst = useStoredToggle(LATEST_MESSAGES_FIRST)
</script>

<template>
  <div class="space-y-3">
    <SettingsMailSettingRow :title="t('settings.threading.groupTitle')" :description="t('settings.threading.groupDescription')">
      <USwitch v-model="conversationView" :aria-label="t('settings.threading.groupTitle')" />
    </SettingsMailSettingRow>
    <SettingsMailSettingRow :title="t('settings.threading.latestTitle')" :description="t('settings.threading.latestDescription')">
      <USwitch v-model="latestMessagesFirst" :aria-label="t('settings.threading.latestTitle')" />
    </SettingsMailSettingRow>
  </div>
</template>
