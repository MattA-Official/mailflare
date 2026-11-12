<script setup lang="ts">
// The installation icon from branding (the default Mailflare icon until one is uploaded).
const { iconUrl } = useBranding()
</script>

<template>
  <img :src="iconUrl" alt="" width="32" height="32" class="size-7 shrink-0 rounded">
</template>
