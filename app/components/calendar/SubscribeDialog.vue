<script setup lang="ts">
// Creates a calendar:read API key and shows the iCalendar feed URL to subscribe to from Google,
// Outlook or a phone. Ported from legacy/src/app/(calendar)/calendar/subscribe-dialog.tsx.
import { authFetch } from '~/utils/auth-client'

const open = defineModel<boolean>('open', { default: false })
const { t } = useLanguage()
const toast = useToast()
const url = ref('')
const pending = ref(false)

watch(open, (value) => {
  if (!value) url.value = ''
})

async function createLink() {
  pending.value = true
  try {
    // A key that can only read the calendar: it cannot open mail, and Settings, API keys revokes it.
    const response = await authFetch('/api/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Calendar subscription ${new Date().toISOString().slice(0, 10)}`, scopes: ['calendar:read'], mailboxIds: [] }),
    })
    const data = await response.json().catch(() => ({})) as { key?: string }
    if (!response.ok || !data.key) throw new Error(t('calendar.subscribe.failed'))
    url.value = `${window.location.origin}/api/calendar/feed?key=${encodeURIComponent(data.key)}`
  }
  catch (error) {
    toast.add({ title: error instanceof Error ? error.message : t('calendar.subscribe.failed'), color: 'error' })
  }
  finally {
    pending.value = false
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(url.value)
    toast.add({ title: t('calendar.subscribe.copied'), color: 'success' })
  }
  catch {
    toast.add({ title: t('calendar.subscribe.copyFailed'), color: 'error' })
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('calendar.subscribe.title')"
    :description="t('calendar.subscribe.description')"
    :ui="{ content: 'max-h-[calc(100vh-4rem)] max-w-xl overflow-y-auto' }"
  >
    <template #body>
      <div v-if="url" class="space-y-4 text-sm text-default">
        <div class="flex items-center gap-2">
          <UInput
            :model-value="url"
            readonly
            :aria-label="t('calendar.subscribe.link')"
            class="min-w-0 flex-1"
            :ui="{ base: 'text-xs' }"
            @focus="($event.target as HTMLInputElement).select()"
          />
          <UButton icon="i-lucide-copy" color="neutral" variant="outline" :label="t('calendar.subscribe.copy')" class="shrink-0" @click="copy" />
        </div>
        <p class="font-medium text-warning">
          {{ t('calendar.subscribe.once') }}
        </p>
        <ul class="list-disc space-y-1 pl-5">
          <li>{{ t('calendar.subscribe.google') }}</li>
          <li>{{ t('calendar.subscribe.outlook') }}</li>
          <li>{{ t('calendar.subscribe.apple') }}</li>
        </ul>
        <p class="text-muted">
          {{ t('calendar.subscribe.revoke') }}
        </p>
      </div>
      <div v-else class="space-y-4 text-sm text-default">
        <p>{{ t('calendar.subscribe.explain') }}</p>
        <UButton :label="t('calendar.subscribe.create')" :loading="pending" @click="createLink" />
      </div>
    </template>
  </UModal>
</template>
