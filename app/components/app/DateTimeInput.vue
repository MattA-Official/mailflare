<script setup lang="ts">
// A date field with a calendar and a time field, editing one "YYYY-MM-DDTHH:mm" string: the format
// <input type="datetime-local"> used, so callers keep parsing it in the user's time zone as before.
// Segments and month names follow the app language through UApp's locale.
import { parseDate, parseTime, Time, type CalendarDate, type DateValue } from '@internationalized/date'

const model = defineModel<string>({ default: '' })
const props = withDefaults(defineProps<{
  /** The earliest date that can be picked, in the same format. */
  min?: string
  invalid?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  label?: string
  disabled?: boolean
}>(), { size: 'md', min: undefined, label: undefined })
/** Enter, a calendar pick, or focus leaving both fields: the moment to save a change. */
const emit = defineEmits<{ commit: [] }>()

const { t } = useLanguage()
const root = useTemplateRef<HTMLElement>('root')
const calendarOpen = ref(false)

function split(value: string): { date?: CalendarDate, time?: Time } {
  const [day, clock] = value.split('T')
  try {
    return { date: day ? parseDate(day) : undefined, time: clock ? parseTime(clock) : undefined }
  }
  catch {
    return {}
  }
}

const parts = computed(() => split(model.value))
const minDate = computed(() => (props.min ? split(props.min).date : undefined))

function write(date: CalendarDate | undefined, time: Time | undefined) {
  if (!date) return
  const at = time ?? new Time(9, 0)
  model.value = `${date.toString()}T${String(at.hour).padStart(2, '0')}:${String(at.minute).padStart(2, '0')}`
}

function setDate(value: DateValue | null | undefined) {
  if (value) write(parseDate(value.toString().slice(0, 10)), parts.value.time)
}
function setTime(value: Time | null | undefined) {
  if (value) write(parts.value.date, value)
}
function pickFromCalendar(value: DateValue | null | undefined) {
  setDate(value)
  calendarOpen.value = false
  emit('commit')
}

// Enter in a date or time segment saves; Enter on the calendar button still opens the calendar.
function onEnter(event: KeyboardEvent) {
  if ((event.target as HTMLElement | null)?.closest('button')) return
  event.preventDefault()
  emit('commit')
}

function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (!calendarOpen.value && (!next || !root.value?.contains(next))) emit('commit')
}
</script>

<template>
  <div
    ref="root"
    role="group"
    :aria-label="label"
    class="flex flex-wrap items-center gap-2"
    @focusout="onFocusOut"
    @keydown.enter="onEnter"
  >
    <UInputDate
      :model-value="parts.date"
      :min-value="minDate"
      :size="size"
      :disabled="disabled"
      :color="invalid ? 'error' : undefined"
      :highlight="invalid"
      :aria-invalid="invalid || undefined"
      class="w-auto flex-1"
      @update:model-value="value => setDate(value as DateValue | null)"
    >
      <template #trailing>
        <UPopover v-model:open="calendarOpen">
          <UButton
            color="neutral"
            variant="link"
            :size="size === 'xl' ? 'md' : 'sm'"
            icon="i-lucide-calendar"
            :disabled="disabled"
            :aria-label="t('calendar.chooseDate')"
            class="px-0"
          />
          <template #content>
            <UCalendar :model-value="parts.date" :min-value="minDate" class="p-2" @update:model-value="value => pickFromCalendar(value as DateValue | null)" />
          </template>
        </UPopover>
      </template>
    </UInputDate>
    <UInputTime
      :model-value="parts.time"
      :size="size"
      :disabled="disabled"
      :color="invalid ? 'error' : undefined"
      :highlight="invalid"
      :aria-invalid="invalid || undefined"
      class="w-auto"
      @update:model-value="value => setTime(value as Time | null)"
    />
  </div>
</template>
