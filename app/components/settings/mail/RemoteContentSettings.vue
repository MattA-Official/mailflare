<script setup lang="ts">
// When to load remote images. Ported from legacy/src/components/settings/remote-content-settings.tsx.
type RemoteContentMode = 'ask' | 'new_sender' | 'allow'

const { t } = useLanguage()
const { data: mode, status, error: loadError } = useAsyncData(
  'settings-remote-content',
  () => api<{ mode: RemoteContentMode }>('/api/settings/remote-content').then(data => data.mode),
  { default: () => 'allow' as RemoteContentMode },
)
const loading = computed(() => status.value === 'pending')
const saving = ref(false)
const saveError = ref<string | null>(null)
const error = computed(() => saveError.value ?? (loadError.value ? apiErrorMessage(loadError.value, t('settings.remoteContent.failed')) : null))

const items = computed(() => [
  { value: 'ask', label: t('settings.remoteContent.ask') },
  { value: 'new_sender', label: t('settings.remoteContent.newSender') },
  { value: 'allow', label: t('settings.remoteContent.allow') },
])

async function choose(next: RemoteContentMode) {
  const previous = mode.value
  mode.value = next
  saving.value = true
  saveError.value = null
  try {
    mode.value = (await api<{ mode: RemoteContentMode }>('/api/settings/remote-content', { method: 'PATCH', body: { mode: next } })).mode
    // The reader listens for this to re-apply the policy.
    window.dispatchEvent(new Event('mailflare:remote-content-changed'))
  } catch (cause) {
    mode.value = previous
    saveError.value = cause instanceof Error ? cause.message : t('settings.remoteContent.failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <URadioGroup
      :model-value="mode"
      :items="items"
      :disabled="loading || saving"
      :aria-label="t('settingsPage.inbox.remoteContent')"
      variant="card"
      :ui="{ fieldset: 'gap-3', item: 'w-full' }"
      @update:model-value="choose($event as RemoteContentMode)"
    />
    <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" class="mx-4 mt-2 w-auto" />
  </div>
</template>
