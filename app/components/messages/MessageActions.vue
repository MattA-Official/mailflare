<script setup lang="ts">
// The reader's toolbar. Actions keep a priority order and the width decides where the overflow
// menu starts. Ported from legacy/src/components/message-actions/message-actions.tsx.
import type { DropdownMenuItem } from '@nuxt/ui'
import type { BulkMessageAction } from '#handlers/api/messages/bulk/types'
import { getPermanentDeleteConfirmText, PartialDeleteError, supportsPermanentDelete } from '#lib/messages/permanent-delete-utils'
import type { Message, MessageDirection } from '~/types/messages'
import { useMessageListVisibility } from '~/composables/messages/useMessageListContext'
import { getVisibleActionCount } from '~/utils/messages/action-overflow-utils'
import {
  blockMessageContact,
  confirmTrashWithoutUnsubscribe,
  createForwardDraft,
  createReplyDraft,
  createTrashSenderRule,
  getMessageActionRedirect,
  getMessageBackHref,
  getMoveMessageActions,
  getReplyRecipients,
  getReplyThreading,
  hasAdditionalRecipients,
  openUnsubscribeUrl,
  runSingleMessageAction,
} from '~/utils/messages/message-actions-utils'
import type { ReplyableMessage, ReplyMode } from '~/utils/messages/types'
import { requestUnsubscribe } from '~/utils/messages/unsubscribe-utils'

const props = withDefaults(defineProps<{
  messageId: string
  mailboxId: string | null
  senderAddress: string
  direction: MessageDirection
  status: string
  read: boolean
  unsubscribeUrl?: string | null
  subject?: string | null
  bodyText?: string | null
  ownAddress?: string | null
  /** Every address the mailbox can send as; used to drop "me" from reply-all. */
  ownAddresses?: string[]
  /** Recipient and threading headers of the message being acted on. */
  message?: ReplyableMessage
  /** Needed by Forward, which quotes the original header block. */
  messageMeta?: Pick<Message, 'id' | 'subject' | 'createdAt'>
  bodyHtml?: string | null
}>(), { unsubscribeUrl: null, subject: null, bodyText: null, ownAddress: null, ownAddresses: () => [], message: undefined, messageMeta: undefined, bodyHtml: null })

type InlineAction = {
  id: string
  label: string
  /** Tooltip variant that names the keyboard shortcut, when shortcuts are on. */
  hint?: string
  icon: string
  onSelect: () => void
  group: 'primary' | 'secondary'
  destructive?: boolean
}

const { t } = useLanguage()
const router = useRouter()
const { openDraftComposer, showNotice } = useCompose()
const visibility = useMessageListVisibility()
const { shortcutsEnabled } = useShortcuts()
const pendingAction = ref<string | null>(null)
const error = ref<string | null>(null)
const visibleCount = ref(0)
const actionsRef = ref<HTMLDivElement | null>(null)
const sourceOpen = ref(false)
const snoozeOpen = ref(false)
const listHref = computed(() => visibility.value.backHref)

async function runAction(action: BulkMessageAction) {
  pendingAction.value = action
  error.value = null
  try {
    await runSingleMessageAction(props.messageId, action)
    const redirect = getMessageActionRedirect(action, listHref.value)
    if (redirect) await router.push(redirect)
  }
  catch {
    error.value = t('actions.error.update')
  }
  finally {
    pendingAction.value = null
  }
}

// In Trash and Spam the delete button removes the message for good, after the user confirms.
const canDeleteForever = computed(() => supportsPermanentDelete(props.status))
async function deleteForever() {
  if (!window.confirm(getPermanentDeleteConfirmText(1, t))) return
  pendingAction.value = 'delete'
  error.value = null
  try {
    await runSingleMessageAction(props.messageId, 'delete')
    await router.push(getMessageBackHref(props.direction, props.status))
    pendingAction.value = null
  }
  catch (deleteError) {
    error.value = deleteError instanceof PartialDeleteError ? t('actions.error.deleteSkipped') : t('actions.error.delete')
    pendingAction.value = null
  }
}

