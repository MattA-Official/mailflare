<script setup lang="ts">
// The author's own profile picture, or their initial when they have none.
import { getAvatarColorStyle } from '#lib/avatar-colors'
import type { ConversationNote } from '#lib/notes/types'
import { useConversationNotes } from '~/composables/messages/useConversationNotes'

const props = defineProps<{ note: ConversationNote, author: string }>()
const { t } = useLanguage()
const notes = useConversationNotes()
const failed = ref(false)
watch(() => props.note.authorId, () => { failed.value = false })
const src = computed(() => notes && props.note.authorId
  ? `/api/messages/${encodeURIComponent(notes.messageId.value)}/notes/avatar/${encodeURIComponent(props.note.authorId)}`
  : null)
</script>

<template>
  <img
    v-if="src && note.authorHasAvatar && !failed"
    :src="src"
    :alt="t('account.profilePicture', { name: author })"
    class="size-6 shrink-0 rounded-full object-cover"
    @error="failed = true"
  >
  <span v-else aria-hidden="true" class="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium" :style="getAvatarColorStyle(author)">
    {{ author.trim().charAt(0).toUpperCase() }}
  </span>
</template>
