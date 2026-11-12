<script setup lang="ts">
// Upstream's /settings/mailboxes re-exports the admin mailboxes page; the body is the admin email
// area's component, which keeps its links under /settings/mailboxes.
definePageMeta({ layout: 'dashboard', nav: 'settings' })
const { t } = useLanguage()
</script>

<template>
  <SettingsMailSettingsPage id="settings-mailboxes" :title="t('mailboxes.title')">
    <AdminEmailMailboxesList />
  </SettingsMailSettingsPage>
</template>
