<script setup lang="ts">
// The settings sidebar (upstream rendered it as a column beside the settings pages).
import { visibleSettingsNavSections } from '~/utils/settings/nav'

defineProps<{ collapsed?: boolean }>()

const { t } = useLanguage()
const user = useCurrentUser()
const sections = computed(() => visibleSettingsNavSections(user.value?.canManageMailboxes === true))
const icons: Record<string, string> = {
  '/settings/account': 'i-lucide-user-round',
  '/settings/inbox': 'i-lucide-inbox',
  '/settings/security': 'i-lucide-shield-check',
  '/settings/api-keys': 'i-lucide-key-round',
  '/settings/app-passwords': 'i-lucide-key-square',
  '/settings/rules': 'i-lucide-list-filter',
  '/settings/mailboxes': 'i-lucide-mail',
  '/settings/import': 'i-lucide-download',
  '/settings/export': 'i-lucide-upload',
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <NavItem to="/inbox" :label="t('navigation.inbox')" icon="i-lucide-arrow-left" :collapsed="collapsed" active-path="/__never" />
    <NavSection v-for="section in sections" :key="section.labelKey" :label="t(section.labelKey)" :collapsed="collapsed">
      <NavItem v-for="item in section.items" :key="item.href" :to="item.href" :label="t(item.labelKey)" :icon="icons[item.href] ?? 'i-lucide-settings'" :collapsed="collapsed" />
    </NavSection>
  </div>
</template>
