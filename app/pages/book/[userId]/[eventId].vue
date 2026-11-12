<script setup lang="ts">
definePageMeta({ auth: { mode: 'public' } })
const route = useRoute()
const userId = computed(() => String(route.params.userId ?? ''))
const eventId = computed(() => String(route.params.eventId ?? ''))
</script>

<template>
  <CalendarPublicBookingEvent :user-id="userId" :identifier="eventId" />
</template>
