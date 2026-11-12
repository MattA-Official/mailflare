// The sign-in pages show the installation's name and icon before anyone is signed in.
// /api/branding is public. Swap this for the shell's branding composable once it exists.
export interface AuthBranding {
  appName: string
  hasCustomIcon: boolean
}

const DEFAULT_BRANDING: AuthBranding = { appName: 'Mailflare', hasCustomIcon: false }
let request: Promise<AuthBranding> | null = null

export function loadAuthBranding(): Promise<AuthBranding> {
  request ??= fetch('/api/branding', { cache: 'no-store' })
    .then(response => (response.ok ? response.json() as Promise<AuthBranding> : DEFAULT_BRANDING))
    .catch(() => {
      request = null
      return DEFAULT_BRANDING
    })
  return request
}

export { DEFAULT_BRANDING }
