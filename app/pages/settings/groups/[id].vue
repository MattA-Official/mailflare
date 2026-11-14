<script setup lang="ts">
// Fork-only. One of your groups: its members (which its managers can change) and its shared inboxes.
import { fetchGroup, getGroupMailboxAddress } from '~/utils/admin/system/groups'

definePageMeta({ layout: 'dashboard', nav: 'settings' })

const { t } = useLanguage()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, error, refresh } = useAsyncData(() => `my-group-${id.value}`, () => fetchGroup(id.value))
useHead({ title: () => data.value?.group.name ?? t('groups.title') })
</script>

<template>
  <UDashboardPanel id="settings-group">
    <template #header>
      <AppNavbar :title="data?.group.name ?? t('groups.title')">
        <template #right>
          <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" to="/settings/groups" :label="t('groups.back')" />
        </template>
      </AppNavbar>
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-6">
        <p v-if="error" role="alert" class="text-sm text-error">
          {{ t('groups.loadFailed') }}
        </p>
        <template v-if="data">
          <p v-if="data.group.description" class="text-sm text-muted">
            {{ data.group.description }}
          </p>
          <GroupsMembersCard :data="data" @changed="refresh()" />
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <h2 class="text-sm font-semibold text-highlighted">
                {{ t('groups.inboxesTitle') }}
              </h2>
              <p class="mt-1 text-xs text-muted">
                {{ t('groups.mineInboxesHint') }}
              </p>
            </template>
            <p v-if="!data.group.mailboxes.length" class="px-5 py-4 text-sm text-muted">
              {{ t('groups.noInboxes') }}
            </p>
            <ul v-else class="divide-y divide-default">
              <li v-for="mailbox in data.group.mailboxes" :key="mailbox.id" class="flex items-center gap-3 px-5 py-3">
                <UIcon name="i-lucide-inbox" class="size-4 shrink-0 text-dimmed" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-highlighted">{{ mailbox.displayName || mailbox.localPart }}</span>
                  <span class="block truncate text-xs text-muted">{{ getGroupMailboxAddress(mailbox) }}</span>
                </span>
                <UBadge v-if="mailbox.inheritedFrom" color="neutral" variant="soft" :label="t('groups.inheritedFrom', { name: mailbox.inheritedFrom.name })" />
              </li>
            </ul>
          </UCard>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
