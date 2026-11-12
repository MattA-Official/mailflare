<script setup lang="ts">
// The reader for one message, its conversation around it, attachments and actions.
// Ported from legacy/src/app/(dashboard)/inbox/[messageId]/page.tsx, which every folder's
// [messageId] route reuses.
import { getEmailAddress, splitEmailAddressList } from '#lib/email/address'
import { formatUserDate } from '#lib/time/utils'
import { formatScheduledSendTime } from '~/utils/compose/schedule-send-utils'
import { useAssistantOpenState, useMessageDetailNavigationContext, useMessageListState, useMessageListVisibility } from '~/composables/messages/useMessageListContext'
import { useLatestMessagesFirst } from '~/composables/messages/useLatestMessagesFirst'
import { useMessageThread } from '~/composables/messages/useMessageThread'
import { useRemoteContent } from '~/composables/messages/useRemoteContent'
import { useSendViewStatus } from '~/composables/messages/useSendViewStatus'
import { useMailingListBanner } from '~/composables/messages/useMailingListBanner'
import { findInviteAttachment } from '#lib/calendar/invite-attachment'
import { useShowFullRecipientAddresses } from '~/composables/messages/useShowFullRecipientAddresses'
import { extractCloudAttachments } from '~/utils/messages/cloud-attachment-utils'
import {
  fetchMessageDetail,
  fetchMessageMetadata,
  getCachedMessageDetailForDisplay,
  getMessageBodyDisplay,
  getMessageHeaderParties,
  getOwnAddressForMessage,
  resolveInlineAttachmentUrls,
} from '~/utils/messages/detail-utils'
import { markMessageRead } from '~/utils/messages/mark-read'
import { authFetch } from '~/utils/auth-client'
import type { MessageAttachment, MessageDetailResponse } from '~/utils/messages/types'

const props = defineProps<{ messageId: string }>()
const { t } = useLanguage()
const { selectedMailbox, mailboxes } = useSelectedMailbox()
const data = shallowRef<MessageDetailResponse | null>(null)
useSendViewStatus(() => props.messageId, () => data.value?.scheduledAt)
const { dismissed: unsubBannerDismissed, dismiss: dismissUnsubBanner } = useMailingListBanner(() => props.messageId)
const loading = ref(true)
const bodyPending = ref(false)
const bodyError = ref(false)
const previewAttachment = shallowRef<MessageAttachment | null>(null)
const previewOpen = ref(false)
const threadExpanded = ref(false)
const detailsOpen = ref(false)
const [latestMessagesFirst] = useLatestMessagesFirst()
const { enabled: showFullRecipientAddresses } = useShowFullRecipientAddresses()
const visibility = useMessageListVisibility()
const assistantVisible = useAssistantOpenState()
const listState = useMessageListState()
const navigationContext = useMessageDetailNavigationContext()
const anyPanelVisible = computed(() => visibility.value.visible || assistantVisible.value)

const message = computed(() => data.value?.message)
const remote = useRemoteContent(() => (message.value ? getEmailAddress(message.value.fromAddr) : undefined), () => message.value?.status === 'spam')
const thread = useMessageThread(() => props.messageId, () => message.value?.threadId)

/** A prefetched body may predate the read flip. */
function keepRead(full: MessageDetailResponse): MessageDetailResponse {
  if (data.value?.message?.read && full.message) return { ...full, message: { ...full.message, read: true } }
  return full
}

async function loadBody(id: string, isCurrent: () => boolean) {
  bodyPending.value = true
  bodyError.value = false
  try {
    const full = await fetchMessageDetail(id, true)
    if (!isCurrent()) return
    data.value = keepRead(full)
    bodyPending.value = false
  }
  catch {
    if (!isCurrent()) return
    bodyPending.value = false
    bodyError.value = true
  }
}

