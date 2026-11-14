<script setup lang="ts">
// Ported from legacy/src/app/(admin)/mailboxes/page.tsx; the body is shared with /settings/mailboxes.
definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', requireMailbox: true } })
const { t } = useLanguage()
const creating = ref(false)
</script>

<template>
  <AppPage id="mailboxes" :title="t('mailboxes.title')">
    <template #actions>
      <UButton icon="i-lucide-plus" :label="t('mailboxes.new')" @click="creating = true" />
    </template>
    <AdminEmailMailboxesList v-model:create-open="creating" />
  </AppPage>
</template>
