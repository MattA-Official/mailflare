<script setup lang="ts">
// The left "Upcoming" column of the calendar section on wide screens; on narrower screens the
// same list opens in a slideover from the navbar button this component also renders.
// Upstream shows the list in the left column and in the phone menu (legacy calendar-mobile-upcoming.tsx).
import type { CalendarEvent } from '~/types/calendar'

defineProps<{ events?: CalendarEvent[] }>()
const emit = defineEmits<{ select: [event: CalendarEvent] }>()
const { t } = useLanguage()

function select(event: CalendarEvent) {
  emit('select', event)
}
</script>

<template>
  <UDashboardPanel id="calendar-upcoming" class="hidden lg:flex" :default-size="18" :min-size="14" :max-size="28" resizable>
    <template #header>
      <UDashboardNavbar :title="t('calendar.upcoming')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <CalendarUpcomingList :events="events" @select="select" />
    </template>
  </UDashboardPanel>
</template>
