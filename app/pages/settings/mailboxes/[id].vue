<script setup lang="ts">
// Upstream's /settings/mailboxes/[id] re-exports the admin mailbox page.
definePageMeta({ layout: 'dashboard', nav: 'settings' })
const { t } = useLanguage()
const route = useRoute()
</script>

<template>
  <SettingsMailSettingsPage id="settings-mailbox" :title="t('mailbox.title')">
    <AdminEmailMailboxDetail :mailbox-id="String(route.params.id)" />
  </SettingsMailSettingsPage>
</template>
