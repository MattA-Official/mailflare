// Fork-only. `/login?next=` returns to an app sign-in (the OIDC authorization endpoint) afterwards.
// Nothing else is accepted, so the parameter cannot send anyone off-site.
export function safeLoginNext(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('/oauth/authorize?') && !value.includes('\\') ? value : null
}
