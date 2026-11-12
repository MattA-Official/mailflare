<script setup lang="ts">
import type { Locale } from '#lib/i18n/types'

const { locale, locales, setLocale } = useLanguage()
const items = Object.entries(locales).map(([value, entry]) => ({ value, label: entry.label }))
</script>

<template>
  <USelectMenu
    :model-value="locale"
    :items="items"
    value-key="value"
    icon="i-lucide-languages"
    variant="ghost"
    size="sm"
    class="w-48"
    @update:model-value="setLocale($event as Locale)"
  />
</template>
