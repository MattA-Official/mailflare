<script setup lang="ts">
// Theme preference. Ported from legacy/src/components/settings/appearance-settings.tsx; the theme is
// kept by @nuxtjs/color-mode under upstream's storage key.
const { t } = useLanguage()
const colorMode = useColorMode()

const items = computed(() => [
  { value: 'system', label: t('settings.theme.system') },
  { value: 'light', label: t('settings.theme.light') },
  { value: 'dark', label: t('settings.theme.dark') },
])
</script>

<template>
  <SettingsMailSettingRow :title="t('settings.theme.label')" :description="t('settings.theme.description')">
    <USelect v-model="colorMode.preference" :items="items" :aria-label="t('settings.theme.label')" class="w-40" />
  </SettingsMailSettingRow>
</template>
