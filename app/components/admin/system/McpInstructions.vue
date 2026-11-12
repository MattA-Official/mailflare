<script setup lang="ts">
// Ported from legacy/src/components/settings/mcp-agent-instructions.tsx.
import { buildMcpAgentPrompt } from '~/utils/admin/system/settings'

const props = defineProps<{ mode: 'mail' | 'admin', apiKey: string }>()
const { t } = useLanguage()
const copied = ref(false)
const prompt = computed(() => buildMcpAgentPrompt(window.location.origin, props))

async function copy() {
  await navigator.clipboard.writeText(prompt.value)
  copied.value = true
}
</script>

<template>
  <div class="space-y-2 rounded-lg border border-default p-3">
    <div class="flex items-center justify-between gap-3">
      <strong class="text-sm">{{ t('mcp.instructions') }}</strong>
      <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-copy" :label="copied ? t('common.copied') : t('mcp.copyPrompt')" @click="copy" />
    </div>
    <pre class="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-elevated p-3 text-xs text-toned">{{ prompt }}</pre>
  </div>
</template>
