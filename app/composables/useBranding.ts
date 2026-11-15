// Installation name and icon, ported from legacy/src/components/branding-provider.tsx. /api/branding is
// public, so this also works on signed-out pages.
import type { Branding } from '#lib/branding/types'

export const DEFAULT_BRANDING: Branding = { appName: 'Flytower Mail', hasCustomIcon: false, canCustomizeBranding: true }

const useBrandingState = () => useState<Branding>('branding', () => ({ ...DEFAULT_BRANDING }))
const useIconVersion = () => useState('branding-icon-version', () => 0)
const brandingRequest = () => appScoped('branding', () => ({ request: null as Promise<void> | null }))

async function refreshBranding(): Promise<void> {
  const branding = useBrandingState()
  const iconVersion = useIconVersion()
  try {
    const response = await fetch('/api/branding', { cache: 'no-store' })
    branding.value = response.ok ? (await response.json()) as Branding : { ...DEFAULT_BRANDING }
  } catch {
    // Keep what we have; the default name and icon are always valid.
  }
  iconVersion.value = Date.now()
}

/** `{ appName, hasCustomIcon, iconUrl }` as refs, plus `refreshBranding()` for the branding page. */
export function useBranding() {
  const branding = useBrandingState()
  const iconVersion = useIconVersion()
  const pending = brandingRequest()
  if (import.meta.client && !pending.request) pending.request = refreshBranding()
  return {
    branding: computed(() => branding.value),
    appName: computed(() => branding.value.appName || DEFAULT_BRANDING.appName),
    hasCustomIcon: computed(() => branding.value.hasCustomIcon),
    iconUrl: computed(() => (branding.value.hasCustomIcon ? `/api/branding/icon?v=${iconVersion.value}` : '/icon-96.png')),
    refreshBranding,
  }
}
