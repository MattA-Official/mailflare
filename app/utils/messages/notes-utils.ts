// Helpers shared by the conversation notes components.

export const NOTE_DATE_FORMAT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }

/** Scrolls the conversation to an email, revealing it first if a collapsed thread or card hides it. */
export function scrollToNoteEmail(messageId: string) {
  window.dispatchEvent(new CustomEvent('mailflare:reveal-message', { detail: messageId }))
  document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Puts the cursor at the end of the first editable field inside `container`. */
export function focusEditableEnd(container: HTMLElement | null | undefined) {
  const field = container?.querySelector<HTMLElement>('[contenteditable=\'true\']')
  if (!field) return
  field.focus()
  const range = document.createRange()
  range.selectNodeContents(field)
  range.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}
