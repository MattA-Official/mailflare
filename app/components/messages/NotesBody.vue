<script setup lang="ts">
// The notes of the conversation and the box to add one, without the box around them. `bare` drops
// the top rule for a container that has no header above it.
import { useConversationNotes } from '~/composables/messages/useConversationNotes'

defineProps<{ bare?: boolean }>()
const notes = useConversationNotes()
</script>

<template>
  <div v-if="notes">
    <ul v-if="notes.notes.value.length > 0" class="divide-y divide-amber-200/70 dark:divide-amber-800/60" :class="!bare && 'border-t border-amber-200/70 dark:border-amber-800/60'">
      <MessagesNoteItem v-for="note in notes.notes.value" :key="note.id" :note="note" />
    </ul>
    <MessagesNoteComposer />
  </div>
</template>
