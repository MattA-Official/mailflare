<script setup lang="ts">
// Fork-only. The groups you belong to. Group managers add and remove members from here.
import { fetchMyGroups } from '~/utils/admin/system/groups'

definePageMeta({ layout: 'dashboard', nav: 'settings' })

const { t } = useLanguage()
const { data, status, error } = useAsyncData('my-groups', fetchMyGroups)
</script>

<template>
  <AppPage id="settings-groups" :title="t('groups.title')" :description="t('groups.mineDescription')">
    <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="t('groups.loadFailed')" />
    <div v-else-if="status === 'pending' && !data" class="space-y-2">
      <USkeleton v-for="index in 2" :key="index" class="h-16 w-full rounded-lg" />
    </div>
    <UEmpty v-else-if="!data?.groups.length" variant="outline" icon="i-lucide-network" :description="t('groups.mineNone')" />
    <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
      <li v-for="group in data.groups" :key="group.id">
        <NuxtLink :to="`/settings/groups/${group.id}`" class="flex items-center gap-4 px-5 py-4 hover:bg-elevated/50">
          <UAvatar icon="i-lucide-network" color="primary" size="xl" />
          <span class="min-w-0 flex-1 space-y-0.5">
            <span class="flex min-w-0 items-center gap-2">
              <strong class="truncate text-sm font-semibold text-highlighted">{{ group.name }}</strong>
              <UBadge v-if="group.role === 'manager'" color="primary" variant="subtle" :label="t('groups.roleManager')" />
            </span>
            <span v-if="group.description" class="block truncate text-xs text-muted">{{ group.description }}</span>
          </span>
          <span class="hidden shrink-0 text-sm text-muted sm:block">{{ t('groups.inboxCount', { count: group.mailboxCount }) }}</span>
          <span class="shrink-0 text-sm text-muted">{{ t('groups.memberCount', { count: group.memberCount }) }}</span>
          <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted" />
        </NuxtLink>
      </li>
    </ul>
  </AppPage>
</template>
