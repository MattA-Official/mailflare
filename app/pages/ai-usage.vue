<script setup lang="ts">
// Ported from legacy/src/app/(admin)/ai-usage/page.tsx.
import type { AiUsageResponse } from '~/types/admin/system/misc'
import { fetchAiUsage, formatEstimatedUsd, formatTokenCount, formatUsageDate, formatUsageProvider } from '~/utils/admin/system/settings'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', primary: true, requireMailbox: true } })

const { t } = useLanguage()
useHead({ title: () => t('aiUsage.title') })

const data = ref<AiUsageResponse | null>(null)
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
    <p v-if="error" role="alert" class="text-sm text-error">
      {{ error }}
    </p>
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
    <section role="region" tabindex="0" :aria-label="t('aiUsage.title')" :aria-busy="loadingPage" class="overflow-x-auto rounded-lg border border-default bg-default">
      <table class="w-full min-w-[850px] text-left text-sm">
        <thead class="border-b border-default bg-elevated/50 text-xs font-semibold uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" class="px-4 py-3">
              {{ t('aiUsage.col.dateTime') }}
            </th>
            <th scope="col" class="px-4 py-3">
              {{ t('aiUsage.col.model') }}
            </th>
            <th scope="col" class="px-4 py-3">
              {{ t('aiUsage.col.provider') }}
            </th>
            <th scope="col" class="px-4 py-3 text-right">
              {{ t('aiUsage.col.input') }}
            </th>
            <th scope="col" class="px-4 py-3 text-right">
              {{ t('aiUsage.col.output') }}
            </th>
            <th scope="col" class="px-4 py-3 text-right">
              {{ t('aiUsage.col.spending') }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr v-for="row in data?.rows ?? []" :key="row.id">
            <td class="whitespace-nowrap px-4 py-3 text-toned">
              {{ formatUsageDate(row.createdAt) }}
            </td>
            <td class="max-w-56 break-all px-4 py-3">
              {{ row.model }}
            </td>
            <td class="px-4 py-3">
              {{ formatUsageProvider(row.provider) }}
            </td>
            <td class="px-4 py-3 text-right tabular-nums">
              {{ formatTokenCount(row.inputTokens) }}
            </td>
            <td class="px-4 py-3 text-right tabular-nums">
              {{ formatTokenCount(row.outputTokens) }}
            </td>
            <td class="px-4 py-3 text-right tabular-nums">
              {{ formatEstimatedUsd(row.costUsdMicros) }}
            </td>
          </tr>
          <tr v-if="data && data.rows.length === 0">
            <td colspan="6" class="px-4 py-8 text-center text-muted">
              {{ t('aiUsage.none') }}
            </td>
          </tr>
          <tr v-if="!data && !error">
            <td colspan="6" class="px-4 py-8 text-center text-muted">
              {{ t('aiUsage.loading') }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
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
