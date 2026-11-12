<script setup lang="ts">
const { appName, iconUrl } = useBranding()

useHead({
  titleTemplate: title => (title ? `${title} - ${appName.value}` : appName.value),
  link: [{ rel: 'icon', href: () => iconUrl.value }, { rel: 'apple-touch-icon', href: '/icon-192.png' }],
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
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
