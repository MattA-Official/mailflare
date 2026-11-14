<script setup lang="ts">
// The standard signed-in page: a dashboard panel with the title and the page's main actions in the
// header, then an optional one-line description above a centred, readable column. List, admin and
// settings pages all use it so titles, buttons and widths line up from page to page.
const props = defineProps<{ id: string, title: string, description?: string, wide?: boolean }>()
useHead({ title: () => props.title })
</script>

<template>
  <UDashboardPanel :id="id">
    <template #header>
      <AppNavbar :title="title">
        <template #right>
          <slot name="actions" />
        </template>
      </AppNavbar>
      <UDashboardToolbar v-if="$slots.toolbar">
        <slot name="toolbar" />
      </UDashboardToolbar>
    </template>
    <template #body>
      <div class="mx-auto w-full space-y-6" :class="wide ? 'max-w-5xl' : 'max-w-3xl'">
        <p v-if="description" class="text-sm text-muted">
          {{ description }}
        </p>
        <slot />
      </div>
    </template>
  </UDashboardPanel>
</template>
