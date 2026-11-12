<script setup lang="ts">
// Static note icon and count for rows that cannot hover, such as the stacked mobile row.
defineProps<{ count?: number }>()
const { t } = useLanguage()
</script>

<template>
  <span v-if="count" class="mr-1.5 inline-flex items-center gap-0.5 align-middle text-xs font-normal text-amber-700 dark:text-amber-400" role="img" :aria-label="t('note.count', { count })">
    <UIcon name="i-lucide-notebook-pen" class="size-3" aria-hidden="true" />
    {{ count }}
  </span>
</template>
