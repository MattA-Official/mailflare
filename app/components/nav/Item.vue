<script setup lang="ts">
// One sidebar row: an icon, a label and an unread count, collapsing to an icon with a tooltip in the
// icon rail. Rows with `onMessageDrop` accept messages dragged from a list (upstream components-nav).
import { getMessageDragData } from '#lib/messages/drag-utils'

const props = defineProps<{
  label: string
  icon: string
  to?: string
  count?: number
  iconColor?: string
  collapsed?: boolean
  /** Active when the route is this path or below it. Defaults to `to`. */
  activePath?: string
  onMessageDrop?: (messageIds: string[]) => void
  onPrefetch?: () => void
}>()
const emit = defineEmits<{ click: [] }>()

const route = useRoute()
const dragOver = ref(false)
const active = computed(() => {
  const path = props.activePath ?? props.to
  return !!path && (route.path === path || route.path.startsWith(`${path}/`))
})
const countLabel = computed(() => (props.count && props.count > 0 ? (props.count > 99 ? '99+' : String(props.count)) : undefined))

function onDragOver(event: DragEvent) {
  if (!props.onMessageDrop) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dragOver.value = true
}

function onDrop(event: DragEvent) {
  dragOver.value = false
  if (!props.onMessageDrop || !event.dataTransfer) return
  const payload = getMessageDragData(event.dataTransfer)
  if (!payload) return
  event.preventDefault()
  props.onMessageDrop(payload.messageIds)
}
</script>

<template>
  <UTooltip :text="label" :disabled="!collapsed" :content="{ side: 'right' }">
    <UButton
      :to="to"
      color="neutral"
      :variant="active ? 'soft' : 'ghost'"
      :square="collapsed"
      block
      :aria-label="collapsed ? label : undefined"
      :aria-current="active ? 'page' : undefined"
      class="relative justify-start"
      :class="[active && 'text-primary font-semibold', dragOver && 'ring-1 ring-primary bg-primary/10', countLabel && 'font-semibold']"
      @click="emit('click')"
      @pointerenter="onPrefetch?.()"
      @focus="onPrefetch?.()"
      @dragover="onDragOver"
      @dragleave="dragOver = false"
      @drop="onDrop"
    >
      <UIcon :name="icon" class="size-5 shrink-0" :style="iconColor ? { color: iconColor } : undefined" />
      <span v-if="!collapsed" class="min-w-0 flex-1 truncate text-left">{{ label }}</span>
      <span v-if="!collapsed && countLabel" class="ms-auto text-xs font-semibold tabular-nums">{{ countLabel }}</span>
      <UChip v-if="collapsed && countLabel" :text="countLabel" size="3xl" standalone inset class="absolute -top-1 -right-1" />
    </UButton>
  </UTooltip>
</template>
