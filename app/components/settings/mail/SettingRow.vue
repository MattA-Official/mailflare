<script setup lang="ts">
// One setting on a tinted row: title and description on the left, the control on the right.
defineProps<{ title: string, description?: string, error?: string | null }>()
</script>

<template>
  <div>
    <div class="flex items-start gap-3 rounded-xl bg-elevated/50 p-4">
      <div class="flex-1">
        <p class="text-sm font-medium text-highlighted">{{ title }}</p>
        <p v-if="description" class="mt-1 text-sm text-muted">{{ description }}</p>
        <slot name="description" />
      </div>
      <slot />
    </div>
    <slot name="after" />
    <p v-if="error" role="alert" class="mt-2 px-4 text-sm text-error">{{ error }}</p>
  </div>
</template>
