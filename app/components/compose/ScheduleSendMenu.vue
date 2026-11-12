<script setup lang="ts">
// The menu beside Send: templates, schedule presets and a date picker. Ported from
// legacy/src/components/compose/schedule-send-menu.tsx and template-menu.tsx; on phones it opens
// <ComposeScheduleSendSheet> instead.
import type { DropdownMenuItem } from '@nuxt/ui'
import { getUserTimeZone } from '#lib/time/utils'
import type { ComposeTemplate } from '~/types/compose/compose'
import { useIsPhone } from '~/utils/compose/media'
import { formatDateTimeLocal, formatScheduledSend, getScheduleSendOptions, isPastSchedule, parseDateTimeLocal } from '~/utils/compose/schedule-send-utils'
import { deleteTemplate, fetchTemplates, templateContent } from '~/utils/compose/templates'

defineProps<{ disabled?: boolean, mailboxId?: string | null, from: string }>()
const value = defineModel<Date | null>({ required: true })
const emit = defineEmits<{ applyTemplate: [template: { title: string, html: string }] }>()
const { t } = useLanguage()
const isPhone = useIsPhone()
const newTemplateOpen = ref(false)
const sheetOpen = ref(false)
const pickedText = ref<string | null>(null)
const templates = ref<ComposeTemplate[]>([])

const picked = computed(() => pickedText.value === null ? null : parseDateTimeLocal(pickedText.value))
const pastPicked = computed(() => picked.value !== null && isPastSchedule(picked.value))
const pickerValue = computed(() => pickedText.value ?? (value.value ? formatDateTimeLocal(value.value) : ''))
const minimum = computed(() => formatDateTimeLocal(new Date()))

function pick(text: string) {
  const parsed = parseDateTimeLocal(text)
  pickedText.value = text
  if (!parsed) value.value = null
  else if (!isPastSchedule(parsed)) value.value = parsed
}

async function onOpen(open: boolean) {
  pickedText.value = null
  if (open) templates.value = await fetchTemplates()
}

async function remove(id: string) {
  if (await deleteTemplate(id)) templates.value = templates.value.filter(template => template.id !== id)
}

const items = computed<DropdownMenuItem[][]>(() => {
  const templateItems: DropdownMenuItem[] = templates.value.length === 0
    ? [{ label: t('template.none'), disabled: true }]
    : templates.value.map(template => ({
        label: template.subject || t('template.untitled'),
        slot: 'template' as const,
        templateId: template.id,
        onSelect: () => emit('applyTemplate', templateContent(template)),
      }))
  const schedule: DropdownMenuItem[] = [{ type: 'label', label: t('schedule.heading') }]
  if (value.value) schedule.push({ label: t('schedule.clear'), icon: 'i-lucide-x', onSelect: () => { value.value = null } })
  for (const option of getScheduleSendOptions()) {
    schedule.push({ label: t(option.labelKey), suffix: formatScheduledSend(option.value), slot: 'option' as const, onSelect: () => { value.value = option.value } })
  }
  return [
    [{
      label: t('template.menu'),
      icon: 'i-lucide-file-text',
      children: [templateItems, [{ label: t('template.new'), icon: 'i-lucide-plus', color: 'primary', onSelect: () => { newTemplateOpen.value = true } }]],
    }],
    schedule,
    [
      { type: 'label', label: t('schedule.pick', { timeZone: getUserTimeZone() }) },
      { slot: 'picker' as const, onSelect: (event: Event) => event.preventDefault() },
    ],
  ]
})
</script>

<template>
  <UButton
    v-if="isPhone"
    icon="i-lucide-chevron-down"
    :disabled="disabled"
    :aria-label="t('schedule.optionsLabel')"
    class="rounded-l-none border-l border-white/30 max-md:h-10"
    @click="sheetOpen = true"
  />
  <UDropdownMenu v-else :items="items" :disabled="disabled" :content="{ align: 'start', sideOffset: 6 }" :ui="{ content: 'min-w-56' }" @update:open="onOpen">
    <UButton icon="i-lucide-chevron-down" :disabled="disabled" :aria-label="t('schedule.optionsLabel')" class="rounded-l-none border-l border-white/30" />
    <template #template-trailing="{ item }">
      <UButton
        icon="i-lucide-trash-2"
        color="neutral"
        variant="ghost"
        size="xs"
        :aria-label="t('template.delete')"
        class="hover:text-error"
        @pointerdown.stop
        @click.stop.prevent="remove((item as DropdownMenuItem).templateId)"
      />
    </template>
    <template #option-trailing="{ item }">
      <span class="ms-2 text-xs text-muted">{{ (item as DropdownMenuItem).suffix }}</span>
    </template>
    <template #picker>
      <div class="w-full" @keydown.stop>
        <input
          type="datetime-local"
          :min="minimum"
          :value="pickerValue"
          :aria-invalid="pastPicked"
          :aria-describedby="pastPicked ? 'schedule-past-time' : undefined"
          :aria-label="t('schedule.pick', { timeZone: getUserTimeZone() })"
          class="h-9 w-full rounded-md border border-default bg-default px-2 text-sm outline-none focus:border-primary"
          @input="pick(($event.target as HTMLInputElement).value)"
          @click.stop
        >
        <p v-if="pastPicked" id="schedule-past-time" role="alert" class="mt-1 text-xs text-error">{{ t('schedule.pastTime') }}</p>
      </div>
    </template>
  </UDropdownMenu>
  <ComposeScheduleSendSheet
    v-if="isPhone"
    v-model:open="sheetOpen"
    v-model="value"
    show-templates
    @apply-template="emit('applyTemplate', $event)"
    @new-template="newTemplateOpen = true"
  />
  <ComposeNewTemplateDialog v-model:open="newTemplateOpen" :mailbox-id="mailboxId" :from="from" />
</template>
