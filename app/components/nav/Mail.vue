<script setup lang="ts">
// The mail sidebar: system folders with unread counts, a "More" group, and the mailbox's own folders.
// Ported from legacy/src/components/dashboard-nav.tsx. Rows take dropped messages to move them.
import type { FolderColor } from '#lib/folders/types'
import type { TranslationKey } from '#lib/i18n/types'
import type { MessageFolder } from '~/types/messages'
import { useEventListener } from '@vueuse/core'
import { getMailboxFolders } from '~/utils/folders/client'
import { moveMessagesFromNav, preloadMailboxPage } from '~/utils/messages/list-cache'
import type { ReorderableListSpec } from '~/utils/nav/reorder'

type CustomFolder = { id: string, name: string, color: FolderColor }
type SystemLink = { href: string, labelKey: TranslationKey, icon: string, folder: MessageFolder, drop?: 'archive' | 'spam' | 'trash' }

const links: SystemLink[] = [
  { href: '/inbox', labelKey: 'navigation.inbox', icon: 'i-lucide-inbox', folder: 'inbox' },
  { href: '/starred', labelKey: 'navigation.starred', icon: 'i-lucide-star', folder: 'starred' },
  { href: '/snoozed', labelKey: 'navigation.snoozed', icon: 'i-lucide-clock', folder: 'snoozed' },
  { href: '/sent', labelKey: 'navigation.sent', icon: 'i-lucide-send', folder: 'sent' },
  { href: '/scheduled', labelKey: 'navigation.scheduled', icon: 'i-lucide-calendar-clock', folder: 'scheduled' },
  { href: '/drafts', labelKey: 'navigation.drafts', icon: 'i-lucide-file-text', folder: 'drafts' },
  { href: '/archived', labelKey: 'navigation.archived', icon: 'i-lucide-archive', folder: 'archived', drop: 'archive' },
  { href: '/spam', labelKey: 'navigation.spam', icon: 'i-lucide-shield-alert', folder: 'spam', drop: 'spam' },
  { href: '/trash', labelKey: 'navigation.trash', icon: 'i-lucide-trash-2', folder: 'trash', drop: 'trash' },
]
// Drafts, Archived, Spam and Trash start tucked under "More...".
const MORE_LINK_HREFS = ['/drafts', '/archived', '/spam', '/trash']
const MAX_VISIBLE_FOLDERS = 3
const MORE_OPEN_KEY = 'mailflare:nav:more-open'
const FOLDERS_OPEN_KEY = 'mailflare:nav:folders-open'

const props = defineProps<{ collapsed?: boolean }>()
const { t } = useLanguage()
const route = useRoute()
const { selectedMailbox, isLoading } = useSelectedMailbox()
const { query } = useMailSearch()
const { counts } = useMessageCounts(() => selectedMailbox.value?.id, () => !isLoading.value)
const folders = ref<CustomFolder[]>([])
const moreOpen = ref(false)
const foldersOpen = ref(false)
const createOpen = ref(false)

function readFlag(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'false') === true
  } catch {
    return false
  }
}
function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not persisted.
  }
}
onMounted(() => {
  moreOpen.value = readFlag(MORE_OPEN_KEY)
  foldersOpen.value = readFlag(FOLDERS_OPEN_KEY)
})

const isActive = (href: string) => route.path === href || route.path.startsWith(`${href}/`)

const visibleLinks = computed(() => links.filter(link => link.href !== '/scheduled' || counts.value.folders.scheduled.total > 0))
const mainLinks = computed(() => visibleLinks.value.filter(link => !MORE_LINK_HREFS.includes(link.href)))
const linkByHref = computed(() => new Map(visibleLinks.value.map(link => [link.href, link])))
const folderById = computed(() => new Map(folders.value.map(folder => [folder.id, folder])))
// The icon rail has no room for text toggles, so it lists everything; collapsed "More" keeps the current page.
const navLists = computed<ReorderableListSpec[]>(() => [
  { id: 'main', ids: mainLinks.value.map(link => link.href) },
  {
    id: 'more',
    ids: visibleLinks.value.filter(link => MORE_LINK_HREFS.includes(link.href)).map(link => link.href),
    before: !props.collapsed,
    visible: ordered => props.collapsed || moreOpen.value ? ordered : ordered.filter(isActive),
  },
])
const folderLists = computed<ReorderableListSpec[]>(() => [{
  id: 'folders',
  ids: folders.value.map(folder => folder.id),
  visible: (ordered) => {
    if (props.collapsed || foldersOpen.value || ordered.length <= MAX_VISIBLE_FOLDERS) return ordered
    const first = ordered.slice(0, MAX_VISIBLE_FOLDERS)
    const active = ordered.slice(MAX_VISIBLE_FOLDERS).find(id => isActive(`/folders/${id}`))
    return active ? [...first, active] : first
  },
}])

