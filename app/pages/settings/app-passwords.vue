<script setup lang="ts">
// Ported from legacy/src/app/(settings)/settings/app-passwords/page.tsx.
definePageMeta({ layout: 'dashboard', nav: 'settings' })

const { t } = useLanguage()
useHead({ title: () => t('settingsPage.appPasswords.title') })
</script>

<template>
  <UDashboardPanel id="settings-app-passwords">
    <template #header>
      <UDashboardNavbar :title="t('settingsPage.appPasswords.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-4">
        <p class="text-sm text-muted">
          {{ t('settingsPage.appPasswords.description') }}
        </p>
        <UCard>
          <SettingsAccountEmailClientsSettings />
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