const replyable = computed<ReplyableMessage>(() => props.message ?? {
  direction: props.direction,
  fromAddr: props.senderAddress,
  toAddr: '',
  ccAddr: null,
  replyTo: null,
  providerMessageId: null,
  references: null,
  threadId: null,
})
const canReplyAll = computed(() => hasAdditionalRecipients(replyable.value, props.ownAddresses))

async function handleReply(mode: ReplyMode) {
  pendingAction.value = mode
  error.value = null
  try {
    const draftId = await createReplyDraft({
      mailboxId: props.mailboxId,
      senderAddress: props.senderAddress,
      ownAddress: props.ownAddress,
      subject: props.subject,
      bodyText: props.bodyText,
      bodyHtml: props.bodyHtml,
      sentAt: props.messageMeta?.createdAt,
      recipients: getReplyRecipients(replyable.value, props.ownAddresses, mode),
      threading: getReplyThreading(replyable.value),
    })
    openDraftComposer(draftId)
  }
  catch (replyError) {
    error.value = replyError instanceof Error ? replyError.message : t('message.error.reply')
  }
  finally {
    pendingAction.value = null
  }
}

async function handleForward() {
  if (!props.message || !props.messageMeta) return
  pendingAction.value = 'forward'
  error.value = null
  try {
    const draftId = await createForwardDraft({
      mailboxId: props.mailboxId,
      ownAddress: props.ownAddress,
      message: { ...props.message, ...props.messageMeta },
      bodyText: props.bodyText,
      bodyHtml: props.bodyHtml,
    })
    openDraftComposer(draftId)
  }
  catch (forwardError) {
    error.value = forwardError instanceof Error ? forwardError.message : t('message.error.forward')
  }
  finally {
    pendingAction.value = null
  }
}

async function onUnsubscribe() {
  error.value = null
  if (props.unsubscribeUrl) {
    pendingAction.value = 'unsubscribe'
    try {
      const result = await requestUnsubscribe(props.messageId)
      if (result.method === 'link') {
        openUnsubscribeUrl(result.url)
        showNotice(t('actions.unsubscribeLinkOpened'))
      }
      else if (result.method === 'mailto') {
        showNotice(t('actions.unsubscribeEmailSent'))
      }
      else {
        showNotice(t('actions.unsubscribed'))
      }
    }
    catch {
      openUnsubscribeUrl(props.unsubscribeUrl)
    }
    finally {
      pendingAction.value = null
    }
    return
  }
  if (!confirmTrashWithoutUnsubscribe()) return
  pendingAction.value = 'unsubscribe'
  if (!props.mailboxId) {
    error.value = t('actions.error.trashRule')
    pendingAction.value = null
    return
  }
  try {
    await createTrashSenderRule({ mailboxId: props.mailboxId, senderAddress: props.senderAddress })
    await runAction('trash')
  }
  catch {
    error.value = t('actions.error.trashRule')
    pendingAction.value = null
  }
}

async function onBlockContact() {
  error.value = null
  if (!props.mailboxId) {
    error.value = t('message.error.block')
    return
  }
  pendingAction.value = 'block'
  try {
    await blockMessageContact({ mailboxId: props.mailboxId, senderAddress: props.senderAddress })
    await runSingleMessageAction(props.messageId, 'trash')
    await router.push(listHref.value)
  }
  catch (blockError) {
    error.value = blockError instanceof Error ? blockError.message : t('message.error.block')
  }
  finally {
    pendingAction.value = null
  }
}

async function onUnsubscribeDeleteAll() {
  error.value = null
  pendingAction.value = 'unsubscribe'
  try {
    const preview = await requestUnsubscribe(props.messageId, { action: 'unsubscribe_and_trash', previewOnly: true })
    const count = 'preview' in preview ? preview.preview.count : 0
    if (!window.confirm(t('actions.unsubscribeDeleteConfirm', { count }))) return
    const result = await requestUnsubscribe(props.messageId, { action: 'unsubscribe_and_trash' })
    if (result.method === 'link') openUnsubscribeUrl(result.url)
    showNotice(t('actions.unsubscribeTrashDone', { count: result.trashedCount ?? 0 }))
  }
  catch {
    error.value = t('actions.unsubscribeFailed')
  }
  finally {
    pendingAction.value = null
  }
}

