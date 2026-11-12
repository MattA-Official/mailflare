<script setup lang="ts">
// Ported from legacy/src/app/(settings)/settings/api-keys/page.tsx.
definePageMeta({ layout: 'dashboard', nav: 'settings' })

const { t } = useLanguage()
useHead({ title: () => t('apiKeys.title') })
</script>

<template>
  <UDashboardPanel id="settings-api-keys">
    <template #header>
      <UDashboardNavbar :title="t('apiKeys.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-3xl">
        <SettingsAccountApiKeysSettings />
      </div>
    </template>
  </UDashboardPanel>
</template>
