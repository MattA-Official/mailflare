// Requests behind the sign-in, password reset, first-run setup and onboarding pages, ported from
// legacy/src/app/(auth)/*/utils.ts. Request and response shapes are upstream's.
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import type {
  DomainCreateResult,
  DomainListResult,
  DomainPreflightResponse,
  DomainSetupResult,
  LoginResult,
  MxCheckResult,
  PasskeyOptions,
  PasskeySetupContext,
  PasskeySetupResult,
  RegisterInput,
  RegisterResult,
  SetupPreparationResult,
  SetupStatus,
} from '~/types/auth/flows'

type Result<T> = { ok: boolean, data: T }
type AuthenticationOptions = Parameters<typeof startAuthentication>[0]['optionsJSON']
type RegistrationOptions = Parameters<typeof startRegistration>[0]['optionsJSON']

function postJson(url: string, body?: unknown, timeout = 20_000) {
  return fetch(url, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  })
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T
}

async function session(response: Response): Promise<Result<LoginResult>> {
  return { ok: response.ok, data: (await persistAuthSession(response)) as LoginResult }
}

// Sign-in

export async function submitLogin(input: { email: string, password: string, turnstileToken?: string }) {
  return session(await postJson('/api/auth/login', input))
}

/** Second step: the challenge from the password step plus a TOTP or recovery code. */
export async function submitMfaCode(challengeToken: string, code: string) {
  return session(await postJson('/api/auth/mfa/verify', { challengeToken, code }))
}

export async function requestPasskeyLoginOptions(): Promise<PasskeyOptions> {
  return readJson(await postJson('/api/auth/passkey/options'))
}

export async function finishPasskeyLogin(options: PasskeyOptions, response: unknown) {
  return session(await postJson('/api/auth/passkey/verify', { ceremonyToken: options.ceremonyToken, response }))
}

/** Discoverable passkey sign-in: no email or password prompt. */
export async function submitPasskeyLogin(): Promise<Result<LoginResult>> {
  const options = await requestPasskeyLoginOptions()
  if (!options.options || !options.ceremonyToken) return { ok: false, data: { error: options.error, code: options.code } }
  const response = await startAuthentication({ optionsJSON: options.options as AuthenticationOptions })
  return finishPasskeyLogin(options, response)
}

/** Offers saved passkeys in the email field's autofill. Never opens a modal on its own. */
export async function startPasskeyAutofill(options: PasskeyOptions) {
  return startAuthentication({ optionsJSON: options.options as AuthenticationOptions, useBrowserAutofill: true })
}

/** The passkey alternative on the second-factor screen. */
export async function submitPasskeyMfa(challengeToken: string): Promise<Result<LoginResult>> {
  const options = await readJson<PasskeyOptions>(await postJson('/api/auth/passkey/mfa/options', { challengeToken }))
  if (!options.options || !options.ceremonyToken) return { ok: false, data: { error: options.error, code: options.code } }
  const response = await startAuthentication({ optionsJSON: options.options as AuthenticationOptions })
  return session(await postJson('/api/auth/passkey/mfa/verify', { challengeToken, ceremonyToken: options.ceremonyToken, response }))
}

// Password reset

export async function requestPasswordReset(email: string, turnstileToken?: string): Promise<{ ok: boolean, error?: string }> {
  const response = await postJson('/api/auth/password-reset/request', { email, turnstileToken })
  const data = await readJson<{ error?: unknown }>(response)
  return { ok: response.ok, error: typeof data.error === 'string' ? data.error : undefined }
}

export async function confirmPasswordReset(token: string, password: string): Promise<{ ok: boolean, error?: string }> {
  const response = await postJson('/api/auth/password-reset/confirm', { token, password })
  const data = await readJson<{ error?: unknown }>(response)
  return { ok: response.ok, error: typeof data.error === 'string' ? data.error : undefined }
}

// First-run setup

export async function prepareSetup(): Promise<Result<SetupPreparationResult>> {
  const response = await fetch('/api/setup/prepare', { method: 'POST' })
  return { ok: response.ok, data: await readJson(response) }
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const response = await fetch('/api/setup/status', { cache: 'no-store' })
  const data = await readJson<SetupStatus>(response)
  if (!response.ok) throw new Error(data.error ?? 'Could not load setup status')
  return data
}

export async function submitPrimaryDomain(hostname: string, skipDns = false): Promise<Result<DomainSetupResult>> {
  const response = await postJson('/api/setup/domain', skipDns ? { hostname, skipDns: true } : { hostname }, 60_000)
  return { ok: response.ok, data: await readJson(response) }
}

export async function checkExistingMx(hostname: string): Promise<Result<MxCheckResult>> {
  const response = await postJson('/api/setup/domain/mx', { hostname }, 60_000)
  return { ok: response.ok, data: await readJson(response) }
}

export async function submitRegistration(input: RegisterInput): Promise<Result<RegisterResult>> {
  const response = await postJson('/api/auth/register', {
    ...input,
    password: input.usePasskey ? undefined : input.password,
  }, 120_000)
  const data = await readJson<RegisterResult>(response)
  if (response.ok) clearClientSessionToken()
  return { ok: response.ok, data }
}

// Passkey setup links (first run, recovery and admin-issued)

export async function loadPasskeySetupContext(token: string): Promise<Result<PasskeySetupContext>> {
  const response = await fetch(`/api/auth/passkey/setup/context?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15_000) })
  return { ok: response.ok, data: await readJson(response) }
}

export async function startPasskeySetup(token: string): Promise<PasskeyOptions> {
  return readJson(await postJson('/api/auth/passkey/setup/options', { token }))
}

export async function createPasskeyCredential(options: PasskeyOptions) {
  return startRegistration({ optionsJSON: options.options as RegistrationOptions })
}

export async function finishPasskeySetup(input: { token: string, ceremonyToken: string, response: unknown, name: string }): Promise<Result<PasskeySetupResult>> {
  const response = await postJson('/api/auth/passkey/setup/verify', input, 30_000)
  return { ok: response.ok, data: (await persistAuthSession(response)) as PasskeySetupResult }
}

// Onboarding: an admin who signed in before any domain exists

export async function getDomains(): Promise<DomainListResult> {
  return readJson(await authFetch('/api/domains'))
}

export async function checkDomain(hostname: string): Promise<DomainPreflightResponse> {
  const response = await authFetch('/api/domains/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostname }),
  })
  return { ok: response.ok, ...(await readJson<Omit<DomainPreflightResponse, 'ok'>>(response)) }
}

export async function createDomain(hostname: string, enableSending: boolean, replaceMxRecords = false, skipDns = false): Promise<Result<DomainCreateResult>> {
  const response = await authFetch('/api/domains', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostname, enableRouting: true, enableSending, replaceMxRecords, skipDns }),
  })
  return { ok: response.ok, data: await readJson(response) }
}

export async function createMailbox(domainId: string, localPart: string): Promise<Result<{ error?: string }>> {
  const response = await authFetch('/api/mailboxes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domainId, localPart, displayName: localPart }),
  })
  return { ok: response.ok, data: await readJson(response) }
}
