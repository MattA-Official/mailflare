<script setup lang="ts">
// Ported from legacy/src/app/(admin)/domains/status-row.tsx (StatusBadge).
defineProps<{ ok: boolean, tone?: 'red' | 'neutral' }>()
</script>

<template>
  <span v-if="ok" class="flex size-7 shrink-0 items-center justify-center rounded-full bg-success text-inverted">
    <UIcon name="i-lucide-check" class="size-4" />
  </span>
  <span v-else class="flex size-7 shrink-0 items-center justify-center rounded-full bg-default/70">
    <UIcon name="i-lucide-triangle-alert" class="size-4" :class="tone === 'neutral' ? 'text-dimmed' : 'text-error'" />
  </span>
</template>
