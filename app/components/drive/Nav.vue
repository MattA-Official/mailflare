<script setup lang="ts">
// Drive's sidebar: New menu, sections, the folder tree, storage use. Sections and folders take
// dropped items. Ported from legacy/src/app/(drive)/drive-nav.tsx.
import type { DropdownMenuItem } from '@nuxt/ui'
import { formatDriveSize } from '#lib/drive/utils'
import type { DriveFolderNode, DriveStorageDetail } from '~/types/drive/drive'
import { canDropDrive, driveDropHandlers, type DriveDropTarget } from '~/utils/drive/drive-drag'
import { DRIVE_FOLDERS_EVENT, DRIVE_NEW_FOLDER_EVENT, DRIVE_REFRESH_EVENT, DRIVE_STORAGE_EVENT, DRIVE_UPLOAD_EVENT, errorMessage, flattenDriveFolders } from '~/utils/drive/drive-utils'

defineProps<{ collapsed?: boolean }>()
const { t } = useLanguage()
const toast = useToast()
const notify = { success: (title: string) => toast.add({ title, color: 'success' as const }), error: (title: string) => toast.add({ title, color: 'error' as const }) }
const route = useRoute()
const view = computed(() => typeof route.query.view === 'string' ? route.query.view : 'my')
const activeFolder = computed(() => typeof route.query.folder === 'string' ? route.query.folder : null)
const FOLDERS_OPEN_KEY = 'mailflare-drive-folders-open'

const storage = ref<DriveStorageDetail | null>(null)
const foldersOpen = ref(false)
const folders = ref<DriveFolderNode[]>([])
const creating = ref(false)
const folderName = ref('')
const saving = ref(false)
// The entry items are being dragged over: "my", "trash", "attachments" or a folder id.
const dropKey = ref<string | null>(null)

const rows = computed(() => flattenDriveFolders(folders.value))
const parents = computed(() => new Map(folders.value.map(folder => [folder.id, folder.parentId])))
/** True when `folderId` is one of `ancestorIds` or sits somewhere beneath one of them. */
function isInside(folderId: string, ancestorIds: Set<string>) {
  for (let current: string | null | undefined = folderId, steps = 0; current && steps < 1000; current = parents.value.get(current), steps += 1) {
    if (ancestorIds.has(current)) return true
  }
  return false
}
function dropProps(key: string, target: DriveDropTarget) {
  return driveDropHandlers(target, () => canDropDrive(target, isInside), t, notify, (over) => {
    dropKey.value = over ? key : dropKey.value === key ? null : dropKey.value
  })
}

async function loadFolders() {
  try {
    const response = await authFetch('/api/drive/folders', { redirectOnUnauthorized: false })
    if (response.ok) folders.value = (await response.json() as { folders: DriveFolderNode[] }).folders
  } catch { /* the list stays as it was */ }
}

function onStorage(event: Event) {
  storage.value = (event as CustomEvent<DriveStorageDetail>).detail
}
onMounted(() => {
  window.addEventListener(DRIVE_STORAGE_EVENT, onStorage)
  window.addEventListener(DRIVE_FOLDERS_EVENT, onFoldersEvent)
  try {
    foldersOpen.value = localStorage.getItem(FOLDERS_OPEN_KEY) === '1'
  } catch { /* storage unavailable */ }
})
onBeforeUnmount(() => {
  window.removeEventListener(DRIVE_STORAGE_EVENT, onStorage)
  window.removeEventListener(DRIVE_FOLDERS_EVENT, onFoldersEvent)
})
function onFoldersEvent() {
  if (foldersOpen.value) void loadFolders()
}
watch(foldersOpen, (open) => {
  if (open) void loadFolders()
})

function toggleFolders() {
  foldersOpen.value = !foldersOpen.value
  try {
    localStorage.setItem(FOLDERS_OPEN_KEY, foldersOpen.value ? '1' : '0')
  } catch { /* ignore */ }
}

async function createFolder() {
  const name = folderName.value.trim()
  if (!name || saving.value) return
  saving.value = true
  try {
    await api('/api/drive/items', { method: 'POST', body: { name } })
    toast.add({ title: t('drive.folderCreated'), color: 'success' })
    creating.value = false
    folderName.value = ''
    if (!foldersOpen.value) toggleFolders()
    else void loadFolders()
    window.dispatchEvent(new Event(DRIVE_REFRESH_EVENT))
  } catch (error) {
    toast.add({ title: errorMessage(error, t('drive.actionFailed')), color: 'error' })
  } finally {
    saving.value = false
  }
}

const newItems = computed<DropdownMenuItem[][]>(() => [
  [{ label: t('drive.newFolder'), icon: 'i-lucide-folder-plus', onSelect: () => window.dispatchEvent(new Event(DRIVE_NEW_FOLDER_EVENT)) }],
  [{ label: t('drive.fileUpload'), icon: 'i-lucide-cloud-upload', onSelect: () => window.dispatchEvent(new Event(DRIVE_UPLOAD_EVENT)) }],
])

