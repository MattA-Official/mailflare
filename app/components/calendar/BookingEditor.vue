<script setup lang="ts">
// Side panel for creating or editing a booking event type.
// Ported from legacy/src/app/(calendar)/booking/booking-editor.tsx.
import { folderColorKeys } from '#lib/folders/color-keys'
import { FOLDER_COLOR_OPTIONS } from '#lib/folders/colors'
import { slugifyBookingName } from '#lib/booking/utils'
import type { TranslationKey } from '#lib/i18n/types'
import type { BookingEditorSection, BookingForm, BookingHost } from '~/types/calendar'
import { bookingFormWithName, durationLabel, formAvailabilityLabel, matchBookingHost, nextBookingTimeRange, WEEKDAYS } from '~/utils/calendar/booking'

const props = defineProps<{
  editingId: string | null
  username: string
  hosts: BookingHost[]
  canManageHosts: boolean
  currentUserId: string
  saving: boolean
}>()
const emit = defineEmits<{ save: [], delete: [], toggleEnabled: [] }>()
const open = defineModel<boolean>('open', { default: false })
const form = defineModel<BookingForm>('form', { required: true })

const { t } = useLanguage()
const activeSection = ref<BookingEditorSection>(null)
const nameEditing = ref(false)
const hostQuery = ref('')
const hostError = ref('')

watch([() => props.editingId, open], () => {
  if (!open.value) return
  activeSection.value = null
  nameEditing.value = false
  hostQuery.value = ''
  hostError.value = ''
})

const PRESET_DURATIONS = [15, 30, 45, 60]
const durationItems = computed(() => [
  { label: t('booking.editor.minutes15'), value: '15' },
  { label: t('booking.editor.minutes30'), value: '30' },
  { label: t('booking.editor.minutes45'), value: '45' },
  { label: t('booking.editor.hour1'), value: '60' },
  { label: t('booking.editor.custom'), value: 'custom' },
])
const durationChoice = computed({
  get: () => PRESET_DURATIONS.includes(form.value.durationMinutes) ? String(form.value.durationMinutes) : 'custom',
  set: (value: string) => update({ durationMinutes: value === 'custom' ? 90 : Number(value) }),
})

const moreItems = computed(() => [[
  { label: form.value.enabled ? t('booking.turnOff') : t('booking.turnOn'), onSelect: () => emit('toggleEnabled') },
  { label: t('common.delete'), color: 'error' as const, onSelect: () => emit('delete') },
]])

function update(patch: Partial<BookingForm>) {
  form.value = { ...form.value, ...patch }
}

function toggle(section: BookingEditorSection) {
  activeSection.value = activeSection.value === section ? null : section
}

function toggleWeekday(day: number) {
  const weekdays = form.value.weekdays
  update({ weekdays: weekdays.includes(day) ? weekdays.filter(value => value !== day) : [...weekdays, day].sort() })
}

function setRange(index: number, key: 'startTime' | 'endTime', value: string) {
  update({ timeRanges: form.value.timeRanges.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) })
}

function hostFor(id: string) {
  return props.hosts.find(item => item.id === id)
}

function addHost() {
  const match = matchBookingHost(props.hosts, hostQuery.value, t)
  if (!match.host) {
    hostError.value = match.error
    return
  }
  if (form.value.hostIds.includes(match.host.id)) {
    hostError.value = t('booking.editor.alreadyHost')
    return
  }
  if (form.value.hostIds.length >= 20) {
    hostError.value = t('booking.editor.maxHosts')
    return
  }
  update({ hostIds: [...form.value.hostIds, match.host.id] })
  hostQuery.value = ''
  hostError.value = ''
}
</script>

