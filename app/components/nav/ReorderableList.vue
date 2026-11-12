<script setup lang="ts">
// Press and hold a sidebar row, then drag it. A ghost follows the pointer and a line marks where it
// will land; nothing moves until you let go. Lists can hand items to each other across the `before`
// row between them (upstream reorderable-list). The order is saved in localStorage.
import { moveItem, readStorage, resolveLayout, writeStorage, type ReorderableLayout, type ReorderableListSpec } from '~/utils/nav/reorder'

type DropTarget = { listId: string, beforeId: string | null, lineY: number }
type Drag = { id: string, left: number, width: number, offsetY: number, pointerY: number, listLeft: number, listWidth: number }

const HOLD_MS = 350
const CANCEL_DISTANCE = 6

const props = withDefaults(defineProps<{ lists: ReorderableListSpec[], storageKey: string, enabled?: boolean }>(), { enabled: true })
defineSlots<{ item(props: { id: string }): unknown, before(props: { listId: string }): unknown }>()

const stored = ref<ReorderableLayout>({})
const drag = ref<Drag | null>(null)
const target = ref<DropTarget | null>(null)
const container = useTemplateRef<HTMLElement>('container')
let hold: { timer: ReturnType<typeof setTimeout>, x: number, y: number } | null = null
let suppressClick = false

onMounted(() => {
  stored.value = readStorage<ReorderableLayout>(props.storageKey, {})
})

const layout = computed(() => resolveLayout(Object.fromEntries(props.lists.map(list => [list.id, [...list.ids]])), stored.value))
const shown = computed(() => props.lists.map((list) => {
  const ordered = layout.value[list.id] ?? []
  return { ...list, shownIds: list.visible ? list.visible(ordered) : ordered }
}))

function locate(y: number): DropTarget | null {
  const rows = Array.from(container.value?.querySelectorAll<HTMLElement>('[data-reorder-id], [data-reorder-boundary]') ?? [])
  if (rows.length === 0) return null
  const current = layout.value
  const hit = rows.find((row) => {
    const rect = row.getBoundingClientRect()
    return y >= rect.top && y <= rect.bottom
  }) ?? (y < rows[0]!.getBoundingClientRect().top ? rows[0]! : rows[rows.length - 1]!)
  const rect = hit.getBoundingClientRect()
  const upper = y < rect.top + rect.height / 2
  const boundaryList = hit.dataset.reorderBoundary
  if (boundaryList !== undefined) {
    const listIds = Object.keys(current)
    const index = listIds.indexOf(boundaryList)
    if (upper) return { listId: listIds[Math.max(0, index - 1)]!, beforeId: null, lineY: rect.top }
    return { listId: boundaryList, beforeId: current[boundaryList]?.[0] ?? null, lineY: rect.bottom }
  }
  const id = hit.dataset.reorderId!
  const listId = hit.dataset.reorderList!
  if (upper) return { listId, beforeId: id, lineY: rect.top }
  const ids = current[listId]!
  return { listId, beforeId: ids[ids.indexOf(id) + 1] ?? null, lineY: rect.bottom }
}

function onMove(event: PointerEvent) {
  if (!drag.value) return
  drag.value = { ...drag.value, pointerY: event.clientY }
  target.value = locate(event.clientY)
}

function end(commit: boolean) {
  suppressClick = true
  setTimeout(() => {
    suppressClick = false
  }, 0)
  const drop = target.value
  if (commit && drop && drag.value) {
    const next = moveItem(layout.value, drag.value.id, drop.listId, drop.beforeId)
    stored.value = next
    writeStorage(props.storageKey, next)
  }
  drag.value = null
  target.value = null
  stopListening()
}

const onUp = () => end(true)
const onCancel = () => end(false)
const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') end(false)
}
// Once holding, a touch drag must not scroll the menu.
const blockScroll = (event: TouchEvent) => event.preventDefault()

function startListening() {
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('keydown', onKey)
  document.addEventListener('touchmove', blockScroll, { passive: false })
}
function stopListening() {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onCancel)
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('touchmove', blockScroll)
}

function cancelHold() {
  if (!hold) return
  clearTimeout(hold.timer)
  hold = null
}

function startHold(event: PointerEvent, id: string) {
  if (!props.enabled || event.button !== 0) return
  cancelHold()
  const element = event.currentTarget as HTMLElement
  const { clientX, clientY } = event
  const timer = setTimeout(() => {
    hold = null
    const rect = element.getBoundingClientRect()
    const listRect = container.value?.getBoundingClientRect()
    drag.value = { id, left: rect.left, width: rect.width, offsetY: clientY - rect.top, pointerY: clientY, listLeft: listRect?.left ?? rect.left, listWidth: listRect?.width ?? rect.width }
    startListening()
  }, HOLD_MS)
  hold = { timer, x: clientX, y: clientY }
}

function moveHold(event: PointerEvent) {
  if (hold && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > CANCEL_DISTANCE) cancelHold()
}

function onClickCapture(event: MouseEvent) {
  if (!suppressClick) return
  event.preventDefault()
  event.stopPropagation()
}

function onContextMenu(event: MouseEvent) {
  if (hold || drag.value) event.preventDefault()
}

onBeforeUnmount(() => {
  cancelHold()
  stopListening()
})
</script>

<template>
  <div ref="container" class="flex shrink-0 flex-col gap-px" :class="drag && 'select-none'">
    <template v-for="list in shown" :key="list.id">
      <div v-if="list.before" :data-reorder-boundary="list.id">
        <slot name="before" :list-id="list.id" />
      </div>
      <div
        v-for="id in list.shownIds"
        :key="id"
        :data-reorder-id="id"
        :data-reorder-list="list.id"
        class="shrink-0"
        :class="drag?.id === id && 'opacity-40'"
        @pointerdown="startHold($event, id)"
        @pointermove="moveHold"
        @pointerup="cancelHold"
        @pointercancel="cancelHold"
        @dragstart.prevent
        @contextmenu="onContextMenu"
        @click.capture="onClickCapture"
      >
        <slot :id="id" name="item" />
      </div>
    </template>
    <Teleport to="body">
      <div v-if="drag && target" aria-hidden="true" class="pointer-events-none fixed z-[300] h-0.5 rounded-full bg-primary" :style="{ left: `${drag.listLeft}px`, width: `${drag.listWidth}px`, top: `${target.lineY - 1}px` }" />
      <div v-if="drag" aria-hidden="true" class="pointer-events-none fixed z-[301] cursor-grabbing overflow-hidden rounded-md bg-default opacity-90 shadow-lg ring-1 ring-default" :style="{ left: `${drag.left}px`, width: `${drag.width}px`, top: `${drag.pointerY - drag.offsetY}px` }">
        <slot :id="drag.id" name="item" />
      </div>
    </Teleport>
  </div>
</template>
