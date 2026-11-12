<script setup lang="ts">
// Sign-in activity, ported from legacy/src/app/(admin)/activity/page.tsx.
import { fetchActivity, formatActivityDate, getActivityLabel, getActivityMetadata } from '~/utils/admin/system/settings'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', primary: true, requireMailbox: true } })

const { t } = useLanguage()
useHead({ title: () => t('activity.title') })

const { data, status, error } = useAsyncData('admin-activity', fetchActivity)
const rows = computed(() => (data.value ?? []).map(log => ({ log, metadata: getActivityMetadata(log) })))
</script>

<template>
  <AdminSystemPage id="activity" :title="t('activity.title')" :description="t('activity.description')" wide>
    <p v-if="error" role="alert" class="text-sm text-error">
      {{ error.message }}
    </p>
    <section role="region" tabindex="0" :aria-label="t('activity.title')" class="overflow-x-auto rounded-lg border border-default bg-default">
      <table class="w-full min-w-[760px] table-fixed text-left">
        <thead class="border-b border-default bg-elevated/50 text-xs font-semibold uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" class="w-32 px-5 py-3">
              {{ t('activity.col.activity') }}
            </th>
            <th scope="col" class="px-5 py-3">
              {{ t('activity.col.user') }}
            </th>
            <th scope="col" class="w-64 px-5 py-3">
              {{ t('activity.col.device') }}
            </th>
            <th scope="col" class="w-48 px-5 py-3">
              {{ t('activity.col.time') }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <template v-if="status === 'pending' && !data">
            <tr v-for="index in 7" :key="index">
              <td class="px-5 py-4">
                <USkeleton class="h-6 w-20" />
              </td>
              <td class="px-5 py-4">
                <USkeleton class="h-9 w-48" />
              </td>
              <td class="px-5 py-4">
                <USkeleton class="h-9 w-40" />
              </td>
              <td class="px-5 py-4">
                <USkeleton class="h-4 w-32" />
              </td>
            </tr>
          </template>
          <tr v-else-if="!rows.length">
            <td colspan="4" class="px-5 py-4 text-sm text-muted">
              {{ t('activity.none') }}
            </td>
          </tr>
          <tr v-for="{ log, metadata } in rows" :key="log.id" class="align-top hover:bg-elevated/50">
            <td class="px-5 py-4">
              <UBadge color="neutral" variant="outline" :icon="log.action === 'auth.logout' ? 'i-lucide-log-out' : 'i-lucide-log-in'" :label="getActivityLabel(log.action, t)" />
            </td>
            <td class="px-5 py-4">
              <p class="truncate">
                {{ log.actorEmail ?? t('activity.unknownEmail') }}
              </p>
              <small class="text-muted">{{ metadata.city || t('activity.unknownCity') }} • {{ metadata.country || t('activity.unknownCountry') }}</small>
            </td>
            <td class="px-5 py-4">
              <p class="truncate">
                {{ metadata.device ?? t('activity.unknownDevice') }}
              </p>
              <small class="text-muted">{{ metadata.platform || t('activity.unknownPlatform') }} • {{ metadata.ipAddress ?? t('activity.unknownIp') }}</small>
            </td>
            <td class="px-5 py-4 text-sm text-muted">
              {{ formatActivityDate(log.createdAt) }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </AdminSystemPage>
</template>
