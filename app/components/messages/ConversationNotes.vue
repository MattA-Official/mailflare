<script setup lang="ts">
// The notes under the subject, in one box. Closed, a conversation with notes shows one line: how
// many, who wrote the last one and when. Opening expands that same box downward to list the notes
// and a box to add another. A note is not a message: it has no reply, forward or move.
// Ported from legacy/src/components/messages/conversation-notes.tsx.
import { formatUserDate } from '#lib/time/utils'
import { useConversationNotes } from '~/composables/messages/useConversationNotes'
import { NOTE_DATE_FORMAT } from '~/utils/messages/notes-utils'

defineProps<{ innerClass?: string }>()
const { t } = useLanguage()
const notes = useConversationNotes()
const section = useTemplateRef<HTMLElement>('section')
const header = useTemplateRef<HTMLButtonElement>('header')
const open = computed(() => notes?.open.value ?? false)
const last = computed(() => notes?.notes.value.at(-1))
const visible = computed(() => open.value || !!last.value)

watch(open, (value, previous) => {
  if (!value || previous) return
  // Focus follows the control that opened the panel; other callers just reveal it.
  if (document.activeElement === header.value) section.value?.focus()
  else section.value?.scrollIntoView({ block: 'nearest' })
}, { flush: 'post' })
</script>

<template>
  <div v-if="notes && !notes.loading.value && visible" class="w-full pb-3">
    <div :inert="!visible" class="notes-row" :style="{ gridTemplateRows: visible ? '1fr' : '0fr' }">
      <div class="min-h-0 overflow-hidden">
        <div :class="innerClass">
          <section
            ref="section"
            tabindex="-1"
            :aria-label="t('note.title')"
            class="overflow-hidden rounded-xl border border-amber-200 bg-amber-50 outline-none dark:border-amber-800/60 dark:bg-amber-950/40"
          >
            <button
              ref="header"
              type="button"
              :aria-expanded="open"
              :aria-label="open ? t('note.collapse') : t('note.count', { count: notes.notes.value.length })"
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-amber-900/80 transition-colors hover:bg-amber-100/70 active:bg-amber-100 dark:text-amber-100/80 dark:hover:bg-amber-900/40"
              @click="notes.open.value = !open"
            >
              <UIcon name="i-lucide-notebook-pen" class="size-3.5 shrink-0" aria-hidden="true" />
              <span class="shrink-0 font-medium text-amber-950 dark:text-amber-50">
                {{ open ? t('note.title') : t('note.count', { count: notes.notes.value.length }) }}
              </span>
              <span v-if="open && notes.notes.value.length > 0" class="shrink-0">{{ notes.notes.value.length }}</span>
              <template v-if="!open && last">
                <span class="min-w-0 truncate">{{ last.authorName ?? t('note.formerMember') }}</span>
                <time :datetime="last.createdAt" class="ml-auto shrink-0">{{ formatUserDate(last.createdAt, NOTE_DATE_FORMAT) }}</time>
              </template>
              <UIcon
                name="i-lucide-chevron-down"
                class="size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none"
                :class="[open && 'ml-auto rotate-180']"
                aria-hidden="true"
              />
            </button>
            <div :inert="!open" class="notes-row" :style="{ gridTemplateRows: open ? '1fr' : '0fr' }">
              <div class="min-h-0 overflow-hidden">
                <MessagesNotesBody />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notes-row {
  display: grid;
  transition: grid-template-rows 200ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .notes-row { transition: none; }
}
</style>
