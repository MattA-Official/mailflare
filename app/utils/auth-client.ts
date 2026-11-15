// Client session plumbing, ported from legacy/src/lib/auth/client.ts. The session lives in an
// HttpOnly cookie; the token is also kept in localStorage so account switching can send it as a
// Bearer header.
import { FetchError, ofetch, type $Fetch, type FetchOptions } from 'ofetch'
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

export type ApiFetchOptions = FetchOptions<'json'> & { redirectOnUnauthorized?: boolean }

let apiFetchInstance: $Fetch | null = null

/**
 * The app's `$fetch`: the session and time zone headers on every request, and a 401 clears the
 * session and goes to /login unless `redirectOnUnauthorized: false`. No automatic retries, so a
 * request runs once, as `fetch` did. `useApi()` passes it to `useFetch`.
 */
export function apiFetch(): $Fetch {
  apiFetchInstance ??= ofetch.create({
    retry: 0,
    onRequest({ options }) {
      options.headers = getAuthHeaders(options.headers)
    },
    onResponseError({ response, options }) {
      if (response.status === 401 && (options as ApiFetchOptions).redirectOnUnauthorized !== false) {
        clearClientSessionToken()
        window.location.assign('/login')
      }
    },
  })
  return apiFetchInstance
}

/** JSON helper over `apiFetch()`: sends `body` as JSON (FormData, Blob and strings as they are), returns the parsed response, throws ApiError on failure. */
export async function api<T = unknown>(url: string, options: Omit<AuthFetchOptions, 'body'> & { body?: unknown } = {}): Promise<T> {
  const { body, ...rest } = options
  try {
    const data = await apiFetch()<T>(url, { ...(rest as ApiFetchOptions), body: body as ApiFetchOptions['body'] })
    // A response without a body (204) reads as null, as before.
    return (data ?? null) as T
  } catch (error) {
    // Network failures have no response and pass through unchanged.
    if (!(error instanceof FetchError) || !error.response) throw error
    const data = error.data ?? null
    const message = (data as { error?: unknown } | null)?.error
    throw new ApiError(typeof message === 'string' ? message : `Request failed (${error.response.status})`, error.response.status, data)
  }
}

/**
 * The message to show for a failed request: the server's `{ error }` text when it sent one, otherwise
 * `fallback`. Accepts ApiError and the errors useFetch, useApi and useAsyncData return.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  const data = (error as { data?: unknown } | null)?.data
  const message = data && typeof data === 'object' ? (data as { error?: unknown }).error : undefined
  return typeof message === 'string' && message ? message : fallback
}
