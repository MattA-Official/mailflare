<script setup lang="ts">
// Fork-only. A group as the directory shows it: managers and members, the groups around it as a tree, and
// Email everyone. Admins manage the group itself from Admin -> Groups.
import { formatEmailAddress } from '#lib/email/address'
import type { TreeItem } from '@nuxt/ui'
import { fetchDirectoryGroup } from '~/utils/directory/directory'

definePageMeta({ layout: 'dashboard', nav: 'apps' })

const { t } = useLanguage()
const route = useRoute()
const user = useCurrentUser()
const { openComposer } = useCompose()
const id = computed(() => String(route.params.id))
const { data, error } = useAsyncData(() => `directory-group-${id.value}`, () => fetchDirectoryGroup(id.value))
const group = computed(() => data.value?.group)
const managers = computed(() => group.value?.members.filter(member => member.role === 'manager') ?? [])
const members = computed(() => group.value?.members.filter(member => member.role === 'member') ?? [])

// Parents above, this group in the middle (open), its sub-groups beneath.
const tree = computed<TreeItem[]>(() => {
  const current = group.value
  if (!current) return []
  const self: TreeItem = {
    label: current.name,
    icon: 'i-lucide-network',
    value: current.id,
    defaultExpanded: true,
    class: 'font-semibold',
    children: current.subgroups.map(child => ({ label: t('directory.groupWithCount', { name: child.name, count: child.memberCount }), icon: 'i-lucide-network', value: child.id })),
  }
  if (!current.parents.length) return [self]
  return current.parents.map(parent => ({ label: parent.name, icon: 'i-lucide-network', value: parent.id, defaultExpanded: true, children: [self] }))
})
const showTree = computed(() => Boolean(group.value && (group.value.parents.length || group.value.subgroups.length)))
function selectGroup(item: TreeItem) {
  if (item.value && item.value !== id.value) void navigateTo(`/directory/groups/${item.value}`)
}

function emailEveryone() {
  const people = group.value?.members ?? []
  openComposer({ to: people.map(member => formatEmailAddress(member.email, member.name)) })
}
</script>

<template>
  <AppPage id="directory-group" :title="group?.name ?? t('directory.groups')">
    <template #actions>
      <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" :to="{ path: '/directory', query: { tab: 'groups' } }" :label="t('directory.back')" />
      <UButton v-if="group?.members.length" icon="i-lucide-send" :label="t('directory.emailEveryone')" @click="emailEveryone" />
    </template>

    <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error.message || t('directory.loadFailed')" />
    <USkeleton v-else-if="!group" class="h-64 w-full rounded-lg" />
    <template v-else>
      <p v-if="group.description" class="text-sm text-muted">
        {{ group.description }}
      </p>
      <UButton v-if="user?.role === 'admin'" variant="link" color="neutral" icon="i-lucide-settings" :to="`/groups/${group.id}`" :label="t('directory.manageGroup')" class="px-0" />

      <section v-if="managers.length" class="space-y-2">
        <h2 class="text-sm font-semibold text-highlighted">
          {{ t('directory.managers') }}
        </h2>
        <AppList>
          <DirectoryPersonRow v-for="member in managers" :key="member.id" :person="member" :to="`/directory/people/${member.id}`" />
        </AppList>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-semibold text-highlighted">
          {{ t('directory.members') }}
        </h2>
        <UEmpty v-if="!members.length" variant="outline" icon="i-lucide-users-round" :title="t('directory.noMembers')" />
        <AppList v-else>
          <DirectoryPersonRow v-for="member in members" :key="member.id" :person="member" :to="`/directory/people/${member.id}`" />
        </AppList>
      </section>

      <section v-if="showTree" class="space-y-2">
        <h2 class="text-sm font-semibold text-highlighted">
          {{ t('directory.relatedGroups') }}
        </h2>
        <UCard>
          <UTree :items="tree" :get-key="item => String(item?.value ?? '')" @select="(_event, item) => selectGroup(item)" />
        </UCard>
      </section>

      <section v-if="group.inboxes.length" class="space-y-2">
        <h2 class="text-sm font-semibold text-highlighted">
          {{ t('directory.managesInboxes') }}
        </h2>
        <AppList>
          <AppListItem v-for="inbox in group.inboxes" :key="inbox.id" icon="i-lucide-inbox" :name="inbox.name" :description="inbox.address" />
        </AppList>
      </section>
    </template>
  </AppPage>
</template>
