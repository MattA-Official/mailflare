<script setup lang="ts">
// Multi-select filter by kind of file (photos, videos, documents, others).
// Ported from legacy/src/app/(drive)/drive-type-filter.tsx.
import type { DropdownMenuItem } from '@nuxt/ui'
import { DRIVE_CATEGORIES, type DriveCategory } from '#lib/drive/category-names'

const props = defineProps<{ modelValue: DriveCategory[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: DriveCategory[]] }>()
const { t } = useLanguage()

// Local copy so quick successive clicks build on each other while the URL update is in flight.
const value = ref<DriveCategory[]>([...props.modelValue])
watch(() => props.modelValue.join(','), (key) => {
  value.value = key ? key.split(',') as DriveCategory[] : []
})
function update(next: DriveCategory[]) {
  value.value = next
  emit('update:modelValue', next)
}

const items = computed<DropdownMenuItem[][]>(() => {
  const labels: Record<DriveCategory, string> = { photos: t('drive.photos'), videos: t('drive.videos'), documents: t('drive.documents'), others: t('drive.others') }
  const checks: DropdownMenuItem[] = DRIVE_CATEGORIES.map(category => ({
    type: 'checkbox',
    label: labels[category],
    checked: value.value.includes(category),
    onUpdateChecked: (checked: boolean) => update(checked ? [...value.value, category] : value.value.filter(entry => entry !== category)),
    onSelect: (event: Event) => event.preventDefault(),
  }))
  return value.value.length ? [checks, [{ label: t('drive.clearFilter'), onSelect: () => update([]) }]] : [checks]
})
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton
      :color="value.length ? 'primary' : 'neutral'"
      :variant="value.length ? 'soft' : 'outline'"
      icon="i-lucide-list-filter"
      class="rounded-full"
      :aria-label="t('drive.typeFilter')"
    >
      {{ t('drive.typeFilter') }}
      <UBadge v-if="value.length" :label="String(value.length)" size="sm" class="rounded-full" />
    </UButton>
  </UDropdownMenu>
</template>
