<script setup lang="ts">
// Ported from legacy/src/app/(dashboard)/compose/page.tsx.
definePageMeta({ layout: 'dashboard', auth: { requireMailbox: true } })

const { t } = useLanguage()
useHead({ title: () => t('compose.pageTitle') })
</script>

<template>
  <UDashboardPanel id="compose">
    <template #header>
      <AppNavbar :title="t('compose.pageTitle')" />
    </template>
    <template #body>
      <div class="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4">
        <p class="text-sm text-muted">{{ t('compose.pageDescription') }}</p>
        <ComposeForm mode="page" />
      </div>
    </template>
  </UDashboardPanel>
</template>
