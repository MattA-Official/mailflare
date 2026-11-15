// useFetch over the app's API client (session headers, 401 handling; see apiFetch in utils/auth-client).
// The Nuxt "custom useFetch" pattern: https://nuxt.com/docs/4.x/guide/recipes/custom-usefetch
import type { UseFetchOptions } from 'nuxt/app'

export function useApi<T>(url: string | Request | Ref<string | Request> | (() => string | Request), options: UseFetchOptions<T> = {}) {
  return useFetch(url, { ...options, $fetch: apiFetch() as typeof $fetch })
}
