<script setup lang="ts">
// Fork-only (contacts plan, phase 2). The org chart: reporting lines from each person's manager, and teams from
// the nested groups. A zoomable chart on wide screens, a collapsible tree on phones.
import { useMediaQuery } from '@vueuse/core'
import type { TreeItem } from '@nuxt/ui'
import type OrgChartFlow from '~/components/directory/OrgChartFlow.vue'
import { fetchOrgChart, personSubtitle, updateDirectoryPerson, type OrgChartPerson } from '~/utils/directory/directory'
import { ancestorKeysOf, buildReportingTree, buildTeamsTree, keysToDepth, walkNodes, type OrgNode } from '~/utils/directory/org-chart'
import { confirmDialog } from '~/utils/confirm-dialog'

definePageMeta({ layout: 'dashboard', nav: 'apps' })

const { t } = useLanguage()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const wide = useMediaQuery('(min-width: 1024px)')

const { data, error, refresh } = useAsyncData('directory-org-chart', fetchOrgChart)

type View = 'lines' | 'teams'
const view = computed<View>({
  get: () => route.query.view === 'teams' ? 'teams' : 'lines',
  set: value => void router.replace({ query: { ...route.query, view: value === 'lines' ? undefined : value } }),
})
const views = computed(() => [
  { label: t('directory.reportingLines'), value: 'lines', icon: 'i-lucide-git-fork' },
  { label: t('directory.teams'), value: 'teams', icon: 'i-lucide-network' },
])

const roots = computed<OrgNode[]>(() => {
  if (!data.value) return []
  return view.value === 'teams' ? buildTeamsTree(data.value) : buildReportingTree(data.value)
})
// Reporting lines with nobody under anybody is just a list of people; say so rather than drawing it.
const hasLines = computed(() => roots.value.some(node => node.children.length))

const expanded = ref(new Set<string>())
const highlight = ref<string | null>(null)
watch([roots, view], () => {
  expanded.value = new Set(keysToDepth(roots.value, view.value === 'teams' ? 1 : 3))
  const person = typeof route.query.person === 'string' ? route.query.person : null
  if (person) reveal(person)
}, { immediate: true })

