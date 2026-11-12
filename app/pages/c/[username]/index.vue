<script setup lang="ts">
// Public meeting list at the host's booking username.
definePageMeta({ auth: { mode: 'public' } })
const route = useRoute()
const username = computed(() => String(route.params.username ?? ''))
</script>

<template>
  <CalendarPublicBookingList :username="username" />
</template>