watch(() => props.messageId, async (id, _previous, onCleanup) => {
  let cancelled = false
  onCleanup(() => {
    cancelled = true
  })
  const isCurrent = () => !cancelled
  threadExpanded.value = false
  detailsOpen.value = false
  previewOpen.value = false
  bodyError.value = false
  const cached = getCachedMessageDetailForDisplay(id)
  if (cached?.message) {
    data.value = cached
    loading.value = false
    if (!cached.message.read) void markMessageRead(cached.message.id)
    if (cached.body) {
      bodyPending.value = false
      if (cached.attachments !== undefined) return
      try {
        const metadata = await fetchMessageMetadata(id)
        if (isCurrent() && data.value) data.value = { ...data.value, ...metadata }
      }
      catch { /* Metadata is optional. */ }
      return
    }
    await loadBody(id, isCurrent)
    return
  }
  data.value = null
  loading.value = true
  bodyPending.value = false
  const next = await fetchMessageDetail(id).catch(() => fetchMessageDetail(id)).catch(() => ({ error: t('message.notFound') }) as MessageDetailResponse)
  if (!isCurrent()) return
  data.value = next
  loading.value = false
  if (next.message && !next.message.read) void markMessageRead(next.message.id)
}, { immediate: true })

// A bulk read/unread action can include the message that is already open. Keep the reader in sync
// with the cache instead of reloading it.
function syncCachedReadState() {
  const cached = getCachedMessageDetailForDisplay(props.messageId)
  const current = data.value
  if (!cached?.message || !current?.message || current.message.read === cached.message.read) return
  data.value = { ...current, message: { ...current.message, read: cached.message.read } }
}
onMounted(() => window.addEventListener('mailflare:messages-changed', syncCachedReadState))
onBeforeUnmount(() => window.removeEventListener('mailflare:messages-changed', syncCachedReadState))

const body = computed(() => data.value?.body)
const attachments = computed(() => data.value?.attachments ?? [])
const scheduledAt = computed(() => data.value?.scheduledAt ?? null)
const messageMailbox = computed(() => mailboxes.value.find(mailbox => mailbox.id === message.value?.mailboxId) ?? selectedMailbox.value)
const currentAccountName = computed(() => messageMailbox.value?.displayName ?? messageMailbox.value?.localPart)
const headerParties = computed(() => (message.value ? getMessageHeaderParties(message.value, currentAccountName.value ?? undefined) : null))
const fromName = computed(() => headerParties.value?.fromName ?? '')
const fromAddress = computed(() => headerParties.value?.fromAddress ?? '')
const canUnsubscribe = computed(() => message.value?.direction === 'inbound' && message.value.status !== 'spam' && !!message.value.hasUnsubscribe)
const ownAddresses = computed(() => {
  const mailbox = messageMailbox.value
  if (!mailbox) return []
  return mailbox.senderAddresses?.length ? mailbox.senderAddresses : [`${mailbox.localPart}@${mailbox.hostname}`]
})
const ownAddress = computed(() => (message.value ? getOwnAddressForMessage(message.value, ownAddresses.value) : ''))
const bodyDisplay = computed(() => getMessageBodyDisplay(body.value?.textBody, body.value?.htmlBody, message.value?.snippet, ownAddress.value))
const htmlBody = computed(() => resolveInlineAttachmentUrls(bodyDisplay.value.htmlBody, message.value?.id ?? '', attachments.value))
const quotedHtml = computed(() => resolveInlineAttachmentUrls(bodyDisplay.value.quotedHtml, message.value?.id ?? '', attachments.value))
const cloudAttachmentResult = computed(() => extractCloudAttachments(bodyDisplay.value.latestContent))
const currentThreadMessage = computed(() => (message.value
  ? { ...message.value, textBody: body.value?.textBody ?? null, htmlBody: body.value?.htmlBody ?? null, attachments: attachments.value }
  : null))
const toEntries = computed(() => splitEmailAddressList(message.value?.toAddr))
const ccEntries = computed(() => splitEmailAddressList(message.value?.ccAddr))
const bccEntries = computed(() => splitEmailAddressList(message.value?.bccAddr))
const recipientStyle = computed(() => (showFullRecipientAddresses.value ? 'full' : 'address'))
const starOnly = computed(() => !thread.messages.value.some(item => item.id === message.value?.id) || !thread.messages.value.some(item => item.id !== message.value?.id))
const subject = computed(() => message.value?.subject ?? t('list.noSubject'))

