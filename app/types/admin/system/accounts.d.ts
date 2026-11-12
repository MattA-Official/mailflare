// Ported from legacy/src/app/(admin)/accounts/types.d.ts and accounts/[id]/types.d.ts.
export interface AccountDomain {
  id: string
  hostname: string
  status?: string
}

export interface AccountAliasDraft {
  id: string
  domainId: string
  localPart: string
}

export interface Account {
  id: string
  email: string
  name: string
  resetEmail: string | null
  role: 'admin' | 'user'
  isPrimaryAdmin?: boolean
  disabled?: boolean
  hasAvatar?: boolean
  canManageMailboxes?: boolean
  canManageDomains?: boolean
  canManageUsers?: boolean
  calendarEnabled?: boolean
  driveEnabled?: boolean
  createdAt: string
  lastSignInAt?: string | null
  deletedAt?: string | null
  mailboxId?: string | null
  localPart?: string | null
  hostname?: string | null
}

export interface AccountResponse {
  accounts?: Account[]
  account?: Account
  error?: string
}

export interface ManagedAccount {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  isPrimaryAdmin: boolean
  disabled: boolean
  canManageMailboxes: boolean
  canManageDomains: boolean
  canManageUsers: boolean
  calendarEnabled: boolean
  driveEnabled: boolean
  forwardingEmail: string | null
  canForwardEmail: boolean
  hasAvatar: boolean
  /** False for a passkey-only account, which cannot be given a password here. */
  passwordSet: boolean
  /** Whether the signed-in admin may modify this account. */
  editable: boolean
  /** Whether the signed-in admin may change this account's role. */
  canChangeRole: boolean
  /** Whether the signed-in admin may hand the primary role to this account. */
  canTransferPrimary: boolean
  /** Only ever set client-side when an admin types a new password; never returned by the API. */
  newPassword?: string
}

export interface ManagedMailbox {
  id: string
  localPart: string
  displayName: string | null
  domainId: string
  hostname: string
}

export interface ManagedDomain { id: string, hostname: string }

export interface TransferCandidate {
  id: string
  email: string
  name: string
  hasAvatar: boolean
  disabled: boolean
}
