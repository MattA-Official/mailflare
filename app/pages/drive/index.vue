<script setup lang="ts">
// Drive: My Drive, shared with me, email attachments and the trash, all one listing driven by the
// query string (view, folder, q, types). Ported from legacy/src/app/(drive)/drive/page.tsx.
import type { DropdownMenuItem } from '@nuxt/ui'
import { isDriveCategory, type DriveCategory } from '#lib/drive/category-names'
import type { DriveItemDto } from '#lib/drive/types'
import { canEditDrive, DRIVE_MAX_FILE_BYTES, formatDriveSize } from '#lib/drive/utils'
import type { DriveListing, DriveUploadEntry } from '~/types/drive/drive'
import { useDriveColumns } from '~/utils/drive/drive-columns'
import { canDropDrive, driveDropHandlers, endDriveDrag, isDriveDraggable, startDriveDrag } from '~/utils/drive/drive-drag'
import { uploadDriveFile } from '~/utils/drive/drive-upload'
import {
  clearDriveListings, DRIVE_FOLDERS_EVENT, DRIVE_NEW_FOLDER_EVENT, DRIVE_REFRESH_EVENT, DRIVE_STORAGE_EVENT, DRIVE_UPLOAD_EVENT,
  driveFileUrl, driveIconFor, emailUrl, errorMessage, readDriveListing, saveDriveListing, sortDriveItems, type DriveSortKey,
} from '~/utils/drive/drive-utils'

definePageMeta({ layout: 'dashboard', nav: 'drive', auth: { feature: 'drive' } })

const { t } = useLanguage()
const toast = useToast()
const notify = { success: (title: string) => toast.add({ title, color: 'success' as const }), error: (title: string) => toast.add({ title, color: 'error' as const }) }
const route = useRoute()
const router = useRouter()
const queryValue = (key: string) => typeof route.query[key] === 'string' ? route.query[key] as string : null
const view = computed(() => queryValue('view') ?? 'my')
const folder = computed(() => queryValue('folder'))
const query = computed(() => queryValue('q') ?? '')
const typesParam = computed(() => queryValue('types') ?? '')
const types = computed(() => typesParam.value.split(',').filter((entry): entry is DriveCategory => isDriveCategory(entry)))
const requestKey = computed(() => `${view.value}|${folder.value ?? ''}|${query.value}|${typesParam.value}`)

const listing = shallowRef<{ key: string, data: DriveListing } | null>(null)
const failedKey = ref<string | null>(null)
const uploads = ref<DriveUploadEntry[]>([])
let uploadSeq = 0
const sortKey = ref<DriveSortKey>('name')
const ascending = ref(true)
const columns = useDriveColumns()
const dragging = ref(false)
let dragDepth = 0
const search = ref(query.value)
const preview = ref<DriveItemDto | null>(null)
const sharing = ref<DriveItemDto | null>(null)
const naming = ref<{ mode: 'create' | 'rename', item?: DriveItemDto, value: string } | null>(null)
const selectedIds = ref(new Set<string>())
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
// Rows being dragged to another folder or the trash, and the folder row under the pointer.
const movingIds = ref(new Set<string>())
const dropFolder = ref<string | null>(null)

// A listing seen before renders straight from memory while it is refetched; only a new one shows the skeleton.
const current = computed(() => listing.value?.key === requestKey.value ? listing.value.data : readDriveListing(requestKey.value))
const items = computed(() => current.value?.items ?? [])
const path = computed(() => current.value?.path ?? [])
const role = computed(() => current.value?.role ?? 'owner')
const loading = computed(() => !current.value)
const failed = computed(() => failedKey.value === requestKey.value && !current.value)
const canWrite = computed(() => view.value !== 'trash' && (folder.value ? canEditDrive(role.value) : view.value === 'my'))

