// Client session plumbing, ported from legacy/src/lib/auth/client.ts. The session lives in an
// HttpOnly cookie; the token is also kept in localStorage so account switching can send it as a
// Bearer header.
import { getUserTimeZone } from '#lib/time/utils'

export interface AuthFetchOptions extends RequestInit {
  redirectOnUnauthorized?: boolean
}
export interface AuthSessionChangedDetail { authenticated: boolean }
export interface AuthSessionResponse {
  ok?: boolean
  token?: string
  redirect?: string
  error?: string
  code?: string
  mfaRequired?: boolean
  challengeToken?: string
  [key: string]: unknown
}

const SESSION_STORAGE_KEY = 'mailflare-session-token'
const TIME_ZONE_STORAGE_KEY = 'mailflare-user-time-zone'
export const AUTH_SESSION_CHANGED_EVENT = 'mailflare:auth-session-changed'

function dispatchAuthSessionChanged(authenticated: boolean) {
  window.dispatchEvent(new CustomEvent<AuthSessionChangedDetail>(AUTH_SESSION_CHANGED_EVENT, { detail: { authenticated } }))
}

export function getClientSessionToken(): string | null {
  return localStorage.getItem(SESSION_STORAGE_KEY)
}

export function setClientSessionToken(token: string) {
  const previous = localStorage.getItem(SESSION_STORAGE_KEY)
  localStorage.setItem(SESSION_STORAGE_KEY, token)
  if (previous !== token) {
    localStorage.removeItem(TIME_ZONE_STORAGE_KEY)
    dispatchAuthSessionChanged(true)
  }
}

export function clearClientSessionToken() {
  localStorage.removeItem(SESSION_STORAGE_KEY)
  localStorage.removeItem(TIME_ZONE_STORAGE_KEY)
  dispatchAuthSessionChanged(false)
}

export function getAuthHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers)
  if (!next.has('X-Time-Zone')) next.set('X-Time-Zone', getUserTimeZone())
  const token = getClientSessionToken()
  if (token && !next.has('Authorization')) next.set('Authorization', `Bearer ${token}`)
  return next
}

/** fetch with the session attached. A 401 clears the session and sends the browser to /login. */
export async function authFetch(input: RequestInfo | URL, init: AuthFetchOptions = {}): Promise<Response> {
  const { redirectOnUnauthorized = true, headers, ...requestInit } = init
  const response = await fetch(input, { ...requestInit, headers: getAuthHeaders(headers) })
  if (response.status === 401 && redirectOnUnauthorized) {
    clearClientSessionToken()
    window.location.assign('/login')
  }
  return response
}

export async function persistAuthSession(response: Response): Promise<AuthSessionResponse> {
  const data = (await response.json()) as AuthSessionResponse
  if (response.ok && data.token) setClientSessionToken(data.token)
  return data
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly data: unknown) {
    super(message)
  }
}

/** JSON helper over authFetch: sends `body` as JSON, returns the parsed response, throws ApiError on failure. */
export async function api<T = unknown>(url: string, options: Omit<AuthFetchOptions, 'body'> & { body?: unknown } = {}): Promise<T> {
  const { body, headers, ...rest } = options
  const init: AuthFetchOptions = { ...rest, headers: new Headers(headers) }
  if (body instanceof FormData || body instanceof Blob || typeof body === 'string') {
    init.body = body
  } else if (body !== undefined) {
    ;(init.headers as Headers).set('Content-Type', 'application/json')
    init.body = JSON.stringify(body)
  }
  const response = await authFetch(url, init)
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const error = (data as { error?: unknown } | null)?.error
    throw new ApiError(typeof error === 'string' ? error : `Request failed (${response.status})`, response.status, data)
  }
  return data as T
}
