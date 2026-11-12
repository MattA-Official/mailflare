<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{ collapsed?: boolean }>()

const { t } = useLanguage()
const user = useCurrentUser()

async function logout() {
  let nextToken: string | undefined
  try {
    const response = await authFetch('/api/auth/logout', { method: 'POST', redirectOnUnauthorized: false })
    nextToken = ((await response.json().catch(() => null)) as { token?: string } | null)?.token
  } finally {
    clearClientSessionToken()
  }
  // Another signed-in account on this browser takes over when there is one.
  if (nextToken) {
    setClientSessionToken(nextToken)
    window.location.assign('/inbox')
  } else {
    window.location.assign('/login')
  }
}

const items = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: user.value?.email ?? '' }],
  [
    { label: t('navigation.inbox'), icon: 'i-lucide-inbox', to: '/inbox' },
    ...(user.value?.calendarEnabled ? [{ label: t('account.calendar'), icon: 'i-lucide-calendar', to: '/calendar' }] : []),
    ...(user.value?.driveEnabled ? [{ label: t('account.drive'), icon: 'i-lucide-hard-drive', to: '/drive' }] : []),
    { label: t('account.settings'), icon: 'i-lucide-settings', to: '/settings' },
    ...(user.value?.role === 'admin' ? [{ label: t('account.admin'), icon: 'i-lucide-shield', to: '/admin' }] : []),
  ],
  [{ label: t('account.signOut'), icon: 'i-lucide-log-out', onSelect: logout }],
])
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'start' }">
    <UButton
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="justify-start"
      :avatar="{ src: user?.hasAvatar ? `/api/profile/avatar?u=${user.id}` : undefined, alt: user?.name }"
      :label="collapsed ? undefined : user?.name"
      :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
    />
  </UDropdownMenu>
</template>
