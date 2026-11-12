// Widths of the listing's resizable columns; the name column takes what is left. Remembered per
// browser. Ported from legacy/src/app/(drive)/drive-columns.tsx.
export type DriveColumn = 'owner' | 'updatedAt' | 'size'

const STORAGE_KEY = 'mailflare-drive-columns'
const DEFAULT_WIDTHS: Record<DriveColumn, number> = { owner: 100, updatedAt: 144, size: 96 }
export const DRIVE_COLUMN_MIN = 72
export const DRIVE_COLUMN_MAX = 480
const clamp = (value: number) => Math.min(DRIVE_COLUMN_MAX, Math.max(DRIVE_COLUMN_MIN, Math.round(value)))

export function useDriveColumns() {
  const widths = ref<Record<DriveColumn, number>>({ ...DEFAULT_WIDTHS })
  onMounted(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Record<DriveColumn, number>> | null
      if (saved) widths.value = { owner: clamp(saved.owner ?? DEFAULT_WIDTHS.owner), updatedAt: clamp(saved.updatedAt ?? DEFAULT_WIDTHS.updatedAt), size: clamp(saved.size ?? DEFAULT_WIDTHS.size) }
    } catch { /* storage unavailable: keep defaults */ }
  })
  function resize(column: DriveColumn, width: number, persist = false) {
    widths.value = { ...widths.value, [column]: clamp(width) }
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(widths.value))
      } catch { /* ignore */ }
    }
  }
  const template = computed(() => `2rem minmax(0,1fr) ${widths.value.owner}px ${widths.value.updatedAt}px ${widths.value.size}px 2.5rem`)
  return { widths, resize, template }
}
