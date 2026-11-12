<script setup lang="ts">
// Ported from legacy/src/app/(admin)/mailboxes/[id]/page.tsx; the body is shared with /settings/mailboxes/[id].
definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', requireMailbox: true } })
const { t } = useLanguage()
const route = useRoute()
useHead({ title: () => t('mailbox.title') })
</script>

<template>
  <UDashboardPanel id="mailbox">
    <template #header>
      <UDashboardNavbar :title="t('mailbox.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <AdminEmailMailboxDetail :mailbox-id="String(route.params.id)" />
    </template>
  </UDashboardPanel>
</template>
