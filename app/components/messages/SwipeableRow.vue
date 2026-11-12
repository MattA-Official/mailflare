<script setup lang="ts">
// Touch-only swipe gestures; vertical scrolling stays with the browser via touch-action: pan-y.
// Ported from swipeable-row.tsx.
type SwipeAction = {
  label: string
  icon: string
  class: string
  onTrigger: () => void
}

const props = defineProps<{
  /** Revealed when dragging left to right. */
  startAction: SwipeAction
  /** Revealed when dragging right to left. */
  endAction: SwipeAction
  disabled?: boolean
  role?: string
}>()

const COMMIT_DISTANCE = 88
const INTENT_DISTANCE = 10
const offset = ref(0)
const dragging = ref(false)
let gesture: { x: number, y: number, active: boolean, id: number } | null = null
let swiped = false

function onPointerDown(event: PointerEvent) {
  if (props.disabled || event.pointerType === 'mouse') return
  gesture = { x: event.clientX, y: event.clientY, active: false, id: event.pointerId }
  swiped = false
}

function onPointerMove(event: PointerEvent) {
  const current = gesture
  if (!current || current.id !== event.pointerId) return
  const dx = event.clientX - current.x
  const dy = event.clientY - current.y
  if (!current.active) {
    if (Math.abs(dy) > INTENT_DISTANCE && Math.abs(dy) > Math.abs(dx)) {
      gesture = null
      return
    }
    if (Math.abs(dx) < INTENT_DISTANCE) return
    current.active = true
    dragging.value = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }
  offset.value = dx
}

function finish(event: PointerEvent) {
  const current = gesture
  if (!current || current.id !== event.pointerId) return
  gesture = null
  if (!current.active) return
  swiped = true
  dragging.value = false
  const dx = event.clientX - current.x
  offset.value = 0
  if (event.type !== 'pointercancel') {
    if (dx >= COMMIT_DISTANCE) props.startAction.onTrigger()
    else if (dx <= -COMMIT_DISTANCE) props.endAction.onTrigger()
  }
}

function onClickCapture(event: MouseEvent) {
  if (!swiped) return
  swiped = false
  event.preventDefault()
  event.stopPropagation()
}

const action = computed(() => (offset.value > 0 ? props.startAction : offset.value < 0 ? props.endAction : null))
const armed = computed(() => Math.abs(offset.value) >= COMMIT_DISTANCE)
</script>

<template>
  <div :role="role" class="relative overflow-hidden">
    <div
      v-if="action"
      aria-hidden="true"
      class="absolute inset-0 flex items-center px-6 text-white"
      :class="[offset > 0 ? 'justify-start' : 'justify-end', action.class]"
    >
      <span class="flex items-center gap-2 text-sm font-medium transition-transform" :class="armed && 'scale-110'">
        <UIcon :name="action.icon" class="size-5" />
        {{ action.label }}
      </span>
    </div>
    <div
      class="relative bg-default"
      :class="!dragging && 'transition-transform duration-200 ease-out motion-reduce:transition-none'"
      :style="{ transform: offset ? `translateX(${offset}px)` : undefined, touchAction: 'pan-y' }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="finish"
      @pointercancel="finish"
      @click.capture="onClickCapture"
    >
      <slot />
    </div>
  </div>
</template>
