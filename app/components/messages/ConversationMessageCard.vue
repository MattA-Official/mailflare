<script setup lang="ts">
// One message of a conversation: a summary row that expands to the full message.
// Ported from ConversationMessageCard in legacy/src/components/messages/conversation-thread.tsx.
import { formatUserDate } from '#lib/time/utils'
import type { ThreadMessage } from '~/types/messages'
import { useRemoteContent } from '~/composables/messages/useRemoteContent'
import { getConversationRecipients, getConversationSender, getConversationSenderEmail } from '~/utils/messages/conversation-thread-utils'
import { getMessageBodyDisplay, resolveInlineAttachmentUrls } from '~/utils/messages/detail-utils'
import { runSingleMessageAction } from '~/utils/messages/message-actions-utils'

const props = withDefaults(defineProps<{
  message: ThreadMessage
  mailboxId: string | null
  currentAccountName?: string
  ownAddress?: string | null
  ownAddresses?: string[]
  defaultExpanded?: boolean
  showFullRecipientAddresses?: boolean
}>(), { currentAccountName: undefined, ownAddress: null, ownAddresses: () => [], defaultExpanded: false, showFullRecipientAddresses: false })
const { t } = useLanguage()
const expanded = ref(props.defaultExpanded)
const locallyRead = ref(props.message.read)
const detailsOpen = ref(false)
watch(() => props.message.read, (value) => {
  locallyRead.value = value
})

// A note chip can point at this email while the card is collapsed.
function reveal(event: Event) {
  if ((event as CustomEvent<string>).detail === props.message.id) expanded.value = true
}
onMounted(() => window.addEventListener('mailflare:reveal-message', reveal))
onBeforeUnmount(() => window.removeEventListener('mailflare:reveal-message', reveal))

