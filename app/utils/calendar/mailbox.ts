// The mailbox invitations are sent from: the one selected in the mailbox switcher (upstream's
// MailboxProvider keeps its id in localStorage), else the primary, else the first.
import type { CalendarMailbox } from '~/types/calendar'
import { SELECTED_MAILBOX_STORAGE_KEY } from './calendar'

export async function loadSelectedMailbox(): Promise<CalendarMailbox | null> {
  const data = await api<{ mailboxes?: CalendarMailbox[] }>('/api/mailboxes')
  const mailboxes = data.mailboxes ?? []
  let storedId: string | null = null
  try { storedId = localStorage.getItem(SELECTED_MAILBOX_STORAGE_KEY) } catch { /* Storage may be unavailable. */ }
  return mailboxes.find(mailbox => mailbox.id === storedId) ?? mailboxes.find(mailbox => mailbox.isPrimary) ?? mailboxes[0] ?? null
}
