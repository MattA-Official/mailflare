<script setup lang="ts">
// The invitation in a message with a calendar file: Accept, Maybe or Decline, or the guest's answer
// when the message is a reply. Ported from legacy/src/components/message-invite-card.tsx.
import { formatUserDate, parseUserDateTimeLocal } from '#lib/time/utils'
import type { TranslationKey } from '#lib/i18n/types'
import { authFetch, getAuthHeaders } from '~/utils/auth-client'
import { formatLocalDateTime } from '~/utils/calendar/calendar'
import { cacheAnsweredInvite, fetchInviteCard, getCachedInviteCard } from '~/utils/calendar/invite-cache'
import type { InviteResponse, InviteView } from '~/utils/calendar/invite-types'

const REPLY_KEYS: Record<string, TranslationKey> = {
  ACCEPTED: 'invite.reply.accepted',
  TENTATIVE: 'invite.reply.tentative',
  DECLINED: 'invite.reply.declined',
}

/** How long an answer waits for Undo before it is actually sent. */
const SEND_DELAY_MS = 8000
const NOTIFY_KEY = 'invite-notify-default'

type Receipt
  = | { kind: 'rsvp', action: InviteResponse, notified: boolean, at: Date, note: string | null, prev: InviteResponse | null }
    | { kind: 'proposal', rsvp: InviteResponse, at: Date, proposedStart: Date, proposedEnd: Date, note: string | null, prev: InviteResponse | null }
type Snapshot = { answered: InviteResponse | null, eventId: string | null, receipt: Receipt | null }
type SendIntent = { response: InviteResponse, sendReply: boolean, note: string, counter: { startsAt: string, endsAt: string } | null }

function readNotifyDefault(): boolean {
  try {
    return localStorage.getItem(NOTIFY_KEY) !== 'false'
  }
  catch {
    return true
  }
}

const props = defineProps<{ messageId: string, hasCalendarAttachment: boolean }>()
const { t } = useLanguage()
const toast = useToast()
const invite = shallowRef<InviteView | null>(null)
const eventId = ref<string | null>(null)
const answered = ref<InviteResponse | null>(null)
const answeredAt = ref<string | null>(null)
const receipt = shallowRef<Receipt | null>(null)
const pending = ref<InviteResponse | null>(null)
const loading = ref(false)
const noteOpen = ref(false)
const dialogChoice = ref<InviteResponse>('accepted')
const dialogNotify = ref(true)
const dialogNote = ref('')
const proposeOpen = ref(false)
const proposalRsvp = ref<InviteResponse>('tentative')
const proposalStart = ref('')
const proposalEnd = ref('')
const proposalMessage = ref('')
const proposalError = ref<string | null>(null)
// The answer waiting out its Undo window, and the last answer the server confirmed.
let scheduled: (SendIntent & { prev: Snapshot, messageId: string }) | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let confirmed: Snapshot = { answered: null, eventId: null, receipt: null }

// A cached card (prefetched on hover or seen before) renders at once; otherwise a skeleton holds
// its place until the invitation arrives.
watch(() => [props.messageId, props.hasCalendarAttachment] as const, ([messageId, hasCalendarAttachment], _previous, onCleanup) => {
  const cached = hasCalendarAttachment ? getCachedInviteCard(messageId) : null
  invite.value = cached?.invite ?? null
  eventId.value = cached?.eventId ?? null
  answered.value = cached?.response ?? null
  answeredAt.value = cached?.answeredAt ?? null
  receipt.value = null
  confirmed = { answered: answered.value, eventId: eventId.value, receipt: null }
  loading.value = hasCalendarAttachment && cached === undefined
  if (!loading.value) return
  let active = true
  onCleanup(() => { active = false })
  void fetchInviteCard(messageId)
    .then((data) => {
      if (!active) return
      invite.value = data?.invite ?? null
      eventId.value = data?.eventId ?? null
      answered.value = data?.response ?? null
      answeredAt.value = data?.answeredAt ?? null
      confirmed = { answered: answered.value, eventId: eventId.value, receipt: null }
    })
    .catch(() => undefined)
    .finally(() => {
      if (active) loading.value = false
    })
}, { immediate: true })

