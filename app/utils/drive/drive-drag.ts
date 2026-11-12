// Moving Drive items by drag and drop, onto folders, My Drive, the trash or the attachments list.
// Ported from legacy/src/app/(drive)/drive-drag.ts.
import type { Translator } from '#lib/i18n/utils'
import type { DriveItemDto } from '#lib/drive/types'
import { canEditDrive } from '#lib/drive/utils'
import { DRIVE_REFRESH_EVENT, driveAttachmentAction, driveBulk, errorMessage } from './drive-utils'

/** Marks a drag as Drive items being moved, so drop targets ignore files dragged in from the desktop. */
export const DRIVE_DRAG_TYPE = 'application/x-mailflare-drive'

export type DriveNotify = { success: (message: string) => void, error: (message: string) => void }

type DraggedItem = Pick<DriveItemDto, 'id' | 'kind' | 'role'> & { attachment: boolean, trashed: boolean }
/**
 * Where items are dropped: a folder (`null` is the root of My Drive), the trash, or the attachments
 * list, which only takes trashed attachments back.
 */
export type DriveDropTarget = { kind: 'folder', id: string | null } | { kind: 'trash' } | { kind: 'attachments' }

// `dataTransfer` cannot be read until the drop, so targets decide whether to accept from this instead.
let dragged: DraggedItem[] = []

/** Attachments the user may delete and Drive items they can edit; from the trash, only what they may restore. */
export function isDriveDraggable(item: DriveItemDto): boolean {
  if (item.source) return item.source.canDelete
  return item.trashedAt ? item.role === 'owner' : canEditDrive(item.role)
}

export function startDriveDrag(event: DragEvent, items: DriveItemDto[], label: string) {
  dragged = items.map(item => ({ id: item.id, kind: item.kind, role: item.role, attachment: !!item.source, trashed: !!item.trashedAt }))
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData(DRIVE_DRAG_TYPE, JSON.stringify(dragged.map(item => item.id)))
  if (items.length > 1) {
    // A small "3 selected" chip instead of the browser's snapshot of a single row.
    const chip = document.createElement('div')
    chip.textContent = label
    chip.style.cssText = 'position:fixed;top:-100px;left:0;padding:6px 12px;border-radius:9999px;background:#1d4ed8;color:#fff;font:500 13px system-ui,sans-serif;white-space:nowrap'
    document.body.appendChild(chip)
    event.dataTransfer.setDragImage(chip, 12, 16)
    setTimeout(() => chip.remove(), 0)
  }
}

export function endDriveDrag() {
  dragged = []
}

/**
 * Whether the current drag may land on a target. Anything not yet trashed may go to the trash, and
 * trashed attachments may go back to the attachments list. Moving (which also restores from the
 * trash) is for the owner's own Drive items, never attachments, and never into a folder being
 * dragged or one inside it (`isInside` walks up from the target).
 */
export function canDropDrive(target: DriveDropTarget, isInside?: (folderId: string, ancestorIds: Set<string>) => boolean): boolean {
  if (!dragged.length) return false
  if (target.kind === 'trash') return dragged.some(item => !item.trashed)
  if (target.kind === 'attachments') return dragged.every(item => item.attachment && item.trashed)
  if (dragged.some(item => item.attachment || item.role !== 'owner')) return false
  if (target.id === null) return true
  const folders = new Set(dragged.filter(item => item.kind === 'folder').map(item => item.id))
  if (folders.has(target.id)) return false
  return !isInside?.(target.id, folders)
}

/** Moves or trashes the dragged items, reports the result and asks the listing to reload. */
export async function dropDrive(target: DriveDropTarget, t: Translator, notify: DriveNotify): Promise<void> {
  const items = dragged
  endDriveDrag()
  if (!items.length) return
  try {
    if (target.kind === 'attachments') {
      const count = await driveAttachmentAction('restore', items.map(item => item.id))
      if (count) notify.success(t('drive.bulkRestored', { count }))
    } else if (target.kind === 'trash') {
      const live = items.filter(item => !item.trashed)
      const attachments = live.filter(item => item.attachment).map(item => item.id)
      const driveIds = live.filter(item => !item.attachment).map(item => item.id)
      let count = 0
      if (attachments.length) count += await driveAttachmentAction('trash', attachments)
      if (driveIds.length) count += await driveBulk({ action: 'trash', ids: driveIds })
      if (count) notify.success(t('drive.bulkTrashed', { count }))
    } else {
      const count = await driveBulk({ action: 'move', ids: items.map(item => item.id), parentId: target.id })
      if (count) notify.success(t(items.every(item => item.trashed) ? 'drive.bulkRestored' : 'drive.bulkMoved', { count }))
    }
  } catch (error) {
    notify.error(errorMessage(error, t('drive.actionFailed')))
  }
  window.dispatchEvent(new Event(DRIVE_REFRESH_EVENT))
}

/**
 * Drop listeners for one target (bind with v-on); `setOver` drives its highlight. `accepts` runs on
 * every dragover, so keep it cheap. A handled drop stops propagating, so the page's file-upload drop
 * zone never sees it.
 */
export function driveDropHandlers(target: DriveDropTarget, accepts: () => boolean, t: Translator, notify: DriveNotify, setOver: (over: boolean) => void) {
  return {
    dragover(event: DragEvent) {
      if (!event.dataTransfer?.types.includes(DRIVE_DRAG_TYPE) || !accepts()) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'move'
      setOver(true)
    },
    dragleave(event: DragEvent) {
      const current = event.currentTarget as HTMLElement | null
      if (!current?.contains(event.relatedTarget as Node | null)) setOver(false)
    },
    drop(event: DragEvent) {
      if (!event.dataTransfer?.types.includes(DRIVE_DRAG_TYPE)) return
      event.preventDefault()
      event.stopPropagation()
      setOver(false)
      if (accepts()) void dropDrive(target, t, notify)
    },
  }
}
