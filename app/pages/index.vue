<script setup lang="ts">
// Upstream shows a marketing landing page here. A personal install goes straight to the mailbox.
definePageMeta({ auth: { mode: 'public' } })
await navigateTo('/inbox', { replace: true })
</script>

<template>
  <div />
</template>
