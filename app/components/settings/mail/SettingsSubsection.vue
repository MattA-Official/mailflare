<script setup lang="ts">
defineProps<{ title: string, description?: string }>()
</script>

<template>
  <div class="py-6 first:pt-0 last:pb-0">
    <div class="mb-4">
      <h3 class="text-base font-semibold text-highlighted">{{ title }}</h3>
      <p v-if="description" class="mt-1 text-sm text-muted">{{ description }}</p>
    </div>
    <slot />
  </div>
</template>
