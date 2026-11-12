<script setup lang="ts">
// Confirms a calendar change the assistant proposed (delete or update events).
// Ported from legacy/src/app/(dashboard)/agent/calendar-review/page.tsx.
definePageMeta({ layout: 'dashboard' })

type Preview = {
  action: 'delete' | 'update'
  events: { id: string, title: string, repeats: boolean, startsAt: string }[]
  changes: Record<string, unknown>[] | null
}

const { t } = useLanguage()
useHead({ title: () => t('agent.calendarReview.title') })
const route = useRoute()
const router = useRouter()
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')
const preview = ref<Preview | null>(null)
const error = ref<string | null>(null)
const done = ref(false)
const busy = ref(false)

watch(token, async (value) => {
  preview.value = null
  error.value = null
  try {
    const response = await authFetch(`/api/agent/calendar-confirmation?token=${encodeURIComponent(value)}`)
    const data = await response.json().catch(() => ({})) as Preview & { error?: string }
    if (!response.ok) throw new Error(data.error || t('agent.calendarReview.loadFailed'))
    preview.value = data
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('agent.calendarReview.loadFailed')
  }
}, { immediate: true })

async function confirm() {
  busy.value = true
  try {
    await api('/api/agent/calendar-confirmation', { method: 'POST', body: { token: token.value } })
    done.value = true
  } catch (cause) {
    error.value = cause instanceof Error && cause.message ? cause.message : t('agent.calendarReview.failed')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="agent-calendar-review">
    <template #header>
      <UDashboardNavbar :title="t('agent.calendarReview.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="max-w-2xl">
        <p v-if="error" role="alert" class="text-error">{{ error }}</p>
        <p v-if="!error && !preview">{{ t('agent.calendarReview.loading') }}</p>
        <p v-if="done">{{ t('agent.calendarReview.done') }}</p>
        <template v-if="preview && !done">
          <p>{{ preview.action === 'delete' ? t('agent.calendarReview.deleteIntro') : t('agent.calendarReview.updateIntro') }}</p>
          <ul class="mt-2 list-disc pl-6">
            <li v-for="event in preview.events" :key="event.id">
              {{ event.title }} · {{ new Date(event.startsAt).toLocaleString() }}{{ event.repeats ? ` · ${t('agent.calendarReview.repeats')}` : '' }}
            </li>
          </ul>
          <pre v-if="preview.changes" class="mt-4 overflow-x-auto rounded bg-muted p-3 text-xs">{{ JSON.stringify(preview.changes, null, 2) }}</pre>
          <div class="mt-6 flex gap-2">
            <UButton
              :color="preview.action === 'delete' ? 'error' : 'primary'"
              :loading="busy"
              :label="preview.action === 'delete' ? t('agent.calendarReview.confirmDelete') : t('agent.calendarReview.confirmUpdate')"
              @click="confirm()"
            />
            <UButton color="neutral" variant="outline" :label="t('agent.calendarReview.cancel')" @click="router.back()" />
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
