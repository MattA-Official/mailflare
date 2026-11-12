<script setup lang="ts">
definePageMeta({ auth: { mode: 'public' } })
const route = useRoute()
const username = computed(() => String(route.params.username ?? ''))
const slug = computed(() => String(route.params.slug ?? ''))
</script>

<template>
  <CalendarPublicBookingEvent :username="username" :identifier="slug" />
</template>
