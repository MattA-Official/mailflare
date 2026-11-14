<script setup lang="ts">
// Ported from legacy/src/app/(settings)/settings/app-passwords/page.tsx.
definePageMeta({ layout: 'dashboard', nav: 'settings' })

const { t } = useLanguage()
</script>

<template>
  <AppPage id="settings-app-passwords" :title="t('settingsPage.appPasswords.title')" :description="t('settingsPage.appPasswords.description')">
    <UCard>
      <SettingsAccountEmailClientsSettings />
    </UCard>
  </AppPage>
</template>
