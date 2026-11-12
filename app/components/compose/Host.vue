<script setup lang="ts">
// Mounted once in the dashboard layout: the send toast and the floating composer, ported from
// legacy/src/components/compose/floating-composer.tsx.
const { notice } = useCompose()
</script>

<template>
  <ComposeNoticeToast v-if="notice" :key="notice.id" :notice="notice" />
</template>
