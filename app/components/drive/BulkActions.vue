<script setup lang="ts">
// Actions on the selected rows: trash, move to a folder (or a new one), restore, delete forever.
// Ported from legacy/src/app/(drive)/drive-bulk-actions.tsx.
import { confirmDestructive } from '~/utils/confirm-dialog'
import type { DriveItemDto } from '#lib/drive/types'
import type { DriveFolderNode } from '~/types/drive/drive'
import { driveAttachmentAction, driveBulk, errorMessage, flattenDriveFolders } from '~/utils/drive/drive-utils'

const props = defineProps<{ selected: DriveItemDto[], trashView: boolean }>()
const emit = defineEmits<{ done: [] }>()
const { t } = useLanguage()
const toast = useToast()
const folders = ref<DriveFolderNode[] | null>(null)
const name = ref('')
const busy = ref(false)
const moveOpen = ref(false)

const ids = computed(() => props.selected.map(item => item.id))
const rows = computed(() => flattenDriveFolders(folders.value ?? [], new Set(ids.value)))
const driveItems = computed(() => props.selected.filter(item => !item.source))
const attachmentIds = computed(() => props.selected.filter(item => item.source).map(item => item.id))
// Editors can trash what is shared with them; moving, restoring and deleting forever are for the owner.
const ownsAll = computed(() => driveItems.value.every(item => item.role === 'owner'))
const canTrash = computed(() => driveItems.value.every(item => item.role === 'owner' || item.role === 'edit'))

async function run(task: () => Promise<number>, message: (count: number) => string) {
  busy.value = true
  try {
    const count = await task()
    toast.add({ title: message(count), color: 'success' })
    emit('done')
  } catch (error) {
    toast.add({ title: errorMessage(error, t('drive.actionFailed')), color: 'error' })
  } finally {
    busy.value = false
  }
}

/** Applies a trash action to the Drive items and the email attachments in the selection. */
async function act(action: 'trash' | 'restore' | 'delete') {
  let total = 0
  const driveIds = driveItems.value.map(item => item.id)
  if (driveIds.length) total += await driveBulk({ action, ids: driveIds })
  if (attachmentIds.value.length) total += await driveAttachmentAction(action, attachmentIds.value)
  return total
}

watch(moveOpen, async (open) => {
  if (!open) return
  name.value = ''
  try {
    folders.value = (await api<{ folders: DriveFolderNode[] }>('/api/drive/folders')).folders
  } catch {
    toast.add({ title: t('drive.loadFailed'), color: 'error' })
  }
})

function move(parentId: string | null) {
  moveOpen.value = false
  return run(() => driveBulk({ action: 'move', ids: ids.value, parentId }), count => t('drive.bulkMoved', { count }))
}

async function createAndMove() {
  const folderName = name.value.trim()
  if (!folderName) return
  busy.value = true
  try {
    const data = await api<{ item?: { id: string } }>('/api/drive/items', { method: 'POST', body: { name: folderName } })
    if (!data?.item) throw new Error()
    busy.value = false
    await move(data.item.id)
  } catch (error) {
    busy.value = false
    toast.add({ title: errorMessage(error, t('drive.actionFailed')), color: 'error' })
  }
}

async function deleteForever() {
  if (await confirmDestructive(t('drive.confirmBulkDelete', { count: props.selected.length }))) void run(() => act('delete'), count => t('drive.bulkDeleted', { count }))
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-end gap-1 text-sm">
    <template v-if="!trashView && canTrash">
      <UButton color="neutral" variant="ghost" class="rounded-full" icon="i-lucide-trash-2" :disabled="busy" :label="t('drive.moveToTrash')" @click="run(() => act('trash'), count => t('drive.bulkTrashed', { count }))" />
      <UPopover v-if="!attachmentIds.length && ownsAll" v-model:open="moveOpen" :content="{ align: 'end' }">
        <UButton color="neutral" variant="ghost" class="rounded-full" icon="i-lucide-folder-input" :disabled="busy" :label="t('drive.moveToFolder')" />
        <template #content>
          <div class="w-72 p-1.5">
            <form class="flex items-center gap-1 border-b border-default p-1.5 pb-2" @submit.prevent="createAndMove" @keydown.stop>
              <UIcon name="i-lucide-folder-plus" class="size-4 shrink-0 text-muted" />
              <UInput v-model="name" size="sm" class="min-w-0 flex-1" :maxlength="255" :placeholder="t('drive.newFolderPlaceholder')" :aria-label="t('drive.newFolderPlaceholder')" />
              <UButton type="submit" size="sm" :disabled="busy || !name.trim()" :title="t('drive.createAndMove')" :label="t('drive.create')" />
            </form>
            <div class="max-h-64 overflow-y-auto pt-1">
              <button type="button" class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-elevated" @click="move(null)">
                <UIcon name="i-lucide-hard-drive" class="size-4 shrink-0" />{{ t('drive.myDrive') }}
              </button>
              <button
                v-for="folder in rows"
                :key="folder.id"
                type="button"
                :disabled="folder.disabled"
                :style="{ paddingLeft: `${10 + folder.depth * 14}px` }"
                class="flex w-full items-center gap-2 rounded-lg py-2 pr-2.5 text-left text-sm hover:bg-elevated disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
                @click="move(folder.id)"
              >
                <UIcon name="i-lucide-folder" class="size-4 shrink-0 text-amber-500" /><span class="truncate">{{ folder.name }}</span>
              </button>
              <p v-if="folders && !rows.length" class="px-2.5 py-2 text-xs text-muted">{{ t('drive.noFolders') }}</p>
            </div>
          </div>
        </template>
      </UPopover>
    </template>
    <template v-if="ownsAll && trashView">
      <UButton color="neutral" variant="ghost" class="rounded-full" icon="i-lucide-rotate-ccw" :disabled="busy" :label="t('drive.restore')" @click="run(() => act('restore'), count => t('drive.bulkRestored', { count }))" />
      <UButton color="error" variant="ghost" class="rounded-full" icon="i-lucide-x" :disabled="busy" :label="t('drive.deleteForever')" @click="deleteForever" />
    </template>
  </div>
</template>
