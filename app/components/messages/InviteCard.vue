<script setup lang="ts">
// The invitation in a message with a calendar file: Accept, Maybe or Decline, or the guest's answer
// when the message is a reply. Ported from legacy/src/components/message-invite-card.tsx.
import { formatUserDate } from '#lib/time/utils'
import type { TranslationKey } from '#lib/i18n/types'
import { authFetch } from '~/utils/auth-client'

type InviteView = {
  title: string
  description: string
  location: string
  startsAt: string
  endsAt: string
  allDay: boolean
  organizer: string | null
  method: string
  attendees?: { email: string, status: string }[]
}

type InviteResponse = 'accepted' | 'tentative' | 'declined'

const REPLY_KEYS: Record<string, TranslationKey> = {
  ACCEPTED: 'invite.reply.accepted',
  TENTATIVE: 'invite.reply.tentative',
  DECLINED: 'invite.reply.declined',
}

const props = defineProps<{ messageId: string, hasCalendarAttachment: boolean }>()
const { t } = useLanguage()
const toast = useToast()
const invite = shallowRef<InviteView | null>(null)
const eventId = ref<string | null>(null)
const answered = ref<InviteResponse | null>(null)
const pending = ref<InviteResponse | null>(null)

watch(() => [props.messageId, props.hasCalendarAttachment] as const, ([messageId, hasCalendarAttachment], _previous, onCleanup) => {
  invite.value = null
  eventId.value = null
  answered.value = null
  if (!hasCalendarAttachment) return
  let active = true
  onCleanup(() => { active = false })
  void authFetch(`/api/messages/${messageId}/invite`)
    .then(async response => (response.ok ? await response.json() as { invite: InviteView | null, eventId: string | null, response?: InviteResponse | null } : null))
    .then((data) => {
      if (active && data?.invite) {
        invite.value = data.invite
        eventId.value = data.eventId
        answered.value = data.response ?? null
      }
    })
    .catch(() => undefined)
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

async function respond(response: InviteResponse) {
  pending.value = response
  try {
    const result = await authFetch(`/api/messages/${props.messageId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response }),
    })
    const data = await result.json().catch(() => ({})) as { error?: string, eventId?: string | null }
    if (!result.ok) throw new Error(data.error ?? t('invite.failed'))
    answered.value = response
    eventId.value = data.eventId ?? null
    toast.add({ title: response === 'declined' ? t('invite.declined') : t('invite.added'), color: 'success' })
  }
  catch (error) {
    toast.add({ title: error instanceof Error ? error.message : t('invite.failed'), color: 'error' })
  }
  finally {
    pending.value = null
  }
}
</script>

<template>
  <section v-if="invite" class="rounded-xl bg-elevated p-4">
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
        <p v-if="invite.location" class="mt-0.5 text-xs break-words text-muted">
          {{ invite.location }}
        </p>
        <p v-if="invite.organizer" class="mt-0.5 text-xs text-muted">
          {{ t('invite.organizer', { organizer: invite.organizer }) }}
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
          </template>
          <ULink v-if="eventId && answered !== 'declined'" :to="`/calendar?event=${eventId}`" class="ms-auto text-xs font-medium text-primary hover:underline">
            {{ t('invite.viewOnCalendar') }}
          </ULink>
        </div>
      </div>
    </div>
  </section>
</template>
