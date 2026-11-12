<script setup lang="ts">
// Picks how many days without a reply before a reminder, ported from
// legacy/src/components/follow-ups/follow-up-menu.tsx. The default slot is the trigger (one
// focusable element); passing `clearable` adds a "no reminder" entry that emits `clear`.
import type { DropdownMenuItem } from '@nuxt/ui'
import { FOLLOW_UP_DAY_OPTIONS } from '#lib/follow-ups/follow-up-utils'
import { followUpOptionKey } from '~/utils/compose/follow-up-utils'

const props = defineProps<{ disabled?: boolean, clearable?: boolean }>()
const emit = defineEmits<{ pick: [days: number], clear: [] }>()
const { t } = useLanguage()

const items = computed<DropdownMenuItem[][]>(() => {
  const groups: DropdownMenuItem[][] = [[
    { type: 'label', label: t('followUp.remindMe') },
    ...FOLLOW_UP_DAY_OPTIONS.map(days => ({ label: t(followUpOptionKey(days)), onSelect: () => emit('pick', days) })),
  ]]
  if (props.clearable) groups.push([{ label: t('followUp.none'), icon: 'i-lucide-x', onSelect: () => emit('clear') }])
  return groups
})
</script>

<template>
  <UDropdownMenu :items="items" :disabled="disabled" :content="{ align: 'start', sideOffset: 6 }">
    <slot />
  </UDropdownMenu>
</template>
