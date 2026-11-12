<script setup lang="ts">
// Eye icon on list rows whose read-receipt pixel has registered an open.
defineProps<{ count?: number }>()
const { t } = useLanguage()
</script>

<template>
  <UIcon v-if="count" name="i-lucide-eye" class="mr-1 inline size-3 align-[-1px] text-primary" role="img" :aria-label="t('list.opened', { count })" />
</template>
