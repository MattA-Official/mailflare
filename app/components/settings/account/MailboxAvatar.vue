<script setup lang="ts">
// A mailbox picture, falling back to its initial on the address colour.
// Ported from InboxAvatar in legacy/src/components/settings/inbox-switcher.tsx.
import { getAvatarColorStyle } from '#lib/avatar-colors'
import { getMailboxAddress } from '~/utils/settings/account/mailbox'

const props = defineProps<{
  mailbox: { id: string, localPart: string, hostname: string, displayName: string | null, hasAvatar?: boolean }
}>()

const failedId = ref<string | null>(null)
const name = computed(() => props.mailbox.displayName ?? props.mailbox.localPart)
const initial = computed(() => name.value.trim().slice(0, 1).toUpperCase() || 'M')
</script>

<template>
  <img
    v-if="mailbox.hasAvatar && failedId !== mailbox.id"
    :src="`/api/mailboxes/${mailbox.id}/avatar`"
    :alt="name"
    class="size-10 shrink-0 rounded-full border border-default object-cover"
    @error="failedId = mailbox.id"
  >
  <div
    v-else
    class="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
    :style="getAvatarColorStyle(getMailboxAddress(mailbox))"
    aria-hidden="true"
  >
    {{ initial }}
  </div>
</template>
