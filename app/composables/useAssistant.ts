// The email assistant's shared state: whether it is available to this account, and whether its panel
// is open and full size. Ported from legacy/src/app/(dashboard)/use-assistant-availability.ts,
// dashboard-state.ts and dashboard-state-utils.ts; module-level refs stand in for React state.
import { readInitialAssistantAvailability, saveAssistantAvailability } from '#lib/agent/availability-client'
import type { AssistantAvailabilityResponse } from '~/types/agent/agent'

const ASSISTANT_OPEN_KEY = 'mailflare-dashboard:assistant-open'
const ASSISTANT_FULL_SIZE_KEY = 'mailflare-dashboard:assistant-full-size'

const enabled = ref<boolean | null>(null)
const open = ref(false)
const fullSize = ref(false)
let started = false
let userPrefix: string | null = null

function readFlag(key: string): boolean | null {
  try {
    const value = localStorage.getItem(key)
    return value === null ? null : value === 'true'
  } catch {
    return null
  }
}

function save() {
  try {
    localStorage.setItem(ASSISTANT_OPEN_KEY, String(open.value))
    localStorage.setItem(ASSISTANT_FULL_SIZE_KEY, String(fullSize.value))
    if (userPrefix) {
      localStorage.setItem(`${userPrefix}:assistant-open`, String(open.value))
      localStorage.setItem(`${userPrefix}:assistant-full-size`, String(fullSize.value))
    }
  } catch { /* Storage is optional. */ }
}

// Focus and visibility checks within a minute of the last one are skipped.
const AVAILABILITY_TTL_MS = 60_000
let lastCheckedAt = 0

async function refreshAvailability(force = false) {
  if (!force && Date.now() - lastCheckedAt < AVAILABILITY_TTL_MS) return
  lastCheckedAt = Date.now()
  try {
    const response = await authFetch('/api/agent/availability', { redirectOnUnauthorized: false })
    if (!response.ok) {
      lastCheckedAt = 0
      return
    }
    const data = await response.json() as AssistantAvailabilityResponse
    enabled.value = data.enabled
    saveAssistantAvailability(data.enabled)
  } catch {
    lastCheckedAt = 0
  }
}

function start() {
  if (started || !import.meta.client) return
  started = true
  enabled.value = readInitialAssistantAvailability()
  open.value = readFlag(ASSISTANT_OPEN_KEY) ?? false
  fullSize.value = readFlag(ASSISTANT_FULL_SIZE_KEY) ?? false
  // Each account remembers its own panel state.
  void fetchSessionInfo().then((info) => {
    const id = info?.user?.id
    if (!id) return
    userPrefix = `mailflare-dashboard:${id}`
    open.value = readFlag(`${userPrefix}:assistant-open`) ?? open.value
    fullSize.value = readFlag(`${userPrefix}:assistant-full-size`) ?? fullSize.value
  })
  watch([open, fullSize], save)
  // A disabled assistant cannot stay open.
  watch(enabled, (value) => {
    if (value === false) {
      open.value = false
      fullSize.value = false
    }
  })
  void refreshAvailability(true)
  window.addEventListener('focus', () => void refreshAvailability())
  window.addEventListener(AUTH_SESSION_CHANGED_EVENT, () => void refreshAvailability(true))
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refreshAvailability()
  })
}

export function useAssistant() {
  start()
  const route = useRoute()
  // Upstream offers the assistant in the mail and calendar sections only.
  const here = computed(() => enabled.value === true && ['mail', 'calendar'].includes(route.meta.nav ?? 'mail') && route.meta.layout === 'dashboard')
  return {
    /** Available to this account and offered on the current page. */
    enabled: here,
    open,
    fullSize,
    /** Open and allowed: what the layout shows. */
    visible: computed(() => here.value && open.value),
    toggle() {
      open.value = !open.value
      fullSize.value = false
    },
    close() {
      open.value = false
      fullSize.value = false
    },
  }
}
