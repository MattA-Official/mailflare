<script setup lang="ts">
const { data } = await useFetch('/api/health')
</script>

<template>
  <UContainer class="py-16">
    <UCard>
      <template #header>
        <h1 class="text-xl font-semibold">Mailflare on Nuxt</h1>
      </template>
      <p class="text-muted">Foundation is running. The port is in progress.</p>
      <pre class="mt-4 text-sm">{{ data }}</pre>
    </UCard>
  </UContainer>
</template>