useHotkeys(() => [
  { key: 'e', label: t('shortcut.archiveMessage'), category: 'Actions', action: () => props.status !== 'archived' && void runAction('archive') },
  { key: 'y', label: t('shortcut.archiveMessage'), category: 'Actions', action: () => props.status !== 'archived' && void runAction('archive') },
  { key: '#', label: t('shortcut.moveToTrash'), category: 'Actions', action: () => props.status !== 'trash' && void runAction('trash') },
  { key: 'r', label: t('shortcut.replyToMessage'), category: 'Composing', action: () => void handleReply('reply') },
  { key: '!', label: t('shortcut.reportSpam'), category: 'Actions', action: () => props.status !== 'spam' && props.direction === 'inbound' && void runAction('spam') },
  { key: 'u', label: t('shortcut.backToList'), category: 'Navigation', action: () => router.back() },
], { enabled: shortcutsEnabled })

const disabled = computed(() => pendingAction.value !== null)

const inlineActions = computed<InlineAction[]>(() => {
  const actions: InlineAction[] = []
  const { status, direction, read } = props
  if (status !== 'archived') {
    actions.push({ id: 'archive', label: t('common.archive'), hint: t('actions.archiveHint'), icon: 'i-lucide-archive', onSelect: () => void runAction('archive'), group: 'primary' })
  }
  else if (direction === 'inbound') {
    actions.push({ id: 'unarchive', label: t('common.unarchive'), icon: 'i-lucide-archive-restore', onSelect: () => void runAction('inbox'), group: 'primary' })
  }
  actions.push({
    id: canDeleteForever.value ? 'deleteForever' : 'trash',
    label: canDeleteForever.value ? t('common.deleteForever') : t('actions.moveToTrash'),
    hint: canDeleteForever.value ? undefined : t('actions.moveToTrashHint'),
    icon: 'i-lucide-trash-2',
    onSelect: () => (canDeleteForever.value ? void deleteForever() : void runAction('trash')),
    group: 'primary',
    destructive: canDeleteForever.value,
  })
  actions.push({
    id: read ? 'unread' : 'read',
    label: read ? t('common.markUnread') : t('common.markRead'),
    icon: read ? 'i-lucide-mail' : 'i-lucide-mail-open',
    onSelect: () => void runAction(read ? 'unread' : 'read'),
    group: 'primary',
  })
  actions.push({ id: 'reply', label: t('message.reply'), hint: t('actions.replyHint'), icon: 'i-lucide-reply', onSelect: () => void handleReply('reply'), group: 'secondary' })
  if (direction === 'inbound') {
    actions.push(status === 'spam'
      ? { id: 'notSpam', label: t('common.notSpam'), icon: 'i-lucide-shield-check', onSelect: () => void runAction('inbox'), group: 'secondary' }
      : { id: 'spam', label: t('common.reportSpam'), hint: t('actions.reportSpamHint'), icon: 'i-lucide-shield-alert', onSelect: () => void runAction('spam'), group: 'secondary' })
  }
  if (canReplyAll.value) {
    actions.push({ id: 'replyAll', label: t('message.replyAll'), icon: 'i-lucide-reply-all', onSelect: () => void handleReply('replyAll'), group: 'secondary' })
  }
  if (props.message && props.messageMeta) {
    actions.push({ id: 'forward', label: t('message.forward'), icon: 'i-lucide-forward', onSelect: () => void handleForward(), group: 'secondary' })
  }
  return actions
})

const dividerIndex = computed(() => inlineActions.value.findIndex((action, index) => index > 0 && action.group !== inlineActions.value[index - 1]!.group))
const shownActions = computed(() => inlineActions.value.slice(0, visibleCount.value))
const overflowActions = computed(() => inlineActions.value.slice(visibleCount.value))

