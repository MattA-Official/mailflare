<script setup lang="ts">
// Download the selected mailbox as mbox. Ported from legacy/src/app/(settings)/settings/export/page.tsx.
definePageMeta({ layout: 'dashboard', nav: 'settings' })
const { t } = useLanguage()
const { selectedMailbox } = useSelectedMailbox()
const loading = ref(false)
const error = ref<string | null>(null)

async function exportMailbox() {
  const mailbox = selectedMailbox.value
  if (!mailbox) return
  loading.value = true
  error.value = null
  try {
    const response = await authFetch(`/api/export/messages?${new URLSearchParams({ mailboxId: mailbox.id })}`)
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? t('export.failed'))
    }
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = `${mailbox.localPart}.mbox`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('export.failed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <SettingsMailSettingsPage id="settings-export" :title="t('settings.nav.export')">
    <section class="space-y-4">
      <div>
        <h2 class="text-xl font-semibold text-highlighted">{{ t('export.title') }}</h2>
        <p class="mt-1 text-sm text-muted">{{ t('export.description') }}</p>
      </div>
      <UCard :ui="{ body: 'space-y-3' }">
        <UButton
          icon="i-lucide-download"
          color="neutral"
          variant="outline"
          :disabled="!selectedMailbox || loading"
          :loading="loading"
          :label="loading ? t('export.preparing') : t('export.download')"
          @click="exportMailbox"
        />
        <UAlert v-if="error" color="error" variant="subtle" :description="error" />
      </UCard>
    </section>
  </SettingsMailSettingsPage>
</template>
