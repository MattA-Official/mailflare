// The notes of the open conversation, shared by the toolbar button, the notes under the subject and
// each email's menu. Ported from legacy/src/components/messages/conversation-notes-context.tsx: the
// React context becomes provide/inject, set up by <MessagesConversationNotesProvider>.
import type { InjectionKey, MaybeRefOrGetter, Ref } from 'vue'
import type { ConversationNote } from '#lib/notes/types'
import { authFetch } from '~/utils/auth-client'

/** An email of the open conversation, named on the notes that are about it. */
export type NoteEmail = {
  id: string
  sender: string
  /** The recipients of an outbound email, named on the chip instead of the sender. */
  recipient?: string
  createdAt: string
}

export type ConversationNotesState = {
  notes: Ref<ConversationNote[]>
  /** The email the notes were looked up from; avatars are served relative to it. */
  messageId: Ref<string>
  loading: Ref<boolean>
  /** Whether the notes are shown in full, with the box to write one. */
  open: Ref<boolean>
  /** The email the next note will be about; null for the whole conversation. */
  attachTo: Ref<string | null>
  /** Opens the notes and puts the cursor in the box, for a note about `messageId` when given. */
  startNote: (messageId?: string) => void
  /** Goes up each time `startNote` asks the box to take focus; 0 once handled. */
  focusRequest: Ref<number>
  /** Text of the note being written; lives here so collapsing the panel keeps it. */
  draft: Ref<string>
  /** True while `add` is saving. */
  adding: Ref<boolean>
  /** Text of each note being edited, by note id; a key means that note is in edit mode. */
  editDrafts: Ref<Record<string, string>>
  /** Pass null to leave edit mode without saving. */
  setEditDraft: (noteId: string, html: string | null) => void
  email: (messageId: string) => NoteEmail | undefined
  /** Each of these rejects when the server refuses or cannot be reached. */
  add: (html: string) => Promise<void>
  update: (noteId: string, html: string) => Promise<void>
  remove: (noteId: string) => Promise<void>
}

const KEY: InjectionKey<ConversationNotesState> = Symbol('conversation-notes')

async function sendNote(url: string, method: 'POST' | 'PATCH', body: Record<string, unknown>): Promise<ConversationNote> {
  const response = await authFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await response.json().catch(() => null)) as { note?: ConversationNote, error?: string } | null
  if (!response.ok || !data?.note) throw new Error(data?.error ?? 'Note save failed')
  return data.note
}

/** Sets up the notes of the conversation of `messageId` for the calling component's subtree. Refetches when mail changes. */
export function provideConversationNotes(
  messageIdSource: MaybeRefOrGetter<string>,
  emailsSource: MaybeRefOrGetter<NoteEmail[]>,
  /** Identifies the conversation; when it changes, the panel, drafts and notes start afresh. Defaults to the message id. */
  conversationKeySource: MaybeRefOrGetter<string | null | undefined> = messageIdSource,
): ConversationNotesState {
  const messageId = computed(() => toValue(messageIdSource))
  const notes = ref<ConversationNote[]>([])
  const loading = ref(true)
  const open = ref(false)
  const attachTo = ref<string | null>(null)
  const draft = ref('')
  const adding = ref(false)
  const editDrafts = ref<Record<string, string>>({})
  const focusRequest = ref(0)
  let active = true

  // A different conversation starts afresh; the load below then runs again for it.
  watch(() => toValue(conversationKeySource), () => {
    notes.value = []
    loading.value = true
    open.value = false
    attachTo.value = null
    draft.value = ''
    editDrafts.value = {}
    focusRequest.value = 0
  }, { flush: 'sync' })

  watch([messageId, () => toValue(conversationKeySource)], ([id], _previous, onCleanup) => {
    let cancelled = false
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    async function load() {
      try {
        const response = await authFetch(`/api/messages/${id}/notes`)
        const data = (await response.json().catch(() => null)) as { notes?: ConversationNote[] } | null
        if (!cancelled && response.ok) notes.value = data?.notes ?? []
      }
      catch {
        // Keep what is on screen; the next change event tries again.
      }
      finally {
        if (!cancelled) loading.value = false
      }
    }
    void load()
    function scheduleLoad() {
      if (document.visibilityState !== 'visible') return
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        refreshTimer = null
        void load()
      }, 150)
    }
    window.addEventListener('mailflare:messages-changed', scheduleLoad)
    onCleanup(() => {
      cancelled = true
      window.removeEventListener('mailflare:messages-changed', scheduleLoad)
      if (refreshTimer) clearTimeout(refreshTimer)
    })
  }, { immediate: true })
  onScopeDispose(() => {
    active = false
  })

  function setEditDraft(noteId: string, html: string | null) {
    editDrafts.value = html === null
      ? Object.fromEntries(Object.entries(editDrafts.value).filter(([id]) => id !== noteId))
      : { ...editDrafts.value, [noteId]: html }
  }

  const emailById = computed(() => new Map(toValue(emailsSource).map(item => [item.id, item])))

  const state: ConversationNotesState = {
    notes,
    messageId,
    loading,
    open,
    attachTo,
    focusRequest,
    draft,
    adding,
    editDrafts,
    setEditDraft,
    startNote(target) {
      attachTo.value = target ?? null
      open.value = true
      focusRequest.value += 1
    },
    email: id => emailById.value.get(id),
    async add(html) {
      adding.value = true
      try {
        const target = attachTo.value
        const note = await sendNote(`/api/messages/${target ?? messageId.value}/notes`, 'POST', { html, attachToMessage: target !== null })
        if (!active) return
        notes.value = [...notes.value, note]
        attachTo.value = null
        draft.value = ''
      }
      finally {
        if (active) adding.value = false
      }
    },
    async update(noteId, html) {
      const note = await sendNote(`/api/messages/${messageId.value}/notes/${noteId}`, 'PATCH', { html })
      if (!active) return
      notes.value = notes.value.map(item => (item.id === noteId ? note : item))
      setEditDraft(noteId, null)
    },
    async remove(noteId) {
      const response = await authFetch(`/api/messages/${messageId.value}/notes/${noteId}`, { method: 'DELETE' })
      if (!response.ok && response.status !== 404) throw new Error('Note delete failed')
      if (!active) return
      notes.value = notes.value.filter(item => item.id !== noteId)
      setEditDraft(noteId, null)
    },
  }
  provide(KEY, state)
  return state
}

/** The open conversation's notes; null outside a conversation. */
export function useConversationNotes(): ConversationNotesState | null {
  return inject(KEY, null)
}