async function load() {
  const key = requestKey.value
  const params = new URLSearchParams({ view: view.value })
  if (folder.value) params.set('parent', folder.value)
  if (query.value) params.set('q', query.value)
  if (typesParam.value) params.set('types', typesParam.value)
  try {
    const data = await api<DriveListing>(`/api/drive/items?${params}`)
    saveDriveListing(key, data)
    // A slow response for a folder we already left is dropped.
    if (key !== requestKey.value) return
    listing.value = { key, data }
    failedKey.value = null
    window.dispatchEvent(new CustomEvent(DRIVE_STORAGE_EVENT, { detail: { used: data.storageUsed, limit: data.storageLimit } }))
    window.dispatchEvent(new Event(DRIVE_FOLDERS_EVENT))
  } catch {
    if (key === requestKey.value) failedKey.value = key
  }
}
// Reload after a change; other cached listings may be stale now, so they are dropped.
function refresh() {
  clearDriveListings()
  return load()
}

watch(requestKey, () => {
  selectedIds.value = new Set()
  void load()
}, { immediate: true })
watch(query, (value) => {
  search.value = value
})
// Keep only selected items that are still listed (after a move, trash, upload or reload).
watch(items, (list) => {
  const present = new Set(list.map(item => item.id))
  const next = new Set([...selectedIds.value].filter(id => present.has(id)))
  if (next.size !== selectedIds.value.size) selectedIds.value = next
})

const title = computed(() => view.value === 'attachments' ? t('drive.attachments') : view.value === 'trash' ? t('drive.trash') : view.value === 'shared' ? t('drive.sharedWithMe') : query.value ? t('drive.search') : t('drive.myDrive'))
useHead({ title: () => title.value })
const rootHref = computed(() => view.value === 'shared' ? '/drive?view=shared' : '/drive')
const emptyText = computed(() => view.value === 'attachments' ? t('drive.emptyAttachments') : view.value === 'trash' ? t('drive.emptyTrash') : view.value === 'shared' ? t('drive.emptyShared') : query.value ? t('drive.emptySearch') : t('drive.empty'))
const attachmentsView = computed(() => view.value === 'attachments' && !folder.value)
const folderHref = (id: string) => `/drive?folder=${encodeURIComponent(id)}${view.value === 'shared' ? '&view=shared' : ''}`

function patchUpload(id: string, patch: Partial<DriveUploadEntry>) {
  uploads.value = uploads.value.map(entry => entry.id === id ? { ...entry, ...patch } : entry)
}

async function upload(files: File[]) {
  if (!canWrite.value || !files.length) return
  const target = folder.value
  const accepted: { id: string, file: File }[] = []
  for (const file of files) {
    if (file.size > DRIVE_MAX_FILE_BYTES) toast.add({ title: t('drive.tooLarge', { name: file.name, size: formatDriveSize(DRIVE_MAX_FILE_BYTES) }), color: 'error' })
    else accepted.push({ id: `upload-${(uploadSeq += 1)}`, file })
  }
  if (!accepted.length) return
  uploads.value = [...uploads.value, ...accepted.map(({ id, file }) => ({ id, name: file.name, percent: 0, resumed: false, status: 'queued' as const }))]
  let done = 0
  for (const { id, file } of accepted) {
    patchUpload(id, { status: 'uploading' })
    try {
      await uploadDriveFile(file, target, (percent, resumed) => patchUpload(id, { percent, resumed }))
      done += 1
      patchUpload(id, { status: 'done', percent: 100 })
    } catch (error) {
      patchUpload(id, { status: 'failed', error: errorMessage(error, t('drive.uploadFailed', { name: file.name })) })
    }
  }
  if (done) await refresh()
}

function onUploadEvent() {
  if (canWrite.value) fileInput.value?.click()
}
function onNewFolderEvent() {
  if (canWrite.value) naming.value = { mode: 'create', value: t('drive.untitledFolder') }
}
function onRefreshEvent() {
  void refresh()
}
onMounted(() => {
  window.addEventListener(DRIVE_UPLOAD_EVENT, onUploadEvent)
  window.addEventListener(DRIVE_NEW_FOLDER_EVENT, onNewFolderEvent)
  window.addEventListener(DRIVE_REFRESH_EVENT, onRefreshEvent)
})
onBeforeUnmount(() => {
  window.removeEventListener(DRIVE_UPLOAD_EVENT, onUploadEvent)
  window.removeEventListener(DRIVE_NEW_FOLDER_EVENT, onNewFolderEvent)
  window.removeEventListener(DRIVE_REFRESH_EVENT, onRefreshEvent)
})

