<script setup lang="ts">
// Navbar button that opens the upcoming list on screens without the left column.
import type { CalendarEvent } from '~/types/calendar'

defineProps<{ events?: CalendarEvent[] }>()
const emit = defineEmits<{ select: [event: CalendarEvent] }>()
const { t } = useLanguage()
const open = ref(false)
</script>

<template>
  <USlideover v-model:open="open" side="left" :title="t('calendar.upcoming')">
    <UButton class="lg:hidden" icon="i-lucide-list" color="neutral" variant="ghost" :aria-label="t('calendar.upcoming')" />
    <template #body>
      <CalendarUpcomingList :events="events" :refresh-key="open" @select="(event) => { open = false; emit('select', event) }" />
    </template>
  </USlideover>
</template>
