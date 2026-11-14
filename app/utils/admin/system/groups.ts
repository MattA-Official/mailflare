// Fork-only. Client calls for groups of accounts (server/handlers/api/groups) and for sharing a shared
// inbox with a group (server/handlers/api/mailboxes/[id]/group-access).
import { api } from '~/utils/auth-client'

export type MailboxPermission = 'read_only' | 'send_as' | 'send_on_behalf' | 'full_access'

export type GroupSummary = {
  id: string
  name: string
  description: string | null
  createdAt: string
  memberCount: number
  mailboxCount: number
}

export type GroupMember = {
  userId: string
  name: string
  email: string
  role: 'member' | 'manager'
  disabled: boolean
  addedAt: string
}

export type GroupMailbox = {
  id: string
  localPart: string
  hostname: string
  displayName: string | null
  permission: MailboxPermission
}

export type GroupDetail = {
  id: string
  name: string
  description: string | null
  createdAt: string
  members: GroupMember[]
  mailboxes: GroupMailbox[]
}

export type MailboxGroupGrant = {
  id: string
  groupId: string
  groupName: string
  permission: MailboxPermission
  memberCount: number
  createdAt: string
}

export type MailboxGroupAccessResponse = {
  groups: MailboxGroupGrant[]
  availableGroups: { id: string, name: string, memberCount: number }[]
}

export function fetchGroups() {
  return api<{ groups: GroupSummary[], canManage: boolean }>('/api/groups')
}

export function createGroup(input: { name: string, description?: string | null }) {
  return api<{ group: { id: string, name: string } }>('/api/groups', { method: 'POST', body: input })
}

export function fetchGroup(id: string) {
  return api<{ group: GroupDetail, canManage: boolean }>(`/api/groups/${encodeURIComponent(id)}`)
}

export function updateGroup(id: string, input: { name: string, description?: string | null }) {
  return api<{ group: GroupDetail }>(`/api/groups/${encodeURIComponent(id)}`, { method: 'PATCH', body: input })
}

export async function deleteGroup(id: string) {
  await api(`/api/groups/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function addGroupMember(id: string, userId: string) {
  await api(`/api/groups/${encodeURIComponent(id)}/members`, { method: 'POST', body: { userId } })
}

export async function removeGroupMember(id: string, userId: string) {
  await api(`/api/groups/${encodeURIComponent(id)}/members?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

export function fetchMailboxGroupAccess(mailboxId: string) {
  return api<MailboxGroupAccessResponse>(`/api/mailboxes/${mailboxId}/group-access`)
}

/** Groups get full access, like people added on the same card (upstream's card always grants full access). */
export async function grantMailboxGroupAccess(mailboxId: string, groupId: string, permission: MailboxPermission = 'full_access') {
  await api(`/api/mailboxes/${mailboxId}/group-access`, { method: 'POST', body: { groupId, permission } })
}

export async function revokeMailboxGroupAccess(mailboxId: string, groupId: string) {
  await api(`/api/mailboxes/${mailboxId}/group-access?groupId=${encodeURIComponent(groupId)}`, { method: 'DELETE' })
}

export function getGroupMailboxAddress(mailbox: Pick<GroupMailbox, 'localPart' | 'hostname'>) {
  return `${mailbox.localPart}@${mailbox.hostname}`
}
