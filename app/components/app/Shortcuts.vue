<script setup lang="ts">
// The built-in shortcuts, the command palette and the cheat sheet (upstream ShortcutsProvider,
// CommandPalette and ShortcutsHelpDialog). Mounted once by the dashboard layout.
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import type { TranslationKey } from '#lib/i18n/types'
import type { CommandItem, ShortcutDefinition } from '~/types/shortcuts'
import { formatShortcutKeys } from '~/utils/shortcuts/hotkeys'

const { t } = useLanguage()
const router = useRouter()
const { shortcutsActive, paletteOpen, helpOpen, customShortcuts, customCommands } = useShortcuts()

function focusSearch() {
  const target = document.querySelector<HTMLElement>('[data-mail-search-input]')
  const input = target instanceof HTMLInputElement ? target : target?.querySelector('input')
  input?.focus()
  input?.select()
}

const go = (path: string) => () => void router.push(path)

const shortcuts = computed<ShortcutDefinition[]>(() => [
  { key: 'k', modifiers: ['meta', 'ctrl'], label: t('shortcut.commandPalette'), category: 'General', action: () => { paletteOpen.value = !paletteOpen.value } },
  { key: '?', label: t('shortcut.cheatSheet'), category: 'General', action: () => { helpOpen.value = !helpOpen.value } },
  { key: 'c', label: t('shortcut.compose'), category: 'Composing', action: () => openCompose() },
  { key: '/', label: t('shortcut.searchMail'), category: 'Navigation', action: focusSearch },
  { key: 'g i', label: t('shortcut.goInbox'), category: 'Navigation', action: go('/inbox') },
  { key: 'g s', label: t('shortcut.goStarred'), category: 'Navigation', action: go('/starred') },
  { key: 'g z', label: t('shortcut.goSnoozed'), category: 'Navigation', action: go('/snoozed') },
  { key: 'g t', label: t('shortcut.goSent'), category: 'Navigation', action: go('/sent') },
  { key: 'g d', label: t('shortcut.goDrafts'), category: 'Navigation', action: go('/drafts') },
  { key: 'g a', label: t('shortcut.goArchived'), category: 'Navigation', action: go('/archived') },
  { key: 'g !', label: t('shortcut.goSpam'), category: 'Navigation', action: go('/spam') },
  { key: 'g x', label: t('shortcut.goTrash'), category: 'Navigation', action: go('/trash') },
  { key: 'escape', label: t('shortcut.dismiss'), category: 'General', action: () => { paletteOpen.value = false; helpOpen.value = false } },
  ...customShortcuts.value,
])

useHotkeys(shortcuts, { enabled: shortcutsActive })

const commands = computed<CommandItem[]>(() => [
  { id: 'compose', title: t('palette.composeTitle'), subtitle: t('palette.composeSubtitle'), category: 'Actions', icon: 'i-lucide-mail-plus', shortcut: 'c', perform: () => openCompose() },
  { id: 'nav-inbox', title: t('shortcut.goInbox'), category: 'Navigation', icon: 'i-lucide-inbox', shortcut: 'g i', perform: go('/inbox') },
  { id: 'nav-starred', title: t('shortcut.goStarred'), category: 'Navigation', icon: 'i-lucide-star', shortcut: 'g s', perform: go('/starred') },
  { id: 'nav-snoozed', title: t('shortcut.goSnoozed'), category: 'Navigation', icon: 'i-lucide-clock', shortcut: 'g z', perform: go('/snoozed') },
  { id: 'nav-sent', title: t('shortcut.goSent'), category: 'Navigation', icon: 'i-lucide-send', shortcut: 'g t', perform: go('/sent') },
  { id: 'nav-drafts', title: t('shortcut.goDrafts'), category: 'Navigation', icon: 'i-lucide-file-text', shortcut: 'g d', perform: go('/drafts') },
  { id: 'nav-archived', title: t('shortcut.goArchived'), category: 'Navigation', icon: 'i-lucide-archive', shortcut: 'g a', perform: go('/archived') },
  { id: 'nav-spam', title: t('shortcut.goSpam'), category: 'Navigation', icon: 'i-lucide-shield-alert', shortcut: 'g !', perform: go('/spam') },
  { id: 'nav-trash', title: t('shortcut.goTrash'), category: 'Navigation', icon: 'i-lucide-trash-2', shortcut: 'g x', perform: go('/trash') },
  { id: 'settings-account', title: t('palette.accountTitle'), subtitle: t('palette.accountSubtitle'), category: 'Settings', icon: 'i-lucide-settings', perform: go('/settings/account') },
  { id: 'show-help', title: t('palette.helpTitle'), subtitle: t('palette.helpSubtitle'), category: 'General', icon: 'i-lucide-circle-help', shortcut: '?', perform: () => { helpOpen.value = true } },
  ...customCommands.value,
])

