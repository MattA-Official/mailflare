<script setup lang="ts">
// Booking event types: list, switch on and off, copy links, and edit in a side panel.
// Ported from legacy/src/app/(calendar)/booking/page.tsx.
import { getUserTimeZone } from '#lib/time/utils'
import type { BookingEvent, BookingForm, BookingHost } from '~/types/calendar'
import { availabilityLabel, durationLabel, emptyBookingForm, formFromEvent, visibleBookingEvents } from '~/utils/calendar/booking'

definePageMeta({ layout: 'dashboard', nav: 'calendar', auth: { feature: 'calendar' } })

const { t } = useLanguage()
const toast = useToast()
useHead({ title: () => t('booking.title') })

const events = ref<BookingEvent[]>([])
const username = ref('')
const hosts = ref<BookingHost[]>([])
const canManageHosts = ref(false)
const currentUserId = ref('')
const loading = ref(true)
const editingId = ref<string | null>(null)
const form = ref<BookingForm>(emptyBookingForm(getUserTimeZone(), ''))
const panelOpen = ref(false)
const saving = ref(false)
const savingTemplateId = ref<string | null>(null)
const listEvents = computed(() => visibleBookingEvents(events.value, currentUserId.value, getUserTimeZone()))

type AccountRow = BookingHost & { disabled: boolean, calendarEnabled?: boolean }

onMounted(async () => {
  try {
    const data = await api<{ events: BookingEvent[], username: string | null, currentUser: BookingHost, canManageHosts: boolean }>('/api/booking')
    events.value = data.events
    username.value = data.username ?? ''
    hosts.value = [data.currentUser]
    currentUserId.value = data.currentUser.id
    if (data.canManageHosts) {
      try {
        const accounts = await api<{ accounts: AccountRow[] }>('/api/accounts')
        hosts.value = [data.currentUser, ...accounts.accounts
          .filter(account => !account.disabled && account.calendarEnabled !== false && account.id !== data.currentUser.id)
          .map(({ id, name, email, hasAvatar }) => ({ id, name, email, hasAvatar }))]
        canManageHosts.value = true
      } catch {
        toast.add({ title: t('booking.hostListFailed'), color: 'error' })
      }
    }
  } catch {
    toast.add({ title: t('booking.loadFailed'), color: 'error' })
  } finally {
    loading.value = false
  }
})

function startCreate() {
  if (!currentUserId.value) return
  editingId.value = null
  form.value = emptyBookingForm(getUserTimeZone(), currentUserId.value)
  panelOpen.value = true
}

function startEdit(event: BookingEvent) {
  editingId.value = event.isTemplate ? null : event.id
  form.value = { ...formFromEvent(event), enabled: event.isTemplate ? true : event.enabled }
  panelOpen.value = true
}

function replaceEvent(event: BookingEvent) {
  events.value = events.value.map(item => item.id === event.id ? event : item)
}

