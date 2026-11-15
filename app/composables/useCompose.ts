// The floating composer's shared state and the send toasts, ported from
// legacy/src/components/compose/compose-context.tsx. One composer and one notice exist per tab; any
// page or component opens them through useCompose(). <ComposeHost /> in the dashboard layout renders both.
import type { ShallowRef } from 'vue'
import type { ComposeNotice, ComposeNoticeOptions } from '~/types/compose/notice'

export type { ComposeNotice, ComposeNoticeAction, ComposeNoticeOptions, ComposeNoticePoll } from '~/types/compose/notice'

function useComposeState() {
  return {
    open: useState('compose-open', () => false),
    draftId: useState<string | null>('compose-draft-id', () => null),
    /** Recipients the next fresh composer starts with, e.g. "Send email" from the Contacts page. */
    initialTo: useState<string[] | null>('compose-initial-to', () => null),
    // A notice carries callbacks, so it is held as it is rather than made deeply reactive.
    notice: useState('compose-notice', () => shallowRef<ComposeNotice | null>(null)) as ShallowRef<ComposeNotice | null>,
  }
}

// Browser-only: the last notice id, its timer, and the element to refocus when the composer closes.
const local = () => appScoped('compose', () => ({
  noticeId: 0,
  noticeTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  opener: null as HTMLElement | null,
}))

function rememberOpener() {
  local().opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
}

function setNotice(next: ComposeNotice | null) {
  const state = local()
  const { notice } = useComposeState()
  if (state.noticeTimer) clearTimeout(state.noticeTimer)
  state.noticeTimer = undefined
  notice.value = next
  if (!next) return
  // A countdown notice normally replaces itself when it reaches zero. The extra grace keeps that
  // transition ahead of dismissal and still clears the notice if no host is mounted.
  const timeout = Math.max(0, next.durationMs) + (next.onCountdownEnd ? 2000 : 0)
  state.noticeTimer = setTimeout(() => {
    if (notice.value?.id === next.id) notice.value = null
  }, timeout)
}

function openComposer(options?: { to?: string[] }) {
  const { open, draftId, initialTo } = useComposeState()
  rememberOpener()
  draftId.value = null
  initialTo.value = options?.to?.length ? options.to : null
  open.value = true
}

function openDraftComposer(nextDraftId: string) {
  const { open, draftId, initialTo } = useComposeState()
  if (!open.value) rememberOpener()
  draftId.value = nextDraftId
  initialTo.value = null
  open.value = true
}

function closeComposer() {
  const { open, draftId, initialTo } = useComposeState()
  const state = local()
  open.value = false
  draftId.value = null
  initialTo.value = null
  const previous = state.opener
  state.opener = null
  if (previous) requestAnimationFrame(() => { if (previous.isConnected) previous.focus() })
}

/** Shows a toast and returns its id; `actions` adds buttons, `durationMs` overrides the default 3.2s. */
function showNotice(message: string | null, options: ComposeNoticeOptions = {}): number | null {
  const id = ++local().noticeId
  setNotice(message
    ? {
        id,
        message,
        parts: options.parts,
        actions: options.actions ?? [],
        tone: options.tone ?? 'success',
        durationMs: options.durationMs ?? (options.tone === 'loading' ? 120_000 : 3200),
        countdown: options.countdown,
        onCountdownEnd: options.onCountdownEnd,
        poll: options.poll,
      }
    : null)
  return message ? id : null
}

/** Whether a notice id is still the latest one; async actions use it to avoid replacing a newer toast. */
function isCurrentNotice(id: number) {
  return local().noticeId === id
}

export function useCompose() {
  const { open, draftId, initialTo, notice } = useComposeState()
  return {
    open: readonly(open),
    draftId: readonly(draftId),
    initialTo: readonly(initialTo),
    notice: computed(() => notice.value),
    openComposer,
    openDraftComposer,
    closeComposer,
    showNotice,
    isCurrentNotice,
  }
}
