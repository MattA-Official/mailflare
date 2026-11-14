<script setup lang="ts">
// The composer, ported from legacy/src/components/compose/compose-form.tsx. `mode="popup"` is the
// floating window (a bottom sheet on phones) that <ComposeHost> mounts; `mode="page"` is /compose.
// It autosaves to Drafts, uploads attachments onto the draft, sends with undo, schedules, applies
// templates, toggles read receipts and follow-up reminders, and routes AI drafts through review.
import { formatEmailAddress, getEmailAddress } from '#lib/email/address'
import type { ReviewSnapshot } from '~/types/agent/send-review'
import type { ComposeAttachment, ComposeAttachmentPolicy, ComposeStoredAttachment, ComposeThreading } from '~/types/compose/compose'
import type { SendNoticeParts } from '~/types/compose/notice'
import { buildSendFormData, fetchDraft, formatAttachmentSize } from '~/utils/compose/compose-utils'
import { getCachedComposePreferences, loadComposePreferences } from '~/utils/compose/compose-preferences'
import { followUpOptionKey } from '~/utils/compose/follow-up-utils'
import { useIsPhone } from '~/utils/compose/media'
import { headerToRecipients, isValidRecipient, mergeRecipients, recipientsToHeader } from '~/utils/compose/recipient-utils'
import { applyMailboxSignatureHtml, hasMeaningfulHtml, htmlToPlainText, joinQuotedHtml, splitQuotedHtml, textToHtml } from '~/utils/compose/rich-text-utils'
import { formatScheduledSendTime, isPastSchedule } from '~/utils/compose/schedule-send-utils'
import { DELIVERY_WAIT_MS, SCHEDULED_NOTICE_MS, SENT_NOTICE_MS, resolveSendNotice, splitSendTemplate } from '~/utils/compose/send-notice-utils'
import type { SendResult } from '~/utils/compose/send-notice-utils'
import { getSheetViewportStyle } from '~/utils/compose/sheet-viewport-utils'
import { clearMessageDetailCache } from '~/utils/messages/detail-cache'

const props = withDefaults(defineProps<{
  mode?: 'page' | 'popup'
  draftIdToLoad?: string | null
  /** Recipients a fresh composer starts with, e.g. from the Contacts page. */
  initialTo?: readonly string[] | null
}>(), { mode: 'page', draftIdToLoad: null, initialTo: null })
const emit = defineEmits<{ close: [] }>()
const isPopup = computed(() => props.mode === 'popup')

const { t } = useLanguage()
const toast = useToast()
const router = useRouter()
const { showNotice, openDraftComposer, isCurrentNotice } = useCompose()
const { selectedMailbox, setSelectedMailbox, mailboxes } = useSelectedMailbox()

const draftId = ref<string | null>(null)
const agentRevision = ref<number | null>(null)
const agentReview = shallowRef<{ approvalId: string, snapshot: ReviewSnapshot } | null>(null)
// Recipients handed in by the caller (Contacts "Send email", etc.) seed a fresh composer.
const to = ref<string[]>(props.draftIdToLoad ? [] : mergeRecipients([], [...(props.initialTo ?? [])]))
const cc = ref<string[]>([])
const bcc = ref<string[]>([])
const showCc = ref(false)
const showBcc = ref(false)
const threading = ref<ComposeThreading | null>(null)
const subject = ref('')
// The body is HTML; quoted/forwarded content is kept aside and folded.
const html = ref('')
const quotedHtml = ref<string | null>(null)
const attachments = shallowRef<ComposeAttachment[]>([])
// Attachments the draft already holds server-side (a forwarded message's files).
const storedAttachments = ref<ComposeStoredAttachment[]>([])
const attachmentPolicy = ref<ComposeAttachmentPolicy>({ maxMb: 25, cloudThresholdBytes: 3_000_000 })
const draggingFiles = ref(false)
const modalMode = ref(false)
const minimized = ref(false)
const loading = ref(false)
const loadingDraft = ref(false)
const deletingDraft = ref(false)
const scheduledAt = ref<Date | null>(null)
const followUpDays = ref<number | null>(null)
const loadedDraftMailboxId = ref<string | null>(null)
const loadedDraftFrom = ref<string | null>(null)
const selectedFrom = ref('')

// Read receipts start from the account default (Settings → Inbox → Compose); toggling only affects this message.
const trackOpensChoice = ref<boolean | null>(null)
const trackOpensDefault = ref(getCachedComposePreferences()?.trackOpensDefault ?? false)
const trackOpens = computed(() => trackOpensChoice.value ?? trackOpensDefault.value)

const form = useTemplateRef<HTMLFormElement>('form')
const editor = useTemplateRef<{ focus: () => void }>('editor')
const attachmentInput = useTemplateRef<HTMLInputElement>('attachmentInput')
const isPhone = useIsPhone()
const phoneSheet = computed(() => isPopup.value && isPhone.value)
const closing = ref(false)
const dragY = ref(0)
let dragStart: number | null = null
let noticeActionInFlight = false

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: (() => Promise<void>) | null = null
let draftGeneration = 0
let draftIdCurrent: string | null = null
// A pending human send review owns this snapshot. Autosaving after creating an approval increments
// its revision and makes confirmation impossible.
let reviewInProgress = false
let saveQueue: Promise<void> = Promise.resolve()
const uploadedFiles = new WeakSet<File>()
const rejectedFiles = new WeakSet<File>()
let fileDragDepth = 0
let previousSignature = ''

function showError(message: string) {
  toast.add({ title: message, color: 'error', icon: 'i-lucide-circle-alert' })
}

