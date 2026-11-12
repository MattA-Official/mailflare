<script setup lang="ts">
// Ported from the RecoveryCodesList in legacy/src/components/settings/two-step-settings.tsx.
const props = defineProps<{ codes: string[] }>()
const { t } = useLanguage()
const copied = ref(false)

async function copy() {
  await navigator.clipboard.writeText(props.codes.join('\n'))
  copied.value = true
}
</script>

<template>
  <div class="space-y-3">
    <ul class="grid grid-cols-2 gap-2 rounded-lg bg-elevated/50 p-4 font-mono text-sm text-default">
      <li v-for="code in codes" :key="code">
        {{ code }}
      </li>
    </ul>
    <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-copy" :label="copied ? t('common.copied') : t('mfa.copyCodes')" @click="copy" />
  </div>
</template>
