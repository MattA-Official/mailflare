<script setup lang="ts">
defineProps<{ count: number, label: string, expanded: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    v-if="count > 0"
    type="button"
    :aria-label="label"
    :aria-expanded="expanded"
    class="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-normal text-amber-700 transition-colors hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-primary dark:text-amber-400 dark:hover:bg-amber-900/40"
    @click="emit('toggle')"
  >
    <UIcon name="i-lucide-notebook-pen" class="size-3.5" aria-hidden="true" />
    {{ count }}
  </button>
</template>
