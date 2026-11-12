<script setup lang="ts">
// The panel every mail settings page renders inside the dashboard layout.
const props = defineProps<{ id: string, title: string }>()
useHead({ title: () => props.title })
</script>

<template>
  <UDashboardPanel :id="id">
    <template #header>
      <UDashboardNavbar :title="title">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-8">
        <slot />
      </div>
    </template>
  </UDashboardPanel>
</template>
