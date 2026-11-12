<script setup lang="ts">
// Frame for every administration page: a dashboard panel with the page title in the navbar,
// actions on its right and upstream's single readable column for the content.
defineProps<{ id: string, title: string, description?: string, wide?: boolean }>()
</script>

<template>
  <UDashboardPanel :id="id">
    <template #header>
      <UDashboardNavbar :title="title">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <slot name="actions" />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar v-if="$slots.toolbar">
        <slot name="toolbar" />
      </UDashboardToolbar>
    </template>
    <template #body>
      <div class="w-full space-y-6" :class="wide ? 'max-w-5xl' : 'max-w-3xl'">
        <p v-if="description" class="text-sm text-muted">
          {{ description }}
        </p>
        <slot />
      </div>
    </template>
  </UDashboardPanel>
</template>
