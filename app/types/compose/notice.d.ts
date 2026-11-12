export interface SendNoticeParts {
  /** Text before the subject, including its opening punctuation. */
  before: string
  /** Text after the subject and any countdown, including closing punctuation. */
  after: string
  /** The linked subject label and destination. */
  link?: { label: string, href: string }
  /** Renders the ticking seconds and whatever follows them. */
  ticker?: (secondsLeft: number) => string
}

export interface ComposeNoticeAction { label: string, onClick: () => void | Promise<void> }

export interface ComposeNoticePoll {
  messageId: string
  /** Called once the message is sent, failed or returned to Drafts. */
  onStatus: (status: 'sent' | 'failed' | 'cancelled') => void
}

export interface ComposeNoticeOptions {
  actions?: ComposeNoticeAction[]
  parts?: SendNoticeParts
  /** `loading` shows a spinner and stays until the next notice replaces it. */
  tone?: 'success' | 'error' | 'loading'
  durationMs?: number
  countdown?: { endAt: number }
  /** Called once when the countdown reaches zero; the callback decides what replaces the toast. */
  onCountdownEnd?: () => void
  /** Polls the message's delivery status while the toast is visible. */
  poll?: ComposeNoticePoll
}

export interface ComposeNotice {
  id: number
  message: string
  parts?: SendNoticeParts
  actions: ComposeNoticeAction[]
  tone: 'success' | 'error' | 'loading'
  durationMs: number
  countdown?: { endAt: number }
  onCountdownEnd?: () => void
  poll?: ComposeNoticePoll
}
