<script setup lang="ts">
// Cloudflare Turnstile, rendered only when the public site key is configured
// (runtime config `public.turnstileSiteKey`, env NUXT_PUBLIC_TURNSTILE_SITE_KEY).
// Ported from legacy/src/components/auth/turnstile.tsx. Call `reset()` after a failed submit.
interface TurnstileApi {
  render: (container: HTMLElement, options: {
    'sitekey': string
    'callback': (token: string) => void
    'expired-callback': () => void
    'error-callback': () => void
  }) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}

const token = defineModel<string>({ default: '' })
const siteKey = useRuntimeConfig().public.turnstileSiteKey as string | undefined
const container = useTemplateRef<HTMLDivElement>('container')
let widgetId: string | undefined
let disposed = false

function turnstile() {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile
}

function loadScript(): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]')
  if (existing) {
    return existing.dataset.loaded === 'true'
      ? Promise.resolve()
      : new Promise(resolve => existing.addEventListener('load', () => resolve(), { once: true }))
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.dataset.turnstile = 'true'
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true'
      resolve()
    })
    script.addEventListener('error', () => reject(new Error('Turnstile failed to load')))
    document.head.appendChild(script)
  })
}

onMounted(async () => {
  if (!siteKey) return
  try {
    await loadScript()
  } catch {
    return
  }
  const api = turnstile()
  if (disposed || !api || !container.value || widgetId) return
  widgetId = api.render(container.value, {
    'sitekey': siteKey,
    'callback': (value) => { token.value = value },
    'expired-callback': () => { token.value = '' },
    'error-callback': () => { token.value = '' },
  })
})

onBeforeUnmount(() => {
  disposed = true
  if (widgetId) turnstile()?.remove(widgetId)
  widgetId = undefined
})

defineExpose({
  reset() {
    if (widgetId) turnstile()?.reset(widgetId)
    token.value = ''
  },
})
</script>

<template>
  <div v-if="siteKey" ref="container" />
</template>
