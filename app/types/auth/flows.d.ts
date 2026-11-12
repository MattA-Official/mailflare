// Response shapes of the sign-in, setup and onboarding endpoints, ported from
// legacy/src/app/(auth)/*/types.d.ts.

export interface LoginResult {
  token?: string
  redirect?: string
  error?: string
  code?: string
  /** Password accepted; a second factor is still needed. */
  mfaRequired?: boolean
  challengeToken?: string
  /** Factors this account can finish the challenge with. */
  methods?: string[]
  method?: string
}

export interface PasskeyOptions {
  options?: unknown
  ceremonyToken?: string
  email?: string
  error?: string
  code?: string
}

export interface SetupStatus {
  hasAdminAccount: boolean
  hasPrimaryDomain: boolean
  primaryDomain?: { hostname: string, sendingRequested: boolean } | null
  error?: string
}

export interface SetupRequirementCheck {
  key: string
  configured: boolean
  message: string
}

export interface SetupPreparationResult {
  checks?: SetupRequirementCheck[]
  migrated?: boolean
  error?: string
}

export interface DomainPreflight {
  hostname: string
  zone: { id: string, name: string }
}

export interface DomainSetupResult {
  domain?: DomainPreflight
  error?: string
}

export interface MxCheckResult {
  hasExistingMx?: boolean
  error?: string
}

export interface RegisterResult {
  redirect?: string
  error?: string
  code?: 'MX_RECORDS_CONFLICT' | 'passkey_unavailable'
}

export interface RegisterInput {
  domain: string
  enableSending?: boolean
  replaceMxRecords?: boolean
  skipDns?: boolean
  username: string
  password?: string
  usePasskey: boolean
  resetEmail: string
  turnstileToken?: string
}

export interface DomainListResult {
  domains?: { id: string, hostname: string }[]
}

export interface DomainCreateResult {
  domain?: { id: string }
  error?: string
  code?: 'MX_RECORDS_CONFLICT'
}

export interface DomainPreflightResponse {
  ok: boolean
  domain?: DomainPreflight
  error?: string
}

export interface PasskeySetupContext {
  email?: string
  name?: string
  kind?: 'setup' | 'recovery' | 'admin'
  expiresAt?: string
  error?: string
  code?: string
}

export interface PasskeySetupResult {
  ok?: boolean
  redirect?: string
  error?: string
  code?: string
}

export interface AuthShellStep {
  label: string
  active: boolean
}

/** What /setup shows: first-run registration, or the admin's first domain and mailbox. */
export type SetupMode = 'register' | 'onboarding'
