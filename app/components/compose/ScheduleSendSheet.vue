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

// Sheet rows: large, full-width ghost buttons sized for touch.
const row = {
  color: 'neutral',
  variant: 'ghost',
  size: 'xl',
  block: true,
  class: 'min-h-12 justify-start gap-3 rounded-xl px-3 text-start font-normal text-highlighted',
  ui: { leadingIcon: 'size-5 text-muted', trailingIcon: 'ms-auto size-5 text-dimmed', label: 'whitespace-normal break-words' },
} as const
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
        <UButton v-if="allowClear && value" v-bind="row" icon="i-lucide-x" :label="t('schedule.clear')" @click="choose(null)" />
        <UButton v-for="option in options" :key="option.labelKey" v-bind="row" :label="t(option.labelKey)" @click="choose(option.value)">
          <template #trailing>
            <span class="ms-auto text-sm text-muted">{{ formatScheduledSend(option.value) }}</span>
          </template>
        </UButton>
        <UButton v-bind="row" icon="i-lucide-calendar-clock" trailing-icon="i-lucide-chevron-right" :label="pickLabel" class="mt-2" @click="page = 'date'" />
        <UButton v-if="showTemplates" v-bind="row" icon="i-lucide-file-text" trailing-icon="i-lucide-chevron-right" :label="t('template.menu')" @click="page = 'templates'" />
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
        <UButton
          v-for="template in templates"
          :key="template.id"
          v-bind="row"
          :label="template.subject || t('template.untitled')"
          @click="emit('applyTemplate', templateContent(template)); open = false"
        />
        <UButton v-bind="row" color="primary" icon="i-lucide-plus" :label="t('template.new')" class="mt-2 text-primary" :ui="{ leadingIcon: 'size-5' }" @click="open = false; emit('newTemplate')" />
      </div>
    </template>
  </UDrawer>
</template>
