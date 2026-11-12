// Ported from legacy/src/app/(admin)/mailboxes/types.d.ts and [id]/types.d.ts.
export type MailboxPermission = 'read_only' | 'send_as' | 'send_on_behalf' | 'full_access'
export type MailboxStatus = 'active' | 'disabled' | 'pendingDeletion'

export interface Mailbox {
  id: string
  localPart: string
  displayName: string | null
  hasAvatar?: boolean
  domainId: string
  hostname: string
  type?: 'personal' | 'shared'
  permission?: MailboxPermission
  isPrimary?: boolean
  status?: MailboxStatus
  lastSignInAt?: string | null
}

export interface MailboxDomain { id: string, hostname: string }

export interface MailboxOwner {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
}

export interface MailboxesResponse {
  mailboxes: Mailbox[]
  canCreateShared: boolean
}

export interface MailboxDetail {
  id: string
  userId: string
  domainId: string
  localPart: string
  displayName: string | null
  useAllDomains: boolean
  hasAvatar?: boolean
  type?: 'personal' | 'shared'
  permission?: MailboxPermission | null
  canManageSharing?: boolean
  disabled?: boolean
  createdAt: string
  hostname: string
  isPrimary?: boolean
}

export interface MailboxAlias {
  id: string
  domainId: string
  localPart: string
  hostname: string
  createdAt: string
}

export interface MailboxAliasesResponse {
  aliases: MailboxAlias[]
  availableDomains: MailboxDomain[]
}

export interface SharedInboxMember {
  id: string
  userId: string
  userEmail: string
  userName: string
  permission: MailboxPermission
  createdAt: string
}

export interface SharedInboxAccessResponse {
  members: SharedInboxMember[]
  availableUsers: MailboxOwner[]
}