function updateVisibleCount() {
  const row = actionsRef.value
  if (!row) return
  const next = getVisibleActionCount({ availableWidth: row.clientWidth, groups: inlineActions.value.map(action => action.group) })
  if (visibleCount.value !== next) visibleCount.value = next
}
let observer: ResizeObserver | null = null
onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !actionsRef.value) return
  observer = new ResizeObserver(updateVisibleCount)
  observer.observe(actionsRef.value)
})
onBeforeUnmount(() => observer?.disconnect())
watch(() => inlineActions.value.map(action => action.id).join(','), () => nextTick(updateVisibleCount), { immediate: true })

const menuItems = computed<DropdownMenuItem[][]>(() => {
  const { direction, status, unsubscribeUrl } = props
  const groups: DropdownMenuItem[][] = []
  if (overflowActions.value.length > 0) {
    groups.push(overflowActions.value.map(action => ({ label: action.label, icon: action.icon, color: action.destructive ? 'error' : undefined, onSelect: action.onSelect })))
  }
  const sender: DropdownMenuItem[] = []
  if (direction === 'inbound' && status === 'received') sender.push({ label: t('common.snooze'), icon: 'i-lucide-clock', onSelect: () => { snoozeOpen.value = true } })
  if (direction === 'inbound') {
    sender.push({ label: t('actions.unsubscribe'), icon: 'i-lucide-bell-off', disabled: !unsubscribeUrl && status === 'trash', onSelect: () => void onUnsubscribe() })
    if (unsubscribeUrl) sender.push({ label: t('actions.unsubscribeDeleteAll'), icon: 'i-lucide-ban', disabled: status === 'trash' || status === 'spam', onSelect: () => void onUnsubscribeDeleteAll() })
    sender.push({ label: t('message.blockContact'), icon: 'i-lucide-ban', onSelect: () => void onBlockContact() })
  }
  if (sender.length) groups.push(sender)
  groups.push([{ label: t('message.showOriginal'), icon: 'i-lucide-file-code-2', onSelect: () => { sourceOpen.value = true } }])
  groups.push([
    { type: 'label', label: t('common.moveTo') },
    ...getMoveMessageActions(status, direction).map(item => ({ label: t(item.labelKey), icon: item.icon, onSelect: () => void runAction(item.action) })),
  ])
  return groups
})
</script>

<template>
  <div class="flex min-w-0 flex-1 items-center gap-2 text-toned">
    <span v-if="error" role="alert" class="text-xs text-error">{{ error }}</span>
    <div ref="actionsRef" class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
      <template v-for="(action, index) in shownActions" :key="action.id">
        <span v-if="index === dividerIndex" class="h-5 w-px shrink-0 bg-accented" aria-hidden="true" />
        <UTooltip :text="action.hint && shortcutsEnabled ? action.hint : action.label">
          <UButton
            :color="action.destructive ? 'error' : 'neutral'"
            variant="ghost"
            size="sm"
            square
            class="size-8 shrink-0 justify-center rounded-full"
            :icon="action.icon"
            :aria-label="action.label"
            :disabled="disabled"
            @click="action.onSelect"
          />
        </UTooltip>
      </template>
      <UDropdownMenu :items="menuItems" :content="{ align: 'end', sideOffset: 6, collisionPadding: 8 }" :ui="{ content: 'w-56 max-h-96' }">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          square
          class="size-8 shrink-0 justify-center rounded-full"
          icon="i-lucide-ellipsis-vertical"
          :aria-label="t('common.moreActions')"
          :title="t('common.moreActions')"
          :disabled="disabled"
        />
      </UDropdownMenu>
    </div>
    <MessagesMessageSourceDialog v-model:open="sourceOpen" :message-id="messageId" />
    <MessagesSnoozeModal v-model:open="snoozeOpen" :message-id="messageId" />
  </div>
</template>
