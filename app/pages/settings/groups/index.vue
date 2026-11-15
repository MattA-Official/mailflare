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
    <AppList v-else>
      <AppListItem v-for="group in data.groups" :key="group.id" :to="`/settings/groups/${group.id}`" icon="i-lucide-network" :description="group.description ?? undefined">
        <template #name>
          {{ group.name }}
          <UBadge v-if="group.role === 'manager'" color="primary" variant="subtle" :label="t('groups.roleManager')" class="ms-2 align-middle" />
        </template>
        <span class="hidden shrink-0 text-sm text-muted sm:block">{{ t('groups.inboxCount', { count: group.mailboxCount }) }}</span>
        <span class="shrink-0 text-sm text-muted">{{ t('groups.memberCount', { count: group.memberCount }) }}</span>
      </AppListItem>
    </AppList>
  </AppPage>
</template>
