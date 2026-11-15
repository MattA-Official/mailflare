<script setup lang="ts">
// A mailbox picture, falling back to its initial on the address colour.
// Ported from InboxAvatar in legacy/src/components/settings/inbox-switcher.tsx.
import { getAvatarColorStyle } from '#lib/avatar-colors'
import { getMailboxAddress } from '~/utils/settings/account/mailbox'

const props = defineProps<{
  mailbox: { id: string, localPart: string, hostname: string, displayName: string | null, hasAvatar?: boolean }
}>()

const name = computed(() => props.mailbox.displayName ?? props.mailbox.localPart)
const initial = computed(() => name.value.trim().slice(0, 1).toUpperCase() || 'M')
</script>

<template>
  <UAvatar
    :src="mailbox.hasAvatar ? `/api/mailboxes/${mailbox.id}/avatar` : undefined"
    :alt="name"
    :text="initial"
    size="xl"
    :style="getAvatarColorStyle(getMailboxAddress(mailbox))"
    :ui="{ root: 'text-sm', fallback: 'text-inherit font-semibold' }"
  />
</template>
