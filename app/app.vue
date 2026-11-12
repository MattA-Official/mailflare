<script setup lang="ts">
useHead({
  titleTemplate: title => (title ? `${title} · Mailflare` : 'Mailflare'),
  link: [{ rel: 'icon', href: '/api/branding/icon' }, { rel: 'apple-touch-icon', href: '/icon-192.png' }],
  meta: [{ name: 'robots', content: 'noindex, nofollow, noarchive, nosnippet, noimageindex' }],
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
