// State shared between a folder's list and its reader, provided by MessagesSplitLayout.
// Upstream kept these in React contexts: message-list-state.tsx (selection, page, unread filter, so
// they survive the list swapping between full width and the split view), message-list-visibility.tsx
// (the reader's list toggle and back link) and message-detail-navigation.tsx (newer/older).
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { MessageNavigationEntry } from '#handlers/api/messages/navigation/types'
import type { MessageFolder } from '~/types/messages'
import type { SelectedMessage } from '~/utils/messages/types'
import { getAutoAdvanceId } from '~/utils/messages/detail-navigation-utils'
import { AUTO_ADVANCE, readStoredToggle } from '~/utils/settings/mail/preferences'

export type MessageListStateControl = {
  selectedMessages: Ref<SelectedMessage[]>
  offset: Ref<number>
  unreadOnly: Ref<boolean>
}

export type MessageListVisibility = {
  visible: boolean
  toggle: () => void
  singleColumn: boolean
  backHref: string
  backLabel: string
}

export type MessageDetailNavigationContext = {
  entries: ComputedRef<MessageNavigationEntry[]>
  hrefPrefix: ComputedRef<string>
  recordUnread: (messageId: string) => void
  /** Hides a message that was moved out of this list until the window reloads. */
  dropEntry: (messageId: string) => void
  /** The split view's selection bar above the reader. */
  showBulkBar: ComputedRef<boolean>
  bulkFolder: ComputedRef<MessageFolder | undefined>
}

const listStateKey: InjectionKey<MessageListStateControl> = Symbol('message-list-state')
const visibilityKey: InjectionKey<ComputedRef<MessageListVisibility>> = Symbol('message-list-visibility')
const navigationKey: InjectionKey<MessageDetailNavigationContext> = Symbol('message-detail-navigation')

export function provideMessageListState(state: MessageListStateControl) {
  provide(listStateKey, state)
}

export function useMessageListState(): MessageListStateControl | null {
  return inject(listStateKey, null)
}

const defaultVisibility = computed<MessageListVisibility>(() => ({ visible: true, toggle: () => undefined, singleColumn: false, backHref: '/inbox', backLabel: 'Inbox' }))

export function provideMessageListVisibility(value: ComputedRef<MessageListVisibility>) {
  provide(visibilityKey, value)
}

export function useMessageListVisibility(): ComputedRef<MessageListVisibility> {
  return inject(visibilityKey, defaultVisibility)
}

export function provideMessageDetailNavigation(value: MessageDetailNavigationContext) {
  provide(navigationKey, value)
}

export function useMessageDetailNavigationContext(): MessageDetailNavigationContext | null {
  return inject(navigationKey, null)
}

/**
 * Call after `messageId` was moved out of the open list. With auto-advance on it returns the next
 * message's href (and hides the moved one from the arrows); otherwise null, so the caller falls back
 * to the list. Ported from useAutoAdvance in message-detail-navigation.tsx.
 */
export function useAutoAdvance(messageId: () => string): () => string | null {
  const context = useMessageDetailNavigationContext()
  return () => {
    if (!context || !readStoredToggle(AUTO_ADVANCE)) return null
    const id = messageId()
    const targetId = getAutoAdvanceId(context.entries.value, id)
    if (!targetId) return null
    context.dropEntry(id)
    return `${context.hrefPrefix.value}/${targetId}`
  }
}

/** Whether the assistant panel is open beside the reader. The assistant workstream owns the real state. */
export function useAssistantOpenState(): Readonly<Ref<boolean>> {
  return ref(false)
}
