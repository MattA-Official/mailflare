// Route guard, ported from legacy/src/components/auth/auth-guard.tsx. Pages opt in through
// definePageMeta({ auth: { ... } }); the default is a signed-in user.
export interface AuthMeta {
  /** 'public' pages need no session; 'guest' pages (login, register) send signed-in users to the inbox. */
  mode?: 'protected' | 'public' | 'guest'
  role?: 'admin'
  primary?: boolean
  feature?: 'calendar' | 'drive'
  /** Send an admin who has no domain yet to /setup. */
  requireMailbox?: boolean
}

declare module '#app' {
  interface PageMeta {
    auth?: AuthMeta
    /** Which sidebar the dashboard layout shows. */
    nav?: 'mail' | 'admin' | 'settings' | 'calendar' | 'drive'
  }
}

export default defineNuxtRouteMiddleware(async (to) => {
  const meta: AuthMeta = to.meta.auth ?? {}
  const mode = meta.mode ?? 'protected'
  if (mode === 'public') return

  const cachedInfo = mode === 'protected' ? peekSessionInfo() : null
  const info = cachedInfo && cachedInfo.isSetup !== false && cachedInfo.hasMailboxes !== false
    ? cachedInfo
    : await fetchSessionInfo({ fresh: true })
  // A network failure must not lock the user out of an already loaded app.
  if (!info) return

  if (info.status !== 200) {
    if (mode === 'protected' && info.status === 401) return navigateTo('/login', { replace: true })
    return
  }
  if (mode === 'guest') return navigateTo('/inbox', { replace: true })

  const user = info.user
  if (meta.requireMailbox && info.hasMailboxes === false && user?.role === 'admin' && info.isSetup === false && to.path !== '/setup') {
    return navigateTo('/setup', { replace: true })
  }
  if (to.path === '/setup' && info.isSetup === true) return navigateTo('/inbox', { replace: true })
  if (meta.role && user?.role !== meta.role) return navigateTo('/inbox', { replace: true })
  if (meta.primary && !user?.isPrimaryAdmin) return navigateTo('/admin', { replace: true })
  if ((meta.feature === 'calendar' && user?.calendarEnabled === false) || (meta.feature === 'drive' && user?.driveEnabled === false)) {
    return navigateTo('/inbox', { replace: true })
  }
})
