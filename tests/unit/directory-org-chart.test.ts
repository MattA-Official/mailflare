// Fork-only: the org chart trees (app/utils/directory/org-chart.ts).
import { describe, expect, test } from 'vitest'
import { ancestorKeysOf, buildReportingTree, buildTeamsTree, keysToDepth, layoutTree } from '../../app/utils/directory/org-chart'

const person = (id: string, managerId: string | null = null) => ({ id, name: id.toUpperCase(), email: `${id}@one.test`, title: null, department: null, hasAvatar: false, managerId })
const people = [person('ann'), person('ben', 'ann'), person('cat', 'ann'), person('dan', 'ben'), person('eve')]

describe('reporting lines', () => {
  test('people sit under their managers; people without one are at the top', () => {
    const roots = buildReportingTree({ people, rootId: null })
    expect(roots.map(node => node.key)).toEqual(['p:ann', 'p:eve'])
    expect(roots[0]!.children.map(node => node.key)).toEqual(['p:ben', 'p:cat'])
    expect(roots[0]!.children[0]!.children.map(node => node.key)).toEqual(['p:dan'])
  })

  test('a pinned root takes everyone else without a manager beneath it', () => {
    const roots = buildReportingTree({ people, rootId: 'eve' })
    expect(roots.map(node => node.key)).toEqual(['p:eve'])
    expect(roots[0]!.children.map(node => node.key)).toEqual(['p:ann'])
  })

  test('finds the branches to open to show someone, and lays out only open branches', () => {
    const roots = buildReportingTree({ people, rootId: null })
    expect(ancestorKeysOf(roots, 'dan')).toEqual({ target: 'p:dan', ancestors: ['p:ben', 'p:ann'] })
    expect(keysToDepth(roots, 1)).toEqual(['p:ann'])
    const placed = layoutTree(roots, new Set(['p:ann']))
    expect(placed.map(item => item.node.key).sort()).toEqual(['p:ann', 'p:ben', 'p:cat', 'p:eve'])
    const ann = placed.find(item => item.node.key === 'p:ann')!
    const ben = placed.find(item => item.node.key === 'p:ben')!
    expect(ben.y).toBeGreaterThan(ann.y)
    expect(ben.parentKey).toBe('p:ann')
  })
})

describe('teams', () => {
  test('groups nest, managers ride on the group, members hang beneath, and a group in two parents appears in both', () => {
    const groups = [
      { id: 'all', name: 'All', description: null, parentIds: [], memberIds: ['ann'], managerIds: ['ann'] },
      { id: 'eng', name: 'Eng', description: null, parentIds: ['all', 'ops'], memberIds: ['ben', 'dan'], managerIds: ['ben'] },
      { id: 'ops', name: 'Ops', description: null, parentIds: [], memberIds: [], managerIds: [] },
    ]
    const roots = buildTeamsTree({ people, groups })
    expect(roots.map(node => node.key)).toEqual(['g:all', 'g:ops'])
    const all = roots[0]!
    expect(all.kind === 'group' && all.managers.map(manager => manager.id)).toEqual(['ann'])
    expect(all.children.map(node => node.key)).toEqual(['g:all/g:eng'])
    expect(all.children[0]!.children.map(node => node.key)).toEqual(['g:all/g:eng/p:dan'])
    expect(roots[1]!.children.map(node => node.key)).toEqual(['g:ops/g:eng'])
  })
})
