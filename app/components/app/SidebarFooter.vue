<script setup lang="ts">
// Cheat-sheet button and the "Powered by" credit under the sidebar (upstream sidebar-footer).
import packageJson from '../../../package.json'

defineProps<{ collapsed?: boolean }>()

const { t } = useLanguage()
const { shortcutsActive, openHelpModal } = useShortcuts()
const version = packageJson.version
const host = import.meta.client ? location.hostname : ''
</script>

<template>
  <div v-if="!collapsed" class="flex w-full flex-col gap-2">
    <UButton v-if="shortcutsActive" color="neutral" variant="ghost" size="xs" icon="i-lucide-keyboard" block class="justify-between text-muted" @click="openHelpModal">
      <span class="flex-1 text-left">{{ t('navigation.shortcuts') }}</span>
      <UKbd value="?" />
    </UButton>
    <p class="px-1 text-[11px] text-muted">
      {{ t('navigation.poweredBy') }}
      <a :href="`https://mailflare.co/?ref=${host}&v=${version}`" target="_blank" rel="noreferrer" class="hover:underline">Mailflare v{{ version }}</a>
    </p>
  </div>
</template>
