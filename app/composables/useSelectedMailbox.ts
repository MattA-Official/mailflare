// The mailbox the mail views are scoped to, shared by every page. Ported from
// legacy/src/components/mailbox-provider.tsx and mailbox-provider-utils.ts; useState stands in for
// the React context.
import { PROFILE_AVATAR_CHANGED_EVENT } from '#lib/profile/avatar-client'
import { PROFILE_NAME_CHANGED_EVENT } from '#lib/profile/name-client'
import type { ProfileNameChangedDetail } from '#lib/profile/types'

export type MailboxOption = {
  id: string
  domainId: string
  localPart: string
  hostname: string
  displayName: string | null
  signature?: string | null
  autoReplyEnabled?: boolean
  autoReplySubject?: string
  autoReplyBody?: string
  hasAvatar?: boolean
  type?: 'personal' | 'shared'
  permission?: 'read_only' | 'send_as' | 'send_on_behalf' | 'full_access'
  isPrimary?: boolean
  senderAddresses?: string[]
}

export const SELECTED_MAILBOX_STORAGE_KEY = 'selected-mailbox-id'
/** Admin pages dispatch this after creating, renaming or deleting mailboxes. */
export const MAILBOXES_CHANGED_EVENT = 'mailflare:mailboxes-changed'

// The /api/mailboxes cache, the request in flight and the retry timer, kept per app.
const local = () => appScoped('selected-mailbox', () => ({
  mailboxesCache: null as MailboxOption[] | null,
  mailboxesCacheSessionToken: null as string | null,
  mailboxesRequest: null as Promise<MailboxOption[]> | null,
  mailboxesRequestSessionToken: null as string | null,
  cacheGeneration: 0,
  started: false,
  retryTimer: null as ReturnType<typeof setTimeout> | null,
  retryDelay: 5_000,
}))

/** The primary mailbox is the one at the account address; only its name and avatar follow the profile. */
export function isIdentityMailbox(mailbox: Pick<MailboxOption, 'type' | 'isPrimary'>): boolean {
  return mailbox.type === 'personal' && !!mailbox.isPrimary
}

export function clearMailboxesCache() {
  const state = local()
  state.cacheGeneration += 1
  state.mailboxesCache = null
  state.mailboxesCacheSessionToken = null
  state.mailboxesRequest = null
  state.mailboxesRequestSessionToken = null
}

export function getMailboxAddress(mailbox: MailboxOption): string {
  return `${mailbox.localPart}@${mailbox.hostname}`
}

export function getMailboxName(mailbox: MailboxOption): string {
  return mailbox.displayName ?? mailbox.localPart
}

export async function fetchMailboxOptions(force = false): Promise<MailboxOption[]> {
  const state = local()
  const sessionToken = getClientSessionToken()
  if (!force && state.mailboxesCache && state.mailboxesCacheSessionToken === sessionToken) return state.mailboxesCache
  if (!force && state.mailboxesRequest && state.mailboxesRequestSessionToken === sessionToken) return state.mailboxesRequest

  const requestGeneration = state.cacheGeneration
  state.mailboxesRequestSessionToken = sessionToken
  state.mailboxesRequest = authFetch('/api/mailboxes')
    // Fork-only: a failed request must not be cached as "no mailboxes", or the switcher and every
    // inbox picker stay empty until a full reload even after the server recovers.
    .then((response) => {
      if (!response.ok) throw new Error(`Failed to load mailboxes (${response.status})`)
      return response.json()
    })
    .then((data) => {
      const items = ((data as { mailboxes?: MailboxOption[] }).mailboxes ?? []).map(m => ({
        id: m.id,
        domainId: m.domainId,
        localPart: m.localPart,
        hostname: m.hostname,
        displayName: m.displayName,
        signature: m.signature,
        autoReplyEnabled: m.autoReplyEnabled,
        autoReplySubject: m.autoReplySubject,
        autoReplyBody: m.autoReplyBody,
        hasAvatar: m.hasAvatar,
        type: m.type,
        permission: m.permission,
        isPrimary: m.isPrimary,
        senderAddresses: m.senderAddresses,
      }))
      if (requestGeneration === state.cacheGeneration) {
        state.mailboxesCache = items
        state.mailboxesCacheSessionToken = sessionToken
      }
      return items
    })
    .finally(() => {
      if (requestGeneration === state.cacheGeneration) {
        state.mailboxesRequest = null
        state.mailboxesRequestSessionToken = null
      }
    })
  return state.mailboxesRequest
}

function useMailboxState() {
  return {
    mailboxes: useState<MailboxOption[]>('mailboxes', () => []),
    selectedMailbox: useState<MailboxOption | null>('selected-mailbox', () => null),
    isLoading: useState('mailboxes-loading', () => true),
  }
}

