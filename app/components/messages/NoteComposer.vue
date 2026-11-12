<script setup lang="ts">
// The box to write a note. It starts as one line and shows its toolbar once focused or filled.
import { htmlToPlainText } from '#lib/compose/rich-text-utils'
import { useConversationNotes } from '~/composables/messages/useConversationNotes'

const { t } = useLanguage()
const notes = useConversationNotes()!
const failed = ref(false)
const focused = ref(false)
const container = useTemplateRef<HTMLDivElement>('container')
const empty = computed(() => !htmlToPlainText(notes.draft.value).trim())
const active = computed(() => focused.value || !empty.value)

watch(notes.focusRequest, (request, _previous, onCleanup) => {
  if (request === 0) return
  // A menu that opened the box gives focus back to its trigger when it closes; focus after it.
  const timer = setTimeout(() => {
    container.value?.querySelector<HTMLElement>('[contenteditable=\'true\']')?.focus()
    notes.focusRequest.value = 0
  }, 0)
  onCleanup(() => clearTimeout(timer))
}, { immediate: true })

async function submit() {
  if (empty.value || notes.adding.value) return
  failed.value = false
  try {
    await notes.add(notes.draft.value)
  }
  catch {
    failed.value = true
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    void submit()
  }
}

function onFocusOut(event: FocusEvent) {
  if (!container.value?.contains(event.relatedTarget as Node | null)) focused.value = false
}
</script>

<template>
  <div ref="container" class="border-t border-amber-200/70 p-2 px-3 dark:border-amber-800/60" @keydown="onKeydown" @focusin="focused = true" @focusout="onFocusOut">
    <div v-if="notes.attachTo.value" class="mt-3 mb-2">
      <MessagesNoteEmailChip :message-id="notes.attachTo.value" removable @remove="notes.attachTo.value = null" />
    </div>
    <ComposeRichTextEditor
      id="conversation-note-new"
      v-model="notes.draft.value"
      :disabled="notes.adding.value"
      :placeholder="t('note.placeholder')"
      editable-class="min-h-9 py-2"
      :toolbar-visible="active"
      toolbar-class="border-t-0"
    >
      <template #toolbar-end>
        <span class="ml-auto flex items-center gap-2">
          <span v-if="failed" role="alert" class="text-xs text-error">{{ t('note.saveFailed') }}</span>
          <UButton
            v-if="!empty || notes.adding.value"
            :label="notes.adding.value ? t('common.saving') : t('note.add')"
            size="sm"
            :disabled="notes.adding.value || empty"
            @click="submit"
          />
        </span>
      </template>
    </ComposeRichTextEditor>
  </div>
</template>
