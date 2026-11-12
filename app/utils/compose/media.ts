// A reactive media query, the composer's stand-in for upstream's useIsMobile (sidebar-mobile-utils.ts).
export const PHONE_QUERY = '(max-width: 767px)'

export function useMediaQuery(query: string) {
  const matches = ref(false)
  let media: MediaQueryList | null = null
  const update = () => { matches.value = media?.matches ?? false }
  onMounted(() => {
    media = window.matchMedia(query)
    update()
    media.addEventListener('change', update)
  })
  onBeforeUnmount(() => media?.removeEventListener('change', update))
  return readonly(matches)
}

export const useIsPhone = () => useMediaQuery(PHONE_QUERY)
