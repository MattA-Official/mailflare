<script setup lang="ts">
// The standard page header inside a UDashboardPanel: the sidebar toggle, the title, and the page's own
// controls. `search` adds the mail search box; mail pages also show the DNS-skipped banner below.
withDefaults(defineProps<{ title?: string, search?: boolean, banner?: boolean }>(), { title: undefined, banner: undefined })
</script>

<template>
  <UDashboardNavbar :title="title" :ui="{ title: search ? 'max-lg:hidden' : undefined, center: 'flex min-w-0 flex-1 justify-center', root: 'relative' }">
    <template #leading>
      <UDashboardSidebarCollapse />
      <slot name="leading" />
    </template>
    <template v-if="search || $slots.default" #default>
      <AppHeaderSearch v-if="search" />
      <slot />
    </template>
    <template #right>
      <slot name="right" />
      <AgentAssistantToggle />
      <AppAppsMenu />
    </template>
  </UDashboardNavbar>
  <AppDnsSkippedBanner v-if="banner ?? search" />
</template>
