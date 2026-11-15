<script setup lang="ts">
// Ported from legacy/src/app/(admin)/ai-usage/page.tsx.
import type { TableColumn } from '@nuxt/ui'
import type { AiUsageResponse, AiUsageRow } from '~/types/admin/system/misc'
import { fetchAiUsage, formatEstimatedUsd, formatTokenCount, formatUsageDate, formatUsageProvider } from '~/utils/admin/system/settings'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', primary: true, requireMailbox: true } })

const { t } = useLanguage()
useHead({ title: () => t('aiUsage.title') })

const data = ref<AiUsageResponse | null>(null)
const NUMBER = { class: { th: 'text-right', td: 'text-right tabular-nums' } }
const columns = computed<TableColumn<AiUsageRow>[]>(() => [
  { accessorKey: 'createdAt', header: t('aiUsage.col.dateTime'), cell: ({ row }) => formatUsageDate(row.original.createdAt), meta: { class: { td: 'text-toned' } } },
  { accessorKey: 'model', header: t('aiUsage.col.model'), meta: { class: { td: 'max-w-56 whitespace-normal break-all' } } },
  { accessorKey: 'provider', header: t('aiUsage.col.provider'), cell: ({ row }) => formatUsageProvider(row.original.provider) },
  { accessorKey: 'inputTokens', header: t('aiUsage.col.input'), cell: ({ row }) => formatTokenCount(row.original.inputTokens), meta: NUMBER },
  { accessorKey: 'outputTokens', header: t('aiUsage.col.output'), cell: ({ row }) => formatTokenCount(row.original.outputTokens), meta: NUMBER },
  { accessorKey: 'costUsdMicros', header: t('aiUsage.col.spending'), cell: ({ row }) => formatEstimatedUsd(row.original.costUsdMicros), meta: NUMBER },
])
const error = ref<string | null>(null)
const loadingPage = ref(false)

async function load(page: number, fallbackKey: 'aiUsage.loadFailed' | 'aiUsage.pageFailed') {
  loadingPage.value = true
  error.value = null
  try {
    data.value = await fetchAiUsage(page)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t(fallbackKey)
  } finally {
    loadingPage.value = false
  }
}

onMounted(() => load(1, 'aiUsage.loadFailed'))
const totals = computed(() => data.value?.totals)
</script>

<template>
  <AdminSystemPage id="ai-usage" :title="t('aiUsage.title')" :description="t('aiUsage.description')">
    <template #actions>
      <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" to="/agent" :label="t('aiUsage.back')" />
    </template>
    <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" />
    <div class="grid gap-4 sm:grid-cols-3">
      <UCard>
        <p class="text-sm text-muted">
          {{ t('aiUsage.totalTokens') }}
        </p>
        <p class="mt-2 text-2xl font-semibold text-highlighted">
          {{ totals ? formatTokenCount(totals.totalTokens) : '—' }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          {{ t('aiUsage.totalRequests') }}
        </p>
        <p class="mt-2 text-2xl font-semibold text-highlighted">
          {{ totals ? formatTokenCount(totals.requests) : '—' }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          {{ t('aiUsage.spend') }}
        </p>
        <p class="mt-2 text-2xl font-semibold text-highlighted">
          {{ totals && totals.pricedRequests ? formatEstimatedUsd(totals.costUsdMicros) : '—' }}
        </p>
        <p v-if="totals && totals.pricedRequests < totals.requests" class="mt-1 text-xs text-muted">
          {{ t('aiUsage.noRate', { count: formatTokenCount(totals.requests - totals.pricedRequests) }) }}
        </p>
      </UCard>
    </div>
    <AdminSystemUsageChart :daily="data?.daily ?? []" :time-zone="data?.timeZone" />
    <UTable
      :data="data?.rows ?? []"
      :columns="columns"
      :loading="!data && !error"
      :empty="t('aiUsage.none')"
      :caption="t('aiUsage.title')"
      :aria-busy="loadingPage"
      :ui="{ base: 'w-full min-w-[850px]', td: 'text-default' }"
    >
      <template #loading>
        <span class="text-sm text-muted">{{ t('aiUsage.loading') }}</span>
      </template>
    </UTable>
    <div v-if="data" class="flex items-center justify-end gap-3 text-sm text-toned">
      <span>{{ t('aiUsage.pageOf', { page: data.page, total: data.totalPages, size: data.pageSize }) }}</span>
      <UButton color="neutral" variant="outline" size="sm" :disabled="loadingPage || data.page <= 1" :label="t('aiUsage.previous')" @click="load(data.page - 1, 'aiUsage.pageFailed')" />
      <UButton color="neutral" variant="outline" size="sm" :disabled="loadingPage || data.page >= data.totalPages" :label="t('aiUsage.next')" @click="load(data.page + 1, 'aiUsage.pageFailed')" />
    </div>
    <p class="text-xs text-muted">
      {{ t('aiUsage.note') }}
    </p>
  </AdminSystemPage>
</template>
