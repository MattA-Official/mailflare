// Fork-only. Client calls for the instance directory (server/handlers/api/directory).
import { api } from '~/utils/auth-client'

export type DirectoryPersonSummary = {
  id: string
  name: string
  email: string
  title: string | null
  department: string | null
  hasAvatar: boolean
}

export type DirectoryListPerson = DirectoryPersonSummary & { addresses: string[], groupIds: string[] }
export type DirectoryListGroup = { id: string, name: string, description: string | null, memberCount: number }
export type DirectoryInbox = { id: string, name: string, address: string, managers: { id: string, name: string }[] }

export type DirectoryListResponse = {
  people: DirectoryListPerson[]
  groups: DirectoryListGroup[]
  inboxes: DirectoryInbox[]
  departments: string[]
  profilesAvailable: boolean
  isAdmin: boolean
}

export type DirectoryPerson = DirectoryPersonSummary & {
  addresses: string[]
  phone: string | null
  location: string | null
  pronouns: string | null
  about: string | null
  timeZone: string | null
  bookingUrl: string | null
  groups: { id: string, name: string, role: 'member' | 'manager' }[]
  /** Their manager first, then up to the top. */
  reportsTo: DirectoryPersonSummary[]
  directReports: DirectoryPersonSummary[]
}

export type DirectoryPersonResponse = {
  person: DirectoryPerson
  isMe: boolean
  profilesAvailable: boolean
  canEdit: boolean
  canEditOrg: boolean
  isAdmin: boolean
  /** Only when canEdit: the stored fields and who could be their manager. */
  profile?: ProfileFields
  managerOptions?: ManagerOption[]
}

export type ManagerOption = { id: string, name: string, email: string }

export type DirectoryGroupLink = { id: string, name: string, memberCount: number }

export type DirectoryGroup = {
  id: string
  name: string
  description: string | null
  members: (DirectoryPersonSummary & { role: 'member' | 'manager' })[]
  parents: DirectoryGroupLink[]
  subgroups: DirectoryGroupLink[]
  inboxes: { id: string, name: string, address: string }[]
}

export type ProfileFields = {
  title: string | null
  department: string | null
  phone: string | null
  location: string | null
  pronouns: string | null
  about: string | null
  reportsToUserId: string | null
  hidden: boolean
}

export type MyProfileResponse = {
  profile: ProfileFields
  available: boolean
  canEditOrg: boolean
  managerOptions: ManagerOption[]
}

export type OrgChartPerson = DirectoryPersonSummary & { managerId: string | null }
export type OrgChartGroup = { id: string, name: string, description: string | null, parentIds: string[], memberIds: string[], managerIds: string[] }
export type OrgChartResponse = {
  rootId: string | null
  people: OrgChartPerson[]
  groups: OrgChartGroup[]
  profilesAvailable: boolean
  canReassign: boolean
}

export type DirectorySettings = { selfEditOrg: boolean, orgRootUserId: string | null }

export function fetchDirectory(query = '') {
  return api<DirectoryListResponse>(`/api/directory${query ? `?q=${encodeURIComponent(query)}` : ''}`)
}

export function fetchDirectoryPerson(id: string) {
  return api<DirectoryPersonResponse>(`/api/directory/people/${encodeURIComponent(id)}`)
}

export function updateDirectoryPerson(id: string, fields: Partial<ProfileFields>) {
  return api<{ ok: true }>(`/api/directory/people/${encodeURIComponent(id)}`, { method: 'PATCH', body: fields })
}

export function fetchDirectoryGroup(id: string) {
  return api<{ group: DirectoryGroup }>(`/api/directory/groups/${encodeURIComponent(id)}`)
}

export function fetchMyProfile() {
  return api<MyProfileResponse>('/api/directory/profile')
}

export function updateMyProfile(fields: Partial<ProfileFields>) {
  return api<{ ok: true }>('/api/directory/profile', { method: 'PATCH', body: fields })
}

export function fetchOrgChart() {
  return api<OrgChartResponse>('/api/directory/org-chart')
}

export function fetchDirectorySettings() {
  return api<{ settings: DirectorySettings, available: boolean, canManage: boolean }>('/api/directory/settings')
}

export function updateDirectorySettings(settings: Partial<DirectorySettings>) {
  return api<{ ok: true }>('/api/directory/settings', { method: 'PATCH', body: settings })
}

export function directoryAvatarUrl(id: string) {
  return `/api/directory/people/${encodeURIComponent(id)}/avatar`
}

/** The person's current local time in their own zone, or null without one. */
export function localTimeIn(timeZone: string | null, now = new Date()): string | null {
  if (!timeZone) return null
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone }).format(now)
  } catch {
    return null
  }
}

/** One line under a person's name: title and department, whichever are set. */
export function personSubtitle(person: Pick<DirectoryPersonSummary, 'title' | 'department'>): string | undefined {
  return [person.title, person.department].filter(Boolean).join(' · ') || undefined
}
