<script setup lang="ts">
// Ported from legacy/src/app/(admin)/mailboxes/page.tsx; the body is shared with /settings/mailboxes.
definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', requireMailbox: true } })
const { t } = useLanguage()
useHead({ title: () => t('mailboxes.title') })
</script>

<template>
  <UDashboardPanel id="mailboxes">
    <template #header>
      <AppNavbar :title="t('mailboxes.title')" />
    </template>
    <template #body>
      <AdminEmailMailboxesList />
    </template>
  </UDashboardPanel>
</template>
