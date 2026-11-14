<script setup lang="ts">
// Sidebar for the calendar, drive and contacts sections: switch between the apps. Section-specific navigation
// (drive folders, upcoming events) can be added into #app-sidebar-extra with <Teleport>.
defineProps<{ collapsed?: boolean }>()

const { t } = useLanguage()
const user = useCurrentUser()
</script>

<template>
  <div class="flex flex-col gap-px">
    <NavItem to="/inbox" :label="t('navigation.inbox')" icon="i-lucide-inbox" :collapsed="collapsed" />
    <NavItem v-if="user?.calendarEnabled !== false" to="/calendar" :label="t('account.calendar')" icon="i-lucide-calendar-days" :collapsed="collapsed" />
    <NavItem v-if="user?.calendarEnabled !== false" to="/booking" :label="t('calendar.bookings')" icon="i-lucide-calendar-check" :collapsed="collapsed" />
    <NavItem v-if="user?.driveEnabled !== false" to="/drive" :label="t('account.drive')" icon="i-lucide-hard-drive" :collapsed="collapsed" />
    <NavItem to="/contacts" :label="t('navigation.contacts')" icon="i-lucide-users-round" :collapsed="collapsed" />
    <div id="app-sidebar-extra" class="mt-2 flex flex-col gap-px" />
  </div>
</template>
