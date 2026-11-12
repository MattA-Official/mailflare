// Ported from legacy/tests/agent-draft-actions.test.mjs.
import { describe, expect, it } from 'vitest'
import { uniqueAgentDraftActions } from '../../app/utils/agent/agent-utils'
import type { AgentMessage } from '../../app/types/agent/agent'

function tool(id: string, content: unknown, toolState: AgentMessage['toolState'] = 'used'): AgentMessage {
  return { id, role: 'tool', content: JSON.stringify(content), toolState }
}

describe('uniqueAgentDraftActions', () => {
  it('draft then edit then review keeps one action on the latest revision', () => {
    const actions = uniqueAgentDraftActions([
      tool('draft', { draftId: 'd1', revision: 1, status: 'draft_created' }),
      tool('edit', { draftId: 'd1', revision: 2, status: 'draft_updated', scheduledAt: '2026-10-01T15:00:00.000Z' }),
      tool('review', { draftId: 'd1', revision: 2, status: 'pending_approval', scheduledAt: '2026-10-01T15:00:00.000Z', reviewUrl: '/agent/review/a1' }),
    ])
    expect(actions).toEqual([{ messageId: 'review', draftId: 'd1', revision: 2, scheduledAt: '2026-10-01T15:00:00.000Z' }])
  })

  it('a cleared schedule does not keep the previous send time', () => {
    const actions = uniqueAgentDraftActions([
      tool('edit', { draftId: 'd1', revision: 2, status: 'draft_updated', scheduledAt: '2026-10-01T15:00:00.000Z' }),
      tool('clear', { draftId: 'd1', revision: 3, status: 'draft_updated', scheduledAt: null }),
    ])
    expect(actions[0]!.scheduledAt).toBeNull()
    expect(actions[0]!.revision).toBe(3)
  })

  it('separate drafts each keep one action, and a sent draft drops its action', () => {
    const actions = uniqueAgentDraftActions([
      tool('a', { draftId: 'd1', revision: 1, status: 'draft_created' }),
      tool('b', { draftId: 'd2', revision: 1, status: 'draft_created' }),
      tool('sent', { draftId: 'd1', revision: 1, status: 'sent' }),
    ])
    expect(actions.map(action => action.draftId)).toEqual(['d2'])
  })
})
