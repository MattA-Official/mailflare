// Ported from legacy/src/app/(drive)/drive-utils.ts, drive-cache.ts, drive-events.ts and the folder
// helpers of drive-nav.tsx and drive-bulk-actions.tsx. Icons are Lucide names for UIcon.
import type { DriveItemDto } from '#lib/drive/types'
import type { DriveFolderNode, DriveListing } from '~/types/drive/drive'

export const DRIVE_UPLOAD_EVENT = 'mailflare:drive-upload'
export const DRIVE_NEW_FOLDER_EVENT = 'mailflare:drive-new-folder'
/** Detail: `DriveStorageDetail`. Sent by the page whenever a listing loads. */
export const DRIVE_STORAGE_EVENT = 'mailflare:drive-storage'
/** Sent after a listing loads so the sidebar can refresh its folder list. */
export const DRIVE_FOLDERS_EVENT = 'mailflare:drive-folders'
/** Asks the open listing to reload, e.g. after the sidebar created a folder. */
export const DRIVE_REFRESH_EVENT = 'mailflare:drive-refresh'

const extensionOf = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase()
const SPREADSHEET = /spreadsheet|ms-excel|csv/
const PRESENTATION = /presentation|ms-powerpoint/
const ARCHIVE = /zip|compressed|x-tar|gzip|rar|7z/
const CODE_EXTENSIONS = new Set(['js', 'ts', 'tsx', 'jsx', 'json', 'html', 'css', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sh', 'sql', 'yml', 'yaml', 'xml'])

/** One colour per kind of file. */
export function driveIconFor(item: Pick<DriveItemDto, 'kind' | 'contentType' | 'name'>): { icon: string, className: string } {
  if (item.kind === 'folder') return { icon: 'i-lucide-folder', className: 'text-amber-500' }
  const type = item.contentType
  const extension = extensionOf(item.name)
  if (type.startsWith('image/')) return { icon: 'i-lucide-file-image', className: 'text-rose-500' }
  if (type.startsWith('video/')) return { icon: 'i-lucide-file-video', className: 'text-purple-500' }
  if (type.startsWith('audio/')) return { icon: 'i-lucide-file-audio', className: 'text-orange-500' }
  if (type === 'application/pdf' || extension === 'pdf') return { icon: 'i-lucide-file-text', className: 'text-red-600' }
  if (SPREADSHEET.test(type) || ['xls', 'xlsx', 'ods', 'csv', 'numbers'].includes(extension)) return { icon: 'i-lucide-file-spreadsheet', className: 'text-green-600' }
  if (PRESENTATION.test(type) || ['ppt', 'pptx', 'odp', 'key'].includes(extension)) return { icon: 'i-lucide-presentation', className: 'text-orange-600' }
  if (ARCHIVE.test(type) || ['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return { icon: 'i-lucide-file-archive', className: 'text-yellow-700' }
  if (CODE_EXTENSIONS.has(extension) || type === 'application/json' || type.includes('javascript') || type.includes('xml')) return { icon: 'i-lucide-file-code', className: 'text-teal-500' }
  if (type.startsWith('text/') || type.includes('word') || type.includes('opendocument.text') || ['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'pages'].includes(extension)) return { icon: 'i-lucide-file-text', className: 'text-blue-500' }
  return { icon: 'i-lucide-file', className: 'text-muted' }
}

export type DriveSortKey = 'name' | 'owner' | 'updatedAt' | 'size'

export function sortDriveItems<T extends Pick<DriveItemDto, 'kind' | 'name' | 'updatedAt'> & { ownerName?: string, role?: string, size?: number }>(items: T[], key: DriveSortKey, ascending: boolean): T[] {
  const direction = ascending ? 1 : -1
  const text = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    let compared: number
    if (key === 'updatedAt') compared = a.updatedAt.localeCompare(b.updatedAt)
    else if (key === 'size') compared = (a.size ?? 0) - (b.size ?? 0)
    else if (key === 'owner') compared = text(a.role === 'owner' ? '' : a.ownerName ?? '', b.role === 'owner' ? '' : b.ownerName ?? '')
    else compared = 0
    return (compared || text(a.name, b.name)) * direction
  })
}

export function contentUrl(id: string, download = false): string {
  return `/api/drive/items/${encodeURIComponent(id)}/content${download ? '?download=1' : ''}`
}

/** URL of a file's bytes: a Drive file, or an email attachment when the item comes from mail. */
export function driveFileUrl(item: Pick<DriveItemDto, 'id' | 'source'>, download = false): string {
  return item.source ? `/api/drive/attachments/${encodeURIComponent(item.id)}/content${download ? '?download=1' : ''}` : contentUrl(item.id, download)
}

export function emailUrl(source: NonNullable<DriveItemDto['source']>): string {
  return `/${source.direction === 'outbound' ? 'sent' : 'inbox'}/${encodeURIComponent(source.messageId)}`
}

export function publicContentUrl(token: string, itemId: string, download = false): string {
  return `/api/drive/public/${encodeURIComponent(token)}?item=${encodeURIComponent(itemId)}&${download ? 'download=1' : 'content=1'}`
}

export function canPreview(contentType: string): boolean {
  return (contentType.startsWith('image/') && contentType !== 'image/svg+xml') || contentType.startsWith('video/') || contentType.startsWith('audio/') || contentType === 'application/pdf' || contentType === 'text/plain' || contentType === 'text/csv' || contentType === 'application/json'
}

/**
 * Flattens the folder list depth-first, sorted by name. Folders in `blocked`, and everything beneath
 * them, are marked disabled (they cannot be move targets).
 */
export function flattenDriveFolders(folders: DriveFolderNode[], blocked: Set<string> = new Set()): (DriveFolderNode & { depth: number, disabled: boolean })[] {
  const known = new Set(folders.map(folder => folder.id))
  const children = new Map<string | null, DriveFolderNode[]>()
  for (const folder of folders) {
    const key = folder.parentId && known.has(folder.parentId) ? folder.parentId : null
    children.set(key, [...(children.get(key) ?? []), folder])
  }
  const rows: (DriveFolderNode & { depth: number, disabled: boolean })[] = []
  const visit = (parent: string | null, depth: number, parentDisabled: boolean) => {
    for (const folder of (children.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))) {
      const disabled = parentDisabled || blocked.has(folder.id)
      rows.push({ ...folder, depth, disabled })
      visit(folder.id, depth + 1, disabled)
    }
  }
  visit(null, 0, false)
  return rows
}

const MAX_LISTINGS = 50
// Listings already fetched this session, keyed by the page's request key, so going back to a folder
// renders at once. Memory only: a reload starts empty. The page still refetches in the background.
const listings = new Map<string, DriveListing>()

export function readDriveListing(key: string) {
  return listings.get(key)
}

export function saveDriveListing(key: string, listing: DriveListing) {
  listings.delete(key)
  listings.set(key, listing)
  if (listings.size > MAX_LISTINGS) listings.delete(listings.keys().next().value!)
}

/** After a change, other cached listings may be out of date (a moved file, an upload elsewhere). */
export function clearDriveListings() {
  listings.clear()
}

/** POSTs a JSON action and returns the affected count, or throws with the server's message. */
async function countAction(url: string, body: Record<string, unknown>): Promise<number> {
  const data = await api<{ count?: number }>(url, { method: 'POST', body })
  return data?.count ?? 0
}

export const driveBulk = (body: Record<string, unknown>) => countAction('/api/drive/items/bulk', body)
export const driveAttachmentAction = (action: 'trash' | 'restore' | 'delete', ids: string[]) => countAction('/api/drive/attachments', { action, ids })

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