const cancelled = computed(() => invite.value?.method === 'CANCEL')
const reply = computed(() => {
  if (invite.value?.method !== 'REPLY') return null
  const answer = invite.value.attendees?.[0]
  const key = REPLY_KEYS[answer?.status ?? '']
  return { text: answer && key ? t(key, { guest: answer.email }) : '' }
})
const when = computed(() => {
  const value = invite.value
  if (!value) return ''
  const start = new Date(value.startsAt)
  const end = new Date(value.endsAt)
  if (!value.allDay) return `${formatUserDate(start, { dateStyle: 'full', timeStyle: 'short' })} - ${formatUserDate(end, { timeStyle: 'short' })}`
  // All-day dates arrive as local midnights in the user's zone with an exclusive end, so the last day is the one before it.
  const first = formatUserDate(start, { dateStyle: 'full' })
  const last = formatUserDate(new Date(end.getTime() - 1), { dateStyle: 'full' })
  return first === last ? first : `${first} - ${last}`
})

const OPTIONS: InviteResponse[] = ['accepted', 'tentative', 'declined']
const SELECTED_COLOUR: Record<InviteResponse, string> = { accepted: 'text-success', tentative: 'text-warning', declined: 'text-error' }
function optionLabel(option: InviteResponse) {
  const selected = answered.value === option
  if (option === 'accepted') return selected ? t('invite.acceptedLabel') : t('invite.accept')
  if (option === 'declined') return selected ? t('invite.declinedLabel') : t('invite.decline')
  return t('invite.maybe')
}
function optionIcon(option: InviteResponse) {
  if (answered.value !== option) return undefined
  return option === 'accepted' ? 'i-lucide-check' : option === 'declined' ? 'i-lucide-x' : undefined
}
// Before an answer, Accept is the primary action; after one, the chosen answer stands out and the others fade.
function optionPrimary(option: InviteResponse) {
  return answered.value === null && option === 'accepted'
}

function actionLabel(response: InviteResponse) {
  return response === 'accepted' ? t('invite.acceptedLabel') : response === 'declined' ? t('invite.declinedLabel') : t('invite.maybe')
}
const formatTime = (value: Date) => formatUserDate(value, { dateStyle: 'medium', timeStyle: 'short' })

function intentBody(intent: SendIntent) {
  return intent.counter
    ? { action: 'counter', startsAt: intent.counter.startsAt, endsAt: intent.counter.endsAt, rsvp: intent.response, note: intent.note, sendReply: intent.sendReply }
    : { response: intent.response, sendReply: intent.sendReply, note: intent.note }
}

function intentReceipt(intent: SendIntent, prev: InviteResponse | null, notified = intent.sendReply): Receipt {
  const note = intent.note.trim() || null
  return intent.counter
    ? { kind: 'proposal', rsvp: intent.response, at: new Date(), proposedStart: new Date(intent.counter.startsAt), proposedEnd: new Date(intent.counter.endsAt), note, prev }
    : { kind: 'rsvp', action: intent.response, notified, at: new Date(), note, prev }
}

const UNDO_TOAST_ID = 'invite-undo'

function undoSend() {
  clearTimeout(timer)
  const current = scheduled
  scheduled = null
  toast.remove(UNDO_TOAST_ID)
  if (!current || current.messageId !== props.messageId) return
  answered.value = current.prev.answered
  eventId.value = current.prev.eventId
  receipt.value = current.prev.receipt
}

// The answer is shown at once and sent after the Undo window.
function scheduleSend(intent: SendIntent) {
  if (scheduled) void sendNow()
  const prev: Snapshot = { answered: answered.value, eventId: eventId.value, receipt: receipt.value }
  answered.value = intent.response
  // A decline removes the event, so the calendar link hides at once; anything else keeps it.
  if (!intent.counter && intent.response === 'declined') eventId.value = null
  receipt.value = intentReceipt(intent, prev.answered)
  scheduled = { ...intent, prev, messageId: props.messageId }
  toast.add({
    id: UNDO_TOAST_ID,
    title: intent.counter ? t('invite.proposalSent') : actionLabel(intent.response),
    duration: SEND_DELAY_MS,
    actions: [{ label: t('invite.undo'), color: 'neutral', variant: 'outline', size: 'xs', onClick: undoSend }],
  })
  timer = setTimeout(() => void sendNow(), SEND_DELAY_MS)
}

