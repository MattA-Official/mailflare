<script setup lang="ts">
// The list is rendered by the folder's split layout, so it survives opening a message.
definePageMeta({ layout: 'dashboard', auth: { requireMailbox: true } })
</script>

<template>
  <span hidden />
</template>