async function mutate(url: string, method: string, body?: unknown, successMessage?: string) {
  try {
    await api(url, { method, body })
    if (successMessage) toast.add({ title: successMessage, color: 'success' })
    await refresh()
    return true
  } catch (error) {
    toast.add({ title: errorMessage(error, t('drive.actionFailed')), color: 'error' })
    return false
  }
}

async function submitName() {
  const state = naming.value
  if (!state || !state.value.trim()) return
  const ok = state.mode === 'create'
    ? await mutate('/api/drive/items', 'POST', { name: state.value, parentId: folder.value })
    : await mutate(`/api/drive/items/${state.item!.id}`, 'PATCH', { name: state.value })
  if (ok) naming.value = null
}

function open(item: DriveItemDto) {
  if (item.trashedAt) return
  if (item.kind === 'folder') void router.push(folderHref(item.id))
  else preview.value = item
}

const hasFiles = (event: DragEvent) => !!event.dataTransfer?.types.includes('Files')
function onDragEnter(event: DragEvent) {
  if (!canWrite.value || !hasFiles(event)) return
  event.preventDefault()
  dragDepth += 1
  dragging.value = true
}
function onDragOver(event: DragEvent) {
  if (canWrite.value && hasFiles(event)) event.preventDefault()
}
function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragging.value = false
}
function onDrop(event: DragEvent) {
  if (!canWrite.value || !hasFiles(event)) return
  event.preventDefault()
  dragDepth = 0
  dragging.value = false
  void upload([...(event.dataTransfer?.files ?? [])])
}

function setTypes(next: DriveCategory[]) {
  const nextQuery = { ...route.query }
  if (next.length) nextQuery.types = next.join(',')
  else delete nextQuery.types
  void router.push({ path: '/drive', query: nextQuery })
}

function submitSearch() {
  const value = search.value.trim()
  void router.push(value ? `/drive?q=${encodeURIComponent(value)}` : '/drive')
}

const sorted = computed(() => sortDriveItems(items.value, sortKey.value, ascending.value))
// Attachments can only be selected when the user may delete them.
const selectable = computed(() => sorted.value.filter(item => item.source ? item.source.canDelete : canEditDrive(item.role)))
const selectableIds = computed(() => new Set(selectable.value.map(item => item.id)))
const selectedItems = computed(() => selectable.value.filter(item => selectedIds.value.has(item.id)))
const allSelected = computed(() => selectable.value.length > 0 && selectedItems.value.length === selectable.value.length)
const selectAllState = computed<boolean | 'indeterminate'>(() => allSelected.value ? true : selectedItems.value.length ? 'indeterminate' : false)
function toggleAll() {
  selectedIds.value = allSelected.value ? new Set() : new Set(selectable.value.map(item => item.id))
}
function toggleItem(id: string) {
  const next = new Set(selectedIds.value)
  if (!next.delete(id)) next.add(id)
  selectedIds.value = next
}

function toggleSort(key: DriveSortKey) {
  if (key === sortKey.value) ascending.value = !ascending.value
  else {
    sortKey.value = key
    ascending.value = true
  }
}

// Dragging a selected row carries the whole selection; any other row goes alone.
function onItemDragStart(event: DragEvent, item: DriveItemDto) {
  const group = selectedIds.value.has(item.id) ? selectedItems.value.filter(isDriveDraggable) : [item]
  startDriveDrag(event, group, t('drive.selected', { count: group.length }))
  movingIds.value = new Set(group.map(entry => entry.id))
}
function onItemDragEnd() {
  endDriveDrag()
  movingIds.value = new Set()
  dropFolder.value = null
}
// Only the owner's own folders take drops, matching what the move endpoint allows.
function rowDropHandlers(item: DriveItemDto) {
  if (item.kind !== 'folder' || item.role !== 'owner' || item.trashedAt || item.source) return {}
  const target = { kind: 'folder' as const, id: item.id }
  return driveDropHandlers(target, () => canDropDrive(target), t, notify, (over) => {
    dropFolder.value = over ? item.id : dropFolder.value === item.id ? null : dropFolder.value
  })
}

