<script setup lang="ts">
// Fork-only. The desktop org chart: a zoomable, pannable Vue Flow drawing of an org tree, laid out top-down by
// dagre. Branches open and close from each card. Admins drag a person onto another person to change their manager.
import { VueFlow, useVueFlow, type Edge, type Node, type NodeDragEvent } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import '@vue-flow/core/dist/style.css'
import { layoutTree, type OrgNode } from '~/utils/directory/org-chart'
import type { OrgChartPerson } from '~/utils/directory/directory'

const props = defineProps<{
  roots: OrgNode[]
  /** Keys of the open branches. */
  expanded: Set<string>
  /** The highlighted node, from a search or a link. */
  highlight: string | null
  /** Drag a person onto another to make that person their manager. */
  draggable?: boolean
}>()
const emit = defineEmits<{
  toggle: [key: string]
  open: [person: OrgChartPerson]
  openGroup: [groupId: string]
  reassign: [person: OrgChartPerson, manager: OrgChartPerson]
}>()

const { t } = useLanguage()
const flowId = useId()
const { fitView, zoomIn, zoomOut, getIntersectingNodes, onNodeDragStop } = useVueFlow(flowId)

// Bumped after a drag so the dragged card returns to its laid-out place.
const version = ref(0)
const placed = computed(() => {
  void version.value
  return layoutTree(props.roots, props.expanded)
})
const nodes = computed<Node[]>(() => placed.value.map(({ node, x, y }) => ({
  id: node.key,
  type: node.kind === 'group' ? 'team' : 'person',
  position: { x, y },
  data: node,
  draggable: Boolean(props.draggable) && node.kind === 'person',
  selectable: false,
  connectable: false,
})))
const edges = computed<Edge[]>(() => placed.value.filter(item => item.parentKey).map(item => ({
  id: `${item.parentKey}->${item.node.key}`,
  source: item.parentKey!,
  target: item.node.key,
  type: 'smoothstep',
})))

onNodeDragStop((event: NodeDragEvent) => {
  const dragged = event.node.data as OrgNode
  const target = getIntersectingNodes(event.node).map(node => node.data as OrgNode)
    .find(node => node.kind === 'person' && dragged.kind === 'person' && node.person.id !== dragged.person.id)
  version.value++
  if (target?.kind === 'person' && dragged.kind === 'person') emit('reassign', dragged.person, target.person)
})

function focus(key: string) {
  void nextTick(() => fitView({ nodes: [key], maxZoom: 1, duration: 400, padding: 2 }))
}
function fitAll() {
  void fitView({ duration: 300, padding: 0.1 })
}
defineExpose({ focus, fitAll })

function childCount(node: OrgNode) {
  return node.children.length
}
</script>

<template>
  <div class="relative h-full min-h-[28rem] w-full overflow-hidden rounded-lg border border-default bg-muted/30">
    <VueFlow
      :id="flowId"
      :nodes="nodes"
      :edges="edges"
      :min-zoom="0.2"
      :max-zoom="1.5"
      :nodes-connectable="false"
      :elements-selectable="false"
      fit-view-on-init
      class="org-chart"
    >
      <Background pattern-color="var(--ui-border)" :gap="24" />

      <template #node-person="{ data }">
        <div
          class="flex h-[72px] w-[232px] items-center gap-3 rounded-lg border bg-default px-3 shadow-sm"
          :class="highlight === data.key ? 'border-primary ring-2 ring-primary' : 'border-default'"
        >
          <button type="button" class="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary nodrag" @click="emit('open', data.person)">
            <DirectoryPersonAvatar :person="data.person" />
            <span class="min-w-0">
              <span class="block truncate text-sm font-semibold text-highlighted">{{ data.person.name }}</span>
              <span class="block truncate text-xs text-muted">{{ data.person.title ?? data.person.department ?? data.person.email }}</span>
            </span>
          </button>
          <UButton
            v-if="childCount(data)"
            size="xs"
            color="neutral"
            variant="soft"
            class="nodrag"
            :label="String(childCount(data))"
            :trailing-icon="expanded.has(data.key) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            :aria-label="expanded.has(data.key) ? t('directory.hideReports') : t('directory.showReports', { count: childCount(data) })"
            :aria-expanded="expanded.has(data.key)"
            @click="emit('toggle', data.key)"
          />
        </div>
      </template>

      <template #node-team="{ data }">
        <div class="flex h-[104px] w-[256px] flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 shadow-sm">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-network" class="size-4 shrink-0 text-primary" />
            <button type="button" class="min-w-0 flex-1 truncate text-left text-sm font-semibold text-highlighted hover:underline nodrag" @click="emit('openGroup', data.group.id)">
              {{ data.group.name }}
            </button>
            <UButton
              v-if="childCount(data)"
              size="xs"
              color="neutral"
              variant="soft"
              class="nodrag"
              :label="String(childCount(data))"
              :trailing-icon="expanded.has(data.key) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              :aria-expanded="expanded.has(data.key)"
              :aria-label="data.group.name"
              @click="emit('toggle', data.key)"
            />
          </div>
          <div v-if="data.managers.length" class="flex min-w-0 items-center gap-2">
            <UAvatarGroup size="xs" :max="3">
              <DirectoryPersonAvatar v-for="manager in data.managers" :key="manager.id" :person="manager" size="sm" />
            </UAvatarGroup>
            <span class="truncate text-xs text-muted">{{ data.managers.map((manager: OrgChartPerson) => manager.name).join(', ') }}</span>
          </div>
          <span class="text-xs text-muted">{{ t('groups.memberCount', { count: data.group.memberIds.length }) }}</span>
        </div>
      </template>
    </VueFlow>

    <div class="absolute right-3 top-3 flex gap-1">
      <UButton icon="i-lucide-zoom-in" color="neutral" variant="outline" size="sm" :aria-label="t('directory.zoomIn')" @click="zoomIn()" />
      <UButton icon="i-lucide-zoom-out" color="neutral" variant="outline" size="sm" :aria-label="t('directory.zoomOut')" @click="zoomOut()" />
      <UButton icon="i-lucide-maximize" color="neutral" variant="outline" size="sm" :aria-label="t('directory.fitView')" @click="fitAll" />
    </div>
  </div>
</template>

<style>
/* Vue Flow's own node frame; the cards above draw their own. */
.org-chart .vue-flow__node-person,
.org-chart .vue-flow__node-team {
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}
.org-chart .vue-flow__edge-path {
  stroke: var(--ui-border-accented);
}
</style>
