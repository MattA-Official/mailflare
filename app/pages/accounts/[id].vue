<script setup lang="ts">
// Parent of the account settings tabs; replaces legacy/src/app/(admin)/accounts/[id]/layout.tsx
// and components/accounts/account-settings-nav.tsx.
import type { NavigationMenuItem } from '@nuxt/ui'
import { accountSettingsNavItems, getAccountSettingsHref } from '~/utils/admin/system/accounts'
import { useManagedAccount } from '~/utils/admin/system/use-managed-account'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', requireMailbox: true } })

const { t } = useLanguage()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: account } = useManagedAccount(id)
useHead({ title: () => account.value?.name ?? t('accountSettings.title') })

const items = computed<NavigationMenuItem[]>(() => accountSettingsNavItems.map(item => ({
  label: t(item.labelKey),
  to: getAccountSettingsHref(id.value, item.segment),
  exact: true,
})))
</script>

<template>
  <AdminSystemPage id="account-settings" :title="account?.name ?? t('accountSettings.title')">
    <template #actions>
      <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" to="/accounts" :label="t('accounts.title')" />
    </template>
    <template #toolbar>
      <UNavigationMenu :items="items" highlight class="-mx-1 flex-1" />
    </template>
    <NuxtPage />
  </AdminSystemPage>
</template>
