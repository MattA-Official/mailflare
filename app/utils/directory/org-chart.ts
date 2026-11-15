// Fork-only. Turns the org chart data into trees: reporting lines (each person under their manager) and teams
// (groups inside groups, with each group's members beneath it). The desktop chart lays the visible part out
// with dagre; the phone view shows the same tree as a UTree.
import dagre from '@dagrejs/dagre'
import type { OrgChartGroup, OrgChartPerson, OrgChartResponse } from './directory'

export type OrgNode =
  | { key: string, kind: 'person', person: OrgChartPerson, children: OrgNode[] }
  | { key: string, kind: 'group', group: OrgChartGroup, managers: OrgChartPerson[], children: OrgNode[] }

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

/**
 * Everyone under their manager. With a pinned root, everyone else without a manager hangs beneath the root, so the
 * chart has one top; otherwise each of them is a top. The server already cut loops; `seen` guards the drawing anyway.
 */
export function buildReportingTree(chart: Pick<OrgChartResponse, 'people' | 'rootId'>): OrgNode[] {
  const reports = new Map<string | null, OrgChartPerson[]>()
  for (const person of chart.people) reports.set(person.managerId, [...(reports.get(person.managerId) ?? []), person])
  const seen = new Set<string>()
  const build = (person: OrgChartPerson): OrgNode => {
    seen.add(person.id)
    const children = (reports.get(person.id) ?? []).filter(child => !seen.has(child.id)).sort(byName)
    return { key: `p:${person.id}`, kind: 'person', person, children: children.map(build) }
  }
  const tops = (reports.get(null) ?? []).sort(byName)
  const root = chart.rootId ? tops.find(person => person.id === chart.rootId) : undefined
  if (!root) return tops.map(build)
  const node = build(root)
  for (const other of tops) if (other.id !== root.id && !seen.has(other.id)) node.children.push(build(other))
  return [node]
}

/** Groups inside groups. A group inside several groups appears under each; keys are paths, so they stay unique. */
export function buildTeamsTree(chart: Pick<OrgChartResponse, 'people' | 'groups'>): OrgNode[] {
  const people = new Map(chart.people.map(person => [person.id, person]))
  const groups = new Map(chart.groups.map(group => [group.id, group]))
  const children = new Map<string, OrgChartGroup[]>()
  for (const group of chart.groups) {
    for (const parent of group.parentIds) children.set(parent, [...(children.get(parent) ?? []), group])
  }
  const build = (group: OrgChartGroup, prefix: string, path: Set<string>): OrgNode => {
    const key = `${prefix}g:${group.id}`
    const inside = new Set([...path, group.id])
    const managers = group.managerIds.map(id => people.get(id)).filter(person => person !== undefined).sort(byName)
    const managerIds = new Set(managers.map(person => person.id))
    const members = group.memberIds.filter(id => !managerIds.has(id)).map(id => people.get(id)).filter(person => person !== undefined).sort(byName)
    return {
      key,
      kind: 'group',
      group,
      managers,
      children: [
        ...(children.get(group.id) ?? []).filter(child => !inside.has(child.id)).sort(byName).map(child => build(child, `${key}/`, inside)),
        ...members.map(person => ({ key: `${key}/p:${person.id}`, kind: 'person' as const, person, children: [] })),
      ],
    }
  }
  return chart.groups.filter(group => !group.parentIds.some(id => groups.has(id))).sort(byName).map(group => build(group, '', new Set()))
}

export function walkNodes(nodes: OrgNode[], visit: (node: OrgNode, parent: OrgNode | null) => void, parent: OrgNode | null = null) {
  for (const node of nodes) {
    visit(node, parent)
    walkNodes(node.children, visit, node)
  }
}

/** Keys of the nodes above every node showing this person, so expanding them reveals the person. */
export function ancestorKeysOf(nodes: OrgNode[], personId: string): { target: string | null, ancestors: string[] } {
  const parents = new Map<string, string | null>()
  let target: string | null = null
  walkNodes(nodes, (node, parent) => {
    parents.set(node.key, parent?.key ?? null)
    if (!target && node.kind === 'person' && node.person.id === personId) target = node.key
  })
  const ancestors: string[] = []
  for (let key = target ? parents.get(target) ?? null : null; key; key = parents.get(key) ?? null) ancestors.push(key)
  return { target, ancestors }
}

/** Keys of nodes that have children and sit less than `depth` levels down: what starts expanded. */
export function keysToDepth(nodes: OrgNode[], depth: number, level = 0): string[] {
  if (level >= depth) return []
  return nodes.flatMap(node => node.children.length ? [node.key, ...keysToDepth(node.children, depth, level + 1)] : [])
}

export const PERSON_SIZE = { width: 232, height: 72 }
export const GROUP_SIZE = { width: 256, height: 104 }

export type PlacedNode = { node: OrgNode, x: number, y: number, parentKey: string | null }

/** The nodes visible with `expanded` open, placed top-down by dagre. */
export function layoutTree(nodes: OrgNode[], expanded: Set<string>): PlacedNode[] {
  const graph = new dagre.graphlib.Graph()
  graph.setGraph({ rankdir: 'TB', nodesep: 24, ranksep: 56, marginx: 16, marginy: 16 })
  graph.setDefaultEdgeLabel(() => ({}))
  const visible: { node: OrgNode, parentKey: string | null }[] = []
  const visit = (list: OrgNode[], parentKey: string | null) => {
    for (const node of list) {
      visible.push({ node, parentKey })
      const size = node.kind === 'group' ? GROUP_SIZE : PERSON_SIZE
      graph.setNode(node.key, { ...size })
      if (parentKey) graph.setEdge(parentKey, node.key)
      if (expanded.has(node.key)) visit(node.children, node.key)
    }
  }
  visit(nodes, null)
  dagre.layout(graph)
  return visible.map(({ node, parentKey }) => {
    const placed = graph.node(node.key)
    const size = node.kind === 'group' ? GROUP_SIZE : PERSON_SIZE
    return { node, parentKey, x: placed.x - size.width / 2, y: placed.y - size.height / 2 }
  })
}
