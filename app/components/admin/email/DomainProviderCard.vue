<script setup lang="ts">
// One selectable provider: icon-left header with a switch, its config when on, a clean-up bar
// when off but still configured. Ported from legacy/src/app/(admin)/domains/ProviderCard.tsx.
defineProps<{
  title: string
  description: string
  /** true = set up, false = needs setup, null = unknown or not applicable (no icon). */
  ok: boolean | null
  selected: boolean
  disabled?: boolean
  cleanup?: { present: boolean, busy: boolean, disabled?: boolean } | null
}>()
const emit = defineEmits<{ toggle: [boolean], cleanup: [] }>()
const { t } = useLanguage()
</script>

<template>
  <li class="rounded-lg bg-elevated/60 px-4 py-3 text-sm">
    <div class="flex items-center justify-between gap-3">
      <template v-if="ok !== null">
        <span v-if="ok" :title="t('domains.setUp')" class="flex size-7 shrink-0 items-center justify-center rounded-full bg-success text-inverted">
          <UIcon name="i-lucide-check" class="size-4" />
        </span>
        <span v-else :title="t('domains.needsSetup')" class="flex size-7 shrink-0 items-center justify-center rounded-full bg-warning/15">
          <UIcon name="i-lucide-triangle-alert" class="size-4 text-warning" />
        </span>
      </template>
      <span class="min-w-0 flex-1">
        <span class="block font-medium text-highlighted">{{ title }}</span>
        <span class="block text-xs text-muted">{{ description }}</span>
      </span>
      <USwitch :aria-label="title" :model-value="selected" :disabled="disabled" @update:model-value="value => emit('toggle', value)" />
    </div>
    <div v-if="selected && $slots.default" class="mt-3 border-t border-default pt-3">
      <slot />
    </div>
    <div v-if="!selected && cleanup?.present" class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-default pt-3 text-xs text-muted">
      <span>{{ t('domains.stillSetUp', { title }) }}</span>
      <UButton size="sm" color="neutral" variant="outline" :disabled="cleanup.busy || cleanup.disabled" :label="cleanup.busy ? t('domains.removing') : t('domains.cleanUp')" @click="emit('cleanup')" />
    </div>
  </li>
</template>
