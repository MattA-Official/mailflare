<script setup lang="ts">
// The trigger and panel of a list row's notes popover, inside the row's notes provider.
import { useConversationNotes } from '~/composables/messages/useConversationNotes'

const props = defineProps<{
  fallbackCount: number
  fallbackPreview?: string
  label: string
  panelLabel: string
  open: boolean
  placement: { left: number, top?: number, bottom?: number, maxHeight: number, width: number } | null
}>()
const emit = defineEmits<{ toggle: [], empty: [], panelEnter: [], panelLeave: [], pin: [] }>()
const notes = useConversationNotes()
const panel = useTemplateRef<HTMLDivElement>('panel')
const count = computed(() => (notes && !notes.loading.value ? notes.notes.value.length : props.fallbackCount))
const empty = computed(() => !!notes && !notes.loading.value && notes.notes.value.length === 0)
watch(empty, (value) => {
  if (value) emit('empty')
}, { immediate: true })

defineExpose({ panel })
</script>

<template>
  <MessagesNotesPopoverTrigger :count="count" :label="label" :expanded="open" @toggle="emit('toggle')" />
  <Teleport to="body">
    <div
      v-if="open"
      ref="panel"
      role="dialog"
      :aria-label="panelLabel"
      class="fixed z-100 flex flex-col overflow-hidden rounded-lg border border-amber-200 bg-amber-50 text-left text-sm font-normal shadow-lg dark:border-amber-800/60 dark:bg-amber-950"
      :style="{
        left: `${placement?.left ?? 0}px`,
        top: placement?.top !== undefined ? `${placement.top}px` : undefined,
        bottom: placement?.bottom !== undefined ? `${placement.bottom}px` : undefined,
        width: `${placement?.width ?? 380}px`,
        maxHeight: placement ? `${placement.maxHeight}px` : undefined,
        visibility: placement ? 'visible' : 'hidden',
      }"
      @mouseenter="emit('panelEnter')"
      @mouseleave="emit('panelLeave')"
      @focusin="emit('pin')"
    >
      <div class="min-h-0 overflow-y-auto">
        <p v-if="!notes || notes.loading.value" class="px-3 py-2 text-xs whitespace-pre-line text-amber-900/80 dark:text-amber-100/80">
          {{ fallbackPreview }}
        </p>
        <MessagesNotesBody v-else bare />
      </div>
    </div>
  </Teleport>
</template>