function messageDate(withTime: boolean) {
  if (scheduledAt.value) return formatScheduledSendTime(scheduledAt.value, t)
  if (!message.value) return ''
  return formatUserDate(message.value.createdAt, withTime
    ? { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { month: 'short', day: '2-digit', year: 'numeric' })
}

async function retryBody() {
  await loadBody(props.messageId, () => true)
}

// Every attachment as one ZIP. A flagged attachment answers 409 until the user confirms.
async function downloadAllAttachments(messageId: string) {
  const url = `/api/messages/${messageId}/attachments.zip`
  try {
    const response = await authFetch(url, { method: 'HEAD' })
    if (response.status === 409 && !window.confirm(t('attachment.downloadAllFlagged'))) return
    window.location.assign(response.status === 409 ? `${url}?acknowledge=1` : url)
  }
  catch {
    window.location.assign(url)
  }
}

function openPreview(attachment: MessageAttachment) {
  previewAttachment.value = attachment
  previewOpen.value = true
}

function onRescheduled(next: string) {
  if (data.value) data.value = { ...data.value, scheduledAt: next }
}

useHead({ title: () => (message.value ? subject.value : t('common.loading')) })
</script>

<template>
  <UDashboardPanel id="message-reader" :ui="{ body: 'p-0 sm:p-0 gap-0' }">
    <template #header>
      <UDashboardNavbar :ui="{ left: 'min-w-0 flex-1 gap-3', root: 'gap-3 px-2 sm:px-2' }" :toggle="false">
        <template #left>
          <MessagesReadingHeaderButton :assistant-visible="assistantVisible" />
          <template v-if="message && data">
            <MessagesMessageActions
              :message-id="message.id"
              :mailbox-id="message.mailboxId"
              :sender-address="message.fromAddr"
              :direction="message.direction"
              :status="message.status"
              :read="message.read"
              :unsubscribe-url="data.unsubscribeUrl ?? data.unsubscribeViaBody"
              :subject="message.subject"
              :body-text="body?.textBody"
              :own-address="ownAddress"
              :own-addresses="ownAddresses"
              :message="message"
              :message-meta="message"
              :body-html="body?.htmlBody"
            />
            <MessagesDetailNavigation :message-id="message.id" :unread="message.direction === 'inbound' && !message.read" />
          </template>
        </template>
      </UDashboardNavbar>
      <MessagesBulkActionBar
        v-if="listState && navigationContext?.showBulkBar.value"
        :folder="navigationContext.bulkFolder.value"
        :selected-messages="listState.selectedMessages.value"
        @clear-selection="listState.selectedMessages.value = []"
      />
    </template>

    <template #body>
      <div v-if="loading" class="h-full space-y-6 p-6">
        <USkeleton class="h-8 w-3/5" />
        <div class="flex items-start gap-3 border-b border-default pb-5">
          <USkeleton class="size-10 rounded-full" />
          <div class="flex-1 space-y-2">
            <USkeleton class="h-4 w-48" />
            <USkeleton class="h-3 w-32" />
          </div>
          <USkeleton class="h-3 w-28" />
        </div>
        <div class="space-y-3">
          <USkeleton class="h-4 w-full" />
          <USkeleton class="h-4 w-11/12" />
          <USkeleton class="h-4 w-4/5" />
          <USkeleton class="h-4 w-5/6" />
        </div>
      </div>

      <p v-else-if="!message" class="px-6 py-4 text-sm text-muted">{{ data?.error ?? t('message.notFound') }}</p>

      <div v-else>
        <h1 class="px-4 pb-2 pt-2 text-2xl text-highlighted sm:pr-6" :class="!anyPanelVisible ? 'sm:pl-16' : 'sm:pl-10'" :title="subject">{{ subject }}</h1>

        <MessagesConversationThread
          v-model:expanded-all="threadExpanded"
          :current-message-id="message.id"
          :position="latestMessagesFirst ? 'after' : 'before'"
          :messages="thread.messages.value"
          :mailbox-id="message.mailboxId"
          :current-account-name="currentAccountName ?? undefined"
          :own-address="ownAddress"
          :own-addresses="ownAddresses"
          :latest-messages-first="latestMessagesFirst"
          :show-full-recipient-addresses="showFullRecipientAddresses"
        />

        <article class="py-4 sm:px-6" :class="!anyPanelVisible && 'sm:pl-12'">
          <div class="w-full">
            <MessagesMailingListBanner v-if="canUnsubscribe && !unsubBannerDismissed" :message-id="message.id" @dismiss="dismissUnsubBanner" />
            <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-4 pb-5 sm:px-0 sm:pl-4">
              <div class="flex min-w-0 items-start gap-3">
                <ContactsContactAvatar
                  :mailbox-id="message.mailboxId"
                  :address="message.fromAddr"
                  :name="fromName"
                  :has-managed-avatar="message.direction === 'inbound'"
                  :managed-avatar-url="message.direction === 'outbound' && message.mailboxId ? `/api/mailboxes/${message.mailboxId}/avatar` : undefined"
                  class="mt-2"
                />
                <div class="min-w-0 flex-1">
                  <p class="mt-1.25 flex w-full flex-row items-center gap-1 overflow-hidden text-sm text-highlighted">
                    <b class="whitespace-nowrap">
                      <ContactsContactDetailsTrigger v-if="message.direction === 'inbound'" :mailbox-id="message.mailboxId" :address="message.fromAddr" :name="fromName" />
                      <template v-else>{{ fromName }}</template>
                    </b>
                    <span class="hidden min-w-0 flex-1 overflow-hidden text-ellipsis text-xs text-muted sm:block">&lt;{{ fromAddress }}&gt;</span>
                    <MessagesUnsubscribeButton
                      v-if="canUnsubscribe && unsubBannerDismissed"
                      :key="message.id"
                      :message-id="message.id"
                    />
                  </p>
                  <p class="text-xs text-muted">
                    {{ t('source.to').toLowerCase() }}
                    <MessagesRecipientList :entries="toEntries" :mailbox-id="message.mailboxId" :address-style="recipientStyle" />
                  </p>
                  <div class="flex items-center gap-2 text-xs text-muted sm:hidden">
                    <span>{{ messageDate(false) }}</span>
                  </div>
                  <p v-if="ccEntries.length > 0" class="text-xs text-muted">
                    {{ t('message.cc') }} <MessagesRecipientList :entries="ccEntries" :mailbox-id="message.mailboxId" :address-style="recipientStyle" />
                  </p>
                  <p v-if="bccEntries.length > 0" class="text-xs text-muted">
                    {{ t('message.bcc') }} <MessagesRecipientList :entries="bccEntries" :mailbox-id="message.mailboxId" :address-style="recipientStyle" />
                  </p>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <p class="hidden text-xs sm:block">{{ messageDate(true) }}</p>
                <MessagesThreadMessageActions
                  v-if="currentThreadMessage"
                  :message="currentThreadMessage"
                  :mailbox-id="message.mailboxId"
                  :own-address="ownAddress"
                  :own-addresses="ownAddresses"
                  :star-only="starOnly"
                  :details-open="detailsOpen"
                  show-details-toggle
                  @toggle-details="detailsOpen = !detailsOpen"
                />
              </div>
            </div>

            <div class="mb-4 px-4 sm:px-0 sm:pl-4 sm:pr-4">
              <MessagesSenderCheckNotice :message="message" :details-open="detailsOpen" announce @view-details="detailsOpen = !detailsOpen" />
            </div>
            <div v-if="detailsOpen" class="mb-4 px-4 sm:px-0 sm:pl-4 sm:pr-4">
              <MessagesMessageDetailsPanel :message="message" closable @close="detailsOpen = false" />
            </div>
            <div v-if="scheduledAt" class="px-4 sm:px-0 sm:pl-10">
              <MessagesScheduledSendBanner :message-id="message.id" :scheduled-at="scheduledAt" @rescheduled="onRescheduled" />
            </div>

            <div class="max-w-none px-4 text-highlighted sm:px-0 sm:pl-16">
              <div v-if="bodyError" role="alert" class="rounded-lg border border-default bg-elevated p-4">
                <p class="text-sm text-toned">{{ t('source.loadFailed') }}</p>
                <UButton color="neutral" variant="outline" size="sm" class="mt-3" :label="t('webhooks.retry')" @click="retryBody" />
              </div>
              <div v-else-if="bodyPending" aria-busy="true" :aria-label="t('common.loading')" class="space-y-3">
                <USkeleton class="h-4 w-full" />
                <USkeleton class="h-4 w-11/12" />
                <USkeleton class="h-4 w-4/5" />
                <USkeleton class="h-4 w-5/6" />
              </div>
              <MessagesEmailHtmlRenderer
                v-else-if="htmlBody"
                :key="message.id"
                class="mx-auto"
                :html="htmlBody"
                :auto-allow-remote="remote.autoAllow.value"
                @allow-remote="remote.allowSender"
              />
              <pre v-else class="mx-auto whitespace-pre-wrap font-sans text-sm">{{ cloudAttachmentResult.content }}</pre>
              <MessagesQuotedEmailToggle v-if="quotedHtml" :html="quotedHtml" :auto-allow-remote="remote.autoAllow.value" @allow-remote="remote.allowSender" />
              <MessagesPreviousMessage
                v-for="quoted in bodyDisplay.quotedContent"
                :key="`${quoted.dateLine}-${quoted.content.slice(0, 24)}`"
                :message="quoted"
              />
            </div>

            <section v-if="cloudAttachmentResult.attachments.length > 0" class="mt-8 border-t border-default px-4 py-6 sm:px-0 sm:pl-16">
              <h2 class="mb-3 text-sm font-semibold text-highlighted">{{ t('message.cloudFiles', { count: cloudAttachmentResult.attachments.length }) }}</h2>
              <div class="grid gap-2 sm:grid-cols-2">
                <a
                  v-for="attachment in cloudAttachmentResult.attachments"
                  :key="attachment.id"
                  :href="attachment.url"
                  target="_blank"
                  rel="noreferrer"
                  class="flex items-center gap-3 rounded-lg border border-default p-3 text-left hover:border-primary/40 hover:bg-primary/5"
                >
                  <UIcon name="i-lucide-cloud" class="size-5 shrink-0 text-primary" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium text-highlighted">{{ attachment.filename }}</span>
                    <span class="block text-xs text-muted">{{ t('message.openFrom', { provider: attachment.provider }) }}</span>
                  </span>
                  <UIcon name="i-lucide-external-link" class="size-4 shrink-0 text-dimmed" aria-hidden="true" />
                  <span class="sr-only"> ({{ t('common.opensInNewTab') }})</span>
                </a>
              </div>
            </section>

            <MessagesInviteCard :message-id="message.id" :has-calendar-attachment="!!findInviteAttachment(attachments)" />

            <section v-if="attachments.length > 0" class="mt-8 border-t border-default px-4 py-6 sm:px-0 sm:pl-16">
              <div class="mb-3 flex items-center justify-between gap-3">
                <h2 class="text-sm font-semibold text-highlighted">{{ t('message.attachments', { count: attachments.length }) }}</h2>
                <UButton
                  icon="i-lucide-arrow-down-to-line"
                  :label="t('attachment.downloadAll')"
                  variant="link"
                  size="xs"
                  class="shrink-0"
                  @click="downloadAllAttachments(message.id)"
                />
              </div>
              <div class="grid gap-2 sm:grid-cols-2">
                <MessagesAttachmentCard v-for="attachment in attachments" :key="attachment.id" :attachment="attachment" :message-id="message.id" @preview="openPreview" />
              </div>
            </section>
          </div>
        </article>

        <MessagesConversationThread
          v-model:expanded-all="threadExpanded"
          :current-message-id="message.id"
          :position="latestMessagesFirst ? 'before' : 'after'"
          :messages="thread.messages.value"
          :mailbox-id="message.mailboxId"
          :current-account-name="currentAccountName ?? undefined"
          :own-address="ownAddress"
          :own-addresses="ownAddresses"
          :latest-messages-first="latestMessagesFirst"
          :show-full-recipient-addresses="showFullRecipientAddresses"
        />
        <MessagesAttachmentViewer v-model:open="previewOpen" :attachment="previewAttachment" :message-id="message.id" />
      </div>
    </template>
  </UDashboardPanel>
</template>
