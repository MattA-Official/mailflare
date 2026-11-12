<script setup lang="ts">
// Language picker and branding at the foot of the public booking pages.
const appName = ref('Mailflare')
onMounted(async () => {
  try {
    const response = await fetch('/api/branding', { cache: 'no-store' })
    if (response.ok) appName.value = ((await response.json()) as { appName?: string }).appName || 'Mailflare'
  } catch { /* The default name stays. */ }
})
</script>

<template>
  <div class="flex min-w-0 flex-wrap items-center justify-between gap-3 text-default">
    <AppLanguageSelect />
    <span class="flex min-w-0 items-center gap-2">
      <AppLogo />
      <span class="truncate font-semibold">{{ appName }}</span>
    </span>
  </div>
</template>
