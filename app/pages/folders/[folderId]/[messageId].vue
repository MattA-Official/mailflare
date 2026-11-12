<script setup lang="ts">
definePageMeta({ layout: 'dashboard', auth: { requireMailbox: true } })
const route = useRoute()
</script>

<template>
  <MessagesMessageDetail :message-id="String(route.params.messageId)" />
</template>