// Phones: slide the sheet away and let the page behind grow back before unmounting.
function dismiss() {
  if (!isPopup.value) return
  if (!phoneSheet.value || closing.value) return emit('close')
  closing.value = true
  window.setTimeout(() => emit('close'), 260)
}

function onSheetTouchStart(event: TouchEvent) {
  if (phoneSheet.value) dragStart = event.touches[0]!.clientY
}
function onSheetTouchMove(event: TouchEvent) {
  if (phoneSheet.value && dragStart !== null) dragY.value = Math.max(0, event.touches[0]!.clientY - dragStart)
}
function onSheetTouchEnd() {
  if (!phoneSheet.value) return
  dragStart = null
  if (dragY.value > 110) dismiss()
  dragY.value = 0
}

// Mobile browsers keep `position: fixed` anchored to the layout viewport, so the keyboard or a
// collapsing address bar would hide the sheet's send toolbar. Track the visual viewport instead.
function updateSheetViewport() {
  const viewport = window.visualViewport
  const element = form.value
  if (!viewport || !element) return
  const style = getSheetViewportStyle(window.innerHeight, viewport.height, viewport.offsetTop)
  element.style.setProperty('--sheet-height', style.height)
  element.style.setProperty('--sheet-bottom', style.bottom)
  element.style.setProperty('--sheet-pad', style.padding)
}

const senderAddressesFor = (mailbox: { senderAddresses?: string[], localPart: string, hostname: string }) =>
  mailbox.senderAddresses?.length ? mailbox.senderAddresses : [`${mailbox.localPart}@${mailbox.hostname}`]
const senderAddresses = computed(() => selectedMailbox.value ? senderAddressesFor(selectedMailbox.value) : [])
const senderOptions = computed(() => mailboxes.value.flatMap(mailbox =>
  senderAddressesFor(mailbox).map(address => ({ label: address, value: `${mailbox.id}|${address}`, mailbox, address })),
))
const senderValue = computed(() => selectedMailbox.value && selectedFrom.value ? `${selectedMailbox.value.id}|${selectedFrom.value}` : undefined)
const fromAddr = computed(() => selectedMailbox.value && selectedFrom.value
  ? formatEmailAddress(selectedFrom.value, selectedMailbox.value.displayName)
  : '')

function selectSender(value: string) {
  const option = senderOptions.value.find(item => item.value === value)
  if (!option) return
  selectedFrom.value = option.address
  if (selectedMailbox.value?.id !== option.mailbox.id) setSelectedMailbox(option.mailbox)
}

watch([() => selectedMailbox.value, () => mailboxes.value.length], () => {
  if (!selectedMailbox.value && mailboxes.value.length === 1) setSelectedMailbox(mailboxes.value[0]!)
}, { immediate: true })

watch(senderAddresses, (addresses) => {
  if (!addresses.length) selectedFrom.value = ''
  else if (!addresses.includes(selectedFrom.value)) selectedFrom.value = addresses[0]!
}, { immediate: true })

watch([loadedDraftMailboxId, mailboxes], () => {
  if (!loadedDraftMailboxId.value || selectedMailbox.value?.id === loadedDraftMailboxId.value) return
  const draftMailbox = mailboxes.value.find(mailbox => mailbox.id === loadedDraftMailboxId.value)
  if (draftMailbox) setSelectedMailbox(draftMailbox)
})

watch([loadedDraftFrom, senderAddresses], () => {
  if (loadedDraftFrom.value && senderAddresses.value.includes(loadedDraftFrom.value)) selectedFrom.value = loadedDraftFrom.value
})

watch([loadingDraft, () => selectedMailbox.value?.id, () => selectedMailbox.value?.signature], () => {
  if (loadingDraft.value) return
  const nextSignature = selectedMailbox.value?.signature ?? ''
  html.value = applyMailboxSignatureHtml(html.value, previousSignature, nextSignature)
  previousSignature = nextSignature
}, { immediate: true })

async function loadDraft(id: string) {
  loadingDraft.value = true
  try {
    const draft = await fetchDraft(id)
    draftIdCurrent = draft.id
    draftId.value = draft.id
    agentRevision.value = draft.agent?.revision ?? null
    scheduledAt.value = draft.agent?.scheduledAt ? new Date(draft.agent.scheduledAt) : null
    to.value = headerToRecipients(draft.toAddr)
    cc.value = headerToRecipients(draft.ccAddr)
    bcc.value = headerToRecipients(draft.bccAddr)
    showCc.value = cc.value.length > 0
    showBcc.value = bcc.value.length > 0
    threading.value = draft.inReplyTo || draft.threadId
      ? { inReplyTo: draft.inReplyTo ?? null, references: draft.references ?? null, threadId: draft.threadId ?? null }
      : null
    subject.value = draft.subject ?? ''
    const stored = splitQuotedHtml(draft.htmlBody || textToHtml(draft.textBody))
    html.value = stored.body
    quotedHtml.value = stored.quoted
    storedAttachments.value = draft.attachments?.filter(item => item.disposition === 'attachment') ?? []
    loadedDraftMailboxId.value = draft.mailboxId
    loadedDraftFrom.value = getEmailAddress(draft.fromAddr).toLowerCase()
  } catch (error) {
    showError(error instanceof Error ? error.message : t('compose.error.loadDraft'))
  } finally {
    loadingDraft.value = false
  }
  await nextTick()
  editor.value?.focus()
}

