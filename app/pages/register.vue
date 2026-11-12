<script setup lang="ts">
// Upstream's /register only redirects to first-run setup.
definePageMeta({ layout: false, auth: { mode: 'public' }, middleware: [() => navigateTo('/setup', { replace: true })] })
</script>

<template>
  <div />
</template>
