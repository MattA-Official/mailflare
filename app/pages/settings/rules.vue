<script setup lang="ts">
// Ported from legacy/src/app/(settings)/settings/rules/page.tsx. Domain routing (shown to users who
// can manage domains) is the admin email area's component, scoped to the selected mailbox's domain.
definePageMeta({ layout: 'dashboard', nav: 'settings' })
const { t } = useLanguage()
</script>

<template>
  <SettingsMailSettingsPage id="settings-rules" :title="t('settings.nav.rules')">
    <SettingsMailInboxRules />
  </SettingsMailSettingsPage>
</template>
