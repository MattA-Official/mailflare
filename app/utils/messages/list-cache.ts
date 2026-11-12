// Message list and folder count requests with their in-memory caches, ported from
// legacy/src/hooks/utils.ts. Every list, the sidebar counts and the app badge share these, so one change
// event costs one request per distinct query.
import { parseSearchQuery } from '#lib/search/query-utils'
import { getUserTimeZone } from '#lib/time/utils'
import { isReadOnlyChange, MESSAGES_CHANGED_EVENT } from '#lib/messages/change-events'
import type { MessageCounts, MessageFilterOptions, MessageFolder, MessageListResponse } from '~/types/messages'
import { clearMessageDetailCache, setCachedMessageRead } from './detail-cache'

/**
 * The search string goes to the server whole; operators are parsed there against the full-text
 * index. Only the read state is lifted out here so the unread toggle and `is:unread` share one
 * `read` parameter.
 */
export function parseMessageSearchQuery(query: string): MessageFilterOptions {
  const parsed = parseSearchQuery(query)
  const filters: MessageFilterOptions = {}
  if (parsed.read) filters.read = parsed.read
  const remaining = query.replace(/(^|\s)(is:(un)?read|:(un)?read)(?=\s|$)/gi, ' ').replace(/\s+/g, ' ').trim()
  if (remaining) filters.query = remaining
  return filters
}

export function getMessageQueryParams(
  folder: MessageFolder,
  mailboxId?: string | null,
  filters?: MessageFilterOptions,
  folderId?: string | null,
) {
  const params = new URLSearchParams()
  params.set('timeZone', getUserTimeZone())

  if (folder === 'inbox') {
    params.set('direction', 'inbound')
    params.set('status', 'received')
  }
  if (folder === 'starred') params.set('starred', 'true')
  if (folder === 'snoozed') params.set('snoozed', 'true')
  if (folder === 'sent') {
    params.set('direction', 'outbound')
    params.set('status', 'sent')
  }
  if (folder === 'scheduled') {
    params.set('direction', 'outbound')
    params.set('scheduled', 'true')
  }
  if (folder === 'drafts') {
    params.set('direction', 'outbound')
    params.set('status', 'draft')
  }
  if (folder === 'archived' || folder === 'trash' || folder === 'spam') params.set('status', folder)

  if (folderId) params.set('folderId', folderId)
  if (mailboxId) params.set('mailboxId', mailboxId)
  const searchFilters = filters?.query ? parseMessageSearchQuery(filters.query) : null
  const parsedFilters = searchFilters
    ? { ...filters, ...searchFilters, read: filters?.read ?? searchFilters.read }
    : filters
  if (parsedFilters?.query?.trim()) params.set('q', parsedFilters.query.trim())
  if (parsedFilters?.title?.trim()) params.set('title', parsedFilters.title.trim())
  if (parsedFilters?.read && parsedFilters.read !== 'all') params.set('read', parsedFilters.read)
  if (filters?.limit) params.set('limit', String(filters.limit))
  if (filters?.offset) params.set('offset', String(filters.offset))
  if (filters?.group) params.set('group', filters.group)

  return params
}

const messageCountsCache = new Map<string, MessageCounts>()
const messageCountsRequests = new Map<string, Promise<MessageCounts | undefined>>()
const messageListCache = new Map<string, MessageListResponse>()
const messageListRequests = new Map<string, Promise<MessageListResponse>>()
let messageCacheGeneration = 0
let messageCountsGeneration = 0

export function clearMessageCountsCache() {
  messageCountsGeneration += 1
  messageCountsCache.clear()
  messageCountsRequests.clear()
}

export function clearMessageListCache() {
  messageCacheGeneration += 1
  messageListCache.clear()
  messageListRequests.clear()
}

/**
 * Mirror a read/unread change into the cached lists and details, so a list remounted later (or a
 * detail reopened) never shows the old state.
 */
export function markMessagesReadInCaches(messageIds: string[], read: boolean) {
  const ids = new Set(messageIds)
  for (const [key, response] of messageListCache) {
    if (!response.messages?.some(message => ids.has(message.id) || message.threadMessageIds?.some(id => ids.has(id)))) continue
    messageListCache.set(key, {
      ...response,
      messages: response.messages.map((message) => {
        if (message.threadMessageIds) {
          const threadSize = message.threadMessageIds.length
          const flipped = message.threadMessageIds.reduce((total, id) => total + (ids.has(id) ? 1 : 0), 0)
          if (!flipped) return message
          const threadUnread = Math.min(threadSize, Math.max(0, (message.threadUnread ?? 0) + (read ? -flipped : flipped)))
          return { ...message, read: threadUnread === 0, threadUnread }
        }
        return ids.has(message.id) ? { ...message, read } : message
      }),
    })
  }
  for (const id of ids) setCachedMessageRead(id, read)
}