onMounted(() => {
  void authFetch('/api/attachment-policy', { cache: 'no-store' })
    .then(async (response) => {
      if (response.ok) attachmentPolicy.value = (await response.json()) as ComposeAttachmentPolicy
    })
    .catch(() => {})
  void loadComposePreferences().then((preferences) => { trackOpensDefault.value = preferences.trackOpensDefault }).catch(() => {})
  if (props.draftIdToLoad) void loadDraft(props.draftIdToLoad)
  const viewport = window.visualViewport
  if (isPopup.value && viewport) {
    updateSheetViewport()
    viewport.addEventListener('resize', updateSheetViewport)
    viewport.addEventListener('scroll', updateSheetViewport)
  }
})

onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', updateSheetViewport)
  window.visualViewport?.removeEventListener('scroll', updateSheetViewport)
  if (saveTimer) clearTimeout(saveTimer)
  void pendingSave?.()
})

function draftPayload(fullHtml: string) {
  return {
    mailboxId: selectedMailbox.value?.id,
    from: fromAddr.value,
    to: recipientsToHeader(to.value),
    cc: recipientsToHeader(cc.value),
    bcc: recipientsToHeader(bcc.value),
    subject: subject.value,
    html: fullHtml,
    text: htmlToPlainText(fullHtml),
    inReplyTo: threading.value?.inReplyTo ?? null,
    references: threading.value?.references ?? null,
    threadId: threading.value?.threadId ?? null,
  }
}

// Autosave: 900ms after the last change, create or update the draft and upload new attachments.
watch([attachments, bcc, cc, fromAddr, html, loadingDraft, quotedHtml, () => selectedMailbox.value?.id, () => selectedMailbox.value?.signature, subject, threading, to], () => {
  pendingSave = null
  if (saveTimer) clearTimeout(saveTimer)
  const bodyContent = htmlToPlainText(html.value).trim()
  const signatureOnly = bodyContent === (selectedMailbox.value?.signature?.trim() ?? '')
  const hasContent = to.value.length > 0 || cc.value.length > 0 || bcc.value.length > 0 || subject.value.trim() || quotedHtml.value || attachments.value.length > 0 || (bodyContent && !signatureOnly)
  if (!fromAddr.value || !hasContent || loadingDraft.value || reviewInProgress) return

  const generation = draftGeneration
  const save = () => {
    const run = saveQueue.then(async () => {
      if (generation !== draftGeneration || reviewInProgress) return
      const existingId = draftIdCurrent
      const res = await authFetch(existingId ? `/api/drafts/${existingId}` : '/api/drafts', {
        method: existingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftPayload(joinQuotedHtml(html.value, quotedHtml.value))),
      })
      const data = (await res.json()) as { draft?: { id: string } }
      if (!res.ok || !data.draft?.id) return
      if (generation !== draftGeneration) {
        if (!existingId) void authFetch(`/api/drafts/${data.draft.id}`, { method: 'DELETE' })
        return
      }
      draftIdCurrent = data.draft.id
      draftId.value = data.draft.id
      const pending = attachments.value.filter(attachment => !uploadedFiles.has(attachment.file) && !rejectedFiles.has(attachment.file))
      if (agentRevision.value !== null || pending.length === 0) return
      const body = new FormData()
      for (const attachment of pending) body.append('attachments', attachment.file)
      const uploaded = await authFetch(`/api/drafts/${data.draft.id}/attachments`, { method: 'POST', body })
      const result = (await uploaded.json()) as { attachments?: ComposeStoredAttachment[], error?: string }
      if (!uploaded.ok) {
        for (const attachment of pending) rejectedFiles.add(attachment.file)
        showError(result.error || t('compose.error.draftAttachments'))
        return
      }
      for (const attachment of pending) uploadedFiles.add(attachment.file)
      storedAttachments.value = [...storedAttachments.value, ...(result.attachments ?? [])]
      attachments.value = attachments.value.filter(attachment => !uploadedFiles.has(attachment.file))
    }).catch(() => {})
    saveQueue = run
    return run
  }
  pendingSave = save
  saveTimer = setTimeout(() => {
    pendingSave = null
    void save()
  }, 900)
})

function resetComposer() {
  draftIdCurrent = null
  draftId.value = null
  to.value = []
  cc.value = []
  bcc.value = []
  showCc.value = false
  showBcc.value = false
  threading.value = null
  storedAttachments.value = []
  subject.value = ''
  html.value = applyMailboxSignatureHtml('', '', selectedMailbox.value?.signature)
  quotedHtml.value = null
  attachments.value = []
  scheduledAt.value = null
}

const refreshLists = () => window.dispatchEvent(new Event('mailflare:messages-changed'))

