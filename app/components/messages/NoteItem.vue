<script setup lang="ts">
// One note: author, time, the email it is about, and edit or delete for those allowed.
import { confirmDestructive } from '~/utils/confirm-dialog'
import { htmlToPlainText } from '#lib/compose/rich-text-utils'
import type { ConversationNote } from '#lib/notes/types'
import { formatUserDate } from '#lib/time/utils'
import { useConversationNotes } from '~/composables/messages/useConversationNotes'
import { focusEditableEnd, NOTE_DATE_FORMAT } from '~/utils/messages/notes-utils'

const props = defineProps<{ note: ConversationNote }>()
const { t } = useLanguage()
const notes = useConversationNotes()!
const pending = ref(false)
const error = ref<string | null>(null)
const editRef = useTemplateRef<HTMLDivElement>('editRef')
const editing = computed(() => props.note.id in notes.editDrafts.value)
const draft = computed({
  get: () => notes.editDrafts.value[props.note.id] ?? props.note.html,
  set: value => notes.setEditDraft(props.note.id, value),
})
const author = computed(() => props.note.authorName ?? t('note.formerMember'))
const canSave = computed(() => !pending.value && !!htmlToPlainText(draft.value).trim())

// Put the cursor in the editor when edit mode opens, as the new-note box does.
watch(editing, (value, _previous, onCleanup) => {
  if (!value) return
  const timer = setTimeout(() => focusEditableEnd(editRef.value), 0)
  onCleanup(() => clearTimeout(timer))
})

async function save() {
  pending.value = true
  error.value = null
  try {
    await notes.update(props.note.id, draft.value)
  }
  catch {
    error.value = t('note.saveFailed')
  }
  finally {
    pending.value = false
  }
}

async function remove() {
  if (!(await confirmDestructive(t('note.deleteConfirm')))) return
  pending.value = true
  error.value = null
  try {
    await notes.remove(props.note.id)
  }
  catch {
    error.value = t('note.deleteFailed')
    pending.value = false
  }
}

function onEditKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSave.value) {
    event.preventDefault()
    void save()
  }
  else if (event.key === 'Escape' && !pending.value) {
    event.preventDefault()
    notes.setEditDraft(props.note.id, null)
  }
}

function startEdit() {
  notes.setEditDraft(props.note.id, props.note.html)
  error.value = null
}
</script>

<template>
  <li class="group relative flex gap-3 px-3 py-2">
    <MessagesNoteAvatar :note="note" :author="author" />
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-x-2">
        <span class="text-sm font-medium text-amber-950 dark:text-amber-50">{{ author }}</span>
        <span class="ml-auto flex items-center gap-x-2">
          <time :datetime="note.createdAt" class="text-xs text-amber-900/70 dark:text-amber-100/70">{{ formatUserDate(note.createdAt, NOTE_DATE_FORMAT) }}</time>
          <span v-if="note.updatedAt !== note.createdAt" class="text-xs text-amber-900/50 dark:text-amber-100/50">{{ t('note.edited') }}</span>
        </span>
      </div>
      <MessagesNoteEmailChip v-if="note.messageId" :message-id="note.messageId" />
      <div v-if="editing" ref="editRef" class="mt-1" @keydown="onEditKeydown">
        <ComposeRichTextEditor
          :id="`conversation-note-${note.id}`"
          v-model="draft"
          :disabled="pending"
          :placeholder="t('note.placeholder')"
          editable-class="min-h-9 py-2"
          toolbar-class="border-t-0"
        >
          <template #toolbar-end>
            <span class="ml-auto flex items-center gap-2">
              <UButton :label="t('common.cancel')" color="neutral" variant="ghost" size="sm" :disabled="pending" @click="notes.setEditDraft(note.id, null)" />
              <UButton :label="pending ? t('common.saving') : t('note.save')" size="sm" :disabled="!canSave" @click="save" />
            </span>
          </template>
        </ComposeRichTextEditor>
      </div>
      <MessagesEmailHtmlRenderer v-else :html="note.html" dense class="mt-0.5 text-sm" />
      <p v-if="error" role="alert" class="mt-1 text-xs text-error">
        {{ error }}
      </p>
    </div>
    <span
      v-if="!editing && (note.canEdit || note.canDelete)"
      class="absolute right-3 bottom-2 flex gap-0.5 rounded-md bg-amber-50/90 transition-opacity dark:bg-amber-950/90 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
    >
      <UTooltip v-if="note.canEdit" :text="t('note.edit')">
        <UButton icon="i-lucide-pen-line" color="neutral" variant="ghost" size="xs" :disabled="pending" :aria-label="t('note.edit')" @click="startEdit" />
      </UTooltip>
      <UTooltip v-if="note.canDelete" :text="t('note.delete')">
        <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" :disabled="pending" :aria-label="t('note.delete')" @click="remove" />
      </UTooltip>
    </span>
  </li>
</template>
