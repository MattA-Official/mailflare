<script setup lang="ts">
// Star, reply and the overflow menu beside one message of a conversation.
// Ported from legacy/src/components/messages/thread-message-actions.tsx.
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ThreadMessage } from '~/types/messages'
import { getOwnAddressForMessage } from '~/utils/messages/detail-utils'
import {
  blockMessageContact,
  createForwardDraft,
  createReplyDraft,
  getMoveMessageActions,
  getReplyRecipients,
  getReplyThreading,
  hasAdditionalRecipients,
  runSingleMessageAction,
} from '~/utils/messages/message-actions-utils'
import { toggleMessageStar } from '~/utils/messages/row-actions-utils'
import type { ReplyMode } from '~/utils/messages/types'
import { useConversationNotes } from '~/composables/messages/useConversationNotes'

const props = withDefaults(defineProps<{
  message: ThreadMessage
  mailboxId: string | null
  ownAddress?: string | null
  ownAddresses?: string[]
  starOnly?: boolean
  detailsOpen?: boolean
  showDetailsToggle?: boolean
}>(), { ownAddress: null, ownAddresses: () => [], starOnly: false, detailsOpen: false, showDetailsToggle: false })
const emit = defineEmits<{ toggleDetails: [] }>()
const { t } = useLanguage()
const { openDraftComposer } = useCompose()
const notes = useConversationNotes()
const noteCount = computed(() => notes?.notes.value.filter(note => note.messageId === props.message.id).length ?? 0)
const starred = ref(props.message.starred)
const sourceOpen = ref(false)
const pending = ref(false)
const error = ref<string | null>(null)
watch(() => props.message.starred, (value) => {
  starred.value = value
})

const canReplyAll = computed(() => hasAdditionalRecipients(props.message, props.ownAddresses))
const replyFromAddress = computed(() => (props.ownAddresses.length > 0 ? getOwnAddressForMessage(props.message, props.ownAddresses) : props.ownAddress))

async function run(task: () => Promise<void>, fallbackKey: 'message.error.star' | 'message.error.reply' | 'message.error.forward' | 'message.error.update' | 'message.error.block') {
  pending.value = true
  error.value = null
  try {
    await task()
  }
  catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : t(fallbackKey)
  }
  finally {
    pending.value = false
  }
}

const onToggleStar = () => run(async () => {
  starred.value = (await toggleMessageStar(props.message.id)).starred
}, 'message.error.star')

const onReply = (mode: ReplyMode) => run(async () => {
  const message = props.message
  const draftId = await createReplyDraft({
    mailboxId: props.mailboxId,
    senderAddress: message.fromAddr,
    ownAddress: replyFromAddress.value,
    subject: message.subject,
    bodyText: message.textBody,
    bodyHtml: message.htmlBody,
    sentAt: message.createdAt,
    recipients: getReplyRecipients(message, props.ownAddresses, mode),
    threading: getReplyThreading(message),
  })
  openDraftComposer(draftId)
}, 'message.error.reply')

const onForward = () => run(async () => {
  const message = props.message
  const draftId = await createForwardDraft({ mailboxId: props.mailboxId, ownAddress: replyFromAddress.value, message, bodyText: message.textBody, bodyHtml: message.htmlBody })
  openDraftComposer(draftId)
}, 'message.error.forward')

const onMessageAction = (action: Parameters<typeof runSingleMessageAction>[1]) => run(() => runSingleMessageAction(props.message.id, action), 'message.error.update')

const onBlock = () => run(async () => {
  if (!props.mailboxId) return
  await blockMessageContact({ mailboxId: props.mailboxId, senderAddress: props.message.fromAddr })
  await runSingleMessageAction(props.message.id, 'trash')
}, 'message.error.block')

const menuItems = computed<DropdownMenuItem[][]>(() => {
  const message = props.message
  const first: DropdownMenuItem[] = [
    { label: t('message.reply'), icon: 'i-lucide-reply', onSelect: () => void onReply('reply') },
    ...(canReplyAll.value ? [{ label: t('message.replyAll'), icon: 'i-lucide-reply-all', onSelect: () => void onReply('replyAll') }] : []),
    { label: t('message.forward'), icon: 'i-lucide-forward', onSelect: () => void onForward() },
    { label: t('message.showOriginal'), icon: 'i-lucide-file-code-2', onSelect: () => { sourceOpen.value = true } },
    ...(notes ? [{ label: t('note.add'), icon: 'i-lucide-notebook-pen', onSelect: () => notes.startNote(message.id) }] : []),
  ]
  const second: DropdownMenuItem[] = [
    { label: message.read ? t('common.markUnread') : t('common.markRead'), icon: message.read ? 'i-lucide-mail' : 'i-lucide-mail-open', onSelect: () => void onMessageAction(message.read ? 'unread' : 'read') },
    ...getMoveMessageActions(message.status, message.direction).map(item => ({ label: t(item.labelKey), icon: item.icon, onSelect: () => void onMessageAction(item.action) })),
  ]
  const groups = [first, second]
  if (message.direction === 'inbound' && props.mailboxId) {
    groups.push([{ label: t('message.blockContact'), icon: 'i-lucide-ban', onSelect: () => void onBlock() }])
  }
  return groups
})
</script>

<template>
  <div class="flex items-center gap-0.5">
    <span v-if="error" role="alert" class="mr-1 max-w-32 truncate text-xs text-error" :title="error">{{ error }}</span>
    <UTooltip v-if="showDetailsToggle" :text="t('message.details')">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-info"
        :class="detailsOpen && 'bg-elevated text-highlighted'"
        :aria-label="t('message.details')"
        :aria-expanded="detailsOpen"
        @click="emit('toggleDetails')"
      />
    </UTooltip>
    <UTooltip v-if="notes && noteCount > 0" :text="t('note.count', { count: noteCount })">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-notebook-pen"
        :label="String(noteCount)"
        class="text-xs text-muted"
        :aria-label="t('note.count', { count: noteCount })"
        @click="notes.open.value = true"
      />
    </UTooltip>
    <UTooltip :text="starred ? t('message.removeStar') : t('message.star')">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-star"
        :class="starred && 'text-amber-400 [&_svg]:fill-amber-400'"
        :aria-label="starred ? t('message.removeStar') : t('message.star')"
        :aria-pressed="starred"
        :disabled="pending"
        @click="onToggleStar"
      />
    </UTooltip>
    <template v-if="!starOnly">
      <UTooltip :text="t('message.reply')">
        <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-reply" :aria-label="t('message.reply')" :disabled="pending" @click="onReply('reply')" />
      </UTooltip>
      <UDropdownMenu :items="menuItems" :content="{ align: 'end', collisionPadding: 8 }" :ui="{ content: 'w-56 max-h-96' }">
        <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-ellipsis-vertical" :aria-label="t('common.moreActions')" :title="t('common.moreActions')" :disabled="pending" />
      </UDropdownMenu>
      <MessagesMessageSourceDialog v-model:open="sourceOpen" :message-id="message.id" />
    </template>
  </div>
</template>
