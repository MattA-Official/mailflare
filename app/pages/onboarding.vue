<script setup lang="ts">
// Upstream's /onboarding only redirects to /setup, which shows onboarding to an admin without a domain.
definePageMeta({ layout: false, auth: { mode: 'public' }, middleware: [() => navigateTo('/setup', { replace: true })] })
</script>

<template>
  <div />
</template>