function countFor(link: SystemLink) {
  const folder = counts.value.folders[link.folder]
  return link.folder === 'scheduled' ? folder.total : folder.unread
}

const prefetched = new Set<string>()
function prefetch(href: string) {
  if (isActive(href)) return
  const key = [href, selectedMailbox.value?.id ?? '', query.value].join('\u0000')
  if (prefetched.has(key)) return
  prefetched.add(key)
  void preloadMailboxPage(href, selectedMailbox.value?.id, { query: query.value }).catch(() => prefetched.delete(key))
}

async function loadFolders(mailboxId: string | undefined) {
  if (!mailboxId) {
    folders.value = []
    return
  }
  try {
    const data = await getMailboxFolders<{ folders?: CustomFolder[] }>(mailboxId)
    if (selectedMailbox.value?.id === mailboxId) folders.value = data.folders ?? []
  } catch {
    if (selectedMailbox.value?.id === mailboxId) folders.value = []
  }
}
watch(() => selectedMailbox.value?.id, id => void loadFolders(id), { immediate: true })
if (import.meta.client) {
  useEventListener(window, 'mailflare:folders-changed', () => void loadFolders(selectedMailbox.value?.id))
  useEventListener(window, AUTH_SESSION_CHANGED_EVENT, () => {
    folders.value = []
  })
}

function onCreated(folder: CustomFolder) {
  folders.value = [...folders.value.filter(item => item.id !== folder.id), folder].sort((a, b) => a.name.localeCompare(b.name))
}

function toggleMore() {
  moreOpen.value = !moreOpen.value
  writeFlag(MORE_OPEN_KEY, moreOpen.value)
}
function toggleFolders() {
  foldersOpen.value = !foldersOpen.value
  writeFlag(FOLDERS_OPEN_KEY, foldersOpen.value)
}
</script>

<template>
  <div class="flex flex-col gap-px">
    <NavReorderableList :lists="navLists" storage-key="mailflare:nav:layout" :enabled="!collapsed">
      <template #before>
        <UButton
          color="neutral"
          variant="link"
          size="sm"
          :aria-expanded="moreOpen"
          :label="moreOpen ? t('navigation.less') : t('navigation.more')"
          class="ps-10 text-muted"
          @click="toggleMore"
        />
      </template>
      <template #item="{ id }">
        <NavItem
          v-if="linkByHref.get(id)"
          :to="id"
          :label="t(linkByHref.get(id)!.labelKey)"
          :icon="linkByHref.get(id)!.icon"
          :count="countFor(linkByHref.get(id)!)"
          :collapsed="collapsed"
          :on-message-drop="linkByHref.get(id)!.drop ? (ids: string[]) => void moveMessagesFromNav({ messageIds: ids, action: linkByHref.get(id)!.drop! }) : undefined"
          :on-prefetch="() => prefetch(id)"
        />
      </template>
    </NavReorderableList>

    <NavSection :label="t('navigation.folders')" storage-key="mailflare:nav:folders-section-open" :collapsed="collapsed">
      <template #actions>
        <UButton
          v-if="selectedMailbox"
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="t('navigation.createFolder')"
          @click="createOpen = true"
        />
      </template>
      <p v-if="!collapsed && folders.length === 0" class="px-2.5 py-1.5 text-xs text-muted">
        {{ t('navigation.noFolders') }}
      </p>
      <NavReorderableList :lists="folderLists" storage-key="mailflare:nav:layout:folders" :enabled="!collapsed">
        <template #item="{ id }">
          <NavItem
            v-if="folderById.get(id)"
            :to="`/folders/${id}`"
            :label="folderById.get(id)!.name"
            icon="i-lucide-folder"
            :icon-color="folderById.get(id)!.color"
            :count="counts.customFolders[id]?.unread"
            :collapsed="collapsed"
            :on-message-drop="(ids: string[]) => void moveMessagesFromNav({ messageIds: ids, action: 'folder', folderId: id })"
            :on-prefetch="() => prefetch(`/folders/${id}`)"
          />
        </template>
      </NavReorderableList>
      <UButton
        v-if="!collapsed && folders.length > MAX_VISIBLE_FOLDERS"
        color="neutral"
        variant="link"
        size="sm"
        :aria-expanded="foldersOpen"
        :label="foldersOpen ? t('navigation.less') : t('navigation.more')"
        class="ps-10 text-muted"
        @click="toggleFolders"
      />
    </NavSection>

    <NavCreateFolderModal v-if="selectedMailbox" v-model:open="createOpen" :mailbox-id="selectedMailbox.id" @created="onCreated" />
  </div>
</template>
