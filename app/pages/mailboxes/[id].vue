<script setup lang="ts">
// Ported from legacy/src/app/(admin)/mailboxes/[id]/page.tsx; the body is shared with /settings/mailboxes/[id].
definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', requireMailbox: true } })
const { t } = useLanguage()
const route = useRoute()
const address = ref('')
</script>

<template>
  <AppPage id="mailbox" :title="address || t('mailbox.title')">
    <template #actions>
      <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" to="/mailboxes" :label="t('mailboxes.title')" />
    </template>
    <AdminEmailMailboxDetail :mailbox-id="String(route.params.id)" @loaded="address = $event" />
  </AppPage>
</template>
