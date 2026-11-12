<script setup lang="ts">
// The hostname that serves this domain's read-receipt pixels, so they match the sender domain.
// Ported from legacy/src/app/(admin)/domains/TrackingHostSection.tsx.
import type { Domain, TrackingHostResponse } from '~/types/admin/email/domains'
import { errorMessage, probeTrackingHost } from '~/utils/admin/email/domains'

const props = defineProps<{ domain: Domain }>()
const { t } = useLanguage()
const saved = ref<TrackingHostResponse | null>(null)
const value = ref('')
const busy = ref(false)
const error = ref('')
const probe = ref<{ hostname: string, ok: boolean } | null>(null)

watch(() => props.domain.id, async (id) => {
  try {
    saved.value = await api<TrackingHostResponse>(`/api/domains/${id}/tracking`)
  } catch {
    saved.value = { hostname: null, available: false }
  }
  value.value = saved.value.hostname ?? ''
}, { immediate: true })

watch(() => saved.value?.hostname, async (hostname, _old, onCleanup) => {
  if (!hostname) return
  let active = true
  onCleanup(() => {
    active = false
  })
  const ok = await probeTrackingHost(hostname)
  if (active) probe.value = { hostname, ok }
})

async function save(hostname: string | null) {
  busy.value = true
  error.value = ''
  try {
    saved.value = await api<TrackingHostResponse>(`/api/domains/${props.domain.id}/tracking`, { method: 'PUT', body: { hostname } })
    value.value = saved.value.hostname ?? ''
  } catch (err) {
    error.value = errorMessage(err, t('domains.requestFailed'))
  } finally {
    busy.value = false
  }
}

const reachable = computed(() => {
  const hostname = saved.value?.hostname
  if (!hostname) return null
  if (probe.value?.hostname !== hostname) return 'checking'
  return probe.value.ok ? 'ok' : 'failed'
})
const ok = computed(() => !!saved.value?.hostname && reachable.value === 'ok')
const failed = computed(() => !!saved.value?.hostname && reachable.value === 'failed')
const status = computed(() => {
  const host = saved.value?.hostname
  if (!host) return t('domains.tracking.notSet')
  if (reachable.value === 'ok') return t('domains.tracking.reachable', { host })
  if (reachable.value === 'failed') return t('domains.tracking.unreachable', { host })
  return t('domains.checking')
})
const unchanged = computed(() => !value.value.trim() || value.value.trim().toLowerCase() === saved.value?.hostname)
</script>

<template>
  <section v-if="saved" class="mt-6">
    <h2 class="text-base font-semibold text-highlighted">
      {{ t('domains.tracking.title') }}
    </h2>
    <p class="mt-0.5 text-sm text-muted">
      {{ t('domains.tracking.description') }}
    </p>
    <ul class="mt-3 space-y-2">
      <AdminEmailDomainStatusRow :ok="ok" tone="neutral" :title="t('domains.tracking.host')" :hint="t('domains.tracking.hostHint')" :row-class="ok ? 'bg-success/10' : failed ? 'bg-warning/10' : 'bg-elevated/60'">
        <div v-if="saved.available" class="space-y-2">
          <form class="flex flex-wrap gap-2" @submit.prevent="save(value)">
            <UInput v-model="value" :aria-label="t('domains.tracking.host')" :placeholder="`mail.${domain.hostname}`" class="max-w-xs" autocomplete="off" spellcheck="false" />
            <UButton type="submit" size="sm" :disabled="busy || unchanged" :label="t('domains.tracking.save')" />
            <UButton v-if="saved.hostname" size="sm" color="neutral" variant="outline" :disabled="busy" :label="t('domains.tracking.remove')" @click="save(null)" />
          </form>
          <p class="text-xs" :class="failed ? 'text-warning' : 'text-muted'">
            {{ status }}
          </p>
        </div>
        <template v-else>
          {{ t('domains.tracking.migrationRequired') }}
        </template>
      </AdminEmailDomainStatusRow>
    </ul>
    <p v-if="error" role="alert" class="mt-2 text-xs text-error">
      {{ error }}
    </p>
  </section>
</template>