function rowMenu(item: DriveItemDto): DropdownMenuItem[][] {
  const live = !item.trashedAt
  const main: DropdownMenuItem[] = []
  if (live) main.push({ label: t('drive.open'), onSelect: () => open(item) })
  if (item.kind === 'file' && !(item.source && item.trashedAt)) main.push({ label: t('drive.download'), icon: 'i-lucide-download', to: driveFileUrl(item, true), external: true })
  if (item.source && live) main.push({ label: t('drive.openEmail'), icon: 'i-lucide-mail', to: emailUrl(item.source), target: '_blank' })
  if (item.role === 'owner' && live) main.push({ label: t('drive.share'), icon: 'i-lucide-share-2', onSelect: () => { sharing.value = item } })
  if (canEditDrive(item.role) && live) main.push({ label: t('drive.rename'), icon: 'i-lucide-pencil', onSelect: () => { naming.value = { mode: 'rename', item, value: item.name } } })
  if (item.source?.canDelete && live) main.push({ label: t('drive.moveToTrash'), icon: 'i-lucide-trash-2', onSelect: () => void mutate('/api/drive/attachments', 'POST', { action: 'trash', ids: [item.id] }, t('drive.trashed')) })
  if (canEditDrive(item.role) && !item.source && live) main.push({ label: t('drive.moveToTrash'), icon: 'i-lucide-trash-2', onSelect: () => void mutate(`/api/drive/items/${item.id}`, 'PATCH', { trashed: true }, t('drive.trashed')) })
  if (item.trashedAt) {
    main.push({
      label: t('drive.restore'),
      icon: 'i-lucide-rotate-ccw',
      onSelect: () => void (item.source
        ? mutate('/api/drive/attachments', 'POST', { action: 'restore', ids: [item.id] }, t('drive.restored'))
        : mutate(`/api/drive/items/${item.id}`, 'PATCH', { trashed: false }, t('drive.restored'))),
    })
    main.push({
      label: t('drive.deleteForever'),
      icon: 'i-lucide-x',
      color: 'error',
      onSelect: () => {
        if (!window.confirm(t('drive.confirmDelete', { name: item.name }))) return
        void (item.source
          ? mutate('/api/drive/attachments', 'POST', { action: 'delete', ids: [item.id] }, t('drive.deleted'))
          : mutate(`/api/drive/items/${item.id}`, 'DELETE', undefined, t('drive.deleted')))
      },
    })
  }
  return [main]
}

const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
const gridStyle = computed(() => ({ '--drive-columns': columns.template.value }))
const gridClass = 'grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] items-center gap-x-4 md:grid-cols-[var(--drive-columns)]'
const sortColumns = computed(() => [
  { key: 'owner' as const, label: attachmentsView.value ? t('drive.from') : t('drive.owner'), resizeLabel: t('drive.owner') },
  { key: 'updatedAt' as const, label: t('drive.modified'), resizeLabel: t('drive.modified') },
  { key: 'size' as const, label: t('drive.fileSize'), resizeLabel: t('drive.fileSize') },
])
</script>

