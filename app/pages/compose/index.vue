<script setup lang="ts">
// Ported from legacy/src/app/(dashboard)/compose/page.tsx.
definePageMeta({ layout: 'dashboard', auth: { requireMailbox: true } })

const { t } = useLanguage()
useHead({ title: () => t('compose.pageTitle') })
</script>

<template>
  <UDashboardPanel id="compose">
    <template #header>
      <UDashboardNavbar :title="t('compose.pageTitle')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <p class="text-sm text-muted">{{ t('compose.pageDescription') }}</p>
      <ComposeForm mode="page" />
    </template>
  </UDashboardPanel>
</template>