async function onSubmit() {
  if (to.value.length === 0) return showError(t('compose.error.noRecipient'))
  const invalid = [...to.value, ...cc.value, ...bcc.value].find(entry => !isValidRecipient(entry))
  if (invalid) return showError(t('compose.error.invalidAddress', { address: invalid }))
  if (!hasMeaningfulHtml(html.value) && !quotedHtml.value) return showError(t('compose.error.emptyBody'))
  if (scheduledAt.value && isPastSchedule(scheduledAt.value)) return showError(t('schedule.pastTime'))

  // Freeze autosave for an AI draft before waiting for any queued save. Otherwise a debounced PATCH
  // can invalidate the approval snapshot.
  const isAgentDraft = draftId.value !== null && agentRevision.value !== null
  if (isAgentDraft) reviewInProgress = true
  if (saveTimer) clearTimeout(saveTimer)
  pendingSave = null
  loading.value = true
  await saveQueue
  const currentDraftId = draftIdCurrent
  const unsentAttachments = attachments.value.filter(attachment => !uploadedFiles.has(attachment.file))
  const fullHtml = joinQuotedHtml(html.value, quotedHtml.value)

  if (isAgentDraft && draftId.value) {
    const id = draftId.value
    try {
      if (attachments.value.length > 0) {
        const body = new FormData()
        for (const attachment of attachments.value) body.append('attachments', attachment.file)
        const uploaded = await authFetch(`/api/drafts/${id}/attachments`, { method: 'POST', body })
        const result = await uploaded.json() as { attachments?: ComposeStoredAttachment[], error?: string }
        if (!uploaded.ok) throw new Error(result.error || t('compose.error.draftAttachments'))
        storedAttachments.value = [...storedAttachments.value, ...(result.attachments ?? [])]
        attachments.value = []
      }
      const updated = await authFetch(`/api/drafts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draftPayload(fullHtml), scheduledAt: scheduledAt.value?.toISOString() ?? null }),
      })
      if (!updated.ok) throw new Error(t('compose.error.saveForReview'))
      const current = await fetchDraft(id)
      if (!current.agent) throw new Error(t('compose.error.aiMetadata'))
      agentRevision.value = current.agent.revision
      const response = await authFetch('/api/agent/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: id, expectedRevision: current.agent.revision }),
      })
      const result = await response.json() as { approvalId?: string, snapshot?: ReviewSnapshot, error?: string }
      if (!response.ok || !result.approvalId || !result.snapshot) throw new Error(result.error || t('compose.error.createReview'))
      agentReview.value = { approvalId: result.approvalId, snapshot: result.snapshot }
    } catch (cause) {
      reviewInProgress = false
      showError(cause instanceof Error ? cause.message : t('compose.error.reviewDraft'))
    } finally {
      loading.value = false
    }
    return
  }

  let res: Response
  let data: SendResult & { error?: string }
  try {
    res = await authFetch('/api/send', {
      method: 'POST',
      body: buildSendFormData({
        attachments: unsentAttachments,
        from: fromAddr.value,
        to: recipientsToHeader(to.value),
        cc: recipientsToHeader(cc.value),
        bcc: recipientsToHeader(bcc.value),
        subject: subject.value,
        text: htmlToPlainText(fullHtml),
        html: fullHtml,
        mailboxId: selectedMailbox.value?.id,
        threading: threading.value ?? undefined,
        draftId: draftId.value,
        scheduledAt: scheduledAt.value,
        undoSend: true,
        trackOpens: trackOpens.value,
        followUpDays: followUpDays.value,
      }),
    })
    data = (await res.json()) as SendResult & { error?: string }
  } catch {
    loading.value = false
    return showError(t('compose.error.sendFailed'))
  }
  loading.value = false
  if (!res.ok) return showError(data.error ?? t('compose.error.sendFailed'))

  // With a draft, refresh once it is gone so the lists reload a single time.
  if (currentDraftId) void authFetch(`/api/drafts/${currentDraftId}`, { method: 'DELETE' }).finally(refreshLists)
  const subjectLabel = subject.value.trim() || t('list.noSubject')
  draftGeneration += 1
  resetComposer()
  const notice = resolveSendNotice(data)
  if (notice.kind === 'undo') {
    const content = buildSubjectNotice('compose.sendingIn', subjectLabel, notice.messageId, true)
    let undoNoticeId = 0
    // The send is queued for the undo window; Undo returns it to Drafts and Send now skips the wait.
    undoNoticeId = showNotice(content.message, {
      parts: content.parts,
      durationMs: notice.durationMs,
      countdown: { endAt: notice.endAt },
      // Delivery starts after the window; keep watching until the queue reports a result.
      onCountdownEnd: () => {
        if (!isCurrentNotice(undoNoticeId) || noticeActionInFlight) return
        showSendingNotice(notice.messageId, subjectLabel)
      },
      actions: [
        { label: t('compose.undoSend'), onClick: () => cancelSend(notice.messageId, 'undo', undoNoticeId) },
        { label: t('compose.sendNow'), onClick: () => sendNow(notice.messageId, subjectLabel, undoNoticeId) },
      ],
    }) ?? 0
  } else if (notice.kind === 'sending') {
    showSendingNotice(notice.messageId, subjectLabel)
  } else if (notice.kind === 'scheduled') {
    const message = notice.scheduledAt
      ? t('schedule.sendScheduledFor', { when: formatScheduledSendTime(notice.scheduledAt, t) })
      : t('compose.scheduled')
    let scheduledNoticeId = 0
    scheduledNoticeId = showNotice(message, {
      durationMs: SCHEDULED_NOTICE_MS,
      actions: [{ label: t('schedule.cancelSend'), onClick: () => cancelSend(notice.messageId, 'scheduled', scheduledNoticeId) }],
    }) ?? 0
  } else {
    showNotice(t('compose.sent'))
  }
  if (!currentDraftId) refreshLists()
  if (isPopup.value) return dismiss()
  await router.push('/sent')
}

/**
 * Splits a translated template around {subject} so the subject can link to the message, and around
 * {seconds} so only the ticking suffix changes. A message that is still queued is listed under
 * Scheduled; only a delivered one lives in Sent, so the link follows the message's state.
 */
function buildSubjectNotice(
  key: 'compose.sendingIn' | 'compose.sendingSubject' | 'compose.sentSubject',
  subjectLabel: string,
  messageId: string,
  countdown: boolean,
): { message: string, parts: SendNoticeParts } {
  const template = t(key, { subject: '{subject}', seconds: '{seconds}' })
  const href = key === 'compose.sentSubject' ? `/sent/${messageId}` : `/scheduled/${messageId}`
  const parts: SendNoticeParts = { ...splitSendTemplate(template, countdown), link: { label: subjectLabel, href } }
  return { message: t(key, { subject: subjectLabel, seconds: 1 }), parts }
}

/** Shows the message while the queue delivers it and watches for the final status. */
function showSendingNotice(messageId: string, subjectLabel: string): number {
  const content = buildSubjectNotice('compose.sendingSubject', subjectLabel, messageId, false)
  let noticeId = 0
  noticeId = showNotice(content.message, {
    parts: content.parts,
    durationMs: DELIVERY_WAIT_MS,
    poll: {
      messageId,
      onStatus: (status) => {
        // Delivered: refresh the lists even if a newer toast has taken over.
        if (status === 'sent') return showSentNotice(messageId, subjectLabel, noticeId)
        if (!isCurrentNotice(noticeId)) return
        if (status === 'failed') showNotice(t('compose.error.sendFailed'), { tone: 'error' })
        else showNotice(null)
      },
    },
  }) ?? 0
  return noticeId
}

function showSentNotice(messageId: string, subjectLabel: string, sourceNoticeId: number) {
  // The message is delivered, so the lists and the cached detail are stale whichever toast is on
  // screen; refresh them before the notice check.
  clearMessageDetailCache()
  refreshLists()
  if (!isCurrentNotice(sourceNoticeId)) return
  const content = buildSubjectNotice('compose.sentSubject', subjectLabel, messageId, false)
  showNotice(content.message, { parts: content.parts, durationMs: SENT_NOTICE_MS })
}

async function sendNow(messageId: string, subjectLabel: string, sourceNoticeId: number) {
  if (noticeActionInFlight) return
  noticeActionInFlight = true
  try {
    const response = await authFetch(`/api/messages/${messageId}/send-now`, { method: 'POST' })
    if (response.ok) return showSentNotice(messageId, subjectLabel, sourceNoticeId)
    if (!isCurrentNotice(sourceNoticeId)) return
    // 409: the queued delivery claimed the message first. 5xx: the request may have failed before
    // claiming the job and the scheduled send can still deliver. Either way, let the poll decide.
    if (response.status === 409 || response.status >= 500) return void showSendingNotice(messageId, subjectLabel)
    const result = await response.json().catch(() => ({})) as { error?: string }
    if (!isCurrentNotice(sourceNoticeId)) return
    showNotice(result.error ?? t('compose.error.sendFailed'), { tone: 'error' })
  } catch {
    // A dropped response is ambiguous: the message may still be on its way.
    if (isCurrentNotice(sourceNoticeId)) showSendingNotice(messageId, subjectLabel)
  } finally {
    noticeActionInFlight = false
  }
}

async function cancelSend(messageId: string, source: 'undo' | 'scheduled', sourceNoticeId: number) {
  if (noticeActionInFlight) return
  noticeActionInFlight = true
  try {
    const res = await authFetch(`/api/messages/${messageId}/cancel-schedule`, { method: 'POST' })
    if (!res.ok) {
      if (!isCurrentNotice(sourceNoticeId)) return
      // A 409 on the undo toast means the queue claimed it; a scheduled send can also fail for other reasons.
      showNotice(source === 'undo' && res.status === 409 ? t('compose.cancelTooLate') : t('schedule.cancelFailed'), { tone: 'error' })
      return
    }
    // The message is back in Drafts, so the lists and the cached detail are stale whichever toast is
    // on screen; refresh them before the notice check.
    clearMessageDetailCache()
    refreshLists()
    if (!isCurrentNotice(sourceNoticeId)) return
    showNotice(t('compose.sendCancelled'))
    openDraftComposer(messageId)
  } catch {
    if (isCurrentNotice(sourceNoticeId)) showNotice(t('schedule.cancelFailed'), { tone: 'error' })
  } finally {
    noticeActionInFlight = false
  }
}

async function deleteDraftAndClose() {
  if (saveTimer) clearTimeout(saveTimer)
  pendingSave = null
  draftGeneration += 1
  deletingDraft.value = true
  await saveQueue
  if (draftIdCurrent) {
    let deleted = false
    try {
      const res = await authFetch(`/api/drafts/${draftIdCurrent}`, { method: 'DELETE' })
      deleted = res.ok || res.status === 404
    } catch {
      deleted = false
    }
    if (!deleted) {
      deletingDraft.value = false
      return showError(t('compose.error.deleteDraft'))
    }
  }
  resetComposer()
  refreshLists()
  if (isPopup.value) return dismiss()
  deletingDraft.value = false
  await router.push('/inbox')
}

async function removeStoredAttachment(attachmentId: string) {
  if (!draftIdCurrent) return
  const res = await authFetch(`/api/drafts/${draftIdCurrent}/attachments/${attachmentId}`, { method: 'DELETE' })
  if (!res.ok) return showError(t('compose.error.removeAttachment'))
  storedAttachments.value = storedAttachments.value.filter(item => item.id !== attachmentId)
}

function addAttachments(files: FileList | null | undefined) {
  if (!files) return
  const nextFiles = Array.from(files)
  const nextCount = storedAttachments.value.length + attachments.value.length + nextFiles.length
  const totalSize = storedAttachments.value.reduce((total, item) => total + item.size, 0)
    + [...attachments.value.map(attachment => attachment.file), ...nextFiles].reduce((total, file) => total + file.size, 0)
  const maxBytes = attachmentPolicy.value.maxMb * 1_000_000
  if (nextCount > 10) return showError(t('compose.error.maxAttachments'))
  if (nextFiles.some(file => file.size > maxBytes)) return showError(t('compose.error.attachmentSize', { max: attachmentPolicy.value.maxMb }))
  if (totalSize > maxBytes) return showError(t('compose.error.totalSize', { max: attachmentPolicy.value.maxMb }))
  attachments.value = [...attachments.value, ...nextFiles.map(file => ({ id: crypto.randomUUID(), file }))]
  if (attachmentInput.value) attachmentInput.value.value = ''
}

function removeAttachment(id: string) {
  attachments.value = attachments.value.filter(item => item.id !== id)
}

const hasFiles = (event: DragEvent) => !!event.dataTransfer?.types.includes('Files')
function onFileDragEnter(event: DragEvent) {
  if (minimized.value || !hasFiles(event)) return
  fileDragDepth += 1
  if (!loading.value && !loadingDraft.value) draggingFiles.value = true
}
function onFileDragOver(event: DragEvent) {
  if (minimized.value || !hasFiles(event)) return
  event.preventDefault()
  event.dataTransfer!.dropEffect = loading.value || loadingDraft.value ? 'none' : 'copy'
}
function onFileDragLeave(event: DragEvent) {
  if (minimized.value || !hasFiles(event)) return
  fileDragDepth = Math.max(0, fileDragDepth - 1)
  if (fileDragDepth === 0) draggingFiles.value = false
}
function onFileDrop(event: DragEvent) {
  if (minimized.value || !hasFiles(event)) return
  event.preventDefault()
  fileDragDepth = 0
  draggingFiles.value = false
  if (!loading.value && !loadingDraft.value) addAttachments(event.dataTransfer?.files)
}

function applyTemplate({ title, html: templateHtml }: { title: string, html: string }) {
  if (!subject.value.trim()) subject.value = title
  html.value = hasMeaningfulHtml(html.value) ? `${html.value}${templateHtml}` : templateHtml
}

function onKeydown(event: KeyboardEvent) {
  if (modalMode.value && !minimized.value && event.key === 'Escape') {
    event.preventDefault()
    modalMode.value = false
  }
}

function closeReview() {
  reviewInProgress = false
  agentReview.value = null
}
function onReviewSent() {
  closeReview()
  if (isPopup.value) dismiss()
  else void router.push('/sent')
}

const isForward = computed(() => !threading.value?.inReplyTo && /^fwd?:/i.test(subject.value))
const title = computed(() => {
  if (loadingDraft.value) return t('compose.title.loading')
  if (threading.value?.inReplyTo) return t('compose.title.reply')
  if (isForward.value) return t('compose.title.forward')
  return draftId.value ? t('compose.title.saved') : t('compose.title.new')
})
const sendLabel = computed(() => loading.value
  ? t('compose.preparing')
  : scheduledAt.value ? t('compose.schedule') : agentRevision.value !== null ? t('compose.reviewSend') : t('compose.send'))
const cloudWarning = computed(() => [...attachments.value.map(item => item.file.size), ...storedAttachments.value.map(item => item.size)]
  .some(size => size > attachmentPolicy.value.cloudThresholdBytes)
  ? t('compose.cloudWarning.will')
  : t('compose.cloudWarning.may'))
const busy = computed(() => loading.value || loadingDraft.value)

// Below md the popup is a bottom sheet: full width, anchored to the visual viewport (so the keyboard
// never covers the toolbar) and padded by the bottom safe area.
const sheetClass = 'compose-sheet max-md:inset-x-0 max-md:bottom-[var(--sheet-bottom,0px)] max-md:left-0 max-md:right-0 max-md:top-auto max-md:z-50 max-md:h-[var(--sheet-height,100dvh)] max-md:w-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0 max-md:pt-[env(safe-area-inset-top)] max-md:pb-[var(--sheet-pad,max(env(safe-area-inset-bottom),1rem))]'
const frameClass = computed(() => {
  if (!isPopup.value) return 'relative flex h-full min-h-[720px] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-default bg-default shadow-sm'
  if (minimized.value) return `fixed bottom-0 right-8 z-40 flex h-9 w-[min(260px,calc(100vw-32px))] flex-col overflow-hidden rounded-t-lg border border-default bg-default shadow-2xl ${sheetClass}`
  if (modalMode.value) return `fixed left-1/2 top-1/2 z-50 flex h-[86vh] w-[min(860px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-default shadow-2xl ${sheetClass}`
  return `fixed bottom-0 right-8 z-40 flex h-[min(520px,calc(100vh-88px))] w-[min(560px,calc(100vw-32px))] flex-col overflow-hidden rounded-t-lg border border-default bg-default shadow-2xl ${sheetClass}`
})
const iconButton = 'rounded-md p-1.5 hover:bg-elevated disabled:pointer-events-none disabled:opacity-50 max-md:px-2'
</script>

<template>
  <AgentSendReview
    v-if="agentReview"
    :approval-id="agentReview.approvalId"
    :snapshot="agentReview.snapshot"
    @close="closeReview"
    @sent="onReviewSent"
  />
  <div v-if="isPopup && modalMode && !minimized" class="fixed inset-0 z-40 bg-black/65 dark:bg-black/75" aria-hidden="true" />
  <form
    ref="form"
    :class="[frameClass, closing && 'compose-sheet-closing']"
    :style="dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined"
    :role="modalMode && !minimized ? 'dialog' : isPopup ? 'region' : undefined"
    :aria-modal="(modalMode && !minimized) || undefined"
    :aria-label="isPopup ? t('compose.dialogLabel') : undefined"
    novalidate
    @submit.prevent="onSubmit"
    @keydown="onKeydown"
    @dragenter.capture="onFileDragEnter"
    @dragover.capture="onFileDragOver"
    @dragleave.capture="onFileDragLeave"
    @drop.capture="onFileDrop"
  >
    <div
      v-if="draggingFiles && !minimized"
      class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center border-2 border-dashed border-primary bg-primary/10 text-sm font-medium text-primary"
      aria-hidden="true"
    >
      {{ t('compose.dropFiles') }}
    </div>
    <div
      class="flex h-9 shrink-0 items-center justify-between bg-inverted px-4 text-sm font-medium text-inverted max-md:h-12 max-md:touch-none"
      @touchstart="onSheetTouchStart"
      @touchmove="onSheetTouchMove"
      @touchend="onSheetTouchEnd"
    >
      <span class="flex min-w-0 items-center gap-2 truncate">
        <UIcon v-if="threading?.inReplyTo" name="i-lucide-reply" class="size-3.5 opacity-70" />
        <UIcon v-else-if="isForward" name="i-lucide-forward" class="size-3.5 opacity-70" />
        {{ title }}
      </span>
      <div v-if="isPopup" class="flex shrink-0 items-center gap-3 opacity-80">
        <button
          type="button"
          :aria-label="minimized ? t('compose.restore') : t('compose.minimize')"
          :title="minimized ? t('compose.restore') : t('compose.minimize')"
          class="rounded p-1 hover:bg-white/15 max-md:hidden"
          @click="minimized = !minimized; draggingFiles = false"
        >
          <UIcon :name="minimized ? 'i-lucide-chevron-up' : 'i-lucide-minus'" class="size-4" />
        </button>
        <button
          type="button"
          :aria-label="modalMode ? t('compose.restoreFloating') : t('compose.openModal')"
          :title="modalMode ? t('compose.restoreFloating') : t('compose.openModal')"
          class="rounded p-1 hover:bg-white/15 max-md:hidden"
          @click="minimized = false; modalMode = !modalMode"
        >
          <UIcon :name="modalMode ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'" class="size-4" />
        </button>
        <button type="button" :aria-label="t('compose.close')" class="rounded p-1 hover:bg-white/15 max-md:-m-2 max-md:p-3" @click="dismiss">
          <UIcon name="i-lucide-x" class="size-4" />
        </button>
      </div>
    </div>

    <div v-show="!minimized" class="flex min-h-0 flex-1 flex-col">
      <div class="flex items-center border-b border-default px-4 py-1">
        <label :for="`${mode}-from`" class="text-sm text-muted">{{ t('compose.from') }}</label>
        <USelect
          :id="`${mode}-from`"
          :model-value="senderValue"
          :items="senderOptions"
          :placeholder="t('compose.selectMailboxFirst')"
          :disabled="loadingDraft || senderOptions.length === 0"
          variant="none"
          class="flex-1"
          @update:model-value="selectSender($event as string)"
        />
      </div>
      <ComposeRecipientInput
        :id="`${mode}-to`"
        v-model="to"
        :label="t('compose.to')"
        :placeholder="t('compose.toPlaceholder')"
        :mailbox-id="selectedMailbox?.id"
        required
        :autofocus="!draftIdToLoad"
        :disabled="loadingDraft"
      >
        <template #trailing>
          <button v-if="!showCc" type="button" class="rounded px-1 hover:text-highlighted" @click="showCc = true">{{ t('compose.cc') }}</button>
          <button v-if="!showBcc" type="button" class="rounded px-1 hover:text-highlighted" @click="showBcc = true">{{ t('compose.bcc') }}</button>
        </template>
      </ComposeRecipientInput>
      <ComposeRecipientInput
        v-if="showCc"
        :id="`${mode}-cc`"
        v-model="cc"
        :label="t('compose.cc')"
        :placeholder="t('compose.ccPlaceholder')"
        :mailbox-id="selectedMailbox?.id"
        :disabled="loadingDraft"
        :autofocus="!loadingDraft && cc.length === 0"
      />
      <ComposeRecipientInput
        v-if="showBcc"
        :id="`${mode}-bcc`"
        v-model="bcc"
        :label="t('compose.bcc')"
        :placeholder="t('compose.bccPlaceholder')"
        :mailbox-id="selectedMailbox?.id"
        :disabled="loadingDraft"
        :autofocus="!loadingDraft && bcc.length === 0"
      />
      <div class="border-b border-default px-4 py-1">
        <label :for="`${mode}-subject`" class="sr-only">{{ t('compose.subject') }}</label>
        <input
          :id="`${mode}-subject`"
          v-model="subject"
          :placeholder="t('compose.subject')"
          :disabled="loadingDraft"
          class="h-8 w-full bg-transparent py-1 text-sm text-highlighted outline-none placeholder:text-dimmed"
        >
      </div>
      <ComposeRichTextEditor
        :id="`${mode}-text`"
        ref="editor"
        v-model="html"
        :quoted-html="quotedHtml"
        :disabled="loadingDraft"
        :placeholder="t('compose.bodyPlaceholder')"
      >
        <template #footer>
          <div v-if="attachments.length > 0 || storedAttachments.length > 0">
            <div class="flex min-w-0 flex-nowrap gap-2 overflow-x-auto overflow-y-hidden px-3 py-2">
              <div
                v-for="attachment in storedAttachments"
                :key="attachment.id"
                :title="t('compose.carriedOver')"
                class="flex max-w-full shrink-0 items-center gap-2 rounded-lg bg-elevated px-2 py-1 text-xs"
              >
                <UIcon name="i-lucide-file-text" class="size-4 shrink-0 text-muted" />
                <span class="max-w-48 truncate">{{ attachment.filename }}</span>
                <span class="text-muted">{{ formatAttachmentSize(attachment.size) }}</span>
                <button type="button" class="rounded-full p-1 text-muted hover:bg-accented hover:text-default" @click="removeStoredAttachment(attachment.id)">
                  <UIcon name="i-lucide-x" class="size-3.5" />
                  <span class="sr-only">{{ t('compose.removeAttachment') }}</span>
                </button>
              </div>
              <div v-for="attachment in attachments" :key="attachment.id" class="flex max-w-full shrink-0 items-center gap-2 rounded-lg bg-elevated px-2 py-1 text-xs">
                <UIcon name="i-lucide-file-text" class="size-4 shrink-0 text-muted" />
                <span class="max-w-48 truncate font-medium">{{ attachment.file.name }}</span>
                <span class="text-muted">{{ formatAttachmentSize(attachment.file.size) }}</span>
                <button type="button" class="rounded-full p-1 text-muted hover:bg-accented hover:text-default" @click="removeAttachment(attachment.id)">
                  <UIcon name="i-lucide-x" class="size-3.5" />
                  <span class="sr-only">{{ t('compose.removeAttachment') }}</span>
                </button>
              </div>
            </div>
            <p class="px-3 pb-2 text-xs text-warning">{{ cloudWarning }}</p>
          </div>
        </template>
        <template #toolbar-start>
          <div class="flex items-center max-md:contents">
            <UButton v-if="isPopup" color="neutral" variant="soft" size="sm" :label="t('common.cancel')" class="md:hidden max-md:h-10 max-md:px-3.5" @click="dismiss" />
            <div class="flex items-center max-md:order-last max-md:ms-auto">
              <UButton
                type="submit"
                size="sm"
                :disabled="busy || !fromAddr"
                :label="sendLabel"
                class="rounded-r-none px-4 max-md:h-10 max-md:px-5"
              />
              <ComposeScheduleSendMenu
                v-model="scheduledAt"
                :disabled="busy || !fromAddr"
                :mailbox-id="selectedMailbox?.id"
                :from="fromAddr"
                @apply-template="applyTemplate"
              />
            </div>
          </div>
        </template>
        <template #toolbar-end>
          <input ref="attachmentInput" type="file" multiple class="hidden" @change="addAttachments(($event.target as HTMLInputElement).files)">
          <UTooltip :text="t('compose.attachTooltip', { max: attachmentPolicy.maxMb })">
            <button type="button" :aria-label="t('compose.attachFiles')" :disabled="busy" :class="[iconButton, 'text-muted hover:text-highlighted']" @click="attachmentInput?.click()">
              <UIcon name="i-lucide-paperclip" class="size-4" />
            </button>
          </UTooltip>
          <UTooltip :text="trackOpens ? t('compose.trackOpensOn') : t('compose.trackOpensOff')">
            <button
              type="button"
              :aria-label="t('compose.trackOpens')"
              :aria-pressed="trackOpens"
              :disabled="busy"
              :class="[iconButton, trackOpens ? 'text-primary' : 'text-muted hover:text-highlighted']"
              @click="trackOpensChoice = !trackOpens"
            >
              <UIcon :name="trackOpens ? 'i-lucide-eye' : 'i-lucide-eye-off'" class="size-4" />
            </button>
          </UTooltip>
          <ComposeFollowUpMenu :disabled="busy" :clearable="!!followUpDays" @pick="followUpDays = $event" @clear="followUpDays = null">
            <button
              type="button"
              :aria-label="t('followUp.remindMe')"
              :title="followUpDays ? t('followUp.remindOn', { when: t(followUpOptionKey(followUpDays)) }) : t('followUp.remindMe')"
              :disabled="busy"
              :class="[iconButton, followUpDays ? 'text-warning' : 'text-muted hover:text-highlighted']"
            >
              <UIcon name="i-lucide-bell-ring" class="size-4" />
            </button>
          </ComposeFollowUpMenu>
          <span class="flex-1 max-md:hidden" />
          <UTooltip :text="t('compose.deleteDraft')">
            <button
              type="button"
              :aria-label="t('compose.deleteDraft')"
              :disabled="busy || deletingDraft"
              :class="[iconButton, 'text-muted hover:bg-error/10 hover:text-error']"
              @click="deleteDraftAndClose"
            >
              <UIcon name="i-lucide-trash-2" class="size-4" />
            </button>
          </UTooltip>
        </template>
      </ComposeRichTextEditor>
    </div>
  </form>
</template>

<style>
/* Phone compose sheet: full height, slides up from the bottom; on close it slides away again. */
@keyframes compose-sheet-in {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
@media (max-width: 767px) {
  .compose-sheet { overscroll-behavior: contain; transition: transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1); }
  .compose-sheet-closing { transform: translateY(100%) !important; transition: transform 260ms cubic-bezier(0.4, 0, 1, 1) !important; }
}
@media (max-width: 767px) and (prefers-reduced-motion: no-preference) {
  .compose-sheet { animation: compose-sheet-in 360ms cubic-bezier(0.2, 0.8, 0.2, 1); }
}
</style>
