// Fork-only: every shared inbox on the instance, for admins who manage shared inboxes
// (server/handlers/api/shared-inboxes).
export type SharedInboxListItem = {
  id: string
  address: string
  displayName: string | null
  createdAt: string
  deleted: boolean
  disabled: boolean
  purgeAt: string | null
  peopleCount: number
  groupCount: number
  managers: { id: string, name: string }[]
}

export function fetchSharedInboxes() {
  return api<{ inboxes: SharedInboxListItem[] }>('/api/shared-inboxes')
}

export async function restoreSharedInbox(id: string) {
  await api(`/api/shared-inboxes/${encodeURIComponent(id)}/restore`, { method: 'POST' })
}
