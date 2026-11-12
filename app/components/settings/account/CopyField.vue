<script setup lang="ts">
// A labelled value with a copy button, from the Field helper in email-clients-settings.tsx.
defineProps<{ label: string, value: string, copied: boolean, mono?: boolean }>()
const emit = defineEmits<{ copy: [] }>()
const { t } = useLanguage()
</script>

<template>
  <div class="flex items-center gap-3">
    <span class="w-36 shrink-0 text-xs font-medium uppercase tracking-wide text-muted">{{ label }}</span>
    <code class="min-w-0 flex-1 truncate rounded-md bg-default px-2 py-1 text-sm" :class="mono ? 'font-mono' : 'font-sans'">{{ value }}</code>
    <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-copy" :aria-label="t('common.copyLabel', { label })" :label="copied ? t('common.copied') : t('common.copy')" @click="emit('copy')" />
  </div>
</template>
