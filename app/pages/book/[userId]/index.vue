<script setup lang="ts">
// Public meeting list by user id (older links). The current links are /c/<username>.
definePageMeta({ auth: { mode: 'public' } })
const route = useRoute()
const userId = computed(() => String(route.params.userId ?? ''))
</script>

<template>
  <CalendarPublicBookingList :user-id="userId" />
</template>
