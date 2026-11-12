<script setup lang="ts">
// The branding icon is served by the API, so the src is bound (a literal /api path would be treated as a build asset).
const src = '/api/branding/icon'
</script>

<template>
  <img :src="src" alt="" class="size-6 rounded">
</template>
