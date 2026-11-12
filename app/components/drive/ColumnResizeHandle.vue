<script setup lang="ts">
// Drag handle on the left edge of a column header: dragging left widens the column. The drag is
// tracked on `window` from the starting width, so it ends cleanly wherever the pointer is released.
// Ported from ColumnResizeHandle in legacy/src/app/(drive)/drive-columns.tsx.
import { DRIVE_COLUMN_MAX, DRIVE_COLUMN_MIN, type DriveColumn } from '~/utils/drive/drive-columns'

const props = defineProps<{ column: DriveColumn, width: number, label: string }>()
const emit = defineEmits<{ resize: [column: DriveColumn, width: number, persist: boolean] }>()
const { t } = useLanguage()
const dragging = ref(false)
let cleanup: (() => void) | null = null
onBeforeUnmount(() => cleanup?.())

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  cleanup?.()
  const startX = event.clientX
  const startWidth = props.width
  let latest = startWidth
  const move = (moveEvent: PointerEvent) => {
    latest = startWidth + (startX - moveEvent.clientX)
    emit('resize', props.column, latest, false)
  }
  const end = (endEvent?: PointerEvent) => {
    if (endEvent?.type === 'pointerup') latest = startWidth + (startX - endEvent.clientX)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    window.removeEventListener('blur', cancel)
    document.body.style.removeProperty('cursor')
    document.body.style.removeProperty('user-select')
    cleanup = null
    dragging.value = false
    emit('resize', props.column, latest, true)
  }
  const cancel = () => end()
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  window.addEventListener('blur', cancel)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  cleanup = cancel
  dragging.value = true
}

function onKeyDown(event: KeyboardEvent) {
  const step = event.shiftKey ? 40 : 10
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    emit('resize', props.column, props.width + step, true)
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    emit('resize', props.column, props.width - step, true)
  }
}
</script>

<template>
  <div
    role="separator"
    aria-orientation="vertical"
    :aria-label="t('drive.resizeColumn', { name: label })"
    :aria-valuenow="width"
    :aria-valuemin="DRIVE_COLUMN_MIN"
    :aria-valuemax="DRIVE_COLUMN_MAX"
    tabindex="0"
    class="group/handle absolute -left-2 top-0 flex h-full w-4 cursor-col-resize touch-none items-center justify-center outline-none"
    @pointerdown="onPointerDown"
    @keydown="onKeyDown"
  >
    <span class="h-5 w-0.5 rounded-full transition-colors" :class="dragging ? 'bg-primary' : 'bg-transparent group-hover/handle:bg-primary group-focus-visible/handle:bg-primary'" />
  </div>
</template>
