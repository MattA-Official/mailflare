<script setup lang="ts">
// The formatting buttons of the rich text editor; rendered twice (phone toolbar row and desktop footer).
import type { TranslationKey } from '#lib/i18n/types'

defineProps<{
  commands: { command: string, labelKey: TranslationKey, icon: string, value?: string }[]
  active: Record<string, boolean>
  disabled?: boolean
}>()
const emit = defineEmits<{ run: [command: string, value?: string], link: [] }>()
const { t } = useLanguage()
</script>

<template>
  <UTooltip v-for="item in commands" :key="item.command" :text="t(item.labelKey)">
    <UButton
      :icon="item.icon"
      :aria-label="t(item.labelKey)"
      :aria-pressed="!!active[item.command]"
      :disabled="disabled"
      :color="active[item.command] ? 'primary' : 'neutral'"
      :variant="active[item.command] ? 'soft' : 'ghost'"
      size="sm"
      @mousedown.prevent
      @click="emit('run', item.command, item.value)"
    />
  </UTooltip>
  <UTooltip :text="t('editor.insertLinkHint')">
    <UButton icon="i-lucide-link-2" :aria-label="t('editor.insertLink')" :disabled="disabled" color="neutral" variant="ghost" size="sm" @mousedown.prevent @click="emit('link')" />
  </UTooltip>
  <UTooltip :text="t('editor.clearFormatting')">
    <UButton icon="i-lucide-remove-formatting" :aria-label="t('editor.clearFormatting')" :disabled="disabled" color="neutral" variant="ghost" size="sm" @mousedown.prevent @click="emit('run', 'removeFormat')" />
  </UTooltip>
</template>
