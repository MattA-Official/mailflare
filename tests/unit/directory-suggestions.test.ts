// Fork-only: colleagues and groups in compose suggestions (mergeDirectorySuggestions).
import { expect, test } from 'vitest'
import { mergeDirectorySuggestions } from '../../app/utils/compose/recipient-suggestions-utils'

const contact = (email: string, source: 'manual' | 'inbound' | 'outbound', displayName: string | null = null) => ({ email, displayName, hasAvatar: false, blocked: false, source })
const people = [
  { id: 'u_ann', name: 'Ann Archer', email: 'ann@one.test', addresses: ['ann@one.test', 'ceo@one.test'], title: 'Chief executive', department: 'Leadership', hasAvatar: true },
  { id: 'u_andy', name: 'Andy Ash', email: 'andy@one.test', addresses: ['andy@one.test'], title: null, department: null, hasAvatar: false },
]
const groups = [{ id: 'g1', name: 'Analytics', description: null, memberCount: 3 }, { id: 'g2', name: 'Empty an', description: null, memberCount: 0 }]

test('a colleague already among the contacts is marked there, not listed twice; colleagues rank below saved and written-to contacts, above senders only heard from, then groups', () => {
  const merged = mergeDirectorySuggestions(
    [contact('anita@ext.test', 'inbound'), contact('anne@ext.test', 'manual', 'Anne'), contact('ceo@one.test', 'outbound')],
    { people, groups },
    'an',
  )
  expect(merged.map(item => item.email)).toEqual(['anne@ext.test', 'ceo@one.test', 'andy@one.test', 'anita@ext.test', 'group:g1'])
  expect(merged[1]!.colleague?.id).toBe('u_ann')
  expect(merged[1]!.displayName).toBe('Ann Archer')
  expect(merged.at(-1)!.group).toEqual({ id: 'g1', memberCount: 3 })
})

test('every word must match a colleague', () => {
  const merged = mergeDirectorySuggestions([], { people, groups: [] }, 'chief ann')
  expect(merged.map(item => item.email)).toEqual(['ann@one.test'])
})
