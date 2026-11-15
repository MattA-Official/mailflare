<script setup lang="ts">
// The author's own profile picture, or their initial when they have none.
import { getAvatarColorStyle } from '#lib/avatar-colors'
import type { ConversationNote } from '#lib/notes/types'
import { useConversationNotes } from '~/composables/messages/useConversationNotes'

const props = defineProps<{ note: ConversationNote, author: string }>()
const { t } = useLanguage()
const notes = useConversationNotes()
const src = computed(() => notes && props.note.authorId
  ? `/api/messages/${encodeURIComponent(notes.messageId.value)}/notes/avatar/${encodeURIComponent(props.note.authorId)}`
  : null)
</script>

<template>
  <UAvatar
    :src="src && note.authorHasAvatar ? src : undefined"
    :alt="t('account.profilePicture', { name: author })"
    :text="author.trim().charAt(0).toUpperCase()"
    size="xs"
    :style="getAvatarColorStyle(author)"
    :ui="{ fallback: 'text-inherit' }"
  />
</template>
