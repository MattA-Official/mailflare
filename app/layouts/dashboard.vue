<script setup lang="ts">
// The signed-in shell, ported from upstream's (dashboard), (admin), (settings), (calendar) and (drive)
// layouts: a collapsible, resizable sidebar whose navigation pages choose with definePageMeta({ nav }),
// the account menu in its footer, and the main panels (pages render UDashboardPanel + AppNavbar).
// Shortcuts, the command palette and the app badge live here too.
import type { TranslationKey } from '#lib/i18n/types'
import { setAppBadgeCount } from '#lib/push/app-badge'
import { settingsNavSections } from '~/utils/settings/nav'

const route = useRoute()
const nav = computed(() => route.meta.nav ?? 'mail')
const { t } = useLanguage()
const { appName } = useBranding()
const user = useCurrentUser()

const homeLink = computed(() => (nav.value === 'admin' ? '/admin' : '/inbox'))
const headerLabel = computed(() => (nav.value === 'admin' ? t('account.admin') : appName.value))

// Titles for pages that do not set their own, matched on the longest path prefix (upstream route-title).
const routeTitles: Array<[string, TranslationKey]> = [
  ['/settings', 'settings.nav.settings'],
  ['/admin', 'admin.title'],
  ['/mailboxes', 'admin.nav.mailboxes'],
  ['/domains', 'admin.nav.domains'],
  ['/routing', 'admin.nav.routing'],
  ['/webhooks', 'admin.nav.webhooks'],
  ['/spam-filter', 'admin.nav.spamFilter'],
  ['/api-keys', 'admin.nav.apiKeys'],
  ['/general', 'admin.nav.general'],
  ['/agent', 'admin.nav.agent'],
  ['/accounts', 'admin.nav.accounts'],
  ['/activity', 'admin.nav.activity'],
  ['/backups', 'admin.nav.backups'],
  ['/branding', 'admin.nav.branding'],
  ['/ai-usage', 'aiUsage.title'],
  ['/calendar', 'account.calendar'],
  ['/booking', 'booking.title'],
  ['/drive', 'drive.title'],
  ['/compose', 'compose.pageTitle'],
  ...settingsNavSections.flatMap(section => section.items.map((item): [string, TranslationKey] => [item.href, item.labelKey])),
]
const routeTitle = computed(() => {
  let best: [string, TranslationKey] | null = null
  for (const entry of routeTitles) {
    const [path] = entry
    if (route.path !== path && !route.path.startsWith(`${path}/`)) continue
    if (!best || path.length > best[0].length) best = entry
  }
  return best ? t(best[1]) : undefined
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

    <AppShortcuts v-if="user" />
    <!-- Composing workstream: mount <ComposeHost /> here. -->
  </UDashboardGroup>
</template>
