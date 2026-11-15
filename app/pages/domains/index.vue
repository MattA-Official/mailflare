<script setup lang="ts">
// Domains admin. Ported from legacy/src/app/(admin)/domains/page.tsx.
import type { DomainsResponse } from '~/types/admin/email/domains'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', requireMailbox: true } })

const { t } = useLanguage()
const toast = useToast()

const { data, status, refresh } = useAsyncData('admin-domains', () => api<DomainsResponse>('/api/domains?includeDns=true'))
const session = ref<SessionInfo | null>(peekSessionInfo())
onMounted(async () => {
  session.value = await fetchSessionInfo()
})
// Without Cloudflare credentials DNS is managed by hand; on this fork that only happens before setup.
const managesDns = computed(() => session.value?.managesDns ?? true)

const createOpen = ref(false)
const expandedId = ref<string | null>(null)
const removingId = ref<string | null>(null)

async function remove(id: string) {
  removingId.value = id
  try {
    await api(`/api/domains/${id}`, { method: 'DELETE' })
    if (expandedId.value === id) expandedId.value = null
    await refresh()
  } catch {
    toast.add({ title: t('domains.removeFailed'), color: 'error' })
  } finally {
    removingId.value = null
  }
}
</script>

<template>
  <AppPage id="domains" :title="t('domains.title')" :description="managesDns ? t('domains.descriptionManaged') : t('domains.descriptionManual')">
    <template #actions>
      <AdminEmailDomainCreateModal v-model:open="createOpen" @created="refresh()" />
    </template>
    <div v-if="status === 'pending' && !data" class="space-y-2">
      <USkeleton v-for="n in 3" :key="n" class="h-24 w-full rounded-lg" />
    </div>
    <UEmpty v-else-if="!data?.domains.length" variant="outline" icon="i-lucide-globe" :title="t('domains.none')" />
    <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
      <AdminEmailDomainItemCard
        v-for="domain in data.domains"
        :key="domain.id"
        :item="domain"
        :dns="data.dns?.[domain.id]"
        :expanded="expandedId === domain.id"
        :removing="removingId === domain.id"
        @toggle="expandedId = expandedId === domain.id ? null : domain.id"
        @changed="refresh()"
        @remove="remove(domain.id)"
      />
    </ul>
  </AppPage>
</template>
