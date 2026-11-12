<script setup lang="ts">
// Names the email a note is about; clicking it scrolls the conversation to that email.
import { formatUserDate } from '#lib/time/utils'
import { useConversationNotes } from '~/composables/messages/useConversationNotes'
import { NOTE_DATE_FORMAT, scrollToNoteEmail } from '~/utils/messages/notes-utils'

const props = defineProps<{ messageId: string, removable?: boolean }>()
const emit = defineEmits<{ remove: [] }>()
const { t } = useLanguage()
const notes = useConversationNotes()
const email = computed(() => notes?.email(props.messageId))
const label = computed(() => {
  const value = email.value
  if (!value) return t('note.aboutAnEmail')
  const date = formatUserDate(value.createdAt, NOTE_DATE_FORMAT)
  return value.recipient ? t('note.aboutEmailTo', { name: value.recipient, date }) : t('note.aboutEmail', { name: value.sender, date })
})
const chipClass = 'inline-flex min-w-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
</script>

<template>
  <span class="mt-1 flex max-w-full items-center gap-1">
    <button v-if="email" type="button" :class="[chipClass, 'transition-colors hover:bg-amber-200/70 active:bg-amber-200 dark:hover:bg-amber-900/60']" @click="scrollToNoteEmail(messageId)">
      <UIcon name="i-lucide-mail" class="size-3 shrink-0" aria-hidden="true" />
      <span class="truncate">{{ label }}</span>
    </button>
    <span v-else :class="chipClass">
      <UIcon name="i-lucide-mail" class="size-3 shrink-0" aria-hidden="true" />
      <span class="truncate">{{ label }}</span>
    </span>
    <UButton
      v-if="removable"
      icon="i-lucide-x"
      color="neutral"
      variant="ghost"
      size="xs"
      class="rounded-full p-0.5"
      :aria-label="t('note.detach')"
      @click="emit('remove')"
    />
  </span>
</template>
