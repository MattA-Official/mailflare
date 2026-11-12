// The mailbox the mail views are scoped to, shared by every page. Ported from
// legacy/src/components/mailbox-provider.tsx and mailbox-provider-utils.ts; module-level refs stand
// in for the React context.
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

let mailboxesCache: MailboxOption[] | null = null
let mailboxesCacheSessionToken: string | null = null
let mailboxesRequest: Promise<MailboxOption[]> | null = null
let mailboxesRequestSessionToken: string | null = null
let cacheGeneration = 0

/** The primary mailbox is the one at the account address; only its name and avatar follow the profile. */
export function isIdentityMailbox(mailbox: Pick<MailboxOption, 'type' | 'isPrimary'>): boolean {
  return mailbox.type === 'personal' && !!mailbox.isPrimary
}

export function clearMailboxesCache() {
  cacheGeneration += 1
  mailboxesCache = null
  mailboxesCacheSessionToken = null
  mailboxesRequest = null
  mailboxesRequestSessionToken = null
}

export function getMailboxAddress(mailbox: MailboxOption): string {
  return `${mailbox.localPart}@${mailbox.hostname}`
}

export function getMailboxName(mailbox: MailboxOption): string {
  return mailbox.displayName ?? mailbox.localPart
}

export async function fetchMailboxOptions(force = false): Promise<MailboxOption[]> {
  const sessionToken = getClientSessionToken()
  if (!force && mailboxesCache && mailboxesCacheSessionToken === sessionToken) return mailboxesCache
  if (!force && mailboxesRequest && mailboxesRequestSessionToken === sessionToken) return mailboxesRequest

  const requestGeneration = cacheGeneration
  mailboxesRequestSessionToken = sessionToken
  mailboxesRequest = authFetch('/api/mailboxes')
    .then(response => response.json())
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
      if (requestGeneration === cacheGeneration) {
        mailboxesCache = items
        mailboxesCacheSessionToken = sessionToken
      }
      return items
    })
    .finally(() => {
      if (requestGeneration === cacheGeneration) {
        mailboxesRequest = null
        mailboxesRequestSessionToken = null
      }
    })
  return mailboxesRequest
}

const mailboxes = ref<MailboxOption[]>([])
const selectedMailbox = ref<MailboxOption | null>(null)
const isLoading = ref(true)
let started = false

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

async function loadMailboxes(force = false) {
  const sessionToken = getClientSessionToken()
  try {
    const items = await fetchMailboxOptions(force)
    if (sessionToken !== getClientSessionToken()) return
    mailboxes.value = items
    const keep = items.find(mb => mb.id === (selectedMailbox.value?.id ?? readStoredId()))
    const next = keep ?? items.find(mb => mb.isPrimary) ?? items[0] ?? null
    selectedMailbox.value = next
    if (next && !keep) storeId(next.id)
  } catch {
    // A failed load leaves the previous list; pages show their own errors.
  } finally {
    if (sessionToken === getClientSessionToken()) isLoading.value = false
  }
}

function setSelectedMailbox(mailbox: MailboxOption | null) {
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
  if (started || !import.meta.client) return
  started = true
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
  return {
    selectedMailbox: computed(() => selectedMailbox.value),
    mailboxes: computed(() => mailboxes.value),
    isLoading: computed(() => isLoading.value),
    setSelectedMailbox,
    refresh: () => loadMailboxes(true),
  }
}