<template>
  <USlideover v-model:open="open" :title="t('booking.editor.details')" :dismissible="!saving" :ui="{ body: 'p-0 sm:p-0', footer: 'justify-end' }">
    <template #body>
      <section class="border-b border-default p-5">
        <div class="flex items-center gap-3">
          <button type="button" :aria-label="t('booking.editor.editColor')" class="size-6 shrink-0 rounded-full" :style="{ backgroundColor: form.color }" @click="activeSection = 'event'" />
          <UInput
            v-if="nameEditing"
            autofocus
            :model-value="form.name"
            :aria-label="t('booking.editor.meetingName')"
            :placeholder="t('booking.editor.newMeeting')"
            :maxlength="120"
            class="min-w-0 flex-1"
            :ui="{ base: 'text-xl font-semibold' }"
            @update:model-value="form = bookingFormWithName(form, String($event))"
            @blur="nameEditing = false"
            @keydown.enter.prevent="nameEditing = false"
            @keydown.esc.stop="nameEditing = false"
          />
          <button
            v-else
            type="button"
            class="min-w-0 flex-1 text-left text-xl font-semibold break-words text-highlighted hover:text-primary"
            @click="activeSection = 'event'; nameEditing = true"
          >
            {{ form.name || t('booking.editor.newMeeting') }}
          </button>
          <UButton
            icon="i-lucide-chevron-down"
            color="neutral"
            variant="ghost"
            :aria-label="t('booking.editor.toggleDetails')"
            :aria-expanded="activeSection === 'event'"
            :ui="{ leadingIcon: activeSection === 'event' ? 'rotate-180 transition-transform' : 'transition-transform' }"
            @click="toggle('event')"
          />
        </div>
        <div v-if="activeSection === 'event'" class="mt-5 space-y-4">
          <UFormField :label="t('booking.editor.slug')" :help="`/c/${username || t('booking.editor.yourName')}/${form.slug || t('booking.editor.eventSlug')}`">
            <UInput :model-value="form.slug" :placeholder="t('booking.editor.slugPlaceholder')" :maxlength="80" class="w-full" @update:model-value="update({ slug: slugifyBookingName(String($event)) })" />
          </UFormField>
          <UFormField :label="t('calendar.description')">
            <UTextarea :model-value="form.description" :placeholder="t('booking.editor.descriptionPlaceholder')" :maxlength="2000" :rows="4" class="w-full" @update:model-value="update({ description: String($event) })" />
          </UFormField>
          <fieldset>
            <legend class="text-sm font-medium text-default">
              {{ t('booking.editor.color') }}
            </legend>
            <div class="mt-2 flex flex-wrap gap-2" role="radiogroup" :aria-label="t('calendar.eventColor')">
              <button
                v-for="option in FOLDER_COLOR_OPTIONS"
                :key="option.value"
                type="button"
                role="radio"
                :aria-label="t(folderColorKeys[option.value])"
                :aria-checked="form.color === option.value"
                class="flex size-8 items-center justify-center rounded-full border-2 border-default ring-2"
                :class="form.color === option.value ? 'ring-inverted' : 'ring-transparent hover:ring-accented'"
                :style="{ backgroundColor: option.value }"
                @click="update({ color: option.value })"
              >
                <span v-if="form.color === option.value" class="size-2 rounded-full bg-white" />
              </button>
            </div>
          </fieldset>
        </div>
      </section>

      <section class="border-b border-default p-5">
        <button type="button" :aria-expanded="activeSection === 'duration'" class="flex w-full items-center justify-between gap-3 text-left font-semibold text-highlighted" @click="toggle('duration')">
          <span>{{ t('booking.editor.duration') }}</span>
          <UIcon name="i-lucide-chevron-down" class="size-5 text-muted transition-transform" :class="activeSection === 'duration' && 'rotate-180'" />
        </button>
        <div v-if="activeSection === 'duration'" class="mt-4 space-y-3">
          <USelect v-model="durationChoice" :items="durationItems" :aria-label="t('booking.editor.meetingLength')" class="w-full" />
          <UInputNumber
            v-if="durationChoice === 'custom'"
            :model-value="form.durationMinutes"
            :aria-label="t('booking.editor.customMinutes')"
            :min="5"
            :max="480"
            :step="5"
            class="w-full"
            @update:model-value="update({ durationMinutes: Number($event) })"
          />
        </div>
        <button v-else type="button" class="mt-2 flex w-full items-center gap-2 text-left text-sm text-muted" @click="toggle('duration')">
          <UIcon name="i-lucide-clock-3" class="size-4" />{{ durationLabel(form.durationMinutes, t) }}
        </button>
      </section>

      <section class="border-b border-default p-5">
        <button type="button" :aria-expanded="activeSection === 'location'" class="flex w-full items-center justify-between gap-3 text-left font-semibold text-highlighted" @click="toggle('location')">
          <span>{{ t('booking.editor.location') }}</span>
          <UIcon name="i-lucide-chevron-down" class="size-5 text-muted transition-transform" :class="activeSection === 'location' && 'rotate-180'" />
        </button>
        <UInput
          v-if="activeSection === 'location'"
          :model-value="form.location"
          :aria-label="t('booking.editor.location')"
          :placeholder="t('booking.editor.locationPlaceholder')"
          :maxlength="240"
          class="mt-4 w-full"
          @update:model-value="update({ location: String($event) })"
        />
        <button v-else type="button" class="mt-2 flex w-full items-center gap-2 text-left text-sm text-muted" @click="toggle('location')">
          <UIcon name="i-lucide-map-pin" class="size-4" />{{ form.location || t('booking.noLocation') }}
        </button>
      </section>

      <section class="border-b border-default p-5">
        <button type="button" :aria-expanded="activeSection === 'availability'" class="flex w-full items-center justify-between gap-3 text-left font-semibold text-highlighted" @click="toggle('availability')">
          <span>{{ t('booking.editor.availability') }}</span>
          <UIcon name="i-lucide-chevron-down" class="size-5 text-muted transition-transform" :class="activeSection === 'availability' && 'rotate-180'" />
        </button>
        <div v-if="activeSection === 'availability'" class="mt-4 space-y-4">
          <fieldset :aria-label="t('booking.editor.availableDays')" class="flex flex-wrap gap-1">
            <UButton
              v-for="day in WEEKDAYS"
              :key="day"
              size="xs"
              class="rounded-full"
              :label="t(`calendar.weekdayShort.${day}` as TranslationKey)"
              :aria-label="t(`weekday.${day}` as TranslationKey)"
              :aria-pressed="form.weekdays.includes(day)"
              :color="form.weekdays.includes(day) ? 'primary' : 'neutral'"
              :variant="form.weekdays.includes(day) ? 'solid' : 'soft'"
              @click="toggleWeekday(day)"
            />
          </fieldset>
          <div>
            <p class="text-sm font-medium text-default">
              {{ t('booking.editor.times') }}
            </p>
            <div class="mt-2 space-y-2">
              <div v-for="(range, index) in form.timeRanges" :key="index" class="flex items-end gap-2">
                <UFormField :label="t('calendar.from')" class="min-w-0 flex-1" size="xs">
                  <UInput type="time" :step="900" :model-value="range.startTime" class="w-full" @update:model-value="setRange(index, 'startTime', String($event))" />
                </UFormField>
                <UFormField :label="t('calendar.to')" class="min-w-0 flex-1" size="xs">
                  <UInput type="time" :step="900" :model-value="range.endTime" class="w-full" @update:model-value="setRange(index, 'endTime', String($event))" />
                </UFormField>
                <UButton
                  icon="i-lucide-trash-2"
                  color="neutral"
                  variant="ghost"
                  :aria-label="t('booking.editor.removeTime', { n: index + 1 })"
                  :disabled="form.timeRanges.length === 1"
                  @click="update({ timeRanges: form.timeRanges.filter((_, itemIndex) => itemIndex !== index) })"
                />
              </div>
              <UButton
                icon="i-lucide-plus"
                variant="link"
                :label="t('booking.editor.addTime')"
                :disabled="form.timeRanges.length >= 12"
                class="px-0"
                @click="update({ timeRanges: [...form.timeRanges, nextBookingTimeRange(form.timeRanges, form.durationMinutes)] })"
              />
            </div>
          </div>
          <p class="text-xs text-muted">
            {{ t('booking.editor.timesUse', { zone: form.timeZone }) }}
          </p>
        </div>
        <button v-else type="button" class="mt-2 flex w-full items-center gap-2 text-left text-sm text-muted" @click="toggle('availability')">
          <UIcon name="i-lucide-calendar-days" class="size-4 shrink-0" />{{ formAvailabilityLabel(form, t) }}
        </button>
      </section>

      <section class="p-5">
        <button type="button" :aria-expanded="activeSection === 'host'" class="flex w-full items-center justify-between gap-3 text-left font-semibold text-highlighted" @click="toggle('host')">
          <span>{{ t('booking.editor.host') }}</span>
          <UIcon name="i-lucide-chevron-down" class="size-5 text-muted transition-transform" :class="activeSection === 'host' && 'rotate-180'" />
        </button>
        <div v-if="activeSection === 'host'" class="mt-4 space-y-4">
          <div class="space-y-2">
            <div v-for="id in form.hostIds" :key="id" class="flex items-center gap-3 rounded-lg bg-elevated px-3 py-2">
              <CalendarBookingHostAvatar v-if="hostFor(id)" :host="hostFor(id)!" :current-user-id="currentUserId" />
              <UAvatar v-else icon="i-lucide-user-round" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-highlighted">{{ hostFor(id)?.name || t('booking.editor.unavailableUser') }}{{ id === currentUserId ? t('booking.editor.you') : '' }}</span>
                <span class="block truncate text-xs text-muted">{{ hostFor(id)?.email }}</span>
              </span>
              <UButton
                v-if="id !== currentUserId"
                size="xs"
                color="neutral"
                variant="ghost"
                :label="t('resend.remove')"
                @click="update({ hostIds: form.hostIds.filter(hostId => hostId !== id) })"
              />
            </div>
          </div>
          <form v-if="canManageHosts" @submit.prevent="addHost">
            <UFormField :label="t('booking.editor.addHost')" :error="hostError || undefined">
              <div class="flex gap-2">
                <UInput
                  v-model="hostQuery"
                  :placeholder="t('booking.editor.nameOrEmail')"
                  autocomplete="off"
                  class="min-w-0 flex-1"
                  @update:model-value="hostError = ''"
                />
                <UButton type="submit" color="neutral" variant="outline" :label="t('booking.editor.add')" />
              </div>
            </UFormField>
          </form>
        </div>
        <button v-else type="button" class="mt-2 flex w-full items-center gap-2 text-left text-sm text-muted" @click="toggle('host')">
          <span class="flex shrink-0 -space-x-1">
            <template v-for="id in form.hostIds.slice(0, 3)" :key="id">
              <CalendarBookingHostAvatar v-if="hostFor(id)" :host="hostFor(id)!" :current-user-id="currentUserId" size="small" />
              <UAvatar v-else icon="i-lucide-user-round" size="2xs" />
            </template>
          </span>
          <span class="truncate">{{ form.hostIds.map(id => hostFor(id)?.name ?? t('booking.editor.userFallback')).join(', ') }}</span>
        </button>
      </section>
    </template>

    <template #footer>
      <UDropdownMenu v-if="editingId" :items="moreItems" :content="{ side: 'top', align: 'end' }">
        <UButton icon="i-lucide-more-horizontal" :label="t('booking.editor.more')" color="neutral" variant="outline" />
      </UDropdownMenu>
      <UButton :label="t('common.cancel')" color="neutral" variant="ghost" :disabled="saving" @click="open = false" />
      <UButton :label="saving ? t('common.saving') : editingId ? t('settings.mailbox.saveChanges') : t('booking.editor.create')" :loading="saving" @click="emit('save')" />
    </template>
  </USlideover>
</template>