async function save() {
  saving.value = true
  const id = editingId.value
  try {
    const data = await api<{ event?: BookingEvent }>(id ? `/api/booking/${id}` : '/api/booking', { method: id ? 'PATCH' : 'POST', body: form.value })
    if (!data.event) throw new Error()
    if (id) replaceEvent(data.event)
    else events.value = [...events.value, data.event]
    panelOpen.value = false
    toast.add({ title: id ? t('booking.saved') : t('booking.created'), color: 'success' })
  } catch (error) {
    toast.add({ title: error instanceof ApiError ? error.message : t('booking.saveFailed'), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function setEnabled(event: BookingEvent, enabled: boolean) {
  if (event.isTemplate && !enabled) return
  if (event.isTemplate) savingTemplateId.value = event.id
  try {
    const data = await api<{ event?: BookingEvent }>(event.isTemplate ? '/api/booking' : `/api/booking/${event.id}`, {
      method: event.isTemplate ? 'POST' : 'PATCH',
      body: { ...formFromEvent(event), enabled },
    })
    if (!data.event) throw new Error()
    if (event.isTemplate) events.value = [...events.value, data.event]
    else replaceEvent(data.event)
    if (editingId.value === event.id) form.value = { ...form.value, enabled }
  } catch {
    toast.add({ title: event.isTemplate ? t('booking.enableFailed') : t('booking.updateFailed'), color: 'error' })
  } finally {
    if (event.isTemplate) savingTemplateId.value = null
  }
}

async function remove(event: BookingEvent) {
  if (!window.confirm(t('booking.deleteConfirm', { name: event.name }))) return
  try {
    await api(`/api/booking/${event.id}`, { method: 'DELETE' })
    events.value = events.value.filter(item => item.id !== event.id)
    if (editingId.value === event.id) panelOpen.value = false
  } catch {
    toast.add({ title: t('booking.deleteFailed'), color: 'error' })
  }
}

async function copyLink(event: BookingEvent) {
  if (!username.value) {
    toast.add({ title: t('booking.usernameUnavailable'), color: 'error' })
    return
  }
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/c/${username.value}/${event.slug}`)
    toast.add({ title: t('booking.linkCopied'), color: 'success' })
  } catch {
    toast.add({ title: t('booking.copyFailed'), color: 'error' })
  }
}

function editingEvent() {
  return events.value.find(item => item.id === editingId.value)
}

function rowMenu(event: BookingEvent) {
  return [[
    { label: t('booking.edit'), onSelect: () => startEdit(event) },
    { label: event.enabled ? t('booking.turnOff') : t('booking.turnOn'), onSelect: () => void setEnabled(event, !event.enabled) },
    { label: t('common.delete'), color: 'error' as const, onSelect: () => void remove(event) },
  ]]
}

function goToEvent(event: { id: string }) {
  void navigateTo(`/calendar?event=${encodeURIComponent(event.id)}`)
}
</script>

<template>
  <div class="contents">
    <!-- display: contents keeps both panels direct flex children of the dashboard group. -->
  <CalendarUpcomingPanel @select="goToEvent" />

  <UDashboardPanel id="booking">
    <template #header>
      <UDashboardNavbar :ui="{ title: 'hidden' }">
        <template #leading>
          <UDashboardSidebarCollapse class="lg:hidden" />
          <CalendarUpcomingButton @select="goToEvent" />
          <CalendarSectionNav />
        </template>
      </UDashboardNavbar>
      <UProgress v-if="loading" size="2xs" class="absolute inset-x-0 top-0" />
    </template>

    <template #body>
      <section :aria-label="t('booking.events')" class="mx-auto w-full max-w-5xl space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-4 pb-3">
          <div class="min-w-0">
            <h1 class="text-xl font-semibold text-highlighted md:text-3xl">
              {{ t('booking.title') }}
            </h1>
            <p class="mt-1 text-sm text-muted">
              {{ t('booking.description') }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <UButton
              v-if="username"
              :to="`/c/${username}`"
              target="_blank"
              icon="i-lucide-external-link"
              color="neutral"
              variant="ghost"
              :aria-label="t('booking.openPage', { name: username })"
            />
            <UButton icon="i-lucide-plus" :label="t('booking.newEvent')" :disabled="!currentUserId" class="rounded-full" @click="startCreate" />
          </div>
        </div>

        <div v-if="loading" role="status" :aria-label="t('booking.loading')" class="space-y-3">
          <span class="sr-only">{{ t('booking.loadingEllipsis') }}</span>
          <UCard v-for="item in 3" :key="item">
            <USkeleton class="h-5 w-1/2" />
            <USkeleton class="mt-4 h-3 w-3/4" />
            <USkeleton class="mt-3 h-3 w-2/5" />
          </UCard>
        </div>
        <UEmpty v-else-if="listEvents.length === 0" icon="i-lucide-calendar-days" :title="t('booking.none')" :description="t('booking.noneHint')" variant="outline" />
        <UCard v-for="event in listEvents" v-else :key="event.id" :class="!event.enabled && 'opacity-65'" :ui="{ body: 'flex flex-wrap items-center gap-4' }">
          <div class="flex min-w-0 flex-1 items-start gap-4">
            <span class="mt-1 flex size-5 shrink-0 items-center justify-center rounded-md border" :class="event.enabled ? 'border-primary bg-primary text-inverted' : 'border-accented'">
              <UIcon v-if="event.enabled" name="i-lucide-check" class="size-3.5" />
            </span>
            <div class="min-w-0">
              <button type="button" class="text-left text-lg font-semibold text-highlighted hover:text-primary max-md:text-base" @click="startEdit(event)">
                {{ event.name }}
              </button>
              <p v-if="event.description" class="mt-1 line-clamp-2 text-sm whitespace-pre-wrap text-toned">
                {{ event.description }}
              </p>
              <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                <span class="inline-flex items-center gap-1"><UIcon name="i-lucide-clock-3" class="size-3.5" />{{ durationLabel(event.durationMinutes, t) }}</span>
                <span>·</span>
                <span class="inline-flex items-center gap-1"><UIcon name="i-lucide-map-pin" class="size-3.5" />{{ event.location || t('booking.noLocation') }}</span>
              </p>
              <p class="mt-2 text-sm text-muted">
                {{ availabilityLabel(event, t) }}
              </p>
            </div>
          </div>
          <div class="ml-auto flex items-center gap-2 max-md:ml-9 max-md:w-full">
            <template v-if="event.enabled">
              <UButton icon="i-lucide-copy" :label="t('booking.copyLink')" color="neutral" variant="outline" class="rounded-full" @click="copyLink(event)" />
              <UButton
                v-if="username"
                :to="`/c/${username}/${event.slug}`"
                target="_blank"
                icon="i-lucide-external-link"
                color="neutral"
                variant="ghost"
                :aria-label="t('booking.openPage', { name: event.name })"
              />
            </template>
            <UButton
              v-else
              color="neutral"
              variant="outline"
              class="rounded-full"
              :label="savingTemplateId === event.id ? t('booking.turningOn') : t('booking.turnOn')"
              :disabled="event.isTemplate && savingTemplateId !== null"
              @click="setEnabled(event, true)"
            />
            <UDropdownMenu v-if="!event.isTemplate" :items="rowMenu(event)" :content="{ align: 'end' }">
              <UButton icon="i-lucide-more-horizontal" color="neutral" variant="ghost" :aria-label="t('booking.moreOptions', { name: event.name })" />
            </UDropdownMenu>
          </div>
        </UCard>
      </section>
    </template>
  </UDashboardPanel>

  <CalendarBookingEditor
    v-model:open="panelOpen"
    v-model:form="form"
    :editing-id="editingId"
    :username="username"
    :hosts="hosts"
    :can-manage-hosts="canManageHosts"
    :current-user-id="currentUserId"
    :saving="saving"
    @save="save"
    @delete="editingEvent() && remove(editingEvent()!)"
    @toggle-enabled="editingEvent() && setEnabled(editingEvent()!, !editingEvent()!.enabled)"
  />
  </div>
</template>