<template>
  <UDashboardPanel id="drive" :ui="{ body: 'p-0 sm:p-0 gap-0' }">
    <template #header>
      <UDashboardNavbar :title="t('drive.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <form role="search" class="w-full max-w-md" @submit.prevent="submitSearch">
            <UInput v-model="search" icon="i-lucide-search" class="w-full" :placeholder="t('drive.search')" :aria-label="t('drive.search')" />
          </form>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="relative flex min-h-0 flex-1 flex-col" @dragenter="onDragEnter" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
        <input ref="fileInput" type="file" multiple hidden @change="(event) => { const target = event.target as HTMLInputElement; void upload([...(target.files ?? [])]); target.value = '' }">

        <div class="flex min-h-[4.25rem] shrink-0 items-center justify-between gap-3 border-b border-default px-5 py-3">
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            <nav :aria-label="title" class="flex min-w-0 flex-wrap items-center gap-1 text-xl text-highlighted max-md:text-lg">
              <USkeleton v-if="loading && folder" class="h-7 w-48" />
              <h1 v-else-if="!path.length" class="font-normal">{{ title }}</h1>
              <template v-else>
                <NuxtLink :to="rootHref" class="rounded-full px-2 py-1 hover:bg-elevated">{{ view === 'shared' || role !== 'owner' ? t('drive.sharedWithMe') : t('drive.myDrive') }}</NuxtLink>
                <span v-for="(crumb, index) in path" :key="crumb.id" class="flex items-center gap-1">
                  <UIcon name="i-lucide-chevron-right" class="size-[18px] text-muted" />
                  <h1 v-if="index === path.length - 1" class="px-2 py-1 font-normal">{{ crumb.name }}</h1>
                  <NuxtLink v-else :to="folderHref(crumb.id)" class="rounded-full px-2 py-1 hover:bg-elevated">{{ crumb.name }}</NuxtLink>
                </span>
              </template>
            </nav>
            <span v-if="selectedItems.length" class="flex shrink-0 items-center gap-1 text-sm text-muted">
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" class="rounded-full" :aria-label="t('navigation.close')" @click="selectedIds = new Set()" />
              {{ t('drive.selected', { count: selectedItems.length }) }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <DriveBulkActions v-if="selectedItems.length" :selected="selectedItems" :trash-view="view === 'trash'" @done="selectedIds = new Set(); refresh()" />
            <DriveTypeFilter :model-value="types" @update:model-value="setTypes" />
          </div>
        </div>
        <p v-if="view === 'trash' && !folder" class="shrink-0 border-b border-default bg-muted px-5 py-2 text-xs text-muted">{{ t('drive.trashNotice', { days: 30 }) }}</p>

        <div :style="gridStyle" :class="gridClass" class="shrink-0 border-b border-default px-5 py-2 text-sm">
          <UCheckbox :model-value="selectAllState" :disabled="!selectable.length" :aria-label="t('drive.selectAll')" class="ml-1" @update:model-value="toggleAll" />
          <span class="min-w-0 pl-7">
            <button type="button" class="flex min-w-0 items-center gap-1 font-medium text-muted hover:text-highlighted" @click="toggleSort('name')">
              <span class="truncate">{{ t('drive.name') }}</span>
              <UIcon v-if="sortKey === 'name'" :name="ascending ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'" class="size-3 shrink-0" />
            </button>
          </span>
          <span v-for="column in sortColumns" :key="column.key" class="relative hidden min-w-0 md:block">
            <button type="button" class="flex min-w-0 items-center gap-1 font-medium text-muted hover:text-highlighted" @click="toggleSort(column.key)">
              <span class="truncate">{{ column.label }}</span>
              <UIcon v-if="sortKey === column.key" :name="ascending ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'" class="size-3 shrink-0" />
            </button>
            <DriveColumnResizeHandle :column="column.key" :width="columns.widths.value[column.key]" :label="column.resizeLabel" @resize="columns.resize" />
          </span>
          <span />
        </div>

        <div
          :role="!failed && !loading && sorted.length ? 'list' : undefined"
          :aria-label="!failed && !loading && sorted.length ? t('drive.title') : undefined"
          class="min-h-0 flex-1 space-y-px overflow-y-auto overscroll-contain px-2 pt-px"
        >
          <p v-if="failed" class="p-8 text-center text-sm text-muted">{{ t('drive.loadFailed') }}</p>
          <template v-else-if="loading">
            <div v-for="index in 8" :key="index" aria-hidden="true" :style="gridStyle" :class="gridClass" class="px-3 py-3.5">
              <USkeleton class="ml-1 size-4" />
              <span class="flex items-center gap-3"><USkeleton class="size-4 shrink-0" /><USkeleton class="h-4" :style="{ width: `${45 + ((index * 17) % 40)}%` }" /></span>
              <USkeleton class="hidden size-6 rounded-full md:block" />
              <USkeleton class="hidden h-4 w-24 md:block" />
              <USkeleton class="hidden h-4 w-14 md:block" />
              <span />
            </div>
          </template>
          <p v-else-if="!sorted.length" class="p-12 text-center text-sm text-muted">{{ emptyText }}</p>
          <div
            v-for="item in sorted"
            v-else
            :key="item.id"
            role="listitem"
            :style="gridStyle"
            :draggable="isDriveDraggable(item)"
            :class="[gridClass, 'group rounded-lg px-3 text-sm', dropFolder === item.id ? 'bg-primary/15 ring-2 ring-inset ring-primary' : selectedIds.has(item.id) ? 'bg-primary/10' : 'hover:bg-elevated/60', movingIds.has(item.id) && 'opacity-50']"
            @dragstart="onItemDragStart($event, item)"
            @dragend="onItemDragEnd"
            v-on="rowDropHandlers(item)"
          >
            <UCheckbox
              :model-value="selectedIds.has(item.id)"
              :disabled="!selectableIds.has(item.id)"
              :aria-label="t('drive.selectItem', { name: item.name })"
              class="ml-1"
              :class="{ invisible: !selectableIds.has(item.id) }"
              @update:model-value="toggleItem(item.id)"
            />
            <button type="button" :aria-disabled="item.trashedAt ? true : undefined" class="flex min-w-0 items-center gap-3 py-3 text-left aria-disabled:cursor-default" @click="open(item)">
              <UIcon :name="driveIconFor(item).icon" class="size-4 shrink-0" :class="[driveIconFor(item).className, item.kind === 'folder' && 'fill-current']" />
              <span class="truncate text-highlighted">{{ item.name }}</span>
              <UIcon v-if="item.shared && item.role === 'owner'" name="i-lucide-share-2" class="size-3 shrink-0 text-muted" :aria-label="t('drive.share')" />
            </button>
            <span class="hidden md:block"><DriveOwnerAvatar :item="item" /></span>
            <span class="hidden text-muted md:block">{{ dateFormat.format(new Date(item.updatedAt)) }}</span>
            <span class="hidden text-muted md:block">{{ item.kind === 'file' ? formatDriveSize(item.size) : '—' }}</span>
            <UDropdownMenu :items="rowMenu(item)" :content="{ align: 'end' }">
              <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" class="rounded-full" :aria-label="t('drive.actions')" />
            </UDropdownMenu>
          </div>
        </div>

        <div v-if="dragging" class="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/10 text-primary">
          <UIcon name="i-lucide-cloud-upload" class="size-7" /><span class="ml-3 text-base font-medium">{{ t('drive.fileUpload') }}</span>
        </div>
      </div>

      <UModal :open="!!naming" :title="naming?.mode === 'create' ? t('drive.newFolder') : t('drive.renameTitle')" @update:open="(value: boolean) => { if (!value) naming = null }">
        <template #body>
          <form v-if="naming" class="space-y-5" @submit.prevent="submitName">
            <UInput v-model="naming.value" autofocus class="w-full" :maxlength="255" :aria-label="t('drive.folderName')" @focus="($event.target as HTMLInputElement).select()" />
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="naming = null" />
              <UButton type="submit" :disabled="!naming.value.trim()" :label="naming.mode === 'create' ? t('drive.create') : t('drive.save')" />
            </div>
          </form>
        </template>
      </UModal>

      <UModal
        :open="!!preview"
        :title="preview?.name"
        :ui="{ overlay: 'bg-black/65 backdrop-blur-sm', content: 'h-[min(85vh,900px)] w-[min(1100px,calc(100vw-32px))] max-w-none sm:max-w-none overflow-hidden bg-transparent ring-0 shadow-none divide-y-0', header: 'text-white border-0', title: 'text-white truncate', close: 'text-white hover:bg-white/15', body: 'p-3 pt-0 sm:p-3 sm:pt-0 flex-1 min-h-0' }"
        @update:open="(value: boolean) => { if (!value) preview = null }"
      >
        <template v-if="preview" #actions>
          <UButton v-if="preview.source" :to="emailUrl(preview.source)" target="_blank" color="neutral" variant="ghost" class="rounded-full text-white hover:bg-white/15" icon="i-lucide-mail" trailing-icon="i-lucide-external-link" :label="t('drive.openEmail')" />
          <UButton :to="driveFileUrl(preview, true)" external color="neutral" variant="ghost" class="rounded-full text-white hover:bg-white/15" icon="i-lucide-download" :aria-label="t('drive.download')" />
        </template>
        <template #body>
          <DrivePreviewBody v-if="preview" :src="driveFileUrl(preview)" :download-href="driveFileUrl(preview, true)" :content-type="preview.contentType" :name="preview.name" />
        </template>
      </UModal>

      <DriveUploadPanel :uploads="uploads" @close="uploads = uploads.filter(entry => entry.status === 'queued' || entry.status === 'uploading')" />
      <DriveShareDialog :item="sharing" @close="sharing = null" @changed="refresh()" />
    </template>
  </UDashboardPanel>
</template>
