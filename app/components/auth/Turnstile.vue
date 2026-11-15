<script setup lang="ts">
// Cloudflare Turnstile, rendered only when the public site key is configured
// (runtime config `public.turnstile.siteKey`, env NUXT_PUBLIC_TURNSTILE_SITE_KEY).
// Ported from legacy/src/components/auth/turnstile.tsx. @nuxtjs/turnstile loads the script once and
// renders the widget; this wrapper keeps upstream's behaviour of clearing the token when it expires
// or fails. Call `reset()` after a failed submit.
const token = defineModel<string>({ default: '' })
const siteKey = useRuntimeConfig().public.turnstile?.siteKey as string | undefined
const widget = useTemplateRef<{ reset: () => void }>('widget')

const options = {
  'expired-callback': () => { token.value = '' },
  'error-callback': () => { token.value = '' },
}

defineExpose({
  reset() {
    widget.value?.reset()
    token.value = ''
  },
})
</script>

<template>
  <NuxtTurnstile v-if="siteKey" ref="widget" v-model="token" :site-key="siteKey" :options="options" />
</template>
