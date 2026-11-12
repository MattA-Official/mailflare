<script setup lang="ts">
// When to load remote images. Ported from legacy/src/components/settings/remote-content-settings.tsx.
type RemoteContentMode = 'ask' | 'new_sender' | 'allow'

const { t } = useLanguage()
const mode = ref<RemoteContentMode>('allow')
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)

const items = computed(() => [
  { value: 'ask', label: t('settings.remoteContent.ask') },
  { value: 'new_sender', label: t('settings.remoteContent.newSender') },
  { value: 'allow', label: t('settings.remoteContent.allow') },
])

onMounted(async () => {
  try {
    mode.value = (await api<{ mode: RemoteContentMode }>('/api/settings/remote-content')).mode
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('settings.remoteContent.failed')
  } finally {
    loading.value = false
  }
})

async function choose(next: RemoteContentMode) {
  const previous = mode.value
  mode.value = next
  saving.value = true
  error.value = null
  try {
    mode.value = (await api<{ mode: RemoteContentMode }>('/api/settings/remote-content', { method: 'PATCH', body: { mode: next } })).mode
    // The reader listens for this to re-apply the policy.
    window.dispatchEvent(new Event('mailflare:remote-content-changed'))
  } catch (cause) {
    mode.value = previous
    error.value = cause instanceof Error ? cause.message : t('settings.remoteContent.failed')
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
    <p v-if="error" role="alert" class="mt-2 px-4 text-sm text-error">{{ error }}</p>
  </div>
</template>