function readStoredId(): string | null {
  try {
    return localStorage.getItem(SELECTED_MAILBOX_STORAGE_KEY)
  } catch {
    return null
  }
}

function storeId(id: string | null) {
  try {
    if (id) localStorage.setItem(SELECTED_MAILBOX_STORAGE_KEY, id)
    else localStorage.removeItem(SELECTED_MAILBOX_STORAGE_KEY)
  } catch {
    // Storage can be unavailable in private windows; the selection still holds for this page.
  }
}

function scheduleRetry() {
  const state = local()
  if (!import.meta.client || state.retryTimer) return
  const retry = () => {
    if (state.retryTimer) clearTimeout(state.retryTimer)
    state.retryTimer = null
    window.removeEventListener('focus', retry)
    void loadMailboxes(true)
  }
  state.retryTimer = setTimeout(retry, state.retryDelay)
  state.retryDelay = Math.min(state.retryDelay * 2, 60_000)
  window.addEventListener('focus', retry)
}

async function loadMailboxes(force = false) {
  const { mailboxes, selectedMailbox, isLoading } = useMailboxState()
  const state = local()
  const sessionToken = getClientSessionToken()
  try {
    const items = await fetchMailboxOptions(force)
    if (sessionToken !== getClientSessionToken()) return
    state.retryDelay = 5_000
    mailboxes.value = items
    const keep = items.find(mb => mb.id === (selectedMailbox.value?.id ?? readStoredId()))
    const next = keep ?? items.find(mb => mb.isPrimary) ?? items[0] ?? null
    selectedMailbox.value = next
    if (next && !keep) storeId(next.id)
  } catch {
    // A failed load leaves the previous list; pages show their own errors.
    // Fork-only: try again shortly, and when the tab regains focus, so a server hiccup (such as a
    // pending migration) does not leave the inbox list empty until the person signs out.
    scheduleRetry()
  } finally {
    if (sessionToken === getClientSessionToken()) isLoading.value = false
  }
}

function setSelectedMailbox(mailbox: MailboxOption | null) {
  const { mailboxes, selectedMailbox } = useMailboxState()
  if (selectedMailbox.value?.id !== mailbox?.id) selectedMailbox.value = mailbox
  if (mailbox) {
    mailboxes.value = mailboxes.value.map(item => (item.id === mailbox.id && item !== mailbox ? mailbox : item))
    storeId(mailbox.id)
  } else {
    storeId(null)
  }
}

/** Forgets the list and the stored selection; used when the signed-in account changes. */
export function clearMailboxClientState() {
  clearMailboxesCache()
  storeId(null)
}

function start() {
  if (!import.meta.client) return
  const state = local()
  if (state.started) return
  state.started = true
  const { mailboxes, selectedMailbox, isLoading } = useMailboxState()
  void loadMailboxes()

  window.addEventListener(AUTH_SESSION_CHANGED_EVENT, (event) => {
    clearMailboxClientState()
    mailboxes.value = []
    selectedMailbox.value = null
    isLoading.value = true
    if ((event as CustomEvent<AuthSessionChangedDetail>).detail?.authenticated) void loadMailboxes(true)
  })
  window.addEventListener(MAILBOXES_CHANGED_EVENT, () => {
    clearMailboxesCache()
    void loadMailboxes(true)
  })
  window.addEventListener(PROFILE_NAME_CHANGED_EVENT, (event) => {
    const { name } = (event as CustomEvent<ProfileNameChangedDetail>).detail
    clearMailboxesCache()
    mailboxes.value = mailboxes.value.map(mb => (isIdentityMailbox(mb) ? { ...mb, displayName: name } : mb))
    if (selectedMailbox.value && isIdentityMailbox(selectedMailbox.value)) selectedMailbox.value = { ...selectedMailbox.value, displayName: name }
  })
  window.addEventListener(PROFILE_AVATAR_CHANGED_EVENT, () => {
    clearMailboxesCache()
    mailboxes.value = mailboxes.value.map(mb => (isIdentityMailbox(mb) ? { ...mb, hasAvatar: true } : mb))
    if (selectedMailbox.value && isIdentityMailbox(selectedMailbox.value)) selectedMailbox.value = { ...selectedMailbox.value, hasAvatar: true }
  })
}

/** `{ selectedMailbox, mailboxes, isLoading, setSelectedMailbox }`, shared app-wide. */
export function useSelectedMailbox() {
  start()
  const { mailboxes, selectedMailbox, isLoading } = useMailboxState()
  return {
    selectedMailbox: computed(() => selectedMailbox.value),
    mailboxes: computed(() => mailboxes.value),
    isLoading: computed(() => isLoading.value),
    setSelectedMailbox,
    refresh: () => loadMailboxes(true),
  }
}
