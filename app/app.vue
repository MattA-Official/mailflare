<script setup lang="ts">
const { appName, iconUrl } = useBranding()
const { locale, dir } = useLanguage()

useHead({
  // The language plugin sets these before the first render; keeping them in the head stops Unhead
  // putting back the static default from nuxt.config.
  htmlAttrs: { lang: locale, dir },
  titleTemplate: title => (title ? `${title} - ${appName.value}` : appName.value),
  link: [{ rel: 'icon', href: () => iconUrl.value }, { rel: 'apple-touch-icon', href: '/icon-192.png' }, { rel: 'manifest', href: '/manifest.webmanifest' }],
  meta: [
    { name: 'robots', content: 'noindex, nofollow, noarchive, nosnippet, noimageindex' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-title', content: () => appName.value },
  ],
})
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />
    <!-- Reads each new page title to screen readers after a client-side navigation. -->
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <AppConfirmDialogHost />
  </UApp>
</template>
