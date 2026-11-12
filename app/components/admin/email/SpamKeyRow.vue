<script setup lang="ts">
// One blocklist key (Spamhaus DQS or abuse.ch). KeyRow in legacy/src/app/(admin)/spam-filter/page.tsx.
import type { SpamFilterSettingsResponse, SpamKeyField, SpamKeySource } from '~/types/admin/email/spam-filter'
import { errorMessage } from '~/utils/admin/email/domains'
import { saveSpamFilterSettings } from '~/utils/admin/email/spam-filter'

const props = defineProps<{ field: SpamKeyField, envName: string, title: string, hint: string, signupUrl: string, source: SpamKeySource, disabled: boolean }>()
const emit = defineEmits<{ saved: [SpamFilterSettingsResponse] }>()
const { t } = useLanguage()
const value = ref('')
const saving = ref(false)
const status = ref<{ text: string, error: boolean } | null>(null)
const inputId = computed(() => `spam-key-${props.field}`)

async function save(key: string | null) {
  saving.value = true
  status.value = null
  try {
    emit('saved', await saveSpamFilterSettings({ [props.field]: key }))
    value.value = ''
    status.value = { text: key ? t('spamFilter.keySavedStatus') : t('spamFilter.keyRemovedStatus'), error: false }
  } catch (error) {
    status.value = { text: errorMessage(error, t('spamFilter.saveFailed')), error: true }
  } finally {
    saving.value = false
  }
}

const sourceText = computed(() => props.source === 'settings' ? t('spamFilter.keySaved') : props.source === 'env' ? t('spamFilter.keyFromEnv', { name: props.envName }) : t('spamFilter.keyMissing'))
</script>

<template>
  <form class="space-y-2" @submit.prevent="value.trim() && save(value.trim())">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <label :for="inputId" class="font-medium text-highlighted">{{ title }}</label>
      <ULink :to="signupUrl" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-sm font-medium">
        {{ t('spamFilter.getKey') }}
        <UIcon name="i-lucide-external-link" class="size-3.5" aria-hidden="true" />
      </ULink>
    </div>
    <p class="text-sm text-muted">
      {{ hint }}
    </p>
    <p class="text-sm" :class="source ? 'text-success' : 'text-muted'">
      {{ sourceText }}
    </p>
    <div class="flex flex-wrap gap-2">
      <UInput :id="inputId" v-model="value" type="password" autocomplete="off" spellcheck="false" :disabled="disabled || saving" :placeholder="source ? t('spamFilter.keyReplacePlaceholder') : t('spamFilter.keyPlaceholder')" class="max-w-md flex-1" />
      <UButton type="submit" :disabled="disabled || saving || !value.trim()" :label="saving ? t('common.saving') : t('spamFilter.saveKey')" />
      <UButton v-if="source === 'settings'" color="neutral" variant="outline" :disabled="disabled || saving" :label="t('spamFilter.removeKey')" @click="save(null)" />
    </div>
    <p v-if="status" :role="status.error ? 'alert' : 'status'" class="text-sm" :class="status.error ? 'text-error' : 'text-toned'">
      {{ status.text }}
    </p>
  </form>
</template>
