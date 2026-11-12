<script setup lang="ts">
// The admin sidebar, ported from legacy/src/components/admin-nav.tsx. Links are hidden by permission;
// the pages enforce access themselves. The licences page is not ported.
import type { TranslationKey } from '#lib/i18n/types'

type Permission = 'primary' | 'domains' | 'users'
type AdminLink = { href: string, labelKey: TranslationKey, icon: string, permission?: Permission }

defineProps<{ collapsed?: boolean }>()

// `id` names a section for its remembered open state; it is not shown.
const sections: { id?: string, labelKey?: TranslationKey, links: AdminLink[] }[] = [
  { links: [{ href: '/admin', labelKey: 'admin.nav.overview', icon: 'i-lucide-settings' }] },
  {
    id: 'Email',
    labelKey: 'admin.nav.email',
    links: [
      { href: '/mailboxes', labelKey: 'admin.nav.mailboxes', icon: 'i-lucide-mail' },
      { href: '/domains', labelKey: 'admin.nav.domains', icon: 'i-lucide-globe', permission: 'domains' },
      { href: '/routing', labelKey: 'admin.nav.routing', icon: 'i-lucide-route', permission: 'domains' },
      { href: '/webhooks', labelKey: 'admin.nav.webhooks', icon: 'i-lucide-webhook', permission: 'primary' },
      { href: '/spam-filter', labelKey: 'admin.nav.spamFilter', icon: 'i-lucide-shield-check', permission: 'primary' },
    ],
  },
  {
    id: 'Administration',
    labelKey: 'admin.nav.administration',
    links: [
      { href: '/api-keys', labelKey: 'admin.nav.apiKeys', icon: 'i-lucide-key-round', permission: 'primary' },
      { href: '/general', labelKey: 'admin.nav.general', icon: 'i-lucide-settings', permission: 'primary' },
      { href: '/agent', labelKey: 'admin.nav.agent', icon: 'i-lucide-bot', permission: 'primary' },
      { href: '/accounts', labelKey: 'admin.nav.accounts', icon: 'i-lucide-users' },
      { href: '/activity', labelKey: 'admin.nav.activity', icon: 'i-lucide-activity', permission: 'primary' },
      { href: '/backups', labelKey: 'admin.nav.backups', icon: 'i-lucide-database-backup', permission: 'primary' },
    ],
  },
  {
    id: 'Product',
    labelKey: 'admin.nav.product',
    links: [{ href: '/branding', labelKey: 'admin.nav.branding', icon: 'i-lucide-palette', permission: 'primary' }],
  },
]

const { t } = useLanguage()
const user = useCurrentUser()

function canSee(link: AdminLink): boolean {
  if (!link.permission) return true
  const current = user.value
  if (!current) return false
  if (link.permission === 'primary') return current.isPrimaryAdmin
  if (link.permission === 'domains') return current.isPrimaryAdmin || current.canManageDomains
  return current.isPrimaryAdmin || current.canManageUsers
}

const visibleSections = computed(() => sections
  .map(section => ({ ...section, links: section.links.filter(canSee) }))
  .filter(section => section.links.length > 0))
</script>

<template>
  <div class="flex flex-col gap-2">
    <NavSection
      v-for="section in visibleSections"
      :key="section.id ?? section.links[0]!.href"
      :label="section.labelKey ? t(section.labelKey) : undefined"
      :storage-key="section.id ? `mailflare:nav:admin-section-open:${section.id}` : undefined"
      :collapsed="collapsed"
    >
      <NavItem v-for="link in section.links" :key="link.href" :to="link.href" :label="t(link.labelKey)" :icon="link.icon" :collapsed="collapsed" />
    </NavSection>
  </div>
</template>
