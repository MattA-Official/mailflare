<script setup lang="ts">
// Ported from legacy/src/app/(settings)/settings/api-keys/page.tsx.
definePageMeta({ layout: 'dashboard', nav: 'settings' })

const { t } = useLanguage()
const creating = ref(false)
</script>

<template>
  <AppPage id="settings-api-keys" :title="t('apiKeys.title')" :description="t('apiKeys.description')">
    <template #actions>
      <UButton icon="i-lucide-plus" :label="t('apiKeys.new')" @click="creating = true" />
    </template>
    <SettingsAccountApiKeysSettings v-model:create-open="creating" />
  </AppPage>
</template>
