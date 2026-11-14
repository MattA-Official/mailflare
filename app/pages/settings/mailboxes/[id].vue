<script setup lang="ts">
// Upstream's /settings/mailboxes/[id] re-exports the admin mailbox page.
definePageMeta({ layout: 'dashboard', nav: 'settings' })
const { t } = useLanguage()
const route = useRoute()
const address = ref('')
</script>

<template>
  <AppPage id="settings-mailbox" :title="address || t('mailbox.title')">
    <template #actions>
      <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" to="/settings/mailboxes" :label="t('mailboxes.title')" />
    </template>
    <AdminEmailMailboxDetail :mailbox-id="String(route.params.id)" @loaded="address = $event" />
  </AppPage>
</template>
