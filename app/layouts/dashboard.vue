<script setup lang="ts">
// The signed-in shell, ported from upstream's (dashboard), (admin), (settings), (calendar) and (drive)
// layouts: a collapsible, resizable sidebar whose navigation pages choose with definePageMeta({ nav }),
// the account menu in its footer, and the main panels (pages render UDashboardPanel + AppNavbar).
// Shortcuts, the command palette and the app badge live here too.
import { setAppBadgeCount } from '#lib/push/app-badge'
import { getRouteTitleKey } from '~/utils/shell/route-title'

const route = useRoute()
const nav = computed(() => route.meta.nav ?? 'mail')
const { t } = useLanguage()
const { appName } = useBranding()
const user = useCurrentUser()

const homeLink = computed(() => (nav.value === 'admin' ? '/admin' : '/inbox'))
const headerLabel = computed(() => (nav.value === 'admin' ? t('account.admin') : appName.value))

const routeTitle = computed(() => {
  const key = getRouteTitleKey(route.path)
  return key ? t(key) : undefined
})
useHead({ title: routeTitle })

// Inbox unread count on the installed app's icon. The placeholder before the first load must not clear
// a badge the service worker set.
const badgeSupported = import.meta.client && 'setAppBadge' in navigator
const { counts: allCounts, loaded: countsLoaded } = useMessageCounts(null, badgeSupported)
watch(() => [countsLoaded.value, allCounts.value.folders.inbox.unread] as const, ([loaded, unread]) => {
  if (loaded) setAppBadgeCount(unread)
})
</script>

<template>
  <UDashboardGroup unit="rem" storage="local" storage-key="mailflare-sidebar">
    <UDashboardSidebar
      id="main"
      collapsible
      resizable
      :min-size="13"
      :default-size="16"
      :max-size="30"
      :ui="{ footer: 'flex-col items-stretch gap-2 border-t border-default lg:border-t-0' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink :to="homeLink" class="flex min-w-0 items-center gap-2.5 font-semibold text-highlighted">
          <AppLogo />
          <span v-if="!collapsed" class="truncate text-lg">{{ headerLabel }}</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <template v-if="nav === 'mail'">
          <UButton
            :label="collapsed ? undefined : t('navigation.compose')"
            :aria-label="collapsed ? t('navigation.compose') : undefined"
            icon="i-lucide-pen-line"
            size="lg"
            :square="collapsed"
            :block="collapsed"
            class="mb-2 w-fit"
            @click="openCompose()"
          />
          <NavMail :collapsed="collapsed" />
        </template>
        <NavAdmin v-else-if="nav === 'admin'" :collapsed="collapsed" />
        <NavSettings v-else-if="nav === 'settings'" :collapsed="collapsed" />
        <DriveNav v-else-if="nav === 'drive'" :collapsed="collapsed" />
        <NavApps v-else :collapsed="collapsed" />
      </template>

      <template #footer="{ collapsed }">
        <AppSidebarFooter :collapsed="collapsed" />
        <AppMailboxSelector :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <slot />
    <AgentAside v-if="user" />

    <AppShortcuts v-if="user" />
    <ComposeHost />
  </UDashboardGroup>
</template>