export function clearMessageClientState() {
  messageCacheGeneration += 1
  messageCountsGeneration += 1
  messageCountsCache.clear()
  messageCountsRequests.clear()
  messageListCache.clear()
  messageListRequests.clear()
  clearMessageDetailCache()
}

// Caches must drop on every change, including ones made while no list is mounted (e.g. reading a
// message from the popup on a page without the inbox list).
if (import.meta.client) {
  window.addEventListener(MESSAGES_CHANGED_EVENT, (event) => {
    if (!isReadOnlyChange(event)) clearMessageListCache()
    clearMessageCountsCache()
  })
}

export async function fetchMessageCounts(mailboxId?: string | null, force = false): Promise<MessageCounts | undefined> {
  const key = mailboxId ?? 'all'
  if (!force && messageCountsCache.has(key)) return messageCountsCache.get(key)
  if (!force && messageCountsRequests.has(key)) return messageCountsRequests.get(key)

  const requestGeneration = messageCacheGeneration
  const countsGeneration = messageCountsGeneration
  const request = (async () => {
    const params = new URLSearchParams()
    if (mailboxId) params.set('mailboxId', mailboxId)
    const query = params.toString()
    const response = await authFetch(`/api/messages/counts${query ? `?${query}` : ''}`)
    const data = (await response.json()) as { counts?: MessageCounts }
    const counts = data.counts
    if (counts && requestGeneration === messageCacheGeneration && countsGeneration === messageCountsGeneration) {
      messageCountsCache.set(key, counts)
    }
    return counts
  })().finally(() => {
    if (messageCountsRequests.get(key) === request) messageCountsRequests.delete(key)
  })

  messageCountsRequests.set(key, request)
  return request
}

export function peekMessageList(params: URLSearchParams): MessageListResponse | undefined {
  return messageListCache.get(params.toString())
}

export async function fetchMessageList(params: URLSearchParams, force = false): Promise<MessageListResponse> {
  const key = params.toString()
  if (!force && messageListCache.has(key)) return messageListCache.get(key) ?? {}
  if (!force && messageListRequests.has(key)) return messageListRequests.get(key) ?? {}
  const requestGeneration = messageCacheGeneration
  const request = authFetch(`/api/messages?${key}`)
    .then(response => response.json())
    .then((data) => {
      const response = data as MessageListResponse
      if (requestGeneration === messageCacheGeneration) messageListCache.set(key, response)
      return response
    })
    .finally(() => {
      if (requestGeneration === messageCacheGeneration) messageListRequests.delete(key)
    })

  messageListRequests.set(key, request)
  return request
}

/** Preloads the first page of a sidebar folder on hover, as upstream's nav does. */
export async function preloadMailboxPage(href: string, mailboxId?: string, options: { query?: string, grouped?: boolean } = {}) {
  const customFolderMatch = href.match(/^\/folders\/([^/]+)$/)
  const folder = (customFolderMatch ? 'inbox' : href.slice(1)) as MessageFolder
  const supportedFolders: MessageFolder[] = ['inbox', 'starred', 'snoozed', 'sent', 'scheduled', 'drafts', 'archived', 'spam', 'trash']
  if (!supportedFolders.includes(folder)) return
  const params = getMessageQueryParams(
    folder,
    mailboxId,
    { query: options.query?.trim() || undefined, read: 'all', limit: 25, offset: 0, group: options.grouped && folder !== 'drafts' ? 'thread' : undefined },
    customFolderMatch?.[1],
  )
  await fetchMessageList(params)
}

/** Moves messages from a drop on a sidebar folder (upstream dashboard-nav-utils). */
export async function moveMessagesFromNav(payload: { messageIds: string[], action: 'archive' | 'spam' | 'trash' | 'folder', folderId?: string }) {
  await api('/api/messages/bulk', { method: 'POST', body: payload })
  window.dispatchEvent(new Event(MESSAGES_CHANGED_EVENT))
}
