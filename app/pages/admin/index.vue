<script setup lang="ts">
// Admin overview, ported from legacy/src/app/(admin)/admin/page.tsx. The licences card is not
// ported: the fork has no licence gate.
import type { TranslationKey } from '#lib/i18n/types'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', requireMailbox: true } })

const { t } = useLanguage()
const user = useCurrentUser()
useHead({ title: () => t('admin.title') })

interface AdminSection {
  to: string
  titleKey: TranslationKey
  descriptionKey: TranslationKey
  icon: string
  permission?: 'primary' | 'domains' | 'users'
}

const sections: AdminSection[] = [
  { to: '/agent', titleKey: 'admin.nav.agent', descriptionKey: 'admin.section.agent', icon: 'i-lucide-bot', permission: 'primary' },
  { to: '/mailboxes', titleKey: 'admin.nav.mailboxes', descriptionKey: 'admin.section.mailboxes', icon: 'i-lucide-mail' },
  { to: '/domains', titleKey: 'admin.nav.domains', descriptionKey: 'admin.section.domains', icon: 'i-lucide-globe', permission: 'domains' },
  { to: '/branding', titleKey: 'admin.nav.branding', descriptionKey: 'admin.section.branding', icon: 'i-lucide-palette', permission: 'primary' },
  { to: '/accounts', titleKey: 'admin.nav.accounts', descriptionKey: 'admin.section.accounts', icon: 'i-lucide-users' },
  { to: '/api-keys', titleKey: 'admin.section.apiKeysTitle', descriptionKey: 'admin.section.apiKeys', icon: 'i-lucide-key-round', permission: 'primary' },
]

const visible = computed(() => sections.filter((section) => {
  const current = user.value
  if (!section.permission) return true
  if (!current) return false
  if (section.permission === 'primary') return current.isPrimaryAdmin
  if (section.permission === 'domains') return current.isPrimaryAdmin || current.canManageDomains
  return current.isPrimaryAdmin || current.canManageUsers
}))
</script>

<template>
  <AdminSystemPage id="admin" :title="t('admin.title')" :description="t('admin.description')">
    <div class="grid gap-4 lg:grid-cols-2">
      <UPageCard
        v-for="section in visible"
        :key="section.to"
        :to="section.to"
        :icon="section.icon"
        :title="t(section.titleKey)"
        :description="t(section.descriptionKey)"
        variant="subtle"
        spotlight
      />
    </div>
    <AdminSystemUpdateCard v-if="user?.isPrimaryAdmin" />
  </AdminSystemPage>
</template>
