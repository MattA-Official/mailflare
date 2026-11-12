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
    .then(async response => (response.ok ? await response.json() as { invite: InviteView | null, eventId: string | null } : null))
    .then((data) => {
      if (active && data?.invite) {
        invite.value = data.invite
        eventId.value = data.eventId
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
  <section v-if="invite" class="mt-6 rounded-xl border border-default bg-elevated/50 p-4 sm:ml-16">
    <div class="flex items-start gap-3">
      <UIcon name="i-lucide-calendar-days" class="mt-0.5 size-5 shrink-0 text-primary" />
      <div v-if="reply" class="min-w-0 flex-1">
        <p class="text-xs font-medium text-muted uppercase">
          {{ t('invite.reply.heading') }}
        </p>
        <h2 class="mt-0.5 text-base font-semibold break-words text-highlighted">
          {{ invite.title }}
        </h2>
        <p v-if="reply.text" class="mt-1 text-sm text-default">
          {{ reply.text }}
        </p>
      </div>
      <div v-else class="min-w-0 flex-1">
        <p class="text-xs font-medium text-muted uppercase">
          {{ cancelled ? t('invite.cancelled') : t('invite.heading') }}
        </p>
        <h2 class="mt-0.5 text-base font-semibold break-words text-highlighted">
          {{ invite.title }}
        </h2>
        <p class="mt-1 text-sm text-default">
          {{ when }}
        </p>
        <p v-if="invite.location" class="mt-0.5 text-sm break-words text-muted">
          {{ invite.location }}
        </p>
        <p v-if="invite.organizer" class="mt-0.5 text-sm text-muted">
          {{ t('invite.organizer', { organizer: invite.organizer }) }}
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <UButton
            v-if="cancelled"
            :label="t('invite.removeFromCalendar')"
            color="neutral"
            variant="outline"
            :disabled="pending !== null || !eventId"
            @click="respond('declined')"
          />
          <template v-else>
            <UButton :label="t('invite.accept')" :aria-pressed="answered === 'accepted'" :loading="pending === 'accepted'" :disabled="pending !== null" @click="respond('accepted')" />
            <UButton :label="t('invite.maybe')" color="neutral" :variant="answered === 'tentative' ? 'subtle' : 'outline'" :aria-pressed="answered === 'tentative'" :loading="pending === 'tentative'" :disabled="pending !== null" @click="respond('tentative')" />
            <UButton :label="t('invite.decline')" color="neutral" :variant="answered === 'declined' ? 'subtle' : 'outline'" :aria-pressed="answered === 'declined'" :loading="pending === 'declined'" :disabled="pending !== null" @click="respond('declined')" />
          </template>
          <ULink v-if="eventId && answered !== 'declined'" :to="`/calendar?event=${eventId}`" class="text-sm font-medium text-primary hover:underline">
            {{ t('invite.viewOnCalendar') }}
          </ULink>
        </div>
      </div>
    </div>
  </section>
</template>