const links = computed(() => [
  { key: 'my', to: '/drive', label: t('drive.myDrive'), icon: 'i-lucide-hard-drive', target: { kind: 'folder', id: null } as DriveDropTarget },
  { key: 'attachments', to: '/drive?view=attachments', label: t('drive.attachments'), icon: 'i-lucide-paperclip', target: { kind: 'attachments' } as DriveDropTarget },
  { key: 'shared', to: '/drive?view=shared', label: t('drive.sharedWithMe'), icon: 'i-lucide-users-round', target: null },
  { key: 'trash', to: '/drive?view=trash', label: t('drive.trash'), icon: 'i-lucide-trash-2', target: { kind: 'trash' } as DriveDropTarget },
])
const percent = computed(() => storage.value?.limit ? Math.min(100, Math.round((storage.value.used / storage.value.limit) * 100)) : 0)
const dropHighlight = 'bg-primary/15 text-highlighted ring-2 ring-inset ring-primary'
const activeClass = 'bg-primary/10 font-medium text-primary'
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3">
    <UDropdownMenu :items="newItems" :content="{ align: 'start' }">
      <UButton
        icon="i-lucide-plus"
        :label="collapsed ? undefined : t('drive.new')"
        :aria-label="t('drive.new')"
        :square="collapsed"
        size="lg"
        :block="collapsed"
        class="w-fit"
      />
    </UDropdownMenu>
    <nav :aria-label="t('drive.sections')" class="space-y-0.5">
      <NuxtLink
        v-for="link in links"
        :key="link.key"
        :to="link.to"
        :aria-current="route.path === '/drive' && view === link.key && !activeFolder ? 'page' : undefined"
        :title="collapsed ? link.label : undefined"
        class="flex h-9 items-center gap-3 rounded-md text-sm"
        :class="[collapsed ? 'justify-center' : 'px-2.5', dropKey === link.key ? dropHighlight : route.path === '/drive' && view === link.key && !activeFolder ? activeClass : 'text-default hover:bg-elevated']"
        v-on="link.target ? dropProps(link.key, link.target) : {}"
      >
        <UIcon :name="link.icon" class="size-4 shrink-0" />
        <span v-if="!collapsed" class="truncate">{{ link.label }}</span>
      </NuxtLink>
    </nav>
    <div v-if="!collapsed">
      <div class="flex items-center gap-1">
        <button
          type="button"
          :aria-expanded="foldersOpen"
          :aria-label="t('drive.foldersToggle')"
          class="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 text-xs font-semibold uppercase tracking-wide text-muted hover:bg-elevated"
          @click="toggleFolders"
        >
          <UIcon name="i-lucide-chevron-right" class="size-3.5 transition-transform" :class="{ 'rotate-90': foldersOpen }" />{{ t('drive.folders') }}
        </button>
        <UButton icon="i-lucide-plus" color="neutral" variant="ghost" size="sm" :aria-label="t('drive.newFolder')" :title="t('drive.newFolder')" @click="folderName = ''; creating = true" />
      </div>
      <ul v-if="foldersOpen" class="mt-0.5 space-y-0.5">
        <li v-if="!rows.length" class="px-2.5 py-1.5 text-xs text-muted">{{ t('drive.noFolders') }}</li>
        <li v-for="folder in rows" :key="folder.id">
          <NuxtLink
            :to="`/drive?folder=${encodeURIComponent(folder.id)}`"
            :aria-current="activeFolder === folder.id ? 'page' : undefined"
            :style="{ paddingLeft: `${10 + folder.depth * 14}px` }"
            class="flex h-8 items-center gap-2 rounded-md pr-2.5 text-sm"
            :class="dropKey === folder.id ? dropHighlight : activeFolder === folder.id ? activeClass : 'text-default hover:bg-elevated'"
            v-on="dropProps(folder.id, { kind: 'folder', id: folder.id })"
          >
            <UIcon name="i-lucide-folder" class="size-3.5 shrink-0 text-amber-500" /><span class="truncate">{{ folder.name }}</span>
          </NuxtLink>
        </li>
      </ul>
    </div>
    <div v-if="!collapsed && storage" class="mt-auto border-t border-default pt-3">
      <template v-if="storage.limit">
        <UProgress :model-value="percent" size="sm" :color="percent >= 90 ? 'error' : 'primary'" :aria-label="t('drive.storageBar')" class="mb-1.5" />
        <p class="text-xs text-muted">{{ t('drive.storageOf', { used: formatDriveSize(storage.used), total: formatDriveSize(storage.limit) }) }}</p>
      </template>
      <p v-else class="text-xs text-muted">{{ t('drive.storageUsed', { size: formatDriveSize(storage.used) }) }}</p>
    </div>
    <UModal v-model:open="creating" :title="t('drive.newFolder')" :dismissible="!saving">
      <template #body>
        <form class="space-y-5" @submit.prevent="createFolder">
          <UInput v-model="folderName" autofocus class="w-full" :maxlength="255" :placeholder="t('drive.folderName')" :aria-label="t('drive.folderName')" />
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" :disabled="saving" :label="t('common.cancel')" @click="creating = false" />
            <UButton type="submit" :disabled="saving || !folderName.trim()" :label="t('drive.create')" />
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
