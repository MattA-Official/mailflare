<script setup lang="ts">
// Gives its slot the notes of one conversation. A different conversation key starts from fresh
// state, as upstream's provider keyed by the thread does.
import { provideConversationNotes, type NoteEmail } from '~/composables/messages/useConversationNotes'

const props = defineProps<{
  /** Any message of the conversation; the notes are those of its thread. */
  messageId: string
  /** The emails of the conversation that are on screen. */
  emails: NoteEmail[]
  /** The conversation's thread key; moving to another email of the same conversation keeps the panel and drafts. */
  conversationKey?: string | null
}>()

provideConversationNotes(() => props.messageId, () => props.emails, () => props.conversationKey ?? props.messageId)
</script>

<template>
  <slot />
</template>