async function sendNow() {
  clearTimeout(timer)
  const intent = scheduled
  scheduled = null
  if (!intent) return
  const here = intent.messageId === props.messageId
  if (here) pending.value = intent.response
  try {
    const result = await authFetch(`/api/messages/${intent.messageId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intentBody(intent)),
    })
    const data = await result.json().catch(() => ({})) as { error?: string, eventId?: string | null, replySent?: boolean }
    if (!result.ok) throw new Error(data.error ?? (intent.counter ? t('invite.counterFailed') : t('invite.failed')))
    const nextEventId = data.eventId ?? null
    const now = new Date().toISOString()
    // The server reports whether the reply email actually went out.
    const nextReceipt = intentReceipt(intent, confirmed.answered, intent.sendReply && data.replySent !== false)
    if (here) {
      eventId.value = nextEventId
      answeredAt.value = now
      receipt.value = nextReceipt
      confirmed = { answered: intent.response, eventId: nextEventId, receipt: nextReceipt }
      const current = invite.value
      if (current) {
        cacheAnsweredInvite(intent.messageId, {
          invite: current,
          eventId: nextEventId,
          response: intent.response,
          canRespond: current.method === 'REQUEST' || current.method === 'PUBLISH',
          answeredAt: now,
        })
      }
    }
    toast.remove(UNDO_TOAST_ID)
    toast.add({ title: intent.counter ? t('invite.proposalSent') : intent.response === 'declined' ? t('invite.declined') : t('invite.added'), color: 'success' })
  }
  catch (error) {
    toast.remove(UNDO_TOAST_ID)
    if (here) {
      answered.value = confirmed.answered
      eventId.value = confirmed.eventId
      receipt.value = confirmed.receipt
    }
    toast.add({ title: error instanceof Error ? error.message : (intent.counter ? t('invite.counterFailed') : t('invite.failed')), color: 'error' })
  }
  finally {
    if (here) pending.value = null
  }
}

// A waiting answer is never dropped: it goes out when the card goes away, or with keepalive when the page does.
function flushOnPageHide() {
  const intent = scheduled
  if (!intent) return
  scheduled = null
  clearTimeout(timer)
  void fetch(`/api/messages/${intent.messageId}/invite`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(intentBody(intent)),
    keepalive: true,
    credentials: 'include',
  }).catch(() => undefined)
}
onMounted(() => window.addEventListener('pagehide', flushOnPageHide))
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', flushOnPageHide)
  if (scheduled) void sendNow()
})
watch(() => props.messageId, () => {
  if (scheduled) void sendNow()
})

function respond(response: InviteResponse) {
  scheduleSend({ response, sendReply: readNotifyDefault(), note: '', counter: null })
}

function setDialogNotify(value: boolean) {
  dialogNotify.value = value
  try {
    localStorage.setItem(NOTIFY_KEY, String(value))
  }
  catch { /* Private mode. */ }
}

function openNoteDialog() {
  dialogChoice.value = answered.value ?? 'accepted'
  dialogNotify.value = true
  dialogNote.value = ''
  noteOpen.value = true
}

function openProposeDialog() {
  const value = invite.value
  if (!value) return
  proposalRsvp.value = 'tentative'
  proposalStart.value = formatLocalDateTime(new Date(value.startsAt))
  proposalEnd.value = formatLocalDateTime(new Date(value.endsAt))
  proposalMessage.value = ''
  proposalError.value = null
  proposeOpen.value = true
}

function sendFromNoteDialog() {
  noteOpen.value = false
  scheduleSend({ response: dialogChoice.value, sendReply: dialogNotify.value, note: dialogNote.value, counter: null })
}

function sendProposal() {
  const start = parseUserDateTimeLocal(proposalStart.value)
  const end = parseUserDateTimeLocal(proposalEnd.value)
  if (!start || !end || end <= start) {
    proposalError.value = t('invite.timeError')
    return
  }
  proposeOpen.value = false
  scheduleSend({ response: proposalRsvp.value, sendReply: true, note: proposalMessage.value, counter: { startsAt: start.toISOString(), endsAt: end.toISOString() } })
}

const overflowItems = computed(() => [[
  { label: t('invite.respondWithNote'), onSelect: openNoteDialog },
  { label: t('invite.proposeNewTime'), onSelect: openProposeDialog },
]])
const dialogChoiceItems = computed(() => [
  { label: t('invite.choice.yes'), value: 'accepted' },
  { label: t('invite.maybe'), value: 'tentative' },
  { label: t('invite.choice.no'), value: 'declined' },
])
const proposalRsvpItems = computed(() => [
  { label: t('invite.accept'), value: 'accepted' },
  { label: t('invite.maybe'), value: 'tentative' },
  { label: t('invite.decline'), value: 'declined' },
])
const sendLabel = computed(() => dialogNotify.value ? t('invite.sendChoice', { choice: t(`invite.choice.${dialogChoice.value}` as TranslationKey) }) : t('invite.saveQuietly'))
const attendeeLine = computed(() => {
  const list = invite.value?.attendees ?? []
  if (!list.length) return ''
  const shown = list.slice(0, 5).map((attendee) => {
    const status = attendee.status || 'NEEDS-ACTION'
    return `${attendee.email} (${status.charAt(0)}${status.slice(1).toLowerCase()})`
  }).join(', ')
  return list.length > 5 ? `${shown} +${list.length - 5} more` : shown
})
const singleInstance = computed(() => invite.value?.recurrenceId ? t('invite.singleInstance', { date: formatUserDate(new Date(invite.value.recurrenceId), { dateStyle: 'full' }) }) : '')
const receiptLine = computed(() => {
  const value = receipt.value
  if (value) {
    return value.kind === 'proposal'
      ? `${t('invite.proposed', { time: formatTime(value.proposedStart) })} · ${t('invite.awaitingOrganizer')}`
      : `${actionLabel(value.action)} · ${value.notified ? t('invite.notified') : t('invite.calendarOnly')} · ${formatTime(value.at)}`
  }
  if (answered.value === null) return null
  return answeredAt.value ? `${actionLabel(answered.value)} · ${formatTime(new Date(answeredAt.value))}` : actionLabel(answered.value)
})
const receiptNote = computed(() => {
  const note = receipt.value?.note
  return note ? (note.length > 80 ? `${note.slice(0, 80)}…` : note) : null
})
const receiptPrev = computed(() => receipt.value?.prev ?? null)
</script>

<template>
  <section v-if="!invite && loading" aria-busy="true" class="rounded-xl bg-elevated p-4">
    <div class="flex items-start gap-3">
      <USkeleton class="mt-0.5 size-5 shrink-0 rounded-md" />
      <div class="min-w-0 flex-1 space-y-2">
        <USkeleton class="h-3 w-24" />
        <USkeleton class="h-4 w-3/4" />
        <USkeleton class="h-3 w-1/2" />
        <div class="flex flex-wrap gap-2 pt-1">
          <USkeleton class="h-8 w-20 rounded-full" />
          <USkeleton class="h-8 w-20 rounded-full" />
          <USkeleton class="h-8 w-24 rounded-full" />
        </div>
      </div>
    </div>
  </section>
  <section v-else-if="invite" class="rounded-xl bg-elevated p-4">
    <div class="flex items-start gap-3">
      <UIcon name="i-lucide-calendar-days" class="mt-0.5 size-5 shrink-0 text-primary" />
      <div v-if="reply" class="min-w-0 flex-1">
        <p class="text-[11px] font-medium text-muted uppercase">
          {{ t('invite.reply.heading') }}
        </p>
        <h2 class="mt-0.5 text-sm font-semibold break-words text-highlighted">
          {{ invite.title }}
        </h2>
        <p v-if="reply.text" class="mt-1 text-xs text-default">
          {{ reply.text }}
        </p>
      </div>
      <div v-else class="min-w-0 flex-1">
        <p class="text-[11px] font-medium text-muted uppercase">
          {{ cancelled ? t('invite.cancelled') : t('invite.heading') }}
        </p>
        <h2 class="mt-0.5 text-sm font-semibold break-words text-highlighted">
          {{ invite.title }}
        </h2>
        <p class="mt-1 text-xs text-default">
          {{ when }}
        </p>
        <p v-if="singleInstance" class="mt-1 text-xs text-muted">
          {{ singleInstance }}
        </p>
        <p v-if="invite.location" class="mt-0.5 text-xs break-words text-muted">
          {{ invite.location }}
        </p>
        <p v-if="invite.organizer" class="mt-0.5 text-xs text-muted">
          {{ t('invite.organizer', { organizer: invite.organizer }) }}
        </p>
        <p v-if="attendeeLine" class="mt-0.5 text-xs break-words text-muted">
          {{ attendeeLine }}
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <UButton
            v-if="cancelled"
            size="sm"
            :label="t('invite.removeFromCalendar')"
            color="neutral"
            variant="solid"
            class="rounded-full bg-default text-default hover:bg-muted"
            :disabled="pending !== null || !eventId"
            @click="respond('declined')"
          />
          <template v-else>
            <UButton
              v-for="option in OPTIONS"
              :key="option"
              size="sm"
              :label="optionLabel(option)"
              :leading-icon="optionIcon(option)"
              :color="optionPrimary(option) ? 'primary' : 'neutral'"
              variant="solid"
              class="rounded-full"
              :class="[
                !optionPrimary(option) && 'bg-default hover:bg-muted',
                answered === option ? ['font-semibold', SELECTED_COLOUR[option]] : !optionPrimary(option) && 'text-default',
                answered !== null && answered !== option && 'opacity-50',
              ]"
              :aria-pressed="answered === option"
              :loading="pending === option"
              :disabled="pending !== null"
              @click="respond(option)"
            />
            <UDropdownMenu :items="overflowItems">
              <UButton
                size="sm"
                icon="i-lucide-ellipsis"
                color="neutral"
                variant="solid"
                class="rounded-full bg-default text-default hover:bg-muted"
                :aria-label="t('invite.moreOptions')"
                :title="t('invite.moreOptions')"
                :disabled="pending !== null"
              />
            </UDropdownMenu>
          </template>
          <ULink v-if="eventId && answered !== 'declined'" :to="`/calendar?event=${eventId}`" class="ms-auto text-xs font-medium text-primary hover:underline">
            {{ t('invite.viewOnCalendar') }}
          </ULink>
        </div>
        <div v-if="!cancelled && receiptLine" class="mt-2 space-y-1">
          <p class="text-xs text-muted">
            {{ receiptLine }}<template v-if="receiptNote">
              · <span>“{{ receiptNote }}”</span>
            </template><template v-if="receiptPrev">
              {{ ' ' }}{{ t('invite.wasPrev', { action: actionLabel(receiptPrev) }) }}
            </template>
          </p>
          <p class="text-[11px] text-dimmed">
            {{ t('invite.changeHint') }}
          </p>
        </div>
      </div>
    </div>
    <UModal v-model:open="noteOpen" :title="t('invite.respondWithNote')" :description="invite.title">
      <template #body>
        <div class="space-y-4">
          <URadioGroup v-model="dialogChoice" :items="dialogChoiceItems" orientation="horizontal" variant="table" :aria-label="t('invite.rsvp')" />
          <UTextarea v-model="dialogNote" :placeholder="t('invite.notePlaceholder')" :aria-label="t('invite.addNote')" :maxlength="500" :rows="3" class="w-full" />
          <USwitch :model-value="dialogNotify" :label="t('invite.notifyByEmail')" :description="t('invite.notifyHint')" @update:model-value="setDialogNotify" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="noteOpen = false" />
          <UButton :label="sendLabel" @click="sendFromNoteDialog" />
        </div>
      </template>
    </UModal>
    <UModal v-model:open="proposeOpen" :title="t('invite.proposeNewTime')" :description="invite.title">
      <template #body>
        <div class="space-y-4">
          <div class="space-y-1 text-sm">
            <p><span class="font-medium">{{ t('invite.currentTime') }}:</span> {{ when }}</p>
            <p v-if="singleInstance" class="text-xs text-muted">
              {{ singleInstance }}
            </p>
          </div>
          <UFormField :label="t('invite.rsvp')">
            <USelect v-model="proposalRsvp" :items="proposalRsvpItems" class="w-40" />
          </UFormField>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField :label="t('invite.starts')">
              <AppDateTimeInput v-model="proposalStart" :label="t('invite.starts')" />
            </UFormField>
            <UFormField :label="t('invite.ends')">
              <AppDateTimeInput v-model="proposalEnd" :label="t('invite.ends')" />
            </UFormField>
          </div>
          <UAlert v-if="proposalError" color="error" variant="subtle" :title="proposalError" role="alert" />
          <UFormField :label="t('invite.messageOptional')">
            <UTextarea v-model="proposalMessage" :placeholder="t('invite.notePlaceholder')" :maxlength="500" :rows="2" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="proposeOpen = false" />
          <UButton :label="t('invite.sendProposal')" @click="sendProposal" />
        </div>
      </template>
    </UModal>
  </section>
</template>
