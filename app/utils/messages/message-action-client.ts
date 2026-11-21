// Reversible message actions with undo, ported from legacy/src/lib/messages/actions/client.ts and
// undo-store.ts. Upstream keeps optimistic overlays in its SWR caches; the Vue app refreshes its lists
// from the change event instead, so this keeps only the server round trip, the shared caches' read
// state and the undo toast queue.
import { reactive } from 'vue'
import { authFetch } from '~/utils/auth-client'
import { dispatchMessagesChanged } from '#lib/messages/change-events'
import { getChangedStateFields } from '#lib/messages/actions/definitions'
import type {
  MessageActionInput,
  MessageActionRecord,
  MessageActionRequestOptions,
  MessageActionResponse,
  MessageActionSkipped,
  MessageActionTransportBody,
  ReversibleMessageAction,
  UndoMessageActionResponse,
} from '#lib/messages/actions/types'
import { markMessagesReadInCaches } from '~/utils/messages/list-cache'
import { markMessageThreadReadInCaches } from '~/utils/messages/thread-cache'

const MESSAGE_ACTION_TIMEOUT_MS = 30_000

export class MessageActionRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'MessageActionRequestError'
  }
}

async function sendMessageAction<T>(body: MessageActionTransportBody): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, MESSAGE_ACTION_TIMEOUT_MS)
  try {
    const response = await authFetch('/api/messages/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    if (!response.ok) throw new MessageActionRequestError(data.error ?? 'Unable to update message', response.status)
    return data as T
  }
  catch (error) {
    if (timedOut || (error instanceof Error && error.name === 'AbortError')) {
      throw new MessageActionRequestError('The server did not respond in time', 408)
    }
    throw error
  }
  finally {
    clearTimeout(timeout)
  }
}

/** Brings the shared caches and every mounted list in line with what the server applied. */
function publishRecords(records: MessageActionRecord[], direction: 'previous' | 'applied', notify = true) {
  const read = new Map<boolean, string[]>()
  for (const record of records) {
    if (!getChangedStateFields(record.previous, record.applied).includes('read')) continue
    const value = record[direction].read
    read.set(value, [...(read.get(value) ?? []), record.id])
  }
  for (const [value, ids] of read) {
    markMessagesReadInCaches(ids, value)
    markMessageThreadReadInCaches(ids, value)
  }
  if (!notify) return
  const onlyRead = records.every(record => getChangedStateFields(record.previous, record.applied).every(field => field === 'read'))
  if (onlyRead && read.size === 1) {
    const [[value, ids]] = [...read]
    dispatchMessagesChanged({ kind: 'read', messageIds: ids, read: value })
  }
  else {
    dispatchMessagesChanged()
  }
}

/** Applies an explicit action. Unless `undo` is false, a toast offers to revert it. */
export async function performMessageAction(
  input: MessageActionInput,
  options: MessageActionRequestOptions & { context?: string } = {},
): Promise<MessageActionResponse> {
  const result = await sendMessageAction<MessageActionResponse>({ op: 'apply', ...input })
  const changed = result.applied.filter(record => getChangedStateFields(record.previous, record.applied).length > 0)
  publishRecords(result.applied, 'applied', options.notify !== false)
  if (options.undo !== false && result.undoToken && changed.length > 0) {
    showUndoToast({ action: result.action, records: changed, undoToken: result.undoToken, skipped: result.skipped.length, context: options.context })
  }
  return result
}

async function undoMessageAction(entry: UndoToastEntry): Promise<UndoMessageActionResponse> {
  const result = await sendMessageAction<UndoMessageActionResponse>({ op: 'undo', token: entry.undoToken })
  const restored = new Set(result.restored)
  publishRecords(entry.records.filter(record => restored.has(record.id)), 'previous')
  return result
}

// ---- Undo toast queue (upstream's undo-store.ts, simplified) ----

export type UndoToastFailureKind = 'expired' | 'unavailable' | 'stale' | 'network' | 'server'
export type UndoToastFailure = { kind: UndoToastFailureKind, retryable: boolean }
export type UndoToastStatus = 'idle' | 'undoing' | 'failed' | 'partial'

export type UndoToastEntry = {
  id: number
  action: ReversibleMessageAction
  records: MessageActionRecord[]
  undoToken: string
  skipped: number
  status: UndoToastStatus
  context?: string
  failure?: UndoToastFailure
  restored?: number
}

export type UndoAnnouncement = { sequence: number, assertive: boolean, entry: UndoToastEntry, kind: 'applied' | 'undo-success' | 'undo-partial' | 'undo-failed' }

/** Long enough to reach the notification with a keyboard; paused while hovered or focused. */
export const UNDO_WINDOW_MS = 20_000
const VISIBLE_LIMIT = 4
const QUEUE_LIMIT = 12

let nextId = 1
let announcementSequence = 0
const timers = new Map<number, { remaining: number, startedAt: number, handle: ReturnType<typeof setTimeout> | null, holds: Set<string> }>()

export const undoToastState = reactive({
  visible: [] as UndoToastEntry[],
  queued: [] as UndoToastEntry[],
  announcement: null as UndoAnnouncement | null,
})

function announce(kind: UndoAnnouncement['kind'], entry: UndoToastEntry) {
  announcementSequence += 1
  undoToastState.announcement = { sequence: announcementSequence, assertive: kind === 'undo-failed' || kind === 'undo-partial', entry: { ...entry }, kind }
}

