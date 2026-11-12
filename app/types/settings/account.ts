// Types for the account and security settings, ported from legacy/src/components/settings
// (types.d.ts, passkey-settings-types.d.ts, device-settings-types.d.ts, api-keys-settings-types.d.ts).

export interface AccountSettingsUser {
  id: string
  email: string
  name: string
  timeZone: string | null
  resetEmail: string | null
  forwardingEmail: string | null
  canForwardEmail: boolean
}

export interface ProfileFormResponse {
  user?: Omit<AccountSettingsUser, 'id' | 'email'>
  error?: unknown
}

export interface MfaEnrollment {
  secret: string
  otpauthUrl: string
  qrSvg: string
}

export interface PasskeySummary {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string | null
  backedUp: boolean
  deviceType: string
  aaguid: string | null
}

export interface SecurityStatus {
  passwordSet: boolean
  requireSecondFactor: boolean
  totpEnabled: boolean
  recoveryCodesLeft: number
  passkeys: PasskeySummary[]
  error?: unknown
}

export type PasskeyPolicyChoice = 'passkey-only' | 'password-and-passkey' | 'keep'

export interface MobileDevice {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string | null
  pushEnabled: boolean
}

export interface ManagedApiKey {
  id: string
  name: string
  prefix: string
  kind: 'legacy' | 'mcp'
  scopes: string
  mailboxIds: string[]
  mailboxScopeEnabled: boolean
  createdAt: string
  lastUsedAt: string | null
}

export type McpKeyScope = 'mcp:read' | 'mcp:draft' | 'mcp:organize' | 'mcp:request-send' | 'mcp:calendar-read' | 'mcp:calendar-write'

export interface McpAgentInstructionsProps {
  mode: 'mail' | 'admin'
  apiKey: string
}
