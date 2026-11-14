<script setup lang="ts">
// Upstream's /settings/mailboxes re-exports the admin mailboxes page; the body is the admin email
// area's component, which keeps its links under /settings/mailboxes.
definePageMeta({ layout: 'dashboard', nav: 'settings' })
const { t } = useLanguage()
const creating = ref(false)
</script>

<template>
  <AppPage id="settings-mailboxes" :title="t('mailboxes.title')">
    <template #actions>
      <UButton icon="i-lucide-plus" :label="t('mailboxes.new')" @click="creating = true" />
    </template>
    <AdminEmailMailboxesList v-model:create-open="creating" />
  </AppPage>
</template>
