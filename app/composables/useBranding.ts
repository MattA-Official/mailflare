// Installation name and icon, ported from legacy/src/components/branding-provider.tsx. /api/branding is
// public, so this also works on signed-out pages.
import type { Branding } from '#lib/branding/types'

export const DEFAULT_BRANDING: Branding = { appName: 'Mailflare', hasCustomIcon: false, canCustomizeBranding: true }

const branding = ref<Branding>({ ...DEFAULT_BRANDING })
const iconVersion = ref(0)
let request: Promise<void> | null = null

async function refreshBranding(): Promise<void> {
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
  if (import.meta.client && !request) request = refreshBranding()
  return {
    branding: computed(() => branding.value),
    appName: computed(() => branding.value.appName || DEFAULT_BRANDING.appName),
    hasCustomIcon: computed(() => branding.value.hasCustomIcon),
    iconUrl: computed(() => (branding.value.hasCustomIcon ? `/api/branding/icon?v=${iconVersion.value}` : '/icon-96.png')),
    refreshBranding,
  }
}
