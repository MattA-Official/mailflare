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
  managed: boolean
  /** Set when the inbox reaches this group through a group above it. */
  inheritedFrom: { id: string, name: string } | null
}

export type GroupLink = { id: string, name: string, memberCount: number }

export type GroupDetail = {
  id: string
  name: string
  description: string | null
  /** Fork-only (nested groups): the groups this one sits inside, the groups inside it, and the groups that could be. */
  parents: GroupLink[]
  subgroups: GroupLink[]
  subgroupOptions: GroupLink[]
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
  /** Fork-only: groups that manage the inbox (always with full access). */
  managerGroupIds: string[]
}

export function fetchGroups() {
  return api<{ groups: GroupSummary[], canManage: boolean }>('/api/groups')
}

export function createGroup(input: { name: string, description?: string | null }) {
  return api<{ group: { id: string, name: string } }>('/api/groups', { method: 'POST', body: input })
}

export type GroupResponse = {
  group: GroupDetail
  /** Rename, delete and choose managers. */
  canManage: boolean
  /** Add and remove ordinary members. */
  canManageMembers: boolean
  myRole: GroupMember['role'] | null
}

export type MyGroup = { id: string, name: string, description: string | null, role: GroupMember['role'], memberCount: number, mailboxCount: number }

export type AccessRoute = { kind: 'owner' | 'direct' | 'group', permission: MailboxPermission, groupId?: string, groupName?: string, managesInbox?: boolean, memberGroupId?: string, memberGroupName?: string }
export type AccessSummaryPerson = { userId: string, name: string, email: string, disabled: boolean, permission: MailboxPermission, routes: AccessRoute[] }

export function fetchGroup(id: string) {
  return api<GroupResponse>(`/api/groups/${encodeURIComponent(id)}`)
}

export function fetchMyGroups() {
  return api<{ groups: MyGroup[] }>('/api/groups/mine')
}

export function fetchGroupCandidates(id: string) {
  return api<{ candidates: { id: string, name: string, email: string }[] }>(`/api/groups/${encodeURIComponent(id)}/members`)
}

export async function setGroupMemberRole(id: string, userId: string, role: GroupMember['role']) {
  await api(`/api/groups/${encodeURIComponent(id)}/members`, { method: 'PATCH', body: { userId, role } })
}

export function fetchMailboxAccessSummary(mailboxId: string) {
  return api<{ people: AccessSummaryPerson[] }>(`/api/mailboxes/${mailboxId}/access-summary`)
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

/** Makes a group a manager of a shared inbox (server/handlers/api/mailboxes/[id]/managers). */
export async function addMailboxManager(mailboxId: string, groupId: string) {
  await api(`/api/mailboxes/${mailboxId}/managers`, { method: 'POST', body: { groupId } })
}

export async function removeMailboxManager(mailboxId: string, groupId: string) {
  await api(`/api/mailboxes/${mailboxId}/managers?groupId=${encodeURIComponent(groupId)}`, { method: 'DELETE' })
}

/** Fork-only (nested groups): put a group inside another, or take it out. */
export async function addSubgroup(id: string, groupId: string) {
  await api(`/api/groups/${encodeURIComponent(id)}/subgroups`, { method: 'POST', body: { groupId } })
}

export async function removeSubgroup(id: string, groupId: string) {
  await api(`/api/groups/${encodeURIComponent(id)}/subgroups?groupId=${encodeURIComponent(groupId)}`, { method: 'DELETE' })
}

export function getGroupMailboxAddress(mailbox: Pick<GroupMailbox, 'localPart' | 'hostname'>) {
  return `${mailbox.localPart}@${mailbox.hostname}`
}
