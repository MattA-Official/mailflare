<script setup lang="ts">
// Note icon and count on a list row. Hovering (or focusing) it opens the conversation's notes, the
// same ones as inside the email, and they can be edited, deleted or added to there. Once the cursor
// goes into a note the popover stays until a click outside it or Escape.
// Ported from legacy/src/components/messages/message-notes-popover.tsx.
import type { NoteEmail } from '~/composables/messages/useConversationNotes'

const WIDTH = 380
const GAP = 4
const MARGIN = 8
const OPEN_DELAY = 150
const CLOSE_DELAY = 250
const NO_EMAILS: NoteEmail[] = []

const props = defineProps<{ messageId: string, count?: number, preview?: string }>()
const { t } = useLanguage()
const armed = ref(false)
const open = ref(false)
const pinned = ref(false)
const placement = ref<{ left: number, top?: number, bottom?: number, maxHeight: number, width: number } | null>(null)
const trigger = useTemplateRef<HTMLSpanElement>('trigger')
const content = useTemplateRef<{ panel: HTMLDivElement | null }>('content')
let timer: ReturnType<typeof setTimeout> | null = null
const label = computed(() => t('note.count', { count: props.count ?? 0 }))

function clearTimer() {
  if (timer !== null) clearTimeout(timer)
  timer = null
}
function show() {
  clearTimer()
  timer = setTimeout(() => {
    armed.value = true
    open.value = true
  }, OPEN_DELAY)
}
function hide() {
  clearTimer()
  if (pinned.value) return
  timer = setTimeout(() => { open.value = false }, CLOSE_DELAY)
}
function close() {
  clearTimer()
  pinned.value = false
  open.value = false
}
function toggle() {
  if (open.value) close()
  else {
    armed.value = true
    open.value = true
  }
}
onBeforeUnmount(clearTimer)

function panelElement() {
  return content.value?.panel ?? null
}

function place() {
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect) return
  const width = Math.min(WIDTH, window.innerWidth - MARGIN * 2)
  const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN))
  const below = window.innerHeight - rect.bottom - GAP - MARGIN
  const above = rect.top - GAP - MARGIN
  placement.value = below >= 260 || below >= above
    ? { left, width, top: rect.bottom + GAP, maxHeight: below }
    : { left, width, bottom: window.innerHeight - rect.top + GAP, maxHeight: above }
}

function onPointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (trigger.value?.contains(target) || panelElement()?.contains(target)) return
  close()
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

watch(open, (value, _previous, onCleanup) => {
  if (!value) return
  place()
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', place)
  window.addEventListener('scroll', place, true)
  onCleanup(() => {
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('keydown', onKeydown)
    window.removeEventListener('resize', place)
    window.removeEventListener('scroll', place, true)
  })
}, { flush: 'post' })

function onBlur(event: FocusEvent) {
  if (!panelElement()?.contains(event.relatedTarget as Node | null)) hide()
}
</script>

<template>
  <span
    ref="trigger"
    class="relative z-10 inline-flex"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="onBlur"
    @click.stop
  >
    <MessagesConversationNotesProvider v-if="armed" :message-id="messageId" :emails="NO_EMAILS">
      <MessagesNotesPopoverContent
        ref="content"
        :fallback-count="count ?? 0"
        :fallback-preview="preview"
        :label="label"
        :open="open"
        :placement="placement"
        :panel-label="t('note.title')"
        @toggle="toggle"
        @empty="close"
        @panel-enter="clearTimer"
        @panel-leave="hide"
        @pin="pinned = true"
      />
    </MessagesConversationNotesProvider>
    <MessagesNotesPopoverTrigger v-else :count="count ?? 0" :label="label" :expanded="false" @toggle="toggle" />
  </span>
</template>
