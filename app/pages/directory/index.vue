<script setup lang="ts">
// Fork-only (contacts plan, phase 2). Everyone on this instance: people, groups and shared inboxes. On wide
// screens a person opens in a slideover; on phones, on their own page.
import { useMediaQuery } from '@vueuse/core'
import { formatEmailAddress } from '#lib/email/address'
import { fetchDirectory, fetchDirectoryPerson, type DirectoryListResponse } from '~/utils/directory/directory'

definePageMeta({ layout: 'dashboard', nav: 'apps' })

const SEARCH_DEBOUNCE_MS = 250
const ALL = '__all__'

const { t } = useLanguage()
const { openComposer } = useCompose()
const route = useRoute()
const router = useRouter()
const wide = useMediaQuery('(min-width: 1024px)')

type Tab = 'people' | 'groups' | 'inboxes'
const tab = computed<Tab>({
  get: () => (['groups', 'inboxes'].includes(String(route.query.tab)) ? route.query.tab as Tab : 'people'),
  set: value => void router.replace({ query: { ...route.query, tab: value === 'people' ? undefined : value } }),
})
const tabs = computed(() => [
  { label: t('directory.people'), value: 'people', icon: 'i-lucide-user-round' },
  { label: t('directory.groups'), value: 'groups', icon: 'i-lucide-network' },
  { label: t('directory.sharedInboxes'), value: 'inboxes', icon: 'i-lucide-inbox' },
])

const input = ref('')
const query = ref('')
watch(input, (value, _previous, onCleanup) => {
  const timer = setTimeout(() => { query.value = value.trim() }, SEARCH_DEBOUNCE_MS)
  onCleanup(() => clearTimeout(timer))
})

const empty: DirectoryListResponse = { people: [], groups: [], inboxes: [], departments: [], profilesAvailable: true, isAdmin: false }
const { data, status, error } = useAsyncData('directory', () => fetchDirectory(query.value), { watch: [query], default: () => empty })
const loading = computed(() => status.value === 'pending' && !data.value.people.length && !data.value.groups.length)

// The group filter lists every group, not only those matching the search.
const { data: allGroups } = useAsyncData('directory-groups', () => fetchDirectory().then(result => result.groups), { default: () => [] })
const groupFilter = ref(ALL)
const departmentFilter = ref(ALL)
const groupItems = computed(() => [{ label: t('directory.allGroups'), value: ALL }, ...allGroups.value.map(group => ({ label: group.name, value: group.id }))])
const departmentItems = computed(() => [{ label: t('directory.allDepartments'), value: ALL }, ...data.value.departments.map(name => ({ label: name, value: name }))])
const people = computed(() => data.value.people.filter(person =>
  (groupFilter.value === ALL || person.groupIds.includes(groupFilter.value))
  && (departmentFilter.value === ALL || person.department === departmentFilter.value)))

const settingsOpen = ref(false)

// The person slideover (wide screens).
const openId = ref<string | null>(null)
const slideoverOpen = computed({
  get: () => openId.value !== null,
  set: (value: boolean) => { if (!value) openId.value = null },
})
const { data: person, refresh: refreshPerson } = useAsyncData(
  'directory-slideover-person',
  () => openId.value ? fetchDirectoryPerson(openId.value) : Promise.resolve(null),
  { watch: [openId] },
)
function openPerson(id: string) {
  if (wide.value) openId.value = id
  else void navigateTo(`/directory/people/${id}`)
}
</script>

<template>
  <AppPage id="directory" :title="t('directory.title')" :description="t('directory.description')">
    <template #actions>
      <UButton v-if="data.isAdmin" icon="i-lucide-settings" color="neutral" variant="ghost" :aria-label="t('directory.settingsTitle')" @click="settingsOpen = true" />
      <UButton icon="i-lucide-git-fork" color="neutral" variant="outline" :label="t('directory.orgChart')" to="/directory/org-chart" />
    </template>

    <div class="space-y-4 max-md:pb-20">
      <UTabs v-model="tab" :items="tabs" :content="false" class="w-full" />
      <div class="flex flex-col gap-2 sm:flex-row">
        <UInput v-model="input" type="search" icon="i-lucide-search" :placeholder="t('directory.search')" :aria-label="t('directory.search')" class="min-w-0 flex-1" />
        <template v-if="tab === 'people'">
          <USelect v-model="groupFilter" :items="groupItems" :aria-label="t('directory.filterGroup')" class="sm:w-44" />
          <USelect v-if="data.departments.length" v-model="departmentFilter" :items="departmentItems" :aria-label="t('directory.filterDepartment')" class="sm:w-44" />
        </template>
      </div>

      <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="t('directory.loadFailed')" />
      <div v-else-if="loading" class="space-y-2">
        <USkeleton v-for="n in 4" :key="n" class="h-14 w-full rounded-lg" />
      </div>

      <template v-else-if="tab === 'people'">
        <UEmpty v-if="!people.length" variant="outline" icon="i-lucide-users-round" :title="t('directory.noPeople')" />
        <AppList v-else>
          <DirectoryPersonRow v-for="item in people" :key="item.id" :person="item" @open="openPerson(item.id)" />
        </AppList>
      </template>

      <template v-else-if="tab === 'groups'">
        <UEmpty v-if="!data.groups.length" variant="outline" icon="i-lucide-network" :title="t('directory.noGroups')" />
        <AppList v-else>
          <AppListItem v-for="group in data.groups" :key="group.id" :to="`/directory/groups/${group.id}`" icon="i-lucide-network" :name="group.name" :description="group.description ?? undefined">
            <span class="shrink-0 text-sm text-muted">{{ t('groups.memberCount', { count: group.memberCount }) }}</span>
          </AppListItem>
        </AppList>
      </template>

      <template v-else>
        <UEmpty v-if="!data.inboxes.length" variant="outline" icon="i-lucide-inbox" :title="t('directory.noInboxes')" />
        <AppList v-else>
          <AppListItem v-for="inbox in data.inboxes" :key="inbox.id" icon="i-lucide-inbox" :name="inbox.name" :description="inbox.address">
            <div v-if="inbox.managers.length" class="hidden shrink-0 flex-wrap justify-end gap-1 sm:flex">
              <UButton
                v-for="manager in inbox.managers"
                :key="manager.id"
                :to="`/directory/groups/${manager.id}`"
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-network"
                :label="manager.name"
                :aria-label="t('directory.managedBy', { name: manager.name })"
              />
            </div>
            <UButton icon="i-lucide-send" color="neutral" variant="ghost" size="sm" :aria-label="t('contacts.sendEmail', { name: inbox.name })" @click="openComposer({ to: [formatEmailAddress(inbox.address, inbox.name)] })" />
          </AppListItem>
        </AppList>
      </template>
    </div>

    <USlideover v-model:open="slideoverOpen" :title="person?.person.name ?? t('directory.person')" :description="t('directory.personDescription')" :ui="{ content: 'max-w-lg' }">
      <template #body>
        <DirectoryPersonView v-if="person" :data="person" @changed="refreshPerson()" @navigate="openId = null" />
        <div v-else class="space-y-3">
          <USkeleton class="h-20 w-full" />
          <USkeleton class="h-10 w-2/3" />
        </div>
      </template>
    </USlideover>
    <DirectorySettingsModal v-if="data.isAdmin" v-model:open="settingsOpen" :people="data.people" />
  </AppPage>
</template>