function startTimer(id: number, duration = UNDO_WINDOW_MS) {
  const timer = { remaining: duration, startedAt: Date.now(), handle: null as ReturnType<typeof setTimeout> | null, holds: new Set<string>() }
  timers.set(id, timer)
  timer.handle = setTimeout(() => dismissUndoToast(id), duration)
}

function promote() {
  while (undoToastState.visible.length < VISIBLE_LIMIT && undoToastState.queued.length > 0) {
    const entry = undoToastState.queued.shift()!
    undoToastState.visible.push(entry)
    startTimer(entry.id)
  }
}

function find(id: number) {
  return undoToastState.visible.find(entry => entry.id === id)
}

export function showUndoToast(input: { action: ReversibleMessageAction, records: MessageActionRecord[], undoToken: string, skipped: number, context?: string }) {
  const entry: UndoToastEntry = { id: nextId++, status: 'idle', ...input }
  if (undoToastState.visible.length < VISIBLE_LIMIT) {
    undoToastState.visible.push(entry)
    startTimer(entry.id)
  }
  else {
    undoToastState.queued.push(entry)
    if (undoToastState.queued.length > QUEUE_LIMIT) undoToastState.queued.shift()
  }
  announce('applied', entry)
}

export function dismissUndoToast(id: number) {
  const timer = timers.get(id)
  if (timer?.handle) clearTimeout(timer.handle)
  timers.delete(id)
  undoToastState.visible = undoToastState.visible.filter(entry => entry.id !== id)
  undoToastState.queued = undoToastState.queued.filter(entry => entry.id !== id)
  promote()
}

export function pauseUndoToast(id: number, reason: string) {
  const timer = timers.get(id)
  if (!timer) return
  timer.holds.add(reason)
  if (!timer.handle) return
  clearTimeout(timer.handle)
  timer.handle = null
  timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt))
}

export function resumeUndoToast(id: number, reason: string) {
  const timer = timers.get(id)
  if (!timer) return
  timer.holds.delete(reason)
  if (timer.holds.size > 0 || timer.handle) return
  const entry = find(id)
  if (entry?.status === 'undoing') return
  timer.startedAt = Date.now()
  timer.handle = setTimeout(() => dismissUndoToast(id), Math.max(timer.remaining, 4_000))
}

export function pauseUndoToasts(reason: string) {
  for (const entry of undoToastState.visible) pauseUndoToast(entry.id, reason)
}

export function resumeUndoToasts(reason: string) {
  for (const entry of undoToastState.visible) resumeUndoToast(entry.id, reason)
}

/** Signed-out or switched accounts must not keep another session's undo tokens. */
export function resetUndoToasts() {
  for (const timer of timers.values()) if (timer.handle) clearTimeout(timer.handle)
  timers.clear()
  undoToastState.visible = []
  undoToastState.queued = []
  undoToastState.announcement = null
}

function failureFromError(error: unknown): UndoToastFailure {
  if (error instanceof MessageActionRequestError) {
    if (error.status === 410) return { kind: 'expired', retryable: false }
    if (error.status === 404) return { kind: 'unavailable', retryable: false }
    if (error.status === 409 || error.status === 412 || error.status === 422) return { kind: 'stale', retryable: false }
    if (error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500) return { kind: 'server', retryable: true }
    return { kind: 'server', retryable: false }
  }
  return { kind: 'network', retryable: true }
}

function failureFromSkipped(skipped: MessageActionSkipped[]): UndoToastFailure {
  const reasons = new Set(skipped.map(item => item.reason))
  if (reasons.has('failed')) return { kind: 'server', retryable: true }
  if (reasons.has('stale')) return { kind: 'stale', retryable: false }
  if (reasons.has('not_found') || reasons.has('forbidden') || reasons.has('invalid_target') || reasons.has('not_applicable')) {
    return { kind: 'unavailable', retryable: false }
  }
  return { kind: 'server', retryable: false }
}

function update(id: number, patch: Partial<UndoToastEntry>) {
  const entry = find(id)
  if (entry) Object.assign(entry, patch)
  return entry
}

/** Runs the undo for a visible toast. Done toasts close; failed and partial ones stay for a moment. */
export async function runUndo(id: number) {
  const current = find(id)
  if (!current) return
  if (current.status !== 'idle' && !(current.status === 'failed' && current.failure?.retryable)) return
  pauseUndoToast(id, 'undo')
  update(id, { status: 'undoing', failure: undefined })
  try {
    const result = await undoMessageAction(current)
    const restoredIds = new Set(result.restored)
    const restored = current.records.filter(record => restoredIds.has(record.id)).length
    if (restored === 0) {
      const entry = update(id, { status: 'failed', failure: failureFromSkipped(result.skipped) })
      if (entry) announce('undo-failed', entry)
    }
    else if (restored < current.records.length || result.skipped.length > 0) {
      const entry = update(id, { status: 'partial', restored })
      if (entry) announce('undo-partial', entry)
    }
    else {
      announce('undo-success', current)
      dismissUndoToast(id)
      return
    }
  }
  catch (error) {
    const entry = update(id, { status: 'failed', failure: failureFromError(error) })
    if (entry) announce('undo-failed', entry)
  }
  const timer = timers.get(id)
  if (timer) timer.remaining = UNDO_WINDOW_MS / 2
  resumeUndoToast(id, 'undo')
}
