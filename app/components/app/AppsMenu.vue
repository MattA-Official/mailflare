<script setup lang="ts">
// The apps menu in the page header: Inbox, Calendar, Drive and Contacts.
// Ported from legacy/src/components/apps-menu.tsx.
const { t } = useLanguage()
const user = useCurrentUser()

const items = computed(() => [[
  { label: t('navigation.inbox'), icon: 'i-lucide-inbox', to: '/inbox' },
  ...(user.value?.calendarEnabled !== false ? [{ label: t('account.calendar'), icon: 'i-lucide-calendar-days', to: '/calendar' }] : []),
  ...(user.value?.driveEnabled !== false ? [{ label: t('account.drive'), icon: 'i-lucide-hard-drive', to: '/drive' }] : []),
  { label: t('navigation.contacts'), icon: 'i-lucide-users-round', to: '/contacts' },
]])
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }" :ui="{ content: 'w-56' }">
    <UButton icon="i-lucide-grip" color="neutral" variant="ghost" :aria-label="t('account.openApps')" />
  </UDropdownMenu>
</template>
