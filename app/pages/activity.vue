<script setup lang="ts">
// Sign-in activity, ported from legacy/src/app/(admin)/activity/page.tsx.
import type { TableColumn } from '@nuxt/ui'
import { fetchActivity, formatActivityDate, getActivityLabel, getActivityMetadata } from '~/utils/admin/system/settings'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', primary: true, requireMailbox: true } })

const { t } = useLanguage()
useHead({ title: () => t('activity.title') })

const { data, status, error } = useAsyncData('admin-activity', fetchActivity)
const rows = computed(() => (data.value ?? []).map(log => ({ log, metadata: getActivityMetadata(log) })))
type Row = (typeof rows.value)[number]
const columns = computed<TableColumn<Row>[]>(() => [
  { id: 'activity', header: t('activity.col.activity'), meta: { class: { th: 'w-32' } } },
  { id: 'user', header: t('activity.col.user') },
  { id: 'device', header: t('activity.col.device'), meta: { class: { th: 'w-64' } } },
  { id: 'time', header: t('activity.col.time'), meta: { class: { th: 'w-48' } } },
])
</script>

<template>
  <AdminSystemPage id="activity" :title="t('activity.title')" :description="t('activity.description')" wide>
    <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error.message" />
    <UTable
      :data="rows"
      :columns="columns"
      :loading="status === 'pending' && !data"
      :empty="t('activity.none')"
      :caption="t('activity.title')"
      :ui="{ base: 'w-full min-w-[760px] table-fixed', td: 'whitespace-normal align-top text-default' }"
    >
      <template #activity-cell="{ row }">
        <UBadge color="neutral" variant="outline" :icon="row.original.log.action === 'auth.logout' ? 'i-lucide-log-out' : 'i-lucide-log-in'" :label="getActivityLabel(row.original.log.action, t)" />
      </template>
      <template #user-cell="{ row }">
        <p class="truncate">
          {{ row.original.log.actorEmail ?? t('activity.unknownEmail') }}
        </p>
        <small class="text-muted">{{ row.original.metadata.city || t('activity.unknownCity') }} • {{ row.original.metadata.country || t('activity.unknownCountry') }}</small>
      </template>
      <template #device-cell="{ row }">
        <p class="truncate">
          {{ row.original.metadata.device ?? t('activity.unknownDevice') }}
        </p>
        <small class="text-muted">{{ row.original.metadata.platform || t('activity.unknownPlatform') }} • {{ row.original.metadata.ipAddress ?? t('activity.unknownIp') }}</small>
      </template>
      <template #time-cell="{ row }">
        <span class="text-muted">{{ formatActivityDate(row.original.log.createdAt) }}</span>
      </template>
    </UTable>
  </AdminSystemPage>
</template>
