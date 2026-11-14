<script setup lang="ts">
// The panel every mail settings page renders inside the dashboard layout: the standard page (AppPage)
// with more room between its sections.
defineProps<{ id: string, title: string, description?: string }>()
</script>

<template>
  <AppPage :id="id" :title="title" :description="description">
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
    <div class="space-y-8">
      <slot />
    </div>
  </AppPage>
</template>