const paletteGroups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => {
  const grouped = new Map<string, CommandPaletteItem[]>()
  for (const command of commands.value) {
    const items = grouped.get(command.category) ?? []
    items.push({
      id: command.id,
      label: command.title,
      description: command.subtitle,
      icon: command.icon,
      kbds: command.shortcut?.split(' '),
      // Keywords and the category also match, as upstream's filter did.
      suffix: [command.category, ...(command.keywords ?? [])].join(' '),
      onSelect: () => {
        paletteOpen.value = false
        command.perform()
      },
    })
    grouped.set(command.category, items)
  }
  return [...grouped].map(([category, items]) => ({ id: category, label: t(`shortcut.category.${category}` as TranslationKey), items }))
})

const helpGroups = computed(() => {
  const grouped = new Map<string, ShortcutDefinition[]>()
  for (const shortcut of shortcuts.value) grouped.set(shortcut.category, [...(grouped.get(shortcut.category) ?? []), shortcut])
  return [...grouped].map(([category, items]) => ({ category, items }))
})

// The translations carry a {key} placeholder where the key cap goes.
const toggleHint = computed(() => t('shortcutsHelp.pressToToggle', { key: '{key}' }).split('{key}'))
const closeHint = computed(() => t('shortcutsHelp.pressToClose', { key: '{key}' }).split('{key}'))
</script>

<template>
  <template v-if="shortcutsActive">
    <UDashboardSearch
      v-model:open="paletteOpen"
      :groups="paletteGroups"
      :placeholder="t('palette.placeholder')"
      :color-mode="false"
      shortcut=""
      :fuse="{ fuseOptions: { keys: ['label', 'description', 'suffix'] }, resultLimit: 50 }"
    >
      <template #empty="{ searchTerm }">
        <p class="p-6 text-center text-sm text-muted">{{ t('palette.noMatch', { query: searchTerm ?? '' }) }}</p>
      </template>
    </UDashboardSearch>

    <UModal v-model:open="helpOpen" :title="t('shortcutsHelp.title')" :description="t('shortcutsHelp.subtitle')" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div v-for="group in helpGroups" :key="group.category" class="space-y-3">
            <h3 class="border-b border-default pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
              {{ t(`shortcut.category.${group.category}` as TranslationKey) }}
            </h3>
            <div class="space-y-2">
              <div v-for="item in group.items" :key="item.key + item.label" class="flex items-center justify-between gap-3 text-sm">
                <span class="text-default">{{ item.label }}</span>
                <span class="flex shrink-0 gap-1">
                  <UKbd v-for="(part, index) in formatShortcutKeys(item, t('shortcutsHelp.ctrl'))" :key="index" :value="part" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-between text-xs text-muted">
          <span>{{ toggleHint[0] }}<UKbd value="?" />{{ toggleHint[1] }}</span>
          <span>{{ closeHint[0] }}<UKbd value="Esc" />{{ closeHint[1] }}</span>
        </div>
      </template>
    </UModal>
  </template>
</template>
