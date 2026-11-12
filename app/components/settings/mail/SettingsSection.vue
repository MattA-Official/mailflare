<script setup lang="ts">
// A group of settings with a heading, on one card. Each default-slot child is a subsection.
defineProps<{ title: string, description?: string }>()
</script>

<template>
  <section class="space-y-4">
    <div>
      <h2 class="text-xl font-semibold text-highlighted">{{ title }}</h2>
      <p v-if="description" class="mt-1 text-sm text-muted">{{ description }}</p>
    </div>
    <UCard :ui="{ body: 'divide-y divide-default p-6 sm:p-6' }">
      <slot />
    </UCard>
  </section>
</template>
