<script setup lang="ts">
// Phone version of the Send options menu, ported from
// legacy/src/components/compose/schedule-send-sheet.tsx: a bottom drawer with a root page, a date
// page and a templates page. Also used by the scheduled message banner to reschedule.
import { getUserTimeZone } from '#lib/time/utils'
import type { ComposeTemplate } from '~/types/compose/compose'
import { formatDateTimeLocal, formatScheduledSend, getScheduleSendOptions, isPastSchedule, parseDateTimeLocal } from '~/utils/compose/schedule-send-utils'
import { fetchTemplates, templateContent } from '~/utils/compose/templates'

const props = withDefaults(defineProps<{
  /** Shows the "Clear schedule" row; rescheduling hides it. */
  allowClear?: boolean
  /** Adds the templates page. */
  showTemplates?: boolean
}>(), { allowClear: true, showTemplates: false })
const open = defineModel<boolean>('open', { required: true })
const value = defineModel<Date | null>({ required: true })
const emit = defineEmits<{ applyTemplate: [template: { title: string, html: string }], newTemplate: [] }>()
const { t } = useLanguage()
const page = ref<'root' | 'date' | 'templates'>('root')
const templates = ref<ComposeTemplate[]>([])
const draftDate = ref('')

const options = computed(() => getScheduleSendOptions())
const minimum = computed(() => formatDateTimeLocal(new Date()))
const parsedDate = computed(() => parseDateTimeLocal(draftDate.value))
const pastDate = computed(() => parsedDate.value !== null && isPastSchedule(parsedDate.value))
const pickLabel = computed(() => t('schedule.pick', { timeZone: getUserTimeZone() }))
const title = computed(() => page.value === 'date' ? pickLabel.value : page.value === 'templates' ? t('template.menu') : t('schedule.heading'))

watch(open, async (isOpen) => {
  if (!isOpen) return
  page.value = 'root'
  draftDate.value = value.value ? formatDateTimeLocal(value.value) : ''
  if (props.showTemplates) templates.value = await fetchTemplates()
})

function choose(date: Date | null) {
  value.value = date
  open.value = false
}

const rowClass = 'flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-start text-base text-highlighted active:bg-elevated'
</script>

<template>
  <UDrawer v-model:open="open" :title="title" :description="t('schedule.optionsLabel')" :ui="{ description: 'sr-only', container: 'max-h-[85dvh] pb-[env(safe-area-inset-bottom)]' }">
    <template #header>
      <div class="flex h-12 w-full items-center gap-1">
        <span v-if="page === 'root'" class="w-10" />
        <UButton v-else icon="i-lucide-chevron-left" color="neutral" variant="ghost" size="lg" :aria-label="t('schedule.heading')" @click="page = 'root'" />
        <h2 class="flex-1 truncate text-center text-base font-semibold text-highlighted">{{ title }}</h2>
        <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="lg" :aria-label="t('navigation.close')" @click="open = false" />
      </div>
    </template>
    <template #body>
      <div v-if="page === 'root'" class="flex flex-col">
        <button v-if="allowClear && value" type="button" :class="rowClass" @click="choose(null)">
          <UIcon name="i-lucide-x" class="size-5 text-muted" />{{ t('schedule.clear') }}
        </button>
        <button v-for="option in options" :key="option.labelKey" type="button" :class="[rowClass, 'justify-between']" @click="choose(option.value)">
          <span>{{ t(option.labelKey) }}</span>
          <span class="text-sm text-muted">{{ formatScheduledSend(option.value) }}</span>
        </button>
        <button type="button" :class="[rowClass, 'mt-2 justify-between']" @click="page = 'date'">
          <span class="flex items-center gap-3"><UIcon name="i-lucide-calendar-clock" class="size-5 text-muted" />{{ pickLabel }}</span>
          <UIcon name="i-lucide-chevron-right" class="size-5 text-dimmed" />
        </button>
        <button v-if="showTemplates" type="button" :class="[rowClass, 'justify-between']" @click="page = 'templates'">
          <span class="flex items-center gap-3"><UIcon name="i-lucide-file-text" class="size-5 text-muted" />{{ t('template.menu') }}</span>
          <UIcon name="i-lucide-chevron-right" class="size-5 text-dimmed" />
        </button>
      </div>
      <div v-else-if="page === 'date'" class="px-2">
        <input
          v-model="draftDate"
          type="datetime-local"
          :min="minimum"
          :aria-label="pickLabel"
          :aria-invalid="pastDate"
          :aria-describedby="pastDate ? 'schedule-past-time' : undefined"
          class="h-12 w-full rounded-xl border border-default bg-default px-3 text-base outline-none focus:border-primary"
        >
        <p v-if="pastDate" id="schedule-past-time" role="alert" class="mt-2 text-sm text-error">{{ t('schedule.pastTime') }}</p>
        <UButton block size="xl" class="mt-4" :disabled="!parsedDate || pastDate" :label="t('schedule.heading')" @click="choose(parsedDate)" />
      </div>
      <div v-else class="flex flex-col">
        <p v-if="templates.length === 0" class="px-3 py-3 text-sm text-muted">{{ t('template.none') }}</p>
        <button
          v-for="template in templates"
          :key="template.id"
          type="button"
          :class="rowClass"
          @click="emit('applyTemplate', templateContent(template)); open = false"
        >
          <span class="break-words">{{ template.subject || t('template.untitled') }}</span>
        </button>
        <button type="button" :class="[rowClass, 'mt-2 text-primary']" @click="open = false; emit('newTemplate')">
          <UIcon name="i-lucide-plus" class="size-5" />{{ t('template.new') }}
        </button>
      </div>
    </template>
  </UDrawer>
</template>
