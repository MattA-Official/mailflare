<script setup lang="ts">
// The signed-in shell: a collapsible sidebar and a main panel (pages render a UDashboardPanel).
import type { NavigationMenuItem } from '@nuxt/ui'

// Pages choose their sidebar with definePageMeta({ nav: 'admin' }); the default is the mail nav.
const route = useRoute()
const nav = computed(() => route.meta.nav ?? 'mail')
const { t } = useLanguage()

const mailItems = computed<NavigationMenuItem[]>(() => [
  { label: t('navigation.inbox'), icon: 'i-lucide-inbox', to: '/inbox' },
  { label: t('navigation.starred'), icon: 'i-lucide-star', to: '/starred' },
  { label: t('navigation.snoozed'), icon: 'i-lucide-alarm-clock', to: '/snoozed' },
  { label: t('navigation.sent'), icon: 'i-lucide-send', to: '/sent' },
  { label: t('navigation.scheduled'), icon: 'i-lucide-calendar-clock', to: '/scheduled' },
  { label: t('navigation.drafts'), icon: 'i-lucide-file-pen', to: '/drafts' },
  { label: t('navigation.archived'), icon: 'i-lucide-archive', to: '/archived' },
  { label: t('navigation.spam'), icon: 'i-lucide-octagon-alert', to: '/spam' },
  { label: t('navigation.trash'), icon: 'i-lucide-trash-2', to: '/trash' },
])
</script>

<template>
  <UDashboardGroup unit="rem" storage="local" storage-key="mailflare-sidebar">
    <UDashboardSidebar id="main" collapsible resizable :min-size="12" :default-size="16" :max-size="24">
      <template #header="{ collapsed }">
        <NuxtLink to="/inbox" class="flex items-center gap-2 font-semibold text-highlighted">
          <AppLogo />
          <span v-if="!collapsed">Mailflare</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <slot name="sidebar" :collapsed="collapsed">
          <template v-if="nav === 'mail'">
            <UButton :label="collapsed ? undefined : t('navigation.compose')" icon="i-lucide-pen-line" to="/compose" block :square="collapsed" />
            <UNavigationMenu :items="mailItems" orientation="vertical" :collapsed="collapsed" tooltip />
          </template>
          <DriveNav v-else-if="nav === 'drive'" :collapsed="collapsed" />
        </slot>
      </template>

      <template #footer="{ collapsed }">
        <AppUserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
