<script setup lang="ts">
// Bookings / Calendar switch, from the header of legacy/src/app/(calendar)/layout.tsx.
const route = useRoute()
const { t } = useLanguage()
const items = computed(() => [
  { to: '/booking', label: t('calendar.bookings') },
  { to: '/calendar', label: t('calendar.calendar') },
])
</script>

<template>
  <nav :aria-label="t('calendar.sections')" class="flex shrink-0 items-center gap-1 rounded-full bg-elevated p-1">
    <UButton
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      :label="item.label"
      size="sm"
      class="rounded-full"
      :color="route.path === item.to ? 'primary' : 'neutral'"
      :variant="route.path === item.to ? 'solid' : 'ghost'"
      :aria-current="route.path === item.to ? 'page' : undefined"
    />
  </nav>
</template>
