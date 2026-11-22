<script setup lang="ts">
const { appName, iconUrl } = useBranding()
const { locale, dir } = useLanguage()
const uiLocale = shallowRef<Awaited<ReturnType<typeof loadUiLocale>>>()
watch(locale, async (code) => {
  const next = await loadUiLocale(code).catch(() => undefined)
  if (code === locale.value) uiLocale.value = next
}, { immediate: true })

useHead({
  // The language plugin sets these before the first render; keeping them in the head stops Unhead
  // putting back the static default from nuxt.config.
  htmlAttrs: { lang: locale, dir },
  titleTemplate: title => (title ? `${title} - ${appName.value}` : appName.value),
  link: [{ rel: 'icon', href: () => iconUrl.value }, { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }, { rel: 'manifest', href: '/manifest.webmanifest' }],
  meta: [
    { name: 'robots', content: 'noindex, nofollow, noarchive, nosnippet, noimageindex' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    // viewport-fit=cover lets the shell reach the notch and home indicator; the safe-area padding keeps content clear of them.
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
    { name: 'apple-mobile-web-app-title', content: () => appName.value },
  ],
})
</script>

<template>
  <UApp :locale="uiLocale">
    <NuxtLoadingIndicator />
    <!-- Reads each new page title to screen readers after a client-side navigation. -->
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
