<script setup lang="ts">
// Warns when a domain was added without its DNS records (upstream dns-skipped-banner). Advisory: a
// failed read just hides it.
type SkippedDomain = { id: string, hostname: string, dnsSkipped?: boolean }

const { t } = useLanguage()
const user = useCurrentUser()
const domains = ref<SkippedDomain[]>([])
const busy = ref(false)
const canManage = computed(() => !!user.value && (user.value.isPrimaryAdmin || (user.value.role === 'admin' && user.value.canManageDomains)))

async function load() {
  try {
    const response = await authFetch('/api/domains', { redirectOnUnauthorized: false })
    if (!response.ok) return
    const data = (await response.json()) as { domains?: SkippedDomain[] }
    domains.value = (data.domains ?? []).filter(domain => domain.dnsSkipped)
  } catch {
    // Hidden.
  }
}

async function markDone() {
  busy.value = true
  try {
    await Promise.all(domains.value.map(domain => authFetch(`/api/domains/${domain.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dnsSkipped: false }),
    })))
  } finally {
    busy.value = false
    await load()
  }
}

onMounted(load)
</script>

<template>
  <UAlert
    v-if="domains.length"
    role="status"
    color="warning"
    variant="subtle"
    icon="i-lucide-triangle-alert"
    :title="t('dnsSkipped.warning', { domains: domains.map(domain => domain.hostname).join(', ') })"
    :actions="canManage ? [
      { label: t('dnsSkipped.review'), to: '/domains', color: 'warning', variant: 'link' },
      { label: t('dnsSkipped.markDone'), color: 'warning', variant: 'outline', loading: busy, onClick: () => void markDone() },
    ] : undefined"
    orientation="horizontal"
    class="rounded-none border-x-0 border-t-0"
  />
</template>
