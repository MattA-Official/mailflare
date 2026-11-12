<script setup lang="ts">
// The other messages in a conversation on one side of the open message, collapsed until opened.
// Readers can expand the hidden middle at once. Ported from conversation-thread.tsx.
import type { ThreadMessage } from '~/types/messages'
import { partitionThread } from '~/utils/messages/conversation-thread-utils'

const props = withDefaults(defineProps<{
  /** The message the reader is viewing; the page renders it, not this list. */
  currentMessageId: string
  position: 'before' | 'after'
  messages: ThreadMessage[]
  mailboxId: string | null
  currentAccountName?: string
  ownAddress?: string | null
  ownAddresses?: string[]
  latestMessagesFirst: boolean
  showFullRecipientAddresses?: boolean
}>(), { currentAccountName: undefined, ownAddress: null, ownAddresses: () => [], showFullRecipientAddresses: false })
const expandedAll = defineModel<boolean>('expandedAll', { default: false })
const { t } = useLanguage()

const slice = computed(() => partitionThread(props.messages, props.currentMessageId, props.position, props.latestMessagesFirst))
const firstMessage = computed(() => slice.value[0])
const lastMessage = computed(() => slice.value.at(-1))
const middleMessages = computed(() => slice.value.slice(1, -1))
const collapsed = computed(() => !expandedAll.value && middleMessages.value.length > 0)
const collapsedLabel = computed(() => t(props.position === 'before' ? 'thread.messagesCollapsed.older' : 'thread.messagesCollapsed.newer', { count: middleMessages.value.length }))
const cardProps = computed(() => ({
  mailboxId: props.mailboxId,
  currentAccountName: props.currentAccountName,
  ownAddress: props.ownAddress,
  ownAddresses: props.ownAddresses,
  showFullRecipientAddresses: props.showFullRecipientAddresses,
}))
</script>

<template>
  <section
    v-if="firstMessage && lastMessage"
    :aria-label="position === 'before' ? t('thread.earlier') : t('thread.later')"
    :class="position === (latestMessagesFirst ? 'before' : 'after') ? 'pb-6' : ''"
  >
    <ol class="border-default" :class="[!collapsed && 'divide-y divide-default/50', latestMessagesFirst ? 'border-t' : 'border-b']">
      <li>
        <MessagesConversationMessageCard :message="firstMessage" v-bind="cardProps" />
      </li>
      <li v-if="collapsed" class="my-4 flex h-px items-center justify-center gap-1 border-y border-default py-2 text-center">
        <span class="flex flex-row items-center gap-2 bg-default px-6">
          <span class="text-sm font-medium text-toned">{{ collapsedLabel }}</span>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-chevrons-up-down"
            class="rounded-full"
            :aria-label="t('thread.expand', { label: collapsedLabel })"
            :title="t('thread.expand', { label: collapsedLabel })"
            @click="expandedAll = true"
          />
        </span>
      </li>
      <template v-else>
        <li v-for="message in middleMessages" :key="message.id">
          <MessagesConversationMessageCard :message="message" v-bind="cardProps" />
        </li>
      </template>
      <li v-if="lastMessage.id !== firstMessage.id">
        <MessagesConversationMessageCard :message="lastMessage" v-bind="cardProps" />
      </li>
    </ol>
  </section>
</template>