const sender = computed(() => getConversationSender(props.message, props.currentAccountName))
const senderEmail = computed(() => getConversationSenderEmail(props.message))
const remote = useRemoteContent(senderEmail, () => props.message.status === 'spam')
const recipients = computed(() => getConversationRecipients(props.message, props.showFullRecipientAddresses ? 'full' : 'address'))
const outbound = computed(() => props.message.direction === 'outbound')
const attachments = computed(() => props.message.attachments.filter(attachment => attachment.disposition === 'attachment'))
const fullDate = computed(() => formatUserDate(props.message.createdAt, { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))
const shortDate = computed(() => formatUserDate(props.message.createdAt, { month: 'short', day: '2-digit', year: 'numeric' }))

const body = computed(() => {
  if (!expanded.value) return null
  const message = props.message
  const display = getMessageBodyDisplay(message.textBody, message.htmlBody, message.snippet)
  return {
    html: resolveInlineAttachmentUrls(display.htmlBody, message.id, message.attachments),
    text: display.latestContent,
    quotedHtml: resolveInlineAttachmentUrls(display.quotedHtml, message.id, message.attachments),
  }
})

function toggle() {
  const shouldExpand = !expanded.value
  expanded.value = shouldExpand
  if (!shouldExpand || locallyRead.value) return
  locallyRead.value = true
  void runSingleMessageAction(props.message.id, 'read').catch(() => {
    locallyRead.value = false
  })
}
</script>

<template>
  <article :data-message-id="message.id" class="bg-default px-3 transition-colors sm:pl-0 sm:pr-6" :class="!expanded && 'hover:bg-elevated/50'">
    <div class="w-full">
      <div class="flex w-full flex-wrap items-start gap-x-3 py-3 sm:pl-[78px]">
        <button type="button" :aria-expanded="expanded" class="flex min-w-0 flex-1 basis-40 cursor-pointer items-center gap-3 text-left" @click="toggle">
          <ContactsContactAvatar
            :mailbox-id="mailboxId"
            :address="message.fromAddr"
            :name="sender"
            :has-managed-avatar="message.fromContactHasAvatar"
            :managed-avatar-url="outbound && mailboxId ? `/api/mailboxes/${mailboxId}/avatar` : undefined"
            class="sm:-ml-12"
            :class="expanded && 'mt-1'"
          />
          <span class="min-w-0 flex-1">
            <span class="flex flex-col">
              <span class="mt-1 truncate text-sm font-semibold text-highlighted">
                {{ sender }}
                <span v-if="expanded" class="ml-1 hidden text-xs font-normal opacity-50 sm:inline">&lt;{{ senderEmail }}&gt;</span>
              </span>
              <span v-if="expanded && recipients" class="text-xs font-normal text-muted">{{ t('thread.to', { recipients }) }}</span>
            </span>
            <span v-if="!expanded" class="block truncate text-[13px]" :class="!locallyRead ? 'font-semibold' : 'text-muted'">{{ message.snippet || t('thread.noPreview') }}</span>
            <MessagesSenderCheckNotice v-if="!expanded" badge :message="message" />
          </span>
        </button>
        <span class="mr-2 mt-2 hidden shrink-0 items-center gap-2 text-xs sm:flex" :class="!locallyRead && 'font-semibold'">
          <UIcon v-if="attachments.length > 0" name="i-lucide-paperclip" class="size-3.5" :aria-label="t('thread.attachmentCount', { count: attachments.length })" />
          {{ fullDate }}
        </span>
        <MessagesThreadMessageActions
          :message="message"
          :mailbox-id="mailboxId"
          :own-address="ownAddress"
          :own-addresses="ownAddresses"
          :star-only="!expanded"
          :details-open="detailsOpen"
          show-details-toggle
          @toggle-details="detailsOpen = !detailsOpen"
        />
        <div class="flex w-full items-center gap-2 pl-12 text-xs sm:hidden" :class="locallyRead ? 'text-muted' : 'font-semibold text-toned'">
          <UIcon v-if="attachments.length > 0" name="i-lucide-paperclip" class="size-3.5" :aria-label="t('thread.attachmentCount', { count: attachments.length })" />
          <span>{{ shortDate }}</span>
        </div>
      </div>
      <MessagesSenderCheckNotice v-if="expanded" :message="message" :details-open="detailsOpen" class="mb-3 sm:ml-[78px]" @view-details="detailsOpen = !detailsOpen" />
      <div v-if="detailsOpen" class="mb-3 sm:pl-[78px]">
        <MessagesMessageDetailsPanel :message="message" closable @close="detailsOpen = false" />
      </div>
      <div v-if="expanded && body" class="pb-4 pt-2 sm:pl-[78px]">
        <MessagesMessageOpenStatus v-if="outbound" :message-id="message.id" />
        <MessagesFollowUpStatus v-if="outbound && message.status !== 'draft'" :message-id="message.id" />
        <MessagesEmailHtmlRenderer v-if="body.html" :html="body.html" :auto-allow-remote="remote.autoAllow.value" @allow-remote="remote.allowSender" />
        <pre v-else class="whitespace-pre-wrap font-sans text-sm text-highlighted">{{ body.text }}</pre>
        <MessagesQuotedEmailToggle v-if="body.quotedHtml" :html="body.quotedHtml" :auto-allow-remote="remote.autoAllow.value" @allow-remote="remote.allowSender" />
        <ul v-if="attachments.length > 0" class="mt-4 flex flex-wrap gap-2">
          <li v-for="attachment in attachments" :key="attachment.id">
            <a
              :href="`/api/messages/${message.id}/attachments/${attachment.id}`"
              class="inline-flex items-center gap-1.5 rounded-md border border-default bg-default px-2.5 py-1 text-xs text-toned hover:bg-elevated"
            >
              <UIcon name="i-lucide-paperclip" class="size-3" />
              <span class="max-w-48 truncate">{{ attachment.filename }}</span>
            </a>
          </li>
        </ul>
      </div>
    </div>
  </article>
</template>