function toggle(key: string) {
  const next = new Set(expanded.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expanded.value = next
}
function expandAll() {
  const keys: string[] = []
  walkNodes(roots.value, (node) => { if (node.children.length) keys.push(node.key) })
  expanded.value = new Set(keys)
}
function collapseAll() {
  expanded.value = new Set()
}

const flow = ref<InstanceType<typeof OrgChartFlow> | null>(null)
function reveal(personId: string) {
  const { target, ancestors } = ancestorKeysOf(roots.value, personId)
  if (!target) return
  expanded.value = new Set([...expanded.value, ...ancestors])
  highlight.value = target
  flow.value?.focus(target)
}

// Find a person: jumps to and highlights them.
const people = computed(() => [...(data.value?.people ?? [])].sort((a, b) => a.name.localeCompare(b.name)))
const findItems = computed(() => people.value.map(person => ({ label: person.name, description: personSubtitle(person), value: person.id })))
const found = ref<string | undefined>()
watch(found, (id) => {
  if (id) reveal(id)
})
watch(flow, (instance) => {
  if (instance && highlight.value) instance.focus(highlight.value)
})

function openPerson(person: OrgChartPerson) {
  void navigateTo(`/directory/people/${person.id}`)
}
function openGroup(id: string) {
  void navigateTo(`/directory/groups/${id}`)
}

async function reassign(person: OrgChartPerson, manager: OrgChartPerson) {
  if (person.managerId === manager.id) return
  const confirmed = await confirmDialog({
    title: t('directory.reassignTitle'),
    message: t('directory.reassignConfirm', { manager: manager.name, name: person.name }),
    confirmLabel: t('directory.reassign'),
  })
  if (!confirmed) return
  try {
    await updateDirectoryPerson(person.id, { reportsToUserId: manager.id })
    toast.add({ title: t('directory.reassigned', { name: person.name, manager: manager.name }), color: 'success' })
    await refresh()
    reveal(person.id)
  } catch (cause) {
    toast.add({ title: cause instanceof Error ? cause.message : t('directory.reassignFailed'), color: 'error' })
  }
}

// The phone view: the same tree as a UTree.
type OrgTreeItem = TreeItem & { node: OrgNode }
function toTreeItems(nodes: OrgNode[]): OrgTreeItem[] {
  return nodes.map(node => ({
    node,
    value: node.key,
    label: node.kind === 'group' ? node.group.name : node.person.name,
    icon: node.kind === 'group' ? 'i-lucide-network' : undefined,
    children: node.children.length ? toTreeItems(node.children) : undefined,
  }))
}
// Reka UI also asks for the key of an empty selection.
function treeKey(item?: OrgTreeItem) {
  return item?.node?.key ?? ''
}
const treeItems = computed(() => toTreeItems(roots.value))
const treeExpanded = computed({
  get: () => [...expanded.value],
  set: (keys: string[]) => { expanded.value = new Set(keys) },
})
function selectTreeItem(item: OrgTreeItem) {
  if (item.node.kind === 'person') openPerson(item.node.person)
}
</script>

<template>
  <AppPage id="directory-org-chart" :title="t('directory.orgChart')" :description="t('directory.orgChartDescription')" wide>
    <template #actions>
      <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" to="/directory" :label="t('directory.back')" />
    </template>

    <div class="space-y-4 max-md:pb-20">
      <div class="flex flex-col gap-2 lg:flex-row lg:items-center">
        <UTabs v-model="view" :items="views" :content="false" class="lg:w-80" />
        <USelectMenu
          v-model="found"
          :items="findItems"
          value-key="value"
          icon="i-lucide-search"
          :placeholder="t('directory.findPerson')"
          :search-input="{ placeholder: t('directory.searchPeople') }"
          class="min-w-0 lg:flex-1"
        />
        <div class="flex gap-1">
          <UButton color="neutral" variant="ghost" icon="i-lucide-chevrons-up-down" :label="t('directory.expandAll')" @click="expandAll" />
          <UButton color="neutral" variant="ghost" icon="i-lucide-chevrons-down-up" :label="t('directory.collapseAll')" @click="collapseAll" />
        </div>
      </div>

      <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="t('directory.loadFailed')" />
      <USkeleton v-else-if="!data" class="h-[28rem] w-full rounded-lg" />
      <UEmpty v-else-if="view === 'lines' && !hasLines" variant="outline" icon="i-lucide-git-fork" :description="t('directory.noReportingLines')" />
      <UEmpty v-else-if="view === 'teams' && !roots.length" variant="outline" icon="i-lucide-network" :description="t('directory.noTeams')" />
      <template v-else-if="wide">
        <p v-if="data.canReassign && view === 'lines'" class="text-sm text-muted">
          {{ t('directory.dragHint') }}
        </p>
        <div class="h-[calc(100dvh-16rem)]">
          <DirectoryOrgChartFlow
            ref="flow"
            :roots="roots"
            :expanded="expanded"
            :highlight="highlight"
            :draggable="data.canReassign && view === 'lines'"
            @toggle="toggle"
            @open="openPerson"
            @open-group="openGroup"
            @reassign="reassign"
          />
        </div>
      </template>
      <UCard v-else>
        <UTree v-model:expanded="treeExpanded" :items="treeItems" :get-key="treeKey" @select="(_event, item) => selectTreeItem(item)">
          <template #item-label="{ item }">
            <span v-if="item.node.kind === 'person'" class="flex min-w-0 items-center gap-2" :class="highlight === item.node.key && 'font-semibold text-primary'">
              <DirectoryPersonAvatar :person="item.node.person" size="sm" />
              <span class="min-w-0">
                <span class="block truncate">{{ item.node.person.name }}</span>
                <span v-if="personSubtitle(item.node.person)" class="block truncate text-xs text-muted">{{ personSubtitle(item.node.person) }}</span>
              </span>
            </span>
            <span v-else class="min-w-0">
              <span class="block truncate font-medium">{{ item.label }}</span>
              <span v-if="item.node.managers.length" class="block truncate text-xs text-muted">{{ item.node.managers.map(manager => manager.name).join(', ') }}</span>
            </span>
          </template>
        </UTree>
      </UCard>
    </div>
  </AppPage>
</template>
